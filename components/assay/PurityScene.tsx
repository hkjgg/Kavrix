import { Scene, SectionHeading } from '@/components/ui';
import type { AssayResult } from '@/lib/engine';
import { PurityLine } from './PurityLine';
import { historyPeriodLabel } from './explain';
import { buildPurityView } from './purity';

/**
 * `05 — The Purity Line` (CLAUDE.md §8.4) — the account's money, lit by its
 * discipline.
 *
 * The view is built here, on the server, from the engine's equity curve, its
 * daily Karat series and its What-if scenarios; the chart that draws it is
 * the only client code in the scene.
 */
export function PurityScene({ assay }: { assay: AssayResult }) {
  const view = buildPurityView(assay);

  return (
    <Scene aria-labelledby="scene-purity">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <SectionHeading id="scene-purity" index="05" title="The Purity Line" />
        <p className="max-w-md text-sm text-text-3 lg:text-right">
          Your equity, lit by your discipline — bright where the Karat was high, dull where it was
          not.
        </p>
      </div>

      <p className="mt-4 font-mono text-[11px] text-text-3">
        Whole account, EAs included · {historyPeriodLabel(assay)} · colour is the rolling{' '}
        {assay.settings.rollingWindowDays}-day Karat at each day&rsquo;s close
      </p>

      <div className="mt-10 lg:mt-12">
        <PurityLine view={view} />
      </div>
    </Scene>
  );
}
