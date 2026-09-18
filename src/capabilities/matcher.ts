import type { JsonSchema, Lane, McpTool } from "../types.js";

export type MatchedTool = {
  name: string;
  description: string;
  lane: Lane;
  score: number;
  reasons: string[];
  propertyNames: string[];
};

export type ReviewPlacePair = {
  review: string;
  place: string;
  lane: Lane;
  overlap: number;
};

export type CapabilityIndex = {
  toolCount: number;
  accounts: MatchedTool[];
  portfolio: MatchedTool[];
  search: MatchedTool[];
  quotes: MatchedTool[];
  positions: MatchedTool[];
  review: MatchedTool[];
  place: MatchedTool[];
  cancel: MatchedTool[];
  listOrders: MatchedTool[];
  pnl: MatchedTool[];
  pairs: ReviewPlacePair[];
};

const ASSET_KEYS = [
  "symbol",
  "instrument_id",
  "currency_pair_id",
  "currency_pair",
  "option_id",
  "event_id",
  "contract_id",
  "market_id",
  "outcome_id",
];

const SIZE_KEYS = ["quantity", "dollar_amount", "notional", "amount", "contracts"];
const SIDE_KEYS = ["side", "action"];
const TYPE_KEYS = ["type", "order_type"];
const ACCOUNT_KEYS = ["account_number", "rhs_account_number", "account_id"];

function propertyNames(schema: JsonSchema | undefined): string[] {
  return Object.keys(schema?.properties ?? {});
}

function blob(tool: McpTool): string {
  return `${tool.name} ${tool.description ?? ""}`.toLowerCase();
}

function hasAny(names: string[], keys: string[]): boolean {
  const set = new Set(names);
  return keys.some((k) => set.has(k));
}

function isOrderShaped(names: string[]): boolean {
  return (
    hasAny(names, SIDE_KEYS) &&
    hasAny(names, ASSET_KEYS) &&
    hasAny(names, SIZE_KEYS)
  );
}

function detectLane(tool: McpTool, names: string[]): Lane {
  const text = blob(tool);
  if (
    /prediction|event contract|event market|outcome_id|market_id/.test(text) ||
    names.includes("event_id") ||
    names.includes("outcome_id") ||
    names.includes("contract_id")
  ) {
    if (!/option/.test(text) || /prediction|event/.test(text)) {
      return "event";
    }
  }
  if (/crypto|currency_pair|rhs_account/.test(text) || names.includes("rhs_account_number")) {
    if (!/equity|stock|option/.test(tool.name.toLowerCase())) {
      return "crypto";
    }
  }
  if (/option/.test(text) || names.includes("option_id")) return "option";
  if (/advanced|\boco\b|legs/.test(text) || names.includes("legs")) return "advanced";
  if (/equity|stock|instrument/.test(text)) return "equity";
  if (names.includes("symbol") && names.includes("account_number")) return "equity";
  return "unknown";
}

function scoreReview(tool: McpTool, names: string[]): { score: number; reasons: string[] } {
  const text = blob(tool);
  const reasons: string[] = [];
  let score = 0;
  if (isOrderShaped(names)) {
    score += 4;
    reasons.push("order-shaped schema");
  }
  if (/^(review|preview)_/.test(tool.name) || /\b(review|preview)\b/.test(tool.name)) {
    score += 2;
    reasons.push("name hint review/preview");
  }
  if (/simulat|without placing|preview|pre-trade|review/.test(text)) {
    score += 3;
    reasons.push("description is pre-trade");
  }
  if (/^place_/.test(tool.name) || /place a real|real money/.test(text)) {
    score -= 5;
    reasons.push("looks like place, not review");
  }
  return { score, reasons };
}

function scorePlace(tool: McpTool, names: string[]): { score: number; reasons: string[] } {
  const text = blob(tool);
  const reasons: string[] = [];
  let score = 0;
  if (isOrderShaped(names)) {
    score += 4;
    reasons.push("order-shaped schema");
  }
  if (/^place_/.test(tool.name) || /\bplace\b/.test(tool.name)) {
    score += 2;
    reasons.push("name hint place");
  }
  if (/place a real|real money|place .*order/.test(text)) {
    score += 3;
    reasons.push("description spends money");
  }
  if (names.includes("ref_id")) {
    score += 1;
    reasons.push("has ref_id idempotency");
  }
  if (/simulat|without placing|preview/.test(text) && !/place a real|real money/.test(text)) {
    score -= 5;
    reasons.push("looks like preview, not place");
  }
  return { score, reasons };
}

function scoreListOrders(tool: McpTool, names: string[]): { score: number; reasons: string[] } {
  const text = blob(tool);
  const reasons: string[] = [];
  let score = 0;
  if (names.includes("cursor") && names.includes("order_id")) {
    score += 4;
    reasons.push("cursor + order_id schema");
  } else if (names.includes("order_id") && hasAny(names, ACCOUNT_KEYS)) {
    score += 3;
    reasons.push("order_id + account schema");
  }
  if (/order history|list .*order|orders for/.test(text)) {
    score += 3;
    reasons.push("description lists orders");
  }
  if (/^get_.*orders?$|^list_.*orders?$/.test(tool.name)) {
    score += 2;
    reasons.push("name hint list orders");
  }
  if (isOrderShaped(names) && /place|preview|review/.test(text)) {
    score -= 4;
    reasons.push("order submit tool, not a list");
  }
  return { score, reasons };
}

