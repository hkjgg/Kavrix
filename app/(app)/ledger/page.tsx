import type { Metadata } from 'next';
import { AccountShell } from '@/components/app/AccountShell';
import { LedgerBody } from '@/components/ledger/LedgerBody';
import { loadAccountSurface } from '@/lib/account/surface';
import { buildLedger } from '@/lib/views/account';

/** `/ledger` — every closed trade on the trader's account (CLAUDE.md §4). */

export const metadata: Metadata = { title: 'The Ledger — Kavrix' };
export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  const surface = await loadAccountSurface();
  return (
    <AccountShell surface={surface} current="ledger" periodLabel="All history">
      {surface.kind === 'ready' ? <LedgerBody {...buildLedger(surface.assay, surface.dataset)} /> : null}
    </AccountShell>
  );
}
