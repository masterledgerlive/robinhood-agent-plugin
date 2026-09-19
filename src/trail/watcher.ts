import { evaluateAll } from "../tricks/catalog.js";
import { expectancyHaltActive, isAgenticAccount, softHaltActive } from "./gates.js";
import type { SuccessLedger } from "./ledger.js";
import type { PortfolioSnapshot, WatchCandidate, WatchResult } from "./types.js";

/**
 * Deterministic 15m evaluate.
 * Quiet is the default. Alert only when a trick clears gates (including protective halts).
 * Does not place orders.
 */
export function watch15m(snapshot: PortfolioSnapshot, ledger?: SuccessLedger): WatchResult {
  const halt = {
    soft: isAgenticAccount(snapshot) && softHaltActive(snapshot),
    expectancy: isAgenticAccount(snapshot) && expectancyHaltActive(snapshot),
  };

  const evaluations = evaluateAll(snapshot);
  const candidates: WatchCandidate[] = [];

  for (const ev of evaluations) {
    if (!ev.eligible) continue;
    const path = ledger?.matchPath(ev.trick_id, ev.symbol);
    const candidate: WatchCandidate = {
      trick_id: ev.trick_id,
      eligible: true,
      reason: ev.reason,
    };
    if (ev.symbol !== undefined) candidate.symbol = ev.symbol;
    if (path) candidate.path_id = path.path_id;
    candidates.push(candidate);
  }

  const result: WatchResult = {
    status: candidates.length === 0 ? "quiet" : "alert",
    asOf: snapshot.asOf,
    halt,
    candidates,
    rejectedCount: evaluations.length - candidates.length,
  };

  if (ledger && result.status === "alert") {
    ledger.rememberAlert({
      at: snapshot.asOf,
      status: "alert",
      candidates: candidates.map((c) => {
        const row: TrailAlertCandidate = { trick_id: c.trick_id, reason: c.reason };
        if (c.symbol !== undefined) row.symbol = c.symbol;
        if (c.path_id !== undefined) row.path_id = c.path_id;
        return row;
      }),
    });
  }

  return result;
}

type TrailAlertCandidate = {
  trick_id: string;
  reason: string;
  symbol?: string;
  path_id?: string;
};
