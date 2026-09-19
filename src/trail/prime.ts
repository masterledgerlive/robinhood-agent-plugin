/**
 * Prime-token ranking — where to rotate after a peak trick-out,
 * and which names are primed for second-wave reclaim → higher peak.
 *
 * Pure wave + climb + gate math. Prefer tokens still climbing or in
 * second_wave reclaim. Banks stay banks (NEAR savings).
 */

import { AGENTIC_MOVE_EQ, type AgenticMoveEq } from "./equation.js";
import { baseSymbol, findQuote, isBankSymbol, isFilDisplayOnly, quoteSpread } from "./gates.js";
import { peakOf, type PeakState } from "./peak.js";
import { waveOf, type WaveState } from "./wave.js";
import type { PortfolioSnapshot } from "./types.js";

export type PrimeCandidate = {
  symbol: string;
  score: number;
  wave: WaveState | null;
  peak: PeakState | null;
  climbFromOpen: number | null;
  spread: number;
  equation: string;
};

function climbOf(snapshot: PortfolioSnapshot, symbol: string): number | null {
  const quote = findQuote(snapshot, symbol);
  if (!quote?.sessionOpen || !(quote.sessionOpen > 0) || !(quote.mark > 0)) return null;
  return (quote.mark - quote.sessionOpen) / quote.sessionOpen;
}

/**
 * Rank primed destinations for the next rotate / second-wave seat.
 * Excludes FIL display-only and optional excludeBases (e.g. the seat we just exited).
 */
export function rankPrimedTokens(
  snapshot: PortfolioSnapshot,
  opts?: {
    excludeBases?: string[];
    includeBanks?: boolean;
    eq?: AgenticMoveEq;
  },
): PrimeCandidate[] {
  const eq = opts?.eq ?? AGENTIC_MOVE_EQ;
  const exclude = new Set((opts?.excludeBases ?? []).map((s) => baseSymbol(s)));
  const includeBanks = opts?.includeBanks === true;

  const bases = new Set<string>();
  for (const q of snapshot.quotes) bases.add(baseSymbol(q.symbol));

  const out: PrimeCandidate[] = [];
  for (const base of bases) {
    if (exclude.has(base)) continue;
    if (isFilDisplayOnly(base)) continue;
    if (!includeBanks && isBankSymbol(base)) continue;

    const quote = findQuote(snapshot, base);
    if (!quote) continue;

    const wave = waveOf(snapshot, base, eq);
    const peak = peakOf(snapshot, base, eq);
    const climb = climbOf(snapshot, base);
    const spread = quoteSpread(quote);

    const climbTerm = climb !== null && climb > 0 ? climb : 0;
    const waveTerm =
      wave && (wave.kind === "momentum_up" || wave.kind === "trough_reclaim" || wave.kind === "mean_revert_dip")
        ? wave.amplitude * (wave.edgeClears ? 1.2 : 0.6) * (wave.spreadOk ? 1 : 0.4)
        : 0;
    const gateTerm = (wave?.spreadOk ? 0.5 : 0) + (wave?.edgeClears ? 0.5 : 0);

    // Penalize only wave-1 peak/trick-out (do not sit in a topping name).
    // Boost second_wave reclaim — that is the post-crash ride to higherPeak.
    let peakPenalty = 0;
    let secondBoost = 0;
    if (peak?.mode === "peak_armed" || peak?.mode === "trick_out") {
      peakPenalty = peak.proximity * eq.primePeakPenalty;
    } else if (peak?.mode === "crash_start") {
      peakPenalty = 0.25 * eq.primePeakPenalty;
    } else if (peak?.mode === "second_wave") {
      secondBoost = eq.secondWavePrimeBoost;
    }

    const score =
      eq.primeClimbWeight * climbTerm +
      eq.primeWaveWeight * waveTerm +
      eq.primeGateWeight * gateTerm +
      secondBoost -
      peakPenalty;

    const equation =
      `prime=${base} score=${score.toFixed(4)} ` +
      `climb=${climb === null ? "n/a" : `${(climb * 100).toFixed(3)}%`} ` +
      `wave=${wave?.kind ?? "none"}@${wave ? (wave.amplitude * 100).toFixed(2) : "0"}% ` +
      `peakMode=${peak?.mode ?? "n/a"} higherPeak=${peak ? peak.higherPeak.toFixed(6) : "n/a"} ` +
      `spread=${(spread * 100).toFixed(3)}%`;

    out.push({
      symbol: quote.symbol,
      score,
      wave,
      peak,
      climbFromOpen: climb,
      spread,
      equation,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Best primed destination, or null if none score positive. */
export function topPrimedToken(
  snapshot: PortfolioSnapshot,
  opts?: { excludeBases?: string[]; includeBanks?: boolean; eq?: AgenticMoveEq },
): PrimeCandidate | null {
  const ranked = rankPrimedTokens(snapshot, opts);
  const top = ranked[0];
  if (!top || !(top.score > 0)) return null;
  return top;
}
