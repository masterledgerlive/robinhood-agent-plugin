import {
  baseSymbol,
  isAgenticAccount,
  refuseNewWorkingEntry,
  refuseNonAgentic,
} from "../trail/gates.js";
import { peakOf } from "../trail/peak.js";
import { rankPrimedTokens } from "../trail/prime.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

/**
 * After first crash: if math shows reclaim (second_wave), enter and ride
 * toward higherPeak = prior localHigh × (1 + extension). Never places.
 */
export const secondWaveReentry: Trick = {
  id: "second_wave_reentry",
  whenItMayFire:
    "Token in second_wave (hard pullback + reclaiming). Seats/day/BP clear. Target higherPeak above prior absolute peak.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      higherPeakExtension: { type: "number", description: "Default 0.015 (1.5% above prior peak)" },
      peakHardPullback: { type: "number", description: "Default 0.02" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    const blocked = refuseNewWorkingEntry(snapshot);
    if (blocked) return { eligible: false, reason: blocked };

    const primed = rankPrimedTokens(snapshot).filter((c) => c.peak?.mode === "second_wave");
    if (primed.length === 0) {
      return {
        eligible: false,
        reason: "No second_wave reclaim on the tape (need hard pullback + reclaiming marks)",
      };
    }

    const top = primed[0]!;
    const peak = peakOf(snapshot, top.symbol);
    if (!peak || peak.mode !== "second_wave") {
      return { eligible: false, reason: "Top primed second_wave candidate lost reclaim" };
    }

    return {
      eligible: true,
      reason:
        `Second wave on ${baseSymbol(top.symbol)}: reclaim after crash; ` +
        `ride toward higherPeak ${peak.higherPeak.toFixed(6)} (prior high ${peak.localHigh.toFixed(6)}). No place.`,
      symbol: top.symbol,
    };
  },
};
