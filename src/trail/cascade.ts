/**
 * Profit cascade — agentless, locked to DIVIDEND_15M + peak + Wilder RSI.
 *
 * Exit (do not sit / do not ride back down):
 *   1. Classic peak trick_out | crash_start
 *   2. Full sleeve TP: edge ≥ max(1.2%, 1.5× one-way spread)
 *   3. Early cascade: edge ≥ max(micro, liveEdge×RT) AND
 *        (stale wave | RSI left overbought | failed peak break with stall)
 *
 * Failed peak break = waveform showed the top (armed) but mark did not break
 * past localHigh, then stall/pullback — expect drop toward the support line
 * already on the tape (trough / session open).
 *
 * Destination ("lowest promising"):
 *   Near the wave's low (support), with healthy volatile amplitude —
 *   NOT "cheapest absolute price".
 *
 * Never invents marks, fills, or PnL. Never places.
 */

import { AGENTIC_MOVE_EQ, takeProfitPct, type AgenticMoveEq } from "./equation.js";
import {
  baseSymbol,
  findQuote,
  findSleeve,
  isBankSymbol,
  isFilDisplayOnly,
  liveMicroBuyingPowerOk,
  maxTakeWithoutFlatten,
  quoteSpread,
  rtSpread,
  workingSeats,
} from "./gates.js";
import { peakOf, type PeakState } from "./peak.js";
import { tapeRsiOf, type WilderRsiState } from "./rsi.js";
import { waveOf, type WaveState } from "./wave.js";
import type { PortfolioSnapshot, Quote, Sleeve, TroughWindow } from "./types.js";

export type CascadeExitState = {
  symbol: string;
  fire: boolean;
  edge: number | null;
  fullTakeProfit: boolean;
  earlyCascade: boolean;
  staleWave: boolean;
  failedPeakBreak: boolean;
  rsiRollingDown: boolean;
  peakTopShown: boolean;
  supportMark: number | null;
  peak: PeakState | null;
  wave: WaveState | null;
  rsi: WilderRsiState | null;
  equation: string;
};

export type CascadeDestination = {
  symbol: string;
  score: number;
  mark: number;
  amplitude: number;
  volatileHealthy: boolean;
  nearSupport: boolean;
  supportMark: number | null;
  equation: string;
};

/**
 * Support line already shown on the wave form.
 * Prefer swing trough; else session open. Do not invent; do not use mid-range as support.
 */
export function supportMarkOf(quote: Quote, trough?: TroughWindow): number | null {
  if (trough && trough.troughMark > 0 && Number.isFinite(trough.troughMark)) {
    return trough.troughMark;
  }
  if (quote.sessionOpen !== undefined && quote.sessionOpen > 0) {
    return quote.sessionOpen;
  }
  return null;
}

function sleeveEdge(sleeve: Sleeve, quote: Quote): number | null {
  const cost = sleeve.costBasisUsd;
  const mark = sleeve.markUsd ?? quote.mark;
  if (cost === undefined || !(cost > 0) || !(mark > 0)) return null;
  return (mark - cost) / cost;
}

/** Stale = flat/fade tape, or armed ride that lost amplitude and stalled. */
function isStaleWave(wave: WaveState | null, peak: PeakState | null, eq: AgenticMoveEq): boolean {
  if (wave?.kind === "flat" || wave?.kind === "fade") return true;
  if (
    wave !== null &&
    wave.amplitude + 1e-12 < eq.staleAmplitudeMax &&
    peak?.stall === true
  ) {
    return true;
  }
  return false;
}

/**
 * Failed break past peak: top was shown (armed / high proximity), mark stayed
 * below localHigh, then stall or pullback arms — drop toward support is expected.
 * Matches peak trick_out geometry; does not fire on peak_armed alone while still climbing.
 */
function failedPeakBreak(peak: PeakState | null, eq: AgenticMoveEq): boolean {
  if (!peak) return false;
  if (peak.mode === "trick_out") return true;
  if (peak.mode === "crash_start") return true;

  const topShown =
    peak.mode === "peak_armed" ||
    (peak.proximity + 1e-12 >= eq.peakArmProximity &&
      (peak.mode === "ride" || peak.mode === "climb"));
  if (!topShown) return false;

  const noBreak = peak.mark + 1e-12 < peak.localHigh;
  const rejected =
    peak.stall || peak.pullback + 1e-12 >= eq.peakPullbackArm;
  return noBreak && rejected;
}

