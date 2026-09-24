/**
 * A signed-in trader's workspace: who they are, their linked MT5 accounts,
 * their thresholds, and — for the account on screen — everything the engine
 * reads. Server-only. Every query runs as the user, under RLS (§13): this
 * module could not read another trader's rows if it tried.
 *
 * Memoised per request with React's `cache`, so a page and its metadata
 * share one set of queries.
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { EngineSettings } from '@/lib/engine';
import { LOGIN_PATH } from '@/lib/auth/paths';
import type { KavrixClient } from '@/lib/supabase/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { selectAll } from '@/lib/supabase/select';
import type { AccountDataset } from '@/lib/views/account';
export { selectAll };
import type { AccountRow, SettingsRow } from './rows';
import {
  accountFromRow,
  eaFromRow,
  engineSettingsFromRow,
  modificationFromRow,
  newsFromRow,
  symbolInfoFromJson,
  tradesFromRows,
} from './rows';

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface Workspace {
  supabase: KavrixClient;
  user: SessionUser;
  /** Every linked MT5 account, most recently synced first. */
  accounts: AccountRow[];
  /** The account on screen: the most recently synced, or `null` before the first sync. */
  account: AccountRow | null;
  settings: SettingsRow | null;
  engineSettings: Partial<EngineSettings>;
  /** This request's "now": the end of the rolling window, and the clock heartbeats are aged against. */
  nowMs: number;
}

/** The session's user, or a redirect to sign in. */
export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const supabase = await createSupabaseServerClient();
  if (supabase === null) redirect(LOGIN_PATH);
  const { data } = await supabase.auth.getUser();
  if (data.user === null) redirect(LOGIN_PATH);

  const [accounts, settings] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .order('last_ingest_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('settings').select('*').maybeSingle(),
  ]);
  if (accounts.error !== null) throw new Error(`database read failed: ${accounts.error.message}`);

  const rows = accounts.data ?? [];
  return {
    supabase,
    user: { id: data.user.id, email: data.user.email ?? null },
    accounts: rows,
    account: rows[0] ?? null,
    settings: settings.data ?? null,
    engineSettings: engineSettingsFromRow(settings.data ?? null),
    nowMs: Date.now(),
  };
});

/** Everything the engine reads for one account, in the engine's own types. */
export const loadAccountDataset = cache(async (accountId: string): Promise<AccountDataset | null> => {
  const { supabase, accounts } = await requireWorkspace();
  const row = accounts.find((account) => account.id === accountId);
  if (row === undefined) return null;

  const [trades, modifications, calendar, eas] = await Promise.all([
    selectAll((from, to) =>
      supabase.from('trades').select('*').eq('account_id', accountId).order('position_id').range(from, to),
    ),
    selectAll((from, to) =>
      supabase
        .from('sl_modifications')
        .select('*')
        .eq('account_id', accountId)
        .order('position_id')
        .order('time')
        .range(from, to),
    ),
    selectAll((from, to) =>
      supabase.from('news_events').select('*').eq('account_id', accountId).order('event_id').range(from, to),
    ),
    selectAll((from, to) =>
      supabase.from('eas').select('*').eq('account_id', accountId).order('magic').range(from, to),
    ),
  ]);

  return {
    account: accountFromRow(row),
    trades: tradesFromRows(trades, row.balance),
    modifications: modifications.map(modificationFromRow),
    calendar: calendar.map(newsFromRow),
    eas: eas.map(eaFromRow),
    symbolInfo: symbolInfoFromJson(row.symbol_info),
  };
});

/** `12345678 · Broker-Live`, for the shell's account label. */
export function accountLabel(account: AccountRow | null): string {
  return account === null ? 'No account linked' : `${account.login} · ${account.server}`;
}
