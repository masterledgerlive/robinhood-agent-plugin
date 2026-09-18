import {
  findReviewPlacePair,
  isPlaceTool,
  isReviewTool,
  laneForTool,
  type CapabilityIndex,
} from "../capabilities/matcher.js";
import { extractBrokerIds, formatMachineLog } from "../log/machine-log.js";
import { stableFingerprint } from "../log/redact.js";
import { HaltError, RiskGuard, RiskViolationError } from "../risk/guard.js";
import { assertToolAllowedInMode, PaperBlockedError } from "../mode/trading-mode.js";
import { RISK_BUCKET } from "../constants.js";
import type { MachineLogEntry, TradingMode } from "../types.js";

export type ToolCaller = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

export type ReviewReceipt = {
  toolName: string;
  fingerprint: string;
};

export class ReviewCache {
  private readonly receipts: ReviewReceipt[] = [];

  remember(toolName: string, args: Record<string, unknown>): ReviewReceipt {
    const receipt = { toolName, fingerprint: stableFingerprint(args) };
    this.receipts.push(receipt);
    return receipt;
  }

  consumeMatchingPlace(
    index: CapabilityIndex,
    placeTool: string,
    args: Record<string, unknown>,
  ): boolean {
    const lane = laneForTool(index, placeTool);
    const pair = findReviewPlacePair(index, lane);
    const wantedReview = pair?.review;
    const fingerprint = stableFingerprint(withoutRefId(args));
    const idx = this.receipts.findIndex((r) => {
      const nameOk = wantedReview ? r.toolName === wantedReview : isReviewTool(index, r.toolName);
      return nameOk && r.fingerprint === fingerprint;
    });
    if (idx === -1) return false;
    this.receipts.splice(idx, 1);
    return true;
  }
}

export type GatedCallInput = {
  client: ToolCaller;
  capabilities: CapabilityIndex;
  guard: RiskGuard;
  mode: TradingMode;
  intent: string;
  tool: string;
  args: Record<string, unknown>;
  human: string;
  reviews: ReviewCache;
  /** Required for review/place when args have no dollar_amount. */
  expectedNotionalUsd?: number;
  at?: string;
};

export type GatedCallOutput = {
  log: string;
  entry: MachineLogEntry;
  result: unknown;
  skipped: boolean;
};

export function extractNotionalUsd(
  args: Record<string, unknown>,
  expected?: number,
): number | undefined {
  const raw = args.dollar_amount ?? args.notional;
  if (typeof raw === "string" || typeof raw === "number") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  if (expected !== undefined && Number.isFinite(expected)) return expected;
  return undefined;
}

/**
 * Discover already happened. This is the money gate:
 * halt → bucket → paper vs live → review-before-place → log.
 */
export async function runGatedToolCall(input: GatedCallInput): Promise<GatedCallOutput> {
  const capabilities = input.capabilities;
  const guard: RiskGuard = input.guard;
  const mode = input.mode;
  const tool = input.tool;
  const args = input.args;
  guard.assertBucket(RISK_BUCKET);
  guard.assertNotHalted();

  const wantsMoney = isPlaceTool(capabilities, tool) || isReviewTool(capabilities, tool);
  if (wantsMoney) {
    const notional = extractNotionalUsd(args, input.expectedNotionalUsd);
    if (notional === undefined) {
      throw new RiskViolationError(
        "No USD notional on the order. Pass dollar_amount or expectedNotionalUsd. Do not guess.",
      );
    }
    guard.assertNotional(notional);
  }

  if (isPlaceTool(capabilities, tool)) {
    guard.assertLiveFunded();
    const reviewed = input.reviews.consumeMatchingPlace(capabilities, tool, args);
    if (!reviewed) {
      throw new RiskViolationError(
        `No matching review/preview for ${tool}. Review first unless the user explicitly waived it.`,
      );
    }
    try {
      assertToolAllowedInMode(mode, tool, capabilities);
    } catch (err) {
      if (err instanceof PaperBlockedError) {
        const entry = buildEntry(input, {
          ok: true,
          summary: `WOULD_PLACE blocked in paper mode (${err.message})`,
          orderId: null,
          fillId: null,
          realizedPnl: null,
        });
        return { log: formatMachineLog(entry), entry, result: { skipped: true, reason: err.message }, skipped: true };
      }
      throw err;
    }
  }

  if (isReviewTool(capabilities, tool)) {
    input.reviews.remember(tool, withoutRefId(args));
  }

  try {
    const result = await input.client.callTool(tool, args);
    const ids = extractBrokerIds(result);
    if (isPlaceTool(capabilities, tool) && ids.orderId) {
      guard.recordFill({
        orderId: ids.orderId,
        filledAt: input.at ?? new Date().toISOString(),
        source: "broker",
        ...(typeof args.symbol === "string" ? { symbol: args.symbol } : {}),
        ...(typeof args.side === "string" ? { side: args.side } : {}),
      });
    }
    const entry = buildEntry(input, {
      ok: true,
      summary: summarizeResult(result, ids.orderId),
      orderId: ids.orderId,
      fillId: ids.fillId,
      realizedPnl: ids.realizedPnl,
    });
    return { log: formatMachineLog(entry), entry, result, skipped: false };
  } catch (err) {
    if (err instanceof HaltError || err instanceof RiskViolationError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const entry = buildEntry(input, {
      ok: false,
      summary: message,
      orderId: null,
      fillId: null,
      realizedPnl: null,
    });
    return { log: formatMachineLog(entry), entry, result: { error: message }, skipped: false };
  }
}

function buildEntry(
  input: GatedCallInput,
  result: MachineLogEntry["result"],
): MachineLogEntry {
  const entry: MachineLogEntry = {
    mode: input.mode,
    bucket: RISK_BUCKET,
    intent: input.intent,
    tool: input.tool,
    args: input.args,
    result,
    human: input.human,
  };
  if (input.at !== undefined) entry.at = input.at;
  return entry;
}

function withoutRefId(args: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...args };
  delete copy.ref_id;
  delete copy.refId;
  return copy;
}

function summarizeResult(result: unknown, orderId: string | null): string {
  if (orderId) return `broker returned order_id ${orderId}`;
  if (result && typeof result === "object") {
    const rec = result as Record<string, unknown>;
    if (typeof rec.summary === "string") return rec.summary;
    if (rec.isError === true) return "tool error";
  }
  return "tool returned (no order_id — not a fill)";
}
