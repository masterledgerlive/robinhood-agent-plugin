# Peak ride + second wave + primed rotate (AGENTIC_MOVE_EQ_v3)

## Intent

On a fast **uphill** tape:

1. Ride wave 1 toward the **absolute local peak**
2. **Trick out** before the first crash deepens
3. On crash + reclaim, enter **second wave** and ride toward a **higher peak**
4. Rotate into the **most primed** token by math — even when agents are silent

## Wave modes (pure tape)

| mode | Meaning |
| --- | --- |
| `climb` / `ride` | Mark above session open; proximity still below arm |
| `peak_armed` | At/near local high — wait stall/pullback |
| `trick_out` | Armed + stall or pullback ≥ 0.8% — sleeve working to dust |
| `crash_start` | Pullback ≥ 2% and **not** reclaiming |
| `second_wave` | Hard pullback **and** reclaiming — ride to `higherPeak` |

```
localHigh   = max(sessionHigh, trough.recentHigh, priorMark, mark)
higherPeak  = localHigh × (1 + 1.5%)
proximity   = 1 − (localHigh − mark) / localHigh
reclaiming  = mark15m > mark  OR  mark > priorMark  OR  trough reclaim phase ∈ (0,1)
```

## SURF_ACT order

1. RED_DAY exit  
2. Peak trick-out  
3. **Second-wave reentry**  
4. Park → NEAR/CHIP  
5. Enter trough → mean-revert → momentum  

## Agentic usage credits (ML / communication refinement)

| Action | Credits |
| --- | --- |
| Quiet 15m watch (wave math only) | **0** |
| Agent step-in on `WATCH alert` | 1 |
| Live place review | 1 |

Deterministic cron scores the book forever. Cursor/LLM credits burn only when the wave arms an alert or Game authorizes. On-chain token activity / earnings can later refine prime weights via the success ledger (feedback loop — not invented PnL).

See [AGENTIC_USAGE_CREDITS.md](AGENTIC_USAGE_CREDITS.md).

## Autonomy

Watcher never places. Broker `peak_pullback` alert specs recommended on working seats. Agents optional for the math.
