import { readFileSync } from "node:fs";
import { WHISPER_ROUTES, WHISPER_STATUSES, WHISPER_THEMES } from "./constants.js";
import type { WhisperCard, WhisperRouteHint, WhisperStatus, WhisperTheme } from "./types.js";

export class WhisperError extends Error {
  readonly code = "WHISPER";
  constructor(message: string) {
    super(message);
    this.name = "WhisperError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function assertWhisper(raw: unknown): WhisperCard {
  if (!isRecord(raw)) throw new WhisperError("Whisper card must be an object");
  if (typeof raw.whisper_id !== "string" || !raw.whisper_id.trim()) {
    throw new WhisperError("whisper_id is required");
  }
  if (typeof raw.heard_at !== "string") throw new WhisperError("heard_at is required");
  if (typeof raw.source !== "string" || !raw.source.trim()) {
    throw new WhisperError("source is required");
  }
  if (!WHISPER_THEMES.includes(raw.theme as WhisperTheme)) {
    throw new WhisperError("theme must be red_day | massive_up | token_specific");
  }
  if (!Array.isArray(raw.tokens) || !raw.tokens.every((t) => typeof t === "string")) {
    throw new WhisperError("tokens must be a string array");
  }
  if (!WHISPER_ROUTES.includes(raw.route_hint as WhisperRouteHint)) {
    throw new WhisperError("route_hint must be exit_working | hold_banks | buy_trough");
  }
  if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
    throw new WhisperError("confidence must be 0-1");
  }
  const status = (raw.status as WhisperStatus | undefined) ?? "quarantine";
  if (!WHISPER_STATUSES.includes(status)) {
    throw new WhisperError("status must be quarantine | confirmed | expired");
  }
  const card: WhisperCard = {
    whisper_id: raw.whisper_id,
    heard_at: raw.heard_at,
    source: raw.source,
    theme: raw.theme as WhisperTheme,
    tokens: [...raw.tokens],
    route_hint: raw.route_hint as WhisperRouteHint,
    confidence: raw.confidence,
    status,
  };
  if (raw.example === true) card.example = true;
  return card;
}

export function loadWhispers(raw: unknown): WhisperCard[] {
  if (Array.isArray(raw)) return raw.map(assertWhisper);
  if (isRecord(raw) && Array.isArray(raw.whispers)) return raw.whispers.map(assertWhisper);
  throw new WhisperError("Whisper file must be an array or { whispers: [] }");
}

/** JSON or JSONL inbox. Default status is quarantine (IKN Wild West). */
export function loadWhisperFile(filePath: string): WhisperCard[] {
  const text = readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  if (filePath.endsWith(".jsonl")) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => assertWhisper(JSON.parse(line) as unknown));
  }
  return loadWhispers(JSON.parse(text) as unknown);
}

export const whisperCardSchema = {
  $id: "https://github.com/masterledgerlive/robinhood-agent-plugin/schemas/whisper-card.json",
  title: "WhisperCard",
  type: "object",
  additionalProperties: true,
  required: ["whisper_id", "heard_at", "source", "theme", "tokens", "route_hint", "confidence", "status"],
  properties: {
    example: { type: "boolean" },
    $comment: { type: "string" },
    whisper_id: { type: "string" },
    heard_at: { type: "string", format: "date-time" },
    source: { type: "string" },
    theme: { type: "string", enum: [...WHISPER_THEMES] },
    tokens: { type: "array", items: { type: "string" } },
    route_hint: { type: "string", enum: [...WHISPER_ROUTES] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    status: {
      type: "string",
      enum: [...WHISPER_STATUSES],
      description: "IKN Wild West: unverified chatter starts in quarantine",
    },
  },
} as const;
