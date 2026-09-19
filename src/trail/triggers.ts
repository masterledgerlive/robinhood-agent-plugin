/**
 * Per-token automatic triggers from wave math (+ optional whisper overlay).
 *
 * Agents are optional. Cron / watch:15m arms every token from the tape.
 * When Cursor/desk bots do not respond, triggers still print WHERE/WHEN
 * from AGENTIC_MOVE_EQ + wave functions. Never places. Never invents marks.
 */

import {
  cascadeExitOf,
  idleBuyingPowerPressure,
  topCascadeDestination,
} from "./cascade.js";
import {
  AGENTIC_MOVE_EQ,
  edgeClearsPark,
  formatSleeveExitEquation,
  whisperCascadeScore,
  type AgenticMoveEq,
} from "./equation.js";
import {
  baseSymbol,
  dustFloorUsd,
  findQuote,
  findSleeve,
  isFilDisplayOnly,
  maxTakeWithoutFlatten,
  workingSeats,
} from "./gates.js";
import type {
  PortfolioSnapshot,
  RedDayResult,
  TokenTrigger,
  TokenTriggerPlan,
  TriggerAction,
  TriggerBrokerAlertSpec,
  TriggerRole,
  TriggerState,
  WatchCandidate,
  WhisperCard,
} from "./types.js";
import { rankWaves, waveOf, waveToTrickId, type WaveState } from "./wave.js";
import { peakOf, peakPullbackAlertMark } from "./peak.js";
import { topPrimedToken } from "./prime.js";

function sleeveRole(snapshot: PortfolioSnapshot, symbol: string): TriggerRole {
  const sleeve = findSleeve(snapshot, symbol);
  if (sleeve?.role === "bank") return "bank";
  if (sleeve?.role === "working") return "working";
  if (sleeve?.role === "dust") return "dust";
  return "candidate";
}

function brokerSpecs(
  symbol: string,
  tp?: number,
  stop?: number,
  peakPullback?: number,
  support?: number,
): TriggerBrokerAlertSpec[] {
  const specs: TriggerBrokerAlertSpec[] = [];
  const bare = baseSymbol(symbol);
  if (tp !== undefined && Number.isFinite(tp)) {
    specs.push({
      symbol: bare,
      asset_class: "crypto",
      condition_type: "price_above",
      threshold: tp.toFixed(8).replace(/\.?0+$/, ""),
      purpose: "take_profit",
    });
  }
  if (stop !== undefined && Number.isFinite(stop)) {
    specs.push({
      symbol: bare,
      asset_class: "crypto",
      condition_type: "price_below",
      threshold: stop.toFixed(8).replace(/\.?0+$/, ""),
      purpose: "stop",
    });
  }
  if (peakPullback !== undefined && Number.isFinite(peakPullback)) {
    specs.push({
      symbol: bare,
      asset_class: "crypto",
      condition_type: "price_below",
      threshold: peakPullback.toFixed(8).replace(/\.?0+$/, ""),
      purpose: "peak_pullback",
    });
  }
  if (support !== undefined && Number.isFinite(support)) {
    specs.push({
      symbol: bare,
      asset_class: "crypto",
      condition_type: "price_below",
      threshold: support.toFixed(8).replace(/\.?0+$/, ""),
      purpose: "support",
    });
  }
  return specs;
}

function whereFromWave(
  wave: WaveState | null,
  role: TriggerRole,
  cascadeRoute: string | null,
  redDay: RedDayResult | undefined,
): TriggerAction {
  const redDayActive = redDay?.active === true;
  if (redDayActive && role === "working") return "exit_to_dust";
  if (
    redDayActive &&
    (role === "candidate" || role === "whisper") &&
    (redDay?.phase === "green_shelter" || redDay?.phase === "defend") &&
    (redDay?.recommendations.parkGreenOnly.length ?? 0) > 0
  ) {
    // Specific symbol check happens in armCandidate; default hint for green shelter.
    if (cascadeRoute !== "buy_trough") return "park_green_only";
  }
  if (cascadeRoute === "exit_working" && role === "working") return "exit_to_dust";
  if (cascadeRoute === "buy_trough" && (role === "candidate" || role === "whisper")) {
    return "buy_trough";
  }
  if (cascadeRoute === "hold_banks" && role === "bank") return "hold_bank";
  if (role === "bank") return "hold_bank";
  if (role === "dust") return "hold_dust";
  if (!wave) return "none";
  if (redDayActive && (wave.kind === "momentum_up" || wave.kind === "mean_revert_dip")) {
    return "none"; // no chase into red knives
  }
  const trick = waveToTrickId(wave.kind);
  if (trick === "trough_bounce_15m") return "enter_trough";
  if (trick === "mean_revert_15m") return "enter_mean_revert";
  if (trick === "momentum_15m") return "enter_momentum";
  return "none";
}

