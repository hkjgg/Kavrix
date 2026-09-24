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
- **Backtest import for the drawdown band (Stage 6).** The Monte Carlo band draws from a normal
  with the backtest's expectancy and dispersion, because that is all a user types in. An MT5
  strategy-tester report import would let the band resample the backtest's actual trades (fat
  tails included) and its own day structure, instead of borrowing the live history's ρ.
- **Slippage in execution quality (Stage 6).** Needs the connector to send the requested price
  with each fill; until then the 0.10 component is spread only.
- **EA baseline in Settings (Stage 6).** Backtest expectancy and dispersion per magic number are
  read from `eas`; entering and editing them is a Settings screen, alongside Stage 8's accounts.
- **The Constellation over time (Stage 6).** A month-by-month replay of the sky — stars dimming
  as an EA drifts, threads thickening as two EAs converge — would show *when* a pair became one
  bet. Needs per-period Fineness from the engine, not a re-run in the page.
- **Wrapped extras (Stage 7).** A year-end Wrapped over twelve monthly assays; a video export of
  the story (the reveal as frames, not a screen recording); share sheets that post the PNG
  straight to a network; a "compare two months" chapter. Each needs no new metric — the monthly
  `WrappedResult`s already carry the numbers.
- **Certificate serials in `certificates` (Stage 7 → 8).** The serial is a deterministic hash of
  account and month; Stage 8 stores it, enforces uniqueness, and lets `/verify/[serial]` resolve
  real accounts. A revocation flag (a month re-assayed after late deals) belongs there too.
- **Certificate variants (Stage 7).** A light "paper" edition for print, and a square 1080×1080
  crop. Both would be new layouts of the same `AssayCertificate` tree, never new figures — the
  certificate stays Karat, tier, hallmarks, period and trade count.
