#!/usr/bin/env node
/**
 * Deterministic 15m trail watcher CLI.
 *
 *   tsx src/trail/cli.ts watch --snapshot <file> [--ledger <file>] [--json]
 *   tsx src/trail/cli.ts view  [--snapshot <file>] [--ledger <file>]
 *
 * Reads local fixtures only. Never places orders. Never calls Robinhood MCP.
 */
import { readFileSync } from "node:fs";
import { formatTrailView, formatWatchMachineLog } from "../log/trail-view.js";
import { FixtureBroker } from "./broker.js";
import { SuccessLedger } from "./ledger.js";
import { assertSnapshot } from "./snapshot.js";
import { watch15m } from "./watcher.js";

type Flags = {
  command: "watch" | "view" | "help";
  snapshot?: string;
  ledger?: string;
  json: boolean;
};

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { command: "help", json: false };
  const cmd = argv[0];
  if (cmd === "watch" || cmd === "view" || cmd === "help") flags.command = cmd;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--json") flags.json = true;
    else if (arg === "--snapshot" && next) {
      flags.snapshot = next;
      i += 1;
    } else if (arg === "--ledger" && next) {
      flags.ledger = next;
      i += 1;
    }
  }
  return flags;
}

function loadSnapshot(path: string) {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return assertSnapshot(raw);
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parseArgs(argv);
  if (flags.command === "help") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const snapshot = flags.snapshot ? loadSnapshot(flags.snapshot) : undefined;
  const ledger = flags.ledger ? SuccessLedger.loadFile(flags.ledger) : new SuccessLedger({ example: true });

  if (flags.command === "watch") {
    if (!snapshot) {
      process.stderr.write("watch requires --snapshot <file>\n");
      return 1;
    }
    const broker = new FixtureBroker(snapshot);
    const loaded = await broker.loadSnapshot();
    const watch = watch15m(loaded, ledger);
    if (flags.ledger) ledger.saveFile(flags.ledger);
    if (flags.json) {
      process.stdout.write(`${JSON.stringify({ example: loaded.example === true, watch }, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatWatchMachineLog(watch, loaded)}\n\n${formatTrailView({ snapshot: loaded, ledger, watch })}\n`);
    }
    return 0;
  }

  const watch = snapshot ? watch15m(snapshot, ledger) : undefined;
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ example: true, paths: ledger.paths, ranks: ledger.rankedTricks(), alerts: ledger.lastAlerts(), watch: watch ?? null }, null, 2)}\n`,
    );
  } else {
    const view = formatTrailView({
      ledger,
      ...(snapshot ? { snapshot } : {}),
      ...(watch ? { watch } : {}),
    });
    process.stdout.write(`${view}\n`);
  }
  return 0;
}

function usage(): string {
  return [
    "rh-trail — deterministic 15m watcher (no orders, no MCP)",
    "",
    "  watch --snapshot <file> [--ledger <file>] [--json]",
    "  view  [--snapshot <file>] [--ledger <file>] [--json]",
    "",
    "Quiet is the default. Alert only when a named trick clears LOW_CAP_SLOW gates.",
    "Cron this. Do not spend Cursor/agent credits on unchanged 15m checks.",
  ].join("\n");
}

const isMain = process.argv[1] && /(?:^|[/\\])cli\.(?:ts|js)$/.test(process.argv[1]);
if (isMain) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
}

export { main, parseArgs };
