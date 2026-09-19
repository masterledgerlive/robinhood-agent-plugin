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
  /**
   * Observed local/session high. Omit if unknown — peak math will not invent a high.
   * Prefer broker/session high when available; else trough.recentHigh or mark.
   */
  sessionHigh?: number;
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

/** Green-only shelter while RED_DAY active — still green vs session open. */
export type RedDayGreenPark = {
  symbol: string;
  climbFromOpen: number;
  reason: string;
};

/**
 * Lesson phases (agents optional — cron prints WHERE/WHEN):
 * defend → exit red working to dust
 * green_shelter → park into green-only until bottoms
 * wait_bottoms → hold green; stage troughs
 * reenter → trough reclaim on staged / green names (agentless recommend)
 * cleared → NEAR reclaimed session open (or Game clear)
 */
export type RedDayPhase =
  | "quiet"
  | "defend"
  | "green_shelter"
  | "wait_bottoms"
  | "reenter"
  | "cleared";

export type RedDayResult = {
  status: "quiet" | "armed" | "fired";
  phase: RedDayPhase;
  reasons: string[];
  legs: RedDayLeg;
  active: boolean;
  /** NEAR reclaimed session open — clear RED_DAY_ACTIVE. */
  cleared: boolean;
  recommendations: {
    exitWorkingToDust: RedDayExitSeat[];
    parkGreenOnly: RedDayGreenPark[];
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

export type NextMoveAction =
  | "hold"
  | "accumulate"
  | "enter"
  | "red_day_exit"
  | "green_only_park"
  | "trick_out"
  | "second_wave";

/** Math-only recommendation. Never an order. */
export type NextMove = {
  action: NextMoveAction;
  trick_id: string;
  reason: string;
  live: boolean;
  symbol?: string;
  path_id?: string;
};

/** Per-token auto trigger — armed by wave math; agents optional. */
export type TriggerRole = "bank" | "working" | "dust" | "candidate" | "whisper";
export type TriggerState = "waiting" | "armed" | "fired" | "blocked";
export type TriggerAction =
  | "none"
  | "hold_bank"
  | "hold_dust"
  | "park_to_near"
  | "park_to_chip"
  | "park_green_only"
  | "enter_trough"
  | "enter_mean_revert"
  | "enter_momentum"
  | "exit_to_dust"
  | "buy_trough"
  | "trick_out_at_peak"
  | "ride_peak"
  | "second_wave_reentry";

/** Broker create_alert shape — recommend only; watcher never writes alerts. */
export type TriggerBrokerAlertSpec = {
  symbol: string;
  asset_class: "crypto" | "equity";
  condition_type: "price_above" | "price_below";
  threshold: string;
  purpose: "take_profit" | "stop" | "trough_reclaim" | "peak_pullback";
};

export type TokenTrigger = {
  symbol: string;
  role: TriggerRole;
  state: TriggerState;
  where: TriggerAction;
  when: {
    takeProfitMark?: number;
    stopMark?: number;
    troughReclaimMark?: number;
    parkEligible: boolean;
    leaveDustUsd?: number;
    equation: string;
  };
  cascade: {
    whisperScore: number;
    route: WhisperRouteHint | null;
    sources: string[];
    equation: string;
  };
  brokerAlerts: TriggerBrokerAlertSpec[];
  /** Always false for wave arms — cron works when agents are silent. */
  agentRequired: boolean;
  wave?: {
    kind: string;
    amplitude: number;
    phase: number | null;
    edgeClears: boolean;
    spreadOk: boolean;
    equation: string;
  };
};

export type TokenTriggerPlan = {
  eqId: string;
  asOf: string;
  agentRequired: false;
  waves: Array<{
    symbol: string;
    kind: string;
    amplitude: number;
    phase: number | null;
    edgeClears: boolean;
    spreadOk: boolean;
    equation: string;
  }>;
  tokens: TokenTrigger[];
  actionableCount: number;
  next: { symbol: string; where: TriggerAction; reason: string };
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
  /** Automatic per-token triggers from wave equation. Agents optional. */
  triggers: TokenTriggerPlan;
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