function stateOf(input: {
  fired: boolean;
  armed: boolean;
  blocked: boolean;
}): TriggerState {
  if (input.blocked) return "blocked";
  if (input.fired) return "fired";
  if (input.armed) return "armed";
  return "waiting";
}

function armWorking(
  snapshot: PortfolioSnapshot,
  symbol: string,
  wave: WaveState | null,
  whispers: WhisperCard[],
  redDay: RedDayResult | undefined,
  eq: AgenticMoveEq,
): TokenTrigger {
  const sleeve = findSleeve(snapshot, symbol, "working")!;
  const quote = findQuote(snapshot, symbol);
  const cascade = whisperCascadeScore(whispers, symbol, eq);
  const basis = sleeve.costBasisUsd ?? sleeve.markUsd ?? quote?.mark;
  const leaveDust = dustFloorUsd(sleeve);
  const take = maxTakeWithoutFlatten(sleeve);

  let tpMark: number | undefined;
  let stopMarkValue: number | undefined;
  let equation = `working ${baseSymbol(symbol)}: missing basis/quote — cannot arm TP/stop (no invent)`;
  let parkEligible = false;
  let fired = false;
  let armed = false;
  let blocked = isFilDisplayOnly(symbol);

  if (quote && basis !== undefined && basis > 0) {
    const exit = formatSleeveExitEquation(basis, quote, eq);
    tpMark = exit.tpMark;
    stopMarkValue = exit.stopMarkValue;
    equation = exit.equation;
    const mark = sleeve.markUsd ?? quote.mark;
    const edge = (mark - basis) / basis;
    parkEligible = mark > basis && edgeClearsPark(edge, quote, eq) && take > 0;
    fired = mark + 1e-12 >= tpMark || mark - 1e-12 <= stopMarkValue;
    armed = true;
    if (parkEligible) {
      equation += `; park_eligible edge=${(edge * 100).toFixed(2)}%`;
    }
  }

  const peak = peakOf(snapshot, symbol, eq);
  const peakAlert = peakPullbackAlertMark(snapshot, symbol, eq);
  const cascadeExit = cascadeExitOf(snapshot, symbol, eq);
  if (peak) {
    equation += `; ${peak.equation}`;
    if (peak.mode === "trick_out" || peak.mode === "crash_start") {
      fired = true;
      armed = true;
    } else if (peak.mode === "peak_armed" || peak.mode === "ride") {
      armed = true;
    }
  }
  if (cascadeExit) {
    equation += `; ${cascadeExit.equation}`;
    if (cascadeExit.fire) {
      fired = true;
      armed = true;
      // Micro / stale / RSI cascade counts as park-eligible when still green.
      if (cascadeExit.edge !== null && cascadeExit.edge > 0 && take > 0) {
        parkEligible = true;
      }
    } else if (
      cascadeExit.peakTopShown ||
      cascadeExit.staleWave ||
      cascadeExit.rsiRollingDown
    ) {
      armed = true;
    }
  }

  if (redDay?.active) {
    equation += "; RED_DAY — prefer exit_to_dust (leave dust)";
    armed = true;
    if (take > 0) fired = true;
  }

  let where: TriggerAction = parkEligible
    ? "park_to_near"
    : whereFromWave(wave, "working", cascade.route, redDay);
  if (redDay?.active && take > 0) {
    where = "exit_to_dust";
  } else if (cascadeExit?.fire || peak?.mode === "trick_out" || peak?.mode === "crash_start") {
    where = "trick_out_at_peak";
  } else if (peak?.mode === "second_wave") {
    // Already in the seat — ride reclaim toward higherPeak (do not re-enter).
    where = "ride_peak";
  } else if (peak?.mode === "peak_armed" || peak?.mode === "ride") {
    where = "ride_peak";
  }

  const trigger: TokenTrigger = {
    symbol: sleeve.symbol,
    role: "working",
    state: stateOf({ fired, armed, blocked }),
    where: blocked ? "none" : where,
    when: {
      ...(tpMark !== undefined ? { takeProfitMark: tpMark } : {}),
      ...(stopMarkValue !== undefined ? { stopMark: stopMarkValue } : {}),
      ...(cascadeExit?.supportMark !== undefined && cascadeExit.supportMark !== null
        ? { supportMark: cascadeExit.supportMark }
        : {}),
      parkEligible,
      leaveDustUsd: leaveDust,
      equation,
    },
    cascade: {
      whisperScore: cascade.score,
      route: cascade.route,
      sources: cascade.sources,
      equation: cascade.equation,
    },
    brokerAlerts: brokerSpecs(
      sleeve.symbol,
      tpMark,
      stopMarkValue,
      peakAlert ?? undefined,
      cascadeExit?.supportMark ?? undefined,
    ),
    agentRequired: false,
    ...(wave ? { wave } : {}),
  };
  return trigger;
}

