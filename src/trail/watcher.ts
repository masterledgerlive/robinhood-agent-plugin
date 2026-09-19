import { SURF_LEARN } from "./constants.js";
import { evaluateAll } from "../tricks/catalog.js";
import { baseSymbol, expectancyHaltActive, isAgenticAccount, softHaltActive } from "./gates.js";
import type { SuccessLedger } from "./ledger.js";
import { redDayTrigger } from "./red-day.js";
import { runSurfLearn } from "./surf-learn.js";
import type { PortfolioSnapshot, WatchCandidate, WatchResult, WhisperCard } from "./types.js";

const CHASE_TRICKS = new Set(["trough_bounce_15m", "momentum_15m", "mean_revert_15m"]);

/**
 * Deterministic 15m evaluate.
 * Live quiet is the default. SURF_LEARN paper what-ifs run every cycle.
 * Red-day / whisper layer recommends only — never places.
 */
export function watch15m(
  snapshot: PortfolioSnapshot,
  ledger?: SuccessLedger,
  whispers?: WhisperCard[],
): WatchResult {
  const halt = {
    soft: isAgenticAccount(snapshot) && softHaltActive(snapshot),
    expectancy: isAgenticAccount(snapshot) && expectancyHaltActive(snapshot),
    redDay: false,
  };

  const inbox = [...(snapshot.whispers ?? []), ...(whispers ?? [])];
  const redDay = redDayTrigger.evaluate(snapshot, inbox);
  halt.redDay = redDay.active;

  const evaluations = evaluateAll(snapshot);
  const candidates: WatchCandidate[] = [];

  for (const ev of evaluations) {
    if (!ev.eligible) continue;
    if (ev.trick_id === "momentum_15m" && !momentumLiveUnlocked(ledger)) continue;
    if (redDay.active && CHASE_TRICKS.has(ev.trick_id)) continue;
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

  const liveHits = new Set(
    candidates.map((c) => `${c.trick_id}:${c.symbol ? baseSymbol(c.symbol) : ""}`),
  );
  const learn = runSurfLearn(snapshot, ledger, liveHits);

  const liveQuiet = candidates.length === 0 && !redDay.active;
  const result: WatchResult = {
    status: liveQuiet ? "quiet" : "alert",
    asOf: snapshot.asOf,
    halt,
    candidates,
    rejectedCount: evaluations.length - candidates.length,
    learn,
    redDay,
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

function momentumLiveUnlocked(ledger?: SuccessLedger): boolean {
  if (!ledger) return false;
  const paper = ledger.statsFor({ trick_id: "momentum_15m" }, { kind: "paper_surf" });
  return (
    paper.attempts >= SURF_LEARN.momentumLiveMinTrials &&
    paper.success_rate !== null &&
    paper.success_rate + 1e-12 >= SURF_LEARN.momentumLiveMinWinRate
  );
}

type TrailAlertCandidate = {
  trick_id: string;
  reason: string;
  symbol?: string;
  path_id?: string;
};