/**
 * Working-seat cascade exit. Agents optional.
 */
export function cascadeExitOf(
  snapshot: PortfolioSnapshot,
  symbol: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): CascadeExitState | null {
  const quote = findQuote(snapshot, symbol);
  if (!quote || !(quote.mark > 0)) return null;

  const sleeve = findSleeve(snapshot, symbol, "working") ?? findSleeve(snapshot, symbol);
  const trough = snapshot.troughs.find((t) => baseSymbol(t.symbol) === baseSymbol(symbol));
  const peak = peakOf(snapshot, symbol, eq);
  const wave = waveOf(snapshot, symbol, eq);
  const rsi = tapeRsiOf(snapshot, symbol, eq);
  const support = supportMarkOf(quote, trough);
  const edge = sleeve ? sleeveEdge(sleeve, quote) : null;
  const oneWay = quoteSpread(quote);
  const tp = takeProfitPct(oneWay, eq);
  const rt = rtSpread(quote);
  const minEarly =
    Number.isFinite(rt) && rt > 0
      ? Math.max(eq.cascadeMicroProfitPct, eq.liveEdgeMultipleOfRt * rt)
      : eq.cascadeMicroProfitPct;

  const fullTakeProfit = edge !== null && edge + 1e-12 >= tp;
  const staleWave = isStaleWave(wave, peak, eq);
  const failed = failedPeakBreak(peak, eq);
  const rsiRollingDown = rsi?.rollingDown === true;
  const peakTopShown =
    peak?.mode === "peak_armed" ||
    peak?.mode === "trick_out" ||
    (peak !== null && peak.proximity + 1e-12 >= eq.peakArmProximity);

  const classicPeak = peak?.mode === "trick_out" || peak?.mode === "crash_start";

  // Early cascade: enough edge to clear RT/micro AND a real top/stale/RSI signal.
  // Does NOT fire on peak_armed + tiny profit alone (still riding).
  // Does NOT fire on full TP alone — that is park_to_near / sleeve TP (DIVIDEND).
  const signal = staleWave || rsiRollingDown || failed;
  const earlyCascade =
    edge !== null && edge + 1e-12 >= minEarly && edge > 0 && signal;

  const fire = classicPeak || earlyCascade;

  const equation =
    `cascade_exit=${baseSymbol(quote.symbol)} fire=${fire} ` +
    `edge=${edge === null ? "n/a" : `${(edge * 100).toFixed(3)}%`} ` +
    `tp=${(tp * 100).toFixed(2)}% earlyMin=${(minEarly * 100).toFixed(3)}% ` +
    `fullTP=${fullTakeProfit} early=${earlyCascade} stale=${staleWave} ` +
    `failedPeak=${failed} rsiDown=${rsiRollingDown} peakTop=${peakTopShown} ` +
    `support=${support === null ? "n/a" : support.toFixed(6)} ` +
    `peakMode=${peak?.mode ?? "n/a"} wave=${wave?.kind ?? "none"}`;

  return {
    symbol: quote.symbol,
    fire,
    edge,
    fullTakeProfit,
    earlyCascade,
    staleWave,
    failedPeakBreak: failed,
    rsiRollingDown,
    peakTopShown,
    supportMark: support,
    peak,
    wave,
    rsi,
    equation,
  };
}

export function workingCascadeExits(
  snapshot: PortfolioSnapshot,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): CascadeExitState[] {
  const out: CascadeExitState[] = [];
  for (const sleeve of workingSeats(snapshot)) {
    if (!(maxTakeWithoutFlatten(sleeve) > 0)) continue;
    const exit = cascadeExitOf(snapshot, sleeve.symbol, eq);
    if (exit) out.push(exit);
  }
  return out;
}

/**
 * Rank cascade destinations: healthy volatile amplitude at the wave's low
 * (near support) — "lowest promising", not lowest absolute coin price.
 */
