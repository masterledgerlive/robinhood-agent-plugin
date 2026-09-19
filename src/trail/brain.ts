/**
 * BRAIN_INJECT — recursive memory + transmission-cost learning.
 *
 * Injected every watch/load cycle when a ledger is present (and always
 * computed onto WatchResult). Notes live in plain data fields so humans
 * and agents can read what the brain learned without digging code.
 *
 * Transmission cost = round-trip spread (2× one-way). Paper SURF_LEARN
 * already subtracts RT from what-if PnL; the brain aggregates those costs
 * across cycles and proves usefulness by:
 *   1. cost-aware re-rank of WHAT-IF TOP (pnl per RT dollar)
 *   2. prefer-tighter-edge hint when costs eat paper edge
 *   3. prime spread penalty from remembered mean RT
 *   4. momentum unlock visibility in notes
 *
 * Never invents fills or PnL. Never places. Risk rails stay elsewhere —
 * this module's job is prove learning is injected, useful, and trackable.
 */

import { DIVIDEND_15M, SURF_LEARN } from "./constants.js";
import { AGENTIC_MOVE_EQ } from "./equation.js";
import type { SuccessLedger } from "./ledger.js";
import type {
  BrainMemory,
  BrainNote,
  PortfolioSnapshot,
  SurfLearnResult,
  TransmissionCostRow,
  WhatIfPath,
} from "./types.js";

export const BRAIN = {
  id: "BRAIN_INJECT_v1",
  /** Keep the newest notes; older ones roll off the ledger file. */
  noteCap: 40,
  /** Prefer 2× RT edge when mean paper pnl-per-RT falls below this. */
  tightEdgePnlPerRtBelow: 1,
  /** Min paper samples before a trick counts as cost-learned. */
  minSamplesForUseful: 1,
} as const;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function note(
  at: string,
  kind: BrainNote["kind"],
  text: string,
  data?: BrainNote["data"],
): BrainNote {
  const row: BrainNote = { at, kind, text };
  if (data) row.data = data;
  return row;
}

/** RT fraction from one-way spread (or stored rt_cost). */
export function rtFromOneWay(oneWay: number | null | undefined): number | null {
  if (oneWay === null || oneWay === undefined || !Number.isFinite(oneWay)) return null;
  return 2 * oneWay;
}

/**
 * Cost-adjusted score: paper PnL dollars per dollar of estimated RT friction
 * on the $2 notional. Higher = more useful after transmission cost.
 */
export function costAwareScore(path: WhatIfPath): number {
  const rt = 2 * path.spreadAtEntry;
  const rtUsd = path.notionalUsd * rt;
  if (!(rtUsd > 0) || !Number.isFinite(rtUsd)) return path.whatIfPnlUsd;
  return path.whatIfPnlUsd / rtUsd;
}

export function reRankWhatIfByTransmissionCost(paths: WhatIfPath[]): WhatIfPath[] {
  const scored = paths.map((p) => ({ ...p, costScore: costAwareScore(p) }));
  scored.sort((a, b) => {
    const cs = (b.costScore ?? 0) - (a.costScore ?? 0);
    if (Math.abs(cs) > 1e-12) return cs;
    return b.whatIfPnlUsd - a.whatIfPnlUsd;
  });
  return scored.map((row, i) => ({ ...row, rank: i + 1 }));
}

