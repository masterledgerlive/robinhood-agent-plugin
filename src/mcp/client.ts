import {
  CLIENT_INFO,
  DEFAULT_MCP_URL,
  DEFAULT_PROTOCOL_VERSION,
} from "../constants.js";
import type { JsonRpcRequest, JsonRpcResponse, McpTool, TokenProvider } from "../types.js";
import { OAuthRequiredError } from "./oauth.js";
import { parseMcpHttpBody, parseWwwAuthenticate } from "./parse.js";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RobinhoodMcpClientOptions = {
  url?: string;
  tokenProvider?: TokenProvider;
  fetch?: FetchLike;
  clientInfo?: { name: string; version: string };
  protocolVersion?: string;
};

export class McpProtocolError extends Error {
  readonly rpc?: JsonRpcResponse["error"];
  constructor(message: string, rpc?: JsonRpcResponse["error"]) {
    super(message);
    this.name = "McpProtocolError";
    if (rpc) this.rpc = rpc;
  }
}

/**
 * Minimal Streamable HTTP MCP client.
 * Cursor already speaks this transport. Use this helper in scripts/tests/agents
 * that are not running inside Cursor's MCP host.
 */
export class RobinhoodMcpClient {
  readonly url: string;
  private readonly tokenProvider?: TokenProvider;
  private readonly fetchImpl: FetchLike;
  private readonly clientInfo: { name: string; version: string };
  private readonly protocolVersion: string;
  private nextId = 1;
  private sessionId: string | undefined;
  private initialized = false;

  constructor(options: RobinhoodMcpClientOptions = {}) {
    this.url = options.url ?? DEFAULT_MCP_URL;
    if (options.tokenProvider) this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetch ?? fetch;
    this.clientInfo = options.clientInfo ?? CLIENT_INFO;
    this.protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  }

  async connect(): Promise<void> {
    const result = await this.rpc("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: this.clientInfo,
    });
    if (!result || typeof result !== "object") {
      throw new McpProtocolError("initialize returned no result");
    }
    await this.rpcNotify("notifications/initialized");
    this.initialized = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureConnected();
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const params: Record<string, unknown> = {};
      if (cursor) params.cursor = cursor;
      const result = (await this.rpc("tools/list", params)) as {
        tools?: McpTool[];
        nextCursor?: string;
      };
      for (const tool of result.tools ?? []) {
        tools.push(tool);
      }
      cursor = result.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensureConnected();
    return this.rpc("tools/call", { name, arguments: args });
  }

  async close(): Promise<void> {
    this.initialized = false;
    this.sessionId = undefined;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.initialized) {
      await this.connect();
    }
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const response = await this.post(payload);
    if (response.error) {
      throw new McpProtocolError(response.error.message, response.error);
    }
    return response.result;
  }

  private async rpcNotify(method: string, params?: unknown): Promise<void> {
    const payload = {
      jsonrpc: "2.0" as const,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    await this.post(payload, { notification: true });
  }

  private async post(
    payload: unknown,
    opts: { notification?: boolean } = {},
  ): Promise<JsonRpcResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": this.protocolVersion,
    };
    const token = await this.tokenProvider?.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const session = res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id");
    if (session) this.sessionId = session;

    if (res.status === 401) {
      const www = res.headers.get("www-authenticate");
      const parsed = parseWwwAuthenticate(www);
      const resourceMetadataUrl = parsed?.params.resource_metadata;
      throw new OAuthRequiredError(
        "Robinhood MCP returned 401. Complete OAuth in Cursor or supply a TokenProvider.",
        {
          ...(www ? { wwwAuthenticate: www } : {}),
          ...(resourceMetadataUrl ? { resourceMetadataUrl } : {}),
        },
      );
    }

    if (res.status === 204 || opts.notification) {
      return { jsonrpc: "2.0" };
    }

    if (!res.ok) {
      const text = await res.text();
      throw new McpProtocolError(
        `MCP HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const body = await res.text();
    if (!body.trim()) {
      return { jsonrpc: "2.0" };
    }
    return parseMcpHttpBody(res.headers.get("content-type") ?? "application/json", body);
  }
}

export async function connectRobinhoodMcp(
  options: RobinhoodMcpClientOptions = {},
): Promise<RobinhoodMcpClient> {
  const client = new RobinhoodMcpClient(options);
  await client.connect();
  return client;
}
