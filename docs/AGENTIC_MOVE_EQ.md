# AGENTIC_MOVE_EQ + wave triggers (Game 2026-09-19)

## Intent

The book must **keep scoring when agents are silent**. Cursor, desk bots, and cascade chatter are overlays — not the heartbeat.

See [PEAK_PRIME_ROTATE.md](PEAK_PRIME_ROTATE.md) and [AGENTIC_USAGE_CREDITS.md](AGENTIC_USAGE_CREDITS.md).

## Equation knobs (`AGENTIC_MOVE_EQ_v4`)

```
take_profit_pct = max(1.2%, 1.5 × one_way_spread)     # DIVIDEND_15M locked
stop_pct        = max(2.0%, 2.0 × one_way_spread)     # DIVIDEND_15M locked
peak_proximity  = 1 − (localHigh − mark) / localHigh
trick_out       = (prox ≥ 0.985 ∨ phase ≥ 0.85) ∧ (stall ∨ pullback ≥ 0.8%)
crash_start     = pullback ≥ 2% ∧ ¬reclaiming
second_wave     = pullback ≥ 2% ∧ reclaiming → ride to higherPeak
higherPeak      = localHigh × (1 + 1.5%)

# Wilder RSI (needs quote.closes with period+1 samples — never invent bars)
rsi             = Wilder(14) on closes
rollingDown     = RSI left/rolling from overbought (≥70)  [soft: elevated≥55 + down close]

# Cascade exit (agentless short rotate — do not sit / do not ride back down)
cascade_exit    = trick_out ∨ crash_start
                ∨ (edge ≥ max(0.3%, 1.5×RT) ∧ (stale ∨ rollingDown ∨ failedPeak))
# Full sleeve TP alone → park_to_near / TP alerts (DIVIDEND), not cascade_exit
failedPeak      = top shown ∧ mark < localHigh ∧ (stall ∨ pullback ≥ 0.8%)
support         = troughMark ?? sessionOpen   # already on the wave form

# Cascade destination = lowest promising = near support + healthy amp (not cheapest coin)
prime_score     = climb + wave + gates + cascadeNearSupport + secondWave − peakPenalty
quiet_watch     = 0 credits; alert_step_in = 1 credit
```

Refine by editing `src/trail/equation.ts`. RSI implementation: `src/trail/rsi.ts`. Cascade: `src/trail/cascade.ts`.

## Autonomy

`agentRequired=false` on every token trigger. Cron prints WHERE/WHEN when Cursor is silent. Watcher never places.
