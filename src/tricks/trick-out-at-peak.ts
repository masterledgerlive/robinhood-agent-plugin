import { cascadeExitOf, topCascadeDestination } from "../trail/cascade.js";
import {
  baseSymbol,
  isAgenticAccount,
  maxTakeWithoutFlatten,
  refuseNonAgentic,
  workingSeats,
} from "../trail/gates.js";
import { peakOf } from "../trail/peak.js";
import { topPrimedToken } from "../trail/prime.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

/**
 * Peak / stale-profit / RSI leave-overbought cascade out.
 * Leave dust; rotate toward lowest promising volatile (near support).
 * Never flattens. Never places. Agents optional.
 */
export const trickOutAtPeak: Trick = {
  id: "trick_out_at_peak",
  whenItMayFire:
    "Working seat: peak stall/pullback, failed peak break, stale wave with edge, or Wilder RSI leave-overbought. Leave dust. Destination = cascade near-support volatile.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      peakArmProximity: { type: "number", description: "Default 0.985" },
      peakArmPhase: { type: "number", description: "Default 0.85" },
      peakPullbackArm: { type: "number", description: "Default 0.008" },
      peakHardPullback: { type: "number", description: "Default 0.02" },
      cascadeMicroProfitPct: { type: "number", description: "Default 0.003" },
      rsiOverbought: { type: "number", description: "Default 70" },
      rsiPeriod: { type: "number", description: "Default 14" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();

    const seats = workingSeats(snapshot).filter((s) => maxTakeWithoutFlatten(s) > 0);
    if (seats.length === 0) {
      return { eligible: false, reason: "No working seat above dust to trick out" };
    }

    const fired: Array<{ symbol: string; reason: string }> = [];
    for (const sleeve of seats) {
      const cascade = cascadeExitOf(snapshot, sleeve.symbol);
      if (cascade?.fire) {
        fired.push({ symbol: sleeve.symbol, reason: cascade.equation });
        continue;
      }
      const peak = peakOf(snapshot, sleeve.symbol);
      if (!peak) continue;
      if (peak.mode === "trick_out" || peak.mode === "crash_start") {
        fired.push({ symbol: sleeve.symbol, reason: peak.equation });
      }
    }

    if (fired.length === 0) {
      const armed = seats
        .map((s) => peakOf(snapshot, s.symbol))
        .filter((p): p is NonNullable<typeof p> => !!p && p.mode === "peak_armed");
      if (armed.length > 0) {
        return {
          eligible: false,
          reason: `Peak armed on ${armed.map((p) => baseSymbol(p.symbol)).join(", ")} — ride until stall/pullback/RSI leave-OB; not trick-out yet`,
        };
      }
      return {
        eligible: false,
        reason: "No working seat at peak/stale-profit/RSI cascade exit",
      };
    }

    const from = fired[0]!;
    const cascadeDest = topCascadeDestination(snapshot, { excludeBases: [from.symbol] });
    const dest = cascadeDest ?? topPrimedToken(snapshot, { excludeBases: [from.symbol] });
    const destText = dest
      ? ` → cascade ${baseSymbol(dest.symbol)} (score ${dest.score.toFixed(4)})`
      : " → deploy buying power when a near-support volatile destination scores > 0";

    return {
      eligible: true,
      reason: `Cascade out ${baseSymbol(from.symbol)} (peak/stale/RSI); leave dust${destText}. No place.`,
      symbol: from.symbol,
    };
  },
};
