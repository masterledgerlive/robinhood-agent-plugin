import { RISK_BUCKET } from "../constants.js";
import { DEFAULT_GATE_MODE, EXAMPLE_AGENTIC_RHS, SURF_LEARN } from "../trail/constants.js";
import type { SuccessLedger } from "../trail/ledger.js";
import type { PortfolioSnapshot, WatchResult } from "../trail/types.js";
import type { MachineLogEntry } from "../types.js";
import { formatMachineLog } from "./machine-log.js";
import { redactArgs } from "./redact.js";

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function rateText(rate: number | null): string {
  return rate === null ? "n/a" : rate.toFixed(3);
}

function pad(text: string, n: number): string {
  return text.length >= n ? text : text + " ".repeat(n - text.length);
}

function lastFourAccount(rhs: string | undefined): string {
  if (!rhs) return "none";
  const redacted = redactArgs({ rhs_account_number: rhs }).rhs_account_number;
  return typeof redacted === "string" ? redacted : "…";
}

/**
 * Plain-text dump of follow-paths, trick ranks, and last alerts.
 * Same ticker style as MACHINE LOG — humans and agents both read it.
 */
export function formatTrailView(input: {
  at?: string;
  snapshot?: PortfolioSnapshot;
  ledger?: SuccessLedger;
  watch?: WatchResult;
}): string {
  const at = input.at ?? input.watch?.asOf ?? input.snapshot?.asOf ?? new Date().toISOString();
  const rhs = input.snapshot?.account.rhsAccountNumber ?? EXAMPLE_AGENTIC_RHS;
  const agentic = input.snapshot?.account.agenticAllowed !== false;
  const watch = input.watch?.status ?? "quiet";
  const paths = input.ledger?.paths ?? [];
  const ranks = input.ledger?.rankedTricks() ?? [];
  const alerts = input.ledger?.lastAlerts(5) ?? [];

  const pathLines =
    paths.length === 0
      ? ["  none"]
      : paths.map((p) => {
          return `  ${pad(p.path_id, 28)} ${pad(p.source, 18)} ${pad(p.horizon, 4)} ${pad(p.trick_id, 28)} rate ${rateText(p.success_rate)}  ${p.status}`;
        });

  const rankLines =
    ranks.length === 0
      ? ["  none"]
      : ranks.map((r) => {
          const exp = r.expectancy === null ? "n/a" : r.expectancy.toFixed(4);
          return `  ${pad(r.trick_id, 28)} rate ${rateText(r.success_rate)}  attempts ${r.attempts}  wins ${r.wins}  expectancy ${exp}`;
        });

  const alertLines =
    alerts.length === 0
      ? ["  none"]
      : alerts.map((a) => {
          const names = a.candidates.map((c) => c.trick_id).join(", ");
          return `  ${a.at}  ${names}`;
        });

  const candidateLines =
    !input.watch || input.watch.candidates.length === 0
      ? ["  none"]
      : input.watch.candidates.map((c) => {
          const path = c.path_id ? ` path ${c.path_id}` : "";
          const sym = c.symbol ? ` ${c.symbol}` : "";
          return `  ${c.trick_id}${sym}${path} — ${singleLine(c.reason)}`;
        });

  const mode = input.snapshot?.mode ?? DEFAULT_GATE_MODE;
  const learn = input.watch?.learn;
  const bp = input.snapshot?.buyingPowerUsd;
  const bpLine =
    bp === undefined
      ? "unknown (live micros need ≥ $2 when printed)"
      : bp >= SURF_LEARN.liveMicroMinBuyingPowerUsd
        ? `${bp.toFixed(2)} (>= $2 live micros)`
        : `${bp.toFixed(2)} (learn only — no live micro)`;

  const whatIfLines =
    !learn || learn.whatIfTop.length === 0
      ? ["  none"]
      : learn.whatIfTop.map((row) => {
          const pnl = `${row.whatIfPnlUsd >= 0 ? "+" : ""}${row.whatIfPnlUsd.toFixed(4)}`;
          return `  ${row.rank}  ${pad(row.path_id, 36)} paper ${pnl}  live=${row.liveClears ? "yes" : "no"}  ${row.trick_id} ${row.symbol}`;
        });

  const red = input.watch?.redDay;
  const redDayLines = !red
    ? ["  quiet"]
    : [
        `  status ${red.status}  legs whisper=${red.legs.whisper} book=${red.legs.book} tape=${red.legs.tape}`,
        ...red.reasons.map((r) => `  ${singleLine(r)}`),
        red.recommendations.exitWorkingToDust.length === 0
          ? "  exit_working_to_dust  none (never flatten banks)"
          : `  exit_working_to_dust  ${red.recommendations.exitWorkingToDust
              .map((s) => `${s.symbol} leave $${s.leaveDustUsd.toFixed(2)}`)
              .join(", ")}`,
        red.recommendations.buyTrough.length === 0
          ? "  buy_trough  none"
          : `  buy_trough  ${red.recommendations.buyTrough
              .map((b) => `${b.symbol}[${b.status}]`)
              .join(", ")}`,
      ];

  const whisperLines =
    !red || red.whispers.length === 0
      ? ["  none"]
      : red.whispers.map((w) => {
          return `  ${pad(w.whisper_id, 22)} ${pad(w.source, 18)} ${pad(w.theme, 16)} ${pad(w.status, 11)} ${w.route_hint} ${w.tokens.join(",")}`;
        });

  return [
    "=== TRAIL VIEW ===",
    `TIME    ${at}`,
    `ACCOUNT rhs ${lastFourAccount(rhs)}${agentic ? " (Agentic)" : " (not agentic)"}`,
    `MODE    ${mode} + ${SURF_LEARN.id}`,
    `BUCKET  ${RISK_BUCKET}`,
    `WATCH   ${watch}`,
    `HALT    soft=${input.watch?.halt.soft ?? false} expectancy=${input.watch?.halt.expectancy ?? false} red_day=${input.watch?.halt.redDay ?? false}`,
    `LEARN   ${SURF_LEARN.id} $${SURF_LEARN.notionalUsd} every cycle (paper; no place)`,
    `BP      ${bpLine}`,
    "CANDIDATES",
    ...candidateLines,
    "WHAT-IF TOP",
    ...whatIfLines,
    "RED_DAY",
    ...redDayLines,
    "WHISPERS",
    ...whisperLines,
    "PATHS",
    ...pathLines,
    "TRICK RANKS",
    ...rankLines,
    "LAST ALERTS",
    ...alertLines,
    "=== END TRAIL ===",
  ].join("\n");
}

