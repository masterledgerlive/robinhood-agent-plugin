import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TRICK_IDS } from "./constants.js";
import type {
  FollowPath,
  LedgerAttempt,
  LedgerFile,
  TrailAlert,
  TrickRank,
} from "./types.js";

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class LedgerError extends Error {
  readonly code = "LEDGER";
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

/**
 * Follow-path + success ledger.
 * Rolling win rate / expectancy come only from recorded attempts.
 * Realized PnL requires broker order ids — never invent.
 */
export class SuccessLedger {
  readonly example: boolean;
  private readonly pathMap = new Map<string, FollowPath>();
  private readonly attemptMap = new Map<string, LedgerAttempt>();
  private alerts: TrailAlert[] = [];

  constructor(init?: Partial<LedgerFile>) {
    this.example = init?.example === true;
    for (const path of init?.paths ?? []) this.pathMap.set(path.path_id, { ...path });
    for (const attempt of init?.attempts ?? []) this.attemptMap.set(attempt.attempt_id, { ...attempt });
    this.alerts = [...(init?.alerts ?? [])];
    this.refreshPathRates();
  }

  get paths(): FollowPath[] {
    return [...this.pathMap.values()];
  }

  get attempts(): LedgerAttempt[] {
    return [...this.attemptMap.values()];
  }

  upsertPath(path: FollowPath): FollowPath {
    const copy = { ...path, tokens: [...path.tokens], gates: [...path.gates] };
    this.pathMap.set(copy.path_id, copy);
    this.refreshPathRates();
    return this.pathMap.get(copy.path_id) ?? copy;
  }

  recordAttempt(attempt: LedgerAttempt): LedgerAttempt {
    if (attempt.realized_pnl !== null) {
      if (!Number.isFinite(attempt.realized_pnl)) {
        throw new LedgerError("Refuse invented PnL. Broker number only.");
      }
      if (attempt.outcome === "win" || attempt.outcome === "loss") {
        if (attempt.order_ids.length === 0) {
          throw new LedgerError("Refuse closed PnL without a real order id.");
        }
      }
    }
    const copy = { ...attempt, order_ids: [...attempt.order_ids] };
    this.attemptMap.set(copy.attempt_id, copy);
    this.refreshPathRates();
    return copy;
  }

  closeAttempt(
    attemptId: string,
    update: { outcome: "win" | "loss"; realized_pnl: number | null; order_ids: string[] },
  ): LedgerAttempt {
    const existing = this.attemptMap.get(attemptId);
    if (!existing) throw new LedgerError(`Unknown attempt ${attemptId}`);
    if (update.order_ids.length === 0) {
      throw new LedgerError("Refuse close without a real order id.");
    }
    if (update.realized_pnl !== null && !Number.isFinite(update.realized_pnl)) {
      throw new LedgerError("Refuse invented PnL. Broker number only.");
    }
    return this.recordAttempt({
      ...existing,
      outcome: update.outcome,
      realized_pnl: update.realized_pnl,
      order_ids: update.order_ids,
    });
  }

  statsFor(id: { path_id?: string; trick_id?: string }): TrickRank {
    const closed = this.attempts.filter((a) => {
      if (a.outcome !== "win" && a.outcome !== "loss") return false;
      if (id.path_id && a.path_id !== id.path_id) return false;
      if (id.trick_id && a.trick_id !== id.trick_id) return false;
      return true;
    });
    const wins = closed.filter((a) => a.outcome === "win").length;
    const pnls = closed
      .map((a) => a.realized_pnl)
      .filter((n): n is number => n !== null && Number.isFinite(n));
    return {
      trick_id: id.trick_id ?? id.path_id ?? "unknown",
      attempts: closed.length,
      wins,
      success_rate: closed.length === 0 ? null : wins / closed.length,
      expectancy: mean(pnls),
    };
  }

  refreshPathRates(): void {
    for (const path of this.pathMap.values()) {
      path.success_rate = this.statsFor({ path_id: path.path_id }).success_rate;
    }
  }

  rememberAlert(alert: TrailAlert): void {
    this.alerts.push(alert);
  }

  lastAlerts(n = 5): TrailAlert[] {
    return this.alerts.slice(-n);
  }

  rankedTricks(): TrickRank[] {
    const ids = new Set<string>([...TRICK_IDS]);
    for (const attempt of this.attempts) ids.add(attempt.trick_id);
    for (const path of this.paths) ids.add(path.trick_id);
    const ranks = [...ids].map((trick_id) => this.statsFor({ trick_id }));
    ranks.sort((a, b) => {
      const ar = a.success_rate;
      const br = b.success_rate;
      if (ar === null && br === null) return a.trick_id.localeCompare(b.trick_id);
      if (ar === null) return 1;
      if (br === null) return -1;
      if (br !== ar) return br - ar;
      return b.attempts - a.attempts;
    });
    return ranks;
  }

  matchPath(trickId: string, symbol?: string): FollowPath | undefined {
    const token = symbol?.replace(/-USD$/i, "").toUpperCase();
    return this.paths.find((p) => {
      if (p.trick_id !== trickId) return false;
      if (p.status === "retired" || p.status === "paused") return false;
      if (!token) return true;
      return p.tokens.some((t) => t.replace(/-USD$/i, "").toUpperCase() === token);
    });
  }

  toJSON(): LedgerFile {
    const file: LedgerFile = {
      paths: this.paths,
      attempts: this.attempts,
      alerts: [...this.alerts],
    };
    if (this.example) file.example = true;
    return file;
  }

  static fromJSON(data: unknown): SuccessLedger {
    if (!data || typeof data !== "object") throw new LedgerError("Ledger JSON must be an object");
    const rec = data as Partial<LedgerFile>;
    return new SuccessLedger({
      example: rec.example === true,
      paths: Array.isArray(rec.paths) ? rec.paths : [],
      attempts: Array.isArray(rec.attempts) ? rec.attempts : [],
      alerts: Array.isArray(rec.alerts) ? rec.alerts : [],
    });
  }

  static loadFile(filePath: string): SuccessLedger {
    const raw = readFileSync(filePath, "utf8");
    return SuccessLedger.fromJSON(JSON.parse(raw) as unknown);
  }

  saveFile(filePath: string): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(this.toJSON(), null, 2)}\n`, "utf8");
  }
}
