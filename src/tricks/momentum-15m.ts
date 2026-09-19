import {
  baseSymbol,
  edgeClearsRt,
  isAgenticAccount,
  isBankSymbol,
  refuseNewWorkingEntry,
  refuseNonAgentic,
  spreadOk,
  workingSeats,
} from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const momentum15m: Trick = {
  id: "momentum_15m",
  whenItMayFire:
    "DIVIDEND_15M live: last-15m up-move ≥ edge × RT, spread OK. Watcher also requires SURF_LEARN paper win rate ≥55% over ≥10 trials. LOW_CAP_SLOW: learn only.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      minEdgeMultipleOfRtSpread: { type: "number", description: "From active gate profile" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    if (snapshot.mode !== "DIVIDEND_15M") {
      return { eligible: false, reason: "momentum_15m live is DIVIDEND_15M only; LOW_CAP_SLOW stays trough+bounce" };
    }
    const blocked = refuseNewWorkingEntry(snapshot);
    if (blocked) return { eligible: false, reason: blocked };

    const occupied = new Set(workingSeats(snapshot).map((s) => baseSymbol(s.symbol)));
    const hits: string[] = [];
    let lastFail = "No momentum candidate with priorMark, spread, and edge";

    for (const quote of snapshot.quotes) {
      if (isBankSymbol(quote.symbol) || isFilDisplayOnlySafe(quote.symbol)) {
        lastFail = `${quote.symbol}: banks / FIL are not new working momentum`;
        continue;
      }
      if (occupied.has(baseSymbol(quote.symbol))) {
        lastFail = `${quote.symbol}: already a working seat`;
        continue;
      }
      if (quote.priorMark === undefined || !(quote.priorMark > 0)) {
        lastFail = `${quote.symbol}: missing priorMark — will not invent momentum`;
        continue;
      }
      if (!(quote.mark > quote.priorMark)) {
        lastFail = `${quote.symbol}: mark not above priorMark`;
        continue;
      }
      if (!spreadOk(quote, snapshot)) {
        lastFail = `${quote.symbol}: spread above DIVIDEND_15M hard 1.2%`;
        continue;
      }
      const edge = (quote.mark - quote.priorMark) / quote.priorMark;
      if (!edgeClearsRt(edge, quote, snapshot)) {
        lastFail = `${quote.symbol}: last-15m move < 1.5× RT`;
        continue;
      }
      hits.push(quote.symbol);
    }

    if (hits.length === 0) return { eligible: false, reason: lastFail };
    const symbol = hits[0];
    return {
      eligible: true,
      reason: `momentum last-15m up-move + spread/edge OK on ${hits.join(", ")}`,
      ...(symbol !== undefined ? { symbol } : {}),
    };
  },
};

function isFilDisplayOnlySafe(symbol: string): boolean {
  return symbol.replace(/-USD$/i, "").toUpperCase() === "FIL";
}
