import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "../src/trail/cli.js";
import { SuccessLedger } from "../src/trail/ledger.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";
import type { PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

describe("15m watcher", () => {
  it("defaults to quiet on the EXAMPLE quiet fixture", () => {
    const watch = watch15m(loadExample("quiet.example.json"));
    assert.equal(watch.status, "quiet");
    assert.equal(watch.candidates.length, 0);
    assert.equal(watch.halt.soft, false);
    assert.equal(watch.halt.expectancy, false);
    assert.ok(watch.rejectedCount >= 10);
    assert.equal(watch.learn.ran, true);
    assert.ok(watch.learn.whatIfTop.length >= 1);
    assert.equal(watch.learn.notionalUsd, 2);
    assert.equal(watch.redDay.status, "quiet");
  });

  it("alerts when trough_bounce_15m clears and attaches a follow-path id", () => {
    const ledger = SuccessLedger.loadFile(join(here, "fixtures/trail/ledger.example.json"));
    const watch = watch15m(loadExample("alert-trough.example.json"), ledger);
    assert.equal(watch.status, "alert");
    const bounce = watch.candidates.find((c) => c.trick_id === "trough_bounce_15m");
    assert.ok(bounce);
    assert.equal(bounce.path_id, "example-trough-wld-15m");
    assert.equal(ledger.lastAlerts(1)[0]?.status, "alert");
  });

  it("alerts on soft_halt without inventing a trade candidate", () => {
    const watch = watch15m(loadExample("alert-soft-halt.example.json"));
    assert.equal(watch.status, "alert");
    assert.equal(watch.halt.soft, true);
    assert.deepEqual(
      watch.candidates.map((c) => c.trick_id),
      ["soft_halt"],
    );
  });

  it("CLI watch prints quiet|alert and never mentions place", async () => {
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    try {
      const quietCode = await main([
        "watch",
        "--snapshot",
        join(here, "fixtures/trail/quiet.example.json"),
      ]);
      const quietOut = chunks.join("");
      assert.equal(quietCode, 0);
      assert.match(quietOut, /WATCH   quiet/);
      assert.match(quietOut, /quiet \| 0 live candidates/);
      assert.match(quietOut, /WHAT-IF TOP/);
      assert.doesNotMatch(quietOut, /place_crypto_order/);

      chunks.length = 0;
      const alertCode = await main([
        "watch",
        "--snapshot",
        join(here, "fixtures/trail/alert-trough.example.json"),
      ]);
      const alertOut = chunks.join("");
      assert.equal(alertCode, 0);
      assert.match(alertOut, /WATCH   alert/);
      assert.match(alertOut, /trough_bounce_15m/);
      assert.match(alertOut, /TRICK RANKS/);
    } finally {
      process.stdout.write = orig;
    }
  });
});
