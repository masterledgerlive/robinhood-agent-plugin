import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { followPathSchema, successLedgerSchema } from "../src/trail/schemas.js";
import { LedgerError, SuccessLedger } from "../src/trail/ledger.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("success ledger", () => {
  it("loads the EXAMPLE path file with null success rates", () => {
    const ledger = SuccessLedger.loadFile(join(here, "fixtures/trail/ledger.example.json"));
    assert.equal(ledger.example, true);
    assert.ok(ledger.paths.length >= 1);
    for (const path of ledger.paths) {
      assert.equal(path.success_rate, null);
    }
    assert.equal(ledger.statsFor({ trick_id: "trough_bounce_15m" }).success_rate, null);
  });

  it("computes rolling win rate and expectancy from closed broker-backed attempts", () => {
    const ledger = new SuccessLedger({
      example: true,
      paths: [
        {
          path_id: "unit-path",
          source: "github_code",
          leader_system: "unit",
          horizon: "15m",
          tokens: ["WLD-USD"],
          trick_id: "trough_bounce_15m",
          gates: ["LOW_CAP_SLOW"],
          success_rate: null,
          status: "trailing",
        },
      ],
    });

    ledger.recordAttempt({
      attempt_id: "a1",
      path_id: "unit-path",
      trick_id: "trough_bounce_15m",
      timestamp: "2026-09-18T17:00:00.000Z",
      order_ids: ["ord_test_1"],
      realized_pnl: 0.12,
      spread_at_entry: 0.004,
      outcome: "win",
    });
    ledger.recordAttempt({
      attempt_id: "a2",
      path_id: "unit-path",
      trick_id: "trough_bounce_15m",
      timestamp: "2026-09-18T17:20:00.000Z",
      order_ids: ["ord_test_2"],
      realized_pnl: -0.06,
      spread_at_entry: 0.005,
      outcome: "loss",
    });
    ledger.recordAttempt({
      attempt_id: "a3",
      path_id: "unit-path",
      trick_id: "trough_bounce_15m",
      timestamp: "2026-09-18T17:40:00.000Z",
      order_ids: [],
      realized_pnl: null,
      spread_at_entry: null,
      outcome: "skipped",
    });

    const stats = ledger.statsFor({ trick_id: "trough_bounce_15m" });
    assert.equal(stats.attempts, 2);
    assert.equal(stats.wins, 1);
    assert.equal(stats.success_rate, 0.5);
    assert.ok(stats.expectancy !== null);
    assert.ok(Math.abs((stats.expectancy ?? 0) - 0.03) < 1e-9);
    assert.equal(ledger.paths[0]?.success_rate, 0.5);

    const ranks = ledger.rankedTricks();
    assert.equal(ranks[0]?.trick_id, "trough_bounce_15m");
    assert.equal(ranks[0]?.success_rate, 0.5);
  });

  it("refuses closed PnL without an order id", () => {
    const ledger = new SuccessLedger({ example: true });
    assert.throws(
      () =>
        ledger.recordAttempt({
          attempt_id: "bad",
          path_id: "unit-path",
          trick_id: "trough_bounce_15m",
          timestamp: "2026-09-18T17:00:00.000Z",
          order_ids: [],
          realized_pnl: 0.5,
          spread_at_entry: 0.004,
          outcome: "win",
        }),
      LedgerError,
    );
  });

  it("documents follow-path + ledger schemas", () => {
    assert.ok(followPathSchema.required.includes("path_id"));
    assert.ok(followPathSchema.required.includes("trick_id"));
    assert.ok(successLedgerSchema.required.includes("attempts"));
    const docs = JSON.parse(
      readFileSync(join(here, "../docs/schemas/follow-path.schema.json"), "utf8"),
    ) as { required: string[] };
    assert.ok(docs.required.includes("success_rate"));
  });
});
