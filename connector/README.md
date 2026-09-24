# Kavrix Connector

An Expert Advisor for MetaTrader 5 that sends your trade history to Kavrix
(CLAUDE.md §12). It is **read-only**: it never places, modifies or closes an
order or a position — the source contains no trade function at all, and a test
in `lib/connector/source.test.ts` fails if one ever appears.

What it sends, to `<your Kavrix URL>/api/ingest`:

| When | What |
|---|---|
| On start | Your deal history (batches of up to 100 deals), each symbol's contract size and digits, the account (login, server, currency, balance, equity, leverage), and high-impact USD events from MT5's built-in economic calendar |
| As it happens | Each new deal, and each SL/TP change of an open position |
| Every 60 s | A heartbeat — the account only. This is what Settings' "Synced · 4 s ago" is measured from |
| Once a day | The calendar again, for the days ahead |

## Install

1. **Generate a token.** In Kavrix, open **Settings → Connector tokens**, name
   the token (the terminal it is for) and press **Generate token**. Copy it — it
   is shown once. Kavrix keeps only its hash. One token per MT5 account: a token
   is linked to the first account that uses it.
2. **Get the file.** Download `KavrixConnector.mq5` from Settings (or take it
   from this folder). In MetaTrader 5: **File → Open Data Folder**, then put the
   file in `MQL5\Experts\`.
3. **Compile it.** Open it in MetaEditor (F4 from the terminal) and press
   **Compile** (F7). Back in the terminal, right-click **Expert Advisors** in the
   Navigator and choose **Refresh**.
4. **Allow the URL** — see the next section. Without it MT5 blocks every request.
5. **Attach it.** Drag **KavrixConnector** onto any one chart (any symbol, any
   timeframe — it reads the whole account). **Allow Algo Trading** can stay off:
   the connector never trades, and MT5 runs its timer and web requests either
   way. On the **Inputs** tab:
   - **Kavrix URL** — your Kavrix address, e.g. `https://kavrix.example`, with no
     path and no trailing slash.
   - **Connector token** — paste the token here. This is the only place it goes.
   - Leave the rest at their defaults unless you have a reason.
6. **Check the Experts tab** (Toolbox, Ctrl+T). You should see
   `Kavrix: broker server time is UTC+2.00 h …` and `Kavrix: sending history …`,
   and in Kavrix, Settings → Linked MT5 accounts shows your account with a lit dot.

## Allow the API URL (WebRequest)

MetaTrader 5 lets an EA reach only the addresses you list:

1. **Tools → Options** (Ctrl+O).
2. The **Expert Advisors** tab.
3. Tick **Allow WebRequest for listed URL**.
4. Double-click the empty row under the list (or press **+ Add new URL**) and
   enter your Kavrix address exactly as in the EA's input, e.g.
   `https://kavrix.example` — no path, no trailing slash.
5. **OK**.

If you skip this, the Experts log says
`Kavrix: WebRequest is not allowed for … — retrying in … s` and nothing is lost:
requests wait in the queue until the URL is allowed.

## Enter your broker's offset in Kavrix

MT5 records times in your broker's **server time**; Kavrix works in UTC. The
connector converts using the server's current offset and prints it when it
starts:

```
Kavrix: broker server time is UTC+3.00 h. Enter 3.00 as the broker offset in Kavrix Settings.
```

Enter that number in **Settings → Discipline thresholds → Broker offset**. It
places the rollover window (broker midnight ±15 min) on the right hour.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| Kavrix URL | `https://` | Your Kavrix address. Must also be allowed for WebRequest |
| Connector token | — | From Settings. Starts with `kvx_`, 47 characters |
| Deals per request | 100 | 1–100. The server refuses more than 100 |
| Heartbeat interval | 60 s | Minimum 10 s |
| History to send on the first run | 365 days | Later starts resend a day of overlap from where the last one stopped; Kavrix ignores what it already has |
| Symbols to send | `XAU,GOLD` | Parts of the symbol name, comma-separated, case-insensitive. `XAU` matches `XAUUSD`, `XAUUSD.m`, `XAUUSDm`; `GOLD` matches `GOLD`, `GOLD.a`. Empty sends every symbol |

## Reliability

- **Nothing is lost offline.** Every request is written to
  `MQL5\Files\Kavrix\queue_<login>.txt` before it is sent, and removed only once
  Kavrix has accepted it (HTTP 200). Restart the terminal and the queue is still
  there.
- **Retries back off**: 2 s, 4 s, 8 s … up to 5 minutes, on a network error or
  a server error. A rate limit waits 30 s. Requests are spaced at least 1.1 s
  apart, under the server's 60 a minute.
- **A refused token pauses sending** (HTTP 401 or 409) and says so in the Experts
  log and on the chart. Fix the token in the inputs; the queue is kept.
- **A malformed request is dropped** (other 4xx): sending it again cannot help.
  The Experts log shows the server's reason.
- **Never blocking**: each request times out after 5 s, history is read a few
  hundred deals per second, and all of it runs in the EA's own thread.
- **Idempotent**: Kavrix stores each deal ticket and calendar event once, so a
  resend — after a crash, a restart, a network error — changes nothing.
- `MQL5\Files\Kavrix\state_<login>.txt` remembers how far the history was sent.
  Delete it to resend everything on the next start.

## What it cannot see

- **SL/TP changes from before it was running.** MT5 does not keep a history of
  modifications, only each deal's stop. Changes are captured live; the stop at
  entry comes from the opening deal (or its order) for every trade.
- **Prices between fills.** Kavrix stores the best and worst fill of a position
  as its excursion — a lower bound, not the true MFE/MAE. The Trade Dossier has
  no candles for a real account yet (`ROADMAP.md`).
- **Deposits and withdrawals.** Only buy and sell deals are sent (§12), so equity
  at entry is your current balance walked back through every later close.
- **Netting accounts' reversals** (`DEAL_ENTRY_INOUT`) are skipped; V1 measures
  hedging accounts, which is what retail Gold accounts almost always are.
- **Spread at a historical deal** is the M1 bar's spread at that minute (MT5
  records no per-deal spread); for live deals it is the spread at the moment.
- **Offsets across a DST change.** History is converted with today's offset, so
  deals from the other side of a daylight-saving change can sit an hour off.

## Test without MetaTrader 5

`pnpm simulate:connector --url http://localhost:3000 --token kvx_…` posts a
realistic session — history in batches, a new deal, an SL change, the closing
deal and a heartbeat — exactly as the EA would. `--dry-run` runs it in memory.

## Things to check the first time it compiles

The connector was written without access to MetaEditor. It uses only standard
MQL5 functions, but these are the lines worth a look if the compiler (build 4000+)
has anything to say:

1. `StringToCharArray(body, data, …)` and `CharArrayToString(result, …)` with
   `char[]` arrays, as in MetaQuotes' own `WebRequest` example.
2. `GetTickCount64()` (in MQL5 since 2019).
3. `DEAL_SL`, `DEAL_TP`, `DEAL_FEE` and `DEAL_TIME_MSC` deal properties.
4. `CalendarValueHistory(values, from, to, NULL, "USD")` and
   `CalendarEventById` — the calendar needs a live connection to MetaQuotes; in
   the Strategy Tester the connector does nothing at all.
5. `PrintFormat("%+.2f", …)` for the offset line.
6. That the in-deal's `DEAL_SL` holds the stop sent with a market order on your
   broker; where it is 0 the connector falls back to the opening order's
   `ORDER_SL`.
