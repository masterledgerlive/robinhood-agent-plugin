/**
 * Peak / first-crash / second-wave geometry — pure tape.
 *
 * Wave 1: climb → ride → peak_armed → trick_out → crash_start
 * Wave 2: after hard pullback, if reclaiming → second_wave → ride toward higherPeak
 * Never invent sessionHigh / marks. Agents optional.
 */

import { AGENTIC_MOVE_EQ, type AgenticMoveEq } from "./equation.js";
import { baseSymbol, findQuote, maxTakeWithoutFlatten, workingSeats } from "./gates.js";
import type { PortfolioSnapshot, Quote, TroughWindow } from "./types.js";

export type PeakMode =
  | "climb"
  | "ride"
  | "peak_armed"
  | "trick_out"
  | "crash_start"
  | "second_wave"
  | "unknown";

export type PeakState = {
  symbol: string;
  mode: PeakMode;
  localHigh: number;
  /** Target for second-wave ride: localHigh × (1 + higherPeakExtension). */
  higherPeak: number;
  mark: number;
  /** 1 = sitting on local high; 0 = deep drawdown. */
  proximity: number;
  /** (localHigh − mark) / localHigh */
  pullback: number;
  /** (mark − sessionOpen) / sessionOpen when open known. */
  climbFromOpen: number | null;
  phase: number | null;
  stall: boolean;
  /** True when tape is reclaiming after a hard pullback. */
  reclaiming: boolean;
  equation: string;
};

function localHighOf(quote: Quote, trough?: TroughWindow): number | null {
  const candidates: number[] = [quote.mark];
  if (quote.sessionHigh !== undefined && quote.sessionHigh > 0) candidates.push(quote.sessionHigh);
  if (quote.priorMark !== undefined && quote.priorMark > 0) candidates.push(quote.priorMark);
  if (trough?.recentHigh !== undefined && trough.recentHigh > 0) candidates.push(trough.recentHigh);
  const high = Math.max(...candidates);
  return high > 0 && Number.isFinite(high) ? high : null;
}

function isReclaiming(quote: Quote, trough?: TroughWindow): boolean {
  if (quote.mark15m !== undefined && Number.isFinite(quote.mark15m) && quote.mark15m > quote.mark) {
    return true;
  }
  if (quote.priorMark !== undefined && quote.mark > quote.priorMark) return true;
  if (trough && quote.mark > trough.troughMark) {
    if (trough.recentHigh !== undefined && trough.recentHigh > trough.troughMark) {
      const phase = (quote.mark - trough.troughMark) / (trough.recentHigh - trough.troughMark);
      // Early second-wave reclaim: off trough, still below prior high.
      return phase > 0 && phase < 1;
    }
    return true;
  }
  return false;
}

/**
 * Score one token on wave-1 peak path or wave-2 higher-peak reclaim.
 */
