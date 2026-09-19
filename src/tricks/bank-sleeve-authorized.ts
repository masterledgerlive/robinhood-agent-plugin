import {
  bankSleeves,
  isAgenticAccount,
  isFilDisplayOnly,
  maxTakeWithoutFlatten,
  refuseNonAgentic,
  wouldFlatten,
} from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const bankSleeveAuthorized: Trick = {
  id: "bank_sleeve_authorized",
  whenItMayFire:
    "Game-only bank haircut above dust floor (NEAR → FIL display-only → CHIP). Never flatten.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sleeveUsd: { type: "number", description: "Optional Game-named haircut" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    if (snapshot.authorize?.bankSleeve !== true) {
      return { eligible: false, reason: "Game authorize required for bank sleeve" };
    }

    const named = snapshot.authorize.tokens ?? [];
    const banks = bankSleeves(snapshot).filter((s) => {
      if (named.length === 0) return true;
      const base = s.symbol.replace(/-USD$/i, "").toUpperCase();
      return named.some((t) => t.replace(/-USD$/i, "").toUpperCase() === base);
    });

    const takeNamed = snapshot.authorize.sleeveUsd;
    const usable = banks.filter((s) => {
      if (isFilDisplayOnly(s.symbol)) return false;
      const room = maxTakeWithoutFlatten(s);
      if (room <= 0) return false;
      if (takeNamed !== undefined) return !wouldFlatten(s, takeNamed);
      return true;
    });

    if (usable.length === 0) {
      const onlyFil = banks.length > 0 && banks.every((s) => isFilDisplayOnly(s.symbol));
      if (onlyFil) {
        return { eligible: false, reason: "FIL is display-only until MCP unlock; no MCP bank sleeve" };
      }
      return {
        eligible: false,
        reason: "No bank can sleeve without flattening (dust floor 10% peak / $0.25)",
      };
    }

    const symbol = usable[0]?.symbol;
    return {
      eligible: true,
      reason: `Game-authorized bank sleeve above floor on ${usable.map((s) => s.symbol).join(", ")}`,
      ...(symbol !== undefined ? { symbol } : {}),
    };
  },
};
