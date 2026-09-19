import { LOW_CAP_SLOW } from "../trail/constants.js";
import {
  baseSymbol,
  edgeClearsRt,
  findQuote,
  findSleeve,
  isAgenticAccount,
  maxTakeWithoutFlatten,
  refuseNonAgentic,
  workingSeats,
} from "../trail/gates.js";
import type { ParkTarget, PortfolioSnapshot, TrickEvaluation } from "../trail/types.js";

export function evaluatePark(snapshot: PortfolioSnapshot, target: ParkTarget): TrickEvaluation {
  if (!isAgenticAccount(snapshot)) return refuseNonAgentic();

  const authorized = snapshot.authorize?.park === true;
  const explicitTarget = snapshot.authorize?.parkTarget;
  const nearQuote = findQuote(snapshot, "NEAR");
  const nearBank = findSleeve(snapshot, "NEAR", "bank");

  if (target === "CHIP") {
    const nearFirst = nearQuote !== undefined && nearBank !== undefined;
    if (explicitTarget !== "CHIP" && nearFirst) {
      return { eligible: false, reason: "Cascade parks NEAR first; CHIP waits until NEAR is unavailable or Game names CHIP" };
    }
  }
  if (target === "NEAR" && explicitTarget === "CHIP") {
    return { eligible: false, reason: "Game named CHIP as park target" };
  }

  const destQuote = findQuote(snapshot, target);
  if (!destQuote) {
    return { eligible: false, reason: `No ${target} quote for park` };
  }

  const profitable: string[] = [];
  let lastFail = "No working sleeve with a broker cost/mark profit gate";

  for (const sleeve of workingSeats(snapshot)) {
    const cost = sleeve.costBasisUsd;
    const mark = sleeve.markUsd;
    if (cost === undefined || mark === undefined || !(cost > 0)) {
      lastFail = `${sleeve.symbol}: missing cost/mark — will not invent profit`;
      continue;
    }
    if (!(mark > cost)) {
      lastFail = `${sleeve.symbol}: mark not above cost; profit gate closed`;
      continue;
    }
    const quote = findQuote(snapshot, sleeve.symbol);
    if (!quote) {
      lastFail = `${sleeve.symbol}: no working quote`;
      continue;
    }
    const edge = (mark - cost) / cost;
    if (!edgeClearsRt(edge, quote) && !authorized) {
      lastFail = `${sleeve.symbol}: profit edge < 2× RT (need Game park authorize or a wider gate)`;
      continue;
    }
    if (maxTakeWithoutFlatten(sleeve) <= 0) {
      lastFail = `${sleeve.symbol}: park would flatten below dust (5% peak / $0.10)`;
      continue;
    }
    profitable.push(sleeve.symbol);
  }

  if (profitable.length === 0) {
    if (authorized) {
      return { eligible: false, reason: lastFail };
    }
    return { eligible: false, reason: lastFail };
  }

  const symbol = target;
  return {
    eligible: true,
    reason: `Park ${profitable.map((s) => baseSymbol(s)).join(", ")} profit → ${target} (leave dust; ${LOW_CAP_SLOW.id})`,
    symbol,
  };
}
