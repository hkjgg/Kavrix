# CLAUDE.md — Kavrix

> Read this file fully before every task. It is the single source of truth for what Kavrix is,
> how it looks, and how it computes. If a request conflicts with this file, ask before deviating.

---

## 1. What Kavrix is

**Kavrix — Gold trading intelligence.**
A web platform for **Gold (XAUUSD) traders and Expert Advisor (EA) users** on MetaTrader 5.
It syncs trades from MT5, measures **discipline** (not just profit), explains what indiscipline
costs, and presents it through a luxury, watch-and-bullion-inspired interface.

- Tagline: *Profit tells you what happened. Karat tells you if it will last.*
- Language: **English only** — UI copy, code, file names, comments.
- Audience: retail Gold traders, prop-firm traders, people running EAs from the MQL5 Market.
- Goal of V1: a portfolio-grade product that **feels like a real SaaS** — instant demo, real MT5 connector.

### What makes it different (never dilute these)
1. **Karat Score** — a deterministic, auditable discipline score on a 0–24K scale.
2. **Karat Gap** — what indiscipline cost, in R and in money.
3. **Gold-first intelligence** — sessions, USD news, rollover spread, all Gold-specific.
4. **EA Health** — per-EA health measured in **Fineness (‰)**, plus EA correlation.
5. **Luxury data visualization** — every chart is built on the gold/watch metaphor.

---

## 2. Non-negotiables

- **Engine first, AI second.** All numbers come from the deterministic analytics engine.
  The AI only *explains* engine output. The AI never computes, invents, or estimates a metric.
- **Every score is explainable.** Every deducted point links to the exact trades that caused it.
- **No manual tagging required.** Everything in V1 is derived from MT5 data automatically.
- **Luxury in moments, calm in work.** Cinematic motion only on: landing, Assay Dial, Wrapped,
  Assay Certificate. Tables and charts stay quiet and fast.
- **Respect `prefers-reduced-motion`** everywhere.
- **Honest demo.** Demo data is always labelled "Demo data". No fake testimonials, user counts,
  or win-rate marketing claims anywhere.
- **Security.** API keys (Claude, Supabase service role) are server-side only. Row Level Security
  on every table. Connector tokens are hashed at rest.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS with design tokens as CSS variables (see §9) |
| Motion | Framer Motion; Lenis for smooth scroll on the landing only |
| Custom charts | D3 + hand-written SVG React components |
| Price charts | TradingView `lightweight-charts` |
| 3D (landing only) | React Three Fiber + drei, lazy-loaded, with a static fallback |
| Backend | Supabase (Auth, Postgres, RLS) |
| AI | Claude API, server-side route handlers only |
| Tests | Vitest for the engine (required), Playwright optional |
| Hosting | Vercel |
| MT5 | MQL5 Expert Advisor "Kavrix Connector" (in `/connector`) |

---

## 4. Scope

### V1 (build this)
- Landing page (cinematic) with **Try Demo** — no login
- Demo mode: 90 days of XAUUSD manual trades + 3 EAs, deterministic seed
- Analytics engine (pure TypeScript, fully unit-tested)
- **Assay** (dashboard): Assay Dial, pillar rings, Karat Gap, The Refinery, Your Proof, Gold Clock
- **Ledger** (trades table) with Hallmarks + **Trade Dossier** (single trade page)
- **Vault** (calendar) and **Purity Line** (equity)
- **Constellation** (EA Health + Fineness + correlation)
- **Wrapped** (monthly story) ending in the **Assay Certificate**
- **Kavrix Connector** EA + ingest API + account linking
- Small AI layer: explains findings in one or two sentences each
- Auth (Supabase) for real accounts

### V2 (do NOT build in V1 — note ideas in `ROADMAP.md`)
CSV/HTML import, prop-firm rule tracker, Rule Lock (EA blocks trading), full trade replay,
AI chat, News Shockwave chart, Spread Tide chart, cTrader, TradingView webhooks, crypto,
public verified profiles, mentor mode, billing.

---

## 5. Domain definitions (the engine's vocabulary)

- **Trade** = one closed position (aggregate of its MT5 deals).
- **Contract size** XAUUSD = 100 oz per 1.00 lot (read from connector; do not hardcode for other symbols).
- **Initial risk ($)** = |entry − initial SL| × volume × contract size. Initial SL = SL at entry (within 60 s).
- **R-multiple** = net P&L ÷ initial risk. If no SL: use the user's default risk (1% of equity at entry)
  as the denominator and mark the trade `noStop = true`.
- **Sessions (UTC)**: Asia 00:00–09:00 · London 07:00–16:00 · New York 12:30–21:00. A trade belongs to
  every session its **entry** time falls in (overlaps allowed).
- **News window**: ±15 min around a **high-impact USD** event (configurable).
- **Rollover window**: broker server midnight ±15 min (configurable), where Gold spreads widen.
- **MFE / MAE**: max favorable / adverse excursion during the trade, in R (from connector ticks/bars).
- **Loss** = net P&L < 0 after commission and swap.

---

## 6. Karat Score (the heart of the product)

Measures **process, not outcome**. A reckless profitable trader scores low; a disciplined losing
trader scores high. Applies to **manual trades only** (EA trades are excluded — see §7).

### 6.1 Pillars (total 100 points)

| Pillar | Pts | Rule (per trade unless noted) |
|---|---|---|
| **Risk** | 25 | risk% = initial risk ÷ equity at entry. Score 1 if ≤ limit (default 1%), linear to 0 at 1.5× limit, 0 above. `noStop` trades score 0. |
| **Revenge** | 20 | Revenge trade = opened ≤ 15 min after a losing close, OR lot > 1.25× the previous trade's lot after a loss. Pillar = 20 × (1 − revenge ÷ all trades). |
| **Stops** | 15 | Compliant = SL set within 60 s of entry AND never moved further from entry. Pillar = 15 × compliant ratio. |
| **Exits** | 15 | 70%: overrun ratio (losses worse than −1.1R). 30%: holding asymmetry = median loser duration ÷ median winner duration; score = clamp(1 − (ratio − 1) ÷ 2, 0, 1), 1 if ratio ≤ 1. |
| **Overtrading** | 15 | Per day: violating if trades > daily max (default 5). Pillar = 15 × (1 − violating days ÷ active days). |
| **Market Conditions** | 10 | Flagged = entry inside a news window OR rollover window. Pillar = 10 × (1 − flagged ÷ all trades). Trades tagged `news-strategy` are exempt. |

- All thresholds are user-configurable in Settings; defaults above.
- **Recency weighting**: exponential, half-life 10 days, over a rolling 30-day window.
- **Karat** = points ÷ 100 × 24, one decimal (e.g. `21.4K`).
- **Minimum sample**: fewer than 10 trades → show state **"Assaying…"**, no score.

### 6.2 Tiers (real gold karats)

| Karat | Tier |
|---|---|
| ≥ 23.5 | 24K · Pure |
| ≥ 22.0 | 22K · Refined |
| ≥ 18.0 | 18K · Solid |
| ≥ 14.0 | 14K · Mixed |
| ≥ 10.0 | 10K · Alloyed |
| < 10.0 | Raw Ore |

### 6.3 Karat Gap (cost of indiscipline)
Sum of cost attributed to **impurity trades**, reported in **R and account currency**.
Each trade's cost is attributed to **one** pillar only, in priority:
**Revenge → Market Conditions → Risk → Exits**.
- Revenge / Market Conditions: the trade's net loss (winning impurity trades cost 0).
- Risk (oversized loser): loss × (1 − limit ÷ actual risk%).
- Exits (overrun loser): the part of the loss beyond −1R.
- Stops has no direct cost line (its effect shows in Exits).

### 6.4 Your Proof
Group ISO weeks by weekly Karat. Show average weekly R for **≥ 20K weeks** vs **< 14K weeks**,
and the difference ("Discipline paid you X R a week"). Hide the card unless each bucket has ≥ 3 weeks.

### 6.5 Explainability contract
Every pillar exposes `{ points, maxPoints, deductions: [{ reason, tradeIds[], pointsLost }] }`.
UI copy example: `−3.2 Revenge · 2 trades opened within 8 min after a loss` → click opens those trades.

> **§6.6–§6.12 — statistical intelligence (Stage 2.5).** The principle for all of them: **with a few hundred trades, rigorous statistics beat
> machine learning. Never present a pattern the data cannot support.** None of this changes a
> Karat formula — §6.1–§6.5 are untouched by every module below.

### 6.6 Confidence
Every group of trades the engine reports carries: `n`, mean R, a **95% confidence interval** of
mean R, win rate, and a **Wilson** interval around the win rate.

- The interval is a **deterministic seeded bootstrap**, percentile method, **2,000 resamples**.
  The stream is seeded from the sample itself, so the same group always produces the same
  interval and two different groups never share a stream. Nothing reads `Math.random`.
- The same bootstrap is read at the 10th/90th percentile for the 80% interval, and gives a
  two-sided **bootstrap p-value** for "the mean is 0", floored at `1 / (resamples + 1)`.
- **Resample budget.** A bootstrap costs `resamples × n`, and one run scores dozens of groups.
  Every group up to **200 trades** — which is every cell on the accounts this product is built
  for — gets the full 2,000. Past that the count tapers to a floor of 200, because `resamples`
  controls the Monte Carlo error of the *endpoints* and by then the interval itself is narrow.
  Configurable: `bootstrapResamples`, `bootstrapMinResamples`, `bootstrapSampleBudget`.

| Label | Rule |
|---|---|
| **Strong** | n ≥ 20 **and** the 95% interval excludes 0 |
| **Moderate** | n ≥ 10 **and** the 80% interval excludes 0 |
| **Weak** | anything else |

Confidence is attached to **every finding** and **every stats breakdown** (session, hour,
weekday). The **Refinery's top 3 may only use Strong or Moderate findings**; Weak ones stay in
the data flagged `tentative` and are shown marked as such. A finding with no trade sample
(EA correlation) carries `confidence: null` and is tentative — it makes a real claim, but not a
claim about a mean R, so it does not lead.

### 6.7 Personal baselines
Median and **p90** of the trader's own **lot size, risk %, trades per day, holding time**
(`quantile` = linear interpolation, the R/NumPy type-7 definition).

- The baseline is everything **before** the recent window (default 7 days). A window compared
  against a history containing it hides exactly the change the card exists to show.
- A metric is **"outside your normal"** when the recent window's **median** exceeds the
  baseline p90. One oversized lot is an event; a week whose typical lot is past the p90 of every
  week before it is a change of behaviour. Individual exceedances still ride along for the UI.
- Needs 20 baseline trades before it claims anybody's normal.
- **Findings only.** Karat keeps the configured thresholds (§6.1); nothing here touches a
  pillar, a deduction or the Gap.

### 6.8 Edge Map
Manual trades grouped by **pre-trade** conditions only — nothing a trade did after it was
opened may define a cell.

| Dimension | Cells |
|---|---|
| Session | each session's **open** (first 3 hours) and its remainder, plus hours no session covers. Sessions overlap, so a trade can be in two |
| Weekday | Sunday–Saturday (UTC) |
| News proximity | in the window (±15 min) · 15–60 min from a release · clear |
| Context | first of day · after a win · after a loss · no previous trade (exclusive, in that order) |

- Cells need **n ≥ 8** or they are not tested at all.
- Ranked by mean R with §6.6 confidence.
- **Benjamini–Hochberg** across every tested cell at α = 0.05 before anything is labelled
  Strong. Twenty cells at α = 0.05 means one looks significant by luck; a cell that would read
  Strong alone but did not survive the correction drops to Moderate.
- Output: **top 3 strengths** and **top 3 weaknesses**, Weak cells excluded from both.

### 6.9 Similar Trades
**k = 12** nearest neighbours of a trade, on **entry-time information only**.

- Features: UTC hour and weekday (encoded on a circle, so 23:00 and 01:00 are two hours apart),
  session flags, news proximity, previous-trade result, risk %, direction, volatility at entry.
  No R, no MFE/MAE, no duration, no outcome.
- *Volatility at entry* is the standard deviation of the per-hour price change between the
  previous 20 trade **openings** — the engine holds no price bars, and this is derived only
  from data the trader could have had.
- **No hindsight**: only trades that **closed** before the target **opened** are eligible.
  Features are z-scored over that eligible pool, so not even the scaling sees the future.
- Manual neighbours for a manual trade; an EA's own trades for an EA's.
- Returns the neighbours plus wins/losses, mean R and confidence. Twelve trades is rarely
  Strong, and the label says so.

