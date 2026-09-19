import { expectancyHaltActive, gateProfile, isAgenticAccount, refuseNonAgentic } from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const expectancyHalt: Trick = {
  id: "expectancy_halt",
  whenItMayFire: "Protective no-new-working-entry after the active profile's losing working RTs.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      losingWorkingRoundTrips: { type: "number", description: "Default 5" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    const profile = gateProfile(snapshot);
    if (!expectancyHaltActive(snapshot)) {
      return {
        eligible: false,
        reason: `Losing working RTs ${snapshot.day.losingWorkingRoundTrips} < ${profile.expectancyHaltLosingWorkingRts}`,
      };
    }
    return {
      eligible: true,
      reason: `expectancy_halt: ${snapshot.day.losingWorkingRoundTrips} losing working RTs`,
    };
  },
};
