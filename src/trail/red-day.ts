import { DIVIDEND_15M, RED_DAY } from "./constants.js";
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

function tapeLeg(snapshot: PortfolioSnapshot): { ok: boolean; reason: string } {
  const scored = surfUniverseQuotes(snapshot)
    .map((q) => whatIfPnlUsd(q, 1))
    .filter((n): n is number => n !== null);
  if (scored.length < 2) {
    return { ok: false, reason: "C: tape needs ≥2 SURF_LEARN marks with mark15m — will not invent" };
  }
  const negative = scored.filter((n) => n < 0).length;
  const ok = negative * 2 > scored.length;
  return {
    ok,
    reason: ok
      ? `C: ${negative}/${scored.length} SURF_LEARN names negative after RT`
      : `C: ${negative}/${scored.length} SURF_LEARN names negative after RT (need majority)`,
  };
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

/**
 * 2-of-3 red-day trigger. Quiet unless two legs fire.
 * Armed = 2+ legs, no working sleeve to exit.
 * Fired = 2+ legs and at least one working seat above dust (recommend exit + trough).
 * Never places.
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
  const buys = buyTroughCandidates(snapshot, display);

  if (count < 2) {
    return {
      status: "quiet",
      reasons,
      legs,
      active: false,
      recommendations: { exitWorkingToDust: [], buyTrough: [] },
      whispers: display,
    };
  }

  const fired = exits.length > 0;
  const status = fired ? "fired" : "armed";
  if (fired) {
    reasons.push(`recommend exit_working_to_dust on ${exits.map((e) => e.symbol).join(", ")} — leave dust, never flatten banks`);
  } else {
    reasons.push("RED_DAY armed — no working seat above dust to sleeve");
  }

  return {
    status,
    reasons,
    legs,
    active: true,
    recommendations: {
      exitWorkingToDust: fired ? exits : [],
      buyTrough: fired ? buys : [],
    },
    whispers: display,
  };
}

export const redDayTrigger = {
  evaluate: evaluateRedDay,
};
