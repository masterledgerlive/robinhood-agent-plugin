import {
  baseSymbol,
  edgeClearsRt,
  findQuote,
  gateProfile,
  isAgenticAccount,
  isBankSymbol,
  refuseNewWorkingEntry,
  refuseNonAgentic,
  spreadOk,
  troughBounceEdge,
  troughWindowOk,
  workingSeats,
} from "../trail/gates.js";
import type { TrickEvaluation } from "../trail/types.js";
import type { Trick } from "./types.js";

export const troughBounce15m: Trick = {
  id: "trough_bounce_15m",
  whenItMayFire:
    "Mark reclaims a 15–30m trough, spread/edge clear the active gate profile, seats/day open, no chase, no halt.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      troughWindowMinMinutes: { type: "number", description: "Default 15" },
      troughWindowMaxMinutes: { type: "number", description: "Default 30" },
      maxSpread: { type: "number", description: "Default 0.008" },
      minEdgeMultipleOfRtSpread: { type: "number", description: "Default 2" },
      chaseMaxFractionOfBounce: { type: "number", description: "Default 0.5" },
    },
  },
  evaluate(snapshot): TrickEvaluation {
    if (!isAgenticAccount(snapshot)) return refuseNonAgentic();
    const blocked = refuseNewWorkingEntry(snapshot);
    if (blocked) return { eligible: false, reason: blocked };

    const profile = gateProfile(snapshot);
    const occupied = new Set(workingSeats(snapshot).map((s) => baseSymbol(s.symbol)));
    const hits: string[] = [];
    let lastFail = "No 15–30m trough+bounce candidate cleared spread/edge/no-chase gates";

    for (const trough of snapshot.troughs) {
      if (!troughWindowOk(trough, snapshot)) {
        lastFail = `${trough.symbol}: trough window must be ${profile.troughWindowMinMinutes}–${profile.troughWindowMaxMinutes}m`;
        continue;
      }
      if (isBankSymbol(trough.symbol)) {
        lastFail = `${trough.symbol}: banks are hold/park, not new working entries`;
        continue;
      }
      if (occupied.has(baseSymbol(trough.symbol))) {
        lastFail = `${trough.symbol}: already a working seat (no chase / no add)`;
        continue;
      }
      const quote = findQuote(snapshot, trough.symbol);
      if (!quote) {
        lastFail = `${trough.symbol}: no quote`;
        continue;
      }
      if (!spreadOk(quote, snapshot)) {
        lastFail = `${trough.symbol}: spread > ${profile.maxSpread * 100}% hard`;
        continue;
      }
      const bounce = troughBounceEdge(trough, quote.mark, snapshot);
      if (!bounce.reclaim) {
        lastFail = `${trough.symbol}: mark has not reclaimed trough`;
        continue;
      }
      if (bounce.chase) {
        lastFail = `${trough.symbol}: no chase — mark already extended through the bounce`;
        continue;
      }
      if (!bounce.ok) {
        lastFail = `${trough.symbol}: missing recentHigh; will not invent bounce edge`;
        continue;
      }
      if (!edgeClearsRt(bounce.edge, quote, snapshot)) {
        lastFail = `${trough.symbol}: bounce edge < ${profile.minEdgeMultipleOfRtSpread}× RT spread`;
        continue;
      }
      hits.push(trough.symbol);
    }

    if (hits.length === 0) return { eligible: false, reason: lastFail };
    const symbol = hits[0];
    return {
      eligible: true,
      reason: `trough reclaim + spread/edge OK on ${hits.join(", ")}`,
      ...(symbol !== undefined ? { symbol } : {}),
    };
  },
};
