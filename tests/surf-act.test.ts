import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SURF_ACT, SURF_LEARN } from "../src/trail/constants.js";
import { SuccessLedger } from "../src/trail/ledger.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { recommendNextMove } from "../src/trail/surf-act.js";
import { watch15m } from "../src/trail/watcher.js";
import type { LedgerAttempt, PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

function seedPaper(ledger: SuccessLedger, trickId: string, wins: number, losses = 0): void {
  let i = 0;
  const write = (outcome: "win" | "loss") => {
    i += 1;
    const attempt: LedgerAttempt = {
      attempt_id: `paper-seed-${trickId}-${i}`,
      path_id: `surf:${trickId}:SEED`,
      trick_id: trickId,
      timestamp: `2026-09-18T15:${String(i).padStart(2, "0")}:00.000Z`,
      order_ids: [],
      realized_pnl: outcome === "win" ? 0.02 : -0.01,
      spread_at_entry: 0.004,
      outcome,
      kind: "paper_surf",
    };
    ledger.recordAttempt(attempt);
  };
  for (let n = 0; n < wins; n += 1) write("win");
  for (let n = 0; n < losses; n += 1) write("loss");
}

function withWorkingProfitAndTrough(base: PortfolioSnapshot): PortfolioSnapshot {
  return {
    ...base,
    sleeves: [
      ...base.sleeves,
      {
        symbol: "WLD-USD",
        role: "working",
        notionalUsd: 2.2,
        peakNotionalUsd: 2.2,
        costBasisUsd: 2.0,
        markUsd: 2.12,
      },
    ],
    quotes: [
      ...base.quotes.filter((q) => q.symbol !== "WLD-USD" && q.symbol !== "ENA-USD"),
      { symbol: "WLD-USD", bid: 0.802, ask: 0.806, mark: 0.804, priorMark: 0.8, mark15m: 0.818 },
      { symbol: "ENA-USD", bid: 0.5, ask: 0.502, mark: 0.498, priorMark: 0.49, mark15m: 0.505 },
    ],
    troughs: [
      {
        symbol: "ENA-USD",
        troughMark: 0.49,
        troughAt: "2026-09-18T16:50:00.000Z",
        windowMinutes: 15,
        recentHigh: 0.51,
      },
    ],
  };
}

describe("SURF_ACT next move", () => {
  it("exports accumulate-first then proven-enter preference", () => {
    assert.equal(SURF_ACT.id, "SURF_ACT");
    assert.deepEqual([...SURF_ACT.accumulateOrder], ["park_to_near", "park_to_chip"]);
    assert.deepEqual([...SURF_ACT.trickOutPreference], ["trick_out_at_peak"]);
    assert.deepEqual([...SURF_ACT.secondWavePreference], ["second_wave_reentry"]);
    assert.deepEqual([...SURF_ACT.greenOnlyPreference], ["park_green_only"]);
    assert.deepEqual([...SURF_ACT.enterPreference], [
      "trough_bounce_15m",
      "mean_revert_15m",
      "momentum_15m",
    ]);
    assert.equal(SURF_LEARN.momentumLiveMinTrials, 3);
    assert.equal(SURF_LEARN.momentumLiveMinWinRate, 0.5);
    assert.equal(SURF_LEARN.momentumGraduateMinTrials, 10);
    assert.equal(SURF_LEARN.momentumGraduateMinWinRate, 0.55);
  });

  it("keeps quiet live books on hold while paper still ranks", () => {
    const watch = watch15m(loadExample("quiet.example.json"));
    assert.equal(watch.status, "quiet");
    assert.equal(watch.nextMove.action, "hold");
    assert.equal(watch.nextMove.trick_id, "hold_bank");
    assert.equal(watch.nextMove.live, false);
    assert.ok(watch.learn.whatIfTop.length >= 1);
  });

  it("does not unlock momentum at 2 paper wins (need 3 trials)", () => {
    const ledger = new SuccessLedger({ example: true });
    seedPaper(ledger, "momentum_15m", 2);
    const watch = watch15m(loadExample("quiet.example.json"), ledger);
    assert.equal(
      watch.candidates.some((c) => c.trick_id === "momentum_15m"),
      false,
    );
    assert.equal(watch.nextMove.action, "hold");
    assert.equal(watch.nextMove.live, false);
  });

  it("does not unlock momentum at 3 trials under 50%", () => {
    const ledger = new SuccessLedger({ example: true });
    seedPaper(ledger, "momentum_15m", 1, 2);
    const paper = ledger.statsFor({ trick_id: "momentum_15m" }, { kind: "paper_surf" });
    assert.equal(paper.attempts, 3);
    assert.ok(paper.success_rate !== null && paper.success_rate < 0.5);
    const watch = watch15m(loadExample("quiet.example.json"), ledger);
    assert.equal(
      watch.candidates.some((c) => c.trick_id === "momentum_15m"),
      false,
    );
  });

  it("unlocks momentum after ≥3 paper trials at ≥50% and recommends one enter", () => {
    const ledger = new SuccessLedger({ example: true });
    seedPaper(ledger, "momentum_15m", 3);
    const quiet = loadExample("quiet.example.json");
    const watch = watch15m(quiet, ledger);
    const mom = watch.candidates.find((c) => c.trick_id === "momentum_15m");
    assert.ok(mom);
    assert.equal(mom.symbol, "ENA-USD");
    assert.equal(watch.nextMove.action, "enter");
    assert.equal(watch.nextMove.trick_id, "momentum_15m");
    assert.equal(watch.nextMove.symbol, "ENA-USD");
    assert.equal(watch.nextMove.live, true);
    assert.match(watch.nextMove.reason, /No place/);
  });

  it("parks working profit into NEAR before taking a trough seat", () => {
    const snap = withWorkingProfitAndTrough(loadExample("quiet.example.json"));
    const watch = watch15m(snap);
    assert.equal(watch.status, "alert");
    assert.ok(watch.candidates.some((c) => c.trick_id === "park_to_near"));
    assert.ok(watch.candidates.some((c) => c.trick_id === "trough_bounce_15m"));
    assert.equal(watch.nextMove.action, "accumulate");
    assert.equal(watch.nextMove.trick_id, "park_to_near");
    assert.equal(watch.nextMove.symbol, "NEAR");
    assert.equal(watch.nextMove.live, true);
    assert.match(watch.nextMove.reason, /Accumulate/);
  });

  it("enters trough when that is the only live seat and no park fires", () => {
    const watch = watch15m(loadExample("alert-trough.example.json"));
    assert.equal(watch.status, "alert");
    assert.equal(watch.nextMove.action, "enter");
    assert.equal(watch.nextMove.trick_id, "trough_bounce_15m");
    assert.equal(watch.nextMove.live, true);
  });

  it("recommendNextMove stays hold when learn ranks a non-bank winner and nothing is live", () => {
    const move = recommendNextMove({
      candidates: [],
      learn: {
        ran: true,
        notionalUsd: 2,
        liveMicroOk: true,
        whatIfTop: [
          {
            path_id: "surf:momentum_15m:ENA",
            trick_id: "momentum_15m",
            symbol: "ENA-USD",
            notionalUsd: 2,
            whatIfPnlUsd: 0.05,
            spreadAtEntry: 0.004,
            liveClears: false,
            rank: 1,
          },
        ],
      },
      redDay: {
        status: "quiet",
        reasons: [],
        legs: { whisper: false, book: false, tape: false },
        active: false,
        recommendations: { exitWorkingToDust: [], buyTrough: [] },
        whispers: [],
      },
    });
    assert.equal(move.action, "hold");
    assert.equal(move.live, false);
  });
});
