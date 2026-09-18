import {
  DEFAULT_DAILY_DRAWDOWN_HALT_PCT,
  DEFAULT_MAX_BET_USD,
  DEFAULT_MAX_ROLL_USD,
  RISK_BUCKET,
} from "../constants.js";
import type { FillRecord, RiskBucket, RiskPolicy, TradingMode } from "../types.js";

export class HaltError extends Error {
  readonly code = "HALT";
  constructor(message: string) {
    super(message);
    this.name = "HaltError";
  }
}

export class RiskViolationError extends Error {
  readonly code = "RISK";
  constructor(message: string) {
    super(message);
    this.name = "RiskViolationError";
  }
}

export type RiskGuardState = {
  halted: boolean;
  haltReason: string | null;
  startOfDayEquityUsd: number | null;
  lastMarkedEquityUsd: number | null;
  fills: FillRecord[];
};

export class RiskGuard {
  readonly policy: RiskPolicy;
  readonly mode: TradingMode;
  private halted = false;
  private haltReason: string | null = null;
  private startOfDayEquityUsd: number | null;
  private lastMarkedEquityUsd: number | null;
  private readonly fills: FillRecord[] = [];

  constructor(opts: {
    mode: TradingMode;
    policy?: Partial<RiskPolicy>;
    startOfDayEquityUsd?: number | null;
  }) {
    this.mode = opts.mode;
    this.policy = {
      bucket: RISK_BUCKET,
      dailyDrawdownHaltPct:
        opts.policy?.dailyDrawdownHaltPct ?? DEFAULT_DAILY_DRAWDOWN_HALT_PCT,
      maxBetUsd: opts.policy?.maxBetUsd ?? DEFAULT_MAX_BET_USD,
      maxRollUsd: opts.policy?.maxRollUsd ?? DEFAULT_MAX_ROLL_USD,
    };
    this.startOfDayEquityUsd = opts.startOfDayEquityUsd ?? null;
    this.lastMarkedEquityUsd = this.startOfDayEquityUsd;
  }

  getState(): RiskGuardState {
    return {
      halted: this.halted,
      haltReason: this.haltReason,
      startOfDayEquityUsd: this.startOfDayEquityUsd,
      lastMarkedEquityUsd: this.lastMarkedEquityUsd,
      fills: [...this.fills],
    };
  }

  isHalted(): boolean {
    return this.halted;
  }

  assertNotHalted(): void {
    if (this.halted) {
      throw new HaltError(this.haltReason ?? "Halted.");
    }
  }

  assertBucket(bucket: string): asserts bucket is RiskBucket {
    if (bucket.toUpperCase() !== RISK_BUCKET) {
      this.halt(`Refused ${bucket} bucket. RISK only. Never touch SAVE/vault.`);
      throw new RiskViolationError(
        `Bucket ${bucket} is not allowed. This plugin trades RISK only.`,
      );
    }
  }

  assertNotional(usd: number): void {
    this.assertNotHalted();
    if (!Number.isFinite(usd) || usd <= 0) {
      throw new RiskViolationError("Notional must be a real positive USD amount from the order.");
    }
    if (usd > this.policy.maxBetUsd) {
      throw new RiskViolationError(
        `Bet $${usd} exceeds max bet $${this.policy.maxBetUsd}. Micro bets only.`,
      );
    }
    if (usd > this.policy.maxRollUsd) {
      throw new RiskViolationError(
        `Bet $${usd} exceeds roll cap $${this.policy.maxRollUsd}.`,
      );
    }
  }

  assertLiveFunded(): void {
    if (this.mode !== "live") return;
    const start = this.startOfDayEquityUsd;
    if (start === null || start <= 0) {
      throw new RiskViolationError(
        "Live trading needs a real start-of-day RISK equity from get_portfolio. Account looks unfunded.",
      );
    }
  }

  /**
   * Mark equity from a real portfolio read. Triggers the daily drawdown halt.
   * Pass only broker numbers. Do not estimate.
   */
  markEquityFromBroker(currentEquityUsd: number): void {
    if (!Number.isFinite(currentEquityUsd) || currentEquityUsd < 0) {
      throw new RiskViolationError("Equity mark must be a real non-negative number from the broker.");
    }
    this.lastMarkedEquityUsd = currentEquityUsd;
    if (this.startOfDayEquityUsd === null) {
      this.startOfDayEquityUsd = currentEquityUsd;
    }
    const start = this.startOfDayEquityUsd;
    if (start > 0) {
      const drawdown = (start - currentEquityUsd) / start;
      if (drawdown >= this.policy.dailyDrawdownHaltPct) {
        this.halt(
          `Daily drawdown ${(drawdown * 100).toFixed(1)}% hit halt cap ${
            this.policy.dailyDrawdownHaltPct * 100
          }%.`,
        );
      }
    }
  }

  /**
   * Record a fill only when the broker gave an order id.
   * Never invent PnL. realizedPnlUsd is optional and must come from the broker.
   */
  recordFill(fill: FillRecord): void {
    if (fill.source !== "broker") {
      throw new RiskViolationError("Fills must come from the broker. Do not invent fills.");
    }
    if (!fill.orderId || !fill.orderId.trim()) {
      throw new RiskViolationError("Refuse fill without a real order id.");
    }
    if (fill.realizedPnlUsd !== undefined && !Number.isFinite(fill.realizedPnlUsd)) {
      throw new RiskViolationError("Refuse invented PnL. Broker number only.");
    }
    this.fills.push(fill);
  }

  halt(reason: string): void {
    this.halted = true;
    this.haltReason = reason;
  }
}

export function policyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<RiskPolicy> {
  const drawdown = env.ROBINHOOD_DAILY_DRAWDOWN_HALT_PCT;
  const maxBet = env.ROBINHOOD_MAX_BET_USD;
  const maxRoll = env.ROBINHOOD_MAX_ROLL_USD;
  const policy: Partial<RiskPolicy> = {};
  if (drawdown) policy.dailyDrawdownHaltPct = Number(drawdown);
  if (maxBet) policy.maxBetUsd = Number(maxBet);
  if (maxRoll) policy.maxRollUsd = Number(maxRoll);
  return policy;
}
