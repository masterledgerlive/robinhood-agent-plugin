import type { TradingMode } from "../types.js";
import { isPlaceTool, type CapabilityIndex } from "../capabilities/matcher.js";

export class PaperBlockedError extends Error {
  readonly code = "PAPER";
  constructor(message: string) {
    super(message);
    this.name = "PaperBlockedError";
  }
}

export function resolveTradingMode(
  env: NodeJS.ProcessEnv = process.env,
): TradingMode {
  const raw = (
    env.ROBINHOOD_TRADING_MODE ??
    env.RH_TRADING_MODE ??
    "paper"
  ).toLowerCase();
  return raw === "live" ? "live" : "paper";
}

export function assertToolAllowedInMode(
  mode: TradingMode,
  toolName: string,
  index: CapabilityIndex,
): void {
  if (mode === "paper" && isPlaceTool(index, toolName)) {
    throw new PaperBlockedError(
      `Paper mode: will not call ${toolName}. Log WOULD_PLACE and use review/preview only.`,
    );
  }
}
