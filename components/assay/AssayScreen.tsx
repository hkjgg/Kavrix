import { Scene, SectionHeading } from '@/components/ui';
import type { AssayResult } from '@/lib/engine';
import { AssayInstrument, type SubDialView } from './AssayInstrument';
import { ExplainProvider } from './ExplainProvider';
import { GapScene } from './GapScene';
import { ProofScene } from './ProofScene';
import { RefineryScene } from './RefineryScene';
import { EXPLAIN_IDS, buildExplainIndex, pillarScopeLabel } from './explain';

/**
 * The Assay (CLAUDE.md §4, §17 Stages 3 and 3.5).
 *
 * One page, four scenes, each with its own idea and its own entrance, played
 * once as it scrolls into view:
 *
 *   01 — The Assay      the instrument: the Karat dial and its six sub-dials
 *   02 — The Refinery   the three findings worth acting on
 *   03 — The Gap        what indiscipline cost, as a curve and as a bill
 *   04 — Your Proof     the trader's own weeks, scored one by one
 *
 * A server component: the engine result is read here and nothing but the
 * props each visual needs crosses into the browser. The Karat is the hero of
 * the page — no other figure on it is set larger.
 */

/** Deductions shown beside a sub-dial on hover, before "and N more". */
const SUMMARY_LINES = 2;

function subDials(assay: AssayResult): SubDialView[] {
  return assay.karat.pillars.map((pillar) => {
    const deductions = [...pillar.deductions].sort((a, b) => b.pointsLost - a.pointsLost);
    return {
      key: pillar.key,
      label: pillar.label,
      points: pillar.points,
      maxPoints: pillar.maxPoints,
      explainId: EXPLAIN_IDS.pillar(pillar.key),
      summary: deductions.slice(0, SUMMARY_LINES).map((deduction) => ({
        label: `${deduction.reason} · ${
          deduction.tradeIds.length === 1 ? '1 trade' : `${deduction.tradeIds.length} trades`
        }`,
        value: `−${deduction.pointsLost.toFixed(2)}`,
      })),
      moreCount: Math.max(deductions.length - SUMMARY_LINES, 0),
    };
  });
}

function InstrumentScene({ assay }: { assay: AssayResult }) {
  const { karat, delta } = assay;
  const windowLabel = `${karat.windowStart.slice(0, 10)} → ${karat.windowEnd.slice(0, 10)}`;

  return (
    <Scene aria-labelledby="scene-assay">
      <AssayInstrument
        dial={{
          karat: karat.karat,
          tierLabel: karat.tier?.label ?? null,
          deltaKarat: delta.delta,
          tradeCount: karat.tradeCount,
          minimumTrades: karat.minimumTrades,
          periodLabel: 'Karat · 30 days',
          explainId: EXPLAIN_IDS.karat,
        }}
        pillars={subDials(assay)}
        scopeLabel={pillarScopeLabel(assay.settings)}
        reading={{
          window: windowLabel,
          points: `${karat.points.toFixed(1)} / ${karat.maxPoints}`,
          trades: String(karat.tradeCount),
        }}
        intro={
          <div className="flex flex-col gap-5">
            <SectionHeading id="scene-assay" index="01" title="The Assay" as="h1" />
            <p className="max-w-sm font-serif text-lg italic leading-snug text-text-3 lg:text-xl">
              Profit tells you what happened. Karat tells you if it will last.
            </p>
          </div>
        }
      />
    </Scene>
  );
}

export function AssayScreen({ assay }: { assay: AssayResult }) {
  return (
    <ExplainProvider index={buildExplainIndex(assay)}>
      <div className="flex flex-col gap-28 sm:gap-36 lg:gap-44">
        <InstrumentScene assay={assay} />
        <RefineryScene assay={assay} />
        <GapScene assay={assay} />
        <ProofScene assay={assay} />

        <p className="max-w-3xl text-xs leading-relaxed text-text-3">
          Every number on this page opens its own explanation: the formula it comes
          from, the trades behind it, and how much weight the evidence carries. Nothing
          here is estimated — the engine computes it, and the page only draws it.
        </p>
      </div>
    </ExplainProvider>
  );
}