export function rankCascadeDestinations(
  snapshot: PortfolioSnapshot,
  opts?: {
    excludeBases?: string[];
    includeBanks?: boolean;
    eq?: AgenticMoveEq;
  },
): CascadeDestination[] {
  const eq = opts?.eq ?? AGENTIC_MOVE_EQ;
  const exclude = new Set((opts?.excludeBases ?? []).map((s) => baseSymbol(s)));
  const includeBanks = opts?.includeBanks === true;

  const bases = new Set<string>();
  for (const q of snapshot.quotes) bases.add(baseSymbol(q.symbol));

  const scored: CascadeDestination[] = [];
  for (const base of bases) {
    if (exclude.has(base)) continue;
    if (isFilDisplayOnly(base)) continue;
    if (!includeBanks && isBankSymbol(base)) continue;

    const quote = findQuote(snapshot, base);
    if (!quote || !(quote.mark > 0)) continue;

    const trough = snapshot.troughs.find((t) => baseSymbol(t.symbol) === base);
    const wave = waveOf(snapshot, base, eq);
    const peak = peakOf(snapshot, base, eq);
    const support = supportMarkOf(quote, trough);
    const spread = quoteSpread(quote);
    const rsi = tapeRsiOf(snapshot, base, eq);

    const amp = wave?.amplitude ?? 0;
    const volatileHealthy =
      amp + 1e-12 >= eq.volatileHealthyMinAmp &&
      (wave?.kind === "trough_reclaim" ||
        wave?.kind === "momentum_up" ||
        wave?.kind === "mean_revert_dip") &&
      wave.spreadOk;

    // Never cascade into a topping / crashing name.
    if (peak?.mode === "peak_armed" || peak?.mode === "trick_out" || peak?.mode === "crash_start") {
      continue;
    }
    if (rsi?.rollingDown === true) continue;

    const nearSupport =
      support !== null &&
      support > 0 &&
      quote.mark + 1e-12 >= support &&
      (quote.mark - support) / support <= eq.nearSupportMaxPct;

    // Distance below recent high / above support — prefer sitting at the low.
    let lowOfWave = 0;
    if (nearSupport) {
      lowOfWave = eq.primeSupportWeight;
    } else if (support !== null && support > 0 && quote.mark > support) {
      const height = (quote.mark - support) / support;
      lowOfWave = Math.max(0, eq.primeSupportWeight * (1 - height / 0.08));
    }

    const volTerm = volatileHealthy ? amp * eq.primeVolatilityWeight : amp * 0.1;
    const gateTerm = (wave?.spreadOk ? 0.4 : 0) + (wave?.edgeClears ? 0.4 : 0);
    const secondBoost = peak?.mode === "second_wave" ? eq.secondWavePrimeBoost : 0;
    const spreadPenalty = spread > eq.maxSpread ? 0.5 : 0;
    // Prefer trough_reclaim / mean_revert at the low over chasing momentum_up.
    const kindBoost =
      wave?.kind === "trough_reclaim" || wave?.kind === "mean_revert_dip" ? 0.2 : 0;

    const score = volTerm + gateTerm + lowOfWave + secondBoost + kindBoost - spreadPenalty;

    const equation =
      `cascade_dest=${base} score=${score.toFixed(4)} mark=${quote.mark.toFixed(6)} ` +
      `amp=${(amp * 100).toFixed(2)}% healthy=${volatileHealthy} nearSupport=${nearSupport} ` +
      `support=${support === null ? "n/a" : support.toFixed(6)} ` +
      `wave=${wave?.kind ?? "none"} peak=${peak?.mode ?? "n/a"}`;

    scored.push({
      symbol: quote.symbol,
      score,
      mark: quote.mark,
      amplitude: amp,
      volatileHealthy,
      nearSupport,
      supportMark: support,
      equation,
    });
  }

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: closer to support (lower on the wave), then tighter spread via mark stability.
    const aDist =
      a.supportMark && a.supportMark > 0 ? (a.mark - a.supportMark) / a.supportMark : 99;
    const bDist =
      b.supportMark && b.supportMark > 0 ? (b.mark - b.supportMark) / b.supportMark : 99;
    return aDist - bDist;
  });
}

export function topCascadeDestination(
  snapshot: PortfolioSnapshot,
  opts?: { excludeBases?: string[]; includeBanks?: boolean; eq?: AgenticMoveEq },
): CascadeDestination | null {
  const ranked = rankCascadeDestinations(snapshot, opts);
  const top = ranked.find((c) => c.score > 0 && c.volatileHealthy);
  if (top) return top;
  const any = ranked[0];
  if (!any || !(any.score > 0)) return null;
  return any;
}

/** Idle buying power that can fund the next cascade micro (≥ $2). */
export function idleBuyingPowerPressure(snapshot: PortfolioSnapshot): boolean {
  return liveMicroBuyingPowerOk(snapshot) && snapshot.buyingPowerUsd !== undefined;
}
