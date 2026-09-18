export type TradingMode = "paper" | "live";

export type RiskBucket = "RISK";

export type Lane =
  | "crypto"
  | "equity"
  | "option"
  | "advanced"
  | "event"
  | "unknown";

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
};

export type TokenProvider = {
  getAccessToken: () => Promise<string | undefined>;
};

export type MachineLogResult = {
  ok: boolean;
  summary: string;
  orderId?: string | null;
  fillId?: string | null;
  /** Only a broker-returned figure. Never invent. */
  realizedPnl?: string | null;
};

export type MachineLogEntry = {
  at?: string;
  mode: TradingMode;
  bucket: RiskBucket;
  intent: string;
  tool: string;
  args: Record<string, unknown>;
  result: MachineLogResult;
  human: string;
};

export type FillRecord = {
  orderId: string;
  filledAt: string;
  source: "broker";
  symbol?: string;
  side?: string;
  notionalUsd?: number;
  /** Only when the broker returned it on this fill. */
  realizedPnlUsd?: number;
};

export type RiskPolicy = {
  bucket: RiskBucket;
  dailyDrawdownHaltPct: number;
  maxBetUsd: number;
  maxRollUsd: number;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};
