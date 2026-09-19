/**
 * AGENTIC_MOVE_EQ — refineable math for where/when to move.
 *
 * Locked to DIVIDEND_15M playbook numbers (Game 2026-09-18).
 * Change knobs here when refining the equation; tricks/gates/triggers read these.
 * Never invent fills or PnL — thresholds only.
 */

import { DIVIDEND_15M, RED_DAY, SURF_ACT } from "./constants.js";
import { quoteSpread, rtSpread } from "./gates.js";
import type { Quote, WhisperCard, WhisperRouteHint } from "./types.js";

/**
 * v4 equation knobs — Wilder RSI rollback + stale-profit cascade (agentless).
 *
 * Locked TP/stop floors stay on DIVIDEND_15M (Game 2026-09-18):
 *   take_profit_pct = max(1.2%, 1.5 × one_way_spread)
 *   stop_pct        = max(2.0%, 2.0 × one_way_spread)
 * live_edge_ok    = edge >= liveEdgeK * RT_spread   (RT = 2× one-way)
 * park_edge_ok    = edge >= parkEdgeK * RT_spread
 * whisper_score   = min(1, sources/minSources * (1-w) + meanConfidence * w)
 * higherPeak      = localHigh × (1 + higherPeakExtension)
 * second_wave     = hardPullback ∧ reclaiming → ride toward higherPeak
 * cascade_exit    = trick_out|crash_start
 *                 ∨ edge ≥ TP
 *                 ∨ (edge ≥ max(micro, liveEdge×RT) ∧ (stale ∨ rsiLeaveOB ∨ failedPeak))
 * cascade_dest    = healthy amp near support (wave low) — not cheapest absolute price
 * rsi             = Wilder(period) on quote.closes; rollingDown = leave overbought
 * credit_discipline: quiet watch = 0 credits; agent step-in only on alert
 */
export const AGENTIC_MOVE_EQ = {
  id: "AGENTIC_MOVE_EQ_v4",
  /** Sleeve take-profit floor (DIVIDEND_15M: 1.2%). */
  takeProfitFloorPct: 0.012,
  /** TP as multiple of one-way spread (DIVIDEND_15M: 1.5×). */
  takeProfitSpreadMultiple: 1.5,
  /** Working stop floor (DIVIDEND_15M: 2%). */
  stopFloorPct: 0.02,
  /** Stop as multiple of one-way spread (DIVIDEND_15M: 2×). */
  stopSpreadMultiple: 2,
  /** Live entry / park edge multiple of RT spread — mirrors DIVIDEND_15M. */
  liveEdgeMultipleOfRt: DIVIDEND_15M.minEdgeMultipleOfRtSpread,
  parkEdgeMultipleOfRt: DIVIDEND_15M.minEdgeMultipleOfRtSpread,
  /** Prefer tighter gates when ranking. */
  preferEdgeMultipleOfRt: DIVIDEND_15M.preferMinEdgeMultipleOfRtSpread,
  preferMaxSpread: DIVIDEND_15M.preferMaxSpread,
  maxSpread: DIVIDEND_15M.maxSpread,
  /** Cascade park destination order (FIL display-only until unlock). */
  cascadeParkOrder: [...SURF_ACT.accumulateOrder] as readonly string[],
  /** Whisper confirmation mix. */
  whisperMinIndependentSources: RED_DAY.minIndependentSources,
  whisperConfidenceWeight: 0.5,
  /** Red-day book legs (shared with RED_DAY). */
  nearVsSessionOpen: RED_DAY.nearVsSessionOpen,
  workingVsCost: RED_DAY.workingVsCost,
  /**
   * Peak / trick-out (uphill ride → exit before first crash).
   * peakProximity = 1 − (localHigh − mark)/localHigh
   * Arm when proximity ≥ peakArmProximity OR trough phase ≥ peakArmPhase.
   * Fire trick-out when armed AND (stall OR pullback ≥ peakPullbackArm),
   * or hard fire when pullback ≥ peakHardPullback (first crash start).
   */
  peakArmProximity: 0.985,
  peakArmPhase: 0.85,
  peakPullbackArm: 0.008,
  peakHardPullback: 0.02,
  /**
   * Second wave: after hard crash, reclaim → ride toward a *higher* peak.
   * higherPeak = localHigh × (1 + higherPeakExtension)
   */
  higherPeakExtension: 0.015,
  secondWavePrimeBoost: 0.35,
  /** Prime / cascade destination score weights. */
  primeClimbWeight: 0.35,
  primeWaveWeight: 0.25,
  primeGateWeight: 0.25,
  primePeakPenalty: 0.5,
  /** Prefer healthy volatile amplitude when cascading into the next seat. */
  primeVolatilityWeight: 1.2,
  /** Prefer names sitting at the wave low (near support) — "lowest promising". */
  primeSupportWeight: 0.45,
  /**
   * Early cascade rotate (DIVIDEND: unrealized ≥ edge → next path).
   * Floor so a tiny print still rotates when stale / RSI / failed peak confirms.
   */
  cascadeMicroProfitPct: 0.003,
  /** Wave amplitude below this + stall ⇒ stale. */
  staleAmplitudeMax: 0.002,
  /** Wilder RSI period (needs period+1 closes). */
  rsiPeriod: 14,
  /** Classic overbought — leave this zone = rollingDown. */
  rsiOverbought: 70,
  /** Elevated RSI with down close + turn = soft rollback confirm. */
  rsiElevated: 55,
  /** Healthy volatile swing for cascade destinations. */
  volatileHealthyMinAmp: 0.008,
  /** (mark − support) / support ≤ this ⇒ near support (wave low). */
  nearSupportMaxPct: 0.025,
  /**
   * Agentic usage credits (communication / ML refinement loop).
   * Deterministic 15m watch burns 0 Cursor credits.
   * Agent/LLM step-in only when WATCH=alert or Game authorizes.
   * On-chain token activity can refine prime weights later (ledger feedback).
   */
  creditsPerQuietWatch: 0,
  creditsPerAlertStepIn: 1,
  creditsPerLivePlaceReview: 1,
} as const;

