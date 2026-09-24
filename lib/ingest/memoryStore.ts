/**
 * An `IngestStore` in memory, with the database's semantics: deals unique by
 * (account, ticket), modifications by (account, position, time), events by
 * (account, event id), one account per (user, login, server). For the tests
 * and the simulator's `--dry-run`; never used by the app.
 */

import type { Deal, EngineSettings, NewsEvent, SlModification } from '@/lib/engine';
import { tradesFromRows } from '@/lib/account/rows';
import type { TradeRow } from '@/lib/account/rows';
import type { AggregatedTrade } from './aggregate';
import type { AccountRecord, FindingRecord, IngestStore, SnapshotRecord, TokenRecord } from './store';

interface MemoryAccount extends AccountRecord {
  currency: string;
  balance: number;
  equity: number;
  leverage: number;
  lastHeartbeatAt: string | null;
  lastIngestAt: string | null;
}

export interface MemoryToken extends TokenRecord {
  hash: string;
  lastSeenAt: string | null;
}

export class MemoryIngestStore implements IngestStore {
  tokens = new Map<string, MemoryToken>();
  accounts = new Map<string, MemoryAccount>();
  deals = new Map<string, Map<number, Deal>>();
  modifications = new Map<string, Map<string, SlModification>>();
  calendar = new Map<string, Map<number, NewsEvent>>();
  trades = new Map<string, Map<number, AggregatedTrade>>();
  eas = new Map<string, Map<number, { name: string; baselineExpectancyR: number | null; baselineStdDevR: number | null }>>();
  snapshots = new Map<string, Map<string, SnapshotRecord>>();
  findings = new Map<string, FindingRecord[]>();
  settings = new Map<string, Partial<EngineSettings>>();
  rateCounts = new Map<string, number>();
  /** Injected so a test can move the rate window. */
  clockMs: () => number = () => Date.now();
  private nextId = 1;

  addToken(userId: string, hash: string, options: Partial<MemoryToken> = {}): MemoryToken {
    const token: MemoryToken = {
      id: `token-${this.nextId++}`,
      userId,
      accountId: null,
      revokedAt: null,
      hash,
      lastSeenAt: null,
      ...options,
    };
    this.tokens.set(token.id, token);
    return token;
  }

  private bucket<K, V>(map: Map<string, Map<K, V>>, accountId: string): Map<K, V> {
    let inner = map.get(accountId);
    if (inner === undefined) {
      inner = new Map();
      map.set(accountId, inner);
    }
    return inner;
  }

  async findTokenByHash(hash: string): Promise<TokenRecord | null> {
    for (const token of this.tokens.values()) if (token.hash === hash) return { ...token };
    return null;
  }

  async hitRateLimit(tokenId: string, windowSeconds: number): Promise<number> {
    const window = Math.floor(this.clockMs() / 1000 / windowSeconds);
    const key = `${tokenId}:${window}`;
    const count = (this.rateCounts.get(key) ?? 0) + 1;
    this.rateCounts.set(key, count);
    return count;
  }

  async touchToken(tokenId: string, at: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (token !== undefined) token.lastSeenAt = at;
  }

  async bindToken(tokenId: string, accountId: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (token !== undefined) token.accountId = accountId;
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const account = this.accounts.get(accountId);
    return account === undefined ? null : { ...account };
  }

  async upsertAccount(
    userId: string,
    account: Parameters<IngestStore['upsertAccount']>[1],
    symbolInfo: Parameters<IngestStore['upsertAccount']>[2],
    at: string,
  ): Promise<AccountRecord> {
    let existing = [...this.accounts.values()].find(
      (row) => row.userId === userId && row.login === account.login && row.server === account.server,
    );
    if (existing === undefined) {
      existing = {
        id: `account-${this.nextId++}`,
        userId,
        login: account.login,
        server: account.server,
        symbolInfo: {},
        currency: account.currency,
        balance: account.balance,
        equity: account.equity,
        leverage: account.leverage,
        lastHeartbeatAt: null,
        lastIngestAt: null,
      };
      this.accounts.set(existing.id, existing);
    }
    Object.assign(existing, {
      currency: account.currency,
      balance: account.balance,
      equity: account.equity,
      leverage: account.leverage,
      lastHeartbeatAt: at,
      symbolInfo: { ...existing.symbolInfo, ...symbolInfo },
    });
    return { id: existing.id, userId, login: existing.login, server: existing.server, symbolInfo: { ...existing.symbolInfo } };
  }

