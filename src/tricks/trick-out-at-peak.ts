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
 * Uphill ride → trick out at absolute local peak (or first-crash pullback),
 * leave dust, rotate toward the top primed token. Never flattens. Never places.
 */
export const trickOutAtPeak: Trick = {
  id: "trick_out_at_peak",
  whenItMayFire:
    "Working seat peakProximity/phase arms and stall or pullback fires (or hard first-crash pullback). Leave dust. Destination = top primed token by wave+climb math.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      peakArmProximity: { type: "number", description: "Default 0.985" },
      peakArmPhase: { type: "number", description: "Default 0.85" },
      peakPullbackArm: { type: "number", description: "Default 0.008" },
      peakHardPullback: { type: "number", description: "Default 0.02" },
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
          reason: `Peak armed on ${armed.map((p) => baseSymbol(p.symbol)).join(", ")} — ride until stall/pullback; not trick-out yet`,
        };
      }
      return {
        eligible: false,
        reason: "No working seat at peak trick-out or first-crash pullback",
      };
    }

    const from = fired[0]!;
    const dest = topPrimedToken(snapshot, { excludeBases: [from.symbol] });
    const destText = dest
      ? ` → prime ${baseSymbol(dest.symbol)} (score ${dest.score.toFixed(4)})`
      : " → hold cash/banks until a primed destination scores > 0";

    return {
      eligible: true,
      reason: `Trick out ${baseSymbol(from.symbol)} at peak/first-crash; leave dust${destText}. No place.`,
      symbol: from.symbol,
    };
  },
};
