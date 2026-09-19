import { LOW_CAP_SLOW } from "../trail/constants.js";
import { isAgenticAccount, refuseNonAgentic, softHaltActive } from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const softHalt: Trick = {
  id: "soft_halt",
  whenItMayFire: "Protective no-new-risk when broker day realized ≤ −$1.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      softHaltRealizedUsd: { type: "number", description: "Default -1" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    if (snapshot.day.realizedPnlUsd === null) {
      return { eligible: false, reason: "Day realized unknown — will not invent PnL for soft_halt" };
    }
    if (!softHaltActive(snapshot)) {
      return {
        eligible: false,
        reason: `Day realized ${snapshot.day.realizedPnlUsd} is above ${LOW_CAP_SLOW.softHaltRealizedUsd}`,
      };
    }
    return {
      eligible: true,
      reason: `soft_halt: broker day realized ${snapshot.day.realizedPnlUsd} ≤ ${LOW_CAP_SLOW.softHaltRealizedUsd}`,
    };
  },
};
