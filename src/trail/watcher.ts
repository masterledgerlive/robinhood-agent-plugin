import { SURF_LEARN } from "./constants.js";
import { evaluateAll } from "../tricks/catalog.js";
import { baseSymbol, expectancyHaltActive, isAgenticAccount, softHaltActive } from "./gates.js";
import { injectBrain } from "./brain.js";
import type { SuccessLedger } from "./ledger.js";
import { SuccessLedger as Ledger } from "./ledger.js";
import { redDayAllowsTroughReentry, redDayTrigger } from "./red-day.js";
import { recommendNextMove } from "./surf-act.js";
import { runSurfLearn } from "./surf-learn.js";
import { armTokenTriggers } from "./triggers.js";
import type { PortfolioSnapshot, WatchCandidate, WatchResult, WhisperCard } from "./types.js";

/** Chase into falling knives — blocked while RED_DAY active. Trough re-entry is gated separately. */
const CHASE_TRICKS = new Set(["momentum_15m", "mean_revert_15m"]);

/**
 * Deterministic 15m evaluate.
 * Live quiet is the default. SURF_LEARN paper what-ifs run every cycle.
 * BRAIN_INJECT loads recursive memory + learns from transmission costs every cycle.
 * Wave triggers arm every token from the tape — agents optional.
 * Lesson 2026-09-19: RED_DAY → exit → green-only → bottoms → agentless trough re-enter.
 * Never places.
 */
export function watch15m(
  snapshot: PortfolioSnapshot,
  ledger?: SuccessLedger,
  whispers?: WhisperCard[],
): WatchResult {
  const memory = ledger ?? new Ledger({ example: snapshot.example === true });

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
    if (ev.trick_id === "momentum_15m" && !momentumLiveUnlocked(memory)) continue;
    if (redDay.active && CHASE_TRICKS.has(ev.trick_id)) continue;
    if (
      redDay.active &&
      ev.trick_id === "trough_bounce_15m" &&
      ev.symbol !== undefined &&
      !redDayAllowsTroughReentry(redDay, ev.symbol)
    ) {
      continue;
    }
    // While defending / green-sheltering, only allow green-only park + exits (via redDay), not fresh chase seats.
    if (
      redDay.active &&
      (redDay.phase === "defend" || redDay.phase === "green_shelter") &&
      ev.trick_id === "trough_bounce_15m" &&
      !redDayAllowsTroughReentry(redDay, ev.symbol ?? "")
    ) {
      continue;
    }
    const path = memory.matchPath(ev.trick_id, ev.symbol);
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
  const learn = runSurfLearn(snapshot, memory, liveHits);

  // Brain needs watch status for credit hints — arm triggers first, then inject.
  const triggers = armTokenTriggers(snapshot, inbox, { redDay, candidates, ledger: memory });

  // Wave plan always prints. Working TP/stop/park/red-day/green-only fires wake WATCH.
  const waveFire = triggers.tokens.some(
    (t) =>
      t.state === "fired" &&
      (t.role === "working" ||
        t.where === "exit_to_dust" ||
        t.where === "park_green_only" ||
        t.where === "trick_out_at_peak" ||
        t.when.parkEligible),
  );

  const liveQuiet = candidates.length === 0 && !redDay.active && !waveFire;
  const status = liveQuiet ? "quiet" : "alert";

  const brain = injectBrain({
    snapshot,
    ledger: memory,
    learn,
    watchStatus: status,
  });

  const nextMove = recommendNextMove({ candidates, learn, redDay, brain });

  const result: WatchResult = {
    status,
    asOf: snapshot.asOf,
    halt,
    candidates,
    rejectedCount: evaluations.length - candidates.length,
    learn,
    redDay,
    nextMove,
    triggers,
    brain,
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