function transmissionFromLedger(ledger: SuccessLedger): TransmissionCostRow[] {
  const byTrick = new Map<
    string,
    { spreads: number[]; rts: number[]; pnls: number[] }
  >();

  for (const attempt of ledger.attempts) {
    if (attempt.kind !== "paper_surf") continue;
    if (attempt.outcome !== "win" && attempt.outcome !== "loss") continue;
    const oneWay = attempt.spread_at_entry;
    const rt =
      attempt.rt_cost !== undefined && attempt.rt_cost !== null && Number.isFinite(attempt.rt_cost)
        ? attempt.rt_cost
        : rtFromOneWay(oneWay);
    if (rt === null || oneWay === null || !Number.isFinite(oneWay)) continue;
    if (attempt.realized_pnl === null || !Number.isFinite(attempt.realized_pnl)) continue;

    const bucket = byTrick.get(attempt.trick_id) ?? { spreads: [], rts: [], pnls: [] };
    bucket.spreads.push(oneWay);
    bucket.rts.push(rt);
    bucket.pnls.push(attempt.realized_pnl);
    byTrick.set(attempt.trick_id, bucket);
  }

  const rows: TransmissionCostRow[] = [];
  for (const [trick_id, bucket] of byTrick) {
    const meanOneWaySpread = mean(bucket.spreads) ?? 0;
    const meanRtCost = mean(bucket.rts) ?? 0;
    const meanPnlAfterRt = mean(bucket.pnls) ?? 0;
    const rtUsd = SURF_LEARN.notionalUsd * meanRtCost;
    const pnlPerRt =
      rtUsd > 0 && Number.isFinite(rtUsd) ? meanPnlAfterRt / rtUsd : null;
    rows.push({
      trick_id,
      samples: bucket.pnls.length,
      meanOneWaySpread,
      meanRtCost,
      meanPnlAfterRt,
      pnlPerRt,
      useful: meanPnlAfterRt > 0 && bucket.pnls.length >= BRAIN.minSamplesForUseful,
    });
  }

  rows.sort((a, b) => {
    const ap = a.pnlPerRt;
    const bp = b.pnlPerRt;
    if (ap === null && bp === null) return a.trick_id.localeCompare(b.trick_id);
    if (ap === null) return 1;
    if (bp === null) return -1;
    if (bp !== ap) return bp - ap;
    return b.samples - a.samples;
  });
  return rows;
}

/** Mean remembered RT by base symbol from surf path ids (`surf:trick:BASE`). */
export function meanRtBySymbol(ledger: SuccessLedger): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const attempt of ledger.attempts) {
    if (attempt.kind !== "paper_surf") continue;
    const m = /^surf:[^:]+:([A-Z0-9]+)$/i.exec(attempt.path_id);
    if (!m) continue;
    const base = m[1]!.toUpperCase();
    const rt =
      attempt.rt_cost !== undefined && attempt.rt_cost !== null && Number.isFinite(attempt.rt_cost)
        ? attempt.rt_cost
        : rtFromOneWay(attempt.spread_at_entry);
    if (rt === null) continue;
    const arr = buckets.get(base) ?? [];
    arr.push(rt);
    buckets.set(base, arr);
  }
  const out = new Map<string, number>();
  for (const [base, vals] of buckets) {
    const m = mean(vals);
    if (m !== null) out.set(base, m);
  }
  return out;
}

/**
 * Inject recursive memory: learn from transmission costs, write notes,
 * re-rank what-ifs, persist brain onto the ledger, return trackable state.
 */
