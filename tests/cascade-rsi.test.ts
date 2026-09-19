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
import {
  AGENTIC_MOVE_EQ,
  asPct,
  cascadeJumpOutMark,
  cascadeJumpOutThreshold,
  takeProfitPct,
  stopPct,
} from "../src/trail/equation.js";
import { DIVIDEND_15M, SURF_ACT } from "../src/trail/constants.js";
import {
  collectBrokerAlertSpecs,
  prioritizeCascadeAlerts,
  syncMathAlertsToBroker,
} from "../src/trail/alert-bridge.js";
import { rsiRollingDown, tapeRsiOf, wilderRsi, wilderRsiPair } from "../src/trail/rsi.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { armTokenTriggers } from "../src/trail/triggers.js";
import { watch15m } from "../src/trail/watcher.js";
import { evaluateTrick } from "../src/tricks/catalog.js";
import type { PortfolioSnapshot, Quote, TriggerBrokerAlertSpec } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

/** Build 15 closes that climb then roll — enough for Wilder(14). */
function climbThenRollCloses(): number[] {
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
    assert.ok(rsi! > 70 && rsi! < 100);

    const small = wilderRsi([10, 11, 10.5, 10.2], 3);
    assert.ok(small !== null);
    assert.ok(Math.abs(small! - (100 - 100 / (1 + 1 / 0.8))) < 1e-9);
  });

  it("detects leave-overbought rollback, not RSI<45 alone", () => {
    assert.equal(rsiRollingDown(44, 46, [10, 9.9]), false);
    assert.equal(rsiRollingDown(68, 72, [13.1, 13.0]), true);
    assert.equal(rsiRollingDown(75, 78, [13.1, 13.0]), true);
    assert.equal(rsiRollingDown(72, 70, [13.0, 13.1]), false);
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

describe("cascade %-hit jump-out + near-support destination", () => {
  it("uses AGENTIC_MOVE_EQ_v5 with %-native jump-out floor", () => {
    assert.equal(AGENTIC_MOVE_EQ.id, "AGENTIC_MOVE_EQ_v5");
    assert.equal(AGENTIC_MOVE_EQ.takeProfitFloorPct, 0.012);
    assert.equal(AGENTIC_MOVE_EQ.stopFloorPct, 0.02);
    assert.equal(AGENTIC_MOVE_EQ.cascadeJumpOutPct, 0.003);
    assert.equal(asPct(AGENTIC_MOVE_EQ.cascadeJumpOutPct), 0.3);
    assert.equal(takeProfitPct(0), 0.012);
    assert.equal(stopPct(0), 0.02);
    assert.equal(SURF_ACT.cascadeRotatesPerSlot, 10);
    assert.equal(SURF_ACT.preferNewEntriesPerSlot, 10);
    assert.equal(DIVIDEND_15M.maxNewWorkingEntriesPerDay, 240);
    assert.equal(DIVIDEND_15M.maxWorkingSeats, 8);
  });

  it("uses trough as support — not mid-range mean", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const q = snap.quotes.find((x) => x.symbol.startsWith("WLD"))!;
    const trough = snap.troughs.find((t) => t.symbol.startsWith("WLD"));
    assert.equal(supportMarkOf(q, trough), 0.4);
  });

  it("does not fire jump-out when edgePct is below jumpOutPct (still climbing)", () => {
    // Tiny profit below 0.3% floor — must not cascade yet.
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
          costBasisUsd: 0.428,
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
    assert.ok(exit!.edgePct !== null && exit!.edgePct < exit!.jumpOutPct);
    assert.equal(exit!.jumpOutHit, false);
    assert.equal(exit!.earlyCascade, false);
    assert.equal(exit!.fire, false);
  });

  it("jumps out the instant edgePct ≥ jumpOutPct — no stale/RSI/failedPeak wait", () => {
    const snap: PortfolioSnapshot = {
      example: true,
      asOf: "2026-09-19T05:05:00.000Z",
      account: { rhsAccountNumber: "813839826", agenticAllowed: true },
      mode: "DIVIDEND_15M",
      buyingPowerUsd: 5,
      sleeves: [
        {
          symbol: "XYZ-USD",
          role: "working",
          notionalUsd: 2,
          peakNotionalUsd: 2,
          costBasisUsd: 1.0,
          markUsd: 1.004,
        },
      ],
      quotes: [
        {
          symbol: "XYZ-USD",
          // Tight spread so jumpOut ≈ 0.3% micro floor; 0.4% edge clears it.
          bid: 0.9995,
          ask: 1.0005,
          mark: 1.004,
          sessionOpen: 1.0,
          sessionHigh: 1.01,
          priorMark: 1.003,
          mark15m: 1.005, // still climbing — no stall
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
    const exit = cascadeExitOf(snap, "XYZ");
    assert.ok(exit);
    assert.equal(exit!.staleWave, false);
    assert.equal(exit!.rsiRollingDown, false);
    assert.equal(exit!.failedPeakBreak, false);
    assert.equal(exit!.jumpOutHit, true);
    assert.equal(exit!.fire, true);
    assert.match(exit!.equation, /edgePct=/);
    assert.match(exit!.equation, /jumpOutPct=/);
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
    const top = topCascadeDestination(snap, { excludeBases: ["WLD"] });
    assert.ok(top, `expected destination, ranked=${ranked.map((r) => r.equation).join(" | ")}`);
    assert.match(top!.symbol, /ENA/);
    assert.equal(top!.volatileHealthy || top!.score > 0, true);
    assert.ok(typeof top!.amplitudePct === "number");
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
    assert.equal(exit!.jumpOutHit, true);
    assert.equal(exit!.earlyCascade, true);
    assert.equal(exit!.fire, true);
  });

  it("arms cascade_jump_out broker alert so Robinhood can act on % hit", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const plan = armTokenTriggers(snap);
    const wld = plan.tokens.find((t) => t.symbol.startsWith("WLD"));
    assert.ok(wld);
    assert.ok(wld!.when.cascadeJumpOutMark !== undefined);
    assert.ok(wld!.brokerAlerts.some((a) => a.purpose === "cascade_jump_out"));
    const jump = wld!.brokerAlerts.find((a) => a.purpose === "cascade_jump_out")!;
    assert.equal(jump.condition_type, "price_above");
    assert.equal(jump.asset_class, "crypto");
  });

  it("syncMathAlertsToBroker creates cascade_jump_out without LLM", async () => {
    const snap = loadExample("peak-trick-out.example.json");
    const plan = armTokenTriggers(snap);
    const created: TriggerBrokerAlertSpec[] = [];
    const result = await syncMathAlertsToBroker(plan, {
      async createAlert(spec) {
        created.push(spec);
        return { ok: true };
      },
    });
    assert.ok(result.created >= 1);
    assert.ok(created.some((s) => s.purpose === "cascade_jump_out"));
    const prioritized = prioritizeCascadeAlerts(collectBrokerAlertSpecs(plan));
    assert.equal(prioritized[0]?.purpose, "cascade_jump_out");
  });

  it("watch15m exposes cascadeMoves capacity ≥ 10", () => {
    const watch = watch15m(loadExample("peak-trick-out.example.json"));
    assert.equal(watch.cascadeMoves.capacity, 10);
    assert.ok(watch.cascadeMoves.moves.length >= 1);
    assert.equal(watch.triggers.eqId, "AGENTIC_MOVE_EQ_v5");
  });

  it("cascadeJumpOutMark matches threshold from cost", () => {
    const thr = cascadeJumpOutThreshold({ rt: 0.002 });
    assert.ok(thr >= AGENTIC_MOVE_EQ.cascadeJumpOutPct);
    const mark = cascadeJumpOutMark(1.0, 0.002);
    assert.ok(Math.abs(mark - (1 + thr)) < 1e-12);
  });

  it("uses sessionOpen as edge basis when cost is missing (live transfers)", () => {
    const snap: PortfolioSnapshot = {
      example: true,
      asOf: "2026-09-19T21:00:00.000Z",
      account: { rhsAccountNumber: "813839826", agenticAllowed: true },
      mode: "DIVIDEND_15M",
      buyingPowerUsd: 1.8,
      sleeves: [
        {
          symbol: "ENA-USD",
          role: "working",
          notionalUsd: 0.12,
          peakNotionalUsd: 0.12,
          markUsd: 0.1988,
        },
      ],
      quotes: [
        {
          symbol: "ENA-USD",
          bid: 0.196,
          ask: 0.2,
          mark: 0.1988,
          sessionOpen: 0.1833,
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
    const exit = cascadeExitOf(snap, "ENA");
    assert.ok(exit);
    assert.ok(exit!.edgePct !== null && exit!.edgePct > 5);
    assert.equal(exit!.jumpOutHit, true);
    assert.equal(exit!.fire, true);
  });
});
