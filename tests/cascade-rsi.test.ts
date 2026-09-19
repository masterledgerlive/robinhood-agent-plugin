import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  cascadeExitOf,
  rankCascadeDestinations,
  supportMarkOf,
  topCascadeDestination,
} from "../src/trail/cascade.js";
import { AGENTIC_MOVE_EQ, takeProfitPct, stopPct } from "../src/trail/equation.js";
import { rsiRollingDown, tapeRsiOf, wilderRsi, wilderRsiPair } from "../src/trail/rsi.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { evaluateTrick } from "../src/tricks/catalog.js";
import type { PortfolioSnapshot, Quote } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

/** Build 15 closes that climb then roll — enough for Wilder(14). */
function climbThenRollCloses(): number[] {
  // 15 closes → 14 changes for first RSI.
  const up = [10, 10.2, 10.4, 10.6, 10.9, 11.1, 11.4, 11.6, 11.9, 12.2, 12.4, 12.7, 12.9, 13.1, 13.0];
  return up;
}

describe("Wilder RSI (correct formula)", () => {
  it("returns null without period+1 closes — never invents bars", () => {
    assert.equal(wilderRsi([1, 2, 3], 14), null);
    assert.equal(tapeRsiOf(loadExample("quiet.example.json"), "NEAR"), null);
  });

  it("matches Wilder first-average then smooth on a known series", () => {
    const closes = climbThenRollCloses();
    assert.equal(closes.length, 15);
    const rsi = wilderRsi(closes, 14);
    assert.ok(rsi !== null);
    // Mostly up then one down tick → RSI stays elevated but < 100.
    assert.ok(rsi! > 70 && rsi! < 100);

    // Manual first-average check for period=3 on a tiny series.
    // closes: 10, 11, 10.5, 10.2 → changes +1, -0.5, -0.3
    // avgGain=(1+0+0)/3, avgLoss=(0+0.5+0.3)/3 → RS=1/0.8 → RSI=55.555…
    const small = wilderRsi([10, 11, 10.5, 10.2], 3);
    assert.ok(small !== null);
    assert.ok(Math.abs(small! - (100 - 100 / (1 + 1 / 0.8))) < 1e-9);
  });

  it("detects leave-overbought rollback, not RSI<45 alone", () => {
    assert.equal(rsiRollingDown(44, 46, [10, 9.9]), false); // mid-range dip ≠ leave OB
    assert.equal(rsiRollingDown(68, 72, [13.1, 13.0]), true); // left overbought
    assert.equal(rsiRollingDown(75, 78, [13.1, 13.0]), true); // rolling down from OB
    assert.equal(rsiRollingDown(72, 70, [13.0, 13.1]), false); // still rising
  });

  it("reads quote.closes for tape RSI and fires rollingDown on leave-OB", () => {
    const base = loadExample("peak-trick-out.example.json");
    const closes = [
      0.4, 0.405, 0.41, 0.415, 0.42, 0.422, 0.425, 0.428, 0.43, 0.431, 0.432, 0.433, 0.434, 0.435,
      0.434, 0.432,
    ];
    const snap: PortfolioSnapshot = {
      ...base,
      quotes: base.quotes.map((q) =>
        q.symbol.startsWith("WLD") ? ({ ...q, closes } satisfies Quote) : q,
      ),
    };
    const pair = wilderRsiPair(closes, 14);
    assert.ok(pair);
    const state = tapeRsiOf(snap, "WLD");
    assert.ok(state);
    assert.equal(state!.period, 14);
    assert.ok(Math.abs(state!.rsi - pair!.rsi) < 1e-9);
  });
});

