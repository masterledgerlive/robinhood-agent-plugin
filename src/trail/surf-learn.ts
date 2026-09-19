import { SURF_LEARN } from "./constants.js";
import {
  baseSymbol,
  findQuote,
  isBankSymbol,
  liveMicroBuyingPowerOk,
  quoteSpread,
  rtSpread,
} from "./gates.js";
import type { SuccessLedger } from "./ledger.js";
import type { PortfolioSnapshot, Quote, SurfLearnResult, WhatIfPath } from "./types.js";

/**
 * Paper next-15m PnL for a $2 long after estimated RT spread.
 * Requires mark15m on the quote. Never a broker fill.
 */
export function whatIfPnlUsd(quote: Quote, notionalUsd: number): number | null {
  if (quote.mark15m === undefined || !(quote.mark > 0) || !Number.isFinite(quote.mark15m)) {
    return null;
  }
  const rt = rtSpread(quote);
  if (!Number.isFinite(rt)) return null;
  const move = (quote.mark15m - quote.mark) / quote.mark;
  return notionalUsd * (move - rt);
}

function surfPathId(trickId: string, symbol: string): string {
  return `surf:${trickId}:${baseSymbol(symbol)}`;
}

export function surfUniverseQuotes(snapshot: PortfolioSnapshot): Quote[] {
  const wanted = new Set<string>();
  for (const sleeve of snapshot.sleeves) {
    if (sleeve.role === "working" && sleeve.notionalUsd > 0) wanted.add(baseSymbol(sleeve.symbol));
  }
  for (const quote of snapshot.quotes) wanted.add(baseSymbol(quote.symbol));
  const out: Quote[] = [];
  for (const base of wanted) {
    const quote = findQuote(snapshot, base);
    if (quote) out.push(quote);
  }
  return out;
}

function applies(trickId: string, quote: Quote, snapshot: PortfolioSnapshot): boolean {
  if (trickId === "hold_bank") {
    return baseSymbol(quote.symbol) === "NEAR" || (baseSymbol(quote.symbol) === "CHIP" && !findQuote(snapshot, "NEAR"));
  }
  if (trickId === "trough_bounce_15m") {
    return snapshot.troughs.some((t) => baseSymbol(t.symbol) === baseSymbol(quote.symbol));
  }
  if (trickId === "momentum_15m") {
    return quote.priorMark !== undefined && quote.mark > quote.priorMark && !isBankSymbol(quote.symbol);
  }
  if (trickId === "mean_revert_15m") {
    if (isBankSymbol(quote.symbol)) return false;
    const trough = snapshot.troughs.find((t) => baseSymbol(t.symbol) === baseSymbol(quote.symbol));
    const mean =
      trough?.recentHigh !== undefined ? (trough.troughMark + trough.recentHigh) / 2 : quote.priorMark;
    return mean !== undefined && quote.mark < mean;
  }
  return false;
}

/**
 * Parallel paper surfers. Same $2 notional. Ranks top paths by what-if PnL.
 * Updates the success ledger with paper_surf attempts. Does not place.
 */
export function runSurfLearn(
  snapshot: PortfolioSnapshot,
  ledger?: SuccessLedger,
  liveHits?: ReadonlySet<string>,
): SurfLearnResult {
  const notionalUsd = SURF_LEARN.notionalUsd;
  const scored: Omit<WhatIfPath, "rank">[] = [];

  for (const trickId of SURF_LEARN.tricks) {
    for (const quote of surfUniverseQuotes(snapshot)) {
      if (!applies(trickId, quote, snapshot)) continue;
      const pnl = whatIfPnlUsd(quote, notionalUsd);
      if (pnl === null) continue;
      const liveClears = liveHits?.has(`${trickId}:${baseSymbol(quote.symbol)}`) === true;
      const symbol = quote.symbol;
      const path_id = surfPathId(trickId, symbol);
      scored.push({
        path_id,
        trick_id: trickId,
        symbol,
        notionalUsd,
        whatIfPnlUsd: pnl,
        spreadAtEntry: quoteSpread(quote),
        liveClears,
      });

      if (ledger) {
        ledger.upsertPath({
          path_id,
          source: "github_code",
          leader_system: "SURF_LEARN paper",
          horizon: "15m",
          tokens: [symbol],
          trick_id: trickId,
          gates: ["SURF_LEARN", snapshot.mode],
          success_rate: null,
          status: "trailing",
        });
        ledger.recordAttempt({
          attempt_id: `paper:${snapshot.asOf}:${trickId}:${baseSymbol(symbol)}`,
          path_id,
          trick_id: trickId,
          timestamp: snapshot.asOf,
          order_ids: [],
          realized_pnl: pnl,
          spread_at_entry: quoteSpread(quote),
          outcome: pnl > 0 ? "win" : "loss",
          kind: "paper_surf",
        });
      }
    }
  }

  scored.sort((a, b) => b.whatIfPnlUsd - a.whatIfPnlUsd);
  const whatIfTop: WhatIfPath[] = scored.slice(0, SURF_LEARN.topN).map((row, i) => ({
    ...row,
    rank: i + 1,
  }));

  return {
    ran: true,
    notionalUsd,
    whatIfTop,
    liveMicroOk: liveMicroBuyingPowerOk(snapshot),
  };
}
