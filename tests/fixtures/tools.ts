import type { McpTool } from "../src/types.js";

const orderProps = {
  symbol: { type: "string" },
  side: { type: "string" },
  type: { type: "string" },
  quantity: { type: "string" },
  dollar_amount: { type: "string" },
};

/** Shapes from a live session. Tests treat these as examples, not a catalog. */
export const snapshotShapedTools: McpTool[] = [
  {
    name: "get_accounts",
    description:
      "List the user's brokerage accounts. Each account includes an agentic_allowed field.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_portfolio",
    description: "Get the account's portfolio market value and buying power.",
    inputSchema: {
      type: "object",
      properties: { account_number: { type: "string" } },
      required: ["account_number"],
    },
  },
  {
    name: "search",
    description:
      "Resolve a natural-language query to Robinhood instruments, crypto pairs, or market indexes.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        asset_type: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "preview_crypto_order",
    description:
      "Simulate a crypto order without placing it — estimated cost/credit and fees.",
    inputSchema: {
      type: "object",
      properties: {
        rhs_account_number: { type: "string" },
        ...orderProps,
      },
      required: ["rhs_account_number", "symbol", "side", "type"],
    },
  },
  {
    name: "place_crypto_order",
    description: "Place a real crypto order with real money. Parameters mirror preview.",
    inputSchema: {
      type: "object",
      properties: {
        rhs_account_number: { type: "string" },
        ...orderProps,
        ref_id: { type: "string" },
      },
      required: ["rhs_account_number", "symbol", "side", "type"],
    },
  },
  {
    name: "review_equity_order",
    description: "Simulate a stock order without placing it. Returns quote plus pre-trade alerts.",
    inputSchema: {
      type: "object",
      properties: {
        account_number: { type: "string" },
        ...orderProps,
      },
      required: ["account_number", "symbol", "side", "type"],
    },
  },
  {
    name: "place_equity_order",
    description: "Place a real equity order with real money.",
    inputSchema: {
      type: "object",
      properties: {
        account_number: { type: "string" },
        ...orderProps,
        ref_id: { type: "string" },
      },
      required: ["account_number", "symbol", "side", "type"],
    },
  },
  {
    name: "get_crypto_orders",
    description: "List crypto order history for an account — newest first. Open and closed orders.",
    inputSchema: {
      type: "object",
      properties: {
        rhs_account_number: { type: "string" },
        order_id: { type: "string" },
        cursor: { type: "string" },
        state: { type: "string" },
      },
      required: ["rhs_account_number"],
    },
  },
  {
    name: "get_pnl_trade_history",
    description:
      "Per-trade realized profit & loss (equities, options, crypto, prediction markets). Same data as the PnL hub.",
    inputSchema: {
      type: "object",
      properties: {
        account_number: { type: "string" },
        span: { type: "string" },
        cursor: { type: "string" },
      },
      required: ["account_number"],
    },
  },
  {
    name: "get_crypto_quotes",
    description: "Get real-time bid/ask/mark prices for crypto pair symbols.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: { type: "array", items: { type: "string" } },
        rhs_account_number: { type: "string" },
      },
      required: ["symbols"],
    },
  },
];

/** Future event-contract tools. Matcher must find these by schema, not a hardcoded name list. */
export const futureEventTools: McpTool[] = [
  {
    name: "simulate_event_ticket",
    description: "Simulate a prediction-market event contract order without placing it.",
    inputSchema: {
      type: "object",
      properties: {
        account_number: { type: "string" },
        contract_id: { type: "string" },
        side: { type: "string" },
        dollar_amount: { type: "string" },
        type: { type: "string" },
      },
      required: ["account_number", "contract_id", "side", "dollar_amount"],
    },
  },
  {
    name: "commit_event_ticket",
    description: "Place a real prediction-market event contract order with real money.",
    inputSchema: {
      type: "object",
      properties: {
        account_number: { type: "string" },
        contract_id: { type: "string" },
        side: { type: "string" },
        dollar_amount: { type: "string" },
        type: { type: "string" },
        ref_id: { type: "string" },
      },
      required: ["account_number", "contract_id", "side", "dollar_amount"],
    },
  },
];

export const decoyTools: McpTool[] = [
  {
    name: "place_pizza",
    description: "Order pizza for the office.",
    inputSchema: {
      type: "object",
      properties: { topping: { type: "string" }, size: { type: "string" } },
    },
  },
  {
    name: "review_docs",
    description: "Review a markdown document.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
];
