# AGENTIC_MOVE_EQ + wave triggers (Game 2026-09-19)

## Intent

The book must **keep scoring when agents are silent**. Cursor, desk bots, and cascade chatter are overlays — not the heartbeat.

1. **Wave functions** read mark / bid / ask / trough geometry only.
2. **AGENTIC_MOVE_EQ** turns those waves into WHERE / WHEN thresholds (TP, stop, park, entry).
3. **Per-token triggers** arm every sleeve + quote + whisper token every 15m.
4. Agents step in only when a human wants a place — cron already knows the math.

## Pure wave kinds

| kind | Geometry |
| --- | --- |
| `trough_reclaim` | Mark reclaimed trough, still in first half of trough→recentHigh |
| `mean_revert_dip` | Mark below mean (trough mid or priorMark) |
| `momentum_up` | Mark > priorMark |
| `fade` | Reclaimed but chased past half-bounce — no entry |
| `flat` | No usable geometry |

Missing marks → skip / amp 0. **Never invent.**

## Equation knobs (`AGENTIC_MOVE_EQ_v1`)

```
take_profit_pct = max(1.2%, 1.5 × one_way_spread)
stop_pct        = max(2.0%, 2.0 × one_way_spread)
live_edge_ok    = edge ≥ 1.5 × RT_spread     (RT = 2 × one-way)
park_edge_ok    = edge ≥ 1.5 × RT_spread
whisper_score   = min(1, sources/2 × 0.5 + mean_conf × 0.5)
```

Refine by editing `src/trail/equation.ts`. Tricks, triggers, and TRAIL VIEW read the same knobs.

## Autonomy (agents optional)

| Layer | Needs agent? |
| --- | --- |
| `npm run watch:15m` | No |
| Wave rank + trigger arms | No |
| TRAIL VIEW `WAVES` / `TRIGGERS` | No |
| Robinhood `create_alert` from `brokerAlerts` | Human/agent confirm only |
| Preview / place | Yes — review-before-place rails |

`agentRequired` on every token trigger is **false**. If Cursor is down, cron still prints WHERE/WHEN.

## Cascade + whispers

Whispers bias `route_hint` (`exit_working` / `hold_banks` / `buy_trough`) and raise score. They do **not** replace wave geometry. Wild West quarantine stays until book/tape confirms (red-day 2-of-3).

## Broker alert specs

Working seats emit recommended `price_above` (TP) and `price_below` (stop) specs. Candidates with troughs emit `price_above` reclaim. The watcher **never** calls `create_alert` — that is a deliberate write for a later human/agent step.

## Run

```bash
npm run watch:15m -- --snapshot tests/fixtures/trail/quiet.example.json
npm test -- tests/wave-triggers.test.ts
```

Quiet live + armed bank holds + ranked waves is the intended default on the EXAMPLE fixture.
