/**
 * JSON Schema documents for follow-paths, the success ledger, and watcher snapshots.
 * Canonical copies also live in docs/schemas/.
 */

export const followPathSchema = {
  $id: "https://github.com/masterledgerlive/robinhood-agent-plugin/schemas/follow-path.json",
  title: "FollowPath",
  type: "object",
  additionalProperties: false,
  required: [
    "path_id",
    "source",
    "leader_system",
    "horizon",
    "tokens",
    "trick_id",
    "gates",
    "success_rate",
    "status",
  ],
  properties: {
    path_id: { type: "string" },
    source: {
      type: "string",
      enum: ["rh_mcp", "rh_mobile", "cascade_chatter", "external_agentic", "news", "github_code"],
    },
    leader_system: { type: "string" },
    horizon: { type: "string", enum: ["15m", "1h", "1d"], default: "15m" },
    tokens: { type: "array", items: { type: "string" } },
    trick_id: { type: "string" },
    gates: { type: "array", items: { type: "string" } },
    success_rate: { type: ["number", "null"], description: "wins/attempts; null when no closed attempts" },
    status: { type: "string", enum: ["trailing", "paused", "graduated", "retired"] },
  },
} as const;

export const ledgerAttemptSchema = {
  $id: "https://github.com/masterledgerlive/robinhood-agent-plugin/schemas/ledger-attempt.json",
  title: "LedgerAttempt",
  type: "object",
  additionalProperties: false,
  required: [
    "attempt_id",
    "path_id",
    "trick_id",
    "timestamp",
    "order_ids",
    "realized_pnl",
    "spread_at_entry",
    "outcome",
  ],
  properties: {
    attempt_id: { type: "string" },
    path_id: { type: "string" },
    trick_id: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    order_ids: { type: "array", items: { type: "string" } },
    realized_pnl: { type: ["number", "null"], description: "Broker figure only" },
    spread_at_entry: { type: ["number", "null"] },
    outcome: { type: "string", enum: ["win", "loss", "open", "skipped"] },
  },
} as const;

export const successLedgerSchema = {
  $id: "https://github.com/masterledgerlive/robinhood-agent-plugin/schemas/success-ledger.json",
  title: "SuccessLedger",
  type: "object",
  additionalProperties: true,
  required: ["paths", "attempts", "alerts"],
  properties: {
    example: { type: "boolean", description: "Must be true for sample files" },
    $comment: { type: "string" },
    paths: { type: "array", items: followPathSchema },
    attempts: { type: "array", items: ledgerAttemptSchema },
    alerts: { type: "array" },
  },
} as const;

export const portfolioSnapshotSchema = {
  $id: "https://github.com/masterledgerlive/robinhood-agent-plugin/schemas/portfolio-snapshot.json",
  title: "PortfolioSnapshot",
  type: "object",
  additionalProperties: true,
  required: ["asOf", "account", "mode", "sleeves", "quotes", "troughs", "day"],
  properties: {
    example: { type: "boolean", description: "Must be true for fixture / docs samples" },
    $comment: { type: "string" },
    asOf: { type: "string", format: "date-time" },
    account: {
      type: "object",
      required: ["rhsAccountNumber", "agenticAllowed"],
      properties: {
        rhsAccountNumber: {
          type: "string",
          description: "Example Game Agentic rhs 813839826 — not a secret",
        },
        agenticAllowed: { type: "boolean" },
      },
    },
    mode: { type: "string", const: "LOW_CAP_SLOW" },
    equityUsd: { type: "number" },
    sleeves: { type: "array" },
    quotes: { type: "array" },
    troughs: { type: "array" },
    day: {
      type: "object",
      required: ["date", "newWorkingEntries", "realizedPnlUsd", "losingWorkingRoundTrips"],
      properties: {
        date: { type: "string" },
        newWorkingEntries: { type: "integer", minimum: 0 },
        realizedPnlUsd: { type: ["number", "null"] },
        losingWorkingRoundTrips: { type: "integer", minimum: 0 },
      },
    },
    authorize: { type: "object" },
  },
} as const;
