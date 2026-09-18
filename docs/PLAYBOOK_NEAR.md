# Dual-lane playbook: event contracts + NEAR-USD

This is the default Game / Agentic strategy for this plugin.

Fund a dedicated Robinhood Agentic account. Trade **RISK** only. Keep bets tiny.

## Sizing

| Piece | Default |
| --- | --- |
| Micro bet | ~$2 |
| Roll | ~$7 |
| Daily halt | 20% of start-of-day RISK equity |

Do not size up because a ticket "feels good". Wins roll into a **lower-risk token hold**, not a bigger next bet.

## Two lanes

### Lane A — prediction / event contracts (priority)

Use this lane when `tools/list` shows a review+place pair whose schema looks like an event or prediction contract (`contract_id`, `event_id`, `outcome_id`, or description says prediction / event market).

A live snapshot from 2026-09-18 did **not** include a dedicated event place tool. `search` said event categories will be added later. PnL history already mentions prediction markets. So:

1. Discover first.
2. If the place tool is missing, log `event lane: none` and skip Lane A.
3. Do not emulate events with equity options unless the user explicitly asks for options.

When the tools exist:

1. Search for a contract tied to **NEAR** (or the named underlying).
2. Preview ~$2. Read the estimated debit.
3. Confirm with the human.
4. Place. Keep the `order_id`.
5. **Early-sell a portion** of the tickets to cover the ~$2 cost when the book is up enough to do that. This is a real sell, so preview that too.
6. **Hold the rest** if it is still a winner. Do not round-trip the whole ticket just to look active.

### Lane B — NEAR crypto

Always available when crypto preview/place tools exist (they did in the snapshot: preview then place, matched by schema).

1. Resolve the pair. Try `NEAR` and `NEAR-USD`. Confirm it is a Robinhood crypto pair before quoting.
2. Quote. Use the live quote tool. Do not reuse a price from memory.
3. Preview a **~$2** market or marketable limit. `dollar_amount` is the right size knob when the tool allows it.
4. Confirm. Then place with a new `ref_id`.
5. Pair direction with Lane A when both are live (example: long event ticket + small NEAR buy, or the hedge the user named). Do not invent a hedge the user did not ask for. Default pairing is a small **buy** of NEAR next to a NEAR-linked event ticket.
6. If the micro bet wins, move extra dollars into a hold. Next bet stays ~$2.

## Session flow

```
discover tools
  → accounts (agentic_allowed only)
  → portfolio mark (start-of-day RISK)
  → search event NEAR (if lane exists)
  → preview event $2 → confirm → place → log
  → early-sell slice to cover cost → log
  → preview NEAR-USD $2 → confirm → place → log
  → if halted (20% DD), stop
```

Paper mode runs the same flow and stops before place. The log says `WOULD_PLACE`.

## Halt

Stop opening risk when:

- Drawdown from the broker start-of-day mark ≥ 20%.
- The user says stop.
- Buying power cannot cover $2 without leaving RISK.
- You would need to invent a contract, a fill, or a PnL number.

## What not to do

- Do not trade the primary non-agentic account.
- Do not touch SAVE/vault.
- Do not average down by raising the $2 unit.
- Do not report "we are up $X" unless a broker fill or PnL tool said $X with an id.
- Do not hardcode `preview_crypto_order` as the only possible name. Match by shape every session.

## Related

- Agent steps: [../SKILL.md](../SKILL.md)
- Log pictures: [MACHINE_VIEW.md](MACHINE_VIEW.md)
- Snapshot hint: [examples/LIVE_TOOLS_SNAPSHOT.md](examples/LIVE_TOOLS_SNAPSHOT.md)
