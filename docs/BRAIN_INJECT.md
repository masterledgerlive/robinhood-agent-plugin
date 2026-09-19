# BRAIN_INJECT — recursive memory + transmission-cost learning

Updated: 2026-09-19 · `BRAIN_INJECT_v1`

## Answer: yes, we inject the brain

Every `watch15m` / system load cycle:

1. **SURF_LEARN** writes paper attempts with `notes` + `rt_cost` (transmission = RT ≈ 2× one-way).
2. **`injectBrain`** loads prior ledger `brain` memory, aggregates cost rows, appends human-readable **notes**, cost-re-ranks `WHAT-IF TOP`, and persists `brain` back onto the ledger file.
3. **SURF_ACT / TRAIL VIEW / prime** read that memory so learning is useful and trackable — not vibes.

## Trackable data fields

| Field | Where | What you read |
| --- | --- | --- |
| `attempts[].notes` | ledger JSON | `paper $2; oneWay=…%; RT=…%; pnl=…; after_cost=clear\|underwater` |
| `attempts[].rt_cost` | ledger JSON | RT fraction used in learning |
| `brain.notes[]` | ledger JSON | inject / tx_cost / unlock / refine / useful rows with `data` |
| `brain.transmission[]` | ledger JSON | per-trick mean RT, pnl/RT, useful flag |
| `BRAIN` / `COST LEARN` / `BRAIN NOTES` | TRAIL VIEW | plain-text dump every watch |
| MACHINE LOG `brain_injected` / `brain_useful` / `credit_hint` | args | load-cost awareness (0 quiet / 1 alert) |

## Usefulness (proved in code)

- **Cost-aware WHAT-IF TOP** — re-ranked by paper PnL per RT dollar (`costScore`).
- **Prefer tighter edge** when mean RT is wide or pnl/RT is weak → NEXT MOVE reason + brain note.
- **Momentum unlock** visible in notes when paper memory clears ≥50% / ≥3.
- **Prime penalty** for symbols with high remembered mean RT (`memRT` / `txPen` in equation string).
- **Credit hint** mirrors usage table while loading quiet vs alert cycles.

Never invents fills. Never places. Soft-halt / risk rails stay in gates — this module proves learning, not risk policy.

```bash
npm run watch:15m -- --snapshot tests/fixtures/trail/quiet.example.json --ledger /tmp/brain-ledger.json
npm run trail:view -- --ledger /tmp/brain-ledger.json
```

Re-run watch on the same `--ledger` to see `cycles` climb and notes accumulate.
