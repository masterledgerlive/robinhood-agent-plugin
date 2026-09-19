import { SURF_ACT } from "./constants.js";
import type {
  BrainMemory,
  CascadeMoveBatch,
  NextMove,
  RedDayResult,
  SurfLearnResult,
  TokenTriggerPlan,
  WatchCandidate,
} from "./types.js";
import { firedCascadeTriggers } from "./alert-bridge.js";
import { baseSymbol } from "./gates.js";

function pickCandidate(candidates: WatchCandidate[], trickId: string): WatchCandidate | undefined {
  return candidates.find((c) => c.trick_id === trickId);
}

/**
 * Cascade rotate batch for this 15m slot — pure math, up to cascadeRotatesPerSlot.
 * Only %-hit / trick-out fires (not enter fillers — those stay in SURF_ACT enter path).
 * Robinhood acts via synced create_alert specs; this never places.
 */
export function recommendCascadeMoves(input: {
  triggers: TokenTriggerPlan;
  candidates: WatchCandidate[];
}): CascadeMoveBatch {
  const capacity = SURF_ACT.cascadeRotatesPerSlot;
  const fired = firedCascadeTriggers(input.triggers.tokens);
  const moves: NextMove[] = [];

  for (const token of fired) {
    if (moves.length >= capacity) break;
    moves.push({
      action: "trick_out",
      trick_id: "trick_out_at_peak",
      symbol: token.symbol,
      reason: `Cascade %-hit fire on ${baseSymbol(token.symbol)} — jump out; sync RH alert. Agents optional.`,
      live: true,
    });
  }

  // Fill remaining capacity with other eligible trick-out candidates (math seats).
  if (moves.length < capacity) {
    for (const trickId of SURF_ACT.trickOutPreference) {
      if (moves.length >= capacity) break;
      const hits = input.candidates.filter((c) => c.trick_id === trickId);
      for (const hit of hits) {
        if (moves.length >= capacity) break;
        if (hit.symbol && moves.some((m) => m.symbol === hit.symbol)) continue;
        const move: NextMove = {
          action: "trick_out",
          trick_id: hit.trick_id,
          reason: `Cascade rotate seat ${moves.length + 1}/${capacity} — math %-hit/peak. Sync RH alert.`,
          live: true,
        };
        if (hit.symbol !== undefined) move.symbol = hit.symbol;
        if (hit.path_id !== undefined) move.path_id = hit.path_id;
        moves.push(move);
      }
    }
  }

  return { moves, capacity, firedCount: fired.length };
}

/**
 * One recommended move this 15m slot (primary).
 * Red-day exit → green-only shelter → peak/%-hit cascade → second-wave → accumulate → enter.
 * Live=false means hold / learn — do not flip a quiet book to chase.
 * Brain notes (transmission cost) refine hold/accumulate reasons when injected.
 * Never places. Agents optional — use recommendCascadeMoves for the ≥10 batch.
 */
