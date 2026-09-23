import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { SectionHeading } from '@/components/ui';
import { VaultScreen } from '@/components/vault/VaultScreen';
import { getDemoVault } from '@/lib/demo/vault';

/**
 * `/vault` — The Vault (CLAUDE.md §4, §8.7, §17 Stage 5).
 *
 * The 90-day history as shelves of ingots, one a day, and the Discipline
 * Replay (§6.11) for any day of it. Until Stage 8 brings real accounts it
 * reads the demo, and says so in the header.
 *
 * Prerendered: the shelves are real HTML before any script runs. The replay a
 * reader opens is read from the query string (`?day=`) as the page hydrates.
 */

export const metadata: Metadata = {
  title: 'The Vault — Kavrix demo',
  description:
    'Ninety days of XAUUSD trading as a calendar of ingots — each filled by the day’s P&L and engraved with its Karat — and the Discipline Replay of any day. Demo data, deterministic seed.',
};

export const dynamic = 'force-static';

export default function VaultPage() {
  const view = getDemoVault();
  const tradingDays = view.months.reduce((total, month) => total + month.summary.tradingDays, 0);

  return (
    <AppShell accountLabel="XAUUSD · Demo" periodLabel="Last 90 days" current="vault" demo>
      <div className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <SectionHeading
            index="03"
            title="The Vault"
            as="h1"
            subtitle="Every day of the history, an ingot. Its fill is the day’s P&L — the whole account, EAs included — and its engraving the day’s Karat: that day’s manual trades, unweighted."
          />
          <p className="font-mono text-[11px] text-text-3">
            {tradingDays} trading days · {view.firstDate} → {view.lastDate} · UTC
          </p>
        </div>

        <ul
          aria-label="How to read an ingot"
          className="flex flex-wrap gap-x-7 gap-y-3 text-[11px] text-text-3"
        >
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="relative block h-3.5 w-6 rounded-[2px] bg-surface-2">
              <span className="absolute inset-x-0 bottom-1/2 top-0.5 rounded-t-[1px] bg-jade/50" />
            </span>
            Profit fills up from the middle
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="relative block h-3.5 w-6 rounded-[2px] bg-surface-2">
              <span className="absolute inset-x-0 bottom-0.5 top-1/2 rounded-b-[1px] bg-oxblood/50" />
            </span>
            Loss fills down, to the largest day
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="font-mono text-gold-light">22.4</span>
            Engraving: the day&rsquo;s Karat, brighter when purer
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="block h-3.5 w-6 rounded-[2px] border border-dashed border-line" />
            No trades
          </li>
        </ul>

        <VaultScreen view={view} />
      </div>
    </AppShell>
  );
}