export function peakOf(
  snapshot: PortfolioSnapshot,
  symbol: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): PeakState | null {
  const quote = findQuote(snapshot, symbol);
  if (!quote || !(quote.mark > 0)) return null;

  const trough = snapshot.troughs.find((t) => baseSymbol(t.symbol) === baseSymbol(symbol));
  const high = localHighOf(quote, trough);
  if (high === null) return null;

  const pullback = (high - quote.mark) / high;
  const proximity = 1 - pullback;
  const climbFromOpen =
    quote.sessionOpen !== undefined && quote.sessionOpen > 0
      ? (quote.mark - quote.sessionOpen) / quote.sessionOpen
      : null;

  let phase: number | null = null;
  if (trough?.recentHigh !== undefined && trough.recentHigh > trough.troughMark) {
    phase = Math.min(
      1,
      Math.max(0, (quote.mark - trough.troughMark) / (trough.recentHigh - trough.troughMark)),
    );
  }

  const stallFrom15 =
    quote.mark15m !== undefined && Number.isFinite(quote.mark15m) && quote.mark15m <= quote.mark;
  const stallFromPrior =
    climbFromOpen !== null &&
    climbFromOpen > 0 &&
    quote.priorMark !== undefined &&
    quote.mark + 1e-12 < quote.priorMark;
  const stall = stallFrom15 || stallFromPrior;
  const reclaiming = isReclaiming(quote, trough);

  const armed =
    proximity + 1e-12 >= eq.peakArmProximity ||
    (phase !== null && phase + 1e-12 >= eq.peakArmPhase);

  const higherPeak = high * (1 + eq.higherPeakExtension);

  /**
   * Hard crash needs a real session/prior peak — not “distance below trough.recentHigh”
   * while we are still mid trough-bounce (that is wave-1 ride, not crash).
   */
  const sessionPeak = quote.sessionHigh !== undefined && quote.sessionHigh > 0 ? quote.sessionHigh : null;
  const sessionPullback =
    sessionPeak !== null ? (sessionPeak - quote.mark) / sessionPeak : null;
  const inActiveBounce = phase !== null && phase > 0 && phase < 1;
  const hardCrash =
    (sessionPullback !== null && sessionPullback + 1e-12 >= eq.peakHardPullback) ||
    (!inActiveBounce && pullback + 1e-12 >= eq.peakHardPullback);

  let mode: PeakMode = "unknown";
  if (hardCrash) {
    mode = reclaiming ? "second_wave" : "crash_start";
  } else if (armed && (stall || pullback + 1e-12 >= eq.peakPullbackArm)) {
    mode = "trick_out";
  } else if (armed) {
    mode = "peak_armed";
  } else if (climbFromOpen !== null && climbFromOpen > 0) {
    mode = proximity >= 0.7 ? "ride" : "climb";
  } else if (inActiveBounce && reclaiming) {
    mode = "climb";
  } else if (climbFromOpen !== null && climbFromOpen <= 0) {
    mode = pullback > eq.peakPullbackArm ? (reclaiming ? "second_wave" : "crash_start") : "unknown";
  } else if (proximity >= 0.7) {
    mode = "ride";
  }

  const equation =
    `peak=${baseSymbol(quote.symbol)} mode=${mode} prox=${proximity.toFixed(4)} ` +
    `pullback=${(pullback * 100).toFixed(3)}% high=${high.toFixed(6)} higherPeak=${higherPeak.toFixed(6)} ` +
    `mark=${quote.mark.toFixed(6)} reclaim=${reclaiming} stall=${stall} ` +
    `climbOpen=${climbFromOpen === null ? "n/a" : `${(climbFromOpen * 100).toFixed(3)}%`}`;

  return {
    symbol: quote.symbol,
    mode,
    localHigh: high,
    higherPeak,
    mark: quote.mark,
    proximity,
    pullback,
    climbFromOpen,
    phase,
    stall,
    reclaiming,
    equation,
  };
}

/** Absolute peak mark estimate (local high / wave-1 peak). */
export function absolutePeakMark(
  snapshot: PortfolioSnapshot,
  symbol: string,
): number | null {
  return peakOf(snapshot, symbol)?.localHigh ?? null;
}

/** Second-wave target above the prior absolute peak. */
export function higherPeakMark(
  snapshot: PortfolioSnapshot,
  symbol: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): number | null {
  return peakOf(snapshot, symbol, eq)?.higherPeak ?? null;
}

/** Pullback alert threshold: localHigh × (1 − peakPullbackArm). */
export function peakPullbackAlertMark(
  snapshot: PortfolioSnapshot,
  symbol: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): number | null {
  const peak = peakOf(snapshot, symbol, eq);
  if (!peak) return null;
  return peak.localHigh * (1 - eq.peakPullbackArm);
}

export function workingPeaks(
  snapshot: PortfolioSnapshot,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): PeakState[] {
  const out: PeakState[] = [];
  for (const sleeve of workingSeats(snapshot)) {
    if (!(maxTakeWithoutFlatten(sleeve) > 0)) continue;
    const peak = peakOf(snapshot, sleeve.symbol, eq);
    if (peak) out.push(peak);
  }
  return out;
}
