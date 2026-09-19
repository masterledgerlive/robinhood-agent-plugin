import { SURF_ACT } from "./constants.js";
import type { BrainMemory, NextMove, RedDayResult, SurfLearnResult, WatchCandidate } from "./types.js";

function pickCandidate(candidates: WatchCandidate[], trickId: string): WatchCandidate | undefined {
  return candidates.find((c) => c.trick_id === trickId);
}

/**
 * One recommended move this 15m slot.
 * Red-day exit → green-only shelter → peak trick-out → second-wave → accumulate → enter.
 * Live=false means hold / learn — do not flip a quiet book to chase.
 * Brain notes (transmission cost) refine hold/accumulate reasons when injected.
 * Never places. Agents optional.
 */
export function recommendNextMove(input: {
  candidates: WatchCandidate[];
  learn: SurfLearnResult;
  redDay: RedDayResult;
  brain?: BrainMemory;
}): NextMove {
  if (input.redDay.status === "fired" && input.redDay.phase === "defend") {
    const seat = input.redDay.recommendations.exitWorkingToDust[0];
    const move: NextMove = {
      action: "red_day_exit",
      trick_id: "exit_working_to_dust",
      reason:
        "RED_DAY fired — sleeve working to dust, hold banks, then green-only until bottoms. No place.",
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
          "Everything red — shelter into green-only tokens until bottoms. Agents optional. No place.",
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
          "Bottoms found after RED_DAY — agentless trough re-entry (math, not chatter). No place.",
        live: true,
      };
      if (trough.symbol !== undefined) move.symbol = trough.symbol;
      if (trough.path_id !== undefined) move.path_id = trough.path_id;
      return move;
    }
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
    const tight = input.brain?.useful.preferTighterEdge
      ? " Brain prefers tighter RT edge from tx-cost memory."
      : "";
    const move: NextMove = {
      action: "enter",
      trick_id: enter.trick_id,
      reason: `One ${trickId} seat this 15m slot — gates cleared (math, not chatter).${tight} No place.`,
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
