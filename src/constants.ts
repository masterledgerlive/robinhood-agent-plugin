/** Default Robinhood Agentic Trading MCP endpoint (streamable HTTP). */
export const DEFAULT_MCP_URL = "https://agent.robinhood.com/mcp/trading";

export const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

export const CLIENT_INFO = {
  name: "robinhood-agent-plugin",
  version: "1.1.0",
} as const;

/** RISK-only. SAVE / vault is never a valid trading bucket for this plugin. */
export const RISK_BUCKET = "RISK" as const;

export const DEFAULT_DAILY_DRAWDOWN_HALT_PCT = 0.2;
export const DEFAULT_MAX_BET_USD = 2;
export const DEFAULT_MAX_ROLL_USD = 7;

/**
 * Snapshot tool names are documentation only.
 * Production code must re-discover via tools/list and match by schema shape.
 */
export const SNAPSHOT_IS_NOT_SOURCE_OF_TRUTH =
  "Do not treat snapshot tool names as the live catalog. Call tools/list.";
