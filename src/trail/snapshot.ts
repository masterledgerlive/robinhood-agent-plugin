import type { PortfolioSnapshot } from "./types.js";

export class SnapshotError extends Error {
  readonly code = "SNAPSHOT";
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Structural check for a watcher snapshot. Does not call the broker.
 */
export function assertSnapshot(raw: unknown): PortfolioSnapshot {
  if (!isRecord(raw)) throw new SnapshotError("Snapshot must be an object");
  if (typeof raw.asOf !== "string") throw new SnapshotError("asOf is required");
  if (!isRecord(raw.account)) throw new SnapshotError("account is required");
  if (typeof raw.account.rhsAccountNumber !== "string") {
    throw new SnapshotError("account.rhsAccountNumber is required");
  }
  if (typeof raw.account.agenticAllowed !== "boolean") {
    throw new SnapshotError("account.agenticAllowed is required");
  }
  if (raw.mode !== "LOW_CAP_SLOW") throw new SnapshotError("mode must be LOW_CAP_SLOW");
  if (!Array.isArray(raw.sleeves)) throw new SnapshotError("sleeves must be an array");
  if (!Array.isArray(raw.quotes)) throw new SnapshotError("quotes must be an array");
  if (!Array.isArray(raw.troughs)) throw new SnapshotError("troughs must be an array");
  if (!isRecord(raw.day)) throw new SnapshotError("day is required");
  if (typeof raw.day.date !== "string") throw new SnapshotError("day.date is required");
  if (typeof raw.day.newWorkingEntries !== "number") {
    throw new SnapshotError("day.newWorkingEntries is required");
  }
  if (raw.day.realizedPnlUsd !== null && typeof raw.day.realizedPnlUsd !== "number") {
    throw new SnapshotError("day.realizedPnlUsd must be a number or null");
  }
  if (typeof raw.day.losingWorkingRoundTrips !== "number") {
    throw new SnapshotError("day.losingWorkingRoundTrips is required");
  }
  return raw as unknown as PortfolioSnapshot;
}
