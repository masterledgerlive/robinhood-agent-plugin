---
name: robinhood-agentic-trading
description: >
  Trade on a dedicated Robinhood Agentic account via MCP.
  Use when the user asks to trade RISK, run the NEAR prediction+crypto playbook,
  preview/place Robinhood orders, read MACHINE LOG, halt on drawdown,
  or step in on a 15m trail-watch alert.
  Discover tools at runtime. Review before place. Never invent PnL.
  Do not use this skill to poll a quiet 15m book — the watcher script does that.
---

# Robinhood Agentic Trading

Use this skill whenever you talk to `https://agent.robinhood.com/mcp/trading`.

You are trading Game's dedicated **Agentic** account. RISK bucket only. Micro bets. Plain-text logs.

## When to use

- User says trade, preview, place, cancel, or check Robinhood.
- User asks for the NEAR event + crypto playbook.
- User asks why trading halted.
- User asks to read or write a MACHINE LOG.

Do not use this skill for SAVE/vault, personal non-agentic accounts, or guessed PnL.

## Hard rules

1. RISK only. Never touch SAVE or vault.
2. Default halt: 20% daily drawdown from start-of-day RISK equity.
3. Never invent PnL. Quote fills and order ids from the broker only.
4. Paper mode is default. Live place needs explicit live mode plus user confirm.
5. Tool names in docs/snapshots are examples. Live catalog is `tools/list`.

## Step-by-step

### 1. Discover tools

Call MCP `tools/list` (or the host equivalent) at the start of the session and after reconnect.

Match money tools by **schema shape**, not by a remembered name:

- Review/preview: order-shaped args (side + asset + size) and text like simulate / without placing / preview.
- Place: same shape, spends real money, often has `ref_id`.
- List orders: account + `order_id` and/or `cursor`, describes history.
- Event/prediction: schema or description mentions event contract, prediction, `contract_id`, `outcome_id`.

Pair each place tool with its review/preview sibling (shared properties + same lane).

If no event place tool exists, say so in the log and skip that lane. Do not fake a contract.

Read [docs/examples/LIVE_TOOLS_SNAPSHOT.md](docs/examples/LIVE_TOOLS_SNAPSHOT.md) only as a hint.

### 2. Pick the Agentic account

Call the accounts tool. Use the account with `agentic_allowed=true`.

Other accounts are read-only. Do not pass them to place/review.

Call the portfolio tool for buying power and equity. This is the start-of-day mark. If equity is zero, refuse live place. Ask the user to fund RISK.

### 3. Size the bet

Default micro bet is **~$2**. Roll cap is **~$7**.

Do not pick a default size when the user named an amount. Do not invent a size when they did not. For this playbook, $2 is the agreed micro size.

Pass `dollar_amount` when the tool allows it. Do not guess quantity from a stale price.

### 4. Review / preview before place

Unless the user clearly waived review ("skip the review", "just place it"):

1. Call the matching review/preview tool with the same order args.
2. Show the estimated debit/credit and any alerts.
3. Wait for explicit confirm.
4. Then call place with a fresh `ref_id` UUID. Reuse that `ref_id` only on retry of the same order.

Paper mode: stop after preview. Log `WOULD_PLACE`. Do not call place.

### 5. Log every action

Write a MACHINE LOG block for every tool call, including reads that affect money decisions.

```
=== MACHINE LOG ===
TIME    <ISO>
MODE    paper|live
BUCKET  RISK
INTENT  <why you called it>
TOOL    <discovered name>
ARGS    <json, account/token redacted>
RESULT  ok|error | <short broker summary>
ORDER   <order_id or none>
FILL    <fill_id or none>
PNL     <broker figure or "none (do not invent)">
HUMAN   <one sentence a person can read>
=== END LOG ===
```

Redact account numbers (keep last four). Keep order ids. See [docs/MACHINE_VIEW.md](docs/MACHINE_VIEW.md).

### 6. Halt rules

Halt all new risk when any of these fire:

- Current RISK equity is down **20%** from the start-of-day broker mark.
- User says stop / halt.
- SAVE/vault would be touched.
- Live account is unfunded.
- A place has no matching review and the user did not waive it.
- Bet exceeds max bet or roll cap.

After halt: cancel only if the user asks and a real open `order_id` exists. Do not open new risk.

### 7. NEAR dual-lane (when asked)

Follow [docs/PLAYBOOK_NEAR.md](docs/PLAYBOOK_NEAR.md).

Lane A — event/prediction (priority when discovered):

1. Search for a NEAR-related event contract with the live search tool.
2. Preview ~$2 on the ticket.
3. Place only after confirm.
4. Early-sell a portion to cover cost when the book allows it. Hold the rest if it is winning.

Lane B — crypto NEAR-USD:

1. Resolve the pair (`NEAR` or `NEAR-USD`) via search / currency pairs.
2. Preview ~$2 buy or sell.
3. Place only after confirm.
4. Park micro wins in a longer NEAR hold. Do not raise the bet size.

If Lane A tools are missing, log that fact and run Lane B only.

### 8. Trail watch (alerts only)

The 15m watcher in `src/trail/` is deterministic. Cron it. SURF_LEARN paper what-ifs run every cycle; do not start a chat turn to re-check an unchanged **live** book.

Step in only when `WATCH   alert` lists a gate-clear trick (`trough_bounce_15m`, unlocked `momentum_15m`, Game-authorized sleeve/deconcentrate/park, or a halt) or Game asks. Live micros need BP ≥ $2. Then follow review-before-place and tag the MACHINE LOG with `trick_id` + `path_id`.

See [docs/AGENTIC_TRAIL_MODEL.md](docs/AGENTIC_TRAIL_MODEL.md).

## PnL

Allowed: numbers on a broker fill, order, or PnL tool response, with an order id or trade id.

Forbidden: estimates, "about even", mark-to-model, or carrying a number forward without a new broker read.

## Output to the user

Keep sentences short. Paste MACHINE LOG blocks. Name the real tool you called. Name the real order id you got. If you got none, say none.
