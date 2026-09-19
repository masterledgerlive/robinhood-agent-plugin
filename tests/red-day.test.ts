import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatTrailView } from "../src/log/trail-view.js";
import { redDayTrigger } from "../src/trail/red-day.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";
import { loadWhisperFile, whisperCardSchema } from "../src/trail/whisper.js";
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
      watch.candidates.some((c) => c.trick_id === "trough_bounce_15m" || c.trick_id === "momentum_15m"),
      false,
    );

    const view = formatTrailView({ snapshot: snap, watch });
    assert.match(view, /^RED_DAY/m);
    assert.match(view, /status fired/);
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
        return { ...q, mark15m: q.mark * 0.97 };
      }),
    };
    const whispers = loadWhisperFile(join(here, "fixtures/trail/whispers-red-day.example.json"));
    const ev = redDayTrigger.evaluate(armedBook, whispers);
    assert.equal(ev.status, "armed");
    assert.equal(ev.recommendations.exitWorkingToDust.length, 0);
    assert.equal(ev.active, true);
  });

  it("documents the whisper card schema with quarantine", () => {
    assert.ok(whisperCardSchema.required.includes("status"));
    const docs = JSON.parse(
      readFileSync(join(here, "../docs/schemas/whisper-card.schema.json"), "utf8"),
    ) as { properties: { status: { enum: string[] } } };
    assert.ok(docs.properties.status.enum.includes("quarantine"));
  });
});