function armBank(
  snapshot: PortfolioSnapshot,
  symbol: string,
  wave: WaveState | null,
  whispers: WhisperCard[],
  eq: AgenticMoveEq,
): TokenTrigger {
  const sleeve = findSleeve(snapshot, symbol, "bank")!;
  const cascade = whisperCascadeScore(whispers, symbol, eq);
  const leaveDust = dustFloorUsd(sleeve);
  const equation =
    `bank ${baseSymbol(symbol)}: hold forever above dust $${leaveDust.toFixed(2)} ` +
    `(${AGENTIC_MOVE_EQ.id}; never flatten)`;

  return {
    symbol: sleeve.symbol,
    role: "bank",
    state: "armed",
    where: "hold_bank",
    when: {
      parkEligible: false,
      leaveDustUsd: leaveDust,
      equation,
    },
    cascade: {
      whisperScore: cascade.score,
      route: cascade.route,
      sources: cascade.sources,
      equation: cascade.equation,
    },
    brokerAlerts: [],
    agentRequired: false,
    ...(wave ? { wave } : {}),
  };
}

function armCandidate(
  snapshot: PortfolioSnapshot,
  symbol: string,
  wave: WaveState | null,
  whispers: WhisperCard[],
  candidates: WatchCandidate[],
  redDay: RedDayResult | undefined,
  eq: AgenticMoveEq,
): TokenTrigger {
  const quote = findQuote(snapshot, symbol);
  const cascade = whisperCascadeScore(whispers, symbol, eq);
  const role: TriggerRole = cascade.themeHits > 0 && sleeveRole(snapshot, symbol) === "candidate"
    ? "whisper"
    : "candidate";
  const liveHit = candidates.find(
    (c) => c.symbol !== undefined && baseSymbol(c.symbol) === baseSymbol(symbol),
  );
  const trough = snapshot.troughs.find((t) => baseSymbol(t.symbol) === baseSymbol(symbol));
  const reclaim = trough?.troughMark;
  const blocked = isFilDisplayOnly(symbol);
  const peak = peakOf(snapshot, symbol, eq);
  let where = whereFromWave(wave, role, cascade.route, redDay);
  const greenHit = redDay?.recommendations.parkGreenOnly.find(
    (g) => baseSymbol(g.symbol) === baseSymbol(symbol),
  );
  if (
    redDay?.active &&
    greenHit &&
    (redDay.phase === "green_shelter" || redDay.phase === "defend" || redDay.phase === "wait_bottoms")
  ) {
    where = "park_green_only";
  } else if (peak?.mode === "second_wave") {
    where = "second_wave_reentry";
  }

  let equation = wave?.equation ?? `candidate ${baseSymbol(symbol)}: no wave geometry`;
  if (reclaim !== undefined) {
    equation += `; trough_reclaim>${reclaim.toFixed(6)}`;
  }
  if (liveHit) equation += `; live_trick=${liveHit.trick_id}`;
  if (greenHit) {
    equation += `; green_only +${(greenHit.climbFromOpen * 100).toFixed(2)}% vs open`;
  }

  const greenArmed =
    redDay?.active === true &&
    greenHit !== undefined &&
    (redDay.phase === "green_shelter" || redDay.phase === "defend");
  const armed =
    !blocked &&
    (greenArmed ||
      (wave?.edgeClears === true && wave.spreadOk) ||
      liveHit !== undefined ||
      peak?.mode === "second_wave" ||
      (cascade.route === "buy_trough" && cascade.score >= 0.5));
  const fired =
    liveHit !== undefined ||
    greenArmed ||
    (wave?.kind === "trough_reclaim" && wave.edgeClears && wave.spreadOk) ||
    peak?.mode === "second_wave";

  const brokerAlerts: TriggerBrokerAlertSpec[] = [];
  if (reclaim !== undefined && Number.isFinite(reclaim)) {
    brokerAlerts.push({
      symbol: baseSymbol(symbol),
      asset_class: "crypto",
      condition_type: "price_above",
      threshold: reclaim.toFixed(8).replace(/\.?0+$/, ""),
      purpose: "trough_reclaim",
    });
  }

  return {
    symbol: quote?.symbol ?? symbol,
    role,
    state: stateOf({ fired: fired && !blocked, armed: armed && !blocked, blocked }),
    where: blocked ? "none" : where,
    when: {
      ...(reclaim !== undefined ? { troughReclaimMark: reclaim } : {}),
      parkEligible: false,
      equation,
    },
    cascade: {
      whisperScore: cascade.score,
      route: cascade.route,
      sources: cascade.sources,
      equation: cascade.equation,
    },
    brokerAlerts,
    agentRequired: false,
    ...(wave ? { wave } : {}),
  };
}

