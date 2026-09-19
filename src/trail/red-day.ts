import { DIVIDEND_15M, RED_DAY } from "./constants.js";
import {
  everythingGoingRed,
  isGreenVsOpen,
  rankGreenOnly,
  redVsOpenFraction,
} from "./green-only.js";
import {
  baseSymbol,
  dustFloorUsd,
  findQuote,
  isBankSymbol,
  maxTakeWithoutFlatten,
  quoteSpread,
  workingSeats,
} from "./gates.js";
import { surfUniverseQuotes, whatIfPnlUsd } from "./surf-learn.js";
import type {
  PortfolioSnapshot,
  RedDayBuyTrough,
  RedDayExitSeat,
  RedDayGreenPark,
  RedDayPhase,
  RedDayResult,
  WhisperCard,
} from "./types.js";

const GAME_SOURCES = new Set(["game", "rh_game", "game_ping"]);

function inWindow(heardAt: string, asOf: string): boolean {
  const heard = Date.parse(heardAt);
  const now = Date.parse(asOf);
  if (!Number.isFinite(heard) || !Number.isFinite(now)) return false;
  const deltaMin = (now - heard) / 60000;
  return deltaMin >= 0 && deltaMin <= RED_DAY.windowMinutes;
}

function isGameSource(source: string): boolean {
  return GAME_SOURCES.has(source.trim().toLowerCase());
}

function redDayWhispers(whispers: WhisperCard[], asOf: string): WhisperCard[] {
  return whispers.filter(
    (w) => w.theme === "red_day" && w.status !== "expired" && inWindow(w.heard_at, asOf),
  );
}

function whisperLeg(
  snapshot: PortfolioSnapshot,
  whispers: WhisperCard[],
): { ok: boolean; reason: string; sources: string[] } {
  if (snapshot.authorize?.redDay === true) {
    return { ok: true, reason: "A: Game red-day ping", sources: ["game"] };
  }
  const cards = redDayWhispers(whispers, snapshot.asOf);
  const sources = [...new Set(cards.map((w) => w.source.trim().toLowerCase()))];
  if (sources.some((s) => isGameSource(s))) {
    return { ok: true, reason: "A: Game ping in whisper inbox", sources };
  }
  if (sources.length >= RED_DAY.minIndependentSources) {
    return {
      ok: true,
      reason: `A: ${sources.length} independent agentic sources tagging red_day (Wild West until book/tape confirms)`,
      sources,
    };
  }
  return {
    ok: false,
    reason: `A: ${sources.length} red_day source(s) in ${RED_DAY.windowMinutes}m window (need ${RED_DAY.minIndependentSources} or Game ping)`,
    sources,
  };
}

function bookLeg(snapshot: PortfolioSnapshot): { ok: boolean; reason: string } {
  const near = findQuote(snapshot, "NEAR");
  if (near?.sessionOpen !== undefined && near.sessionOpen > 0) {
    const vsOpen = (near.mark - near.sessionOpen) / near.sessionOpen;
    if (vsOpen <= RED_DAY.nearVsSessionOpen + 1e-12) {
      return {
        ok: true,
        reason: `B: NEAR mark ${(vsOpen * 100).toFixed(2)}% vs session open`,
      };
    }
  }

  const down = workingSeats(snapshot).filter((s) => {
    const cost = s.costBasisUsd;
    const mark = s.markUsd ?? findQuote(snapshot, s.symbol)?.mark;
    if (cost === undefined || !(cost > 0) || mark === undefined) return false;
    return (mark - cost) / cost <= RED_DAY.workingVsCost + 1e-12;
  });
  if (down.length >= RED_DAY.minWorkingDownSeats) {
    return {
      ok: true,
      reason: `B: ${down.length} working seats ≤ ${(RED_DAY.workingVsCost * 100).toFixed(1)}% vs cost`,
    };
  }
  return {
    ok: false,
    reason: "B: NEAR vs open and working-vs-cost legs not met (missing marks are not invented)",
  };
}

/**
 * Tape leg — lesson fix: do not require mark15m alone.
 * Prefer mark15m what-ifs when present; else majority red vs session open
 * ("everything going red") so live RH opens can arm the book without agents.
 */
function tapeLeg(snapshot: PortfolioSnapshot): { ok: boolean; reason: string } {
  const scored = surfUniverseQuotes(snapshot)
    .map((q) => whatIfPnlUsd(q, 1))
    .filter((n): n is number => n !== null);
  if (scored.length >= RED_DAY.minTapeScored) {
    const negative = scored.filter((n) => n < 0).length;
    const ok = negative * 2 > scored.length;
    if (ok) {
      return {
        ok: true,
        reason: `C: ${negative}/${scored.length} SURF_LEARN names negative after RT`,
      };
    }
  }

  const vsOpen = redVsOpenFraction(snapshot);
  if (everythingGoingRed(snapshot) && vsOpen.fraction !== null) {
    return {
      ok: true,
      reason: `C: everything going red — ${vsOpen.red}/${vsOpen.scored} names red vs session open (≥${(RED_DAY.everythingRedFraction * 100).toFixed(0)}%)`,
    };
  }

  if (scored.length < RED_DAY.minTapeScored && (vsOpen.scored < RED_DAY.minTapeScored || vsOpen.fraction === null)) {
    return {
      ok: false,
      reason:
        "C: tape needs ≥2 SURF_LEARN mark15m or ≥2 session opens — will not invent",
    };
  }

  if (vsOpen.fraction !== null) {
    return {
      ok: false,
      reason: `C: ${vsOpen.red}/${vsOpen.scored} red vs open (need ≥${(RED_DAY.everythingRedFraction * 100).toFixed(0)}% majority) and mark15m majority not met`,
    };
  }

  const negative = scored.filter((n) => n < 0).length;
  return {
    ok: false,
    reason: `C: ${negative}/${scored.length} SURF_LEARN names negative after RT (need majority)`,
  };
}

