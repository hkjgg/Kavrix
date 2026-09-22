import { SectionHeading } from '@/components/ui';
import type { AssayResult } from '@/lib/engine';
import { ExplainProvider } from './ExplainProvider';
import { GapCard, type GapScopeView } from './GapCard';
import { KaratCard } from './KaratCard';
import { ProofCard } from './ProofCard';
import { RefineryCard } from './RefineryCard';
import { EXPLAIN_IDS, buildExplainIndex } from './explain';

/**
 * `01 — The Assay` (CLAUDE.md §4, §17 Stage 3).
 *
 * A server component: the engine result is read here and nothing but the props
 * each visual needs crosses into the browser. The dial is the hero on the
 * left; the Gap and Your Proof sit beside it; the Refinery runs full width
 * beneath, where three findings can be read side by side.
 */

function gapScopes(assay: AssayResult): GapScopeView[] {
  const windowCaption = `${assay.karat.windowStart.slice(0, 10)} → ${assay.karat.windowEnd.slice(0, 10)}`;
  const first = assay.trades[0];
  const allCaption =
    first === undefined
      ? windowCaption
      : `${first.openTime.slice(0, 10)} → ${assay.asOf.slice(0, 10)}`;

  return [
    {
      key: 'window',
      toggleLabel: '30-day window',
      caption: windowCaption,
      totalMoney: assay.gap.totalCostMoney,
      totalR: assay.gap.totalCostR,
      currency: assay.gap.currency,
      impurityCount: assay.gap.impurityCount,
      tradeCount: assay.gap.tradeCount,
      explainId: EXPLAIN_IDS.gapTotal('window'),
      lines: assay.gap.lines.map((line) => ({
        pillar: line.pillar,
        label: line.label,
        costMoney: line.costMoney,
        costR: line.costR,
        tradeCount: line.tradeCount,
        explainId: EXPLAIN_IDS.gapLine('window', line.pillar),
      })),
    },
    {
      key: 'all',
      toggleLabel: '90-day total',
      caption: allCaption,
      totalMoney: assay.gapAllTime.totalCostMoney,
      totalR: assay.gapAllTime.totalCostR,
      currency: assay.gapAllTime.currency,
      impurityCount: assay.gapAllTime.impurityCount,
      tradeCount: assay.gapAllTime.tradeCount,
      explainId: EXPLAIN_IDS.gapTotal('all'),
      lines: assay.gapAllTime.lines.map((line) => ({
        pillar: line.pillar,
        label: line.label,
        costMoney: line.costMoney,
        costR: line.costR,
        tradeCount: line.tradeCount,
        explainId: EXPLAIN_IDS.gapLine('all', line.pillar),
      })),
    },
  ];
}

export function AssayScreen({ assay }: { assay: AssayResult }) {
  return (
    <ExplainProvider index={buildExplainIndex(assay)}>
      <div className="flex flex-col gap-8 lg:gap-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <SectionHeading index="01" title="The Assay" as="h1" />
          <p className="max-w-md font-serif text-base italic leading-snug text-text-3 sm:text-lg lg:text-right">
            Profit tells you what happened. Karat tells you if it will last.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <KaratCard assay={assay} />
          </div>
          <div className="flex flex-col gap-6 lg:col-span-5">
            <GapCard scopes={gapScopes(assay)} />
            <ProofCard assay={assay} />
          </div>
        </div>

        <RefineryCard assay={assay} />

        <p className="max-w-3xl text-xs leading-relaxed text-text-3">
          Every number on this page opens its own explanation: the formula it comes
          from, the trades behind it, and how much weight the evidence carries. Nothing
          here is estimated — the engine computes it, and the page only draws it.
        </p>
      </div>
    </ExplainProvider>
  );
}
