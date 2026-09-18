import { DEFAULT_MCP_URL } from "../constants.js";
import type { TokenProvider } from "../types.js";

/**
 * OAuth notes for Robinhood Agentic Trading MCP.
 *
 * Cursor / this plugin:
 *   Point mcp.json at https://agent.robinhood.com/mcp/trading
 *   Complete the OAuth popup. Do not paste passwords into chat.
 *
 * Scripts using this library:
 *   Prefer a TokenProvider that reads a host-managed token.
 *   Do not log tokens. MACHINE LOG redacts Authorization.
 *
 * On HTTP 401:
 *   1. Read WWW-Authenticate (Bearer + resource_metadata).
 *   2. Fetch protected resource metadata (RFC 9728).
 *   3. Fetch authorization-server metadata.
 *   4. PKCE authorization code (Cursor does this for you).
 *   5. Retry with Authorization: Bearer <access_token>.
 *
 * This plugin does not embed a Robinhood client secret.
 * Dynamic client registration belongs to the MCP host (Cursor).
 */
export const OAUTH_NOTES = [
  "Connect via Cursor MCP OAuth to https://agent.robinhood.com/mcp/trading",
  "Do not paste passwords or refresh tokens into chat or MACHINE LOG",
  "Scripts: inject TokenProvider.getAccessToken(); never hardcode secrets",
  "401: parse WWW-Authenticate resource_metadata, then PKCE — host-managed",
].join("\n");

export class OAuthRequiredError extends Error {
  readonly status = 401;
  readonly resourceMetadataUrl?: string;
  readonly wwwAuthenticate?: string;

  constructor(message: string, opts?: { resourceMetadataUrl?: string; wwwAuthenticate?: string }) {
    super(message);
    this.name = "OAuthRequiredError";
    if (opts?.resourceMetadataUrl !== undefined) {
      this.resourceMetadataUrl = opts.resourceMetadataUrl;
    }
    if (opts?.wwwAuthenticate !== undefined) {
      this.wwwAuthenticate = opts.wwwAuthenticate;
    }
  }
}

export function staticTokenProvider(token: string | undefined): TokenProvider {
  return {
    async getAccessToken() {
      return token;
    },
  };
}

export function envTokenProvider(
  env: NodeJS.ProcessEnv = process.env,
): TokenProvider {
  return {
    async getAccessToken() {
      const token =
        env.ROBINHOOD_MCP_ACCESS_TOKEN ?? env.MCP_ACCESS_TOKEN ?? undefined;
      return token;
    },
  };
}

export function describeOAuth(endpoint = DEFAULT_MCP_URL): string {
  return [
    `Endpoint: ${endpoint}`,
    "Transport: streamable HTTP (POST JSON-RPC, optional SSE responses)",
    OAUTH_NOTES,
  ].join("\n");
}
