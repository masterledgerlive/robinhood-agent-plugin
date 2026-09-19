import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENTIC_MOVE_EQ } from "../src/trail/equation.js";
import { higherPeakMark, peakOf, peakPullbackAlertMark } from "../src/trail/peak.js";
import { rankPrimedTokens, topPrimedToken } from "../src/trail/prime.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";
import { evaluateTrick } from "../src/tricks/catalog.js";
import type { PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

describe("peak + primed rotate + second wave", () => {
  it("exports v3 peak / second-wave / credit knobs", () => {
    assert.equal(AGENTIC_MOVE_EQ.id, "AGENTIC_MOVE_EQ_v3");
    assert.equal(AGENTIC_MOVE_EQ.peakArmProximity, 0.985);
    assert.equal(AGENTIC_MOVE_EQ.higherPeakExtension, 0.015);
    assert.equal(AGENTIC_MOVE_EQ.creditsPerQuietWatch, 0);
    assert.equal(AGENTIC_MOVE_EQ.creditsPerAlertStepIn, 1);
  });

  it("arms peak and fires trick_out when stall + near high", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const peak = peakOf(snap, "WLD");
    assert.ok(peak);
    assert.equal(peak!.mode, "trick_out");
    assert.ok(peak!.stall);
    const alert = peakPullbackAlertMark(snap, "WLD");
    assert.ok(alert !== null && alert! < peak!.localHigh);
  });

  it("marks ENA as second_wave reclaim toward a higher peak", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const peak = peakOf(snap, "ENA");
    assert.ok(peak);
    assert.equal(peak!.mode, "second_wave");
    assert.equal(peak!.reclaiming, true);
    const higher = higherPeakMark(snap, "ENA");
    assert.ok(higher !== null && higher! > peak!.localHigh);
  });

  it("ranks second_wave ENA as primed destination after WLD trick-out", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const ranked = rankPrimedTokens(snap, { excludeBases: ["WLD"] });
    assert.ok(ranked.length >= 1);
    const top = topPrimedToken(snap, { excludeBases: ["WLD"] });
    assert.ok(top, `expected positive prime score, got ${ranked[0]?.equation}`);
    assert.match(top!.symbol, /ENA/);
    assert.ok(top!.score > 0);
    assert.equal(top!.peak?.mode, "second_wave");
  });

  it("trick_out_at_peak wins SURF_ACT over second_wave when both clear", () => {
    const snap = loadExample("peak-trick-out.example.json");
    assert.equal(evaluateTrick("trick_out_at_peak", snap).eligible, true);
    assert.equal(evaluateTrick("second_wave_reentry", snap).eligible, true);
    const watch = watch15m(snap);
    assert.equal(watch.status, "alert");
    assert.equal(watch.nextMove.action, "trick_out");
    assert.equal(watch.nextMove.trick_id, "trick_out_at_peak");
  });

  it("second_wave_reentry is the next move when no peak trick-out seat exists", () => {
    const snap = loadExample("peak-trick-out.example.json");
    const noWorking = {
      ...snap,
      sleeves: snap.sleeves.filter((s) => s.role !== "working"),
    };
    const watch = watch15m(noWorking);
    assert.equal(watch.nextMove.action, "second_wave");
    assert.equal(watch.nextMove.trick_id, "second_wave_reentry");
    assert.match(watch.nextMove.symbol ?? "", /ENA/);
  });
});
