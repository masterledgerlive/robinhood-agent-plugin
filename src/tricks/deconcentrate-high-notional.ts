import { isAgenticAccount, isFilDisplayOnly, maxTakeWithoutFlatten, refuseNonAgentic } from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

const DEFAULT_HIGH_NOTIONAL_USD = 7;
const BOOK_FRACTION = 0.4;

export const deconcentrateHighNotional: Trick = {
  id: "deconcentrate_high_notional",
  whenItMayFire:
    "Game exit of an oversized seat down to dust + optional micro seeds. Never flatten.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      highNotionalUsd: { type: "number", description: "Default $7 (roll cap) or 40% of book" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    if (snapshot.authorize?.deconcentrate !== true) {
      return { eligible: false, reason: "Game authorize required to deconcentrate" };
    }

    const book =
      snapshot.equityUsd ??
      snapshot.sleeves.reduce((sum, s) => sum + (Number.isFinite(s.notionalUsd) ? s.notionalUsd : 0), 0);
    const threshold = Math.max(DEFAULT_HIGH_NOTIONAL_USD, book * BOOK_FRACTION);

    const oversized = snapshot.sleeves.filter((s) => {
      if (s.notionalUsd < threshold) return false;
      if (isFilDisplayOnly(s.symbol)) return false;
      return maxTakeWithoutFlatten(s) > 0;
    });

    if (oversized.length === 0) {
      return {
        eligible: false,
        reason: `No oversized MCP-tradable seat above $${threshold.toFixed(2)} that can leave dust`,
      };
    }

    const symbol = oversized[0]?.symbol;
    return {
      eligible: true,
      reason: `Game deconcentrate ${oversized.map((s) => s.symbol).join(", ")} → dust + micro seeds`,
      ...(symbol !== undefined ? { symbol } : {}),
    };
  },
};
