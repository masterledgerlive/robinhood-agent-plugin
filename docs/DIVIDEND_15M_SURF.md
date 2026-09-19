# DIVIDEND_15M / SURF_LEARN (Game 2026-09-18 ~7:51 PT)

## Intent

Target **revenue every 15 minutes** by surfing waves across tokens: leave banks growing, rotate working capital, learn from **what-if paths** (same notional — which path would have won), and move faster than LOW_CAP_SLOW. Game authorized **more risk for more reward** while learning with many parallel “surfers.”

Default live rails are **DIVIDEND_15M**. **SURF_LEARN** runs every 15m cycle in code. LOW_CAP_SLOW remains a selectable profile.

Literal every-slot profit is not guaranteed; the system **aims** every 15m and **learns** every 15m. Losing paper paths teach which waves not to take live.

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
| Entry | Prefer top ranked SURF_LEARN path; trough+bounce preferred; light momentum OK if ledger paper win rate ≥55% over ≥10 trials |
| Exit / dividend | Sleeve TP at max(1.2%, 1.5×spread) or rotate into next top what-if within same 15m if unrealized ≥ edge; stop max(2%, 2×spread) |
| Soft halt | Day realized ≤ **−$2.00** |
| Expectancy halt | **8** losing working RTs |
| Bank sleeve | Still Game-authorize only |
| Dust / banks | Untouchable floors |

If BP < $2: **learn only** — no forced last-dollar trades. Free BP via Game-authorized working sleeve (leave dust) or deposit.

## Dividend definition

A “15m dividend” = closed working sleeve (or prediction ticket) with **positive realized** after fees/spread in that window, then park leftover above dust toward NEAR then CHIP.

## Run

```bash
npm run watch:15m -- --snapshot tests/fixtures/trail/quiet.example.json
```

Quiet live + `WHAT-IF TOP` is the intended default on that EXAMPLE fixture. The watcher never places.
