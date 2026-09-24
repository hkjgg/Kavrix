import { SectionHeading } from '@/components/ui';
import { VaultScreen } from '@/components/vault/VaultScreen';
import type { VaultView } from '@/components/vault/vault';
import { Ingot, IngotDefs, IngotSlot } from '@/components/viz/Ingot';
import type { TierKey } from '@/components/viz/ingot';

/** The legend's six metals, one per tier (§6.2), each with a Karat it can stand for. */
const LEGEND_METALS: readonly { tier: TierKey; label: string; karat: number }[] = [
  { tier: 'pure', label: '24K · Pure', karat: 24 },
  { tier: 'refined', label: '22K · Refined', karat: 22.8 },
  { tier: 'solid', label: '18K · Solid', karat: 19.6 },
  { tier: 'mixed', label: '14K · Mixed', karat: 15.2 },
  { tier: 'alloyed', label: '10K · Alloyed', karat: 11.4 },
  { tier: 'raw', label: 'Raw Ore', karat: 7.1 },
];

/** The Vault's page body, for the demo and for a real account alike. */
export function VaultBody({ view }: { view: VaultView }) {
  const tradingDays = view.months.reduce((total, month) => total + month.summary.tradingDays, 0);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <SectionHeading
          index="03"
          title="The Vault"
          as="h1"
          subtitle="Every day of the history, an ingot. Its metal is the day’s Karat — that day’s manual trades, unweighted — and the strip beneath it the day’s P&L: the whole account, EAs included."
        />
        <p className="font-mono text-[11px] text-text-3">
          {tradingDays} trading days · {view.firstDate} → {view.lastDate} · UTC
        </p>
      </div>

      <IngotDefs />

      <div className="flex flex-col gap-4 border-y border-line py-5">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-text-3">How to read an ingot</p>
        <ul aria-label="The metal is the day’s Karat" className="grid max-w-[620px] grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
          {LEGEND_METALS.map((metal) => (
            <li key={metal.tier} className="flex flex-col items-center gap-1.5">
              <span className="block w-14">
                <Ingot tier={metal.tier} karat={metal.karat} strip={{ direction: 'none', share: 0 }} />
              </span>
              <span className="text-center text-[10px] leading-tight text-text-3">{metal.label}</span>
            </li>
          ))}
        </ul>
        <ul aria-label="How to read the rest" className="flex flex-wrap gap-x-7 gap-y-2.5 text-[11px] text-text-3">
          <li>The metal is the day&rsquo;s Karat, struck into the bar</li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="flex w-7 flex-col gap-[3px]">
              <span className="block h-[2px] w-full rounded-full bg-jade" />
              <span className="block h-[2px] w-2/3 self-center rounded-full bg-oxblood" />
            </span>
            Assay strip: the day&rsquo;s P&amp;L against the month&rsquo;s largest day
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="block w-8">
              <IngotSlot />
            </span>
            No trades
          </li>
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
              <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="none" stroke="var(--gold)" strokeWidth="1" />
              <path d="M3.8 7.2 L6 4.8 L8.2 7.2" fill="none" stroke="var(--gold)" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            Hallmark: the month&rsquo;s best and worst day
          </li>
        </ul>
      </div>

      <VaultScreen view={view} />
    </div>
  );
}
