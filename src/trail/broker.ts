import type { PortfolioSnapshot, Quote } from "./types.js";

/**
 * Read-only port for the 15m watcher.
 * Place / preview stay out of v1 — no order placement from this module, CLI, or CI.
 */
export interface TrailBrokerPort {
  loadSnapshot(): Promise<PortfolioSnapshot>;
  loadQuotes?(symbols: string[]): Promise<Quote[]>;
}

/** Fixture-backed stub. Used by tests and the CLI. Never talks to Robinhood. */
export class FixtureBroker implements TrailBrokerPort {
  constructor(private readonly snapshot: PortfolioSnapshot) {}

  async loadSnapshot(): Promise<PortfolioSnapshot> {
    return this.snapshot;
  }

  async loadQuotes(symbols: string[]): Promise<Quote[]> {
    const wanted = new Set(symbols.map((s) => s.replace(/-USD$/i, "").toUpperCase()));
    return this.snapshot.quotes.filter((q) => wanted.has(q.symbol.replace(/-USD$/i, "").toUpperCase()));
  }
}
