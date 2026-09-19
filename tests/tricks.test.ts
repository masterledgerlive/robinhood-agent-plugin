import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateAll, evaluateTrick, listTricks } from "../src/tricks/catalog.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import type { PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  const raw = JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown;
  const snap = assertSnapshot(raw);
  assert.equal(snap.example, true);
  return snap;
}

function withDay(snapshot: PortfolioSnapshot, day: Partial<PortfolioSnapshot["day"]>): PortfolioSnapshot {
  return { ...snapshot, day: { ...snapshot.day, ...day } };
}

function withAuthorize(
  snapshot: PortfolioSnapshot,
  authorize: NonNullable<PortfolioSnapshot["authorize"]>,
): PortfolioSnapshot {
  return { ...snapshot, authorize };
}

describe("trick catalog", () => {
  it("exports the named algorithms including SURF_LEARN tricks", () => {
    const ids = listTricks().map((t) => t.id);
    assert.deepEqual(ids, [
      "trough_bounce_15m",
      "momentum_15m",
      "mean_revert_15m",
      "hold_bank",
      "bank_sleeve_authorized",
      "deconcentrate_high_notional",
      "park_to_near",
      "park_to_chip",
      "expectancy_halt",
      "soft_halt",
    ]);
    for (const trick of listTricks()) {
      assert.ok(trick.paramsSchema);
      assert.ok(trick.whenItMayFire.length > 0);
    }
  });

  it("trough_bounce_15m is ineligible on a quiet book and eligible on the EXAMPLE bounce", () => {
    const quiet = evaluateTrick("trough_bounce_15m", loadExample("quiet.example.json"));
    assert.equal(quiet.eligible, false);

    const bounce = evaluateTrick("trough_bounce_15m", loadExample("alert-trough.example.json"));
    assert.equal(bounce.eligible, true);
    assert.match(bounce.reason, /WLD-USD/);
  });

  it("trough_bounce_15m refuses wide spread, missing edge, chase, seat/day caps, and halt", () => {
    const base = loadExample("alert-trough.example.json");

    const wide = structuredClone(base);
    const wld = wide.quotes.find((q) => q.symbol === "WLD-USD");
    assert.ok(wld);
    wld.bid = 0.79;
    wld.ask = 0.82;
    wld.mark = 0.804;
    assert.equal(evaluateTrick("trough_bounce_15m", wide).eligible, false);
    assert.match(evaluateTrick("trough_bounce_15m", wide).reason, /spread/);

    const noHigh = structuredClone(base);
    delete noHigh.troughs[0]?.recentHigh;
    assert.equal(evaluateTrick("trough_bounce_15m", noHigh).eligible, false);
    assert.match(evaluateTrick("trough_bounce_15m", noHigh).reason, /recentHigh|invent/);

    const chase = structuredClone(base);
    const chaseQuote = chase.quotes.find((q) => q.symbol === "WLD-USD");
    assert.ok(chaseQuote);
    chaseQuote.mark = 0.824;
    assert.equal(evaluateTrick("trough_bounce_15m", chase).eligible, false);
    assert.match(evaluateTrick("trough_bounce_15m", chase).reason, /chase/);

    const dayUsed = withDay(base, { newWorkingEntries: 1 });
    assert.match(evaluateTrick("trough_bounce_15m", dayUsed).reason, /1 new working entry/);

    const twoSeats: PortfolioSnapshot = {
      ...base,
      sleeves: [
        ...base.sleeves,
        { symbol: "ZEC-USD", role: "working", notionalUsd: 2, peakNotionalUsd: 2 },
        { symbol: "ENA-USD", role: "working", notionalUsd: 2, peakNotionalUsd: 2 },
      ],
    };
    assert.match(evaluateTrick("trough_bounce_15m", twoSeats).reason, /2 working seats/);

    const soft = withDay(base, { realizedPnlUsd: -1 });
    assert.match(evaluateTrick("trough_bounce_15m", soft).reason, /soft_halt/);

    const exp = withDay(base, { losingWorkingRoundTrips: 5 });
    assert.match(evaluateTrick("trough_bounce_15m", exp).reason, /expectancy_halt/);
  });

  it("bank_sleeve_authorized needs Game authorize and never flattens; FIL is display-only", () => {
    const quiet = loadExample("quiet.example.json");
    assert.equal(evaluateTrick("bank_sleeve_authorized", quiet).eligible, false);

    const authorized = withAuthorize(quiet, { bankSleeve: true });
    const ok = evaluateTrick("bank_sleeve_authorized", authorized);
    assert.equal(ok.eligible, true);
    assert.match(ok.reason, /NEAR|CHIP/);

    const filOnly: PortfolioSnapshot = {
      ...quiet,
      sleeves: quiet.sleeves.filter((s) => s.symbol.startsWith("FIL")),
      authorize: { bankSleeve: true, tokens: ["FIL-USD"] },
    };
    const fil = evaluateTrick("bank_sleeve_authorized", filOnly);
    assert.equal(fil.eligible, false);
    assert.match(fil.reason, /display-only/);

    const flatten: PortfolioSnapshot = {
      ...quiet,
      authorize: { bankSleeve: true, tokens: ["NEAR-USD"], sleeveUsd: 8.5 },
    };
    assert.equal(evaluateTrick("bank_sleeve_authorized", flatten).eligible, false);
    assert.match(evaluateTrick("bank_sleeve_authorized", flatten).reason, /flatten/);
  });

  it("deconcentrate_high_notional needs Game authorize and an oversized seat above dust", () => {
    const quiet = loadExample("quiet.example.json");
    assert.equal(evaluateTrick("deconcentrate_high_notional", quiet).eligible, false);

    const small = withAuthorize(quiet, { deconcentrate: true });
    assert.equal(evaluateTrick("deconcentrate_high_notional", small).eligible, false);

    const oversized: PortfolioSnapshot = {
      ...quiet,
      authorize: { deconcentrate: true },
      sleeves: [
        ...quiet.sleeves.filter((s) => s.symbol !== "NEAR-USD"),
        { symbol: "NEAR-USD", role: "bank", notionalUsd: 12, peakNotionalUsd: 12 },
      ],
    };
    const ev = evaluateTrick("deconcentrate_high_notional", oversized);
    assert.equal(ev.eligible, true);
    assert.match(ev.reason, /NEAR/);
  });

  it("park_to_near fires on a cost/mark profit gate; park_to_chip waits for cascade/Game", () => {
    const quiet = loadExample("quiet.example.json");
    assert.equal(evaluateTrick("park_to_near", quiet).eligible, false);
    assert.equal(evaluateTrick("park_to_chip", quiet).eligible, false);

    const profit: PortfolioSnapshot = {
      ...quiet,
      sleeves: [
        ...quiet.sleeves,
        {
          symbol: "WLD-USD",
          role: "working",
          notionalUsd: 2.2,
          peakNotionalUsd: 2.2,
          costBasisUsd: 2.0,
          markUsd: 2.12,
        },
      ],
      quotes: [
        ...quiet.quotes.filter((q) => q.symbol !== "WLD-USD"),
        { symbol: "WLD-USD", bid: 0.802, ask: 0.806, mark: 0.804 },
      ],
    };

    const near = evaluateTrick("park_to_near", profit);
    assert.equal(near.eligible, true);
    assert.equal(near.symbol, "NEAR");

    const chipBlocked = evaluateTrick("park_to_chip", profit);
    assert.equal(chipBlocked.eligible, false);
    assert.match(chipBlocked.reason, /NEAR first/);

    const chipNamed = evaluateTrick("park_to_chip", { ...profit, authorize: { parkTarget: "CHIP" } });
    assert.equal(chipNamed.eligible, true);
    assert.equal(chipNamed.symbol, "CHIP");
  });

  it("soft_halt and expectancy_halt are protective and do not invent PnL", () => {
    const quiet = loadExample("quiet.example.json");
    const unknown = evaluateTrick("soft_halt", quiet);
    assert.equal(unknown.eligible, false);
    assert.match(unknown.reason, /invent/);

    const haltSnap = loadExample("alert-soft-halt.example.json");
    const soft = evaluateTrick("soft_halt", haltSnap);
    assert.equal(soft.eligible, true);
    assert.match(soft.reason, /soft_halt/);

    const exp = evaluateTrick("expectancy_halt", withDay(quiet, { losingWorkingRoundTrips: 8 }));
    assert.equal(exp.eligible, true);

    const notYet = evaluateTrick("expectancy_halt", withDay(quiet, { losingWorkingRoundTrips: 5 }));
    assert.equal(notYet.eligible, false);

    const slowFive = evaluateTrick(
      "expectancy_halt",
      withDay({ ...quiet, mode: "LOW_CAP_SLOW" }, { losingWorkingRoundTrips: 5 }),
    );
    assert.equal(slowFive.eligible, true);
  });

  it("non-agentic snapshots make every trick ineligible", () => {
    const quiet = loadExample("quiet.example.json");
    const locked: PortfolioSnapshot = {
      ...quiet,
      account: { ...quiet.account, agenticAllowed: false },
    };
    for (const ev of evaluateAll(locked)) {
      assert.equal(ev.eligible, false);
      assert.match(ev.reason, /Agentic/);
    }
  });

  it("momentum_15m is live-eligible on DIVIDEND signal but hold_bank is never live", () => {
    const quiet = loadExample("quiet.example.json");
    const momentum = evaluateTrick("momentum_15m", quiet);
    assert.equal(momentum.eligible, true);
    assert.match(momentum.reason, /ENA-USD/);

    const slow = evaluateTrick("momentum_15m", { ...quiet, mode: "LOW_CAP_SLOW" });
    assert.equal(slow.eligible, false);

    const hold = evaluateTrick("hold_bank", quiet);
    assert.equal(hold.eligible, false);
    assert.match(hold.reason, /baseline/);
  });
});
