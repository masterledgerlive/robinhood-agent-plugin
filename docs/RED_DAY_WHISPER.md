# Red-day + green-only + Agentic whisper playbook

## Lesson 2026-09-19 (live book)

The system **failed to act** when everything went red. Fix locked in code:

1. **Trigger** when the book/tape go broad-red (2-of-3) — tape may use **session opens** when `mark15m` is missing (live RH quotes).
2. **Exit** working seats to dust (never flatten banks).
3. **Shelter into green-only tokens** (still green vs session open — e.g. ZEC while NEAR/WLD/SEI/ENA/CHIP are red) until bottoms form.
4. **Re-enter** on trough reclaim **without agents** — cron math prints WHERE/WHEN; do **not** soft-halt trough forever during RED_DAY.
5. **Clear** when NEAR reclaims session open (or Game clears).

Agents are optional for the whole loop. Watcher still **never places**.

## Intent

Use **Agentic AI traffic / whispers** (rooms, desks, public agentic chatter) as an early warning layer for:

1. Massive move days
2. **Red days** (broad risk-off)
3. Which tokens those spaces say still **make revenue** or bounce hardest
4. **Exit** working seats before the slide deepens
5. **Green-only shelter** while waiting for bottoms
6. **Re-enter** near the trough with a pre-staged route — agentless recommend

Whispers are **candidates**, not orders. IKN Wild West: unverified rumor stays **quarantine** until price/structure confirms.

The 15m watcher **never places**. On `fired` it recommends `exit_working_to_dust`, `park_green_only`, and staged `buy_trough` tokens.

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

`redDayTrigger.evaluate(snapshot, whispers[]) → { quiet | armed | fired, phase, reasons[] }`

Armed/fired when **any two** of these fire inside a 30m window:

- **A) Whisper:** ≥2 independent agentic sources (or Game ping / `authorize.redDay`) tagging `red_day`
- **B) Book:** NEAR mark ≤ −2% vs session open **or** ≥2 working seats each ≤ −1.5% vs cost
- **C) Tape:** majority of SURF_LEARN universe 15m marks negative after RT **or** ≥75% of names with session opens are red vs open (“everything going red”). Missing marks are not invented.

| Status | Phase | Meaning |
| --- | --- | --- |
| `quiet` | `quiet` | 0–1 legs |
| `armed` | `green_shelter` / `wait_bottoms` / `reenter` | 2+ legs, no working seat above dust |
| `fired` | `defend` | 2+ legs and at least one working seat above dust |
| (any) | `cleared` | NEAR reclaimed open or Game cleared — `active=false` |

**On fired / active (recommend only — no place):**

1. `exit_working_to_dust` — list working seats; leave dust forever
2. **Never flatten banks** (NEAR/FIL/CHIP floors)
3. Do not chase day leaders down (`momentum` / `mean_revert` soft-halt while active)
4. `park_green_only` — tokens still **green vs session open** (relative strength shelter)
5. Stage `buy_trough` from whisper tokens that clear DIVIDEND_15M spread ≤1.2%
6. When trough reclaim appears → phase `reenter` — allow `trough_bounce_15m` (agentless recommend)

**Re-enter (trough route, still no watcher place):** SURF_LEARN / `trough_bounce_15m` on bottoms. Size with available BP; one seat first. Clear active when NEAR reclaims session open or Game clears.

## Massive-up whisper

Same ingest; `route_hint` may be `hold_banks` + selective working add — still need spread/edge gates. No FOMO override without Game authorize.

## Autonomy

15m check: scan whisper inbox if present, score red-day trigger, wake parent on arm/fire (`WATCH   alert`). Place exits only in a later human/agent step when Game has standing authorize. This plugin does not place.

Cron knows WHERE/WHEN with **zero agent credits**. DIVIDEND_15M + SURF_LEARN stay intact. Banks never flatten.
