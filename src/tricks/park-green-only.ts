import {
  baseSymbol,
  isAgenticAccount,
  refuseNonAgentic,
} from "../trail/gates.js";
import { rankGreenOnly } from "../trail/green-only.js";
import { evaluateRedDay } from "../trail/red-day.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

/**
 * RED_DAY green-only shelter: rotate into names still green vs session open
 * while the book is broad-red. Hold until bottoms; agents optional. Never places.
 */
export const parkGreenOnly: Trick = {
  id: "park_green_only",
  whenItMayFire:
    "RED_DAY active (or fired legs). At least one non-bank token still green vs session open. Prefer strongest climb. Never flatten banks.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      greenMinClimbFromOpen: { type: "number", description: "Default 0" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();

    const inbox = snapshot.whispers ?? [];
    const red = evaluateRedDay(snapshot, inbox);
    if (!red.active && !red.cleared) {
      return { eligible: false, reason: "RED_DAY not active — green-only shelter only while broad-red" };
    }
    if (red.phase === "cleared") {
      return { eligible: false, reason: "RED_DAY cleared — resume normal park/enter" };
    }
    if (red.phase === "reenter") {
      return {
        eligible: false,
        reason: "Bottoms forming — prefer trough re-entry over green shelter",
      };
    }

    const greens = rankGreenOnly(snapshot);
    if (greens.length === 0) {
      return {
        eligible: false,
        reason: "No token still green vs session open — wait bottoms (do not chase red)",
      };
    }

    const top = greens[0]!;
    return {
      eligible: true,
      reason:
        `Green-only shelter ${baseSymbol(top.symbol)} +${(top.climbFromOpen * 100).toFixed(2)}% vs open ` +
        `while RED_DAY ${red.phase}. Hold until bottoms; agents optional. No place.`,
      symbol: top.symbol,
    };
  },
};
