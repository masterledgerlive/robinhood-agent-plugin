import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DIVIDEND_15M, SURF_LEARN } from "../src/trail/constants.js";
import { gateProfile, refuseNewWorkingEntry } from "../src/trail/gates.js";
import { SuccessLedger } from "../src/trail/ledger.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";
import { evaluateTrick } from "../src/tricks/catalog.js";
import type { PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

describe("DIVIDEND_15M + SURF_LEARN", () => {
  it("uses the Game-default gate profile", () => {
    const quiet = loadExample("quiet.example.json");
    assert.equal(quiet.mode, "DIVIDEND_15M");
    const profile = gateProfile(quiet);
    assert.equal(profile.id, "DIVIDEND_15M");
    assert.equal(profile.maxNewWorkingEntriesPerDay, 8);
    assert.equal(profile.maxWorkingSeats, 4);
    assert.equal(profile.maxSpread, 0.012);
    assert.equal(profile.minEdgeMultipleOfRtSpread, 1.5);
    assert.equal(profile.softHaltRealizedUsd, -2);
    assert.equal(profile.expectancyHaltLosingWorkingRts, 8);
    assert.equal(DIVIDEND_15M.bankDustFloorUsd, 0.25);
  });

  it("keeps a quiet live book while SURF_LEARN still ranks paper what-ifs", () => {
    const ledger = new SuccessLedger({ example: true });
    const watch = watch15m(loadExample("quiet.example.json"), ledger);
    assert.equal(watch.status, "quiet");
    assert.equal(watch.candidates.length, 0);
    assert.ok(watch.learn.whatIfTop.length >= 1);
    assert.ok(watch.learn.whatIfTop.length <= SURF_LEARN.topN);
    assert.equal(watch.learn.whatIfTop[0]?.rank, 1);
    assert.match(watch.learn.whatIfTop[0]?.path_id ?? "", /^surf:/);
    const paper = ledger.statsFor({ trick_id: "momentum_15m" }, { kind: "paper_surf" });
    assert.ok(paper.attempts >= 1);
    assert.ok(paper.success_rate !== null || paper.attempts === 0);
  });

  it("does not promote momentum to live without ≥3 paper trials at ≥50%", () => {
    const quiet = loadExample("quiet.example.json");
    assert.equal(evaluateTrick("momentum_15m", quiet).eligible, true);
    const watch = watch15m(quiet);
    assert.equal(
      watch.candidates.some((c) => c.trick_id === "momentum_15m"),
      false,
    );
    assert.equal(watch.nextMove.action, "hold");
    assert.equal(watch.nextMove.live, false);
  });

  it("blocks live micros when buying power is under $2 but still learns", () => {
    const broke: PortfolioSnapshot = {
      ...loadExample("alert-trough.example.json"),
      mode: "DIVIDEND_15M",
      buyingPowerUsd: 1.5,
    };
    assert.match(refuseNewWorkingEntry(broke) ?? "", /learn only/);
    const watch = watch15m(broke);
    assert.equal(watch.learn.liveMicroOk, false);
    assert.equal(
      watch.candidates.some((c) => c.trick_id === "trough_bounce_15m"),
      false,
    );
    assert.equal(watch.learn.ran, true);
  });

  it("records paper_surf what-if PnL without an order id; live still requires one", () => {
    const ledger = new SuccessLedger({ example: true });
    ledger.recordAttempt({
      attempt_id: "paper-1",
      path_id: "surf:hold_bank:NEAR",
      trick_id: "hold_bank",
      timestamp: "2026-09-18T17:00:00.000Z",
      order_ids: [],
      realized_pnl: 0.02,
      spread_at_entry: 0.007,
      outcome: "win",
      kind: "paper_surf",
    });
    assert.equal(ledger.statsFor({ trick_id: "hold_bank" }, { kind: "paper_surf" }).wins, 1);
    assert.equal(ledger.statsFor({ trick_id: "hold_bank" }).attempts, 0);
  });
});
