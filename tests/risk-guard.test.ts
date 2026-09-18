import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HaltError, RiskGuard, RiskViolationError } from "../src/risk/guard.js";
import { resolveTradingMode } from "../src/mode/trading-mode.js";
import { matchCapabilities } from "../src/capabilities/matcher.js";
import { ReviewCache, runGatedToolCall } from "../src/session/workflow.js";
import { snapshotShapedTools } from "./fixtures/tools.js";

describe("risk guard", () => {
  it("allows RISK and rejects SAVE/vault", () => {
    const guard = new RiskGuard({ mode: "paper", startOfDayEquityUsd: 100 });
    guard.assertBucket("RISK");
    assert.throws(() => guard.assertBucket("SAVE"), RiskViolationError);
    assert.equal(guard.isHalted(), true);
  });

  it("caps micro bets and the roll", () => {
    const guard = new RiskGuard({
      mode: "live",
      startOfDayEquityUsd: 50,
      policy: { maxBetUsd: 2, maxRollUsd: 7 },
    });
    guard.assertNotional(2);
    assert.throws(() => guard.assertNotional(2.01), /exceeds max bet/);
    assert.throws(() => guard.assertNotional(0), /positive USD/);
  });

  it("halts at the default 20% daily drawdown using broker equity only", () => {
    const guard = new RiskGuard({ mode: "live", startOfDayEquityUsd: 100 });
    guard.markEquityFromBroker(81);
    assert.equal(guard.isHalted(), false);
    guard.markEquityFromBroker(80);
    assert.equal(guard.isHalted(), true);
    assert.match(guard.getState().haltReason ?? "", /20\.0%/);
    assert.throws(() => guard.assertNotional(2), HaltError);
  });

  it("refuses fills without a real order id and refuses invented PnL", () => {
    const guard = new RiskGuard({ mode: "paper", startOfDayEquityUsd: 10 });
    assert.throws(
      () =>
        guard.recordFill({
          orderId: "",
          filledAt: "2026-09-18T00:00:00Z",
          source: "broker",
        }),
      /order id/,
    );
    assert.throws(
      () =>
        guard.recordFill({
          orderId: "ord_1",
          filledAt: "2026-09-18T00:00:00Z",
          source: "broker",
          realizedPnlUsd: Number.NaN,
        }),
      /invented PnL/,
    );
    guard.recordFill({
      orderId: "ord_1",
      filledAt: "2026-09-18T00:00:00Z",
      source: "broker",
      realizedPnlUsd: 0.4,
    });
    assert.equal(guard.getState().fills[0]?.orderId, "ord_1");
  });

  it("blocks live trading when start-of-day equity is missing or zero", () => {
    const unfunded = new RiskGuard({ mode: "live", startOfDayEquityUsd: 0 });
    assert.throws(() => unfunded.assertLiveFunded(), /unfunded/);
    const paper = new RiskGuard({ mode: "paper", startOfDayEquityUsd: 0 });
    paper.assertLiveFunded();
  });
});

describe("paper vs live gate", () => {
  it("defaults to paper", () => {
    assert.equal(resolveTradingMode({}), "paper");
    assert.equal(resolveTradingMode({ ROBINHOOD_TRADING_MODE: "live" }), "live");
  });

  it("logs WOULD_PLACE in paper and does not call the place tool", async () => {
    const capabilities = matchCapabilities(snapshotShapedTools);
    const guard = new RiskGuard({ mode: "paper", startOfDayEquityUsd: 40 });
    const reviews = new ReviewCache();
    const args = {
      symbol: "NEAR-USD",
      side: "buy",
      type: "market",
      dollar_amount: "2.00",
      rhs_account_number: "11112222",
    };
    const calls: string[] = [];
    const client = {
      async callTool(name: string) {
        calls.push(name);
        return { summary: "preview ok" };
      },
    };

    await runGatedToolCall({
      client,
      capabilities,
      guard,
      mode: "paper",
      intent: "Preview $2 NEAR",
      tool: "preview_crypto_order",
      args,
      human: "Preview first.",
      reviews,
      at: "2026-09-18T17:00:00.000Z",
    });

    const place = await runGatedToolCall({
      client,
      capabilities,
      guard,
      mode: "paper",
      intent: "Would place $2 NEAR",
      tool: "place_crypto_order",
      args,
      human: "Paper: do not send live order.",
      reviews,
      at: "2026-09-18T17:00:01.000Z",
    });

    assert.equal(place.skipped, true);
    assert.match(place.log, /WOULD_PLACE/);
    assert.deepEqual(calls, ["preview_crypto_order"]);
  });

  it("refuses live place without a matching review", async () => {
    const capabilities = matchCapabilities(snapshotShapedTools);
    const guard = new RiskGuard({ mode: "live", startOfDayEquityUsd: 40 });
    await assert.rejects(
      () =>
        runGatedToolCall({
          client: { async callTool() { return {}; } },
          capabilities,
          guard,
          mode: "live",
          intent: "Place without review",
          tool: "place_crypto_order",
          args: {
            symbol: "NEAR",
            side: "buy",
            type: "market",
            dollar_amount: "2.00",
            rhs_account_number: "11112222",
          },
          human: "Should fail.",
          reviews: new ReviewCache(),
        }),
      /No matching review/,
    );
  });
});
