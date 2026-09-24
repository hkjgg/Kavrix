//+------------------------------------------------------------------+
//|                                             KavrixConnector.mq5  |
//|  Kavrix Connector: sends your MetaTrader 5 trade history to      |
//|  Kavrix (CLAUDE.md section 12).                                  |
//|                                                                  |
//|  READ-ONLY. This Expert Advisor never places, modifies or closes |
//|  an order or a position. It contains no trade function at all:   |
//|  it reads deals, SL/TP changes and the economic calendar, and    |
//|  posts them as JSON to  <your Kavrix URL>/api/ingest.            |
//|                                                                  |
//|  - On start: the history (batches of up to 100 deals), the       |
//|    symbolInfo of every symbol sent, the account, and high-impact |
//|    USD events from the built-in economic calendar.               |
//|  - Live: each new deal, and each SL/TP change of an open         |
//|    position, as it happens.                                      |
//|  - Every 60 s: a heartbeat (account only).                       |
//|  - Daily: the calendar again, for the days ahead.                |
//|                                                                  |
//|  Nothing is lost offline: every request is queued in a file      |
//|  under MQL5\Files\Kavrix\ before it is sent, and removed only    |
//|  once Kavrix has accepted it. Failures back off exponentially.   |
//|  Kavrix de-duplicates by deal ticket and event id, so a batch    |
//|  sent twice is stored once.                                      |
//|                                                                  |
//|  Times are sent in UTC (ISO 8601, "Z"). MT5 records deal times   |
//|  in the broker's server time; the connector converts them with   |
//|  the server's current offset from UTC, which it prints in the    |
//|  Experts log when it starts - enter the same number in Kavrix    |
//|  Settings as the broker offset.                                  |
//+------------------------------------------------------------------+
#property copyright   "Kavrix"
#property version     "1.00"
#property description "Kavrix Connector - sends your trade history to Kavrix."
#property description "Read-only: it never places, modifies or closes a trade."

//--- inputs
input string InpApiUrl       = "https://";       // Kavrix URL (also allow it: Tools > Options > Expert Advisors)
input string InpToken        = "";               // Connector token (Kavrix > Settings > Connector tokens)
input int    InpBatchSize    = 100;              // Deals per request (1-100)
input int    InpHeartbeatSec = 60;               // Heartbeat interval, seconds
input int    InpHistoryDays  = 365;              // History to send on the first run, days
input string InpSymbols      = "XAU,GOLD";       // Symbols to send (parts of the name, comma-separated; empty = all)

//--- limits and file names
#define KAVRIX_FOLDER          "Kavrix"
#define KAVRIX_TIMEOUT_MS      5000
#define KAVRIX_MIN_GAP_MS      1100              // at most ~54 requests a minute: under the server's 60
#define KAVRIX_MAX_BACKOFF_SEC 300
#define KAVRIX_HISTORY_PER_TICK 500
#define KAVRIX_CALENDAR_PER_REQUEST 500
#define KAVRIX_MAX_QUEUE       5000

//--- state
string g_url            = "";
string g_headers        = "";
string g_queueFile      = "";
string g_stateFile      = "";
string g_queue[];                                // request fragments waiting to be sent, oldest first
string g_symbolFilter[];                         // upper-case parts of symbol names to send
string g_liveDeals      = "";                    // deals seen since the last flush, JSON objects joined by ","
int    g_liveDealCount  = 0;
string g_liveSymbols[];
string g_liveMods       = "";                    // SL/TP changes since the last flush
int    g_liveModCount   = 0;
long   g_offsetSec      = 0;                     // broker server time minus UTC, seconds
ulong  g_histTickets[];                          // history deals still to send
int    g_histIndex      = 0;
bool   g_histPending    = false;
datetime g_histFrom     = 0;
datetime g_syncedUntil  = 0;                     // server time up to which deals have been queued
long   g_calendarDay    = -1;                    // the UTC day the calendar was last queued
ulong  g_nextSendTick   = 0;
int    g_backoffSec     = 0;
ulong  g_lastHeartbeatTick = 0;
bool   g_halted         = false;                 // the token was refused: stop until the inputs change
int    g_lastStatus     = 0;
datetime g_lastSentAt   = 0;
bool   g_warnedInOut    = false;
ulong  g_retryTickets[];                         // live deals not yet in the history cache
int    g_retryTries[];

