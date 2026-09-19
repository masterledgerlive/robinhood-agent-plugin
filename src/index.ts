export { DEFAULT_MCP_URL, CLIENT_INFO, RISK_BUCKET } from "./constants.js";
export {
  RobinhoodMcpClient,
  connectRobinhoodMcp,
  McpProtocolError,
} from "./mcp/client.js";
export {
  OAUTH_NOTES,
  OAuthRequiredError,
  describeOAuth,
  envTokenProvider,
  staticTokenProvider,
} from "./mcp/oauth.js";
export { parseMcpHttpBody, parseSseJsonRpc, parseWwwAuthenticate } from "./mcp/parse.js";
export {
  matchCapabilities,
  pairReviewPlace,
  findReviewPlacePair,
  isPlaceTool,
  isReviewTool,
  laneForTool,
} from "./capabilities/matcher.js";
export type { CapabilityIndex, MatchedTool, ReviewPlacePair } from "./capabilities/matcher.js";
export { formatMachineLog, formatMachineLogBlock, extractBrokerIds } from "./log/machine-log.js";
export { formatTrailView, formatWatchMachineLog, watchToMachineLog } from "./log/trail-view.js";
export { redactArgs, stableFingerprint } from "./log/redact.js";
export {
  EXAMPLE_AGENTIC_RHS,
  BANK_ORDER,
  FIL_MCP_DISPLAY_ONLY,
  LOW_CAP_SLOW,
  DIVIDEND_15M,
  SURF_LEARN,
  TRAIL_HORIZON_DEFAULT,
  TRICK_IDS,
  SuccessLedger,
  LedgerError,
  watch15m,
  FixtureBroker,
  assertSnapshot,
  SnapshotError,
  followPathSchema,
  ledgerAttemptSchema,
  portfolioSnapshotSchema,
  successLedgerSchema,
} from "./trail/index.js";
export type {
  FollowPath,
  LedgerAttempt,
  PortfolioSnapshot,
  TrailBrokerPort,
  TrickEvaluation,
  WatchResult,
  WhatIfPath,
} from "./trail/index.js";
export {
  TRICK_CATALOG,
  listTricks,
  getTrick,
  evaluateTrick,
  evaluateAll,
} from "./tricks/index.js";
export type { Trick } from "./tricks/index.js";
export { RiskGuard, HaltError, RiskViolationError, policyFromEnv } from "./risk/guard.js";
export { resolveTradingMode, assertToolAllowedInMode, PaperBlockedError } from "./mode/trading-mode.js";
export {
  runGatedToolCall,
  ReviewCache,
  extractNotionalUsd,
} from "./session/workflow.js";
export type { McpTool, TradingMode, MachineLogEntry, FillRecord, RiskPolicy } from "./types.js";
