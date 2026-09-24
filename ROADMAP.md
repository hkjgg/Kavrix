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
- **Certificate revocation (Stage 7 → 8).** Stage 8 stores real serials in `certificates` and
  `/verify/[serial]` resolves them. Still open: a revocation flag for a month re-assayed after
  late deals, and a fallback when two accounts' serials collide (one in a million per month).
- **Certificate variants (Stage 7).** A light "paper" edition for print, and a square 1080×1080
  crop. Both would be new layouts of the same `AssayCertificate` tree, never new figures — the
  certificate stays Karat, tier, hallmarks, period and trade count.
- **Broker offset in the §12 payload (Stage 8).** The connector knows its server's UTC offset but
  §12's `account` has no field for it, so the trader copies it from the Experts log into
  Settings. An optional `account.serverUtcOffsetHours` would remove that step; per-date offsets
  (DST) would also fix history converted with today's offset.
- **Balance operations from the connector (Stage 8).** Equity at entry is the balance walked back
  through later closes; deposits and withdrawals are not in the §12 feed, so they shift it.
  Sending `DEAL_TYPE_BALANCE` deals as their own list would make it exact.
- **Excursion and candles for real accounts (Stage 8).** MFE/MAE are stored as the best and worst
  fill. The connector could send each closed position's M1 high/low (`CopyRates`) — true MFE/MAE —
  and the bars the Dossier's chart needs.
- **Account switcher (Stage 8).** A trader with two linked MT5 accounts sees the most recently
  synced one; Settings lists both. A switcher in the header (`?account=`) is the next step.
- **Netting accounts (Stage 8).** `DEAL_ENTRY_INOUT` reversals are skipped by the connector; a
  netting account needs positions split at each reversal.
- **Background assay (Stage 8).** The engine runs inside each ingest request; a first sync of
  years of an EA is many batches each re-assaying the whole account. A queue (or assaying only
  the last batch of a sync) would keep requests short at that scale.
- **Stored snapshots on the surfaces (Stage 8).** Pages compute the live Assay from stored trades;
  `karat_snapshots` could draw a Karat history chart without running the engine, and serve
  the AI cache in Stage 9.
- **Token rotation and scopes (Stage 8).** Tokens are revoked and re-issued by hand; an expiry, a
  "rotate" that keeps the account binding, and a read-only status token are later ideas.
