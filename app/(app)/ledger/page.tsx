import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { LedgerScreen } from '@/components/ledger/LedgerScreen';
import { SectionHeading } from '@/components/ui';
import { HallmarkLegend } from '@/components/viz/HallmarkLegend';
import { getDemoLedger } from '@/lib/demo/ledger';
import { packLedgerRows } from '@/lib/ledger/pack';

/**
 * `/ledger` — The Ledger (CLAUDE.md §4, §17 Stage 4).
 *
 * Every closed trade on the demo account, manual and EA, newest first. Until
 * Stage 8 brings real accounts it reads the demo, and says so in the header.
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
      <div className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <SectionHeading
            index="02"
            title="The Ledger"
            as="h1"
            subtitle="Every closed trade, newest first. Manual trades are what the Karat scores; EA trades are listed too, and measured for EA Health rather than scored."
          />
          <p className="font-mono text-[11px] text-text-3">
            {rows.length} trades · all times UTC
          </p>
        </div>

        <HallmarkLegend riskLimitPercent={context.riskLimitPercent} />

        <LedgerScreen
          packed={packLedgerRows(rows)}
          asOfMs={context.asOfMs}
          currency={context.currency}
          riskLimitPercent={context.riskLimitPercent}
          sources={context.sources}
          hasOffSession={context.hasOffSession}
        />
      </div>
    </AppShell>
  );
}
