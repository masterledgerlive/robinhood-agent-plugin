# Peak ride + second wave + primed rotate (AGENTIC_MOVE_EQ_v5)

## Intent

On a fast **uphill** tape:

1. Ride wave 1 toward the **absolute local peak**
2. **Jump out** the instant `edgePct ≥ jumpOutPct` (0.3% floor or 1.5×RT) — pure math, no agent
3. Also trick out on peak stall/pullback, stale wave, or Wilder RSI leave-overbought
4. On crash + reclaim, enter **second wave** and ride toward a **higher peak**
5. Rotate into the **lowest promising** token (near support, healthy volatile amp) by math

## Wave modes (pure tape)

| mode | Meaning |
| --- | --- |
| `climb` / `ride` | Mark above session open; proximity still below arm |
| `peak_armed` | At/near local high — wait %-hit / stall/pullback / RSI leave-OB |
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

## Cascade exit (agentless %-hit)

Do **not** exit on `peak_armed` + tiny profit alone (edgePct still below jumpOutPct).

Fire cascade when:

1. `trick_out` / `crash_start`, or
2. **`edgePct ≥ jumpOutPct`** — jump out immediately (no stale/RSI/failedPeak wait), or
3. `edgePct ≥ tpPct` (full sleeve TP), or
4. soft confirm: edge clears early min **and** (stale ∨ RSI leave-OB ∨ failed peak)

Destination ranking prefers **near-support** trough/mean-revert names with healthy amplitude — not the cheapest absolute mark.

Working seats arm a `cascade_jump_out` broker alert at `cost × (1 + jumpOut)`. Sync with `syncMathAlertsToBroker` so Robinhood fires when price hits.

## SURF_ACT order

1. RED_DAY exit (defend)  
2. RED_DAY green-only shelter  
3. RED_DAY trough re-enter (bottoms)  
4. Peak / **%-hit** cascade trick-out (batch up to **10**/slot)  
5. **Second-wave reentry**  
6. Park → NEAR/CHIP  
7. Enter trough → mean-revert → momentum  

## Agentic usage credits (ML / communication refinement)

| Action | Credits |
| --- | --- |
| Quiet 15m watch (wave math only) | **0** |
| Agent step-in on `WATCH alert` | 1 |
| Live place review | 1 |

Deterministic cron scores the book forever. Cursor/LLM credits burn only when the wave arms an alert or Game authorizes.

See [AGENTIC_USAGE_CREDITS.md](AGENTIC_USAGE_CREDITS.md).

## Autonomy

Watcher never places orders. Broker `cascade_jump_out` / `peak_pullback` / `support` alert specs on working seats. Agents optional for the math.
