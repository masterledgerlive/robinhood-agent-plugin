import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AGENTIC_MOVE_EQ,
  takeProfitMark,
  takeProfitPct,
  stopMark,
  stopPct,
  whisperCascadeScore,
} from "../src/trail/equation.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { armTokenTriggers } from "../src/trail/triggers.js";
import { watch15m } from "../src/trail/watcher.js";
import { rankWaves, waveOf } from "../src/trail/wave.js";
import type { PortfolioSnapshot, WhisperCard } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

describe("AGENTIC_MOVE_EQ", () => {
  it("matches DIVIDEND_15M sleeve exit floors", () => {
    assert.equal(AGENTIC_MOVE_EQ.id, "AGENTIC_MOVE_EQ_v4");
    assert.equal(takeProfitPct(0), 0.012);
    assert.equal(stopPct(0), 0.02);
    // Wide spread: TP = 1.5×spread, stop = 2×spread
    assert.ok(Math.abs(takeProfitPct(0.02) - 0.03) < 1e-12);
    assert.ok(Math.abs(stopPct(0.02) - 0.04) < 1e-12);
    assert.ok(Math.abs(takeProfitMark(100, 0.01) - 101.5) < 1e-9);
    assert.ok(Math.abs(stopMark(100, 0.01) - 98) < 1e-9);
  });

  it("scores cascade whispers without inventing sources", () => {
    const cards: WhisperCard[] = [
      {
        whisper_id: "w1",
        heard_at: "2026-09-18T17:00:00.000Z",
        source: "cascade_desk_a",
        theme: "token_specific",
        tokens: ["WLD"],
        route_hint: "buy_trough",
        confidence: 0.8,
        status: "quarantine",
      },
      {
        whisper_id: "w2",
        heard_at: "2026-09-18T17:05:00.000Z",
        source: "cascade_desk_b",
        theme: "token_specific",
        tokens: ["WLD-USD"],
        route_hint: "buy_trough",
        confidence: 0.6,
        status: "quarantine",
      },
    ];
    const score = whisperCascadeScore(cards, "WLD");
    assert.equal(score.route, "buy_trough");
    assert.equal(score.sources.length, 2);
    assert.ok(score.score > 0.5);
    assert.match(score.equation, /whisper_score=/);
  });
});

describe("pure wave functions", () => {
  it("scores trough reclaim from tape only", () => {
    const snap = loadExample("alert-trough.example.json");
    const wave = waveOf(snap, "WLD");
    assert.ok(wave);
    assert.equal(wave!.kind, "trough_reclaim");
    assert.ok(wave!.amplitude > 0);
    assert.equal(wave!.agentRequired, undefined);
    assert.match(wave!.equation, /trough_reclaim/);
  });

  it("ranks waves deterministically with no agent", () => {
    const ranked = rankWaves(loadExample("quiet.example.json"));
    assert.ok(ranked.length >= 3);
    assert.ok(ranked.every((w) => typeof w.equation === "string"));
  });
});

describe("per-token triggers", () => {
  it("arms bank holds + candidate waves on quiet fixture without waking WATCH", () => {
    const snap = loadExample("quiet.example.json");
    const watch = watch15m(snap);
    assert.equal(watch.status, "quiet");
    assert.equal(watch.triggers.agentRequired, false);
    assert.equal(watch.triggers.eqId, "AGENTIC_MOVE_EQ_v4");
    const near = watch.triggers.tokens.find((t) => t.symbol.startsWith("NEAR"));
    assert.ok(near);
    assert.equal(near!.role, "bank");
    assert.equal(near!.where, "hold_bank");
    assert.equal(near!.agentRequired, false);
    assert.ok(watch.triggers.waves.length >= 1);
  });

  it("arms TP/stop broker alert specs on working seats from wave equation", () => {
    const snap = loadExample("triggers-working.example.json");
    const plan = armTokenTriggers(snap);
    const wld = plan.tokens.find((t) => t.symbol.startsWith("WLD"));
    assert.ok(wld);
    assert.equal(wld!.role, "working");
    // Mark 0.83 already clears TP from basis 0.8 — state is fired; specs still armed from equation.
    assert.ok(wld!.state === "fired" || wld!.state === "armed");
    assert.ok(wld!.when.takeProfitMark !== undefined);
    assert.ok(wld!.when.stopMark !== undefined);
    assert.ok(wld!.brokerAlerts.some((a) => a.purpose === "take_profit"));
    assert.ok(wld!.brokerAlerts.some((a) => a.purpose === "stop"));
    assert.equal(wld!.agentRequired, false);
    assert.match(wld!.when.equation, /tp=max/);
  });

  it("fires working take-profit when mark clears TP threshold", () => {
    const snap = loadExample("triggers-working.example.json");
    // Push mark above TP: basis 0.8, spread ~0.48% → TP ≈ 0.8 * 1.012 = 0.8096; already mark 0.83
    const plan = armTokenTriggers(snap);
    const wld = plan.tokens.find((t) => t.symbol.startsWith("WLD"))!;
    assert.equal(wld.state, "fired");
    assert.ok((wld.when.takeProfitMark ?? 0) < 0.83);
    const watch = watch15m(snap);
    assert.equal(watch.status, "alert");
  });
});
