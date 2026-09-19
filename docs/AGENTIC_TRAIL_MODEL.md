# Agentic trail / surf model (Game 2026-09-18)

## Goal

Use **Agentic AI as the product we trail**, not as endless chat spend. Learn and follow the highest-success Agentic systems (Robinhood Agentic + public agentic trading/AI patterns). Lock **follow-paths** and **success rates** in code. Surf the token book with named **tricks** (algorithms) so patterns are logged, repeatable, and eventually leader-grade — while we are still learning and trailing.

**v1 in this repo:** code watches; humans and agents step in on alerts. Continuous 15m checks are deterministic and cheap. Cursor / Grok / desk bots do not poll quiet books.

The live book’s job is to **produce or protect tokens under gates — not lose to churn.** IKN CORE ethics apply now as that discipline ([IKN_CORE_ETHICS_BRIDGE.md](IKN_CORE_ETHICS_BRIDGE.md)). The **IKN Network Project** is the cross-system bridge; this plugin stays the RH catalog. Solid pods, Merkle Trust Cards, and medical/cosmos phases are **WIP only** — do not implement them here.

## Non-negotiables

- Account: Robinhood **Agentic only**. Example rhs `813839826` (account id, not a secret). Never send orders to a non-agentic account.
- Banks forever: **NEAR → FIL (display-only until MCP unlock) → CHIP**. Dust floors. Never flatten.
- Mode: **LOW_CAP_SLOW**
  - max 1 new working entry/day
  - max 2 working seats
  - spread hard ≤ 0.8%
  - edge ≥ 2× round-trip spread
  - trough+bounce only; no chase
  - soft halt: day realized ≤ −$1 (broker figure only)
  - expectancy halt: after 5 losing working RTs
- Predictions: Game mobile ~$2 Yes/No only if ≤0.45 or ≥0.85 (MCP cannot place events yet)
- Real fills / real hashes only — never invent PnL
- **Gas-gated truth ≡ LOW_CAP_SLOW edge gates.** No edge / wide spread / halt → quiet. Motion ≠ mandate.
- Unverified agentic chatter (news, social, unnamed bots) is **Wild West quarantine**: paraphrase into follow-path *candidates* only; never auto-trade.
- Practical Trust Card today: `path_id` + `trick_id` + real `order_id` + ledger outcome. No Merkle/pod layer required to log a fill.
- No live trading keys in this repo. Watcher and tests use fixtures / stubs. **No order placement from CI or the 15m CLI.**

## Architecture: code watches; agents step in on alerts

| Layer | Job | Usage rule |
| --- | --- | --- |
| **Deterministic watchers** (cron / 15m scripts) | Quotes, spreads, floors, halt flags, mark vs cost, trough detect | Cheap continuous — no LLM |
| **Trick catalog** (named algos) | Each entry/exit pattern has an id + params + logged outcome | Code selects candidate tricks |
| **Success ledger** | Follow-path id → win rate, expectancy, RT cost, last used | Hard data; gates which tricks may fire |
| **Agentic step-in** (Robin / desk / token bots / Cursor) | Only when watcher alerts a gate-clear move, halt, or Game authorize | Spend credits on decisions, not idle polling |
| **Prediction overlay** | Same trail as crypto; tickets drafted for fills | Mobile until RH opens agentic predictions/pools |

### Usage / credit discipline

- Cron or a local loop runs `npm run watch:15m` on a snapshot file. Quiet is the default output. That path **must not** open a Cursor cloud agent, Grok Bot turn, or chat session.
- Cursor / agents wake only when:
  1. the watcher prints `WATCH   alert`, or
  2. Game authorizes a bank sleeve, deconcentrate, or other override.
- Do not burn chat or Cursor turns on every 15m quiet check.
- Prefer one durable PR that maintains the code model over many exploratory chats.
- When RH later opens predictions/pools to agents: same trail ledger + trick ids apply before “tricking out” into the next pre-predicted avenue.

## Follow-path (locked template)

```
path_id: string
source: rh_mcp | rh_mobile | cascade_chatter | external_agentic | news | github_code
leader_system: who we are trailing (e.g. RH Agentic rails, named public bot, our own ledger top trick)
horizon: 15m (primary) | 1h | 1d
tokens: [symbols]
trick_id: algorithm name (see below)
gates: LOW_CAP_SLOW + any path-specific
success_rate: wins / attempts (rolling); null when no closed attempts
status: trailing | paused | graduated | retired
```

