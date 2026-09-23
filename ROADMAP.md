# Kavrix — Roadmap

Everything here is **V2 or later**. Nothing on this list is built in V1
(see CLAUDE.md §4). Add new ideas here instead of building them.

## V2 — deferred scope

| Idea | Notes |
|---|---|
| CSV / HTML statement import | Manual upload path for traders not running the connector. |
| Prop-firm rule tracker | Daily loss, max drawdown and consistency rules per firm. |
| Rule Lock | The EA blocks trading when a rule is about to be broken. |
| Full trade replay | Bar-by-bar playback of a trade with the Hallmark alongside. |
| AI chat | Conversational layer over engine findings. |
| News Shockwave chart | Price reaction around high-impact USD releases. |
| Spread Tide chart | Spread over the session cycle, including rollover. |
| cTrader support | Second broker platform beyond MT5. |
| TradingView webhooks | Ingest from TradingView alerts. |
| Crypto symbols | Beyond Gold; needs per-symbol contract sizes and sessions. |
| Public verified profiles | Shareable, verified Karat history. |
| Mentor mode | Read-only account sharing with a coach. |
| Billing | Subscriptions and plan limits. |

## Notes collected during V1

- **Price bars for real accounts (Stage 4).** The Trade Dossier's chart draws the demo's own M1
  path. The connector (§12) sends deals, SL/TP changes and the calendar — no prices — so a real
  account's Dossier has no candles. Options: have the connector send M1 bars around each closed
  position (`CopyRates`), or a market-data source. Until then the chart shows its empty state.
- **Vault source toggle (Stage 5).** The Vault's ingots fill by the whole account's day P&L,
  EAs included (the engine's `calendarDays`), while the engraving and the Replay are manual
  only. A "manual / EA / all" toggle on the fills would let a trader see their own hand's
  days alone. It needs a manual-only calendar from the engine (`computeStats` already takes
  `manualOnly`), not arithmetic in the page.
- **Day Assay extras (Vault redesign).** Kept out of V1 on purpose — the Day Assay is a day
  story, not a replay: price candles under the day chart (needs a bar source, see above), a
  side-by-side of two days, a shareable "day card" in the Certificate's style, and chapter
  sentences rewritten by the AI layer (Stage 9) from the same engine JSON.
