/**
 * Green-only shelter — lesson 2026-09-19.
 * When the book goes broad-red, park into names still green vs session open
 * until bottoms form, then re-enter without agents. Math only; never places.
 */

import { DIVIDEND_15M, RED_DAY } from "./constants.js";
import {
  baseSymbol,
  findQuote,
  isBankSymbol,
  isFilDisplayOnly,
  quoteSpread,
} from "./gates.js";
import { surfUniverseQuotes } from "./surf-learn.js";
import type { PortfolioSnapshot, Quote } from "./types.js";

export type GreenOnlyCandidate = {
  symbol: string;
  climbFromOpen: number;
  spread: number;
  reason: string;
};

/** (mark − sessionOpen) / sessionOpen when open known. null if missing. */
export function climbFromSessionOpen(quote: Quote): number | null {
  if (!(quote.sessionOpen !== undefined && quote.sessionOpen > 0 && quote.mark > 0)) return null;
  return (quote.mark - quote.sessionOpen) / quote.sessionOpen;
}

/** Still green vs session open (not inventing when open unknown). */
export function isGreenVsOpen(quote: Quote): boolean {
  const climb = climbFromSessionOpen(quote);
  return climb !== null && climb >= RED_DAY.greenMinClimbFromOpen - 1e-12;
}

/** Red vs session open. */
export function isRedVsOpen(quote: Quote): boolean {
  const climb = climbFromSessionOpen(quote);
  return climb !== null && climb < 0;
}

/**
 * Fraction of quoted SURF universe that is red vs session open.
 * Names without sessionOpen are skipped (not invented).
 */
export function redVsOpenFraction(snapshot: PortfolioSnapshot): {
  red: number;
  scored: number;
  fraction: number | null;
} {
  let red = 0;
  let scored = 0;
  for (const quote of surfUniverseQuotes(snapshot)) {
    const climb = climbFromSessionOpen(quote);
    if (climb === null) continue;
    scored += 1;
    if (climb < 0) red += 1;
  }
  return {
    red,
    scored,
    fraction: scored >= 2 ? red / scored : null,
  };
}

/** True when a clear majority of scored names are red vs open. */
export function everythingGoingRed(snapshot: PortfolioSnapshot): boolean {
  const { fraction, scored } = redVsOpenFraction(snapshot);
  if (fraction === null || scored < RED_DAY.minTapeScored) return false;
  return fraction + 1e-12 >= RED_DAY.everythingRedFraction;
}

/**
 * Rank tokens still green vs open while the book is red.
 * Banks stay banks (NEAR hold); FIL display-only excluded.
 * Spread must clear DIVIDEND hard gate to be a live park candidate.
 */
export function rankGreenOnly(
  snapshot: PortfolioSnapshot,
  opts?: { excludeBases?: string[]; includeBanks?: boolean },
): GreenOnlyCandidate[] {
  const exclude = new Set((opts?.excludeBases ?? []).map((s) => baseSymbol(s)));
  const includeBanks = opts?.includeBanks === true;
  const out: GreenOnlyCandidate[] = [];

  for (const quote of snapshot.quotes) {
    const base = baseSymbol(quote.symbol);
    if (exclude.has(base)) continue;
    if (isFilDisplayOnly(base)) continue;
    if (!includeBanks && isBankSymbol(base)) continue;
    if (!isGreenVsOpen(quote)) continue;

    const climb = climbFromSessionOpen(quote);
    if (climb === null) continue;
    const spread = quoteSpread(quote);
    const spreadOk = spread <= DIVIDEND_15M.maxSpread + 1e-12;
    out.push({
      symbol: quote.symbol,
      climbFromOpen: climb,
      spread,
      reason: spreadOk
        ? `green-only shelter ${(climb * 100).toFixed(2)}% vs open (spread OK; no place)`
        : `green vs open but spread ${(spread * 100).toFixed(2)}% > ${DIVIDEND_15M.maxSpread * 100}% — staged only`,
    });
  }

  return out.sort((a, b) => b.climbFromOpen - a.climbFromOpen);
}

/** Best green-only shelter name, or null. */
export function topGreenOnly(
  snapshot: PortfolioSnapshot,
  opts?: { excludeBases?: string[]; includeBanks?: boolean },
): GreenOnlyCandidate | null {
  const ranked = rankGreenOnly(snapshot, opts);
  const top = ranked.find((c) => c.spread <= DIVIDEND_15M.maxSpread + 1e-12) ?? ranked[0];
  return top ?? null;
}

/** Working seats that are red vs cost or vs open — exit candidates. */
export function redWorkingBases(snapshot: PortfolioSnapshot): string[] {
  const out: string[] = [];
  for (const sleeve of snapshot.sleeves) {
    if (sleeve.role !== "working" || !(sleeve.notionalUsd > 0)) continue;
    if (isBankSymbol(sleeve.symbol)) continue;
    const quote = findQuote(snapshot, sleeve.symbol);
    const mark = sleeve.markUsd ?? quote?.mark;
    let red = false;
    if (sleeve.costBasisUsd !== undefined && sleeve.costBasisUsd > 0 && mark !== undefined) {
      if ((mark - sleeve.costBasisUsd) / sleeve.costBasisUsd < 0) red = true;
    }
    if (quote && isRedVsOpen(quote)) red = true;
    if (red) out.push(baseSymbol(sleeve.symbol));
  }
  return out;
}