### 6.10 Counterfactual ("What-if")
The equity curve with the impurity trades removed, in money and in R, actual against
counterfactual, plus **per-pillar toggles** (revenge only, market conditions only, …).

- **Winners are removed too.** Removing only the impurities that lost would be an
  advertisement, not a counterfactual. Some accounts come out worse. That is the point.
- Always carries the label **"Counterfactual, not a promise"**.
- **V1 is linear**: the removed trades' P&L is subtracted from the curve in close order and
  nothing else is recomputed — no re-sizing, no margin, no compounding. A trade that risked 1%
  of a larger equity is not re-priced against the equity it would have had.
- **How it differs from the Karat Gap (§6.3).** The Gap is a *bill*: it counts only the
  losses of impurity trades, each trade once, to one pillar in priority order — and for Risk
  and Exits only part of the loss. The What-if is a *curve*: it removes every impurity trade,
  winners included, and a trade carrying two kinds of impurity is removed by both toggles,
  because either habit alone would have prevented it. The two numbers do not match and are not
  supposed to, and **neither is the smaller by rule**: the winners the What-if removes usually
  leave its difference smaller than the Gap (on the demo, +$17,108 against $26,700 billed for
  the same trades), while the Gap's partial Risk and Exits lines can pull it the other way. The
  page states this in one sentence, `GAP_VS_WHAT_IF` in `components/assay/explain.ts`, shared
  by the Gap drawer, the What-if drawer and the Gap card.

### 6.11 Discipline Replay
Per UTC day: the trades in order, the **running day Karat after each trade**, and each impurity
with its reason. The day Karat is that day's own trades, unweighted, as the Vault engraves it —
a mark on a day, not the score. A day opens at **24.0K**: no trades is nothing to fault.

**Tilt episode** = **≥ 2 impurities within 60 minutes**, reported with start, end, the Karat
drop across it and its cost. The chain is measured between *consecutive* impurity entries, so
12:28 → 13:25 → 14:20 is one episode of three: tilt does not reset on the hour.

### 6.12 Prop check
**Historical only, never a prediction.** A user-editable preset — daily loss %, max overall
drawdown % — with a generic default (5% / 10%). **It names no firm and claims no firm's rules.**

- Reports the days that would have breached, the first breach date, and which pillar's
  impurities carried the most breach days (using the Gap's own attribution, so the two surfaces
  never disagree).
- The daily rule **resets every morning**; the overall drawdown rule is **terminal** — the
  first crossing is the breach, and marking every later day as a fresh one would turn a single
  event into fifty.
- Breaching is not an impurity. It is an outcome, and no pillar scores it. The full prop-firm
  rule tracker remains V2 (§4).

---

## 7. EA Health — Fineness (‰)

Per EA (grouped by **magic number**), shown in **Constellation**.

- Metrics: trades, net R, profit factor, expectancy (R), max drawdown, recent-20 expectancy.
- **Baseline** = user-entered backtest expectancy, else the EA's first 50 live trades.
- **Fineness** (0–999.9‰) = 1000 × (0.40 expectancy stability + 0.30 drawdown vs baseline
  + 0.20 consistency + 0.10 execution quality [spread/slippage]). Each component 0–1.
- Labels: ≥ 930 Fine · ≥ 850 Standard · ≥ 700 Watch · < 700 Degraded.
- **Drift alert**: recent-20 expectancy more than 2 standard errors below baseline.
- **Correlation**: Pearson correlation of daily P&L between EAs; ≥ 0.6 → flag "same bet".
- **Monte Carlo drawdown band (Stage 6).** Where a backtest expectancy and dispersion are
  entered, resample the backtest's trade distribution to a band of drawdowns the EA should be
  expected to produce, and show the live drawdown against it. Deterministic and seeded like
  every other resample in the engine (§6.6). Until it exists, `drawdownVsBaseline` compares the
  live drawdown to the baseline period's, scaled by √n — a band says "this is inside what this
  EA does", which a single ratio cannot.

---

## 8. Visualizations (signature components — build exactly these)

All are custom SVG React components in `components/viz/`, driven by engine output only.

**The Assay Instrument (Stage 3.5).** The dial and the pillar rings are not two widgets but one
composition — a measuring instrument and its sub-dials — built in `components/assay/AssayInstrument.tsx`
with its geometry and timing in `components/viz/instrument.ts`:

- **Centre:** the AssayDial (below), 48% of the square stage.
- **Six sub-dials** (PillarRings, below) fixed at 12, 2, 4, 6, 8 and 10 o'clock, in engine pillar
  order (Risk at 12, clockwise), each wired to the dial's centre by a thin gold hairline arm.
- **The reserved outer ring.** A thin, dark band with faint hairline edges round the whole
  instrument, **deliberately empty**. It is where the 24-hour trade clock (the GoldClock,
  item 3) lives. Nothing else may be drawn in it; the code carries a comment saying so.
- **Hover or focus** a sub-dial: its arm brightens, its ring lifts, and its deduction summary
  appears beside it. Nothing else moves.
- **Select** a sub-dial: the instrument transforms in place rather than opening a modal. The
  outer ring and the other five sub-dials dim and shrink slightly, the chosen one is drawn in
  towards the centre and scaled up, and its explanation (formula, deductions, trades — the same
  `ExplainEntry` the drawer shows, rendered by the same `ExplainBody`) resolves beside the
  instrument. Esc, the close button or the centre of the dial restores it.
- **At phone width** the instrument stacks: the dial, then the sub-dials in a two-column grid,
  then the explanation. The ring and the arms are not drawn — they only mean something in the round.
- **Arrival**, ~2.3 s, once, when the section scrolls into view: face and guilloché fade in → one
  highlight sweeps across the bezel → tier arcs draw clockwise → ticks and numerals → the six arms
  extend from the centre → the sub-dial rings fill clockwise, 60 ms apart → the hand sweeps 0 →
  value while the readout counts up. Under `prefers-reduced-motion`, or without JavaScript,
  everything is simply in place.

1. **AssayDial** — watch face, SVG gradients and filters only. Bezel in three machined layers
   (dark outer edge, brushed metal ring lit from the upper left, inner chamfer catching the light);
   a face darkening towards the rim, a guilloché rosette, a faint specular sheen upper left;
   0–24K scale over a 270° arc, tier arc segments in the gold family, short crisp minor ticks and
   an applied index under each serif numeral at 0/10/14/18/22/24. A tapered, faceted hand with a
   counterweight past the centre and a soft offset shadow, sweeping from 0 to the value as the
   last beat of the arrival. A raised centre medallion holds the readout — Karat value (serif,
   gold) above the polished centre cap, tier label and delta vs last week below it — and the hand
   passes *behind* the medallion, so the value is never crossed by a moving part.
2. **PillarRings** — the six sub-dials of the instrument (points / max), every value labelled
   `30-day · recency-weighted`; select one → its deductions in place.
3. **GoldClock** — 24h radial dial (UTC), drawn in the instrument's reserved outer ring.
   Angle = entry time; radius = R result (0R ring dashed).
   Session arcs (Asia slate, London gold, New York bronze) outside the dial; dashed amber lines
   for high-impact USD news; jade/oxblood dots fade in sequentially. Center shows best window.
4. **PurityLine** — equity curve as a gold line whose brightness/saturation = rolling Karat
   at that point (bright gold = disciplined, dull = impure). Impurity trades marked with small stamps.
5. **Refinery** — two bullion bars: actual P&L vs 24K counterfactual; gap segmented by pillar.
   (On the Assay this is scene `03 — The Gap`: the account's actual result and the §6.10
   "every impurity removed" figure, the difference engraved between them, the Karat Gap bill
   and its per-pillar breakdown beneath. Always labelled "Counterfactual, not a promise".)
6. **Hallmark** — a unique 32 px radial glyph per trade encoding 6 dimensions: R result, risk%,
   duration, session, news proximity, SL compliance. Deterministic from trade data. Used in the Ledger.
7. **VaultCalendar** — each day is a cast ingot (`components/viz/Ingot.tsx`): a bar seen slightly
   from above, a wide top face with the day's Karat struck into it (Instrument Serif, debossed) over
   a bevelled front face. **Material = Karat**: the metal is the day's tier, one shared gradient per
   tier (24K rich gold with a bright highlight → 22K gold → 18K champagne → 14K pale gold with a
   bronze cast → 10K bronze → Raw Ore matte slate), so purity rises and falls across a month without
   reading a number. **Assay strip = P&L**: a 2px strip under each bar, jade or oxblood, its length
   against the month's largest day — the only jade or oxblood on the shelf. Each week stands on a
   gold-deep hairline shelf with a faint reflection (≤ 8%); a no-trade day is a recessed slot; the
   month's best and worst day carry a tiny hallmark. Months are headed `06 — June 2026` with the
   month's average day Karat stamped beside it. Motion: one slow light sweep along a shelf the first
   time it is seen, a 2px lift and one sheen pass on hover/focus; static under reduced motion.
   A day opens the **Day Assay** (§6.11): a chart (running P&L, the running day Karat tarnishing
   where impurities set it, USD news, session washes, gaps folded), the day in engine-built
   chapters, and the day's Karat Gap receipt.
8. **Constellation** — EAs as stars; force layout where distance = 1 − correlation; size = volume;
   brightness = Fineness.
9. **AssayCertificate** — shareable bullion-bar card:
   `KAVRIX ASSAY · 21.4K · SEPTEMBER 2026 · No. 000147`, engraved stamp, serial number.
   Exportable as PNG at 1080×1350 and 1080×1920.

Price chart in the Trade Dossier: `lightweight-charts` candles with session bands behind,
news markers on the time axis, entry/exit/SL/TP lines.

---

## 9. Design system — "Obsidian Gold" / The Vault

Inspiration: Swiss watch dials, bullion bars, private-bank statements, luxury editorial.
**Not** generic SaaS.

### Color tokens
```
--bg:            #0A0A0C   page (obsidian)
--surface-1:     #111114   cards
--surface-2:     #1A1A1E   hover / raised
--line:          #1E1D21   hairlines
--text:          #EDE9E1   primary (warm off-white, never pure white)
--text-2:        #B8B2A6   secondary
--text-3:        #8E897F   labels / captions
--gold:          #D4AF6A   the ONE accent (brand + interaction)
--gold-light:    #F3DFA8   highlights, sheen
--gold-deep:     #8C6A2F   metallic shading
--champagne:     #E9D8A6
--bronze:        #A8743F   New York session, secondary series
--slate:         #5E5B66   Asia session, neutral series
--jade:          #6FC291   profit (gains only)
--oxblood:       #C0564B   loss (losses only); text variant #E08A7E
--news:          #C9953F   news markers
```
Rules: gold = brand/interaction only; jade/oxblood = P&L only; never pure red/green;
metallic gradient (`gold-light → gold → gold-deep`) only on signature elements.

### Typography
- **Instrument Serif** — hero numerals, headings, Karat values (like watch numerals)
- **Manrope** — UI text
- **JetBrains Mono** — tables, prices, R values (tabular figures, fixed decimals)
- Section headings in editorial style: `01 — The Assay`, `02 — The Ledger`, `03 — The Refinery`
- Labels: uppercase, letter-spacing 2–3px, 11px, `--text-3`

### Shape & motion
- Cards: 20px radius, 1px `--line` border, no drop shadows (depth = lighter surface)
- Hairline gold borders at low opacity for "engraved" feel
- Numbers count up like a mechanical counter; dial hand sweeps; logo has a slow gold sheen
- Loading state copy: **"Assaying…"** with a subtle gold-dust shimmer
- Film grain + vignette on the landing only

---

## 10. Brand vocabulary (use consistently in UI and code)

| Term | Meaning |
|---|---|
| Assay | the dashboard / scoring |
| Assaying… | calculating / not enough data |
| Karat | discipline score (0–24K) |
| Impurity | a rule violation |
| Karat Gap | cost of impurities |
| The Refinery | top 3 improvement findings |
| Hallmark | per-trade glyph |
| Fineness | EA health (‰) |
| The Ledger | trades table |
| The Vault | calendar |
| Constellation | EA view |
| Assay Certificate | monthly shareable bar |

Copy style: short, calm, confident. Sentence case. No exclamation marks. No hype.

---

## 11. Demo mode

- Route: `/demo` — loads instantly, no auth, read-only, banner "Demo data".
- Generator: `lib/demo/generate.ts`, **deterministic seed**, 90 days, ~220 manual XAUUSD trades
  + 3 EAs (`Gold Scalper` magic 1001, `London Breakout` 1002, `Grid Recovery` 1003).
- The data must tell clear stories the product can discover:
  losses clustered near USD news; revenge trades after losses; London open as the edge;
  improving Karat over the last 3 weeks; EA 1001 and 1002 highly correlated; EA 1003 drifting.