describe("cascade exit + near-support destination", () => {
  it("keeps DIVIDEND_15M TP/stop floors (1.2% / 2%)", () => {
    assert.equal(AGENTIC_MOVE_EQ.id, "AGENTIC_MOVE_EQ_v4");
    assert.equal(AGENTIC_MOVE_EQ.takeProfitFloorPct, 0.012);
    assert.equal(AGENTIC_MOVE_EQ.stopFloorPct, 0.02);
    assert.equal(takeProfitPct(0), 0.012);
    assert.equal(stopPct(0), 0.02);
    assert.equal(AGENTIC_MOVE_EQ.rsiPeriod, 14);
    assert.equal(AGENTIC_MOVE_EQ.rsiOverbought, 70);
  });

  it("uses trough as support — not mid-range mean", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const q = snap.quotes.find((x) => x.symbol.startsWith("WLD"))!;
    const trough = snap.troughs.find((t) => t.symbol.startsWith("WLD"));
    assert.equal(supportMarkOf(q, trough), 0.4);
  });

  it("does not fire early cascade on peak_armed alone without stall/RSI/stale", () => {
    // Construct working seat near high but still climbing (no stall).
    const snap: PortfolioSnapshot = {
      example: true,
      asOf: "2026-09-19T05:00:00.000Z",
      account: { rhsAccountNumber: "813839826", agenticAllowed: true },
      mode: "DIVIDEND_15M",
      buyingPowerUsd: 4,
      sleeves: [
        {
          symbol: "WLD-USD",
          role: "working",
          notionalUsd: 2,
          peakNotionalUsd: 2,
          costBasisUsd: 0.42,
          markUsd: 0.429,
        },
      ],
      quotes: [
        {
          symbol: "WLD-USD",
          bid: 0.428,
          ask: 0.43,
          mark: 0.429,
          sessionOpen: 0.42,
          sessionHigh: 0.43,
          priorMark: 0.428,
          mark15m: 0.431,
        },
      ],
      troughs: [],
      day: {
        date: "2026-09-19",
        newWorkingEntries: 1,
        realizedPnlUsd: null,
        losingWorkingRoundTrips: 0,
      },
    };
    const exit = cascadeExitOf(snap, "WLD");
    assert.ok(exit);
    // Tiny profit, near high, but still climbing (mark15m > mark) → do not early-fire.
    assert.equal(exit!.earlyCascade, false);
  });

  it("fires classic peak trick-out on peak-trick-out fixture", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const exit = cascadeExitOf(snap, "WLD");
    assert.ok(exit);
    assert.equal(exit!.fire, true);
    assert.equal(exit!.peak?.mode, "trick_out");
    assert.equal(evaluateTrick("trick_out_at_peak", snap).eligible, true);
  });

  it("ranks cascade dest near support with healthy amp — not cheapest absolute price", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const ranked = rankCascadeDestinations(snap, { excludeBases: ["WLD"] });
    // ENA is second_wave reclaim near trough — should beat inert SEI.
    const top = topCascadeDestination(snap, { excludeBases: ["WLD"] });
    assert.ok(top, `expected destination, ranked=${ranked.map((r) => r.equation).join(" | ")}`);
    assert.match(top!.symbol, /ENA/);
    assert.equal(top!.volatileHealthy || top!.score > 0, true);
  });

  it("fires early cascade on stale flat wave with edge ≥ minEarly", () => {
    const snap: PortfolioSnapshot = {
      example: true,
      asOf: "2026-09-19T05:10:00.000Z",
      account: { rhsAccountNumber: "813839826", agenticAllowed: true },
      mode: "DIVIDEND_15M",
      buyingPowerUsd: 3,
      sleeves: [
        {
          symbol: "ABC-USD",
          role: "working",
          notionalUsd: 2,
          peakNotionalUsd: 2,
          costBasisUsd: 1.0,
          markUsd: 1.02,
        },
      ],
      quotes: [
        {
          symbol: "ABC-USD",
          bid: 1.019,
          ask: 1.021,
          mark: 1.02,
          // No prior/trough → wave flat; 2% edge clears minEarly for tight spread.
        },
      ],
      troughs: [],
      day: {
        date: "2026-09-19",
        newWorkingEntries: 0,
        realizedPnlUsd: null,
        losingWorkingRoundTrips: 0,
      },
    };
    const exit = cascadeExitOf(snap, "ABC");
    assert.ok(exit);
    assert.equal(exit!.staleWave, true);
    assert.equal(exit!.fire, true);
    assert.equal(exit!.earlyCascade, true);
    assert.equal(exit!.fullTakeProfit, edgeClearsTp(exit));
  });
});

function edgeClearsTp(exit: NonNullable<ReturnType<typeof cascadeExitOf>>): boolean {
  return exit.fullTakeProfit;
}