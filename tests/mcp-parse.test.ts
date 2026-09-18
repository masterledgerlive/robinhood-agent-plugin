import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMcpHttpBody, parseWwwAuthenticate } from "../src/mcp/parse.js";
import { RobinhoodMcpClient } from "../src/mcp/client.js";
import { OAuthRequiredError } from "../src/mcp/oauth.js";

describe("streamable HTTP parser", () => {
  it("reads JSON-RPC from SSE data frames", () => {
    const body = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}',
      "",
    ].join("\n");
    const parsed = parseMcpHttpBody("text/event-stream", body);
    assert.deepEqual(parsed.result, { tools: [] });
  });

  it("parses Bearer WWW-Authenticate resource_metadata", () => {
    const parsed = parseWwwAuthenticate(
      'Bearer realm="mcp", resource_metadata="https://agent.robinhood.com/.well-known/oauth-protected-resource"',
    );
    assert.equal(parsed?.scheme, "bearer");
    assert.equal(
      parsed?.params.resource_metadata,
      "https://agent.robinhood.com/.well-known/oauth-protected-resource",
    );
  });

  it("turns HTTP 401 into OAuthRequiredError without leaking tokens", async () => {
    const client = new RobinhoodMcpClient({
      url: "https://agent.robinhood.com/mcp/trading",
      tokenProvider: { async getAccessToken() { return "secret-token"; } },
      fetch: async () =>
        new Response("unauthorized", {
          status: 401,
          headers: {
            "WWW-Authenticate":
              'Bearer resource_metadata="https://example.test/metadata"',
          },
        }),
    });
    await assert.rejects(() => client.connect(), (err: unknown) => {
      assert.ok(err instanceof OAuthRequiredError);
      assert.equal(err.resourceMetadataUrl, "https://example.test/metadata");
      assert.doesNotMatch(err.message, /secret-token/);
      return true;
    });
  });

  it("lists tools over JSON initialize + tools/list", async () => {
    const calls: string[] = [];
    const client = new RobinhoodMcpClient({
      url: "https://example.test/mcp",
      fetch: async (_url, init) => {
        const payload = JSON.parse(String(init?.body)) as { method?: string; id?: number };
        calls.push(payload.method ?? "");
        if (payload.method === "initialize") {
          return json({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-03-26" } });
        }
        if (payload.method === "notifications/initialized") {
          return new Response(null, { status: 204 });
        }
        if (payload.method === "tools/list") {
          return json({
            jsonrpc: "2.0",
            id: payload.id,
            result: { tools: [{ name: "get_accounts", inputSchema: { type: "object" } }] },
          });
        }
        return json({ jsonrpc: "2.0", id: payload.id, error: { code: -1, message: payload.method } });
      },
    });
    const tools = await client.listTools();
    assert.deepEqual(calls, ["initialize", "notifications/initialized", "tools/list"]);
    assert.equal(tools[0]?.name, "get_accounts");
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