/**
 * Arm automatic triggers for every token in the book + whisper inbox.
 * Wave math is primary. Cascade/whispers overlay route hints only.
 * agentRequired is always false — cron can run this with no LLM.
 */
export function armTokenTriggers(
  snapshot: PortfolioSnapshot,
  whispers: WhisperCard[] = [],
  opts?: {
    redDay?: RedDayResult;
    candidates?: WatchCandidate[];
    eq?: AgenticMoveEq;
  },
): TokenTriggerPlan {
  const eq = opts?.eq ?? AGENTIC_MOVE_EQ;
  const inbox = [...(snapshot.whispers ?? []), ...whispers];
  const candidates = opts?.candidates ?? [];
  const redDay = opts?.redDay;
  const waves = rankWaves(snapshot, eq);
  const waveByBase = new Map(waves.map((w) => [baseSymbol(w.symbol), w]));

  const bases = new Set<string>();
  for (const s of snapshot.sleeves) bases.add(baseSymbol(s.symbol));
  for (const q of snapshot.quotes) bases.add(baseSymbol(q.symbol));
  for (const w of inbox) {
    for (const t of w.tokens) bases.add(baseSymbol(t));
  }

  const tokens: TokenTrigger[] = [];
  for (const base of [...bases].sort()) {
    const wave = waveByBase.get(base) ?? waveOf(snapshot, base, eq);
    const role = sleeveRole(snapshot, base);
    if (role === "working") {
      tokens.push(armWorking(snapshot, base, wave, inbox, redDay, eq));
    } else if (role === "bank") {
      tokens.push(armBank(snapshot, base, wave, inbox, eq));
    } else if (role === "dust") {
      const sleeve = findSleeve(snapshot, base, "dust")!;
      tokens.push({
        symbol: sleeve.symbol,
        role: "dust",
        state: "armed",
        where: "hold_dust",
        when: {
          parkEligible: false,
          leaveDustUsd: dustFloorUsd(sleeve),
          equation: `dust ${base}: hold floor forever`,
        },
        cascade: {
          whisperScore: 0,
          route: null,
          sources: [],
          equation: `whisper_score(${base})=0`,
        },
        brokerAlerts: [],
        agentRequired: false,
        ...(wave ? { wave } : {}),
      });
    } else {
      tokens.push(armCandidate(snapshot, base, wave, inbox, candidates, redDay, eq));
    }
  }

  const actionable = tokens.filter((t) => t.state === "fired" || (t.state === "armed" && t.where !== "hold_bank" && t.where !== "hold_dust" && t.where !== "none" && t.where !== "ride_peak"));
  const cascadeDest = topCascadeDestination(snapshot);
  const primed = topPrimedToken(snapshot);
  const next = pickWaveNext(
    tokens,
    workingSeats(snapshot).length > 0,
    redDay,
    cascadeDest?.symbol ?? primed?.symbol,
    idleBuyingPowerPressure(snapshot),
  );

  return {
    eqId: eq.id,
    asOf: snapshot.asOf,
    agentRequired: false,
    waves,
    tokens,
    actionableCount: actionable.length,
    next,
  };
}