function nearReclaimedOpen(snapshot: PortfolioSnapshot): boolean {
  const near = findQuote(snapshot, "NEAR");
  if (!near?.sessionOpen || !(near.sessionOpen > 0)) return false;
  return near.mark + 1e-12 >= near.sessionOpen;
}

function confirmDisplay(whispers: WhisperCard[], asOf: string, structure: boolean): WhisperCard[] {
  return whispers.map((w) => {
    const copy = { ...w, tokens: [...w.tokens] };
    if (!structure) return copy;
    if (copy.theme === "red_day" && copy.status === "quarantine" && inWindow(copy.heard_at, asOf)) {
      copy.status = "confirmed";
    }
    return copy;
  });
}

function exitSeats(snapshot: PortfolioSnapshot): RedDayExitSeat[] {
  const out: RedDayExitSeat[] = [];
  for (const sleeve of workingSeats(snapshot)) {
    if (isBankSymbol(sleeve.symbol)) continue;
    const take = maxTakeWithoutFlatten(sleeve);
    if (!(take > 0)) continue;
    out.push({
      symbol: sleeve.symbol,
      notionalUsd: sleeve.notionalUsd,
      leaveDustUsd: dustFloorUsd(sleeve),
    });
  }
  return out;
}

function greenParkCandidates(snapshot: PortfolioSnapshot): RedDayGreenPark[] {
  return rankGreenOnly(snapshot).map((g) => ({
    symbol: g.symbol,
    climbFromOpen: g.climbFromOpen,
    reason: g.reason,
  }));
}

function bottomsFound(snapshot: PortfolioSnapshot): boolean {
  for (const trough of snapshot.troughs) {
    if (isBankSymbol(trough.symbol)) continue;
    const quote = findQuote(snapshot, trough.symbol);
    if (!quote) continue;
    if (!(quote.mark > trough.troughMark)) continue;
    // Reclaim started — bottoms forming (not inventing; needs trough on snapshot).
    return true;
  }
  return false;
}

