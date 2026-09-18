import type { MachineLogEntry } from "../types.js";
import { RISK_BUCKET } from "../constants.js";
import { redactArgs } from "./redact.js";

function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Plain-text MACHINE LOG.
 * Humans read INTENT → TOOL → ARGS → RESULT → HUMAN LINE.
 * Never invent order ids or PnL. Missing broker ids stay "none".
 */
export function formatMachineLog(entry: MachineLogEntry): string {
  const at = entry.at ?? new Date().toISOString();
  const args = redactArgs(entry.args);
  const order = entry.result.orderId ? entry.result.orderId : "none";
  const fill = entry.result.fillId ? entry.result.fillId : "none";
  const pnl = entry.result.realizedPnl
    ? entry.result.realizedPnl
    : "none (do not invent)";
  const status = entry.result.ok ? "ok" : "error";

  return [
    "=== MACHINE LOG ===",
    `TIME    ${at}`,
    `MODE    ${entry.mode}`,
    `BUCKET  ${entry.bucket ?? RISK_BUCKET}`,
    `INTENT  ${singleLine(entry.intent)}`,
    `TOOL    ${entry.tool}`,
    `ARGS    ${compactJson(args)}`,
    `RESULT  ${status} | ${singleLine(entry.result.summary)}`,
    `ORDER   ${order}`,
    `FILL    ${fill}`,
    `PNL     ${pnl}`,
    `HUMAN   ${singleLine(entry.human)}`,
    "=== END LOG ===",
  ].join("\n");
}

export function formatMachineLogBlock(entries: MachineLogEntry[]): string {
  return entries.map(formatMachineLog).join("\n\n");
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractBrokerIds(result: unknown): {
  orderId: string | null;
  fillId: string | null;
  realizedPnl: string | null;
} {
  const found = {
    orderId: null as string | null,
    fillId: null as string | null,
    realizedPnl: null as string | null,
  };
  walk(result, (key, value) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const asString = String(value);
    const k = key.toLowerCase();
    if (!found.orderId && (k === "order_id" || k === "orderid")) {
      found.orderId = asString;
    }
    if (!found.fillId && (k === "fill_id" || k === "fillid" || k === "execution_id")) {
      found.fillId = asString;
    }
    if (
      !found.realizedPnl &&
      (k === "realized_pnl" || k === "realizedpnl" || k === "realized_gain")
    ) {
      found.realizedPnl = asString;
    }
  });
  return found;
}

function walk(
  value: unknown,
  visit: (key: string, child: unknown) => void,
  depth = 0,
): void {
  if (depth > 8 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    visit(key, child);
    walk(child, visit, depth + 1);
  }
}
