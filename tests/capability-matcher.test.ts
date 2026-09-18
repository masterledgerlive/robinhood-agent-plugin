import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchCapabilities } from "../src/capabilities/matcher.js";
import { decoyTools, futureEventTools, snapshotShapedTools } from "./fixtures/tools.js";

describe("capability matcher", () => {
  it("matches review/place/list from schema shape, not a hardcoded name catalog", () => {
    const index = matchCapabilities(snapshotShapedTools);

    const reviewNames = index.review.map((t) => t.name).sort();
    const placeNames = index.place.map((t) => t.name).sort();
    const listNames = index.listOrders.map((t) => t.name);

    assert.deepEqual(reviewNames, ["preview_crypto_order", "review_equity_order"]);
    assert.deepEqual(placeNames, ["place_crypto_order", "place_equity_order"]);
    assert.ok(listNames.includes("get_crypto_orders"));

    const cryptoPair = index.pairs.find((p) => p.lane === "crypto");
    assert.equal(cryptoPair?.review, "preview_crypto_order");
    assert.equal(cryptoPair?.place, "place_crypto_order");

    const equityPair = index.pairs.find((p) => p.lane === "equity");
    assert.equal(equityPair?.review, "review_equity_order");
    assert.equal(equityPair?.place, "place_equity_order");

    assert.equal(index.accounts[0]?.name, "get_accounts");
    assert.equal(index.portfolio[0]?.name, "get_portfolio");
    assert.equal(index.search[0]?.name, "search");
    assert.ok(index.pnl.some((t) => t.name === "get_pnl_trade_history"));
  });

  it("discovers future event-contract tools by schema even when names are unknown", () => {
    const index = matchCapabilities([...snapshotShapedTools, ...futureEventTools]);
    const eventReview = index.review.find((t) => t.lane === "event");
    const eventPlace = index.place.find((t) => t.lane === "event");
    assert.equal(eventReview?.name, "simulate_event_ticket");
    assert.equal(eventPlace?.name, "commit_event_ticket");
    const pair = index.pairs.find((p) => p.lane === "event");
    assert.equal(pair?.review, "simulate_event_ticket");
    assert.equal(pair?.place, "commit_event_ticket");
  });

  it("does not treat name-only decoys as money tools", () => {
    const index = matchCapabilities([...snapshotShapedTools, ...decoyTools]);
    const names = [...index.review, ...index.place].map((t) => t.name);
    assert.ok(!names.includes("place_pizza"));
    assert.ok(!names.includes("review_docs"));
  });

  it("records why a tool matched so agents can audit the decision", () => {
    const index = matchCapabilities(snapshotShapedTools);
    const preview = index.review.find((t) => t.name === "preview_crypto_order");
    assert.ok(preview?.reasons.some((r) => r.includes("order-shaped")));
    assert.ok(preview?.reasons.some((r) => r.includes("pre-trade")));
  });
});
