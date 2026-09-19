# Agentic usage credits ↔ token rails (Game 2026-09-19)

## Intent

Treat **Agentic AI turn credits** and **on-chain / RH token activity** as one refinement loop:

1. Wave math runs for **free** (0 credits) every 15m — pure tape.
2. Agents spend credits only when the math says step in (`WATCH alert`, Game authorize, review-before-place).
3. Live fills tagged with `trick_id` + `path_id` feed the success ledger.
4. Ledger expectancy refines which primed tokens and second-wave rides deserve the next credit.

This is how communication and ML get sharper without burning chat on quiet books.

## Credit table (`AGENTIC_MOVE_EQ_v4`)

| Event | Credits | Notes |
| --- | --- | --- |
| `creditsPerQuietWatch` | 0 | Cron / `watch:15m` |
| `creditsPerAlertStepIn` | 1 | Human or Cursor wakes on alert |
| `creditsPerLivePlaceReview` | 1 | Preview → confirm → place |

Never invent PnL to “pay for” credits. Broker fills only.

## Blockchain / token usage (bridge)

- RH Agentic book is the **execution** surface (this plugin).
- On-chain usage / earnings (when Game wires an external feed) are **signals** into prime score / follow-path candidates — Wild West quarantine until confirmed by tape+ledger.
- Building token usage into agentic systems means: more real fills + ledger stats → better next-wave priming, not more idle chat.

## Practical rule

If the book is quiet, **do not open a Cursor turn**. Let wave functions keep scoring. Spend the credit when `trick_out`, `second_wave`, or a gate-clear enter prints.
