/**
 * What the ingest pipeline needs from storage, and nothing more. Two
 * implementations: `supabaseStore.ts` (production, the service role) and
 * `memoryStore.ts` (tests, the simulator's dry run). The service is written
 * against this interface, so the pipeline's behaviour — idempotency,
 * heartbeats, rebuilds, snapshots — is tested without a network.
 *
 * The service role bypasses RLS, so every method is scoped to one account (or
 * one token) by its arguments. None of them reads across accounts.
 */

import type { Account, Deal, NewsEvent, SlModification, SymbolInfo } from '@/lib/engine';
import type { EngineSettings } from '@/lib/engine';
import type { AccountDataset } from '@/lib/views/account';
import type { AggregatedTrade } from './aggregate';

export interface TokenRecord {
  id: string;
  userId: string;
  /** The account the token is bound to, after its first use. */
  accountId: string | null;
  revokedAt: string | null;
}

export interface AccountRecord {
  id: string;
  userId: string;
  login: number;
  server: string;
  /** Merged across every batch the account has sent. */
  symbolInfo: Record<string, SymbolInfo>;
}

export interface SnapshotRecord {
  day: string;
  asOf: string;
  state: 'scored' | 'assaying';
  karat: number | null;
  points: number | null;
  tier: string | null;
  tradeCount: number;
  pillars: unknown;
}

export interface FindingRecord {
  key: string;
  refineryRank: number | null;
  kind: string;
  severity: string;
  headline: string;
  tentative: boolean;
  finding: unknown;
  asOf: string;
}

export interface IngestStore {
  findTokenByHash(hash: string): Promise<TokenRecord | null>;
  /** Counts one request in the token's current window; returns the count so far. */
  hitRateLimit(tokenId: string, windowSeconds: number): Promise<number>;
  touchToken(tokenId: string, at: string): Promise<void>;
  bindToken(tokenId: string, accountId: string): Promise<void>;

  getAccount(accountId: string): Promise<AccountRecord | null>;
  /**
   * Creates or updates the user's account for this login and server: the
   * account facts, the heartbeat time, and `symbolInfo` merged over what is
   * stored. Returns the account with its merged symbol info.
   */
  upsertAccount(userId: string, account: Account, symbolInfo: Record<string, SymbolInfo>, at: string): Promise<AccountRecord>;
  markIngested(accountId: string, at: string): Promise<void>;

  /** Inserts the deals whose ticket is new; returns the tickets inserted. */
  insertDeals(accountId: string, deals: readonly Deal[]): Promise<number[]>;
  /** Inserts the modifications new by (position, time); returns how many. */
  insertModifications(accountId: string, modifications: readonly SlModification[]): Promise<SlModification[]>;
  /** Inserts new events and updates known ones (a release can be rescheduled); returns the new ones. */
  upsertCalendar(accountId: string, events: readonly NewsEvent[]): Promise<NewsEvent[]>;

  loadDealsForPositions(accountId: string, positionIds: readonly number[]): Promise<Deal[]>;
  upsertTrades(accountId: string, trades: readonly AggregatedTrade[]): Promise<void>;
  /** Creates an `eas` row for every magic number not seen before, named `EA <magic>`. */
  ensureEas(accountId: string, magics: readonly number[]): Promise<void>;

  /** Everything the engine reads for the account, and its owner's thresholds. */
  loadEngineInput(accountId: string, userId: string): Promise<{ dataset: AccountDataset; settings: Partial<EngineSettings> }>;
  writeSnapshots(accountId: string, snapshots: readonly SnapshotRecord[]): Promise<void>;
  replaceFindings(accountId: string, findings: readonly FindingRecord[]): Promise<void>;
}