- News events: a realistic fixed calendar of high-impact USD releases for the 90 days.

---

## 12. Kavrix Connector (MT5 EA) & ingest API

- Location: `/connector/KavrixConnector.mq5`. Compiles in MetaEditor with zero warnings.
- User generates a **connector token** in Settings; pastes it into the EA inputs.
- EA uses `WebRequest` (user must allow the API URL in MT5 options — document this).
- On start: sends full history (batched, 100 deals per request). Then: new deals on
  `OnTradeTransaction`, SL/TP modifications, heartbeat every 60 s.
- Sends high-impact USD events from the **MT5 built-in economic calendar** (`CalendarValueHistory`).

`POST /api/ingest` — `Authorization: Bearer <token>`
```json
{
  "account": { "login": 0, "server": "", "currency": "USD", "balance": 0, "equity": 0, "leverage": 0 },
  "deals": [{ "ticket": 0, "positionId": 0, "time": "ISO", "type": "buy|sell", "entry": "in|out",
              "symbol": "XAUUSD", "volume": 0, "price": 0, "sl": 0, "tp": 0, "profit": 0,
              "commission": 0, "swap": 0, "magic": 0, "comment": "", "spreadPoints": 0 }],
  "modifications": [{ "positionId": 0, "time": "ISO", "sl": 0, "tp": 0 }],
  "calendar": [{ "eventId": 0, "time": "ISO", "currency": "USD", "importance": "high", "name": "" }],
  "symbolInfo": { "XAUUSD": { "contractSize": 100, "digits": 2 } }
}
```
- Idempotent by `ticket` / `eventId`. Validate with Zod. Rate-limit per token.
- Retries in the EA: exponential backoff, local queue so nothing is lost offline.

---

## 13. Data model (Supabase, RLS on all)

`profiles`, `accounts`, `connector_tokens` (hashed), `deals`, `trades` (derived positions),
`sl_modifications`, `news_events`, `eas` (magic, name, baseline), `settings` (thresholds),
`karat_snapshots` (daily score + pillars + deductions JSON), `findings` (Refinery items),
`certificates` (serial numbers).

Engine runs server-side after each ingest batch and writes snapshots; the UI reads snapshots.

---

## 14. AI layer (small in V1)

- Input: engine findings JSON only (never raw trades beyond what a finding references).
- Output: 1–2 sentences per finding: what happened + one concrete action.
- System prompt must forbid new numbers not present in the input.
- Cache results per snapshot. The product works fully if the AI is unavailable.

---

## 15. Project structure

```
app/
  (marketing)/page.tsx        landing
  demo/                       demo mode
  (app)/assay | ledger | trade/[id] | vault | constellation | wrapped | settings
  api/ingest | api/ai
components/
  viz/                        AssayDial, GoldClock, PurityLine, Refinery,
                              Hallmark, VaultCalendar, Constellation, AssayCertificate
                              (+ pure geometry: dial.ts, instrument.ts, rings.ts, hallmark.ts,
                              purity.ts, ingot.ts)
  assay/                      the Assay page: AssayInstrument (dial + PillarRings sub-dials),
                              scenes (incl. the Purity Line + What-if), Explain drawer
  vault/                      the Vault: view builder (shelves, ingots, keyboard), screen,
                              Day Assay (view, chart geometry, panel)
  ledger/                     the Ledger screen (client: filters, table, keyboard, export)
  dossier/                    the Trade Dossier: view builder, screen, price chart
  ui/                         primitives (Card, Label, Stat, Button, Table)
lib/
  engine/                     trades, sessions, news, karat, gap, proof, fineness, correlation,
                              confidence, baselines, edgemap, similar, counterfactual, replay,
                              dayStory, prop
  demo/                       deterministic generator (+ memoised Assay, Ledger rows, candles,
                              Vault)
  dates.ts                    UTC calendar words for day keys, without Intl — browser-safe
  ledger/                     rows, query (filter/sort/URL), summary, CSV, keyboard, pack —
                              browser-safe except rows.ts
  supabase/                   clients + typed queries
connector/                    KavrixConnector.mq5 + README
```

---

## 16. Conventions

- TypeScript strict; no `any`. Engine functions are **pure** and have unit tests.
- Every engine formula in this file has a matching test with hand-checked expected values.
- Components never compute metrics — they receive engine output.
- Money and R formatting through one `format.ts` (fixed decimals, tabular mono font).
- Accessibility: real buttons/links, focus states in gold, WCAG AA contrast.
- Performance: Lighthouse ≥ 90 on `/demo`; 3D lazy-loaded; charts render server data without layout shift.
- Commit per stage with a clear message. Keep `ROADMAP.md` updated with V2 ideas instead of building them.

---

## 17. Build stages (status)

- [x] 0 — Setup, tokens, fonts, UI primitives
- [x] 1 — Demo data generator
- [x] 2 — Analytics engine + Karat + tests
- [x] 2.5 — Statistical intelligence: confidence, personal baselines, Edge Map, Similar Trades,
  What-if, Discipline Replay, prop check (§6.6–§6.12). Engine only, no UI.
- [x] 3 — Assay dashboard (Dial, Pillars, Gap, Refinery, Proof)
  - **"Explain this number"**: every metric on every surface opens its formula, the trades
    behind it and its §6.6 confidence. Calm and factual — it explains, it does not reassure.
- [x] 3.5 — The Assay instrument: dial craft, the six sub-dials wired to it, the reserved outer
  ring, four scroll-triggered scenes, and a scope label on every pillar value and finding
