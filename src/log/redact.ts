const REDACT_KEY =
  /(account|token|secret|password|authorization|cookie|email|ssn|routing|iban|wallet|mnemonic|private.?key|access_?token|refresh)/i;

const KEEP_ID_KEY = /^(order_id|orderid|fill_id|fillid|ref_id|refid)$/i;

export function redactArgs(
  args: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!args) return {};
  return redactValue(args) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactKeyValue(key, child);
    }
    return out;
  }
  return value;
}

function redactKeyValue(key: string, value: unknown): unknown {
  if (KEEP_ID_KEY.test(key)) {
    return value;
  }
  if (REDACT_KEY.test(key)) {
    return redactSecret(value);
  }
  if (value && typeof value === "object") {
    return redactValue(value);
  }
  return value;
}

function redactSecret(value: unknown): unknown {
  if (typeof value !== "string") {
    return "[REDACTED]";
  }
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return "[REDACTED]";
  }
  return `…${trimmed.slice(-4)}`;
}

export function stableFingerprint(args: Record<string, unknown>): string {
  const redacted = redactArgs(args);
  const keys = Object.keys(redacted).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    const value = redacted[key];
    if (value !== undefined) normalized[key] = value;
  }
  return JSON.stringify(normalized);
}