//+------------------------------------------------------------------+
//| Small helpers                                                    |
//+------------------------------------------------------------------+
string JsonEscape(const string text)
  {
   string out = "";
   int n = StringLen(text);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(text, i);
      if(c == '"')
         out += "\\\"";
      else if(c == '\\')
         out += "\\\\";
      else if(c == '\n')
         out += "\\n";
      else if(c == '\r')
         out += "\\r";
      else if(c == '\t')
         out += "\\t";
      else if(c < 0x20 || c > 0x7E)
         out += StringFormat("\\u%04X", (int)c);   // keeps every body pure ASCII
      else
         out += ShortToString(c);
     }
   return out;
  }

string Num(const double value, const int digits)
  {
   if(!MathIsValidNumber(value))
      return "0";
   return DoubleToString(value, digits);
  }

//--- milliseconds since 1970 in UTC -> "2026-09-24T12:34:56.789Z"
string IsoFromUtcMs(const long utcMs)
  {
   long seconds = utcMs / 1000;
   int millis = (int)(utcMs - seconds * 1000);
   if(millis < 0)
      millis = 0;
   string text = TimeToString((datetime)seconds, TIME_DATE | TIME_SECONDS);   // "2026.09.24 12:34:56"
   StringReplace(text, ".", "-");
   StringReplace(text, " ", "T");
   return text + "." + StringFormat("%03d", millis) + "Z";
  }

string IsoFromServerTime(const datetime serverTime)
  {
   return IsoFromUtcMs(((long)serverTime - g_offsetSec) * 1000);
  }

//--- the broker server's offset from UTC, rounded to a quarter hour
long ServerOffsetSeconds()
  {
   long raw = (long)TimeTradeServer() - (long)TimeGMT();
   double quarters = MathRound((double)raw / 900.0);
   return (long)quarters * 900;
  }

bool SymbolWanted(const string symbol)
  {
   int n = ArraySize(g_symbolFilter);
   if(n == 0)
      return true;
   string upper = symbol;
   StringToUpper(upper);
   for(int i = 0; i < n; i++)
      if(StringFind(upper, g_symbolFilter[i]) >= 0)
         return true;
   return false;
  }

void AddUnique(string &list[], const string value)
  {
   int n = ArraySize(list);
   for(int i = 0; i < n; i++)
      if(list[i] == value)
         return;
   ArrayResize(list, n + 1);
   list[n] = value;
  }

//--- {"XAUUSD":{"contractSize":100,"digits":2}} for the symbols given
string SymbolInfoJson(const string &symbols[])
  {
   string out = "";
   int n = ArraySize(symbols);
   for(int i = 0; i < n; i++)
     {
      double contract = SymbolInfoDouble(symbols[i], SYMBOL_TRADE_CONTRACT_SIZE);
      int digits = (int)SymbolInfoInteger(symbols[i], SYMBOL_DIGITS);
      if(contract <= 0.0)
         continue;
      if(out != "")
         out += ",";
      out += "\"" + JsonEscape(symbols[i]) + "\":{\"contractSize\":" + Num(contract, 8) +
             ",\"digits\":" + IntegerToString(digits) + "}";
     }
   return "{" + out + "}";
  }

string AccountJson()
  {
   return "\"account\":{\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
          ",\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\"" +
          ",\"currency\":\"" + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)) + "\"" +
          ",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
          ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
          ",\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "}";
  }

//--- a request fragment: everything but the account, which is added when it is sent
string Fragment(const string deals, const string mods, const string calendar, const string symbolInfo)
  {
   return "\"deals\":[" + deals + "],\"modifications\":[" + mods + "],\"calendar\":[" + calendar +
          "],\"symbolInfo\":" + symbolInfo;
  }

//+------------------------------------------------------------------+
//| Deals                                                            |
//+------------------------------------------------------------------+
//--- the spread at the deal: live, the current spread; history, the M1 bar's
int SpreadAt(const string symbol, const datetime serverTime, const bool live)
  {
   if(live)
      return (int)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
   int spreads[];
   if(CopySpread(symbol, PERIOD_M1, serverTime, 1, spreads) == 1)
      return spreads[0];
   return 0;
  }

