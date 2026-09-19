import { LOW_CAP_SLOW } from "../trail/constants.js";
import { expectancyHaltActive, isAgenticAccount, refuseNonAgentic } from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const expectancyHalt: Trick = {
  id: "expectancy_halt",
  whenItMayFire: "Protective no-new-working-entry after 5 losing working round-trips.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      losingWorkingRoundTrips: { type: "number", description: "Default 5" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    if (!expectancyHaltActive(snapshot)) {
      return {
        eligible: false,
        reason: `Losing working RTs ${snapshot.day.losingWorkingRoundTrips} < ${LOW_CAP_SLOW.expectancyHaltLosingWorkingRts}`,
      };
    }
    return {
      eligible: true,
      reason: `expectancy_halt: ${snapshot.day.losingWorkingRoundTrips} losing working RTs`,
    };
  },
};
