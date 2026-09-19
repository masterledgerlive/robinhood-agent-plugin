import type { Trick } from "./types.js";
import { evaluatePark } from "./park-shared.js";

export const parkToNear: Trick = {
  id: "park_to_near",
  whenItMayFire:
    "Cascade park of working profit into NEAR (#1 bank) when profit gates clear. Never flatten.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      target: { type: "string", description: "NEAR" },
    },
  },
  evaluate: (snapshot) => evaluatePark(snapshot, "NEAR"),
};
