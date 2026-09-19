# Red-day + Agentic whisper playbook (Game 2026-09-18 ~8:02 PT)

## Intent

Use **Agentic AI traffic / whispers** (rooms, desks, public agentic chatter) as an early warning layer for:

1. Massive move days
2. **Red days** (broad risk-off)
3. Which tokens those spaces say still **make revenue** or bounce hardest
4. **Exit** working seats before the slide deepens
5. **Re-enter** near the trough with a pre-staged route

Whispers are **candidates**, not orders. IKN Wild West: unverified rumor stays **quarantine** until price/structure confirms.

The 15m watcher **never places**. On `fired` it only recommends `exit_working_to_dust` (leave dust; never flatten banks) and staged `buy_trough` tokens.

## Sources (whisper ingest)

- RH cascade desk + token bots (paraphrase actionable only)
- INFO_SOURCES agentic chatter slots Game adds (X/Discord/Telegram)
- Public agentic trading chatter when connected
- Never auto-spend off a single rumor; need confirmation score (2-of-3)

Optional inbox file: `--whispers` JSON/JSONL (ops path when present: `/workspace/rh-ops/whispers/inbox.jsonl`).

## Whisper card (machine shape)

```
whisper_id, heard_at, source, theme (red_day|massive_up|token_specific),
tokens[], route_hint (exit_working|hold_banks|buy_trough),
confidence 0-1, status (quarantine|confirmed|expired)
```

Schema: [schemas/whisper-card.schema.json](schemas/whisper-card.schema.json). Default status is **quarantine**.

## Red-day trigger (READY)

`redDayTrigger.evaluate(snapshot, whispers[]) → { quiet | armed | fired, reasons[] }`

Armed/fired when **any two** of these fire inside a 30m window:

- **A) Whisper:** ≥2 independent agentic sources (or Game ping / `authorize.redDay`) tagging `red_day`
- **B) Book:** NEAR mark ≤ −2% vs session open **or** ≥2 working seats each ≤ −1.5% vs cost
- **C) Tape:** majority of SURF_LEARN universe 15m marks negative after estimated RT cost (`mark15m` required; no invent)

| Status | Meaning |
| --- | --- |
| `quiet` | 0–1 legs |
| `armed` | 2+ legs, no working seat above dust to sleeve |
| `fired` | 2+ legs and at least one working seat above dust |

**On fired (recommend only — no place):**

1. `exit_working_to_dust` — list working seats; leave dust forever
2. **Never flatten banks** (NEAR/FIL/CHIP floors)
3. Do not chase day leaders down
4. Treat book as `RED_DAY_ACTIVE`: soft-halt new chase entries (`trough_bounce` / `momentum` / `mean_revert`)
5. Stage `buy_trough` candidates from whisper tokens that clear DIVIDEND_15M spread ≤1.2%

**Re-enter (trough route, still no watcher place):** wait for SURF_LEARN / `trough_bounce_15m` on whisper-favored tokens or liquid majors. Size with available BP; one seat first. Clear active when NEAR reclaims session open or Game clears.

## Massive-up whisper

Same ingest; `route_hint` may be `hold_banks` + selective working add — still need spread/edge gates. No FOMO override without Game authorize.

## Autonomy

15m check: scan whisper inbox if present, score red-day trigger, wake parent on arm/fire (`WATCH   alert`). Place exits only in a later human/agent step when Game has standing authorize. This plugin does not place.

DIVIDEND_15M + SURF_LEARN stay intact. Banks never flatten.
