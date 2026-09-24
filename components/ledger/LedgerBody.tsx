import { LedgerScreen } from '@/components/ledger/LedgerScreen';
import { SectionHeading } from '@/components/ui';
import { HallmarkLegend } from '@/components/viz/HallmarkLegend';
import { packLedgerRows } from '@/lib/ledger/pack';
import type { LedgerData } from '@/lib/views/account';

/** The Ledger's page body, for the demo and for a real account alike. */
export function LedgerBody({ rows, context }: LedgerData) {
  return (
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
  );
}
