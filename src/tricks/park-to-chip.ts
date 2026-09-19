import type { Trick } from "./types.js";
import { evaluatePark } from "./park-shared.js";

export const parkToChip: Trick = {
  id: "park_to_chip",
  whenItMayFire:
    "Cascade park of working profit into CHIP (#3 bank) when NEAR is unavailable or Game names CHIP. FIL stays display-only. Never flatten.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      target: { type: "string", description: "CHIP" },
    },
  },
  evaluate: (snapshot) => evaluatePark(snapshot, "CHIP"),
};
