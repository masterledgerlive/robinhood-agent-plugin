import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BRAIN, costAwareScore, injectBrain } from "../src/trail/brain.js";
import { SuccessLedger } from "../src/trail/ledger.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";
import type { PortfolioSnapshot } from "../src/trail/types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): PortfolioSnapshot {
  return assertSnapshot(JSON.parse(readFileSync(join(here, "fixtures/trail", name), "utf8")) as unknown);
}

describe("BRAIN_INJECT recursive memory + tx costs", () => {
  it("injects brain every watch with notes and cost rows in data fields", () => {
    const ledger = new SuccessLedger({ example: true });
    const watch = watch15m(loadExample("quiet.example.json"), ledger);

    assert.equal(watch.brain.injected, true);
    assert.equal(watch.brain.id, BRAIN.id);
    assert.equal(watch.brain.cycles, 1);
    assert.ok(watch.brain.notes.length >= 2);
    assert.ok(watch.brain.notes.some((n) => n.kind === "inject"));
    assert.ok(watch.brain.notes.some((n) => n.kind === "tx_cost"));
    assert.ok(watch.brain.useful.paperAttempts >= 1);
    assert.equal(watch.brain.useful.creditHint, 0);

    const paper = ledger.attempts.filter((a) => a.kind === "paper_surf");
    assert.ok(paper.length >= 1);
    for (const a of paper) {
      assert.ok(typeof a.notes === "string" && a.notes.includes("RT="));
      assert.ok(a.rt_cost !== undefined && a.rt_cost !== null && a.rt_cost > 0);
    }

    const persisted = ledger.getBrain();
    assert.ok(persisted?.injected);
    assert.equal(persisted?.cycles, 1);
  });

  it("recurses across loads: cycles climb and notes stay readable on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "brain-ledger-"));
    const path = join(dir, "ledger.json");
    const ledger = new SuccessLedger({ example: true });

    const first = watch15m(loadExample("quiet.example.json"), ledger);
    ledger.saveFile(path);
    assert.equal(first.brain.cycles, 1);

    const reloaded = SuccessLedger.loadFile(path);
    const snap2: PortfolioSnapshot = {
      ...loadExample("quiet.example.json"),
      asOf: "2026-09-18T17:15:00.000Z",
    };
    const second = watch15m(snap2, reloaded);
    reloaded.saveFile(path);

    assert.equal(second.brain.cycles, 2);
    assert.ok(second.brain.notes.length > first.brain.notes.length || second.brain.notes.length >= 2);
    assert.ok(second.brain.transmission.length >= 1);

    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      brain?: { cycles: number; notes: Array<{ text: string; data?: object }> };
      attempts: Array<{ notes?: string }>;
    };
    assert.equal(raw.brain?.cycles, 2);
    assert.ok((raw.brain?.notes.length ?? 0) >= 2);
    assert.ok(raw.attempts.some((a) => typeof a.notes === "string"));
  });

  it("cost-aware re-rank sets costScore and can prefer lower RT friction", () => {
    const ledger = new SuccessLedger({ example: true });
    const watch = watch15m(loadExample("quiet.example.json"), ledger);
    for (const row of watch.learn.whatIfTop) {
      assert.ok(row.costScore !== undefined);
      assert.ok(Math.abs((row.costScore ?? 0) - costAwareScore(row)) < 1e-9);
    }
    assert.equal(watch.learn.whatIfTop[0]?.rank, 1);
    if (watch.learn.whatIfTop.length >= 2) {
      const a = watch.learn.whatIfTop[0]!;
      const b = watch.learn.whatIfTop[1]!;
      assert.ok((a.costScore ?? 0) + 1e-12 >= (b.costScore ?? 0));
    }
  });

  it("injectBrain alone marks usefulProof when paper clears after cost", () => {
    const ledger = new SuccessLedger({ example: true });
    const snapshot = loadExample("quiet.example.json");
    const learn = {
      ran: true as const,
      notionalUsd: 2,
      liveMicroOk: true,
      whatIfTop: [
        {
          path_id: "surf:hold_bank:NEAR",
          trick_id: "hold_bank",
          symbol: "NEAR-USD",
          notionalUsd: 2,
          whatIfPnlUsd: 0.05,
          spreadAtEntry: 0.004,
          liveClears: false,
          rank: 1,
        },
      ],
    };
    ledger.recordAttempt({
      attempt_id: "paper-near",
      path_id: "surf:hold_bank:NEAR",
      trick_id: "hold_bank",
      timestamp: snapshot.asOf,
      order_ids: [],
      realized_pnl: 0.05,
      spread_at_entry: 0.004,
      rt_cost: 0.008,
      outcome: "win",
      kind: "paper_surf",
      notes: "paper $2; oneWay=0.400%; RT=0.800%; pnl=0.0500; after_cost=clear",
    });
    const brain = injectBrain({
      snapshot,
      ledger,
      learn,
      watchStatus: "quiet",
    });
    assert.equal(brain.useful.usefulProof, true);
    assert.equal(brain.useful.costAwareTopTrick, "hold_bank");
    assert.ok(brain.transmission.some((t) => t.trick_id === "hold_bank" && t.useful));
  });
});
