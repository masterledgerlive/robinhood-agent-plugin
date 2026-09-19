import { SURF_ACT } from "./constants.js";
import type { NextMove, RedDayResult, SurfLearnResult, WatchCandidate } from "./types.js";

function pickCandidate(candidates: WatchCandidate[], trickId: string): WatchCandidate | undefined {
  return candidates.find((c) => c.trick_id === trickId);
}

/**
 * One recommended move this 15m slot.
 * Red-day exit → peak trick-out → accumulate (park) → enter.
 * Live=false means hold / learn — do not flip a quiet book to chase.
 * Never places.
 */
export function recommendNextMove(input: {
  candidates: WatchCandidate[];
  learn: SurfLearnResult;
  redDay: RedDayResult;
}): NextMove {
  if (input.redDay.status === "fired") {
    const seat = input.redDay.recommendations.exitWorkingToDust[0];
    const move: NextMove = {
      action: "red_day_exit",
      trick_id: "exit_working_to_dust",
      reason: "RED_DAY fired — sleeve working to dust, hold banks, stage troughs. No place.",
      live: true,
    };
    if (seat) move.symbol = seat.symbol;
    return move;
  }

  for (const trickId of SURF_ACT.trickOutPreference) {
    const out = pickCandidate(input.candidates, trickId);
    if (out) {
      const move: NextMove = {
        action: "trick_out",
        trick_id: out.trick_id,
        reason: "Peak/first-crash trick-out — leave dust, rotate to primed token. No place.",
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
        reason: "Second-wave reclaim after crash — ride toward higherPeak. No place.",
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
    const move: NextMove = {
      action: "enter",
      trick_id: enter.trick_id,
      reason: `One ${trickId} seat this 15m slot — gates cleared (math, not chatter). No place.`,
      live: true,
    };
    if (enter.symbol !== undefined) move.symbol = enter.symbol;
    if (enter.path_id !== undefined) move.path_id = enter.path_id;
    return move;
  }

  const top = input.learn.whatIfTop[0];
  if (top && top.whatIfPnlUsd > 0 && top.trick_id === "hold_bank") {
    return {
      action: "accumulate",
      trick_id: "hold_bank",
      symbol: top.symbol,
      path_id: top.path_id,
      reason: `Hold / grow ${top.symbol} (paper what-if +${top.whatIfPnlUsd.toFixed(4)} after RT). No new working seat this slot.`,
      live: false,
    };
  }

  return {
    action: "hold",
    trick_id: "hold_bank",
    reason: "No live gate-clear rotate. SURF_LEARN keeps ranking. Banks stay; do not chase.",
    live: false,
  };
}
