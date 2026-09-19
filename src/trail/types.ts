import type { FOLLOW_PATH_SOURCES, FOLLOW_PATH_STATUSES, TrickId } from "./constants.js";

export type FollowPathSource = (typeof FOLLOW_PATH_SOURCES)[number];
export type FollowPathStatus = (typeof FOLLOW_PATH_STATUSES)[number];
export type Horizon = "15m" | "1h" | "1d";
export type SleeveRole = "bank" | "working" | "dust";
export type ParkTarget = "NEAR" | "CHIP";
export type LedgerOutcome = "win" | "loss" | "open" | "skipped";

export type Quote = {
  symbol: string;
  bid: number;
  ask: number;
  mark: number;
};

export type Sleeve = {
  symbol: string;
  role: SleeveRole;
  notionalUsd: number;
  peakNotionalUsd: number;
  quantity?: number;
  /** Broker cost. Omit if unknown — do not invent. */
  costBasisUsd?: number;
  /** Broker or quote mark of the sleeve. Omit if unknown. */
  markUsd?: number;
};

export type TroughWindow = {
  symbol: string;
  troughMark: number;
  troughAt: string;
  windowMinutes: number;
  /** Prior local high for bounce edge. Omit if unknown — no invented edge. */
  recentHigh?: number;
};

export type GameAuthorize = {
  bankSleeve?: boolean;
  deconcentrate?: boolean;
  park?: boolean;
  parkTarget?: ParkTarget;
  /** Haircut dollars Game named. Omit if they only authorized "sleeve above floor". */
  sleeveUsd?: number;
  tokens?: string[];
};

export type DayState = {
  date: string;
  newWorkingEntries: number;
  /** Broker-realized day PnL only. null = unknown (do not invent). */
  realizedPnlUsd: number | null;
  losingWorkingRoundTrips: number;
};

export type PortfolioSnapshot = {
  /** Fixtures and docs samples must set this so they are never treated as live fills. */
  example?: boolean;
  asOf: string;
  account: {
    /** Example Game Agentic rhs: 813839826 — not a secret. */
    rhsAccountNumber: string;
    agenticAllowed: boolean;
  };
  mode: "LOW_CAP_SLOW";
  equityUsd?: number;
  sleeves: Sleeve[];
  quotes: Quote[];
  troughs: TroughWindow[];
  day: DayState;
  authorize?: GameAuthorize;
};

export type TrickEvaluation = {
  eligible: boolean;
  reason: string;
  symbol?: string;
};

export type FollowPath = {
  path_id: string;
  source: FollowPathSource;
  leader_system: string;
  horizon: Horizon;
  tokens: string[];
  trick_id: TrickId | string;
  gates: string[];
  /** wins/attempts when closed attempts exist; otherwise null (do not invent). */
  success_rate: number | null;
  status: FollowPathStatus;
};

export type LedgerAttempt = {
  attempt_id: string;
  path_id: string;
  trick_id: string;
  timestamp: string;
  order_ids: string[];
  /** Broker figure only. null if the broker did not print one. */
  realized_pnl: number | null;
  spread_at_entry: number | null;
  outcome: LedgerOutcome;
};

export type TrailAlert = {
  at: string;
  status: "alert";
  candidates: Array<{
    trick_id: string;
    reason: string;
    symbol?: string;
    path_id?: string;
  }>;
};

export type WatchCandidate = {
  trick_id: string;
  eligible: true;
  reason: string;
  symbol?: string;
  path_id?: string;
};

export type WatchResult = {
  status: "quiet" | "alert";
  asOf: string;
  halt: { soft: boolean; expectancy: boolean };
  candidates: WatchCandidate[];
  rejectedCount: number;
};

export type TrickRank = {
  trick_id: string;
  attempts: number;
  wins: number;
  success_rate: number | null;
  expectancy: number | null;
};

export type LedgerFile = {
  example?: boolean;
  paths: FollowPath[];
  attempts: LedgerAttempt[];
  alerts: TrailAlert[];
};
