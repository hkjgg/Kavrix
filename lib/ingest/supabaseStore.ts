/**
 * The production `IngestStore`: Supabase, through the service-role client.
 *
 * The service role bypasses RLS, so this file is where the ingest API's
 * isolation lives: every statement is filtered by the account id (or token
 * id) the service resolved from the connector token — never by anything the
 * request body alone says. Idempotency lives in the table keys (see the
 * migration): an insert of a known ticket does nothing, and PostgREST returns
 * only the rows it actually inserted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Deal, NewsEvent, SlModification, SymbolInfo } from '@/lib/engine';
import {
  accountFromRow,
  eaFromRow,
  engineSettingsFromRow,
  isoUtc,
  modificationFromRow,
  newsFromRow,
  symbolInfoFromJson,
  tradesFromRows,
} from '@/lib/account/rows';
import type { Database, Json } from '@/lib/supabase/database.types';
import { chunks, selectAll } from '@/lib/supabase/select';
import type { AggregatedTrade } from './aggregate';
import type { AccountRecord, FindingRecord, IngestStore, SnapshotRecord, TokenRecord } from './store';

type Client = SupabaseClient<Database>;

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error !== null) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data;
}

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`${what} returned nothing`);
  return value;
}

function toAccountRecord(row: { id: string; user_id: string; login: number; server: string; symbol_info: Json }): AccountRecord {
  return { id: row.id, userId: row.user_id, login: row.login, server: row.server, symbolInfo: symbolInfoFromJson(row.symbol_info) };
}

export class SupabaseIngestStore implements IngestStore {
  constructor(private readonly db: Client) {}

  async findTokenByHash(hash: string): Promise<TokenRecord | null> {
    const row = check(
      await this.db.from('connector_tokens').select('id, user_id, account_id, revoked_at').eq('token_hash', hash).maybeSingle(),
      'token lookup',
    );
    return row === null ? null : { id: row.id, userId: row.user_id, accountId: row.account_id, revokedAt: row.revoked_at };
  }

  async hitRateLimit(tokenId: string, windowSeconds: number): Promise<number> {
    return required(
      check(await this.db.rpc('ingest_rate_hit', { p_token_id: tokenId, p_window_seconds: windowSeconds }), 'rate limit'),
      'rate limit',
    );
  }

  async touchToken(tokenId: string, at: string): Promise<void> {
    check(await this.db.from('connector_tokens').update({ last_seen_at: at }).eq('id', tokenId), 'token touch');
  }

  async bindToken(tokenId: string, accountId: string): Promise<void> {
    check(
      await this.db.from('connector_tokens').update({ account_id: accountId }).eq('id', tokenId).is('account_id', null),
      'token bind',
    );
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const row = check(
      await this.db.from('accounts').select('id, user_id, login, server, symbol_info').eq('id', accountId).maybeSingle(),
      'account read',
    );
    return row === null ? null : toAccountRecord(row);
  }

  async upsertAccount(
    userId: string,
    account: { login: number; server: string; currency: string; balance: number; equity: number; leverage: number },
    symbolInfo: Record<string, SymbolInfo>,
    at: string,
  ): Promise<AccountRecord> {
    const existing = check(
      await this.db
        .from('accounts')
        .select('symbol_info')
        .eq('user_id', userId)
        .eq('login', account.login)
        .eq('server', account.server)
        .maybeSingle(),
      'account read',
    );
    const merged = { ...symbolInfoFromJson(existing?.symbol_info ?? {}), ...symbolInfo };
    const row = check(
      await this.db
        .from('accounts')
        .upsert(
          {
            user_id: userId,
            login: account.login,
            server: account.server,
            currency: account.currency,
            balance: account.balance,
            equity: account.equity,
            leverage: account.leverage,
            symbol_info: merged as unknown as Json,
            last_heartbeat_at: at,
          },
          { onConflict: 'user_id,login,server' },
        )
        .select('id, user_id, login, server, symbol_info')
        .single(),
      'account upsert',
    );
    return toAccountRecord(required(row, 'account upsert'));
  }

  async markIngested(accountId: string, at: string): Promise<void> {
    check(await this.db.from('accounts').update({ last_ingest_at: at }).eq('id', accountId), 'account update');
  }

  async insertDeals(accountId: string, deals: readonly Deal[]): Promise<number[]> {
    if (deals.length === 0) return [];
    const rows = deals.map((deal) => ({
      account_id: accountId,
      ticket: deal.ticket,
      position_id: deal.positionId,
      time: deal.time,
      type: deal.type,
      entry: deal.entry,
      symbol: deal.symbol,
      volume: deal.volume,
      price: deal.price,
      sl: deal.sl,
      tp: deal.tp,
      profit: deal.profit,
      commission: deal.commission,
      swap: deal.swap,
      magic: deal.magic,
      comment: deal.comment,
      spread_points: deal.spreadPoints,
    }));
    const inserted = check(
      await this.db.from('deals').upsert(rows, { onConflict: 'account_id,ticket', ignoreDuplicates: true }).select('ticket'),
      'deal insert',
    );
    return (inserted ?? []).map((row) => row.ticket);
  }

  async insertModifications(accountId: string, modifications: readonly SlModification[]): Promise<SlModification[]> {
    if (modifications.length === 0) return [];
    const inserted = check(
      await this.db
        .from('sl_modifications')
        .upsert(
          modifications.map((modification) => ({
            account_id: accountId,
            position_id: modification.positionId,
            time: modification.time,
            sl: modification.sl,
            tp: modification.tp,
          })),
          { onConflict: 'account_id,position_id,time', ignoreDuplicates: true },
        )
        .select('position_id, time'),
      'modification insert',
    );
    const keys = new Set((inserted ?? []).map((row) => `${row.position_id}|${Date.parse(row.time)}`));
    return modifications.filter((modification) => keys.has(`${modification.positionId}|${Date.parse(modification.time)}`));
  }

  async upsertCalendar(accountId: string, events: readonly NewsEvent[]): Promise<NewsEvent[]> {
    if (events.length === 0) return [];
    const known = new Set<number>();
    for (const ids of chunks(events.map((event) => event.eventId), 200)) {
      const rows = check(
        await this.db.from('news_events').select('event_id').eq('account_id', accountId).in('event_id', ids),
        'calendar read',
      );
      for (const row of rows ?? []) known.add(row.event_id);
    }
    check(
      await this.db.from('news_events').upsert(
        events.map((event) => ({
          account_id: accountId,
          event_id: event.eventId,
          time: event.time,
          currency: event.currency,
          importance: event.importance,
          name: event.name,
        })),
        { onConflict: 'account_id,event_id' },
      ),
      'calendar upsert',
    );
    return events.filter((event) => !known.has(event.eventId));
  }

  async loadDealsForPositions(accountId: string, positionIds: readonly number[]): Promise<Deal[]> {
    const deals: Deal[] = [];
    for (const ids of chunks([...positionIds], 200)) {
      const rows = await selectAll((from, to) =>
        this.db.from('deals').select('*').eq('account_id', accountId).in('position_id', ids).order('ticket').range(from, to),
      );
      for (const row of rows) {
        deals.push({
          ticket: row.ticket,
          positionId: row.position_id,
          time: isoUtc(row.time),
          type: row.type === 'sell' ? 'sell' : 'buy',
          entry: row.entry === 'out' ? 'out' : 'in',
          symbol: row.symbol,
          volume: row.volume,
          price: row.price,
          sl: row.sl,
          tp: row.tp,
          profit: row.profit,
          commission: row.commission,
          swap: row.swap,
          magic: row.magic,
          comment: row.comment,
          spreadPoints: row.spread_points,
        });
      }
    }
    return deals;
  }

  async upsertTrades(accountId: string, trades: readonly AggregatedTrade[]): Promise<void> {
    const at = new Date().toISOString();
    for (const batch of chunks([...trades], 200)) {
      check(
        await this.db.from('trades').upsert(
          batch.map((trade) => ({
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
            rebuilt_at: at,
          })),
          { onConflict: 'account_id,position_id' },
        ),
        'trade upsert',
      );
    }
  }

  async ensureEas(accountId: string, magics: readonly number[]): Promise<void> {
    if (magics.length === 0) return;
    check(
      await this.db
        .from('eas')
        .upsert(
          magics.map((magic) => ({ account_id: accountId, magic, name: `EA ${magic}` })),
          { onConflict: 'account_id,magic', ignoreDuplicates: true },
        ),
      'EA insert',
    );
  }

  async loadEngineInput(accountId: string, userId: string) {
    const read = await this.db.from('accounts').select('*').eq('id', accountId).eq('user_id', userId).single();
    if (read.error !== null) throw new Error(`account read failed: ${read.error.message}`);
    const account = read.data;
    const [trades, modifications, calendar, eas, settings] = await Promise.all([
      selectAll((from, to) => this.db.from('trades').select('*').eq('account_id', accountId).order('position_id').range(from, to)),
      selectAll((from, to) =>
        this.db.from('sl_modifications').select('*').eq('account_id', accountId).order('position_id').order('time').range(from, to),
      ),
      selectAll((from, to) => this.db.from('news_events').select('*').eq('account_id', accountId).order('event_id').range(from, to)),
      selectAll((from, to) => this.db.from('eas').select('*').eq('account_id', accountId).order('magic').range(from, to)),
      this.db.from('settings').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    return {
      dataset: {
        account: accountFromRow(account),
        trades: tradesFromRows(trades, account.balance),
        modifications: modifications.map(modificationFromRow),
        calendar: calendar.map(newsFromRow),
        eas: eas.map(eaFromRow),
        symbolInfo: symbolInfoFromJson(account.symbol_info),
      },
      settings: engineSettingsFromRow(settings.data ?? null),
    };
  }

  async writeSnapshots(accountId: string, snapshots: readonly SnapshotRecord[]): Promise<void> {
    const at = new Date().toISOString();
    for (const batch of chunks([...snapshots], 100)) {
      check(
        await this.db.from('karat_snapshots').upsert(
          batch.map((snapshot) => ({
            account_id: accountId,
            day: snapshot.day,
            as_of: snapshot.asOf,
            state: snapshot.state,
            karat: snapshot.karat,
            points: snapshot.points,
            tier: snapshot.tier,
            trade_count: snapshot.tradeCount,
            pillars: snapshot.pillars as Json,
            computed_at: at,
          })),
          { onConflict: 'account_id,day' },
        ),
        'snapshot upsert',
      );
    }
  }

  async replaceFindings(accountId: string, findings: readonly FindingRecord[]): Promise<void> {
    check(await this.db.from('findings').delete().eq('account_id', accountId), 'findings clear');
    if (findings.length === 0) return;
    check(
      await this.db.from('findings').insert(
        findings.map((finding) => ({
          account_id: accountId,
          finding_key: finding.key,
          refinery_rank: finding.refineryRank,
          kind: finding.kind,
          severity: finding.severity,
          headline: finding.headline,
          tentative: finding.tentative,
          finding: finding.finding as Json,
          as_of: finding.asOf,
        })),
      ),
      'findings insert',
    );
  }
}
