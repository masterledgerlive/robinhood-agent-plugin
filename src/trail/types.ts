import type { FOLLOW_PATH_SOURCES, FOLLOW_PATH_STATUSES, GateMode, TrickId } from "./constants.js";

export type { GateMode };

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
  /** Observed mark ~15m ago. Omit if unknown — do not invent momentum. */
  priorMark?: number;
  /**
   * Next-15m mark for SURF_LEARN paper what-if only.
   * Omit if unknown — that surfer is skipped. Never a broker fill.
   */
  mark15m?: number;
  /** Session open mark. Omit if unknown — red-day book leg will not invent it. */
  sessionOpen?: number;
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
  /** Game ping that a red-day / risk-off is on. Counts as whisper-leg A alone. */
  redDay?: boolean;
};

export type WhisperTheme = "red_day" | "massive_up" | "token_specific";
export type WhisperRouteHint = "exit_working" | "hold_banks" | "buy_trough";
/** IKN Wild West: unverified chatter starts in quarantine. */
export type WhisperStatus = "quarantine" | "confirmed" | "expired";

export type WhisperCard = {
  whisper_id: string;
  heard_at: string;
  source: string;
  theme: WhisperTheme;
  tokens: string[];
  route_hint: WhisperRouteHint;
  confidence: number;
  status: WhisperStatus;
  example?: boolean;
};

export type RedDayLeg = {
  whisper: boolean;
  book: boolean;
  tape: boolean;
};

export type RedDayExitSeat = {
  symbol: string;
  notionalUsd: number;
  leaveDustUsd: number;
};

export type RedDayBuyTrough = {
  symbol: string;
  whisper_id: string;
  status: WhisperStatus;
  reason: string;
};

export type RedDayResult = {
  status: "quiet" | "armed" | "fired";
  reasons: string[];
  legs: RedDayLeg;
  active: boolean;
  recommendations: {
    exitWorkingToDust: RedDayExitSeat[];
    buyTrough: RedDayBuyTrough[];
  };
  whispers: WhisperCard[];
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
  mode: GateMode;
  equityUsd?: number;
  /** Broker buying power. Live micros need ≥ $2. Omit if unknown. */
  buyingPowerUsd?: number;
  sleeves: Sleeve[];
  quotes: Quote[];
  troughs: TroughWindow[];
  day: DayState;
  authorize?: GameAuthorize;
  /** Optional inbox on the snapshot. Unverified cards default to quarantine. */
  whispers?: WhisperCard[];
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
  /** paper_surf = SURF_LEARN what-if (no order id). Default live. */
  kind?: "live" | "paper_surf";
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

export type WhatIfPath = {
  path_id: string;
  trick_id: string;
  symbol: string;
  notionalUsd: number;
  /** Paper mark-to-mark after estimated RT. Not a broker fill. */
  whatIfPnlUsd: number;
  spreadAtEntry: number;
  liveClears: boolean;
  rank: number;
};

export type SurfLearnResult = {
  ran: true;
  notionalUsd: number;
  whatIfTop: WhatIfPath[];
  liveMicroOk: boolean;
};

export type NextMoveAction = "hold" | "accumulate" | "enter" | "red_day_exit";

/** Math-only recommendation. Never an order. */
export type NextMove = {
  action: NextMoveAction;
  trick_id: string;
  reason: string;
  live: boolean;
  symbol?: string;
  path_id?: string;
};

export type WatchResult = {
  status: "quiet" | "alert";
  asOf: string;
  halt: { soft: boolean; expectancy: boolean; redDay: boolean };
  candidates: WatchCandidate[];
  rejectedCount: number;
  learn: SurfLearnResult;
  redDay: RedDayResult;
  nextMove: NextMove;
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
