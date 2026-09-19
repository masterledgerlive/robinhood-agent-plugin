# robinhood-agent-plugin

MIT plugin for **Robinhood Agentic Trading** in Cursor and other MCP hosts.

You fund a dedicated Robinhood Agentic account. The agent trades the **RISK** bucket only. It writes a plain-text **MACHINE LOG** for every action so a human can read machine intent.

Default bet is a micro size (~$2 on a ~$7 roll). When event/prediction contracts exist, they come first. Pair them with crypto on the same underlying (start with **NEAR**). Early-sell part of a ticket to cover cost. Hold winners. Roll tiny wins into a lower-risk token hold.

This repo is not a broker. Robinhood fills orders. This plugin discovers tools, gates money, and logs what happened.

## What it does

- Connects to `https://agent.robinhood.com/mcp/trading` (streamable HTTP + OAuth).
- Calls `tools/list` at runtime. A live snapshot is docs only — **never** the catalog.
- Matches review / preview / place / list tools by **schema shape**, not a hardcoded name list.
- Forces review/preview before place.
- Paper mode logs `WOULD_PLACE` and does not send live orders.
- Live mode needs a real start-of-day equity mark from the broker.
- Halts at **20% daily drawdown** (configurable).
- Logs only real fills and order ids. **Never invent PnL.**

## Connect MCP (humans)

### Cursor plugin

1. Clone this repo or install it as a Cursor plugin.
2. Cursor reads `.cursor-plugin/plugin.json` and `mcp.json`.
3. Enable the **robinhood-trading** MCP server.
4. Complete the Robinhood OAuth popup. Do not paste passwords into chat.

`mcp.json` already points at the trading endpoint:

```json
{
  "mcpServers": {
    "robinhood-trading": {
      "type": "http",
      "url": "https://agent.robinhood.com/mcp/trading"
    }
  }
}
```

### Project MCP (no plugin install)

Copy the same block into `.cursor/mcp.json` in a project.

### Scripts

Use the TypeScript client in `src/`. Pass a token provider. Cursor OAuth is preferred.

```ts
import { connectRobinhoodMcp, matchCapabilities, envTokenProvider } from "@masterledgerlive/robinhood-agent-plugin";

const client = await connectRobinhoodMcp({ tokenProvider: envTokenProvider() });
const tools = await client.listTools();
const caps = matchCapabilities(tools);
```

Default mode is **paper**. Set `ROBINHOOD_TRADING_MODE=live` only when you mean it.

## Risk rails

| Rail | Default |
| --- | --- |
| Bucket | RISK only. Never SAVE / vault. |
| Daily halt | 20% drawdown from start-of-day RISK equity |
| Micro bet | $2 |
| Roll cap | $7 |
| Mode | paper until you opt into live |
| PnL | broker fills + order ids only |

Start-of-day equity must come from a real portfolio read. If the Agentic account is unfunded, live place is blocked.

Env knobs (see `.env.example`):

- `ROBINHOOD_TRADING_MODE=paper|live`
- `ROBINHOOD_DAILY_DRAWDOWN_HALT_PCT=0.20`
- `ROBINHOOD_MAX_BET_USD=2`
- `ROBINHOOD_MAX_ROLL_USD=7`

## MACHINE LOG format

Every tool call gets a plain-text block. Humans should be able to skim it.

```
=== MACHINE LOG ===
TIME    2026-09-18T17:00:00.000Z
MODE    paper
BUCKET  RISK
INTENT  Preview $2 NEAR-USD buy to pair with an event ticket
TOOL    preview_crypto_order
ARGS    {"symbol":"NEAR-USD","side":"buy","dollar_amount":"2.00","rhs_account_number":"…4242"}
RESULT  ok | preview ok; est debit 2.00
ORDER   none
FILL    none
PNL     none (do not invent)
HUMAN   Preview clean. Wait for confirm before place.
=== END LOG ===
```

Account numbers and tokens are redacted. Order ids stay visible. More pictures: [docs/MACHINE_VIEW.md](docs/MACHINE_VIEW.md).

## Agentic trail / surf

Trail Agentic AI → lock follow-paths → name tricks by algorithm → **code** watches every 15m → humans/agents step in on alert (or Game authorize).