- [x] 4 — Ledger + Hallmarks + Trade Dossier *(swapped with the old Stage 4 at the product
  owner's call, 2026-09-23)*
  - `/ledger`: every closed trade, manual and EA, filters / search / sort / page in the URL, a
    "current filter" summary strip, CSV export of exactly the rows shown, a terminal keyboard.
  - `/trade/[id]`: Hallmark and figures, price chart, what each impurity cost, Similar Trades,
    previous / next inside the Ledger's filter.
- [x] 5 — Purity Line + Vault
  - **What-if toggle on the Purity Line** (§6.10), carrying the "Counterfactual, not a promise"
    label wherever it is drawn.
  - **Discipline Replay opens from a day in the Vault** (§6.11).
  - `/vault`: the 90-day history as month shelves of ingots (fill = day P&L, engraving = day
    Karat), hover detail, a month summary per shelf, one-tab-stop keyboard, `?day=` in the URL.
  - `05 — The Purity Line` on the Assay: equity lit by the rolling Karat, impurity stamps to
    the Dossier, What-if with the engine's six scenarios.
  - **Vault redesign (2026-09-23):** bullion ingots (material = Karat, assay strip = P&L) and the
    **Day Assay** replacing the Replay's text list — chart, engine-built chapters, day receipt.
- [ ] 6 — Constellation (EA Health, Fineness, correlation)
  - **Monte Carlo drawdown band from the backtest** for EA Health (§7).
- [ ] 7 — Wrapped + Assay Certificate export
  - The Certificate and `/verify/[serial]` show **only** Karat, tier, Hallmarks, period and
    trade count. **Never money, R totals or balances** — a shareable card is a public surface,
    and the trader's P&L is nobody else's business.
- [ ] 8 — Auth + ingest API + Kavrix Connector EA
  - Connector status is honest: "Synced · 4s ago" from a real heartbeat. **Never an invented
    latency figure**, and never a green dot the data does not support.
- [ ] 9 — AI explanations
- [ ] 10 — Cinematic landing
  - **Methodology page**, linked from the footer: how Karat is computed, what the confidence
    labels mean, and what the What-if does and does not claim.
- [ ] 11 — Polish, README with architecture diagram, deploy
  - **The Gold Clock** (§8.3), deferred here from the old Stage 4 as part of the final design
    pass. It goes in the instrument's **reserved outer ring** (§8), not beside it; until then
    the ring stays empty and untouched.
  - Engineering metrics (test count, engine speed, Lighthouse) belong in the **README only**,
    never in the app. They are a portfolio fact about the build, not a product claim to a
    trader.

---

## 18. Progress notes

### Stage 0 — Setup, tokens, fonts, UI primitives ✅ (2026-09-21)

**Scaffolded**
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict, pnpm.
- Tailwind CSS v4 (CSS-first config, `@tailwindcss/postcss`), ESLint 9 with
  `eslint-config-next` flat config, Vitest 5.
- Scripts: `pnpm dev | build | start | lint | typecheck | test`.
- Folder structure exactly as §15; empty folders hold a `.gitkeep`.

**Design tokens (§9)**
- Every colour token is a CSS variable on `:root` in `app/globals.css`, then
  mapped into the Tailwind theme with `@theme inline` — so `bg-bg`,
  `text-text-2`, `border-line`, `text-gold`, `text-oxblood-text` etc. all
  resolve to the same variables that SVG charts will read directly.
- Utilities: `metal-gold` (surface gradient), `metal-gold-text` (gradient
  painted through glyphs), `sheen` (slow gold sweep, the logo treatment),
  `engraved` (hairline gold border). All motion stops under
  `prefers-reduced-motion`; the gradients themselves stay visible.
- `rounded-card` = 20px, from `--radius-card`.

**Fonts (§9)**
- `next/font/google`: Instrument Serif → `font-serif`, Manrope → `font-sans`
  (body default), JetBrains Mono → `font-mono`. Mono carries
  `font-feature-settings: 'tnum' 1, 'zero' 1`, so every figure column lines up
  without a per-component utility.

**Primitives (`components/ui/`)**
- `Card`, `SectionHeading`, `Label`, `Stat`, `Button`, `Badge`, and a `Table`
  set (`Table`, `TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`,
  `TableCell`). All typed, presentational only, no metric computation.
- Barrel export at `components/ui/index.ts`.

**Formatting (`lib/format.ts`)**
- `formatR`, `formatMoney`, `formatPct`, `formatKarat`, all with fixed decimals
  and a real minus sign (U+2212). 24 Vitest cases in `lib/format.test.ts`.

**Decisions taken**
- **Tailwind v4 over v3.** Tokens live in CSS rather than a JS config, which
  matches the "design tokens as CSS variables" rule in §9 and avoids keeping
  two copies of the palette.
- **No `clsx`/`tailwind-merge`.** A six-line `cn()` in `lib/cn.ts` is enough;
  Kavrix composes classes, it never merges conflicting utilities.
- **Sign outside the currency symbol** in `formatMoney` (`−$820.00`), the way a
  private-bank statement reads, and the way a column of figures stays scannable.
- **Non-finite values render as an em dash**, never `NaN`.
- **No page at `/` yet.** The landing page is Stage 10, so the route group
  `app/(marketing)/` is still empty. `/styleguide` is the only real page.
- `/styleguide` is temporary and is deleted once the real surfaces exist.

### Stage 1 — Demo data generator ✅ (2026-09-21)

**What exists now**
- `lib/engine/types.ts` — the shared vocabulary: `Deal`, `SlModification`,
  `NewsEvent`, `SymbolInfo`, `Account`, `Ea`, `Trade`, `IngestPayload`. Field
  for field the ingest schema in §12, so demo data and a live MT5 feed are the
  same shape. `Trade` is a *structural* aggregate only — no R, no risk%, no
  session; the engine derives all of that in Stage 2.
- `lib/demo/rng.ts` — mulberry32 plus a small `Rng` (uniform, normal, pick,
  shuffle). Nothing in the demo path touches `Math.random` or the clock.
- `lib/demo/calendar.ts` — a hand-written USD calendar for the window:
  45 events, 37 of them high-impact, on real weekdays (NFP first Friday, CPI
  mid-month, FOMC on a Wednesday at 18:00 UTC).
- `lib/demo/price.ts` — 129,600 M1 bars as parallel typed arrays, with the
  session volatility profile, news spikes, and a spread that widens at
  rollover and on releases.
- `lib/demo/generate.ts` — the account: 220 manual trades, 614 EA trades,
  1,668 deals, 16 SL/TP modifications. (Recalibrated in Stage 2 — the trade
  plan now runs in four phases rather than two; see the Stage 2 notes.)
- `lib/demo/generate.test.ts` — 30 Vitest cases: determinism, structure, and
  one test per story in §11.
- `scripts/demo-report.ts` behind `pnpm demo:report`.

**Key constants** (all in `lib/demo/generate.ts` unless noted)
- `DEMO_SEED = 20260920`. Same seed → byte-identical output, asserted.
- Window `DEMO_START_MS` 2026-06-22 → `DEMO_END_MS` 2026-09-20, fixed, 90 days.
- `DEMO_IMPROVEMENT_DAYS = 21` (the closing phase starts 2026-08-30),
  `DEMO_EA_DRIFT_DAYS = 30` (EA 1003 degrades from 2026-08-21).
- `MANUAL_PHASES` — the four stretches of the arc: `raw` (days 0–27),
  `mixed` (28–48), `solid` (49–68), `refined` (69–89).
- `DEMO_START_PRICE = 2418.40` (in `price.ts`), `DEMO_STARTING_BALANCE = 25,000`,
  contract size 100, commission $3.50/lot/side, swap −$11.80 long and −$3.40
  short per lot per night, tripled on the Wednesday rollover.
- The demo broker runs on UTC (`DEMO_SERVER_UTC_OFFSET_HOURS = 0`), so the
  rollover window is 23:45–00:15.

**Decisions taken**
- **Behaviour is planned, not sampled.** The stories in §11 are requirements,
  so `MANUAL_PHASES` states exactly how many trades of each cohort — news,
  revenge, oversized, no-stop, widened-stop, rollover, London, ordinary — and
  how many of each lose, phase by phase. Tuning the data means editing one
  table.
- **Prices come out of the path, never out of arithmetic.** Each trade is
  walked forward bar by bar until its stop, target or time runs out, so no
  trade can quote a price the market never printed — a test proves it. The
  generator chooses the *direction* to make the intended outcome reachable;
  that is the only piece of hindsight in the file.
- **The revenge rule catches more than revenge.** §6.1 fires on any trade
  opened within 15 minutes of a losing close, or sized more than 1.25× after
  one. Ordinary trades are therefore held back from tripping it — lots capped,
  entries nudged past the window where the clock allows — so the 11.8% the
  data reports is deliberate rather than accidental.
- **Positive R, negative money — settled, do not "fix".** Manual trading is
  +41.9R but −$2,733: the R-positive edge is given away by trades that were too
  big, too close to a release, or taken straight after a loss. This is not a
  flaw in the demo data to be balanced away in a later stage. It *is* the
  product's core claim — sizing and discipline decided the money, not skill —
  and the Karat Gap is the line that explains the difference. A demo trader who
  finished clearly up in money would make the Assay a victory lap and the Gap a
  footnote. Confirmed by the product owner, 2026-09-22.
- **MFE/MAE are prices, not R.** The generator records the extreme prices
  reached while a position was open; converting them to R is engine work.
- **`tsx` added as a dev dependency** so `pnpm demo:report` can run a
  TypeScript script without a build step.

**`pnpm demo:report`**
```
01 — THE LEDGER
  Trades (total) 834 · manual 220 · EA 614 · deals 1668 · modifications 16
  High-impact USD events 37 of 45 · manual win rate 50.5%
  Manual net P&L −$2,732.52 · manual net R +41.9R · EA net P&L +$5,519.62
  Closing balance $27,787.10
02 — LOSSES CLUSTER AROUND USD NEWS
  109 manual losses · 68 within ±20 min of a high-impact event (62.4%, target ≥ 60%)
  83 manual trades in a news window, averaging −1.0R
03 — REVENGE TRADING
  32 revenge trades (14.5%, target 10–15%) · avg −0.8R vs +0.4R elsewhere · −$8,065.51
04 — THE LONDON OPEN IS THE EDGE
  70 trades 07:00–10:00 UTC · avg +1.4R (target ≥ +0.7R) · win rate 80.0%
  Asia −0.6R · London open +1.4R · London 10:00–12:30 −0.2R · New York −0.4R
05 — IMPURITIES
  50 trades over 1.5% risk (worst 3.0%) · 10 without a stop · 10 stops widened
  13 rollover entries · 65 active days, 9 of them overtrading
06 — DISCIPLINE IMPROVES
  First 69 days: 160 trades, 92 impure (57.5%), avg 0.0R
  Last 21 days:   60 trades, 10 impure (16.7%), avg +0.8R
07 — CONSTELLATION
  1001 Gold Scalper     294 trades · exp +0.2R · PF 1.70 · baseline +0.3R
  1002 London Breakout  121 trades · exp +0.3R · PF 2.13 · baseline +0.5R
  1003 Grid Recovery    199 trades · exp +0.1R · PF 1.32 · baseline +0.3R
  Correlation 1001 ↔ 1002 (daily P&L) 0.836 (target ≥ 0.600)
  1003 expectancy: +0.3R over the first 60 days, −0.3R over the last 30
```

**Not built, on purpose**
No engine module, no Karat, no UI. The story checks live inside the tests and
the report script, where they are throwaway; §6 gets its real implementation
in Stage 2.


### Stage 2 — Analytics engine, Karat, Gap, Proof, Fineness, findings ✅ (2026-09-21)

**What exists now** (`lib/engine/`, pure TypeScript, no I/O, no `Date.now()`)
- `settings.ts` — every threshold §5–§7 leaves configurable, with the spec's
  defaults. Nothing else in the folder holds a magic number.
- `math.ts` / `time.ts` — total numeric helpers (never `NaN`, never `−0`) and
  UTC date maths, including ISO weeks and broker-server midnight.
- `enrich.ts` — the only module that reads raw positions. Per trade: initial
  risk $, risk %, `noStop`, R, sessions (overlaps allowed), news proximity in
  minutes, news/rollover windows, SL compliance, duration, MFE/MAE in R, the
  revenge flag and its reason, and a list of impurities.
- `karat.ts` — the six pillars, recency weighting, points, Karat, tiers, the
  "Assaying…" state, and the §6.5 deduction contract.
- `series.ts` — daily Karat over the whole history, plus the week-on-week delta.
- `gap.ts` — the Gap in R and money under single-pillar attribution.
- `proof.ts` — weekly Karat, the two buckets, the hiding rule.
- `ea.ts` — per-magic performance, Fineness and its four components, drift,
  pairwise daily-P&L correlation.
- `stats.ts` — equity curve, session/hour/weekday buckets, calendar days,
  ranked hour windows.
- `findings.ts` — eleven deterministic Refinery findings, ranked by money.
- `index.ts` — `runEngine(data, settings, asOf)` → one `AssayResult`.
- 197 Vitest cases across nine files, plus `lib/engine/fixtures.ts` (no
  assertions, just trades). `pnpm engine:report` prints the read-out below.
- `vitest.config.ts` now resolves `@/…` the way Next does, so engine modules
  can import `lib/format` in tests.

**Fixture arithmetic** (`lib/engine/fixtures.ts`)
$10,000 equity, 0.10 lots, 100 oz a lot, a 10.00 stop — $100 of risk, exactly
1% of equity, exactly 1R. Every expected value in the tests is hand-worked from
that, so a failure points at a formula rather than at a fixture.

**Decisions taken** (the spec leaves each of these open)
- **Revenge is pinned to the previous trade.** The previous trade is the last
  *manual* trade to **close** before this one **opened**, and both triggers —
  the 15-minute window and the 1.25× lot — are measured against it. Trigger one
  does not scan further back for any losing close: a winner in between breaks
  the run. EA trades are neither flagged nor eligible as a predecessor.
- **Exits overrun divides by losses, not by all trades.** The pillar asks how
  well losses are cut; dividing by every trade would reward whoever simply lost
  less often, and §6 scores process, not outcome.
- **Holding asymmetry uses unweighted medians.** A weighted median over a
  handful of losers is unstable; recency already lives in the window.
- **Overtrading weights a day by the mean of its trades' weights**, so a
  blow-out day last week costs more than the same day five weeks ago.
- **A news-and-rollover trade is counted once**, under news. The pillar counts
  trades, not violations.
- **`news-strategy` exempts the trade from Market Conditions entirely**, not
  just from the news half.
- **The tier is read from the displayed (one-decimal) Karat**, so a dial
  reading 23.5K can never be labelled 22K.
- **Stops are "widened" against the running stop**, not the original: pulling a
  stop to breakeven and then back out is a widening; trailing it closer never is.
  Removing a stop is the worst widening there is.
- **The Gap's R is in each trade's own R units**, so `money = costR × initial
  risk` holds on every line. A no-stop disaster lands on Exits, which is what
  §6.3 means by "Stops has no direct cost line".
- **Weekly Karat for Proof is unweighted**, and weeks under five manual trades
  are dropped rather than bucketed — one trade can score 24K or 0K.
- **The Vault's day Karat is that day's own trades, unweighted, no minimum.**
  It is a mark on a day; the score is the 30-day window in `series.ts`.
- **Fineness components are all "a fraction of what this EA's own baseline led
  you to expect"** (§7 names the four components and their weights but no
  formulas). A healthy EA therefore scores near 1 on each, and the label bands
  (§7, widened during calibration below) read as degrees of degradation:
  - *Expectancy stability* is measured in standard errors below baseline, the
    same statistic as the drift alert: at baseline it is 1, at the drift
    threshold 0.5, at twice the threshold 0. A raw `recent ÷ baseline` over 20
    trades marked healthy EAs down for ordinary noise.
  - *Drawdown vs baseline* compares the live drawdown to the baseline period's,
    scaled by √n. No live history past the baseline scores 1.
  - *Consistency* is the share of whole 20-trade blocks that made money.
  - *Execution quality* is the account's median spread ÷ the spread the EA
    paid. Slippage is not in the data — the connector sends the fill price,
    never the requested one — so it is not guessed at.
  - Fineness is `null` under 20 trades: not assayed rather than scored badly.
- **Findings rank by money at stake**, costs and edges alike, and severity is
  the share of the total Gap a finding carries — relative, because $400 is
  critical on a $5,000 account and noise on a $500,000 one.
- **Hour windows rank by total R, not average R.** Average alone crowns
  whichever three hours held the fewest, luckiest trades.
- **`runEngine` drops trades opened after `asOf`.** A snapshot must not know
  about a trade that had not happened yet.

**Calibration, after the first read-out (2026-09-22)**
Three things were wrong when the engine first ran over the demo account, and
all three were fixed outside the §6 formulas — the engine was doing what the
spec says, so the demo data and the §7 label bands moved instead.