//--- one deal as a JSON object, or "" when it is not a buy/sell deal Kavrix measures.
//--- found is false when the deal is not in the history cache yet (a live deal can
//--- arrive a moment before the terminal files it), so the caller can try again.
string DealJson(const ulong ticket, const bool live, string &symbolOut, bool &found)
  {
   symbolOut = "";
   found = HistoryDealSelect(ticket);
   if(!found)
      return "";

   //--- every deal property is read first: selecting the order below may reset the selection
   long   type       = HistoryDealGetInteger(ticket, DEAL_TYPE);
   long   entry      = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   string symbol     = HistoryDealGetString(ticket, DEAL_SYMBOL);
   double volume     = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double price      = HistoryDealGetDouble(ticket, DEAL_PRICE);
   long   position   = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   long   timeMsc    = HistoryDealGetInteger(ticket, DEAL_TIME_MSC);
   datetime serverTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
   double sl         = HistoryDealGetDouble(ticket, DEAL_SL);
   double tp         = HistoryDealGetDouble(ticket, DEAL_TP);
   double profit     = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION) + HistoryDealGetDouble(ticket, DEAL_FEE);
   double swap       = HistoryDealGetDouble(ticket, DEAL_SWAP);
   long   magic      = HistoryDealGetInteger(ticket, DEAL_MAGIC);
   string comment    = HistoryDealGetString(ticket, DEAL_COMMENT);
   ulong  order      = (ulong)HistoryDealGetInteger(ticket, DEAL_ORDER);

   if(type != (long)DEAL_TYPE_BUY && type != (long)DEAL_TYPE_SELL)
      return "";                                  // balance, credit, commission... are not trades

   string entryText = "";
   if(entry == (long)DEAL_ENTRY_IN)
      entryText = "in";
   else if(entry == (long)DEAL_ENTRY_OUT || entry == (long)DEAL_ENTRY_OUT_BY)
      entryText = "out";
   else
     {
      if(!g_warnedInOut)
         Print("Kavrix: a reversal deal (netting account) was skipped. V1 measures hedging accounts.");
      g_warnedInOut = true;
      return "";
     }

   if(!SymbolWanted(symbol))
      return "";
   if(volume <= 0.0 || price <= 0.0)
      return "";

   //--- the stop at entry: the deal's, else the one sent with the order that opened it
   if(entryText == "in" && sl <= 0.0 && order > 0 && HistoryOrderSelect(order))
     {
      sl = HistoryOrderGetDouble(order, ORDER_SL);
      if(tp <= 0.0)
         tp = HistoryOrderGetDouble(order, ORDER_TP);
     }
   if(sl < 0.0)
      sl = 0.0;
   if(tp < 0.0)
      tp = 0.0;

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   if(digits <= 0)
      digits = 5;
   long utcMs = timeMsc - g_offsetSec * 1000;

   symbolOut = symbol;
   return "{\"ticket\":" + IntegerToString((long)ticket) +
          ",\"positionId\":" + IntegerToString(position) +
          ",\"time\":\"" + IsoFromUtcMs(utcMs) + "\"" +
          ",\"type\":\"" + (type == (long)DEAL_TYPE_BUY ? "buy" : "sell") + "\"" +
          ",\"entry\":\"" + entryText + "\"" +
          ",\"symbol\":\"" + JsonEscape(symbol) + "\"" +
          ",\"volume\":" + Num(volume, 8) +
          ",\"price\":" + Num(price, digits) +
          ",\"sl\":" + Num(sl, digits) +
          ",\"tp\":" + Num(tp, digits) +
          ",\"profit\":" + Num(profit, 2) +
          ",\"commission\":" + Num(commission, 2) +
          ",\"swap\":" + Num(swap, 2) +
          ",\"magic\":" + IntegerToString(magic) +
          ",\"comment\":\"" + JsonEscape(comment) + "\"" +
          ",\"spreadPoints\":" + IntegerToString(SpreadAt(symbol, serverTime, live)) + "}";
  }

