# Peak ride + second wave + primed rotate (AGENTIC_MOVE_EQ_v4)

## Intent

On a fast **uphill** tape:

1. Ride wave 1 toward the **absolute local peak**
2. **Trick out** before the first crash deepens — also on **stale wave** or **Wilder RSI leave-overbought** once edge clears
3. On crash + reclaim, enter **second wave** and ride toward a **higher peak**
4. Rotate into the **lowest promising** token (near support, healthy volatile amp) by math — even when agents are silent

## Wave modes (pure tape)

| mode | Meaning |
| --- | --- |
| `climb` / `ride` | Mark above session open; proximity still below arm |
| `peak_armed` | At/near local high — wait stall/pullback / RSI leave-OB |
| `trick_out` | Armed + stall or pullback ≥ 0.8% — sleeve working to dust |
| `crash_start` | Pullback ≥ 2% and **not** reclaiming |
| `second_wave` | Hard pullback **and** reclaiming — ride to `higherPeak` |

```
localHigh   = max(sessionHigh, trough.recentHigh, priorMark, mark)
higherPeak  = localHigh × (1 + 1.5%)
proximity   = 1 − (localHigh − mark) / localHigh
reclaiming  = mark15m > mark  OR  mark > priorMark  OR  trough reclaim phase ∈ (0,1)
support     = trough.troughMark ?? sessionOpen
```

## Cascade exit (agentless)

Do **not** exit on `peak_armed` + tiny profit alone (still riding).
Do **not** treat sleeve TP alone as cascade — that is `park_to_near` / TP alerts.

Fire cascade when:

1. `trick_out` / `crash_start`, or
2. edge ≥ `max(0.3%, 1.5×RT)` **and** (stale wave **or** RSI left overbought **or** failed peak break)

Destination ranking prefers **near-support** trough/mean-revert names with healthy amplitude — not the cheapest absolute mark.

## SURF_ACT order

1. RED_DAY exit (defend)  
2. RED_DAY green-only shelter  
3. RED_DAY trough re-enter (bottoms)  
4. Peak / stale / RSI cascade trick-out  
5. **Second-wave reentry**  
6. Park → NEAR/CHIP  
7. Enter trough → mean-revert → momentum  

## Agentic usage credits (ML / communication refinement)

| Action | Credits |
| --- | --- |
| Quiet 15m watch (wave math only) | **0** |
| Agent step-in on `WATCH alert` | 1 |
| Live place review | 1 |

Deterministic cron scores the book forever. Cursor/LLM credits burn only when the wave arms an alert or Game authorizes. On-chain token activity / earnings can later refine prime weights via the success ledger (feedback loop — not invented PnL).

See [AGENTIC_USAGE_CREDITS.md](AGENTIC_USAGE_CREDITS.md).

## Autonomy

Watcher never places. Broker `peak_pullback` / `support` alert specs recommended on working seats. Agents optional for the math.