export function recommendNextMove(input: {
  candidates: WatchCandidate[];
  learn: SurfLearnResult;
  redDay: RedDayResult;
  brain?: BrainMemory;
  cascadeMoves?: CascadeMoveBatch;
}): NextMove {
  if (input.redDay.status === "fired" && input.redDay.phase === "defend") {
    const seat = input.redDay.recommendations.exitWorkingToDust[0];
    const move: NextMove = {
      action: "red_day_exit",
      trick_id: "exit_working_to_dust",
      reason:
        "RED_DAY fired — sleeve working to dust, hold banks, then green-only until bottoms. Sync alerts; no place from watcher.",
      live: true,
    };
    if (seat) move.symbol = seat.symbol;
    return move;
  }

  if (
    input.redDay.active &&
    (input.redDay.phase === "green_shelter" || input.redDay.phase === "defend")
  ) {
    const green =
      pickCandidate(input.candidates, "park_green_only") ??
      (input.redDay.recommendations.parkGreenOnly[0]
        ? {
            trick_id: "park_green_only",
            eligible: true as const,
            reason: input.redDay.recommendations.parkGreenOnly[0].reason,
            symbol: input.redDay.recommendations.parkGreenOnly[0].symbol,
          }
        : undefined);
    if (green) {
      const move: NextMove = {
        action: "green_only_park",
        trick_id: "park_green_only",
        reason:
          "Everything red — shelter into green-only tokens until bottoms. Agents optional. Sync alerts.",
        live: true,
      };
      if (green.symbol !== undefined) move.symbol = green.symbol;
      if (green.path_id !== undefined) move.path_id = green.path_id;
      return move;
    }
  }

  if (input.redDay.active && input.redDay.phase === "reenter") {
    const trough = pickCandidate(input.candidates, "trough_bounce_15m");
    if (trough) {
      const move: NextMove = {
        action: "enter",
        trick_id: trough.trick_id,
        reason:
          "Bottoms found after RED_DAY — agentless trough re-entry (math, not chatter). Sync alerts.",
        live: true,
      };
      if (trough.symbol !== undefined) move.symbol = trough.symbol;
      if (trough.path_id !== undefined) move.path_id = trough.path_id;
      return move;
    }
  }

  // Prefer first cascade batch move when %-hit / trick-out fires (before parks/enters).
  const batchLead = input.cascadeMoves?.moves[0];
  if (batchLead && batchLead.live && batchLead.action === "trick_out") {
    const n = input.cascadeMoves?.moves.length ?? 1;
    return {
      ...batchLead,
      reason: `${batchLead.reason} (${n}/${input.cascadeMoves?.capacity ?? SURF_ACT.cascadeRotatesPerSlot} cascade slot).`,
    };
  }

  for (const trickId of SURF_ACT.trickOutPreference) {
    const out = pickCandidate(input.candidates, trickId);
    if (out) {
      const move: NextMove = {
        action: "trick_out",
        trick_id: out.trick_id,
        reason: "Peak/%-hit cascade trick-out — leave dust, rotate to primed token. Sync RH alert.",
        live: true,
      };
      if (out.symbol !== undefined) move.symbol = out.symbol;
      if (out.path_id !== undefined) move.path_id = out.path_id;
      return move;
    }
  }

  for (const trickId of SURF_ACT.secondWavePreference) {
    const wave2 = pickCandidate(input.candidates, trickId);
    if (wave2) {
      const move: NextMove = {
        action: "second_wave",
        trick_id: wave2.trick_id,
        reason: "Second-wave reclaim after crash — ride toward higherPeak. Sync alerts.",
        live: true,
      };
      if (wave2.symbol !== undefined) move.symbol = wave2.symbol;
      if (wave2.path_id !== undefined) move.path_id = wave2.path_id;
      return move;
    }
  }

  for (const trickId of SURF_ACT.accumulateOrder) {
    const park = pickCandidate(input.candidates, trickId);
    if (park) {
      const move: NextMove = {
        action: "accumulate",
        trick_id: park.trick_id,
        reason: `Park working profit → banks (${trickId}). Leave dust. Accumulate while we rotate.`,
        live: true,
      };
      if (park.symbol !== undefined) move.symbol = park.symbol;
      if (park.path_id !== undefined) move.path_id = park.path_id;
      return move;
    }
  }

  for (const trickId of SURF_ACT.enterPreference) {
    const enter = pickCandidate(input.candidates, trickId);
    if (!enter) continue;
    const tight = input.brain?.useful.preferTighterEdge
      ? " Brain prefers tighter RT edge from tx-cost memory."
      : "";
    const move: NextMove = {
      action: "enter",
      trick_id: enter.trick_id,
      reason: `Cascade seat (${SURF_ACT.preferNewEntriesPerSlot}/slot cap) — ${trickId} gates cleared (math, not chatter).${tight}`,
      live: true,
    };
    if (enter.symbol !== undefined) move.symbol = enter.symbol;
    if (enter.path_id !== undefined) move.path_id = enter.path_id;
    return move;
  }

  const top = input.learn.whatIfTop[0];
  if (top && top.whatIfPnlUsd > 0 && top.trick_id === "hold_bank") {
    const cs =
      top.costScore !== undefined ? ` costScore=${top.costScore.toFixed(3)}` : "";
    return {
      action: "accumulate",
      trick_id: "hold_bank",
      symbol: top.symbol,
      path_id: top.path_id,
      reason: `Hold / grow ${top.symbol} (paper what-if +${top.whatIfPnlUsd.toFixed(4)} after RT${cs}). No new working seat this slot.`,
      live: false,
    };
  }

  const costTop =
    input.brain?.useful.costAwareTopTrick && top
      ? ` Cost-aware top=${input.brain.useful.costAwareTopTrick}${top.costScore !== undefined ? ` score=${top.costScore.toFixed(3)}` : ""}.`
      : "";
  const brainHint = input.brain?.useful.preferTighterEdge
    ? " Brain: prefer 2× RT (tx costs)."
    : input.brain?.injected
      ? " Brain injected; tx-cost memory tracking."
      : "";
  return {
    action: "hold",
    trick_id: "hold_bank",
    reason: `No live gate-clear rotate.${brainHint}${costTop} Banks stay; do not chase.`,
    live: false,
  };
}
