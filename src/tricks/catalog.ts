import { bankSleeveAuthorized } from "./bank-sleeve-authorized.js";
import { deconcentrateHighNotional } from "./deconcentrate-high-notional.js";
import { expectancyHalt } from "./expectancy-halt.js";
import { holdBank } from "./hold-bank.js";
import { meanRevert15m } from "./mean-revert-15m.js";
import { momentum15m } from "./momentum-15m.js";
import { parkToChip } from "./park-to-chip.js";
import { parkToNear } from "./park-to-near.js";
import { secondWaveReentry } from "./second-wave-reentry.js";
import { softHalt } from "./soft-halt.js";
import { troughBounce15m } from "./trough-bounce-15m.js";
import { trickOutAtPeak } from "./trick-out-at-peak.js";
import type { Trick } from "./types.js";
import type { PortfolioSnapshot, TrickEvaluation } from "../trail/types.js";

export const TRICK_CATALOG: readonly Trick[] = [
  troughBounce15m,
  momentum15m,
  meanRevert15m,
  holdBank,
  bankSleeveAuthorized,
  deconcentrateHighNotional,
  parkToNear,
  parkToChip,
  trickOutAtPeak,
  secondWaveReentry,
  expectancyHalt,
  softHalt,
];

const BY_ID = new Map(TRICK_CATALOG.map((t) => [t.id, t]));

export function listTricks(): readonly Trick[] {
  return TRICK_CATALOG;
}

export function getTrick(id: string): Trick | undefined {
  return BY_ID.get(id);
}

export function evaluateTrick(id: string, snapshot: PortfolioSnapshot): TrickEvaluation {
  const trick = getTrick(id);
  if (!trick) return { eligible: false, reason: `Unknown trick ${id}` };
  return trick.evaluate(snapshot);
}

export function evaluateAll(
  snapshot: PortfolioSnapshot,
): Array<TrickEvaluation & { trick_id: string }> {
  return TRICK_CATALOG.map((trick) => ({ trick_id: trick.id, ...trick.evaluate(snapshot) }));
}

export {
  bankSleeveAuthorized,
  deconcentrateHighNotional,
  expectancyHalt,
  holdBank,
  meanRevert15m,
  momentum15m,
  parkToChip,
  parkToNear,
  secondWaveReentry,
  softHalt,
  troughBounce15m,
  trickOutAtPeak,
};