1. **No impure weeks.** Every week scored 16.6K or better, so Your Proof had an
   empty low bucket and §6.4 hid the card. The demo's two-phase plan is now
   four (`MANUAL_PHASES` in `lib/demo/generate.ts`): `raw`, `mixed`, `solid`,
   `refined`. Each phase carries its own cohort quotas *and* its own risk
   multiplier and ceiling — sizing is the main lever on the Risk pillar, so the
   same cohort risks 1.55% in the opening weeks and 0.68% in the closing ones.
   The weekly arc now reads 11.9K · 12.4K · 16.2K · 13.8K … 23.6K · 23.6K:
   Alloyed to Refined, with three weeks under 14K and Your Proof visible at
   +30.0R a week. (Week three of the opening month scores 16.2K rather than
   following the slide — it is a quiet week with one release in it. That is the
   product's own thesis showing up in the data, so it was left alone.)
2. **Fineness labelled healthy EAs as broken.** Bands starting at 995‰ left no
   room for ordinary noise: Gold Scalper, trading to its baseline, read
   "Watch". §7 now bands at 930 / 850 / 700, and the demo assays into three
   different labels — 1001 Fine, 1002 Standard, 1003 Degraded — which is what
   makes the Constellation worth looking at.
3. **The EAs shared a random stream with the manual plan.** Re-planning a
   manual phase re-rolled Gold Scalper's year, so the EA stories moved every
   time the trader's did. The EAs now draw from `seed ^ EA_SEED_MASK`: still
   one seed, still byte-identical output, but the two halves of the demo are
   independent. London Breakout's per-trade dispersion was also tightened
   (0.40 → 0.32) so its drawdown stays inside what its own first 50 trades
   led you to expect; its day-to-day coefficient is untouched, so the 0.836
   correlation with Gold Scalper survives.

**Market Conditions is the largest Gap line, Revenge the second** — $15,526
across 45 trades against $10,317 across 26. §6.3 attributes Revenge first, so
what lands on Market Conditions is everything given away to a release that was
not *also* a revenge trade, and the demo plants a bigger news habit than a
revenge habit. Both are asserted in `lib/engine/demo.test.ts`.

**The demo trader ends R-positive and money-negative, and stays that way.**
Recalibrating the phases left manual trading at +41.9R for −$2,733, and that
result is deliberate: it is the shape every surface from Stage 3 onwards is
built to explain — the Refinery, the Karat Gap, the Purity Line, the
Certificate. No later stage should rebalance the closing phases to put the
account clearly up in money. The Stage 1 decision above is the standing one.

**Not built, on purpose**
No UI, no snapshot persistence, no AI. The engine writes nothing and reads
nothing; Stage 3 renders `AssayResult`, and Stage 8 stores it.

**`pnpm engine:report`**
```
KAVRIX · ENGINE REPORT
════════════════════════════════════════════════════════════════════════
  Source                                Demo data · seed 20260920
  As of                                 2026-09-20T00:00:00.000Z
  Trades                                834 · manual 220 · EA 614

01 — THE ASSAY
────────────────────────────────────────────────────────────────────────
  Karat                                 23.1K · 22K · Refined
  Points                                96.14 / 100
  Delta vs last week                    +0.3K (from 22.8K)
  Window                                2026-08-21 → 2026-09-20 · 77 manual trades

02 — PILLARS
────────────────────────────────────────────────────────────────────────
  Risk                                  ██████████    24.3 / 25
      −0.69  Risk above the 1.0% limit · 5 trades
  Revenge                               ██████████    19.2 / 20
      −0.44  Opened within 15 min of a loss · 1 trade
      −0.35  Opened within 15 min of a loss, and upsized · 2 trades
  Stops                                 ██████████    15.0 / 15
  Exits                                 █████████·    14.1 / 15
      −0.94  Losses worse than −1.1R · 3 trades
  Overtrading                           ██████████    14.5 / 15
      −0.50  More than 5 trades in a day · 1 day · 6 trades
  Market Conditions                     █████████·     9.1 / 10
      −0.68  Entered within 15 min of high-impact USD news · 7 trades
      −0.26  Entered in the rollover window · 1 trade

03 — KARAT GAP · 30-DAY WINDOW
────────────────────────────────────────────────────────────────────────
  Total                                 −$2,390.22 · −9.0R
    Market Conditions                      −$1,659.75 ·    −6.1R · 5 trades
    Revenge                                  −$728.02 ·    −3.0R · 2 trades
    Risk                                       −$2.45 ·     0.0R · 1 trade
  All 90 days                           −$26,700.37 · −100.3R
    Market Conditions                     −$15,526.49 ·   −63.0R · 45 trades
    Revenge                               −$10,317.36 ·   −34.3R · 26 trades
    Risk                                     −$856.52 ·    −3.1R · 16 trades

04 — YOUR PROOF
────────────────────────────────────────────────────────────────────────
  20K and above                         6 weeks · +13.7R a week
  Under 14K                             3 weeks · −16.3R a week
  Discipline paid                       +30.0R a week
  Weeks scored                          W26 11.9K · W27 12.4K · W28 16.2K · W29 13.8K · W30 19.7K · W31 16.1K · W32 19.9K · W33 20.6K · W34 23.0K · W35 24.0K · W36 21.5K · W37 23.6K · W38 23.6K

05 — THE REFINERY · TOP 3 FINDINGS
────────────────────────────────────────────────────────────────────────
  1. [critical] 65 trades opened within 15 min of a high-impact USD release, 51 of them losses, for −$17,827.61 and −62.8R.
       impact                           −$17,827.61 · −62.8R · 65 trades
  2. [strength] 07:00–10:00 UTC is your best window: 70 trades at +1.4R average, +$15,472.30.
       impact                           +$15,472.30 · +96.3R · 70 trades
  3. [warning] 9 days went past 5 trades, 56 trades in total, for −$10,653.89.
       impact                           −$10,653.89 · −30.6R · 56 trades
  Other findings                        revenge-cost, oversized-risk, exit-overrun, no-stop, rollover-entries, worst-weekday, ea-same-bet, ea-drift

06 — CONSTELLATION · EA FINENESS
────────────────────────────────────────────────────────────────────────
    EA                                  trades   exp      PF    DD     recent-20  fineness  label
    1001 · Gold Scalper                   294   +0.2R   1.70  −13.9R     +0.7R     942.9‰   Fine
       components                       stability 100.0% · drawdown 100.0% · consistency 71.4% · execution 100.0%
    1002 · London Breakout                121   +0.3R   2.13   −6.7R     +0.7R     863.4‰   Standard
       components                       stability 100.0% · drawdown 65.6% · consistency 83.3% · execution 100.0%
    1003 · Grid Recovery                  199   +0.1R   1.32  −18.1R     −0.4R     424.9‰   Degraded · drift
       components                       stability 25.6% · drawdown 23.1% · consistency 77.8% · execution 97.9%
    1001 ↔ 1002                         0.836  · same bet
    1001 ↔ 1003                         -0.237
    1002 ↔ 1003                         -0.242
```

### Stage 2.5 — Statistical intelligence ✅ (2026-09-22)

Seven pure modules on top of the Stage 2 engine (§6.6–§6.12). **No Karat formula was
touched**: `karat.ts` is byte-for-byte the file Stage 2 shipped apart from one filtering
fast path (below), and all 199 Stage 2 tests still pass unchanged.

**What exists now** (`lib/engine/`)
- `rng.ts` — mulberry32 and two FNV-1a hashes. The engine's own copy: the demo folder
  depends on the engine's types, so the engine may not depend back on the demo folder,
  and eight lines of generator is cheaper than that edge in the graph.
- `confidence.ts` — the seeded bootstrap, the percentile and Wilson intervals, the
  Strong/Moderate/Weak ladder, the bootstrap p-value, Benjamini–Hochberg and the
  post-correction label.
- `baselines.ts` — median and p90 of lot size, risk %, trades per day and holding time,
  and the "outside your normal" findings. `quantile` (type 7) was added to `math.ts`.
- `edgemap.ts` — 17 cells over four pre-trade dimensions, BH-corrected as one family,
  top 3 strengths and weaknesses.
- `similar.ts` — k = 12 kNN on entry-time features only, with the no-hindsight rule.
- `counterfactual.ts` — the What-if curve and six per-pillar toggles.
- `replay.ts` — the day walk, the running day Karat and tilt episodes.
- `prop.ts` — the historical preset check.
- `index.ts` — `runEngine(input, settings, asOf, options?)` now returns `refinery`,
  `baselines`, `edgeMap`, `similar`, `counterfactual`, `replay` and `prop` alongside
  everything Stage 2 returned. `Finding` gained `confidence` and `tentative`;
  `BucketStats` gained `confidence`.
- 140 new Vitest cases across nine files. **339 tests in total, all passing.**

**Decisions taken** (each one is a place the brief left a choice open)
- **The resample count tapers on a very large group.** 2,000 resamples × n, across the
  ~70 groups one run scores, is quadratic in the wrong place: at 10,000 trades it alone
  costs more than the performance contract allows. So the budget is
  `resamples × n ≤ 400,000` → **every group up to 200 trades gets the full 2,000**, and
  past that the count tapers to a floor of 200. `resamples` controls the Monte Carlo
  error of the interval's *endpoints*, and a 3,000-trade group's interval is already
  narrow — this is precision nobody reads, traded for an engine that stays inside §16.
  Every group on the demo account, and on any account this product is built for, gets
  the full 2,000. All three numbers are in Settings.
- **A group seeds its own bootstrap** (a hash of its values). Two runs agree forever, and
  two different cells do not share a stream and correlate their intervals.
- **The p-value is the bootstrap's own**, floored at `1/(B+1)`, rather than a t-test.
  It comes from the same distribution as the interval, so a cell can never report an
  interval clear of zero and a p-value that disagrees with it.
- **BH downgrades Strong to Moderate, not to Weak.** A cell that did not survive the
  correction still has its sample; what it has lost is the claim to be exceptional.
- **The Edge Map splits each session into its open and its remainder.** The open is a
  different market from the rest of the session, and the demo proves it: London open is
  +1.4R across 70 trades while London after the open is not an edge at all. Without the
  split, §11's headline story averages itself away.
- **Context cells are exclusive, first-of-day first.** Sitting down to start the day is a
  different decision from the one taken eight minutes after a loss, even if yesterday
  ended badly.
- **Volatility at entry is derived from prior trade openings.** The engine has no price
  bars — §13 stores deals, not ticks — so it is the standard deviation of the per-hour
  price change across the previous 20 openings. Coarse, and honest about being coarse:
  everything in it was on the screen when the trade was opened.
- **Similar Trades z-scores over the eligible pool**, not the whole history. Scaling is
  information too, and the rule is that nothing after the entry may enter the distance.
- **The What-if removes winners.** Stated plainly in the module header and in §6.10,
  because the whole value of the number is that it can come out against the trader — on
  a fixture in `counterfactual.test.ts` it does.
- **A per-pillar toggle is not the Gap's attribution.** The Gap bills each trade once, in
  priority order; a toggle asks "what if this habit had not existed", and a trade with
  two impurities is removed by both toggles. Every scenario therefore also reports what
  the Gap bills for the same trades, so the two can be read side by side.
- **A day opens at 24.0K** in the Replay. A day with no trades has nothing to fault, so
  that is where the first trade's `karatBefore` starts.
- **A tilt episode chains between consecutive impurities**, not inside a fixed hour:
  12:28 → 13:25 → 14:20 is one episode of three. Tilt does not reset on the hour.
- **The prop drawdown rule is terminal, the daily rule resets.** Counting every day after
  a 10% drawdown as a fresh breach turned one event into 58 on the demo account, which is
  a number that means nothing. It is now 10 daily-loss breaches and one drawdown breach,
  8 of the 10 in the opening phase — which is the story §11 planted.
- **A finding with no trade sample is tentative, not Weak.** `ea-same-bet` makes a real
  claim about a correlation, but not a claim about a mean R, so it carries
  `confidence: null` and never leads the Refinery.
- **Baselines exclude the window they judge.** A week compared against a history that
  contains it hides the change. The demo trader's last week is *inside* their own normal
  — they improved — so the report honestly says "nothing outside your normal this week"
  rather than manufacturing a finding.

**Performance**
The benchmark in `performance.test.ts` builds a synthetic 10,000-trade history (520
trading days, one trade in seven from an EA) and asserts `runEngine` finishes inside one
second. **Measured: 687 ms median of five runs** (663 · 671 · 687 · 701 · 717 ms) on the
development container. A second case asserts that 4× the trades costs under 10× the time,
which is the real guard: it is an alarm for an accidental O(n²), not a stopwatch.

Two things had to change to fit. Neither alters a formula:
- **`series.ts` walks the rolling window with two pointers** instead of re-filtering the
  whole account once per day. It was 414 ms of the 582 ms baseline at 10,000 trades and
  is now ~216 ms. `computeKarat` gained a `preWindowed` option, which only the series
  uses. The same trades are scored either way, and every Stage 2 series test still passes.
- **`rankHourWindows` no longer bootstraps.** Twenty-two overlapping windows is
  twenty-two bootstraps to publish one of them; it returns `tradeIds` and the finding
  that quotes the winner measures its own sample.

**Not built, on purpose**
No UI, no persistence, no AI — the UI decisions this stage produced are recorded against
their stages in §17 and stay there until those stages arrive. The Monte Carlo drawdown
band for EA Health is noted in §7 and belongs to Stage 6.

**`pnpm engine:report` — the new sections**
```
07 — EDGE MAP · CORRECTED ACROSS EVERY CELL
────────────────────────────────────────────────────────────────────────
  Cells                                 17 tested · 0 under 8 trades · BH at α 0.05
  Top 3 strengths                       
    London open                           70 trades ·   +1.4R · Strong   · q 0.001 · Session
    Asia after the open                   50 trades ·   +1.2R · Strong   · q 0.001 · Session
    Monday                                33 trades ·   +0.9R · Strong   · q 0.001 · Weekday
  Bottom 3 weaknesses                   
    In the news window                    65 trades ·   −1.0R · Strong   · q 0.001 · News proximity
    New York open                         50 trades ·   −0.9R · Strong   · q 0.001 · Session
    15–60 min from a release              23 trades ·   −0.7R · Strong   · q 0.010 · News proximity

08 — SIMILAR TRADES · ONE WORKED EXAMPLE
────────────────────────────────────────────────────────────────────────
  Target                                T-700766 · 2026-09-11 12:36 UTC · −1.0R · news, oversized
  Nearest 12                            3 won · 9 lost · −0.5R average · −$2,312.86
    confidence                          Moderate · n   12 · 95% CI  −1.1R →  +0.1R · win  25.0% (8.9%–53.2%) · p 0.109
    drawn from                          202 trades closed before it opened

09 — OUTSIDE YOUR NORMAL
────────────────────────────────────────────────────────────────────────
  Baseline                              203 trades before the last 7 days · 17 since
    Lot size                            median 0.50 lots · p90 1.13 lots · last 7 days 0.49 lots
    Risk per trade                      median 1.04% · p90 1.96% · last 7 days 0.67%
    Trades per day                      median 3.50 trades · p90 6.00 trades · last 7 days 3.00 trades
    Holding time                        median 22.00 min · p90 93.00 min · last 7 days 46.00 min
  Findings                              nothing outside your normal this week

10 — WHAT-IF · COUNTERFACTUAL, NOT A PROMISE
────────────────────────────────────────────────────────────────────────
  Method                                Removed trades are subtracted from the curve in close order. Nothing else is re-computed: no re-sizing, no margin, no compounding.
  Actual                                +$2,787.10 · +155.0R · closing equity $27,787.10
    Every impurity                      130 removed (42W/88L) · →  +$19,895.34 · delta  +$17,108.24 ·   +55.8R · gap bills −$26,700.37
    Revenge only                         32 removed (6W/26L) · →  +$10,852.61 · delta   +$8,065.51 ·   +25.5R · gap bills −$10,317.36
    Market conditions only               78 removed (15W/63L) · →  +$22,888.23 · delta  +$20,101.13 ·   +73.8R · gap bills −$23,501.08
    Oversized risk only                 109 removed (36W/73L) · →  +$15,095.20 · delta  +$12,308.10 ·   +30.8R · gap bills −$20,585.70
    Stops only                           20 removed (5W/15L) · →  +$10,673.32 · delta   +$7,886.22 ·   +37.2R · gap bills −$8,397.23
    Exit overruns only                   21 removed (0W/21L) · →  +$15,456.71 · delta  +$12,669.61 ·   +54.2R · gap bills −$12,123.40

11 — DISCIPLINE REPLAY · WORST TILT EPISODE
────────────────────────────────────────────────────────────────────────
  Episodes                              23 across 65 trading days · 21 days in the scored window
  Worst                                 2026-07-15 · 12:12–12:42 UTC · 30 min
    damage                              4 impurities · day Karat 24.0K → 7.1K (−16.9K) · −$1,322.12
      12:12   −1.0R  revenge, oversized
      12:16   −3.8R  news, noStop, exitOverrun
      12:25   +1.9R  revenge, news, noStop
      12:42   −2.6R  revenge, news, oversized, noStop, exitOverrun

12 — PROP CHECK · HISTORICAL ONLY
────────────────────────────────────────────────────────────────────────
  Preset                                Generic preset · 5% a day · 10% overall
  Breach days                           10 of 65 · daily loss 10 · overall drawdown 1
  First breach                          2026-06-23 · daily loss
  Worst                                 day loss 13.5% · drawdown 51.5%
    Revenge                             6 breach days · −$11,557.32
    Market Conditions                   4 breach days · −$6,552.85
  Note                                  Historical only. These are days that already happened, measured against a preset you set yourself — not a rule from any firm, and not a prediction.
```

### Stage 3 — The Assay dashboard ✅ (2026-09-22)

The first real surface. `/demo` renders the Assay over the demo account, server-side, from
`runEngine` alone. **No engine module changed**: all 339 Stage 2/2.5 tests pass untouched, and
every number on the page is read off `AssayResult` rather than computed in a component (§16).

**Routes**
- `app/demo/page.tsx` — the Assay. `dynamic = 'force-static'`, so the generator and the engine
  run once at build time and the route is served as static HTML.
- ~~`app/demo/loading.tsx`~~ — removed after Stage 3.5: a loading boundary hid the prerendered
  page from readers without JavaScript (see the Stage 3.5 notes).
- `app/(marketing)/page.tsx` — `redirect('/demo')` until the landing lands in Stage 10. It sits
  in the marketing group so Stage 10 replaces it rather than working around it.
- `app/icon.svg` — the dial in miniature (obsidian face, gold scale, hand at 23K).
- `lib/demo/assay.ts` — `getDemoAssay()`: generate, run the engine at `asOf = DEMO_END_MS`,
  memoise. **Never the clock** — a demo whose score drifts as the deploy ages is a bug with a
  story.

**Components**
- `components/app/` — `AppShell` (header, nav, account, period, the permanent "Demo data" badge,
  footer) and `PrimaryNav`.
- `components/viz/` — `AssayDial`, `PillarRings`, plus the two pure modules the tests aim at:
  `dial.ts` (angles, tier arcs, ticks, the alt text) and `rings.ts` (ring thresholds).
- `components/assay/` — `AssayScreen`, `KaratCard`, `GapCard`, `RefineryCard`, `ProofCard`,
  `ExplainProvider`, `ExplainDrawer`, `ExplainButton`, and `explain.ts`, which builds every
  explanation server-side.
- `components/ui/CountUp.tsx` — the mechanical counter.

**39 new Vitest cases** across four files (`dial.test.ts`, `rings.test.ts`,
`AssayDial.test.tsx`, `app/demo/page.test.tsx`). **378 tests in total, all passing.** The render
test reads its expected values out of `getDemoAssay()`, so it asserts the screen shows *the
engine's* number, never that the number is any particular one — that is the engine's own tests'
job. `vitest.config.ts` now also collects `components/**` and `app/**`.

**Decisions taken**
- **The page is a server component; only four things are client code** — the dial's sweep, the
  counters, the Gap's period toggle and the Explain drawer. The browser is handed the props each
  visual needs, never the `AssayResult`: it holds 834 enriched trades, and the Assay draws six
  pillars and three findings.
- **Everything the drawer shows is pre-formatted on the server.** `explain.ts` emits strings, so
  `lib/format.ts` stays the one place decimals are decided (§16) and no engine code ships to the
  browser.
- **The dial is a sector dial, not a gauge.** The readout sits on a centre medallion and the hand
  passes *behind* it, so the Karat value is never crossed by a moving part. The hand is therefore
  drawn only in the annulus between the medallion and the scale.
- **The server renders the hand at its final angle**, and the sweep snaps it back to 0K on mount
  before easing up. A reader without JavaScript is shown the score, not a dial reading zero. The
  counters work the same way: the markup is correct before any script runs.
- **The count-up writes `textContent`, not state.** The value never changes except when a prop
  does, so driving 60 fps through React would re-render the tree for nothing.
- **Tier arcs are painted in the gold family only** — gold-deep at low opacity for Raw Ore,
  brightening to gold-light at 24K. §9 reserves jade and oxblood for P&L, and a tier is not a P&L.
- **The Karat Gap bar is oxblood throughout, shaded per pillar.** The Gap is a loss; four
  unrelated hues would make a bill look like a palette. The legend carries the identification.
- **Your Proof diverges from a centre line.** The two numbers usually have opposite signs and the
  whole point of the card is the distance between them.
- **The drawer unmounts when closed** rather than hiding, so its content is never in the tab
  order by accident. Focus moves in on open and returns on close, Tab is trapped, Esc closes,
  and the page behind it is locked from scrolling.
- **The surfaces that do not exist yet are shown, not hidden** — Ledger, Vault, Constellation and
  Wrapped are `aria-disabled` spans with the stage they arrive in, never links that 404.
- **The header is true obsidian, not a translucent panel.** A blurred overlay over a warm-black
  page reads grey. Verified in the browser: `body` computes to `rgb(10, 10, 12)` and a card to
  `rgb(17, 17, 20)` — exactly `--bg` and `--surface-1`.

**Two bugs fixed on the way, both outside Stage 3's own code**
1. **The `sheen` utility left the wordmark invisible for most of its cycle.** One gradient layer
   with `background-clip: text` and `background-repeat: no-repeat` means transparent glyphs
   wherever the gradient is not. It is now two layers — a solid gold base that never moves and a
   highlight sweeping across it — and the keyframes animate only the highlight's position.
2. **`/demo` logged a 404 for `favicon.ico`**, which cost 4 points of Best Practices. `app/icon.svg`
   declares a real icon and the request stops.

**Lighthouse** (Lighthouse 13.5, production build, `next start`, headless Chromium)

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Desktop | **100** | **100** | **100** | **100** |
| Mobile | **96** | **100** | **100** | **100** |

Desktop FCP 0.3 s · LCP 0.6 s · CLS 0.006 · TBT 0 ms.
Mobile FCP 0.9 s · LCP 2.7 s · CLS 0.004 · TBT 90 ms.

`pnpm lighthouse` re-runs the desktop pass against a local `next start`; point it at `/demo` on
whatever port is serving. Lighthouse is a dev dependency only — nothing in the table above is a
claim the product makes to a trader, and per §17 Stage 11 these numbers belong in the README,
never in the app.

**Verified in a real browser** (CDP, not just in tests): no horizontal scroll at 375 px or
1440 px (`scrollWidth === clientWidth` at both), the drawer opens from the dial, a pillar ring,
a Gap line and a finding, Esc closes it, and focus returns to the number that opened it.

**Not built, on purpose**
No Gold Clock, no Purity Line, no Vault, no Ledger — those are Stages 4 and 5, and the nav says
so. No AI copy: the Refinery shows the engine's own templated headlines, which is what §2 means
by the product working fully without a model.

**Left standing, for the product owner to call**
`/styleguide` is still there. §0's note says it goes "once the real surfaces exist", and the
Assay is the first one — but it is also the only one, and the styleguide is still the only place
`Table`, `Badge` and `Button` are exercised. Suggest deleting it at Stage 5, when the Ledger
gives the table primitives a real home.

### Stage 3.5 — The Assay instrument ✅ (2026-09-22)

Craft and staging only. **No engine change, no new metric, no new data**: `lib/` is untouched,
and every figure on `/demo` is the one Stage 3 showed, or (the bullion bars) one the engine
already computed in `counterfactual.ts`. 410 tests pass, lint and typecheck are clean.

**What exists now**
- `components/assay/AssayInstrument.tsx` — the instrument (§8): the dial, the six sub-dials
  wired to it, the reserved outer ring, hover summaries and the in-place pillar explanation.
  It replaces `KaratCard` and `PillarRings.tsx`, which are deleted.
- `components/viz/instrument.ts` — pure: sub-dial placement (clock hour → stage percent, label
  side, summary side, arm endpoints, focus pull), the reserved ring's radii, and the arrival
  timeline (`ARRIVAL`, `tierArcBeat`, `ringBeat`, `beatStyle`).
- `components/viz/AssayDial.tsx` — rewritten for material: three-layer bezel, face depth,
  guilloché, sheen, applied indices, faceted hand with counterweight and shadow, raised
  medallion, polished cap. No `useEffect` any more — the sweep is CSS.
- `components/ui/Scene.tsx` — a section that marks itself `data-inview` the first time it is
  seen, once; `useSceneInView()` lets the counters wait for it.
- `components/assay/RefineryScene.tsx`, `GapScene.tsx`, `ProofScene.tsx` — scenes 02–04,
  replacing `RefineryCard`, `ProofCard` and the Gap card's place in the old grid.
  `GapCard` stays as the bill beneath the bullion bars, its figure set at 36 px.
- `components/assay/ExplainBody.tsx` — the drawer's content, extracted so the drawer and the
  instrument render one `ExplainEntry` identically.
- `explain.ts` gained `pillarScopeLabel`, `scopeNote`, `historyPeriodLabel`,
  `findingPeriodLabel` and a `what-if` entry for the bars; `ExplainEntry` gained `scopeNote`;
  `ExplainProvider` gained `get(id)`.
- `app/globals.css` — the arrival system (below), a static `metal-gold-text`, and a wordmark
  sheen that is opaque at every instant.
- 32 new Vitest cases: `instrument.test.ts` (geometry and timing, hand-checked), `explain.test.ts`
  (scope labels, the shared sentence, the What-if entry against the engine), and additions to
  the page and dial render tests. **410 tests in total.**

**Decisions taken**
- **Motion is declared in CSS, not driven from React.** Every entrance is an `enter-*` class
  with its beat as `--d`/`--t` inline. The keyframes exist only inside
  `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`, and are held on
  their first frame until the scene is `data-inview`. So the server markup *is* the finished
  instrument: with reduced motion there is literally no animation on the page (verified:
  `document.getAnimations()` is empty), and the hand's inline `rotate(124.875deg)` is the
  truth the animation sweeps up to. Nothing loops except the wordmark's glint.
- **Luxury reads as stillness.** `metal-gold-text` no longer shifts forever; the Karat numeral is
  lit metal, not a screensaver. The wordmark's sheen passes in the first quarter of a 9 s cycle
  and rests for the rest.
- **The wordmark can no longer go transparent.** Both background layers are opaque everywhere —
  the highlight layer is gold at both ends and tiles, the base under it is solid gold, and
  `color: var(--gold)` is the fallback. Sampled across a cycle in Chromium: the glyphs hold the
  same gold pixel count in every frame.
- **The hand passes behind the medallion, and the cap sits on it.** A centre cap and a readout
  both at the pivot collide, so the readout is set the way a watch dial sets text round its
  pinion: the value above the cap, tier and delta below. The blade shows in the annulus, the
  counterweight opposite it.
- **Large blurs are gradients.** The rim shadow, the sheen and the medallion's cast shadow were
  first built with `feGaussianBlur` over most of the face, which made every repaint of the dial
  expensive — a hover summary fading in over it visibly lagged in software rendering. They are
  radial gradients now, and the dial sits on its own compositor layer (`will-change`), so
  nothing passing over it forces a repaint of the guilloché.
- **SVG text takes the serif through the `font-serif` utility.** `var(--font-serif)` in a
  presentation attribute resolved to nothing — `@theme inline` inlines that token rather than
  emitting it — so the Stage 3 dial numerals had silently been set in the sans. Fixed on the
  dial and the Refinery numerals.
- **Hover summaries open towards the instrument**, over the dial's edge if they must. Opening
  outward would run a left-hand summary off the screen at 1280 px.
- **The in-place explanation takes focus**, and focus returns to its sub-dial on Esc, on the
  close button, or on the centre of the dial. It is a disclosure, not a dialog: the page stays
  usable, so there is no focus trap.
- **Every pillar value says `30-day · recency-weighted`; every finding says its period.** The
  sub-dials print it, their accessible names carry it, the pillar drawer's caption starts with
  it, and the finding caption ends `90 days · 2026-06-22 → 2026-09-20 · unweighted`. Both
  drawers carry one sentence on why the two can disagree. The window length is read from
  `settings.rollingWindowDays`, not written in.
- **The counterfactual bar is the 24K bar.** Pure, bright metal for "every impurity removed",
  the alloy for the actual result; lengths proportional to the value (floor 20%), a hollow
  outline for a result below zero. The metaphor is purity, not size, so it holds for an
  account that would come out worse.

**Lighthouse** (production build, `next start`, headless Chromium)

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Desktop | **100** | **100** | **100** | **100** |
| Mobile | **93–98** | **100** | **100** | **100** |

Mobile over two runs: FCP 0.9–1.0 s · LCP 2.1–2.8 s · TBT 120–180 ms · CLS 0.004. TBT is up
from Stage 3's 90 ms — the instrument is client code, where the pillar rings were not.

**Verified in a real browser** (Puppeteer on Chromium): the arrival plays in order frame by
frame; hover shows the summary and lights the arm; select transforms in place and moves focus to
the explanation; Esc and the centre both restore and return focus; the Karat still opens the
drawer; the finding drawer shows the scope sentence; no horizontal scroll at 375 px or 1440 px;
the stacked phone layout opens the explanation under the grid.

**Resolved after review (2026-09-22), both at the product owner's call**
1. **`app/demo/loading.tsx` is deleted.** It made Next stream the prerendered page into a
   `<div hidden>` that only an inline script revealed, so `/demo` without JavaScript showed
   "Assaying…" instead of the Assay. The route is static and needs no fallback; the page test
   now fails if the file comes back. "Assaying…" still lives where it means something: the
   dial's own not-enough-trades state.
2. **§6.10 is reworded.** It said the Gap is "always the smaller" number; on the demo it is the
   larger ($26,700.37 billed against a +$17,108.24 What-if difference for the same trades,
   because the What-if also removes 42 winners). The spec now says neither is the smaller by
   rule, and why. The page says it in one sentence, `GAP_VS_WHAT_IF`, shared by the Gap drawer,
   the What-if drawer and the Gap card, and the two engine comments that repeated the old claim
   (`lib/engine/counterfactual.ts`, comments only — no code) now agree with it.

### Stage 4 — The Ledger, Hallmarks and the Trade Dossier ✅ (2026-09-23)

A content stage: **no engine change**, no redesign. `lib/engine/` is untouched — every
figure on the two new surfaces is an `EnrichedTrade` field or the output of an engine
function the Assay already uses (`attributeCost`, `findSimilarTrades`, `entryVolatilities`,
`newsBucket`, `sessionsAt`). The Ledger reuses `Card`, `Label`, `SectionHeading`, `Badge`, the
table idiom and the editorial rhythm (`02 — The Ledger`, Dossier sections `01`–`03`).

**Stages reordered at the product owner's call.** This stage was Stage 5; the old Stage 4 is now
Stage 5 (Purity Line + Vault), and the **Gold Clock moved to Stage 11**, the final design pass.
The Assay's reserved outer ring is untouched and still empty. The nav's stage hints follow.

**Routes**
- `app/(app)/ledger/page.tsx` — `force-static`. Rows are built at build time and shipped to one
  client component. The prerendered HTML is the default view (all trades, newest first, page
  one) — the real table, readable without JavaScript.
- `app/(app)/trade/[id]/page.tsx` — rendered on request, because the Ledger's filter travels in
  the query string and decides previous / next. Everything it reads is memoised per process
  (`lib/demo/dossier.ts`), so a request is one Similar Trades search and one fold of M1 bars.
  Unknown ids 404. Both routes read the demo until Stage 8 and carry the "Demo data" badge.

**What exists now**
- `lib/ledger/` — `types.ts` (the `LedgerRow` shape + `rowHallmark`, browser-safe), `rows.ts`
  (server: `EnrichedTrade` → row, deal tickets joined from the raw positions), `query.ts`
  (URL parse/serialize, filter, sort, pages, `adjacentRows`, `dossierHref`), `summary.ts`,
  `csv.ts`, `keyboard.ts` (the key map as a pure function), `pack.ts` (columnar wire format),
  `labels.ts` (impurity and session words — `explain.ts` now imports them from here).
- `components/viz/hallmark.ts` + `Hallmark.tsx` + `HallmarkLegend.tsx`.
- `components/ledger/LedgerScreen.tsx`, `useLocationSearch.ts`.
- `components/dossier/dossier.ts` (server view builder, strings only, like `explain.ts`),
  `DossierScreen.tsx`, `PriceChart.tsx`.
- `lib/demo/assay.ts` now memoises the generated dataset too (`getDemoDataset`);
  `lib/demo/ledger.ts`, `lib/demo/dossier.ts`, `lib/demo/candles.ts` (M1 → candles).
- `lib/format.ts` gained `formatDuration`, `formatLots`, `formatPrice`.
- `lightweight-charts` 5 added (Apache-2.0; its attribution logo is kept on the chart).
- Nav: `PrimaryNav`/`AppShell` take `current`; the Ledger is a real link on every page and is
  lit on the Ledger and the Dossier. Vault, Constellation and Wrapped stay dimmed.
- **114 new Vitest cases, 524 in total, all passing**: Hallmark geometry, determinism and
  distinguishability; filter, search and sort; URL round trip; summary against the engine; CSV
  contents against the filter; the key map; the row packing; candles; the Dossier builder; and
  render tests for `/ledger` and `/trade/[id]`.

**The Hallmark** (§8.6) — one ring per dimension, outside in, so no two dimensions share a mark:
bezel = SL compliance (solid / broken = widened / dotted = none) · outer arcs = session (Asia at
10 o'clock slate, London at 2 gold, New York at 6 bronze, lit when the entry fell in it) · a pip
at 12 = news (filled in the ±15 min window, hollow at 15–60 min, absent when clear — the engine's
§6.8 bucket) · inner arc = risk % (clockwise from 12, a tick at the limit, brighter past it, full
at 3×) · hand = holding time (log scale, 1 min at 12, 1 day at 11) · centre disc = R (radius
grows to 3R; jade or oxblood, §9). Strokes and fills only, ≤ 12 elements, coordinates rounded
to 0.01 so the same trade draws the same bytes. **All 834 demo trades draw 834 distinct glyphs.**
Every glyph carries `role="img"`, a `<title>` and an `aria-label` in words.

**Decisions taken**
- **Paginate, fifty a page, rather than virtualise.** Pages are URL state like everything else,
  the prerendered page is real HTML, and the keyboard crosses page boundaries by itself (↓ on
  row 50 turns the page; Home / End jump to the first / last row of the whole filter).
- **URL state without `useSearchParams`.** `useSyncExternalStore` over `location.search`, with
  `''` as the server snapshot: the static page renders the default view and a linked view
  takes over on hydration, with no Suspense fallback and no hydration mismatch. Writes use
  `history.replaceState` — a filter change is not a navigation; Back leaves the Ledger.
- **The default view is 90-day, all sources, newest first.** "30-day" is the Karat's window
  (the 30-day manual filter holds exactly the 77 trades the Karat scores — asserted).
- **EA trades are listed, and their engine flags shown**, because the engine measured them —
  but the Dossier says plainly that EA trades are outside the Karat Score and the Gap, and bills
  none of their reasons.
- **Selection is focus.** ↑/↓ moves real focus to the row's link (so Enter is the link's own,
  and a screen reader reads the row's name), marks the row with a gold hairline, scrolls it into
  view, and a polite live region says "Row 3 of 834 selected". Shortcuts never fire inside a
  field; in the search only Enter, Esc and ↓ mean anything. `?` opens a native `<dialog>`.
- **Search is a filter.** It matches position id, either deal ticket or the trade id, exact or
  partial (`T-700766`, `#700766`, `0766`). When exactly one trade matches, Enter opens it. When
  the other filters hide a match, the hint says so and offers to clear them.
- **The summary strip is counts and sums**, `summarizeRows`, over rows the engine measured —
  no new metric. Win rate counts a scratch trade as neither.
- **CSV is for a spreadsheet**: RFC 4180 quoting, CRLF, UTC ISO times, fixed-decimal plain
  numbers with an ASCII hyphen, `;` inside the sessions and impurities cells, every filtered
  row across all pages, `kavrix-ledger-<30d|90d>-<YYYYMMDDTHHmmssZ>.csv` stamped at export.
- **Rows travel packed.** 834 row objects were 418 KB of JSON escaped into the page, and the
  first mobile Lighthouse run was 87 (TBT 460 ms). Columns, with enums as indexes and sets as
  bitmasks, are 104 KB and round-trip losslessly (asserted); with `content-visibility: auto` on
  the table card the page went from 659 KB to 289 KB and mobile to 95–98.
- **One bill, one reason.** The Dossier calls the Gap's own `attributeCost`, so exactly one of
  a trade's reasons is "Billed to …" — for the same money the Gap counts — and every other
  reason says why not (priority order, Stops has no line, winners cost nothing, EA trades are
  outside). An overtrading day is shown as its own card, marked as a day, not a trade.
- **Similar Trades is the engine's call**, `findSimilarTrades` for this trade with the account's
  entry volatilities — for the costliest impurity it returns exactly the neighbours and headline
  `runEngine` computed (asserted). The Dossier checks the no-hindsight rule rather than quoting
  it: the "All 12 closed before this trade opened" line is only printed when it is true.
- **Candles come from the demo's own M1 path**, folded to the smallest of M1/M5/M15/M30/H1 that
  fits the trade plus context (its own length either side, 45 min – 6 h) in ≤ 180 candles,
  UTC-aligned, weekend minutes skipped. Session bands and news columns are full-height histogram
  series behind the candles; release labels sit on the time axis in an HTML row that follows
  `timeToCoordinate`. Colours are read from the §9 tokens at runtime. The library is imported
  on mount, the box has a fixed height (CLS 0), and a figcaption gives the chart in words.
- **Previous / next walk the Ledger's filter and sort**; "back" returns to the page the trade is
  on. A trade outside the filter it was opened from falls back to the whole Ledger, and says so.

**One test-infrastructure change.** The engine's 1-second benchmark (`performance.test.ts`)
failed whenever the whole suite ran in parallel on this 4-CPU container — **on the Stage 3.5
commit too** (1,035–1,194 ms), while passing alone. It was timing the container. `vitest.config.ts`
now runs it as its own project after every other file (`sequence.groupOrder`). The threshold and
the test are untouched.

**Lighthouse** (Lighthouse 13.5, production build, `next start`, headless Chromium)

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| `/ledger` mobile | **98** (two runs) | **100** | **100** | **100** |
| `/ledger` desktop | **100** | **100** | **100** | **100** |
| `/trade/T-700766` mobile | **97** | **100** | **100** | **100** |
| `/demo` mobile | **96** | **100** | **100** | **100** |

`/ledger` mobile: FCP 1.0 s · LCP 2.1 s · TBT 80–90 ms · CLS 0.

**Verified in a real browser** (puppeteer-core on Chromium): ↓/↑/Home/End move the selection,
End turns to page 17 and Home back to 1; `/` focuses the search, typing narrows it to one match
and offers Enter; Esc clears, Esc again returns focus to the selected row; filters and sort
write the URL and survive a reload; Enter opens the Dossier with the filter carried; the CSV
downloads with the filtered rows; `?` opens the shortcuts and Esc closes them; the chart draws
with its news ticks; no horizontal scroll at 375 px on either page; no console errors.

**Not built, on purpose**
No Vault, Purity Line or Gold Clock (Stages 5 and 11). No AI copy. No bars for real accounts —
the connector sends deals, not prices, so the Dossier chart is demo-only until a bar source
exists (noted in `ROADMAP.md`).

**Left standing, for the product owner to call**
`/styleguide` still exists. The Ledger now gives `Table`-style markup a real home, so it can go —
but deleting it is outside this stage's brief.

### Stage 5 — The Vault, the Discipline Replay and the Purity Line ✅ (2026-09-23)

A surfaces stage: **no engine change** — `git diff` on `lib/engine/` is empty. Every figure on
the three new surfaces is an `AssayResult` field or the output of an engine function the
engine already exports (`computeReplay`, `worstTiltEpisode`, `GAP_PILLAR_LABELS`). The Assay's
four scenes and the Ledger are untouched apart from the nav link; the new work reuses the
scene system, `SectionHeading`, `Label`, the `enter-*` choreography and the engraved pills.

**Routes**
- `app/(app)/vault/page.tsx` — `force-static`. The shelves are real HTML before any script
  runs; the open replay is read from `?day=YYYY-MM-DD` as the page hydrates (the Ledger's
  `useLocationSearch`, reused), and written with `replaceState`, so a replay is linkable and
  Back still leaves the Vault.
- `/demo` gains `05 — The Purity Line`, below Your Proof.
- Nav: **Vault is a live link everywhere**, lit on `/vault`. Constellation and Wrapped stay
  dimmed.

**What exists now**
- `components/vault/vault.ts` — the view builder and every pure helper the tests aim at:
  `ingotFill`, `ingotBody`/`ingotBand` (geometry), `karatTone`, `buildShelves`,
  `monthSummary`, `moveDate` (the key map), `karatX`/`replaySegment` (the running-Karat
  lane), `tiltSpans`, `buildReplayDayView`, `buildVaultView`. Type-only engine imports.
- `components/vault/VaultScreen.tsx` (client) — shelves, day cells, hover detail, keyboard,
  URL state, the replay panel. `components/vault/Replay.tsx` — the Discipline Replay.
- `components/viz/purity.ts` — scales, axis ticks, decimation, paths, and `purityColor`
  (Karat → the gold family). `components/assay/purity.ts` — `buildPurityView`,
  `scenarioEquity`, `purityLayers`. `PurityScene.tsx` (server) + `PurityLine.tsx` (client).
- `lib/demo/vault.ts` — `getDemoReplay()` and `getDemoVault()`, memoised.
- `lib/dates.ts` — English calendar words for UTC day keys, without `Intl`, so the server and
  every browser print the same date.
- `app/globals.css` — `enter-drop` (revealed top to bottom, in the scene system), `wipe-in`
  (a What-if series drawn on toggle), `vault-shelf` (the ledge).
- **60 new Vitest cases, 584 in total**: ingot fill and colour mapping, band geometry, shelves
  across month boundaries, month summary, the key map, replay order and running Karat against
  a hand-worked fixture (24.0 → 22.8 → 23.2K), the lane's continuity, tilt-span placement,
  the purity colour ramp, scales and decimation, the "every impurity" curve against the
  engine's own `counterfactualEquity`, every scenario ending on its own `endEquity`, the
  What-if toggle switching series, and render tests for `/vault`, a replay day, its empty
  state, and the Purity Line on `/demo`.

**Decisions taken**
- **The Vault replays the whole history.** `runEngine` replays only the scored window by
  default and its own comment says the Vault asks for other days on demand — so the demo
  layer calls the engine's `computeReplay` over every day, with the Assay's trades and
  settings. Nothing is recomputed: the Vault's day Karat and the Replay's agree on all 65
  days (asserted).
- **An ingot is the whole account; its engraving is the trader.** The fill is
  `stats.calendarDays.netMoney`, EAs included, exactly as the engine's comment says the Vault
  shows it; the engraving is the day Karat, manual only. The page subtitle, the hover detail
  ("14 · 5 manual") and the Replay's footnote each say which is which.
- **Fill is linear in money against the largest day**, from a midline: jade up, oxblood down,
  a floor of 8% so a day that moved is never drawn empty. The worst day of the history fills
  its half of the bar. A square-root scale would have flattered the small days; honest won.
- **The engraving is struck by tier, in the gold family**: gold-light at 22K and up, gold at
  18K, then text-2 and text-3. A tier is not a P&L, and a dull engraving still passes AA.
- **Seven columns, Monday first, weekends included.** Weekends are empty slots — the calendar
  is a calendar — and the columns line up on every shelf. Slots outside the history
  (1–21 June) are not drawn at all rather than shown as quiet days.
- **Every day of the history is a button**, quiet days included, so the arrows move by day
  and by week without skipping, and a quiet day opens the Replay's empty state. One tab stop
  (roving `tabindex`), Home/End to the ends, Enter opens, Esc closes from anywhere and returns
  focus to the day.
- **The replay does not steal focus when it is already on screen.** Beside the calendar (≥
  1280 px) focus stays on the day so the arrows keep walking the week; below the fold (a
  phone) the panel scrolls into view and its heading takes focus. A polite live region
  announces each opened day either way.
- **The running Karat is a lane, not a column of figures.** Each row draws its own stretch of
  the line — in at the top at the Karat before, down to the Karat after by the middle, out at
  the bottom — so rows of any height join into one continuous line (asserted), and a
  collapse reads as a fall across the lane. 24K at the right edge, faint guides at 14/18/22K.
- **A tilt span brackets from the first impurity to the last**, clean trades inside it, with
  a header row carrying start–end, duration, count, Karat before → after, the drop and the
  Gap's cost. "Worst of the day" only appears when a day has more than one episode; "Worst in
  the history" marks the engine's `worstTiltEpisode` (15 July, 12:12–12:42, −16.9K).
- **One value scale for every Purity series**, so switching the What-if on never moves the
  actual line. The cost is headroom: the market-conditions scenario ends near $48k, so the
  account itself uses roughly the lower half of the plot.
- **The What-if curves are subtraction, and that is the engine's own method.** Each scenario's
  curve is the actual equity minus the running total of its `removedTradeIds` — the V1 linear
  method, and why the engine ships those ids. The "every impurity" curve matches the engine's
  `counterfactualEquity` point for point, and every end figure printed is the scenario's own.
- **"Counterfactual, not a promise" is printed whether the What-if is on or off**, with the
  method line beneath the chart; each scenario also says what the Gap bills for the same
  trades, because the two are not supposed to match (§6.10).
- **Paths in whole plot units.** Seven curves at one decimal were 91 KB of view; whole units
  (≈ 1 px at any width drawn), plus a first/low/high/last decimation per bucket, are 60 KB
  and look the same. Stamps carry no `href` — it is derived from the id.
- **The stamps are one tab stop**, arrows walk them in close order; hover or focus shows time,
  R and reasons, Enter or click opens the Dossier.

**Lighthouse** (Lighthouse 13.5, mobile, production build, `next start`, headless Chromium)

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| `/vault` mobile | **96** (two runs) | **100** | **100** | **100** |
| `/demo` mobile | **94–98** | **100** | **100** | **100** |

`/vault` mobile: FCP 1.0 s · LCP 2.7–2.8 s · TBT 60–70 ms · CLS 0.
`/demo` mobile: FCP 1.2–1.3 s · LCP 2.3–3.0 s · TBT 80–90 ms · CLS 0.004.

**Verified in a real browser** (Playwright on Chromium): hover shows a day's detail; Enter
opens the Replay and writes `?day=`; → and ↑ move by a day and a week across month shelves;
Esc closes, clears the URL and returns focus to the day; the What-if toggle and each
per-pillar scenario draw their curve and difference; a stamp's tooltip shows time, R and
reasons; no horizontal scroll at 375 px or 1440 px on either page; no console errors. Under
`prefers-reduced-motion`, `/vault` with a replay open has no animations at all.

**One test note, not a change.** The engine's 1-second benchmark (`performance.test.ts`)
measured 1,005–1,082 ms on this container (three runs alone, all over), **and failed at
1,033 ms on the untouched Stage 4 commit** before passing twice there — the same container
timing Stage 4 recorded. `lib/engine/` is unchanged and so are the threshold and the test;
it is recorded here rather than loosened. The final full run passed it, 584 of 584.

**Not built, on purpose**
No Gold Clock (Stage 11), no Constellation, no AI copy. No per-day P&L source toggle in the
Vault (manual-only fills) — it would be a second definition of a day; noted in `ROADMAP.md`.

**Left standing, for the product owner to call**
`/styleguide` still exists (see Stage 4).

### Vault redesign — bullion ingots and the Day Assay ✅ (2026-09-23)

A redesign pass on the Vault, inside Stage 5. **No Karat, Gap or Replay formula changed** — the
one engine addition is `lib/engine/dayStory.ts`, which only arranges numbers the Replay and the
Gap already produce.

**What exists now**
- `lib/engine/dayStory.ts` — `dayStory({ day, trades, calendar, settings })` → the running day
  Karat per trade (with its impurities), the running P&L in close order, the day's high-impact
  USD releases, the Gap's receipt for the day (`attributeCost`, so it agrees with the Gap), and
  **chapters** `{ id, kind, number, title, from, to, tradeIds, sentences: [{ text, links:
  [{ phrase, tradeIds }] }] }`. `chapterRanges` is the pure structure underneath.
- `components/viz/ingot.ts` + `Ingot.tsx` — the bar's geometry (rounded two-face silhouette,
  reflection, strip), tier → metal, `assayStrip`; `IngotDefs` holds the six tier gradients, the
  sheen, one clip, the reflection mask and the shelf gradients, once per page.
- `components/vault/dayAssay.ts` (view + `sentenceParts`), `dayChart.ts` (D3 polylinear folded
  time scale, step paths, bands, zoom window), `DayAssay.tsx` (the panel). `Replay.tsx` is gone.
- `d3-scale` and `d3-shape` added (ISC) — used on `/vault` only.
- New and rewritten Vitest cases (45 more than Stage 5’s 584): hand-checked `dayStory` for a clean day, a one-trade day and **25 June
  2026** (tilt 12:20–12:47, recovery at 17:00; receipt $718.18 + $1,418.76 + $69.88 =
  $2,206.82), plus every demo day covered once; chapter ranges; ingot geometry and strips; the
  folded axis; the Vault view; render tests. **629 tests in total, all passing.**

**Decisions taken**
- **Chapters are rules, and there are five.** The open (before the first impurity), each tilt
  (§6.11 episode, clean trades inside it included), recovery (after a tilt, to the next tilt or
  the end), and the close (clean trades after the last slip). The brief's four leave one case
  unnamed — impurities that never chain into a tilt — so it gets **The slip**. Every trade is in
  exactly one chapter (asserted over all 65 demo days).
- **Sentences are templates over engine numbers**: counts of trades, clock times the trades carry,
  day Karats the Replay printed, sums of P&L and Gap cost. At most two a chapter; the impurity
  list names the three largest kinds and says "mostly" when it left some out. A news phrase names
  its release (`4 entries in the 12:30 USD news window`).
- **Strips measure against the month, not the history.** A quiet month still shows its shape; the
  month's largest day fills its lane.
- **The Karat line tarnishes by trade**: each step is set by one trade and drawn in that trade's
  state, over a slate band where impure trades were open. Never red — oxblood marks losing closes
  only.
- **Markers sit at the close on the P&L line; Karat steps at the entry**, because an impurity is
  decided at entry and money at the close.
- **Gaps longer than 45 minutes fold to a 14px break**; a release is drawn if it falls within an
  hour of a trade.
- **Esc is two-step inside the panel**: the first lets go of a highlight, the next closes. ← and →
  inside the panel step to the nearest trading day; in the calendar an open Day Assay follows the
  selection.
- **Below 1280px the Day Assay is a bottom sheet** (backdrop, page scroll locked, focus on its
  heading); beside the calendar it is sticky and focus stays on the day.

**Lighthouse** (mobile, production build): `/demo` **94** · 100 · 100 · 100, `/vault` **93** · 100 ·
100 · 100 (TBT 140 ms, CLS 0). `/vault?day=2026-06-25` desktop 100 · 100 · 100, CLS 0.

**Verified in a real browser** (Playwright on Chromium): hover tooltip, tap opens the sheet on a
375px touch viewport with no horizontal scroll, arrows and the panel's ← → move days, a phrase
zooms and dims, hovering a mark lights its chapter, Esc twice restores then closes, the shelf
sweep plays once per month, and under `prefers-reduced-motion` the page has no animations.

