/**
 * A signed-in trader's Wrapped, one month at a time, and the certificates it
 * issues. Server-only; every query runs as the user, under RLS.
 */

import { cache } from 'react';
import type { WrappedView } from '@/components/wrapped/wrapped';
import type { CertificateChapter, MonthKey, WrappedResult } from '@/lib/engine';
import { defaultWrappedMonth, isMonthKey, wrappedMonths } from '@/lib/engine';
import { APP_ROUTES } from '@/lib/routes';
import { wrappedForMonth, wrappedView } from '@/lib/views/account';
import type { AccountSurface } from './surface';
import { loadAccountSurface } from './surface';

export type AccountWrapped =
  | { kind: 'empty'; surface: AccountSurface }
  | { kind: 'missing' }
  | { kind: 'ready'; wrapped: WrappedResult; view: WrappedView; months: MonthKey[] };

export const loadAccountWrapped = cache(async (requested: string | null): Promise<AccountWrapped> => {
  const surface = await loadAccountSurface();
  if (surface.kind !== 'ready') return { kind: 'empty', surface };

  const months = wrappedMonths(surface.assay.trades, surface.asOfMs);
  const month = requested ?? defaultWrappedMonth(months, surface.asOfMs) ?? months[months.length - 1] ?? null;
  if (month === null || !isMonthKey(month) || !months.includes(month)) return { kind: 'missing' };

  const wrapped = wrappedForMonth(month, surface.dataset, surface.workspace.engineSettings, surface.asOfMs, false);
  const view = wrappedView(wrapped, months, surface.asOfMs, surface.dataset.account.currency, APP_ROUTES);
  await issueCertificate(surface, wrapped);
  return { kind: 'ready', wrapped, view, months };
});

function certificateOf(wrapped: WrappedResult): CertificateChapter | null {
  const chapter = wrapped.chapters.find((entry) => entry.kind === 'certificate');
  return wrapped.state === 'scored' && chapter?.kind === 'certificate' ? chapter : null;
}

/**
 * Records the month's certificate in `certificates`, so `/verify/[serial]`
 * can resolve it. A running month's is updated as the month goes on. Never
 * throws: a certificate that cannot be stored (a serial another account
 * already holds) is still drawn — it just cannot be verified.
 */
async function issueCertificate(surface: Extract<AccountSurface, { kind: 'ready' }>, wrapped: WrappedResult): Promise<void> {
  const chapter = certificateOf(wrapped);
  const account = surface.workspace.account;
  if (chapter === null || account === null) return;
  await surface.workspace.supabase.from('certificates').upsert(
    {
      serial: chapter.serial,
      account_id: account.id,
      month: wrapped.month,
      karat: chapter.karat,
      tier: chapter.tier,
      trade_count: chapter.tradeCount,
      trading_days: chapter.tradingDays,
      period: chapter.period,
      partial: chapter.partial,
    },
    { onConflict: 'account_id,month' },
  );
}

export { certificateOf };