function buyTroughCandidates(
  snapshot: PortfolioSnapshot,
  whispers: WhisperCard[],
): RedDayBuyTrough[] {
  const out: RedDayBuyTrough[] = [];
  const seen = new Set<string>();
  for (const card of whispers) {
    if (card.route_hint !== "buy_trough" || card.status === "expired") continue;
    for (const token of card.tokens) {
      const key = `${baseSymbol(token)}:${card.whisper_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isBankSymbol(token)) {
        out.push({
          symbol: token,
          whisper_id: card.whisper_id,
          status: card.status,
          reason: "bank — hold/park only, never flatten",
        });
        continue;
      }
      const quote = findQuote(snapshot, token);
      if (!quote) {
        out.push({
          symbol: token,
          whisper_id: card.whisper_id,
          status: card.status,
          reason: "no quote — staged candidate only",
        });
        continue;
      }
      const spread = quoteSpread(quote);
      if (spread > DIVIDEND_15M.maxSpread) {
        out.push({
          symbol: token,
          whisper_id: card.whisper_id,
          status: card.status,
          reason: `spread ${(spread * 100).toFixed(2)}% > ${DIVIDEND_15M.maxSpread * 100}% hard — no chase`,
        });
        continue;
      }
      out.push({
        symbol: quote.symbol,
        whisper_id: card.whisper_id,
        status: card.status,
        reason: `buy_trough candidate (spread OK; ${card.status}; no place)`,
      });
    }
  }
  return out;
}

function resolvePhase(input: {
  active: boolean;
  cleared: boolean;
  exits: RedDayExitSeat[];
  greens: RedDayGreenPark[];
  bottoms: boolean;
  troughBuys: RedDayBuyTrough[];
}): RedDayPhase {
  if (input.cleared) return "cleared";
  if (!input.active) return "quiet";
  if (input.exits.length > 0) return "defend";
  if (input.bottoms || input.troughBuys.some((b) => !b.reason.includes("no chase"))) {
    return input.bottoms ? "reenter" : "wait_bottoms";
  }
  if (input.greens.length > 0) return "green_shelter";
  return "wait_bottoms";
}

/**
 * 2-of-3 red-day trigger. Quiet unless two legs fire.
 * Armed = 2+ legs, no working sleeve to exit.
 * Fired = 2+ legs and at least one working seat above dust (recommend exit + green-only + trough).
 * Lesson: exit red → green-only until bottoms → agentless re-enter. Never places.
 */
export function evaluateRedDay(snapshot: PortfolioSnapshot, whispers: WhisperCard[] = []): RedDayResult {
  const A = whisperLeg(snapshot, whispers);
  const B = bookLeg(snapshot);
  const C = tapeLeg(snapshot);
  const legs = { whisper: A.ok, book: B.ok, tape: C.ok };
  const count = Number(A.ok) + Number(B.ok) + Number(C.ok);
  const structure = B.ok || C.ok;
  const display = confirmDisplay(whispers, snapshot.asOf, structure);
  const reasons = [A.reason, B.reason, C.reason];
  const exits = exitSeats(snapshot);
  const greens = greenParkCandidates(snapshot);
  const buys = buyTroughCandidates(snapshot, display);
  const bottoms = bottomsFound(snapshot);
  const nearOk = nearReclaimedOpen(snapshot);
  const gameClear = snapshot.authorize?.redDay === false;
  const clearedByNear = nearOk && (A.ok || C.ok || count >= 2);

  if (count < 2 && !clearedByNear && !gameClear) {
    return {
      status: "quiet",
      phase: "quiet",
      reasons,
      legs,
      active: false,
      cleared: false,
      recommendations: { exitWorkingToDust: [], parkGreenOnly: [], buyTrough: [] },
      whispers: display,
    };
  }

  // Once structure fired (or tape still red), NEAR reclaim (or Game clear) ends RED_DAY_ACTIVE.
  if (clearedByNear || gameClear) {
    reasons.push(
      gameClear
        ? "Game cleared RED_DAY — resume normal SURF_ACT (agents optional)"
        : "NEAR reclaimed session open — clear RED_DAY; resume trough re-entry without agents",
    );
    return {
      status: "armed",
      phase: "cleared",
      reasons,
      legs,
      active: false,
      cleared: true,
      recommendations: { exitWorkingToDust: [], parkGreenOnly: greens, buyTrough: buys },
      whispers: display,
    };
  }

  if (count < 2) {
    return {
      status: "quiet",
      phase: "quiet",
      reasons,
      legs,
      active: false,
      cleared: false,
      recommendations: { exitWorkingToDust: [], parkGreenOnly: [], buyTrough: [] },
      whispers: display,
    };
  }

  const fired = exits.length > 0;
  const status = fired ? "fired" : "armed";
  if (fired) {
    reasons.push(
      `recommend exit_working_to_dust on ${exits.map((e) => e.symbol).join(", ")} — leave dust, never flatten banks`,
    );
  } else {
    reasons.push("RED_DAY armed — no working seat above dust to sleeve");
  }
  if (greens.length > 0) {
    reasons.push(
      `green-only shelter: ${greens.map((g) => `${g.symbol} +${(g.climbFromOpen * 100).toFixed(2)}%`).join(", ")} until bottoms — agents optional`,
    );
  } else {
    reasons.push("green-only shelter: none still green vs open — wait bottoms on staged troughs");
  }
  if (bottoms) {
    reasons.push("bottoms forming (trough reclaim) — agentless re-enter via trough_bounce / buy_trough");
  }

  const phase = resolvePhase({
    active: true,
    cleared: false,
    exits,
    greens,
    bottoms,
    troughBuys: buys,
  });

  return {
    status,
    phase,
    reasons,
    legs,
    active: true,
    cleared: false,
    recommendations: {
      exitWorkingToDust: fired ? exits : [],
      parkGreenOnly: greens,
      buyTrough: fired || phase === "reenter" || phase === "wait_bottoms" || phase === "green_shelter" ? buys : [],
    },
    whispers: display,
  };
}

export const redDayTrigger = {
  evaluate: evaluateRedDay,
};

/** Allow trough re-entry on this symbol while RED_DAY active (green-only or staged trough). */
export function redDayAllowsTroughReentry(
  redDay: RedDayResult,
  symbol: string,
): boolean {
  if (!redDay.active) return true;
  if (redDay.phase === "reenter" || redDay.phase === "wait_bottoms") {
    const base = baseSymbol(symbol);
    if (redDay.recommendations.buyTrough.some((b) => baseSymbol(b.symbol) === base)) return true;
    if (redDay.recommendations.parkGreenOnly.some((g) => baseSymbol(g.symbol) === base)) return true;
    // Bottoms on any staged name: allow trough_bounce generally in reenter phase.
    if (redDay.phase === "reenter") return true;
  }
  // Green shelter: only green-only names (relative strength), not red chase.
  if (redDay.phase === "green_shelter" || redDay.phase === "defend") {
    return redDay.recommendations.parkGreenOnly.some((g) => baseSymbol(g.symbol) === baseSymbol(symbol));
  }
  return false;
}

export function isGreenShelterSymbol(redDay: RedDayResult, symbol: string): boolean {
  return redDay.recommendations.parkGreenOnly.some((g) => baseSymbol(g.symbol) === baseSymbol(symbol));
}

export { isGreenVsOpen };
