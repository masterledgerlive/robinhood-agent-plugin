/**
 * LOW_CAP_SLOW rails and bank order for Game's Agentic book.
 * rhs 813839826 is an example account id (not a secret).
 */

/** Example Robinhood Agentic rhs — documentation only. */
export const EXAMPLE_AGENTIC_RHS = "813839826";

export const BANK_ORDER = ["NEAR", "FIL", "CHIP"] as const;
export type BankSymbol = (typeof BANK_ORDER)[number];

/** FIL-USD is searchable/quotable but display-only for agentic place/preview (2026-09-18). */
export const FIL_MCP_DISPLAY_ONLY = true;

export const LOW_CAP_SLOW = {
  id: "LOW_CAP_SLOW",
  maxNewWorkingEntriesPerDay: 1,
  maxWorkingSeats: 2,
  /** Hard ceiling on (ask-bid)/mid. */
  maxSpread: 0.008,
  /** Required bounce/profit edge as a multiple of round-trip spread. */
  minEdgeMultipleOfRtSpread: 2,
  softHaltRealizedUsd: -1,
  expectancyHaltLosingWorkingRts: 5,
  bankDustFloorPctOfPeak: 0.1,
  bankDustFloorUsd: 0.25,
  workingDustFloorPctOfPeak: 0.05,
  workingDustFloorUsd: 0.1,
  troughWindowMinMinutes: 15,
  troughWindowMaxMinutes: 30,
  /** First-half of trough→recentHigh only; later is chase. */
  chaseMaxFractionOfBounce: 0.5,
} as const;

export const TRAIL_HORIZON_DEFAULT = "15m" as const;

export const FOLLOW_PATH_SOURCES = [
  "rh_mcp",
  "rh_mobile",
  "cascade_chatter",
  "external_agentic",
  "news",
  "github_code",
] as const;

export const FOLLOW_PATH_STATUSES = ["trailing", "paused", "graduated", "retired"] as const;

export const TRICK_IDS = [
  "trough_bounce_15m",
  "bank_sleeve_authorized",
  "deconcentrate_high_notional",
  "park_to_near",
  "park_to_chip",
  "expectancy_halt",
  "soft_halt",
] as const;

export type TrickId = (typeof TRICK_IDS)[number];