export type AgenticMoveEq = typeof AGENTIC_MOVE_EQ;

export function takeProfitPct(oneWaySpread: number, eq: AgenticMoveEq = AGENTIC_MOVE_EQ): number {
  if (!(oneWaySpread >= 0) || !Number.isFinite(oneWaySpread)) return eq.takeProfitFloorPct;
  return Math.max(eq.takeProfitFloorPct, eq.takeProfitSpreadMultiple * oneWaySpread);
}

export function stopPct(oneWaySpread: number, eq: AgenticMoveEq = AGENTIC_MOVE_EQ): number {
  if (!(oneWaySpread >= 0) || !Number.isFinite(oneWaySpread)) return eq.stopFloorPct;
  return Math.max(eq.stopFloorPct, eq.stopSpreadMultiple * oneWaySpread);
}

/** Absolute take-profit mark from cost (or entry mark). */
export function takeProfitMark(
  basis: number,
  oneWaySpread: number,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): number {
  return basis * (1 + takeProfitPct(oneWaySpread, eq));
}

/** Absolute stop mark from cost (or entry mark). */
export function stopMark(
  basis: number,
  oneWaySpread: number,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): number {
  return basis * (1 - stopPct(oneWaySpread, eq));
}

export function edgeClearsLive(
  edge: number,
  quote: Quote,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): boolean {
  if (!(edge > 0) || !Number.isFinite(edge)) return false;
  const rt = rtSpread(quote);
  if (!Number.isFinite(rt)) return false;
  return edge + 1e-12 >= eq.liveEdgeMultipleOfRt * rt;
}

export function edgeClearsPark(
  edge: number,
  quote: Quote,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): boolean {
  if (!(edge > 0) || !Number.isFinite(edge)) return false;
  const rt = rtSpread(quote);
  if (!Number.isFinite(rt)) return false;
  return edge + 1e-12 >= eq.parkEdgeMultipleOfRt * rt;
}

export function oneWayFromQuote(quote: Quote): number {
  return quoteSpread(quote);
}

export type WhisperCascadeScore = {
  score: number;
  route: WhisperRouteHint | null;
  sources: string[];
  themeHits: number;
  equation: string;
};

/**
 * Cascade + whisper score for one token.
 * Quarantine cards still contribute (Wild West), expired do not.
 * Route = highest-confidence non-expired card's route_hint for that token.
 */
export function whisperCascadeScore(
  whispers: WhisperCard[],
  symbolBase: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): WhisperCascadeScore {
  const base = symbolBase.replace(/-USD$/i, "").toUpperCase();
  const relevant = whispers.filter(
    (w) =>
      w.status !== "expired" &&
      w.tokens.some((t) => t.replace(/-USD$/i, "").toUpperCase() === base),
  );
  if (relevant.length === 0) {
    return {
      score: 0,
      route: null,
      sources: [],
      themeHits: 0,
      equation: `whisper_score(${base})=0 (no inbox hits)`,
    };
  }

  const sources = [...new Set(relevant.map((w) => w.source.trim().toLowerCase()))];
  const meanConf =
    relevant.reduce((sum, w) => sum + w.confidence, 0) / Math.max(1, relevant.length);
  const w = eq.whisperConfidenceWeight;
  const sourceTerm = Math.min(1, sources.length / eq.whisperMinIndependentSources);
  const score = Math.min(1, sourceTerm * (1 - w) + meanConf * w);

  let best = relevant[0]!;
  for (const card of relevant) {
    if (card.confidence > best.confidence) best = card;
  }

  const equation =
    `whisper_score=${score.toFixed(3)}=min(1, sources/${eq.whisperMinIndependentSources}*${(1 - w).toFixed(2)}` +
    ` + conf*${w.toFixed(2)}) | sources=${sources.length} conf=${meanConf.toFixed(2)} route=${best.route_hint}`;

  return {
    score,
    route: best.route_hint,
    sources,
    themeHits: relevant.length,
    equation,
  };
}

/** Human-readable TP/stop plug-in for MACHINE / TRAIL VIEW. */
export function formatSleeveExitEquation(
  basis: number,
  quote: Quote,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): {
  oneWay: number;
  tpPct: number;
  stopPctValue: number;
  tpMark: number;
  stopMarkValue: number;
  equation: string;
} {
  const oneWay = oneWayFromQuote(quote);
  const tpPct = takeProfitPct(oneWay, eq);
  const stopPctValue = stopPct(oneWay, eq);
  const tpMark = takeProfitMark(basis, oneWay, eq);
  const stopMarkValue = stopMark(basis, oneWay, eq);
  const equation =
    `tp=max(${(eq.takeProfitFloorPct * 100).toFixed(1)}%, ${eq.takeProfitSpreadMultiple}×spread)` +
    `=${(tpPct * 100).toFixed(2)}%→${tpMark.toFixed(6)}; ` +
    `stop=max(${(eq.stopFloorPct * 100).toFixed(1)}%, ${eq.stopSpreadMultiple}×spread)` +
    `=${(stopPctValue * 100).toFixed(2)}%→${stopMarkValue.toFixed(6)}; ` +
    `spread=${(oneWay * 100).toFixed(3)}% basis=${basis.toFixed(6)}`;
  return { oneWay, tpPct, stopPctValue, tpMark, stopMarkValue, equation };
}
