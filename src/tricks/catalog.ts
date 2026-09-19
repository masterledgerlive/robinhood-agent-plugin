import { bankSleeveAuthorized } from "./bank-sleeve-authorized.js";
import { deconcentrateHighNotional } from "./deconcentrate-high-notional.js";
import { expectancyHalt } from "./expectancy-halt.js";
import { parkToChip } from "./park-to-chip.js";
import { parkToNear } from "./park-to-near.js";
import { softHalt } from "./soft-halt.js";
import { troughBounce15m } from "./trough-bounce-15m.js";
import type { Trick } from "./types.js";
import type { PortfolioSnapshot, TrickEvaluation } from "../trail/types.js";

export const TRICK_CATALOG: readonly Trick[] = [
  troughBounce15m,
  bankSleeveAuthorized,
  deconcentrateHighNotional,
  parkToNear,
  parkToChip,
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
  parkToChip,
  parkToNear,
  softHalt,
  troughBounce15m,
};
