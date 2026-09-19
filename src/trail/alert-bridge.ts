/**
 * Math → Robinhood create_alert bridge (agentless).
 *
 * Pure trigger specs from armTokenTriggers / cascade jump-out % marks.
 * Syncs brokerAlerts via MCP create_alert so Robinhood can notify/act
 * when price hits the percentage threshold — no Cursor LLM required.
 *
 * Never invents marks. Never places orders (alerts only).
 * Places stay on review-before-place / gated workflow.
 */

import type { ToolCaller } from "../session/workflow.js";
import type { TokenTrigger, TokenTriggerPlan, TriggerBrokerAlertSpec } from "./types.js";

export type AlertSyncResult = {
  attempted: number;
  created: number;
  skipped: number;
  errors: string[];
  specs: TriggerBrokerAlertSpec[];
};

export type AlertBridgePort = {
  /** List existing alerts (optional — used to skip duplicates). */
  listAlerts?: (symbol?: string) => Promise<Array<{ symbol?: string; condition_type?: string; threshold?: string }>>;
  createAlert: (spec: TriggerBrokerAlertSpec) => Promise<unknown>;
};

/** Collect unique broker alert specs from a trigger plan (armed + fired working seats). */
export function collectBrokerAlertSpecs(plan: TokenTriggerPlan): TriggerBrokerAlertSpec[] {
  const seen = new Set<string>();
  const out: TriggerBrokerAlertSpec[] = [];
  for (const token of plan.tokens) {
    if (token.role !== "working" && token.state === "waiting") continue;
    for (const spec of token.brokerAlerts) {
      const key = `${spec.symbol}|${spec.condition_type}|${spec.threshold}|${spec.purpose}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(spec);
    }
  }
  return out;
}

/** Prefer cascade_jump_out + take_profit + stop — the % hit path for RH. */
export function prioritizeCascadeAlerts(specs: TriggerBrokerAlertSpec[]): TriggerBrokerAlertSpec[] {
  const rank = (p: TriggerBrokerAlertSpec["purpose"]): number => {
    if (p === "cascade_jump_out") return 0;
    if (p === "take_profit") return 1;
    if (p === "stop") return 2;
    if (p === "peak_pullback") return 3;
    if (p === "support") return 4;
    return 5;
  };
  return [...specs].sort((a, b) => rank(a.purpose) - rank(b.purpose));
}

/**
 * Sync math trigger alerts to Robinhood create_alert.
 * Idempotent when listAlerts is available (skips same symbol/condition/threshold).
 */
export async function syncMathAlertsToBroker(
  plan: TokenTriggerPlan,
  bridge: AlertBridgePort,
  opts?: { limit?: number },
): Promise<AlertSyncResult> {
  const limit = opts?.limit ?? 64;
  const specs = prioritizeCascadeAlerts(collectBrokerAlertSpecs(plan)).slice(0, limit);
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  let existing: Array<{ symbol?: string; condition_type?: string; threshold?: string }> = [];
  if (bridge.listAlerts) {
    try {
      existing = await bridge.listAlerts();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const existingKeys = new Set(
    existing.map(
      (a) =>
        `${String(a.symbol ?? "").replace(/-USD$/i, "").toUpperCase()}|${a.condition_type ?? ""}|${a.threshold ?? ""}`,
    ),
  );

  for (const spec of specs) {
    const key = `${spec.symbol.toUpperCase()}|${spec.condition_type}|${spec.threshold}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      await bridge.createAlert(spec);
      created += 1;
      existingKeys.add(key);
    } catch (err) {
      errors.push(
        `${spec.purpose} ${spec.symbol} ${spec.condition_type}@${spec.threshold}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return {
    attempted: specs.length,
    created,
    skipped,
    errors,
    specs,
  };
}

/** MCP ToolCaller adapter — call create_alert / get_alerts by discovered names. */
export function mcpAlertBridge(
  client: ToolCaller,
  toolNames?: { createAlert?: string; getAlerts?: string },
): AlertBridgePort {
  const createName = toolNames?.createAlert ?? "create_alert";
  const listName = toolNames?.getAlerts ?? "get_alerts";
  return {
    async listAlerts(symbol?: string) {
      const args: Record<string, unknown> = {};
      if (symbol) args.symbol = symbol;
      const raw = await client.callTool(listName, args);
      return normalizeAlertList(raw);
    },
    async createAlert(spec: TriggerBrokerAlertSpec) {
      return client.callTool(createName, {
        symbol: spec.symbol,
        asset_class: spec.asset_class,
        condition_type: spec.condition_type,
        threshold: spec.threshold,
      });
    },
  };
}

function normalizeAlertList(raw: unknown): Array<{
  symbol?: string;
  condition_type?: string;
  threshold?: string;
}> {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const list = Array.isArray(rec.alerts)
    ? rec.alerts
    : Array.isArray(rec.results)
      ? rec.results
      : Array.isArray(raw)
        ? raw
        : [];
  return list.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((a) => ({
    ...(typeof a.symbol === "string" ? { symbol: a.symbol } : {}),
    ...(typeof a.condition_type === "string" ? { condition_type: a.condition_type } : {}),
    ...(typeof a.threshold === "string" || typeof a.threshold === "number"
      ? { threshold: String(a.threshold) }
      : {}),
  }));
}

/** Fired working cascade triggers — for batch rotate listing. */
export function firedCascadeTriggers(tokens: TokenTrigger[]): TokenTrigger[] {
  return tokens.filter(
    (t) =>
      t.role === "working" &&
      t.state === "fired" &&
      (t.where === "trick_out_at_peak" || t.where === "park_to_near" || t.where === "exit_to_dust"),
  );
}