Continuous watching is a cheap deterministic script. Do not spend Cursor / Grok / desk credits on unchanged 15m checks.

```bash
npm run watch:15m -- --snapshot tests/fixtures/trail/quiet.example.json
npm run trail:view -- --ledger tests/fixtures/trail/ledger.example.json
```

Quiet **live** is the default. **SURF_LEARN** still runs every cycle ($2 paper what-ifs) and prints `WHAT-IF TOP`. **SURF_ACT** prints one `NEXT MOVE`: park working profit into banks first, then at most one 15m seat (trough → mean-revert → unlocked momentum). Momentum goes live after paper ≥50% over ≥3 trials (graduate prefer 55%/10). Alert lists trick candidates that cleared **DIVIDEND_15M** gates (spread ≤1.2%, edge ≥1.5× RT, max 8 new working entries/day, max 4 working seats; LOW_CAP_SLOW remains selectable). Live micros need **buying power ≥ $2**; otherwise learn only. The watcher never places an order.

**Wave autonomy:** every 15m, pure wave functions + `AGENTIC_MOVE_EQ` arm per-token triggers (TP/stop/park/entry) from the tape. Cascade/whispers overlay routes. **Agents are optional** — cron still prints `WAVES` / `TRIGGERS` when Cursor is silent. See [docs/AGENTIC_MOVE_EQ.md](docs/AGENTIC_MOVE_EQ.md).

See [docs/DIVIDEND_15M_SURF.md](docs/DIVIDEND_15M_SURF.md). Red-day / green-only / agentic whispers: [docs/RED_DAY_WHISPER.md](docs/RED_DAY_WHISPER.md). Unverified chatter stays Wild West **quarantine**. On `RED_DAY fired` the watcher recommends exit-to-dust → **green-only shelter** until bottoms → agentless trough re-enter, and still **does not place**.

Banks stay **NEAR → FIL (display-only until MCP unlock) → CHIP**. Example Agentic rhs `813839826` (not a secret).

Favor **produce/protect tokens under gates**, not lose-to-churn. [IKN CORE ethics](docs/IKN_CORE_ETHICS_BRIDGE.md) apply now as that bridge: gas-gated truth ≡ LOW_CAP_SLOW edge gates; unverified agentic chatter is Wild West quarantine; the practical Trust Card today is `path_id` + `trick_id` + real `order_id` + ledger outcome. The **IKN Network Project** holds cross-system / WIP layers (Solid pods, Merkle cards, medical/cosmos) — do not implement those here.

Full spec: [docs/AGENTIC_TRAIL_MODEL.md](docs/AGENTIC_TRAIL_MODEL.md).

## NEAR prediction + crypto playbook

Short version:

1. Discover tools (`tools/list`). Do not assume names from last week.
2. Use the Agentic account (`agentic_allowed=true`). Read-only on the rest.
3. Mark RISK equity from the broker. Halt math starts here.
4. Search for a NEAR event/prediction contract. If that tool exists, it is lane 1.
5. Buy ~$2 of the ticket. Early-sell a slice to cover cost. Hold the rest if it is winning.
6. Pair with ~$2 NEAR-USD crypto (preview → confirm → place).
7. If you win micro, do not size up. Park the extra in a lower-risk NEAR hold.
8. Log every step. Stop at the drawdown cap.

Full write-up: [docs/PLAYBOOK_NEAR.md](docs/PLAYBOOK_NEAR.md).

Event tools may not exist in a given session. `search` currently notes that event categories land later. If capability discovery finds no event place tool, skip that lane and say so in the log. Do not fake a contract.

## Agents

Follow [SKILL.md](SKILL.md) (same text in `skills/robinhood-agentic-trading/SKILL.md`).

Order of operations:

1. Discover tools.
2. Review / preview before place.
3. Write a MACHINE LOG.
4. Halt when rails fire.

A live tool inventory from one real session lives in [docs/examples/LIVE_TOOLS_SNAPSHOT.md](docs/examples/LIVE_TOOLS_SNAPSHOT.md). Use it as examples. Re-list tools every session.

## Library

```bash
npm install
npm test
npm run build
```

Tests do not call Robinhood and do not place orders. They cover the log formatter, risk guard, capability matcher, trick `evaluate()` gates, and watcher quiet/alert.

## License

[MIT](LICENSE)