function toMatched(
  tool: McpTool,
  names: string[],
  score: number,
  reasons: string[],
): MatchedTool {
  return {
    name: tool.name,
    description: tool.description ?? "",
    lane: detectLane(tool, names),
    score,
    reasons,
    propertyNames: names,
  };
}

function jaccard(a: string[], b: string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter += 1;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Match review / place / list tools by schema shape.
 * Names from a live snapshot are hints, not a catalog.
 */
export function matchCapabilities(tools: McpTool[]): CapabilityIndex {
  const review: MatchedTool[] = [];
  const place: MatchedTool[] = [];
  const listOrders: MatchedTool[] = [];
  const accounts: MatchedTool[] = [];
  const portfolio: MatchedTool[] = [];
  const search: MatchedTool[] = [];
  const quotes: MatchedTool[] = [];
  const positions: MatchedTool[] = [];
  const cancel: MatchedTool[] = [];
  const pnl: MatchedTool[] = [];

  for (const tool of tools) {
    const names = propertyNames(tool.inputSchema);
    const text = blob(tool);

    const reviewScore = scoreReview(tool, names);
    if (reviewScore.score >= 6) {
      review.push(toMatched(tool, names, reviewScore.score, reviewScore.reasons));
    }

    const placeScore = scorePlace(tool, names);
    if (placeScore.score >= 6) {
      place.push(toMatched(tool, names, placeScore.score, placeScore.reasons));
    }

    const listScore = scoreListOrders(tool, names);
    if (listScore.score >= 5) {
      listOrders.push(toMatched(tool, names, listScore.score, listScore.reasons));
    }

    if (/agentic_allowed|list the user's brokerage accounts|list .*accounts/.test(text)) {
      accounts.push(toMatched(tool, names, 5, ["accounts catalog"]));
    }
    if (/portfolio|buying power/.test(text)) {
      portfolio.push(toMatched(tool, names, 5, ["portfolio / buying power"]));
    }
    if (/^search$|natural-language query|resolve .*instrument/.test(text)) {
      search.push(toMatched(tool, names, 5, ["instrument search"]));
    }
    if (/quote|bid\/ask|mark price/.test(text) && /get_|list_/.test(tool.name)) {
      quotes.push(toMatched(tool, names, 4, ["quotes"]));
    }
    if (/positions/.test(text) && /get_|list_/.test(tool.name)) {
      positions.push(toMatched(tool, names, 4, ["positions"]));
    }
    if (/^cancel_/.test(tool.name) || /cancel an? (open|advanced)/.test(text)) {
      cancel.push(toMatched(tool, names, 4, ["cancel"]));
    }
    if (/realized profit|realized pnl|pnl hub|profit & loss/.test(text)) {
      pnl.push(toMatched(tool, names, 5, ["broker pnl read"]));
    }
  }

  const pairs = pairReviewPlace(review, place);
  return {
    toolCount: tools.length,
    accounts: sortDesc(accounts),
    portfolio: sortDesc(portfolio),
    search: sortDesc(search),
    quotes: sortDesc(quotes),
    positions: sortDesc(positions),
    review: sortDesc(review),
    place: sortDesc(place),
    cancel: sortDesc(cancel),
    listOrders: sortDesc(listOrders),
    pnl: sortDesc(pnl),
    pairs,
  };
}

export function pairReviewPlace(
  review: MatchedTool[],
  place: MatchedTool[],
): ReviewPlacePair[] {
  const pairs: ReviewPlacePair[] = [];
  const used = new Set<string>();
  for (const p of place) {
    let best: { review: MatchedTool; overlap: number } | undefined;
    for (const r of review) {
      if (used.has(r.name)) continue;
      const sameLane = r.lane === p.lane && r.lane !== "unknown";
      const overlap = jaccard(r.propertyNames, p.propertyNames) + (sameLane ? 0.25 : 0);
      if (!best || overlap > best.overlap) best = { review: r, overlap };
    }
    if (best && best.overlap >= 0.4) {
      used.add(best.review.name);
      pairs.push({
        review: best.review.name,
        place: p.name,
        lane: p.lane,
        overlap: Number(best.overlap.toFixed(3)),
      });
    }
  }
  return pairs;
}

export function findReviewPlacePair(
  index: CapabilityIndex,
  lane: Lane,
): ReviewPlacePair | undefined {
  return index.pairs.find((pair) => pair.lane === lane);
}

export function isPlaceTool(index: CapabilityIndex, name: string): boolean {
  return index.place.some((t) => t.name === name);
}

export function isReviewTool(index: CapabilityIndex, name: string): boolean {
  return index.review.some((t) => t.name === name);
}

export function laneForTool(index: CapabilityIndex, name: string): Lane {
  const hit =
    index.place.find((t) => t.name === name) ??
    index.review.find((t) => t.name === name) ??
    index.listOrders.find((t) => t.name === name);
  return hit?.lane ?? "unknown";
}

function sortDesc(tools: MatchedTool[]): MatchedTool[] {
  return [...tools].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