//--- the deal's server time, read after DealJson has selected it
datetime DealServerTime(const ulong ticket)
  {
   if(!HistoryDealSelect(ticket))
      return 0;
   return (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
  }

//+------------------------------------------------------------------+
//| The queue, mirrored to MQL5\Files\Kavrix\queue_<login>.txt       |
//+------------------------------------------------------------------+
bool SaveQueue()
  {
   int handle = FileOpen(g_queueFile, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
     {
      Print("Kavrix: cannot write ", g_queueFile, " (error ", GetLastError(), ")");
      return false;
     }
   int n = ArraySize(g_queue);
   for(int i = 0; i < n; i++)
      if(FileWriteString(handle, g_queue[i] + "\r\n") == 0)
         Print("Kavrix: a queued request could not be written");
   FileClose(handle);
   return true;
  }

void LoadQueue()
  {
   ArrayResize(g_queue, 0);
   if(!FileIsExist(g_queueFile))
      return;
   int handle = FileOpen(g_queueFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
      return;
   while(!FileIsEnding(handle))
     {
      string line = FileReadString(handle);
      if(StringLen(line) == 0)
         continue;
      int n = ArraySize(g_queue);
      ArrayResize(g_queue, n + 1);
      g_queue[n] = line;
     }
   FileClose(handle);
  }

void Enqueue(const string fragment)
  {
   int n = ArraySize(g_queue);
   if(n >= KAVRIX_MAX_QUEUE)
     {
      Print("Kavrix: the queue is full (", n, " requests). Check the URL and the token; the oldest request is kept.");
      return;
     }
   ArrayResize(g_queue, n + 1);
   g_queue[n] = fragment;
   SaveQueue();
  }

void DropFirst()
  {
   int n = ArraySize(g_queue);
   if(n == 0)
      return;
   for(int i = 1; i < n; i++)
      g_queue[i - 1] = g_queue[i];
   ArrayResize(g_queue, n - 1);
   SaveQueue();
  }

//+------------------------------------------------------------------+
//| State: MQL5\Files\Kavrix\state_<login>.txt                       |
//+------------------------------------------------------------------+
void SaveState()
  {
   int handle = FileOpen(g_stateFile, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
      return;
   if(FileWriteString(handle, IntegerToString((long)g_syncedUntil) + "\r\n") == 0)
      Print("Kavrix: the sync state could not be written");
   FileClose(handle);
  }

void LoadState()
  {
   g_syncedUntil = 0;
   if(!FileIsExist(g_stateFile))
      return;
   int handle = FileOpen(g_stateFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
      return;
   string line = FileReadString(handle);
   FileClose(handle);
   g_syncedUntil = (datetime)StringToInteger(line);
  }

//+------------------------------------------------------------------+
//| History                                                          |
//+------------------------------------------------------------------+
//--- collects the tickets to send; the deals themselves are read a few hundred per timer tick
void BeginHistory()
  {
   datetime now = TimeTradeServer();
   datetime firstRun = (datetime)((long)now - (long)InpHistoryDays * 86400);
   //--- after the first run, resend a day of overlap: Kavrix de-duplicates by ticket
   g_histFrom = (g_syncedUntil > 0) ? (datetime)((long)g_syncedUntil - 86400) : firstRun;
   if(g_histFrom < firstRun)
      g_histFrom = firstRun;

   ArrayResize(g_histTickets, 0);
   g_histIndex = 0;
   if(!HistorySelect(g_histFrom, (datetime)((long)now + 86400)))
     {
      Print("Kavrix: the history could not be read; retrying on the next start.");
      return;
     }
   int total = HistoryDealsTotal();
   ArrayResize(g_histTickets, total);
   int kept = 0;
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket > 0)
        {
         g_histTickets[kept] = ticket;
         kept++;
        }
     }
   ArrayResize(g_histTickets, kept);
   g_histPending = true;
   PrintFormat("Kavrix: sending history since %s (%d deals to read).", TimeToString(g_histFrom), kept);
  }

void ContinueHistory()
  {
   if(!g_histPending)
      return;
   int total = ArraySize(g_histTickets);
   int batchSize = InpBatchSize;
   if(batchSize < 1)
      batchSize = 1;
   if(batchSize > 100)
      batchSize = 100;

   string deals = "";
   int count = 0;
   string symbols[];
   int processed = 0;
   while(g_histIndex < total && processed < KAVRIX_HISTORY_PER_TICK)
     {
      string symbol = "";
      bool found = false;
      ulong ticket = g_histTickets[g_histIndex];
      string json = DealJson(ticket, false, symbol, found);
      datetime dealTime = DealServerTime(ticket);
      g_histIndex++;
      processed++;
      if(json == "")
         continue;
      if(dealTime > g_syncedUntil)
         g_syncedUntil = dealTime;
      deals += (count > 0 ? "," : "") + json;
      count++;
      AddUnique(symbols, symbol);
      if(count >= batchSize)
        {
         Enqueue(Fragment(deals, "", "", SymbolInfoJson(symbols)));
         deals = "";
         count = 0;
         ArrayResize(symbols, 0);
        }
     }
   if(count > 0)
      Enqueue(Fragment(deals, "", "", SymbolInfoJson(symbols)));

   if(g_histIndex >= total)
     {
      g_histPending = false;
      ArrayResize(g_histTickets, 0);
      if(g_syncedUntil < g_histFrom)
         g_syncedUntil = g_histFrom;
      SaveState();
      Print("Kavrix: history queued.");
     }
  }

//+------------------------------------------------------------------+
//| Calendar: high-impact USD events from the built-in calendar      |
//+------------------------------------------------------------------+
void QueueCalendar(const datetime from, const datetime to)
  {
   MqlCalendarValue values[];
   if(!CalendarValueHistory(values, from, to, NULL, "USD"))
     {
      Print("Kavrix: the economic calendar is not available (error ", GetLastError(), "). It is retried tomorrow.");
      return;
     }
   string events = "";
   int count = 0;
   int n = ArraySize(values);
   for(int i = 0; i < n; i++)
     {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id, event))
         continue;
      if(event.importance != CALENDAR_IMPORTANCE_HIGH)
         continue;
      events += (count > 0 ? "," : "") +
                "{\"eventId\":" + IntegerToString((long)values[i].id) +
                ",\"time\":\"" + IsoFromServerTime(values[i].time) + "\"" +
                ",\"currency\":\"USD\",\"importance\":\"high\"" +
                ",\"name\":\"" + JsonEscape(event.name) + "\"}";
      count++;
      if(count >= KAVRIX_CALENDAR_PER_REQUEST)
        {
         string none[];
         Enqueue(Fragment("", "", events, SymbolInfoJson(none)));
         events = "";
         count = 0;
        }
     }
   if(count > 0)
     {
      string none[];
      Enqueue(Fragment("", "", events, SymbolInfoJson(none)));
     }
  }

void MaybeQueueCalendar(const bool firstRun)
  {
   long today = (long)TimeGMT() / 86400;
   if(today == g_calendarDay)
      return;
   datetime now = TimeTradeServer();
   datetime ahead = (datetime)((long)now + 8 * 86400);
   datetime from = firstRun ? g_histFrom : (datetime)((long)now - 2 * 86400);
   if(from <= 0)
      from = (datetime)((long)now - 2 * 86400);
   QueueCalendar(from, ahead);
   g_calendarDay = today;
  }

//+------------------------------------------------------------------+
//| Sending                                                          |
//+------------------------------------------------------------------+
int Post(const string fragment, string &response)
  {
   string body = "{" + AccountJson() + (fragment == "" ? "" : "," + fragment) + "}";
   char data[];
   char result[];
   string resultHeaders = "";
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   ResetLastError();
   int status = WebRequest("POST", g_url, g_headers, KAVRIX_TIMEOUT_MS, data, result, resultHeaders);
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   g_lastStatus = status;
   g_lastSentAt = TimeLocal();
   return status;
  }

void BackOff(const string why)
  {
   if(g_backoffSec <= 0)
      g_backoffSec = 2;
   else
      g_backoffSec = g_backoffSec * 2;
   if(g_backoffSec > KAVRIX_MAX_BACKOFF_SEC)
      g_backoffSec = KAVRIX_MAX_BACKOFF_SEC;
   g_nextSendTick = GetTickCount64() + (ulong)g_backoffSec * 1000;
   PrintFormat("Kavrix: %s - retrying in %d s. Nothing is lost: the request stays queued.", why, g_backoffSec);
  }

//--- handles one response; true when the queued request may be removed
bool Settle(const int status, const string response)
  {
   if(status == 200)
     {
      g_backoffSec = 0;
      if(StringFind(response, "\"rejected\":[{") >= 0)
         Print("Kavrix: some deals were rejected: ", StringSubstr(response, 0, 600));
      return true;
     }
   if(status == -1)
     {
      int error = GetLastError();
      if(error == 4014)
         BackOff("WebRequest is not allowed for " + InpApiUrl + ". Add it in Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
      else
         BackOff("no connection (error " + IntegerToString(error) + ")");
      return false;
     }
   if(status == 401 || status == 409)
     {
      g_halted = true;
      Print("Kavrix: the token was refused (HTTP ", status, "): ", StringSubstr(response, 0, 300));
      Print("Kavrix: sending is paused. Generate a token in Kavrix Settings and paste it into this EA's inputs.");
      return false;
     }
   if(status == 429)
     {
      g_nextSendTick = GetTickCount64() + 30000;
      Print("Kavrix: rate limited - waiting 30 s.");
      return false;
     }
   if(status >= 400 && status < 500)
     {
      //--- the request itself is wrong; sending it again cannot help
      Print("Kavrix: a request was refused and dropped (HTTP ", status, "): ", StringSubstr(response, 0, 600));
      return true;
     }
   BackOff("the server answered HTTP " + IntegerToString(status));
   return false;
  }

void SendNext()
  {
   if(g_halted)
      return;
   ulong now = GetTickCount64();
   if(now < g_nextSendTick)
      return;

   string response = "";
   if(ArraySize(g_queue) > 0)
     {
      int status = Post(g_queue[0], response);
      if(Settle(status, response))
         DropFirst();
      g_lastHeartbeatTick = now;                  // any request is a sign of life
     }
   else
     {
      int interval = InpHeartbeatSec < 10 ? 10 : InpHeartbeatSec;
      if(now - g_lastHeartbeatTick < (ulong)interval * 1000)
         return;
      int status = Post("", response);
      Settle(status, response);
      g_lastHeartbeatTick = now;
     }
   if(g_nextSendTick <= now)
      g_nextSendTick = now + KAVRIX_MIN_GAP_MS;
  }

//--- a live deal into the next request; false when the terminal has not filed it yet
bool AddLiveDeal(const ulong ticket)
  {
   string symbol = "";
   bool found = false;
   string json = DealJson(ticket, true, symbol, found);
   if(!found)
      return false;
   if(json == "")
      return true;                                // filed, but not a deal Kavrix measures
   g_liveDeals += (g_liveDealCount > 0 ? "," : "") + json;
   g_liveDealCount++;
   AddUnique(g_liveSymbols, symbol);
   datetime dealTime = DealServerTime(ticket);
   if(dealTime > g_syncedUntil)
      g_syncedUntil = dealTime;
   return true;
  }

//--- tries the deals the terminal had not filed yet, for up to a minute each
void RetryLiveDeals()
  {
   int n = ArraySize(g_retryTickets);
   if(n == 0)
      return;
   int kept = 0;
   for(int i = 0; i < n; i++)
     {
      bool done = AddLiveDeal(g_retryTickets[i]);
      int tries = g_retryTries[i] + 1;
      if(!done && tries < 60)
        {
         g_retryTickets[kept] = g_retryTickets[i];
         g_retryTries[kept] = tries;
         kept++;
        }
      else if(!done)
         PrintFormat("Kavrix: deal #%I64u never reached the history; it is sent with the next start's history.", g_retryTickets[i]);
     }
   ArrayResize(g_retryTickets, kept);
   ArrayResize(g_retryTries, kept);
  }

//--- moves the live deals and SL/TP changes seen since the last tick into the queue
void FlushLive()
  {
   if(g_liveDealCount == 0 && g_liveModCount == 0)
      return;
   Enqueue(Fragment(g_liveDeals, g_liveMods, "", SymbolInfoJson(g_liveSymbols)));
   g_liveDeals = "";
   g_liveDealCount = 0;
   g_liveMods = "";
   g_liveModCount = 0;
   ArrayResize(g_liveSymbols, 0);
   SaveState();
  }

void ShowStatus()
  {
   string last = g_lastStatus == 0 ? "not yet" : IntegerToString(g_lastStatus) + " at " + TimeToString(g_lastSentAt, TIME_SECONDS);
   Comment("Kavrix Connector (read-only)",
           "\nQueued requests: ", ArraySize(g_queue),
           g_histPending ? "\nReading history..." : "",
           "\nLast response: ", last,
           g_halted ? "\nPAUSED: the token was refused - see the Experts log" : "");
  }

//+------------------------------------------------------------------+
//| Events                                                           |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(MQLInfoInteger(MQL_TESTER) != 0)
     {
      Print("Kavrix: the connector does nothing in the Strategy Tester (WebRequest is not available there).");
      return INIT_SUCCEEDED;
     }

   string url = InpApiUrl;
   StringTrimLeft(url);
   StringTrimRight(url);
   while(StringLen(url) > 0 && StringSubstr(url, StringLen(url) - 1, 1) == "/")
      url = StringSubstr(url, 0, StringLen(url) - 1);
   bool schemeOk = (StringFind(url, "https://") == 0) || (StringFind(url, "http://") == 0);
   if(!schemeOk || StringLen(url) < 10)
     {
      Print("Kavrix: set the Kavrix URL input, e.g. https://your-kavrix-site (no path).");
      return INIT_PARAMETERS_INCORRECT;
     }
   string token = InpToken;
   StringTrimLeft(token);
   StringTrimRight(token);
   if(StringFind(token, "kvx_") != 0 || StringLen(token) != 47)
     {
      Print("Kavrix: paste the connector token from Kavrix Settings into the token input (it starts with kvx_).");
      return INIT_PARAMETERS_INCORRECT;
     }

   g_url = url + "/api/ingest";
   g_headers = "Content-Type: application/json\r\nAuthorization: Bearer " + token + "\r\n";

   //--- which symbols to send
   ArrayResize(g_symbolFilter, 0);
   string parts[];
   int count = StringSplit(InpSymbols, StringGetCharacter(",", 0), parts);
   for(int i = 0; i < count; i++)
     {
      string part = parts[i];
      StringTrimLeft(part);
      StringTrimRight(part);
      StringToUpper(part);
      if(StringLen(part) > 0)
         AddUnique(g_symbolFilter, part);
     }

   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   if(!FolderCreate(KAVRIX_FOLDER))
      ResetLastError();                           // it usually exists already
   g_queueFile = KAVRIX_FOLDER + "\\queue_" + login + ".txt";
   g_stateFile = KAVRIX_FOLDER + "\\state_" + login + ".txt";
   LoadQueue();
   LoadState();

   g_offsetSec = ServerOffsetSeconds();
   PrintFormat("Kavrix: broker server time is UTC%+.2f h. Enter %.2f as the broker offset in Kavrix Settings.",
               (double)g_offsetSec / 3600.0, (double)g_offsetSec / 3600.0);
   PrintFormat("Kavrix: sending to %s. %d requests were still queued from last time.", g_url, ArraySize(g_queue));

   g_halted = false;
   g_backoffSec = 0;
   g_nextSendTick = 0;
   g_lastHeartbeatTick = 0;
   g_calendarDay = -1;
   BeginHistory();
   MaybeQueueCalendar(true);

   if(!EventSetTimer(1))
     {
      Print("Kavrix: the timer could not be started.");
      return INIT_FAILED;
     }
   ShowStatus();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(g_url != "")
     {
      FlushLive();
      SaveQueue();
     }
   Comment("");
   PrintFormat("Kavrix: stopped (reason %d). %d requests stay queued for next time.", reason, ArraySize(g_queue));
  }

void OnTimer()
  {
   if(g_url == "")
      return;
   g_offsetSec = ServerOffsetSeconds();
   ContinueHistory();
   RetryLiveDeals();
   FlushLive();
   MaybeQueueCalendar(false);
   SendNext();
   ShowStatus();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(g_url == "")
      return;

   //--- a new deal: queued on the next timer tick
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD && trans.deal > 0)
     {
      if(!AddLiveDeal(trans.deal))
        {
         int n = ArraySize(g_retryTickets);
         ArrayResize(g_retryTickets, n + 1);
         ArrayResize(g_retryTries, n + 1);
         g_retryTickets[n] = trans.deal;
         g_retryTries[n] = 0;
        }
      return;
     }

   //--- an SL/TP change on an open position
   if(trans.type == TRADE_TRANSACTION_POSITION && trans.position > 0)
     {
      if(!SymbolWanted(trans.symbol))
         return;
      int digits = (int)SymbolInfoInteger(trans.symbol, SYMBOL_DIGITS);
      if(digits <= 0)
         digits = 5;
      double sl = trans.price_sl > 0.0 ? trans.price_sl : 0.0;
      double tp = trans.price_tp > 0.0 ? trans.price_tp : 0.0;
      g_liveMods += (g_liveModCount > 0 ? "," : "") +
                    "{\"positionId\":" + IntegerToString((long)trans.position) +
                    ",\"time\":\"" + IsoFromUtcMs((long)TimeGMT() * 1000) + "\"" +
                    ",\"sl\":" + Num(sl, digits) +
                    ",\"tp\":" + Num(tp, digits) + "}";
      g_liveModCount++;
     }
  }
//+------------------------------------------------------------------+
