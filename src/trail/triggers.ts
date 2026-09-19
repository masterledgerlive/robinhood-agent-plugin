/**
 * Per-token automatic triggers from wave math (+ optional whisper overlay).
 *
 * Agents are optional. Cron / watch:15m arms every token from the tape.
 * When Cursor/desk bots do not respond, triggers still print WHERE/WHEN
 * from AGENTIC_MOVE_EQ + wave functions. Never places. Never invents marks.
 */

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
  isBankSymbol,
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
  return specs;
}

function whereFromWave(
  wave: WaveState | null,
  role: TriggerRole,
  cascadeRoute: string | null,
  redDayActive: boolean,
): TriggerAction {
  if (redDayActive && role === "working") return "exit_to_dust";
  if (cascadeRoute === "exit_working" && role === "working") return "exit_to_dust";
  if (cascadeRoute === "buy_trough" && (role === "candidate" || role === "whisper")) {
    return "buy_trough";
  }
  if (cascadeRoute === "hold_banks" && role === "bank") return "hold_bank";
  if (role === "bank") return "hold_bank";
  if (role === "dust") return "hold_dust";
  if (!wave) return "none";
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

  if (redDay?.active) {
    equation += "; RED_DAY — prefer exit_to_dust (leave dust)";
    armed = true;
    if (take > 0) fired = true;
  }

  const where = parkEligible
    ? "park_to_near"
    : whereFromWave(wave, "working", cascade.route, redDay?.active === true);

  const trigger: TokenTrigger = {
    symbol: sleeve.symbol,
    role: "working",
    state: stateOf({ fired, armed, blocked }),
    where: blocked ? "none" : where,
    when: {
      ...(tpMark !== undefined ? { takeProfitMark: tpMark } : {}),
      ...(stopMarkValue !== undefined ? { stopMark: stopMarkValue } : {}),
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
    brokerAlerts: brokerSpecs(sleeve.symbol, tpMark, stopMarkValue),
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
  const armed =
    !blocked &&
    ((wave?.edgeClears === true && wave.spreadOk) ||
      liveHit !== undefined ||
      (cascade.route === "buy_trough" && cascade.score >= 0.5));
  const fired = liveHit !== undefined || (wave?.kind === "trough_reclaim" && wave.edgeClears && wave.spreadOk);
  const where = whereFromWave(wave, role, cascade.route, redDay?.active === true);

  let equation = wave?.equation ?? `candidate ${baseSymbol(symbol)}: no wave geometry`;
  if (reclaim !== undefined) {
    equation += `; trough_reclaim>${reclaim.toFixed(6)}`;
  }
  if (liveHit) equation += `; live_trick=${liveHit.trick_id}`;

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

  const actionable = tokens.filter((t) => t.state === "fired" || (t.state === "armed" && t.where !== "hold_bank" && t.where !== "hold_dust" && t.where !== "none"));
  const next = pickWaveNext(tokens, workingSeats(snapshot).length > 0, redDay?.active === true);

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
  redDayActive: boolean,
): TokenTriggerPlan["next"] {
  if (redDayActive) {
    const exit = tokens.find((t) => t.where === "exit_to_dust" && t.role === "working");
    if (exit) {
      return {
        symbol: exit.symbol,
        where: exit.where,
        reason: "Wave/RED_DAY: sleeve working to dust (leave dust). No agent required.",
      };
    }
  }
  const park = tokens.find((t) => t.where === "park_to_near" && t.when.parkEligible);
  if (park) {
    return {
      symbol: park.symbol,
      where: park.where,
      reason: "Wave profit gate clear — cascade park → NEAR. No agent required to know.",
    };
  }
  const enterOrder: TriggerAction[] = ["enter_trough", "enter_mean_revert", "enter_momentum", "buy_trough"];
  for (const where of enterOrder) {
    const hit = tokens.find((t) => t.where === where && (t.state === "fired" || t.state === "armed"));
    if (hit) {
      return {
        symbol: hit.symbol,
        where: hit.where,
        reason: `Wave ${where} armed on ${baseSymbol(hit.symbol)}. Agents optional.`,
      };
    }
  }
  if (!hasWorking) {
    const bank = tokens.find((t) => t.role === "bank" && baseSymbol(t.symbol) === "NEAR");
    if (bank) {
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
    reason: "No wave trigger. Wait for next 15m marks.",
  };
}
