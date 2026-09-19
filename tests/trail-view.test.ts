import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatTrailView, formatWatchMachineLog } from "../src/log/trail-view.js";
import { SuccessLedger } from "../src/trail/ledger.js";
import { assertSnapshot } from "../src/trail/snapshot.js";
import { watch15m } from "../src/trail/watcher.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("trail machine view", () => {
  it("dumps paths, trick ranks, and last alerts in plain text", () => {
    const snapshot = assertSnapshot(
      JSON.parse(readFileSync(join(here, "fixtures/trail/alert-trough.example.json"), "utf8")) as unknown,
    );
    const ledger = SuccessLedger.loadFile(join(here, "fixtures/trail/ledger.example.json"));
    const watch = watch15m(snapshot, ledger);
    const view = formatTrailView({ snapshot, ledger, watch });

    assert.match(view, /^=== TRAIL VIEW ===/m);
    assert.match(view, /^WATCH   alert/m);
    assert.match(view, /^PATHS/m);
    assert.match(view, /example-trough-wld-15m/);
    assert.match(view, /^TRICK RANKS/m);
    assert.match(view, /trough_bounce_15m/);
    assert.match(view, /^LAST ALERTS/m);
    assert.match(view, /…9826/);
    assert.doesNotMatch(view, /813839826/);

    const log = formatWatchMachineLog(watch, snapshot);
    assert.match(log, /^=== MACHINE LOG ===/m);
    assert.match(log, /^TOOL    watch15m/m);
    assert.match(log, /alert \|/);
    assert.match(log, /do not invent/);
  });

  it("quiet view still lists ranks and says none for candidates", () => {
    const snapshot = assertSnapshot(
      JSON.parse(readFileSync(join(here, "fixtures/trail/quiet.example.json"), "utf8")) as unknown,
    );
    const ledger = SuccessLedger.loadFile(join(here, "fixtures/trail/ledger.example.json"));
    const view = formatTrailView({ snapshot, ledger, watch: watch15m(snapshot, ledger) });
    assert.match(view, /^WATCH   quiet/m);
    assert.match(view, /SURF_ACT/);
    assert.match(view, /^NEXT MOVE/m);
    assert.match(view, /CANDIDATES\n  none/);
    assert.match(view, /^WHAT-IF TOP/m);
    assert.match(view, /^BRAIN \(injected memory\)/m);
    assert.match(view, /injected=yes/);
    assert.match(view, /^COST LEARN/m);
    assert.match(view, /^BRAIN NOTES/m);
    assert.match(view, /^WAVES/m);
    assert.match(view, /^TRIGGERS/m);
    assert.match(view, /^RED_DAY/m);
    assert.match(view, /^WHISPERS/m);
    assert.match(view, /surf:/);
    assert.match(view, /LAST ALERTS\n  none/);
  });
});
