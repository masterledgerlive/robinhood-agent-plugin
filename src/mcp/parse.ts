import type { JsonRpcResponse } from "../types.js";

/**
 * Parse a Streamable HTTP MCP body.
 * Servers may return JSON or SSE (`text/event-stream`).
 */
export function parseMcpHttpBody(
  contentType: string,
  body: string,
): JsonRpcResponse {
  const type = contentType.toLowerCase();
  if (type.includes("text/event-stream")) {
    return parseSseJsonRpc(body);
  }
  const parsed = JSON.parse(body) as JsonRpcResponse;
  return parsed;
}

export function parseSseJsonRpc(body: string): JsonRpcResponse {
  const messages: JsonRpcResponse[] = [];
  const blocks = body.replace(/\r\n/g, "\n").split("\n\n");
  for (const block of blocks) {
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    if (!data || data === "[DONE]") continue;
    messages.push(JSON.parse(data) as JsonRpcResponse);
  }
  const withId = [...messages].reverse().find((m) => m && m.id !== undefined);
  const last = withId ?? messages.at(-1);
  if (!last) {
    throw new Error("SSE body had no JSON-RPC message");
  }
  return last;
}

export function parseWwwAuthenticate(header: string | null): {
  scheme: string;
  params: Record<string, string>;
} | null {
  if (!header) return null;
  const trimmed = header.trim();
  const space = trimmed.indexOf(" ");
  const scheme = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
  const rest = space === -1 ? "" : trimmed.slice(space + 1);
  const params: Record<string, string> = {};
  const re = /([a-zA-Z0-9_!#$%&'+,.^`|~-]+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest))) {
    const key = match[1];
    if (!key) continue;
    params[key.toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return { scheme, params };
}
