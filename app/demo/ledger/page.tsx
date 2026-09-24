import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { LedgerBody } from '@/components/ledger/LedgerBody';
import { getDemoLedger } from '@/lib/demo/ledger';

/**
 * `/demo/ledger` — The Ledger (CLAUDE.md §4, §17 Stage 4).
 *
 * Every closed trade on the demo account, manual and EA, newest first. A
 * signed-in trader's own Ledger is `/ledger`; the body is shared.
 *
 * Prerendered: the rows are built at build time from the memoised Assay, and
 * the page ships them to one client component that filters, sorts and pages
 * them. The prerendered HTML is the default view — the real table, not a
 * placeholder — and a linked view takes over as the page hydrates.
 */

export const metadata: Metadata = {
  title: 'The Ledger — Kavrix demo',
  description:
    'Every closed trade on the demo account, with its Hallmark, risk, R and impurities. Demo data, deterministic seed.',
};

export const dynamic = 'force-static';

export default function LedgerPage() {
  const { rows, context } = getDemoLedger();

  return (
    <AppShell accountLabel="XAUUSD · Demo" periodLabel="Last 90 days" current="ledger" demo>
      <LedgerBody rows={rows} context={context} />
    </AppShell>
  );
}
