import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBrokerIds, formatMachineLog } from "../src/log/machine-log.js";
import { redactArgs } from "../src/log/redact.js";

describe("machine log formatter", () => {
  it("prints INTENT → TOOL → ARGS → RESULT → HUMAN in plain text", () => {
    const log = formatMachineLog({
      at: "2026-09-18T17:00:00.000Z",
      mode: "paper",
      bucket: "RISK",
      intent: "Preview $2 NEAR-USD buy to pair with an event ticket",
      tool: "preview_crypto_order",
      args: {
        symbol: "NEAR-USD",
        side: "buy",
        type: "market",
        dollar_amount: "2.00",
        rhs_account_number: "123456789",
      },
      result: {
        ok: true,
        summary: "preview ok; est debit 2.00",
        orderId: null,
        fillId: null,
        realizedPnl: null,
      },
      human: "Preview clean. Wait for confirm before place.",
    });

    assert.match(log, /^=== MACHINE LOG ===/m);
    assert.match(log, /^INTENT  Preview \$2 NEAR-USD buy/m);
    assert.match(log, /^TOOL    preview_crypto_order/m);
    assert.match(log, /^ARGS    /m);
    assert.match(log, /^RESULT  ok \| preview ok; est debit 2.00/m);
    assert.match(log, /^HUMAN   Preview clean. Wait for confirm before place./m);
    assert.match(log, /^ORDER   none/m);
    assert.match(log, /do not invent/);
    assert.match(log, /^MODE    paper/m);
    assert.match(log, /^BUCKET  RISK/m);
  });

  it("redacts account numbers but keeps real order ids", () => {
    const redacted = redactArgs({
      rhs_account_number: "99887766",
      authorization: "Bearer super-secret-token",
      order_id: "ord_live_123",
      symbol: "NEAR-USD",
    });
    assert.equal(redacted.rhs_account_number, "…7766");
    assert.equal(redacted.authorization, "…oken");
    assert.equal(redacted.order_id, "ord_live_123");
    assert.equal(redacted.symbol, "NEAR-USD");

    const log = formatMachineLog({
      mode: "live",
      bucket: "RISK",
      intent: "Place $2 NEAR buy after preview",
      tool: "place_crypto_order",
      args: {
        rhs_account_number: "99887766",
        symbol: "NEAR",
        side: "buy",
        type: "market",
        dollar_amount: "2.00",
      },
      result: {
        ok: true,
        summary: "broker returned order_id ord_live_123",
        orderId: "ord_live_123",
        fillId: "fill_99",
        realizedPnl: null,
      },
      human: "Live $2 NEAR buy sent. Fill not assumed until order id is on the ticket.",
    });
    assert.doesNotMatch(log, /99887766/);
    assert.match(log, /…7766/);
    assert.match(log, /ord_live_123/);
    assert.match(log, /fill_99/);
  });

  it("extracts broker ids and never fabricates them", () => {
    const ids = extractBrokerIds({
      results: [{ order_id: "abc-1", state: "filled", realized_pnl: "-0.12" }],
    });
    assert.equal(ids.orderId, "abc-1");
    assert.equal(ids.realizedPnl, "-0.12");

    const empty = extractBrokerIds({ message: "preview only" });
    assert.equal(empty.orderId, null);
    assert.equal(empty.fillId, null);
    assert.equal(empty.realizedPnl, null);
  });
});
