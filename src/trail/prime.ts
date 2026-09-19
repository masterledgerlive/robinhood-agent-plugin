/**
 * Prime-token ranking — where to rotate after a peak / stale-profit cascade,
 * and which names are primed for second-wave reclaim → higher peak.
 *
 * Pure wave + climb + gate + volatility math. Prefer lowest promising
 * volatile tokens with healthy amplitude (cascade). Banks stay banks.
 * Optional ledger brain: penalize high remembered mean RT (transmission cost).
 */

import { meanRtBySymbol } from "./brain.js";
import { rankCascadeDestinations } from "./cascade.js";
import { AGENTIC_MOVE_EQ, type AgenticMoveEq } from "./equation.js";
import { baseSymbol, findQuote, isBankSymbol, isFilDisplayOnly, quoteSpread } from "./gates.js";
import type { SuccessLedger } from "./ledger.js";
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
 * Rank primed destinations for the next rotate / second-wave / cascade seat.
 * Excludes FIL display-only and optional excludeBases (e.g. the seat we just exited).
 * Blends climb/wave gates with cascade "lowest promising volatile" preference.
 * Optional ledger brain: penalize names with high remembered mean RT (tx cost).
 */
export function rankPrimedTokens(
  snapshot: PortfolioSnapshot,
  opts?: {
    excludeBases?: string[];
    includeBanks?: boolean;
    eq?: AgenticMoveEq;
    ledger?: SuccessLedger;
  },
): PrimeCandidate[] {
  const eq = opts?.eq ?? AGENTIC_MOVE_EQ;
  const exclude = new Set((opts?.excludeBases ?? []).map((s) => baseSymbol(s)));
  const includeBanks = opts?.includeBanks === true;
  const rememberedRt = opts?.ledger ? meanRtBySymbol(opts.ledger) : new Map<string, number>();

  const cascadeBoost = new Map(
    rankCascadeDestinations(snapshot, opts).map((c) => [baseSymbol(c.symbol), c]),
  );

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
    const cascade = cascadeBoost.get(base);

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

    const cascadeTerm = cascade && cascade.score > 0 ? cascade.score * 0.55 : 0;

    // Brain tx-cost memory: names with wide remembered RT pay a prime penalty.
    const memRt = rememberedRt.get(base);
    const txPenalty =
      memRt !== undefined && memRt > eq.preferMaxSpread * 2
        ? Math.min(0.35, (memRt - eq.preferMaxSpread * 2) * 8)
        : 0;

    const score =
      eq.primeClimbWeight * climbTerm +
      eq.primeWaveWeight * waveTerm +
      eq.primeGateWeight * gateTerm +
      cascadeTerm +
      secondBoost -
      peakPenalty -
      txPenalty;

    const equation =
      `prime=${base} score=${score.toFixed(4)} ` +
      `climb=${climb === null ? "n/a" : `${(climb * 100).toFixed(3)}%`} ` +
      `wave=${wave?.kind ?? "none"}@${wave ? (wave.amplitude * 100).toFixed(2) : "0"}% ` +
      `peakMode=${peak?.mode ?? "n/a"} higherPeak=${peak ? peak.higherPeak.toFixed(6) : "n/a"} ` +
      `cascade=${cascade ? cascade.score.toFixed(4) : "0"} ` +
      `spread=${(spread * 100).toFixed(3)}%` +
      (memRt !== undefined ? ` memRT=${(memRt * 100).toFixed(3)}% txPen=${txPenalty.toFixed(3)}` : "");

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

  return out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.spread - b.spread;
  });
}

/** Best primed destination, or null if none score positive. */
export function topPrimedToken(
  snapshot: PortfolioSnapshot,
  opts?: {
    excludeBases?: string[];
    includeBanks?: boolean;
    eq?: AgenticMoveEq;
    ledger?: SuccessLedger;
  },
): PrimeCandidate | null {
  const ranked = rankPrimedTokens(snapshot, opts);
  const top = ranked[0];
  if (!top || !(top.score > 0)) return null;
  return top;
}
