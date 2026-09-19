import { isAgenticAccount, refuseNonAgentic } from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

/**
 * SURF_LEARN baseline: hold $2 of NEAR (then CHIP). Not a live working entry.
 */
export const holdBank: Trick = {
  id: "hold_bank",
  whenItMayFire: "SURF_LEARN baseline only. Live book parks via park_to_near / park_to_chip.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      target: { type: "string", description: "NEAR then CHIP" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    return {
      eligible: false,
      reason: "hold_bank is the SURF_LEARN baseline, not a live working entry",
    };
  },
};
