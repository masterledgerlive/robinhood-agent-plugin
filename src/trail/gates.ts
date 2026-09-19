import {
  BANK_ORDER,
  DIVIDEND_15M,
  DUST_FLOORS,
  FIL_MCP_DISPLAY_ONLY,
  LOW_CAP_SLOW,
  SURF_LEARN,
  type GateProfile,
} from "./constants.js";
import type { PortfolioSnapshot, Quote, Sleeve, TroughWindow } from "./types.js";

export function gateProfile(snapshot: Pick<PortfolioSnapshot, "mode">): GateProfile {
  return snapshot.mode === "LOW_CAP_SLOW" ? LOW_CAP_SLOW : DIVIDEND_15M;
}

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
      DUST_FLOORS.bankDustFloorUsd,
      sleeve.peakNotionalUsd * DUST_FLOORS.bankDustFloorPctOfPeak,
    );
  }
  return Math.max(
    DUST_FLOORS.workingDustFloorUsd,
    sleeve.peakNotionalUsd * DUST_FLOORS.workingDustFloorPctOfPeak,
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
  const profile = gateProfile(snapshot);
  return pnl !== null && pnl <= profile.softHaltRealizedUsd;
}

export function expectancyHaltActive(snapshot: PortfolioSnapshot): boolean {
  const profile = gateProfile(snapshot);
  return snapshot.day.losingWorkingRoundTrips >= profile.expectancyHaltLosingWorkingRts;
}

export function spreadOk(quote: Quote, snapshot: PortfolioSnapshot): boolean {
  return quoteSpread(quote) <= gateProfile(snapshot).maxSpread;
}

export function edgeClearsRt(edge: number, quote: Quote, snapshot: PortfolioSnapshot): boolean {
  if (!(edge > 0) || !Number.isFinite(edge)) return false;
  const rt = rtSpread(quote);
  if (!Number.isFinite(rt)) return false;
  return edge + 1e-12 >= gateProfile(snapshot).minEdgeMultipleOfRtSpread * rt;
}

export function troughWindowOk(trough: TroughWindow, snapshot: PortfolioSnapshot): boolean {
  const profile = gateProfile(snapshot);
  return (
    trough.windowMinutes >= profile.troughWindowMinMinutes &&
    trough.windowMinutes <= profile.troughWindowMaxMinutes &&
    trough.troughMark > 0 &&
    Number.isFinite(trough.troughMark)
  );
}

/**
 * Planned bounce edge uses trough → recentHigh. Current mark must have
 * reclaimed the trough and still be in the first half of that bounce (no chase).
 */
export function troughBounceEdge(
  trough: TroughWindow,
  mark: number,
  snapshot: PortfolioSnapshot,
): {
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
  const chase =
    !reclaim || mark >= recentHigh || ran / bounce > gateProfile(snapshot).chaseMaxFractionOfBounce;
  const edge = bounce / trough.troughMark;
  return { ok: reclaim && !chase && edge > 0, edge, chase, reclaim };
}

export function liveMicroBuyingPowerOk(snapshot: PortfolioSnapshot): boolean {
  if (snapshot.buyingPowerUsd === undefined) return true;
  return snapshot.buyingPowerUsd + 1e-12 >= SURF_LEARN.liveMicroMinBuyingPowerUsd;
}

export function refuseNonAgentic(): { eligible: false; reason: string } {
  return { eligible: false, reason: "Robinhood Agentic account only (agentic_allowed)." };
}

export function refuseNewWorkingEntry(snapshot: PortfolioSnapshot): string | null {
  const profile = gateProfile(snapshot);
  if (softHaltActive(snapshot)) {
    return `soft_halt: day realized at or below −$${Math.abs(profile.softHaltRealizedUsd)}; no new working entry`;
  }
  if (expectancyHaltActive(snapshot)) {
    return `expectancy_halt: ${profile.expectancyHaltLosingWorkingRts} losing working RTs; no new working entry`;
  }
  if (!liveMicroBuyingPowerOk(snapshot)) {
    return `buying power $${snapshot.buyingPowerUsd} < $${SURF_LEARN.liveMicroMinBuyingPowerUsd} — learn only, no live micro`;
  }
  if (snapshot.day.newWorkingEntries >= profile.maxNewWorkingEntriesPerDay) {
    const n = profile.maxNewWorkingEntriesPerDay;
    return `${profile.id}: max ${n} new working ${n === 1 ? "entry" : "entries"}/day`;
  }
  if (workingSeats(snapshot).length >= profile.maxWorkingSeats) {
    return `${profile.id}: max ${profile.maxWorkingSeats} working seats`;
  }
  return null;
}