  async markIngested(accountId: string, at: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account !== undefined) account.lastIngestAt = at;
  }

  async insertDeals(accountId: string, deals: readonly Deal[]): Promise<number[]> {
    const stored = this.bucket(this.deals, accountId);
    const inserted: number[] = [];
    for (const deal of deals) {
      if (stored.has(deal.ticket)) continue;
      stored.set(deal.ticket, { ...deal });
      inserted.push(deal.ticket);
    }
    return inserted;
  }

  async insertModifications(accountId: string, modifications: readonly SlModification[]): Promise<SlModification[]> {
    const stored = this.bucket(this.modifications, accountId);
    const inserted: SlModification[] = [];
    for (const modification of modifications) {
      const key = `${modification.positionId}|${Date.parse(modification.time)}`;
      if (stored.has(key)) continue;
      stored.set(key, { ...modification });
      inserted.push(modification);
    }
    return inserted;
  }

  async upsertCalendar(accountId: string, events: readonly NewsEvent[]): Promise<NewsEvent[]> {
    const stored = this.bucket(this.calendar, accountId);
    const inserted: NewsEvent[] = [];
    for (const event of events) {
      if (!stored.has(event.eventId)) inserted.push(event);
      stored.set(event.eventId, { ...event });
    }
    return inserted;
  }

  async loadDealsForPositions(accountId: string, positionIds: readonly number[]): Promise<Deal[]> {
    const wanted = new Set(positionIds);
    return [...this.bucket(this.deals, accountId).values()].filter((deal) => wanted.has(deal.positionId));
  }

  async upsertTrades(accountId: string, trades: readonly AggregatedTrade[]): Promise<void> {
    const stored = this.bucket(this.trades, accountId);
    for (const trade of trades) stored.set(trade.positionId, { ...trade });
  }

  async ensureEas(accountId: string, magics: readonly number[]): Promise<void> {
    const stored = this.bucket(this.eas, accountId);
    for (const magic of magics) {
      if (!stored.has(magic)) stored.set(magic, { name: `EA ${magic}`, baselineExpectancyR: null, baselineStdDevR: null });
    }
  }

  async loadEngineInput(accountId: string, userId: string) {
    const account = this.accounts.get(accountId);
    if (account === undefined || account.userId !== userId) throw new Error('no such account for this user');
    const rows = [...this.bucket(this.trades, accountId).values()].map(toRow(accountId));
    return {
      dataset: {
        account: {
          login: account.login,
          server: account.server,
          currency: account.currency,
          balance: account.balance,
          equity: account.equity,
          leverage: account.leverage,
        },
        trades: tradesFromRows(rows, account.balance),
        modifications: [...this.bucket(this.modifications, accountId).values()],
        calendar: [...this.bucket(this.calendar, accountId).values()],
        eas: [...this.bucket(this.eas, accountId).entries()].map(([magic, ea]) => ({ magic, ...ea })),
        symbolInfo: { ...account.symbolInfo },
      },
      settings: this.settings.get(userId) ?? {},
    };
  }

  async writeSnapshots(accountId: string, snapshots: readonly SnapshotRecord[]): Promise<void> {
    const stored = this.bucket(this.snapshots, accountId);
    for (const snapshot of snapshots) stored.set(snapshot.day, snapshot);
  }

  async replaceFindings(accountId: string, findings: readonly FindingRecord[]): Promise<void> {
    this.findings.set(accountId, [...findings]);
  }

  /** The account a test cares about — the only one, usually. */
  accountFor(login: number): MemoryAccount | undefined {
    return [...this.accounts.values()].find((account) => account.login === login);
  }
}

/** A stored trade as the `trades` table holds it, so the read path is the real one. */
function toRow(accountId: string) {
  return (trade: AggregatedTrade): TradeRow => ({
    account_id: accountId,
    position_id: trade.positionId,
    id: trade.id,
    symbol: trade.symbol,
    magic: trade.magic,
    comment: trade.comment,
    direction: trade.direction,
    volume: trade.volume,
    open_time: trade.openTime,
    close_time: trade.closeTime,
    open_price: trade.openPrice,
    close_price: trade.closePrice,
    initial_sl: trade.initialSl,
    initial_tp: trade.initialTp,
    final_sl: trade.finalSl,
    final_tp: trade.finalTp,
    gross_profit: trade.grossProfit,
    commission: trade.commission,
    swap: trade.swap,
    net_profit: trade.netProfit,
    mfe_price: trade.mfePrice,
    mae_price: trade.maePrice,
    spread_points_at_entry: trade.spreadPointsAtEntry,
    spread_points_at_exit: trade.spreadPointsAtExit,
    contract_size: trade.contractSize,
    duration_seconds: trade.durationSeconds,
    entry_deal_ticket: trade.entryDealTicket,
    exit_deal_ticket: trade.exitDealTicket,
    rebuilt_at: '',
  });
}

export { toRow as tradeToRow };
