import { BANK_ORDER, FIL_MCP_DISPLAY_ONLY, LOW_CAP_SLOW } from "./constants.js";
import type { PortfolioSnapshot, Quote, Sleeve, TroughWindow } from "./types.js";

export function baseSymbol(symbol: string): string {
  return symbol.replace(/-USD$/i, "").toUpperCase();
}

export function isBankSymbol(symbol: string): boolean {
  const base = baseSymbol(symbol);
  return (BANK_ORDER as readonly string[]).includes(base);
}

export function isFilDisplayOnly(symbol: string): boolean {
  return FIL_MCP_DISPLAY_ONLY && baseSymbol(symbol) === "FIL";
}

export function isAgenticAccount(snapshot: PortfolioSnapshot): boolean {
  return snapshot.account.agenticAllowed === true;
}

export function findQuote(snapshot: PortfolioSnapshot, symbol: string): Quote | undefined {
  const base = baseSymbol(symbol);
  return snapshot.quotes.find((q) => baseSymbol(q.symbol) === base);
}

export function findSleeve(
  snapshot: PortfolioSnapshot,
  symbol: string,
  role?: Sleeve["role"],
): Sleeve | undefined {
  const base = baseSymbol(symbol);
  return snapshot.sleeves.find((s) => {
    if (baseSymbol(s.symbol) !== base) return false;
    if (role && s.role !== role) return false;
    return true;
  });
}

export function workingSeats(snapshot: PortfolioSnapshot): Sleeve[] {
  return snapshot.sleeves.filter((s) => s.role === "working" && s.notionalUsd > 0);
}

export function bankSleeves(snapshot: PortfolioSnapshot): Sleeve[] {
  return snapshot.sleeves.filter((s) => s.role === "bank" && s.notionalUsd > 0);
}

export function quoteSpread(quote: Quote): number {
  const mid = (quote.bid + quote.ask) / 2;
  if (!(mid > 0) || !(quote.ask >= quote.bid)) return Number.POSITIVE_INFINITY;
  return (quote.ask - quote.bid) / mid;
}

/** Round-trip spread: buy ask + sell bid ≈ 2× one-way. */
export function rtSpread(quote: Quote): number {
  return 2 * quoteSpread(quote);
}

export function dustFloorUsd(sleeve: Sleeve): number {
  if (sleeve.role === "bank") {
    return Math.max(
      LOW_CAP_SLOW.bankDustFloorUsd,
      sleeve.peakNotionalUsd * LOW_CAP_SLOW.bankDustFloorPctOfPeak,
    );
  }
  return Math.max(
    LOW_CAP_SLOW.workingDustFloorUsd,
    sleeve.peakNotionalUsd * LOW_CAP_SLOW.workingDustFloorPctOfPeak,
  );
}

/** Remaining notional after a take must stay at or above the dust floor. Never flatten. */
export function wouldFlatten(sleeve: Sleeve, takeUsd: number): boolean {
  if (!(takeUsd > 0) || !Number.isFinite(takeUsd)) return true;
  return sleeve.notionalUsd - takeUsd + 1e-12 < dustFloorUsd(sleeve);
}

export function maxTakeWithoutFlatten(sleeve: Sleeve): number {
  const take = sleeve.notionalUsd - dustFloorUsd(sleeve);
  return take > 0 ? take : 0;
}

export function softHaltActive(snapshot: PortfolioSnapshot): boolean {
  const pnl = snapshot.day.realizedPnlUsd;
  return pnl !== null && pnl <= LOW_CAP_SLOW.softHaltRealizedUsd;
}

export function expectancyHaltActive(snapshot: PortfolioSnapshot): boolean {
  return snapshot.day.losingWorkingRoundTrips >= LOW_CAP_SLOW.expectancyHaltLosingWorkingRts;
}

export function spreadOk(quote: Quote): boolean {
  return quoteSpread(quote) <= LOW_CAP_SLOW.maxSpread;
}

export function edgeClearsRt(edge: number, quote: Quote): boolean {
  if (!(edge > 0) || !Number.isFinite(edge)) return false;
  const rt = rtSpread(quote);
  if (!Number.isFinite(rt)) return false;
  return edge + 1e-12 >= LOW_CAP_SLOW.minEdgeMultipleOfRtSpread * rt;
}

export function troughWindowOk(trough: TroughWindow): boolean {
  return (
    trough.windowMinutes >= LOW_CAP_SLOW.troughWindowMinMinutes &&
    trough.windowMinutes <= LOW_CAP_SLOW.troughWindowMaxMinutes &&
    trough.troughMark > 0 &&
    Number.isFinite(trough.troughMark)
  );
}

/**
 * Planned bounce edge uses trough → recentHigh. Current mark must have
 * reclaimed the trough and still be in the first half of that bounce (no chase).
 */
export function troughBounceEdge(trough: TroughWindow, mark: number): {
  ok: boolean;
  edge: number;
  chase: boolean;
  reclaim: boolean;
} {
  const recentHigh = trough.recentHigh;
  const reclaim = mark > trough.troughMark;
  if (recentHigh === undefined || !(recentHigh > trough.troughMark)) {
    return { ok: false, edge: 0, chase: false, reclaim };
  }
  const bounce = recentHigh - trough.troughMark;
  const ran = mark - trough.troughMark;
  const chase = !reclaim || mark >= recentHigh || ran / bounce > LOW_CAP_SLOW.chaseMaxFractionOfBounce;
  const edge = bounce / trough.troughMark;
  return { ok: reclaim && !chase && edge > 0, edge, chase, reclaim };
}

export function refuseNonAgentic(): { eligible: false; reason: string } {
  return { eligible: false, reason: "Robinhood Agentic account only (agentic_allowed)." };
}

export function refuseNewWorkingEntry(snapshot: PortfolioSnapshot): string | null {
  if (softHaltActive(snapshot)) {
    return "soft_halt: day realized at or below −$1; no new working entry";
  }
  if (expectancyHaltActive(snapshot)) {
    return "expectancy_halt: 5 losing working RTs; no new working entry";
  }
  if (snapshot.day.newWorkingEntries >= LOW_CAP_SLOW.maxNewWorkingEntriesPerDay) {
    return "LOW_CAP_SLOW: max 1 new working entry/day";
  }
  if (workingSeats(snapshot).length >= LOW_CAP_SLOW.maxWorkingSeats) {
    return "LOW_CAP_SLOW: max 2 working seats";
  }
  return null;
}
