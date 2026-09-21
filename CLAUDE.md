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

---

## 7. EA Health — Fineness (‰)

Per EA (grouped by **magic number**), shown in **Constellation**.

- Metrics: trades, net R, profit factor, expectancy (R), max drawdown, recent-20 expectancy.
- **Baseline** = user-entered backtest expectancy, else the EA's first 50 live trades.
- **Fineness** (0–999.9‰) = 1000 × (0.40 expectancy stability + 0.30 drawdown vs baseline
  + 0.20 consistency + 0.10 execution quality [spread/slippage]). Each component 0–1.
- Labels: ≥ 995 Fine · ≥ 950 Standard · ≥ 900 Watch · < 900 Degraded.
- **Drift alert**: recent-20 expectancy more than 2 standard errors below baseline.
- **Correlation**: Pearson correlation of daily P&L between EAs; ≥ 0.6 → flag "same bet".

---

## 8. Visualizations (signature components — build exactly these)

All are custom SVG React components in `components/viz/`, driven by engine output only.

1. **AssayDial** — watch face. Guilloché background, gold bezel, 0–24K scale over a 270° arc,
   tier arc segments, serif numerals at 0/10/14/18/22/24. Gold hand sweeps from 0 to the value
   on mount (~2.6 s, eased). Center: Karat value (serif, gold), tier label, delta vs last week.
2. **PillarRings** — six small rings (points / max) under the dial; click → pillar deductions.
3. **GoldClock** — 24h radial dial (UTC). Angle = entry time; radius = R result (0R ring dashed).
   Session arcs (Asia slate, London gold, New York bronze) outside the dial; dashed amber lines
   for high-impact USD news; jade/oxblood dots fade in sequentially. Center shows best window.
4. **PurityLine** — equity curve as a gold line whose brightness/saturation = rolling Karat
   at that point (bright gold = disciplined, dull = impure). Impurity trades marked with small stamps.
5. **Refinery** — two bullion bars: actual P&L vs 24K counterfactual; gap segmented by pillar.
6. **Hallmark** — a unique 32 px radial glyph per trade encoding 6 dimensions: R result, risk%,
   duration, session, news proximity, SL compliance. Deterministic from trade data. Used in the Ledger.
7. **VaultCalendar** — each day is a small ingot filled by daily P&L, engraved with the day's Karat;
   months as vault shelves.
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
  viz/                        AssayDial, PillarRings, GoldClock, PurityLine, Refinery,
                              Hallmark, VaultCalendar, Constellation, AssayCertificate
  ui/                         primitives (Card, Label, Stat, Button, Table)
lib/
  engine/                     trades, sessions, news, karat, gap, proof, fineness, correlation
  demo/                       deterministic generator
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
- [ ] 2 — Analytics engine + Karat + tests
- [ ] 3 — Assay dashboard (Dial, Pillars, Gap, Refinery, Proof)
- [ ] 4 — Gold Clock + Purity Line + Vault
- [ ] 5 — Ledger + Hallmarks + Trade Dossier
- [ ] 6 — Constellation (EA Health, Fineness, correlation)
- [ ] 7 — Wrapped + Assay Certificate export
- [ ] 8 — Auth + ingest API + Kavrix Connector EA
- [ ] 9 — AI explanations
- [ ] 10 — Cinematic landing
- [ ] 11 — Polish, README with architecture diagram, deploy

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
- `lib/demo/generate.ts` — the account: 220 manual trades, 616 EA trades,
  1,672 deals, 10 SL/TP modifications.
- `lib/demo/generate.test.ts` — 30 Vitest cases: determinism, structure, and
  one test per story in §11.
- `scripts/demo-report.ts` behind `pnpm demo:report`.

**Key constants** (all in `lib/demo/generate.ts` unless noted)
- `DEMO_SEED = 20260920`. Same seed → byte-identical output, asserted.
- Window `DEMO_START_MS` 2026-06-22 → `DEMO_END_MS` 2026-09-20, fixed, 90 days.
- `DEMO_IMPROVEMENT_DAYS = 21` (discipline improves from 2026-08-30),
  `DEMO_EA_DRIFT_DAYS = 30` (EA 1003 degrades from 2026-08-21).
- `DEMO_START_PRICE = 2418.40` (in `price.ts`), `DEMO_STARTING_BALANCE = 25,000`,
  contract size 100, commission $3.50/lot/side, swap −$11.80 long and −$3.40
  short per lot per night, tripled on the Wednesday rollover.
- The demo broker runs on UTC (`DEMO_SERVER_UTC_OFFSET_HOURS = 0`), so the
  rollover window is 23:45–00:15.

**Decisions taken**
- **Behaviour is planned, not sampled.** The stories in §11 are requirements,
  so `MANUAL_PLAN` states exactly how many trades of each cohort — news,
  revenge, oversized, no-stop, widened-stop, rollover, London, ordinary — and
  how many of each lose, split across the two phases. Tuning the data means
  editing one table.
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
- **Positive R, flat money.** Manual trading is +50.2R but only +$407: the
  R-positive edge is given away by a handful of oversized revenge trades
  (−$10,900 between 26 of them). That is the Karat Gap the product is for, and
  it is visible in the raw data before the engine exists.
- **MFE/MAE are prices, not R.** The generator records the extreme prices
  reached while a position was open; converting them to R is engine work.
- **`tsx` added as a dev dependency** so `pnpm demo:report` can run a
  TypeScript script without a build step.

**`pnpm demo:report`**
```
01 — THE LEDGER
  Trades (total) 836 · manual 220 · EA 616 · deals 1672 · modifications 10
  High-impact USD events 37 of 45 · manual win rate 50.0%
  Manual net P&L +$407.44 · manual net R +50.2R · EA net P&L +$7,747.90
  Closing balance $33,155.34
02 — LOSSES CLUSTER AROUND USD NEWS
  110 manual losses · 72 within ±20 min of a high-impact event (65.5%, target ≥ 60%)
  86 manual trades in a news window, averaging −0.9R
03 — REVENGE TRADING
  26 revenge trades (11.8%, target 10–15%) · avg −0.9R vs +0.4R elsewhere · −$10,900.85
04 — THE LONDON OPEN IS THE EDGE
  71 trades 07:00–10:00 UTC · avg +1.3R (target ≥ +0.7R) · win rate 77.5%
  Asia −0.5R · London open +1.3R · London 10:00–12:30 −0.2R · New York −0.3R
05 — IMPURITIES
  23 trades over 1.5% risk (worst 3.0%) · 6 without a stop · 7 stops widened
  5 rollover entries · 65 active days, 9 of them overtrading
06 — DISCIPLINE IMPROVES
  First 69 days: 163 trades, 83 impure (50.9%), avg 0.0R
  Last 21 days:   57 trades,  9 impure (15.8%), avg +0.7R
07 — CONSTELLATION
  1001 Gold Scalper     280 trades · exp +0.3R · PF 2.34 · baseline +0.3R
  1002 London Breakout  127 trades · exp +0.5R · PF 3.30 · baseline +0.5R
  1003 Grid Recovery    209 trades · exp  0.0R · PF 1.09 · baseline +0.3R
  Correlation 1001 ↔ 1002 (daily P&L) 0.847 (target ≥ 0.600)
  1003 expectancy: +0.3R over the first 60 days, −0.6R over the last 30
```

**Not built, on purpose**
No engine module, no Karat, no UI. The story checks live inside the tests and
the report script, where they are throwaway; §6 gets its real implementation
in Stage 2.
