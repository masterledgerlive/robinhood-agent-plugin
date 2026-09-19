/**
 * Wilder Relative Strength Index — correct formula, no invented bars.
 *
 * RSI = 100 − 100 / (1 + RS)
 * RS  = Average Gain / Average Loss
 *
 * First averages: arithmetic mean of the first `period` gains/losses.
 * Later averages: Wilder smooth
 *   AvgGain = (prevAvgGain × (period−1) + gain) / period
 *   AvgLoss = (prevAvgLoss × (period−1) + loss) / period
 *
 * Needs `period + 1` chronological closes (oldest → newest).
 * Missing / short series → null (never invent OHLC).
 *
 * Rollback (exit longs): RSI leaves overbought — prior ≥ overbought and
 * current RSI is lower (turned down), optionally confirmed by a down close.
 */

import { AGENTIC_MOVE_EQ, type AgenticMoveEq } from "./equation.js";
import { baseSymbol, findQuote } from "./gates.js";
import type { PortfolioSnapshot } from "./types.js";

export type WilderRsiState = {
  symbol: string;
  rsi: number;
  /** Prior bar RSI when enough closes exist; null otherwise. */
  rsiPrev: number | null;
  period: number;
  samples: number;
  /** True when RSI turned down out of / from overbought (long exit). */
  rollingDown: boolean;
  equation: string;
};

/**
 * Wilder RSI on a close series. Returns null if closes.length < period + 1.
 */
export function wilderRsi(closes: number[], period = 14): number | null {
  if (!(period >= 2) || !Number.isInteger(period)) return null;
  if (closes.length < period + 1) return null;
  for (const c of closes) {
    if (!(c > 0) || !Number.isFinite(c)) return null;
  }

  const slice = closes.slice(-(period + 1));
  const changes: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    changes.push(slice[i]! - slice[i - 1]!);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const ch = changes[i]!;
    if (ch > 0) avgGain += ch;
    else if (ch < 0) avgLoss += -ch;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const ch = changes[i]!;
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss <= 1e-15) return avgGain <= 1e-15 ? 50 : 100;
  if (avgGain <= 1e-15) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Last two Wilder RSI values (prev, current) for turn detection.
 * Needs period + 2 closes.
 */
export function wilderRsiPair(
  closes: number[],
  period = 14,
): { rsi: number; rsiPrev: number } | null {
  if (closes.length < period + 2) {
    const one = wilderRsi(closes, period);
    if (one === null) return null;
    return { rsi: one, rsiPrev: one };
  }
  const rsiPrev = wilderRsi(closes.slice(0, -1), period);
  const rsi = wilderRsi(closes, period);
  if (rsi === null || rsiPrev === null) return null;
  return { rsi, rsiPrev };
}

/**
 * Long-exit rollback: RSI was overbought and has turned down
 * (left or leaving the overbought zone). Confirmed when the last close fell.
 */
export function rsiRollingDown(
  rsi: number,
  rsiPrev: number | null,
  closes: number[],
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): boolean {
  if (rsiPrev === null) return false;
  const turnedDown = rsi + 1e-12 < rsiPrev;
  if (!turnedDown) return false;

  const leftOverbought =
    rsiPrev + 1e-12 >= eq.rsiOverbought && rsi + 1e-12 < eq.rsiOverbought;
  const rollingFromOverbought =
    rsiPrev + 1e-12 >= eq.rsiOverbought && rsi + 1e-12 < rsiPrev;

  let downClose = false;
  if (closes.length >= 2) {
    const a = closes[closes.length - 2]!;
    const b = closes[closes.length - 1]!;
    downClose = b + 1e-12 < a;
  }

  // Classic: leave/roll from overbought. Soft confirm: turn down + down close while still elevated.
  if (leftOverbought || rollingFromOverbought) return true;
  return (
    downClose &&
    rsiPrev + 1e-12 >= eq.rsiElevated &&
    rsi + 1e-12 < rsiPrev
  );
}

/**
 * Resolve closes for RSI: prefer quote.closes; else null (do not invent from 2–3 marks).
 * Broker-supplied quote.rsi / quote.rsiPrev may be used when closes are absent.
 */
export function closesForRsi(snapshot: PortfolioSnapshot, symbol: string): number[] | null {
  const quote = findQuote(snapshot, symbol);
  if (!quote) return null;
  if (quote.closes && quote.closes.length > 0) {
    const ok = quote.closes.every((c) => c > 0 && Number.isFinite(c));
    return ok ? quote.closes : null;
  }
  return null;
}

/**
 * Score one token's Wilder RSI / rollback. Agents optional.
 */
export function tapeRsiOf(
  snapshot: PortfolioSnapshot,
  symbol: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): WilderRsiState | null {
  const quote = findQuote(snapshot, symbol);
  if (!quote || !(quote.mark > 0)) return null;

  const period = eq.rsiPeriod;
  const closes = closesForRsi(snapshot, symbol);

  let rsi: number | null = null;
  let rsiPrev: number | null = null;
  let samples = 0;

  if (closes && closes.length >= period + 1) {
    const pair = wilderRsiPair(closes, period);
    if (!pair) return null;
    rsi = pair.rsi;
    rsiPrev = closes.length >= period + 2 ? pair.rsiPrev : null;
    samples = closes.length;
  } else if (quote.rsi !== undefined && Number.isFinite(quote.rsi)) {
    // Broker-computed RSI only — still never invent closes.
    rsi = quote.rsi;
    rsiPrev =
      quote.rsiPrev !== undefined && Number.isFinite(quote.rsiPrev) ? quote.rsiPrev : null;
    samples = 0;
  } else {
    return null;
  }

  const series = closes ?? [];
  const rollingDown = rsiRollingDown(rsi, rsiPrev, series, eq);

  const equation =
    `rsi=${baseSymbol(quote.symbol)} wilder(${period})=${rsi.toFixed(1)} ` +
    `prev=${rsiPrev === null ? "n/a" : rsiPrev.toFixed(1)} samples=${samples} ` +
    `rollingDown=${rollingDown} (leave OB≥${eq.rsiOverbought})`;

  return {
    symbol: quote.symbol,
    rsi,
    rsiPrev,
    period,
    samples,
    rollingDown,
    equation,
  };
}
