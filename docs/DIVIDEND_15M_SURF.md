# DIVIDEND_15M / SURF_LEARN / SURF_ACT (Game 2026-09-18 ~7:51 PT)

## Intent

Target **revenue every 15 minutes** by surfing waves across tokens: leave banks growing, rotate working capital, learn from **what-if paths** (same notional — which path would have won), and move faster than LOW_CAP_SLOW. Game authorized **more risk for more reward** while learning with many parallel “surfers.”

Default live rails are **DIVIDEND_15M**. **SURF_LEARN** ranks paper what-ifs every cycle. **SURF_ACT** picks one math-only `NEXT MOVE` (accumulate first, then one seat). LOW_CAP_SLOW remains a selectable profile.

Literal every-slot profit is not guaranteed; the system **aims** every 15m and **learns** every 15m. Losing paper paths teach which waves not to take live. It is OK to rotate faster as the paper ledger settles — choices stay gate math, not chatter.

## Still forever

- Banks NEAR → FIL (display-only) → CHIP — never flatten floors
- Dust on every token — never sell 100% until Game says
- Agentic only rhs `813839826` (example, not a secret); real fills only; no invented PnL
- IKN CORE: Proof of Truth; gas-gate still applies as a *minimum* edge filter unless Game override
- **No order placement** from the 15m watcher, tests, or CI

## Mode split

### A) SURF_LEARN (always on, every 15m — cheap code)

For each cycle, simulate parallel surfers with **same notional ($2)**:

- Candidates: held working symbols + liquid catalog alts with quotes
- Tricks: `trough_bounce_15m`, `momentum_15m`, `mean_revert_15m`, `hold_bank` (baseline)
- Score forward 15m mark-to-mark **paper** PnL after estimated RT spread cost (`mark15m` on the snapshot; skip if missing — do not invent)
- Rank winners → update success ledger (`path_id`, `trick_id`, paper win rate)
- Output: top 3 what-if paths in `WHAT-IF TOP` + whether any clears live gates

Quiet **live** unless a path is actionable. Learn still prints the rank board.

Paper what-if is **not** a broker fill. Ledger `kind: paper_surf` is separate from live Trust Cards (`path_id` + `trick_id` + real `order_id`).

### B) DIVIDEND_15M live (when BP ≥ $2)

| Rule | DIVIDEND_15M |
| --- | --- |
| Max new working entries / day | **up to 8** (prefer 1 per 15m slot if gates clear) |
| Max working seats | **4** (banks excluded) |
| Spread hard | **≤1.2%** (prefer ≤0.8%) |
| Edge | Expected 15m move ≥ **1.5×** RT spread (prefer 2×) |
| Entry | SURF_ACT: park-to-banks first; else one seat (trough → mean-revert → momentum). Momentum live after paper ≥**50% / ≥3** trials; graduate prefer ≥55% / ≥10 |
| Exit / dividend | Sleeve TP at max(1.2%, 1.5×spread) or rotate into next top what-if within same 15m if unrealized ≥ edge; stop max(2%, 2×spread) |
| Soft halt | Day realized ≤ **−$2.00** |
| Expectancy halt | **8** losing working RTs |
| Bank sleeve | Still Game-authorize only |
| Dust / banks | Untouchable floors |

If BP < $2: **learn only** — no forced last-dollar trades. Free BP via Game-authorized working sleeve (leave dust) or deposit.

### C) SURF_ACT (one recommended move per 15m — never a place)

Priority is fixed math:

1. **RED_DAY fired / defend** → `red_day_exit` (working to dust; banks hold)
2. **RED_DAY green_shelter** → `green_only_park` (tokens still green vs session open until bottoms)
3. **RED_DAY reenter** → `trough_bounce_15m` agentless recommend when bottoms form
4. **Accumulate** → `park_to_near` then `park_to_chip` when working profit clears the park gate (leave dust)
5. **Enter one seat** → `trough_bounce_15m` then `mean_revert_15m` then unlocked `momentum_15m`
6. Else **hold / hold_bank** (`live=false`) — banks stay; SURF_LEARN keeps ranking

Lesson 2026-09-19: while RED_DAY is active, soft-halt only **chase** (`momentum` / `mean_revert`). Do **not** block trough re-entry forever — green-only then bottoms then enter, without agents.

TRAIL VIEW prints `NEXT MOVE`. The watcher still does not preview or place. Agents/humans step in on `WATCH   alert` and follow review-before-place.

## Dividend definition

A “15m dividend” = closed working sleeve (or prediction ticket) with **positive realized** after fees/spread in that window, then park leftover above dust toward NEAR then CHIP.

## Run

```bash
npm run watch:15m -- --snapshot tests/fixtures/trail/quiet.example.json
```

Quiet live + `NEXT MOVE` hold/accumulate + `WHAT-IF TOP` is the intended default on that EXAMPLE fixture. The watcher never places.