JSON Schema: [schemas/follow-path.schema.json](schemas/follow-path.schema.json).

## Trick naming (buy the code / algorithm)

Name every rotate by the **algorithm**, not the vibe. Each trick is `evaluate(snapshot) → { eligible, reason }` in `src/tricks/`.

| id | When it may fire |
| --- | --- |
| `trough_bounce_15m` | Mark reclaim above a 15–30m trough + spread ≤0.8% + bounce edge ≥2× RT + seats/day open. No chase. |
| `bank_sleeve_authorized` | Game-only bank haircut above dust floor. Never flatten. FIL stays display-only. |
| `deconcentrate_high_notional` | Game exit of an oversized seat → dust + micro seeds. Never flatten. |
| `park_to_near` | Cascade park of working profit into NEAR (#1) when profit gates clear. |
| `park_to_chip` | Cascade park into CHIP (#3) when NEAR is unavailable or Game names CHIP. |
| `expectancy_halt` | Protective no-new-working-entry after 5 losing working RTs. |
| `soft_halt` | Protective no-new-risk when broker day realized ≤ −$1. |

Future: `leader_mirror_<system>` — only after the ledger shows positive trail expectancy.

Log (when a human/agent actually attempts a move): `{trick_id, path_id, order_ids[], realized_pnl, spread_at_entry, timestamp}`.

## Banks and dust

- Bank order: NEAR #1 → FIL #2 (MCP display-only as of 2026-09-18) → CHIP #3.
- Bank floor: 10% of peak notional or $0.25, whichever is higher.
- Working dust: 5% of peak or $0.10. Never flatten a token to zero.
- Prefer live MCP parks: **NEAR**, then **CHIP**, until FIL unlocks.

## Agentic AI trend sources (ingest → rank → trail)

1. Robinhood Agentic MCP + mobile (ground truth for *our* book)
2. RH cascade desk/bots
3. Public agentic trading repos / papers (MIT plugin neighbors)
4. News / social agentic traction — **Wild West quarantine**: paraphrase into follow-path candidates; never auto-trade off chatter alone
5. Machine view / plain-text plugin dumps (`=== TRAIL VIEW ===` + `=== MACHINE LOG ===`)

Ranking: prefer systems with **published or observed positive expectancy under friction**, small-capital compatible, and compatible with our hard rails.

Small-capital research that locked LOW_CAP_SLOW: frequency is the killer on ~$20 books; edge must clear ~2× costs; cap working seats; pullback + confirmation, not day-leader chase.

## Repo map (v1)

| Piece | Where |
| --- | --- |
| Trick catalog | `src/tricks/` |
| Follow-path + success ledger | `src/trail/ledger.ts` |
| 15m watcher | `src/trail/watcher.ts` + `src/trail/cli.ts` |
| Broker port (stub only) | `src/trail/broker.ts` (`FixtureBroker`) |
| JSON schemas | `src/trail/schemas.ts`, `docs/schemas/` |
| Trail plain-text view | `src/log/trail-view.ts` (extends MACHINE VIEW) |
| EXAMPLE fixtures | `tests/fixtures/trail/*.example.json` |
| IKN CORE ethics (usable now; protocol WIP) | [IKN_CORE_ETHICS_BRIDGE.md](IKN_CORE_ETHICS_BRIDGE.md) |

```bash
npm run watch:15m -- --snapshot tests/fixtures/trail/quiet.example.json
npm run trail:view -- --ledger tests/fixtures/trail/ledger.example.json
```

Quiet must be the usual result. Alert prints trick candidates that cleared gates. The watcher does not preview or place.

Sample JSON in this repo is marked `"example": true` and a `$comment`. It is **not** live book data.

## Success definition (near-term)

1. Watcher scripts + trick catalog + success ledger land in `robinhood-agent-plugin`
2. 15m evaluate path is: code check → alert only if gate-clear or floor/halt change → agent places under rails (outside this CLI)
3. Every live fill tagged with `trick_id` + `path_id`
4. Rolling success rates visible in machine-readable JSON + short Game report (`=== TRAIL VIEW ===`)

## Out of scope for v1

- Auto-spend from RISK/Base desks
- Chasing day leaders / wide-spread alts without Game authorize
- Invented “sample” PnL or fake leader stats
- MCP place/preview from the watcher, tests, or CI
- FIL MCP buys until the pair is agentic-tradable
- Solid pods, Merkle Trust Cards, medical/cosmos IKN phases (park in IKN Network Project)
