# MACHINE VIEW

Humans should read these like a ticker, not like JSON dumps.

Every block is the same shape:

`INTENT → TOOL → ARGS (redacted) → RESULT → HUMAN LINE`

Order and fill ids appear only when the broker sent them.

## 1. Discover

```
=== MACHINE LOG ===
TIME    2026-09-18T16:01:00.000Z
MODE    paper
BUCKET  RISK
INTENT  List live MCP tools before any money action
TOOL    tools/list
ARGS    {}
RESULT  ok | 78 tools; event-contract place tool: none
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Catalog refreshed. Crypto preview/place exist. No event place tool this session.
=== END LOG ===
```

## 2. Account + equity mark

```
=== MACHINE LOG ===
TIME    2026-09-18T16:01:08.000Z
MODE    paper
BUCKET  RISK
INTENT  Use Agentic account only and mark start-of-day RISK equity
TOOL    get_accounts
ARGS    {}
RESULT  ok | agentic_allowed account last-four …4242; other accounts read-only
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Trading account is Agentic. Will not send orders to the primary individual account.
=== END LOG ===
```

```
=== MACHINE LOG ===
TIME    2026-09-18T16:01:12.000Z
MODE    paper
BUCKET  RISK
INTENT  Broker mark for 20% daily halt math
TOOL    get_portfolio
ARGS    {"account_number":"…4242"}
RESULT  ok | equity 40.00; buying_power 40.00
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Start-of-day RISK mark is $40. Halt if broker equity prints $32 or lower.
=== END LOG ===
```

## 3. Preview (not a fill)

```
=== MACHINE LOG ===
TIME    2026-09-18T16:02:00.000Z
MODE    paper
BUCKET  RISK
INTENT  Preview $2 NEAR-USD buy to pair with an event ticket
TOOL    preview_crypto_order
ARGS    {"symbol":"NEAR-USD","side":"buy","type":"market","dollar_amount":"2.00","rhs_account_number":"…4242"}
RESULT  ok | preview ok; est debit 2.00
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Preview clean. Waiting for confirm before place.
=== END LOG ===
```

## 4. Paper would-place

```
=== MACHINE LOG ===
TIME    2026-09-18T16:02:10.000Z
MODE    paper
BUCKET  RISK
INTENT  Same $2 NEAR buy after preview
TOOL    place_crypto_order
ARGS    {"symbol":"NEAR-USD","side":"buy","type":"market","dollar_amount":"2.00","rhs_account_number":"…4242"}
RESULT  ok | WOULD_PLACE blocked in paper mode
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Paper: order not sent. Flip ROBINHOOD_TRADING_MODE=live only when you mean it.
=== END LOG ===
```

## 5. Live place with a real order id

```
=== MACHINE LOG ===
TIME    2026-09-18T16:10:00.000Z
MODE    live
BUCKET  RISK
INTENT  Place $2 NEAR-USD buy after matching preview
TOOL    place_crypto_order
ARGS    {"symbol":"NEAR-USD","side":"buy","type":"market","dollar_amount":"2.00","ref_id":"9f1c…","rhs_account_number":"…4242"}
RESULT  ok | broker returned order_id 2c9f0b1e-1111-2222-3333-444444444444
ORDER   2c9f0b1e-1111-2222-3333-444444444444
FILL    none
PNL     none (do not invent)
HUMAN   Live $2 NEAR buy accepted. Not calling this a win until a fill id or PnL tool says so.
=== END LOG ===
```

## 6. Halt

```
=== MACHINE LOG ===
TIME    2026-09-18T18:00:00.000Z
MODE    live
BUCKET  RISK
INTENT  Re-mark RISK equity for drawdown halt
TOOL    get_portfolio
ARGS    {"account_number":"…4242"}
RESULT  error | Daily drawdown 20.0% hit halt cap 20%.
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Halted. No new risk. Open orders stay until you ask to cancel a real order id.
=== END LOG ===
```

## 7. Missing event lane

```
=== MACHINE LOG ===
TIME    2026-09-18T16:01:04.000Z
MODE    paper
BUCKET  RISK
INTENT  Prefer NEAR prediction tickets if the live catalog has them
TOOL    matchCapabilities
ARGS    {"source":"tools/list"}
RESULT  ok | event review/place pair: none
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   No event-contract money tool this session. Crypto NEAR lane only. Will not invent a ticket.
=== END LOG ===
```

## 8. Refused invented PnL

```
=== MACHINE LOG ===
TIME    2026-09-18T16:20:00.000Z
MODE    live
BUCKET  RISK
INTENT  Record a fill for the $2 NEAR buy
TOOL    risk.recordFill
ARGS    {"orderId":"","realizedPnlUsd":0.55}
RESULT  error | Refuse fill without a real order id.
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   No broker id, so no fill and no PnL. Ask the list-orders tool for the ticket.
=== END LOG ===
```

Tool names in these pictures match one live snapshot. Your session may differ. Discovery always wins.

## 9. 15m trail watch (EXAMPLE)

The trail watcher extends this ticker. It does not place. Quiet is the default.

`WATCH → CANDIDATES → PATHS → TRICK RANKS → LAST ALERTS`

```
=== MACHINE LOG ===
TIME    2026-09-18T17:00:00.000Z
MODE    paper
BUCKET  RISK
INTENT  15m trail watch (deterministic; no place)
TOOL    watch15m
ARGS    {"example":true,"asOf":"2026-09-18T17:00:00.000Z","rhs_account_number":"…9826","candidate_count":0}
RESULT  ok | quiet | 0 candidates
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Quiet book. No agent step-in. Cron/watcher only.
=== END LOG ===
```

```
=== TRAIL VIEW ===
TIME    2026-09-18T17:00:00.000Z
ACCOUNT rhs …9826 (Agentic)
MODE    LOW_CAP_SLOW
BUCKET  RISK
WATCH   quiet
HALT    soft=false expectancy=false
LEARN   SURF_LEARN $2 every cycle (paper; no place)
BP      4.00 (>= $2 live micros)
CANDIDATES
  none
WHAT-IF TOP
  1  surf:momentum_15m:ENA              paper +0.0599  live=no  momentum_15m ENA-USD
PATHS
  example-trough-wld-15m     github_code        15m  trough_bounce_15m            rate n/a  trailing
TRICK RANKS
  trough_bounce_15m          rate n/a  attempts 0  wins 0  expectancy n/a
LAST ALERTS
  none
=== END TRAIL ===
```

The blocks above are **EXAMPLE** dumps from `tests/fixtures/trail/`. They are not live fills. See [AGENTIC_TRAIL_MODEL.md](AGENTIC_TRAIL_MODEL.md).
