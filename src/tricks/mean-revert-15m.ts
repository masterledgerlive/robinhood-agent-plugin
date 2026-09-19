import {
  baseSymbol,
  edgeClearsRt,
  isAgenticAccount,
  isBankSymbol,
  refuseNewWorkingEntry,
  refuseNonAgentic,
  spreadOk,
  troughBounceEdge,
  workingSeats,
} from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const meanRevert15m: Trick = {
  id: "mean_revert_15m",
  whenItMayFire:
    "SURF_LEARN always. Live DIVIDEND_15M only when mark is below a known mean (priorMark or trough midpoint) with revert edge ≥ profile × RT. Not a LOW_CAP_SLOW live entry.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      minEdgeMultipleOfRtSpread: { type: "number" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    if (snapshot.mode !== "DIVIDEND_15M") {
      return { eligible: false, reason: "mean_revert_15m live is DIVIDEND_15M only; otherwise SURF_LEARN paper" };
    }
    const blocked = refuseNewWorkingEntry(snapshot);
    if (blocked) return { eligible: false, reason: blocked };

    const occupied = new Set(workingSeats(snapshot).map((s) => baseSymbol(s.symbol)));
    const hits: string[] = [];
    let lastFail = "No mean-revert dip with a known mean and edge";

    for (const quote of snapshot.quotes) {
      if (isBankSymbol(quote.symbol) || quote.symbol.replace(/-USD$/i, "").toUpperCase() === "FIL") {
        lastFail = `${quote.symbol}: banks / FIL are not new working mean-revert`;
        continue;
      }
      if (occupied.has(baseSymbol(quote.symbol))) {
        lastFail = `${quote.symbol}: already a working seat`;
        continue;
      }
      const trough = snapshot.troughs.find(
        (t) => t.symbol.replace(/-USD$/i, "").toUpperCase() === baseSymbol(quote.symbol),
      );
      let mean: number | undefined = quote.priorMark;
      if (trough?.recentHigh !== undefined) {
        mean = (trough.troughMark + trough.recentHigh) / 2;
      }
      if (mean === undefined || !(mean > 0)) {
        lastFail = `${quote.symbol}: missing priorMark/mean — will not invent revert`;
        continue;
      }
      if (!(quote.mark < mean)) {
        lastFail = `${quote.symbol}: mark not below mean (no dip)`;
        continue;
      }
      if (trough) {
        const bounce = troughBounceEdge(trough, quote.mark, snapshot);
        if (bounce.chase) {
          lastFail = `${quote.symbol}: extended — not a revert dip`;
          continue;
        }
      }
      if (!spreadOk(quote, snapshot)) {
        lastFail = `${quote.symbol}: spread above DIVIDEND_15M hard 1.2%`;
        continue;
      }
      const edge = (mean - quote.mark) / quote.mark;
      if (!edgeClearsRt(edge, quote, snapshot)) {
        lastFail = `${quote.symbol}: revert-to-mean edge < 1.5× RT`;
        continue;
      }
      hits.push(quote.symbol);
    }

    if (hits.length === 0) return { eligible: false, reason: lastFail };
    const symbol = hits[0];
    return {
      eligible: true,
      reason: `mean-revert dip + spread/edge OK on ${hits.join(", ")}`,
      ...(symbol !== undefined ? { symbol } : {}),
    };
  },
};

