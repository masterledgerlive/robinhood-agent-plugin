/**
 * Pure wave functions — mark/bid/ask geometry only.
 *
 * No agent, no whisper, no LLM. When Cursor/desk bots are silent,
 * these functions still score the book from the tape.
 * Never invent marks — missing inputs → null / zero amplitude.
 */

import { AGENTIC_MOVE_EQ, type AgenticMoveEq } from "./equation.js";
import {
  baseSymbol,
  findQuote,
  gateProfile,
  quoteSpread,
  rtSpread,
  troughBounceEdge,
  troughWindowOk,
} from "./gates.js";
import type { PortfolioSnapshot, Quote, TroughWindow } from "./types.js";

export type WaveKind = "flat" | "trough_reclaim" | "momentum_up" | "mean_revert_dip" | "fade";

/**
 * Wave state for one symbol from quote + optional trough window.
 * Amplitude is fractional |move|; phase is where we sit on trough→high [0,1].
 */
export type WaveState = {
  symbol: string;
  kind: WaveKind;
  /** Fractional move used for edge checks (bounce size, momentum, dip). */
  amplitude: number;
  /** 0 at trough, 1 at recentHigh; null if no trough geometry. */
  phase: number | null;
  /** True when amplitude clears liveEdgeK × RT on this quote. */
  edgeClears: boolean;
  /** True when one-way spread ≤ gate max. */
  spreadOk: boolean;
  /** Human equation with plugged numbers. */
  equation: string;
  trough?: TroughWindow;
};

function meanOf(trough: TroughWindow | undefined, quote: Quote): number | undefined {
  if (trough?.recentHigh !== undefined && trough.recentHigh > trough.troughMark) {
    return (trough.troughMark + trough.recentHigh) / 2;
  }
  return quote.priorMark;
}

/**
 * Score one token's wave from the tape. Pure function of snapshot quotes/troughs.
 */
export function waveOf(
  snapshot: PortfolioSnapshot,
  symbol: string,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): WaveState | null {
  const quote = findQuote(snapshot, symbol);
  if (!quote || !(quote.mark > 0)) return null;

  const base = baseSymbol(quote.symbol);
  const trough = snapshot.troughs.find((t) => baseSymbol(t.symbol) === base);
  const oneWay = quoteSpread(quote);
  const rt = rtSpread(quote);
  const spreadOk = Number.isFinite(oneWay) && oneWay <= gateProfile(snapshot).maxSpread;

  // Prefer trough geometry when the window is valid.
  if (trough && troughWindowOk(trough, snapshot)) {
    const bounce = troughBounceEdge(trough, quote.mark, snapshot);
    const phase =
      trough.recentHigh !== undefined && trough.recentHigh > trough.troughMark
        ? Math.min(1, Math.max(0, (quote.mark - trough.troughMark) / (trough.recentHigh - trough.troughMark)))
        : null;
    const edgeClears =
      Number.isFinite(rt) && bounce.edge + 1e-12 >= eq.liveEdgeMultipleOfRt * rt;

    if (bounce.ok) {
      return {
        symbol: quote.symbol,
        kind: "trough_reclaim",
        amplitude: bounce.edge,
        phase,
        edgeClears,
        spreadOk,
        equation:
          `wave=${base}:trough_reclaim amp=${(bounce.edge * 100).toFixed(2)}% phase=${phase === null ? "n/a" : phase.toFixed(2)} ` +
          `edge_ok=${edgeClears} (≥${eq.liveEdgeMultipleOfRt}×RT=${(rt * 100).toFixed(3)}%) spread_ok=${spreadOk}`,
        trough,
      };
    }

    if (bounce.reclaim && bounce.chase) {
      return {
        symbol: quote.symbol,
        kind: "fade",
        amplitude: bounce.edge,
        phase,
        edgeClears: false,
        spreadOk,
        equation: `wave=${base}:fade (chase past half-bounce) amp=${(bounce.edge * 100).toFixed(2)}% — no entry`,
        trough,
      };
    }
  }

  const mean = meanOf(trough, quote);
  if (mean !== undefined && mean > 0 && quote.mark < mean) {
    const amp = (mean - quote.mark) / mean;
    const edgeClears = Number.isFinite(rt) && amp + 1e-12 >= eq.liveEdgeMultipleOfRt * rt;
    return {
      symbol: quote.symbol,
      kind: "mean_revert_dip",
      amplitude: amp,
      phase: null,
      edgeClears,
      spreadOk,
      equation:
        `wave=${base}:mean_revert_dip amp=${(amp * 100).toFixed(2)}% mean=${mean.toFixed(6)} ` +
        `edge_ok=${edgeClears} spread_ok=${spreadOk}`,
      ...(trough ? { trough } : {}),
    };
  }

  if (quote.priorMark !== undefined && quote.priorMark > 0 && quote.mark > quote.priorMark) {
    const amp = (quote.mark - quote.priorMark) / quote.priorMark;
    const edgeClears = Number.isFinite(rt) && amp + 1e-12 >= eq.liveEdgeMultipleOfRt * rt;
    return {
      symbol: quote.symbol,
      kind: "momentum_up",
      amplitude: amp,
      phase: null,
      edgeClears,
      spreadOk,
      equation:
        `wave=${base}:momentum_up amp=${(amp * 100).toFixed(2)}% prior=${quote.priorMark.toFixed(6)} ` +
        `edge_ok=${edgeClears} spread_ok=${spreadOk}`,
    };
  }

  return {
    symbol: quote.symbol,
    kind: "flat",
    amplitude: 0,
    phase: null,
    edgeClears: false,
    spreadOk,
    equation: `wave=${base}:flat amp=0 (no trough/momentum/dip geometry)`,
    ...(trough ? { trough } : {}),
  };
}

/** Map wave kind → preferred trick id (math only; ledger may still gate live momentum). */
export function waveToTrickId(kind: WaveKind): string | null {
  switch (kind) {
    case "trough_reclaim":
      return "trough_bounce_15m";
    case "mean_revert_dip":
      return "mean_revert_15m";
    case "momentum_up":
      return "momentum_15m";
    default:
      return null;
  }
}

/**
 * Rank all quoted symbols by wave amplitude × edge clear × spread.
 * Pure tape sort — agents optional.
 */
export function rankWaves(
  snapshot: PortfolioSnapshot,
  eq: AgenticMoveEq = AGENTIC_MOVE_EQ,
): WaveState[] {
  const seen = new Set<string>();
  const out: WaveState[] = [];
  for (const quote of snapshot.quotes) {
    const base = baseSymbol(quote.symbol);
    if (seen.has(base)) continue;
    seen.add(base);
    const wave = waveOf(snapshot, quote.symbol, eq);
    if (wave) out.push(wave);
  }
  return out.sort((a, b) => {
    const score = (w: WaveState) =>
      (w.edgeClears ? 2 : 0) + (w.spreadOk ? 1 : 0) + w.amplitude;
    return score(b) - score(a);
  });
}
