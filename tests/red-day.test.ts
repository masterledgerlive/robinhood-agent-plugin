import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatTrailView } from "../src/log/trail-view.js";
import { everythingGoingRed, rankGreenOnly } from "../src/trail/green-only.js";
import { redDayTrigger } from "../src/trail/red-day.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";
import { loadWhisperFile } from "../src/trail/whisper.js";
import type { PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

describe("RED_DAY + whispers", () => {
  it("keeps a quiet book quiet even with one quarantined rumor", () => {
    const quiet = loadExample("quiet.example.json");
    const whispers = loadWhisperFile(join(here, "fixtures/trail/whispers-quiet.example.json"));
    assert.equal(whispers[0]?.status, "quarantine");
    const ev = redDayTrigger.evaluate(quiet, whispers);
    assert.equal(ev.status, "quiet");
    assert.equal(ev.phase, "quiet");
    assert.equal(ev.active, false);
    assert.equal(ev.recommendations.exitWorkingToDust.length, 0);

    const watch = watch15m(quiet, undefined, whispers);
    assert.equal(watch.status, "quiet");
    assert.equal(watch.redDay.status, "quiet");
    assert.equal(watch.learn.ran, true);
  });

  it("fires on 2-of-3 and recommends exit-to-dust + buy_trough without placing", () => {
    const snap = loadExample("red-day-fired.example.json");
    const whispers = loadWhisperFile(join(here, "fixtures/trail/whispers-red-day.example.json"));
    const ev = redDayTrigger.evaluate(snap, whispers);
    assert.equal(ev.status, "fired");
    assert.equal(ev.phase, "defend");
    assert.equal(ev.legs.whisper, true);
    assert.equal(ev.legs.book, true);
    assert.ok(ev.recommendations.exitWorkingToDust.some((s) => s.symbol === "WLD-USD"));
    assert.ok(ev.recommendations.exitWorkingToDust.some((s) => s.symbol === "SEI-USD"));
    assert.ok(ev.recommendations.exitWorkingToDust.every((s) => s.leaveDustUsd > 0));
    assert.ok(ev.recommendations.buyTrough.some((b) => b.symbol.includes("WLD") || b.symbol.includes("SEI")));
    assert.ok(ev.whispers.some((w) => w.status === "confirmed"));

    const watch = watch15m(snap, undefined, whispers);
    assert.equal(watch.status, "alert");
    assert.equal(watch.redDay.status, "fired");
    assert.equal(watch.halt.redDay, true);
    assert.equal(watch.nextMove.action, "red_day_exit");
    assert.equal(watch.nextMove.live, true);
    assert.equal(
      watch.candidates.some((c) => c.trick_id === "momentum_15m" || c.trick_id === "mean_revert_15m"),
      false,
    );

    const view = formatTrailView({ snapshot: snap, watch });
    assert.match(view, /^RED_DAY/m);
    assert.match(view, /status fired/);
    assert.match(view, /phase defend/);
    assert.match(view, /exit_working_to_dust/);
    assert.match(view, /^WHISPERS/m);
    assert.match(view, /example-cascade-red/);
    assert.doesNotMatch(view, /place_crypto_order/);
  });

  it("arms when two legs fire but there is no working seat above dust", () => {
    const quiet = loadExample("quiet.example.json");
    const armedBook: PortfolioSnapshot = {
      ...quiet,
      quotes: quiet.quotes.map((q) => {
        if (q.symbol === "NEAR-USD") {
          return { ...q, mark: 5.0, sessionOpen: 5.2, mark15m: 4.9 };
        }
        return { ...q, mark15m: q.mark * 0.97, sessionOpen: q.mark * 1.05 };
      }),
    };
    const whispers = loadWhisperFile(join(here, "fixtures/trail/whispers-red-day.example.json"));
    const ev = redDayTrigger.evaluate(armedBook, whispers);
    assert.equal(ev.status, "armed");
    assert.equal(ev.recommendations.exitWorkingToDust.length, 0);
    assert.equal(ev.active, true);
  });

  it("lesson 2026-09-19: everything red fires on book+tape without whispers, then green-only shelter", () => {
    const snap = loadExample("red-day-green-only.example.json");
    assert.equal(everythingGoingRed(snap), true);
    const greens = rankGreenOnly(snap);
    assert.ok(greens.some((g) => g.symbol === "ZEC-USD"));
    assert.ok(greens.every((g) => g.climbFromOpen >= 0));

    const ev = redDayTrigger.evaluate(snap, []);
    assert.equal(ev.legs.book, true);
    assert.equal(ev.legs.tape, true);
    assert.equal(ev.legs.whisper, false);
    assert.equal(ev.status, "fired");
    assert.equal(ev.phase, "defend");
    assert.ok(ev.recommendations.exitWorkingToDust.some((s) => s.symbol === "WLD-USD"));
    assert.ok(ev.recommendations.parkGreenOnly.some((g) => g.symbol === "ZEC-USD"));

    const watch = watch15m(snap);
    assert.equal(watch.status, "alert");
    assert.equal(watch.nextMove.action, "red_day_exit");
    assert.equal(watch.triggers.agentRequired, false);
    assert.match(formatTrailView({ snapshot: snap, watch }), /park_green_only/);
    assert.match(formatTrailView({ snapshot: snap, watch }), /ZEC/);
  });

  it("after exits, green-only park is NEXT MOVE until bottoms (agents optional)", () => {
    const snap = loadExample("red-day-green-only.example.json");
    // Sleeve working to dust — only green ZEC dust floor left.
    const sheltered: PortfolioSnapshot = {
      ...snap,
      sleeves: snap.sleeves.map((s) => {
        if (s.role !== "working") return s;
        return { ...s, role: "dust" as const, notionalUsd: 0.1 };
      }),
      buyingPowerUsd: 4,
    };
    const ev = redDayTrigger.evaluate(sheltered, []);
    assert.equal(ev.active, true);
    assert.equal(ev.status, "armed");
    assert.equal(ev.phase, "green_shelter");
    assert.ok(ev.recommendations.parkGreenOnly.some((g) => g.symbol === "ZEC-USD"));

    const watch = watch15m(sheltered);
    assert.equal(watch.nextMove.action, "green_only_park");
    assert.equal(watch.nextMove.trick_id, "park_green_only");
    assert.equal(watch.nextMove.symbol, "ZEC-USD");
    assert.equal(watch.nextMove.live, true);
    assert.equal(watch.triggers.agentRequired, false);
  });

  it("bottoms found → agentless trough re-enter while RED_DAY still active", () => {
    const snap = loadExample("red-day-bottoms.example.json");
    const ev = redDayTrigger.evaluate(snap, []);
    assert.equal(ev.active, true);
    assert.equal(ev.phase, "reenter");
    assert.equal(ev.recommendations.exitWorkingToDust.length, 0);

    const watch = watch15m(snap);
    assert.equal(watch.status, "alert");
    assert.equal(watch.halt.redDay, true);
    assert.ok(
      watch.candidates.some((c) => c.trick_id === "trough_bounce_15m"),
      "trough re-entry must clear while RED_DAY active (lesson: do not soft-halt bottoms forever)",
    );
    assert.equal(watch.nextMove.action, "enter");
    assert.equal(watch.nextMove.trick_id, "trough_bounce_15m");
    assert.match(watch.nextMove.reason, /agentless|Bottoms/i);
    assert.equal(watch.triggers.agentRequired, false);
  });

  it("clears RED_DAY when NEAR reclaims session open", () => {
    const snap = loadExample("red-day-green-only.example.json");
    const cleared: PortfolioSnapshot = {
      ...snap,
      quotes: snap.quotes.map((q) =>
        q.symbol === "NEAR-USD" ? { ...q, mark: 3.78, mark15m: 3.8 } : q,
      ),
      sleeves: snap.sleeves.filter((s) => s.role !== "working"),
    };
    const ev = redDayTrigger.evaluate(cleared, []);
    assert.equal(ev.cleared, true);
    assert.equal(ev.active, false);
    assert.equal(ev.phase, "cleared");
  });

  it("documents the whisper card schema with quarantine", () => {
    const docs = JSON.parse(
      readFileSync(join(here, "../docs/schemas/whisper-card.schema.json"), "utf8"),
    ) as { properties: { status: { enum: string[] } } };
    assert.ok(docs.properties.status.enum.includes("quarantine"));
  });
});
