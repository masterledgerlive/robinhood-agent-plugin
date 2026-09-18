# Robinhood Trading MCP — live tool snapshot
Source: user-Robinhood Trading MCP after OAuth (Game / masterledgerlive session)
Endpoint: https://agent.robinhood.com/mcp/trading
Captured: 2026-09-18 PT
Do NOT hardcode tool names in production code — re-discover via tools/list. This snapshot is documentation only.

## Accounts observed
- Agentic (agentic_allowed): account_number ends 9826, limited_margin, nickname Agentic, has rhc crypto account
- Primary individual: agentic_allowed false — read-only to this agent
- Agentic portfolio at capture: all zeros (needs funding)

## Tool inventory (names + intent)
### Read / research
get_accounts, get_portfolio, search
get_equity_quotes, get_equity_historicals, get_equity_fundamentals, get_equity_price_book, get_equity_technical_indicators, get_equity_tradability, get_equity_news, get_equity_tax_lots, get_equity_positions, get_equity_orders
get_crypto_quotes, get_currency_pairs, get_crypto_positions, get_crypto_orders, get_crypto_account_onboarding_info
get_option_chains, get_option_instruments, get_option_quotes, get_option_historicals, get_option_positions, get_option_orders, get_option_watchlist, get_option_level_upgrade_info
get_indexes, get_index_quotes, get_index_historicals
get_earnings_calendar, get_earnings_results, get_financials
get_sec_filing_index, get_sec_filing, get_sec_filing_facts, get_sec_filing_facts_catalog
get_politician_trades
get_realized_pnl, get_pnl_trade_history (includes equities, options, crypto, prediction markets)
get_limited_margin_upgrade_info

### Watchlists / scans / alerts
get_watchlists, create_watchlist, update_watchlist, add_to_watchlist, remove_from_watchlist, follow_watchlist, unfollow_watchlist, get_watchlist_items, get_popular_watchlists
add_option_to_watchlist, remove_option_from_watchlist
get_scans, create_scan, run_scan, update_scan_filters, update_scan_config, get_scanner_filter_specs
create_alert, get_alerts, update_alert, delete_alert, get_alert_log, mark_alerts_read

### Trade (money) — always review/preview first unless user waived
review_equity_order → place_equity_order → cancel_equity_order
preview_crypto_order → place_crypto_order → cancel_crypto_order
review_option_order → place_option_order → cancel_option_order
review_advanced_order → place_advanced_order → cancel_advanced_order (OCO)
exercise_option, cancel_option_exercise
get_advanced_orders

### Safety contract for this plugin
1. RISK bucket only; never touch SAVE/vault
2. Halt at daily drawdown cap (default 20% of risk start-of-day)
3. Log only real fills / order ids — never invent PnL
4. Plain-text MACHINE LOG for every tool call: INTENT → TOOL → ARGS (redacted) → RESULT SUMMARY → HUMAN LINE
5. MIT license, agent-readable SKILL.md + human README