export function watchToMachineLog(
  watch: WatchResult,
  snapshot: PortfolioSnapshot,
): MachineLogEntry {
  const n = watch.candidates.length;
  const names = watch.candidates.map((c) => c.trick_id).join(", ");
  const entry: MachineLogEntry = {
    at: watch.asOf,
    mode: "paper",
    bucket: RISK_BUCKET,
    intent: "15m trail watch (deterministic; no place)",
    tool: "watch15m",
    args: {
      example: snapshot.example === true,
      asOf: snapshot.asOf,
      rhs_account_number: snapshot.account.rhsAccountNumber,
      candidate_count: n,
      whatif_top: watch.learn.whatIfTop.length,
      surf_learn: true,
      red_day: watch.redDay.status,
    },
    result: {
      ok: true,
      summary:
        watch.redDay.status === "fired"
          ? `alert | RED_DAY fired; ${watch.redDay.recommendations.exitWorkingToDust.length} exit seats (no place)`
          : watch.status === "quiet"
            ? `quiet | 0 live candidates; SURF_LEARN top ${watch.learn.whatIfTop.length}`
            : `alert | ${n} ${names || watch.redDay.status}`,
      orderId: null,
      fillId: null,
      realizedPnl: null,
    },
    human:
      watch.redDay.status === "fired"
        ? "RED_DAY fired. Recommend exit working to dust + staged buy_trough. Watcher did not place."
        : watch.status === "quiet"
          ? "Quiet live book. SURF_LEARN what-if ranks updated. No place."
          : "Alert. Agent/human may step in on gate-clear tricks. No order placed by watcher.",
  };
  return entry;
}

export function formatWatchMachineLog(watch: WatchResult, snapshot: PortfolioSnapshot): string {
  return formatMachineLog(watchToMachineLog(watch, snapshot));
}