function pickWaveNext(
  tokens: TokenTrigger[],
  hasWorking: boolean,
  redDay: RedDayResult | undefined,
  primedSymbol?: string,
  idleBuyingPower?: boolean,
): TokenTriggerPlan["next"] {
  const redDayActive = redDay?.active === true;
  if (redDayActive) {
    const exit = tokens.find((t) => t.where === "exit_to_dust" && t.role === "working");
    if (exit) {
      return {
        symbol: exit.symbol,
        where: exit.where,
        reason: "Wave/RED_DAY: sleeve working to dust (leave dust). No agent required.",
      };
    }
    const green = tokens.find(
      (t) => t.where === "park_green_only" && (t.state === "fired" || t.state === "armed"),
    );
    if (green && (redDay?.phase === "green_shelter" || redDay?.phase === "defend" || redDay?.phase === "wait_bottoms")) {
      return {
        symbol: green.symbol,
        where: green.where,
        reason:
          "Everything red — green-only shelter until bottoms. Agents optional. No place.",
      };
    }
    if (redDay?.phase === "reenter") {
      const trough = tokens.find(
        (t) => t.where === "enter_trough" && (t.state === "fired" || t.state === "armed"),
      );
      if (trough) {
        return {
          symbol: trough.symbol,
          where: trough.where,
          reason: "Bottoms found — agentless trough re-entry. No agent required.",
        };
      }
    }
  }
  const trickOut = tokens.find(
    (t) => t.where === "trick_out_at_peak" && (t.state === "fired" || t.state === "armed"),
  );
  if (trickOut) {
    const dest = primedSymbol ? ` → cascade ${baseSymbol(primedSymbol)}` : "";
    return {
      symbol: trickOut.symbol,
      where: trickOut.where,
      reason: `Stale-profit/peak/RSI cascade out on ${baseSymbol(trickOut.symbol)}${dest}. Leave dust. Agents optional.`,
    };
  }
  const park = tokens.find((t) => t.where === "park_to_near" && t.when.parkEligible);
  if (park) {
    return {
      symbol: park.symbol,
      where: park.where,
      reason: "Wave profit gate clear — cascade park → NEAR. No agent required to know.",
    };
  }
  const enterOrder: TriggerAction[] = [
    "second_wave_reentry",
    "enter_trough",
    "enter_mean_revert",
    "enter_momentum",
    "buy_trough",
  ];
  for (const where of enterOrder) {
    const hit = tokens.find((t) => t.where === where && (t.state === "fired" || t.state === "armed"));
    if (hit) {
      return {
        symbol: hit.symbol,
        where: hit.where,
        reason: `Wave ${where} armed on ${baseSymbol(hit.symbol)}${idleBuyingPower ? " — deploy idle buying power" : ""}. Agents optional.`,
      };
    }
  }
  // Idle buying power: prefer the primed/cascade destination over sitting in cash.
  if (idleBuyingPower && primedSymbol) {
    const primedHit = tokens.find(
      (t) =>
        baseSymbol(t.symbol) === baseSymbol(primedSymbol) &&
        (t.where === "enter_trough" ||
          t.where === "enter_mean_revert" ||
          t.where === "enter_momentum" ||
          t.where === "second_wave_reentry" ||
          t.where === "buy_trough"),
    );
    if (primedHit && (primedHit.state === "fired" || primedHit.state === "armed")) {
      return {
        symbol: primedHit.symbol,
        where: primedHit.where,
        reason: `Idle buying power — cascade into ${baseSymbol(primedHit.symbol)}. Do not sit. Agents optional.`,
      };
    }
  }
  const ride = tokens.find((t) => t.where === "ride_peak");
  if (ride) {
    return {
      symbol: ride.symbol,
      where: ride.where,
      reason: `Ride uphill on ${baseSymbol(ride.symbol)} — peak armed/prox high; exit on stall/RSI/stale profit.`,
    };
  }
  if (!hasWorking) {
    const bank = tokens.find((t) => t.role === "bank" && baseSymbol(t.symbol) === "NEAR");
    if (bank && !idleBuyingPower) {
      return {
        symbol: bank.symbol,
        where: "hold_bank",
        reason: "No live wave entry. Hold NEAR bank. Math stays quiet.",
      };
    }
  }
  return {
    symbol: tokens[0]?.symbol ?? "NONE",
    where: "none",
    reason: idleBuyingPower
      ? "Buying power idle — wait next 15m for volatile cascade destination."
      : "No wave trigger. Wait for next 15m marks.",
  };
}