export function injectBrain(input: {
  snapshot: PortfolioSnapshot;
  ledger: SuccessLedger;
  learn: SurfLearnResult;
  watchStatus: "quiet" | "alert";
}): BrainMemory {
  const at = input.snapshot.asOf;
  const prior = input.ledger.getBrain();
  const cycles = (prior?.cycles ?? 0) + 1;
  const priorNotes = prior?.notes ?? [];

  const ranked = reRankWhatIfByTransmissionCost(input.learn.whatIfTop);
  input.learn.whatIfTop = ranked;

  const transmission = transmissionFromLedger(input.ledger);
  const paper = input.ledger.statsFor({ trick_id: "momentum_15m" }, { kind: "paper_surf" });
  const momentumUnlocked =
    paper.attempts >= SURF_LEARN.momentumLiveMinTrials &&
    paper.success_rate !== null &&
    paper.success_rate + 1e-12 >= SURF_LEARN.momentumLiveMinWinRate;

  const usefulRows = transmission.filter((r) => r.useful);
  const costAwareTopTrick = usefulRows[0]?.trick_id ?? ranked[0]?.trick_id ?? null;

  const meanRtAll = mean(transmission.map((r) => r.meanRtCost));
  const meanPnlPerRt = mean(
    transmission.map((r) => r.pnlPerRt).filter((n): n is number => n !== null && Number.isFinite(n)),
  );
  const preferTighterEdge =
    (meanRtAll !== null && meanRtAll / 2 > DIVIDEND_15M.preferMaxSpread) ||
    (meanPnlPerRt !== null && meanPnlPerRt < BRAIN.tightEdgePnlPerRtBelow);

  const creditHint =
    input.watchStatus === "quiet"
      ? AGENTIC_MOVE_EQ.creditsPerQuietWatch
      : AGENTIC_MOVE_EQ.creditsPerAlertStepIn;

  const fresh: BrainNote[] = [
    note(
      at,
      "inject",
      `${BRAIN.id} cycle ${cycles}: recursive memory loaded (${input.ledger.attempts.length} attempts, ${transmission.length} cost rows)`,
      {
        cycles,
        attempts: input.ledger.attempts.length,
        cost_rows: transmission.length,
        eq: AGENTIC_MOVE_EQ.id,
      },
    ),
  ];

  if (ranked[0]) {
    const top = ranked[0];
    const cs = top.costScore ?? costAwareScore(top);
    fresh.push(
      note(
        at,
        "tx_cost",
        `cost-aware top ${top.trick_id} ${top.symbol} pnl=${top.whatIfPnlUsd.toFixed(4)} score=${cs.toFixed(3)} (pnl per RT$) live=${top.liveClears ? "yes" : "no"}`,
        {
          path_id: top.path_id,
          trick_id: top.trick_id,
          symbol: top.symbol,
          what_if_pnl: top.whatIfPnlUsd,
          cost_score: cs,
          one_way: top.spreadAtEntry,
          rt: 2 * top.spreadAtEntry,
        },
      ),
    );
  }

  for (const row of transmission.slice(0, 4)) {
    fresh.push(
      note(
        at,
        "tx_cost",
        `${row.trick_id}: n=${row.samples} meanRT=${(row.meanRtCost * 100).toFixed(3)}% pnl/RT=${row.pnlPerRt === null ? "n/a" : row.pnlPerRt.toFixed(3)} useful=${row.useful ? "yes" : "no"}`,
        {
          trick_id: row.trick_id,
          samples: row.samples,
          mean_rt: row.meanRtCost,
          pnl_per_rt: row.pnlPerRt,
          useful: row.useful,
        },
      ),
    );
  }

  if (momentumUnlocked) {
    fresh.push(
      note(
        at,
        "unlock",
        `momentum_15m live unlocked by paper memory (${paper.wins}/${paper.attempts} = ${((paper.success_rate ?? 0) * 100).toFixed(0)}%)`,
        {
          attempts: paper.attempts,
          wins: paper.wins,
          success_rate: paper.success_rate,
        },
      ),
    );
  }

  if (preferTighterEdge) {
    fresh.push(
      note(
        at,
        "refine",
        `prefer ${DIVIDEND_15M.preferMinEdgeMultipleOfRtSpread}× RT — transmission costs eating paper edge (meanRT=${meanRtAll === null ? "n/a" : `${(meanRtAll * 100).toFixed(3)}%`}, pnl/RT=${meanPnlPerRt === null ? "n/a" : meanPnlPerRt.toFixed(3)})`,
        {
          prefer_edge_multiple: DIVIDEND_15M.preferMinEdgeMultipleOfRtSpread,
          mean_rt: meanRtAll,
          mean_pnl_per_rt: meanPnlPerRt,
        },
      ),
    );
  }

  const usefulProof =
    usefulRows.length > 0 ||
    momentumUnlocked ||
    (ranked[0] !== undefined && ranked[0].whatIfPnlUsd > 0);
  fresh.push(
    note(
      at,
      "useful",
      usefulProof
        ? `brain useful this cycle: top=${costAwareTopTrick ?? "none"} tight_edge=${preferTighterEdge ? "yes" : "no"} credits=${creditHint}`
        : `brain injected; still gathering cost samples (credits=${creditHint})`,
      {
        useful: usefulProof,
        top_trick: costAwareTopTrick,
        prefer_tighter_edge: preferTighterEdge,
        credit_hint: creditHint,
      },
    ),
  );

  const notes = [...priorNotes, ...fresh].slice(-BRAIN.noteCap);

  const brain: BrainMemory = {
    injected: true,
    id: BRAIN.id,
    asOf: at,
    cycles,
    notes,
    transmission,
    useful: {
      momentumUnlocked,
      costAwareTopTrick,
      preferTighterEdge,
      paperAttempts: input.ledger.attempts.filter((a) => a.kind === "paper_surf").length,
      creditHint,
      usefulProof,
    },
  };

  input.ledger.setBrain(brain);
  return brain;
}
