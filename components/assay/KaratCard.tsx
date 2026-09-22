import { Card, Label } from '@/components/ui';
import { AssayDial } from '@/components/viz/AssayDial';
import { PillarRings, type PillarRingDatum } from '@/components/viz/PillarRings';
import type { AssayResult } from '@/lib/engine';
import { EXPLAIN_IDS } from './explain';

/**
 * The hero: the Assay Dial, the six pillar rings under it, and the window the
 * score covers (CLAUDE.md §8.1, §8.2).
 *
 * A server component. The only client code inside it is the dial's sweep and
 * the rings' explain buttons.
 */
export function KaratCard({ assay }: { assay: AssayResult }) {
  const { karat, delta } = assay;

  const pillars: PillarRingDatum[] = karat.pillars.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    points: pillar.points,
    maxPoints: pillar.maxPoints,
    explainId: EXPLAIN_IDS.pillar(pillar.key),
  }));

  const windowStart = karat.windowStart.slice(0, 10);
  const windowEnd = karat.windowEnd.slice(0, 10);

  return (
    <Card className="flex flex-col gap-8 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <Label>The Assay</Label>
        <span className="font-mono text-[11px] text-text-3">
          {windowStart} → {windowEnd}
        </span>
      </div>

      <AssayDial
        karat={karat.karat}
        tierLabel={karat.tier?.label ?? null}
        deltaKarat={delta.delta}
        tradeCount={karat.tradeCount}
        minimumTrades={karat.minimumTrades}
        periodLabel="Karat · 30 days"
        explainId={EXPLAIN_IDS.karat}
      />

      <div className="flex flex-col gap-5 border-t border-line pt-7">
        <div className="flex items-baseline justify-between gap-4">
          <Label>Pillars</Label>
          <span className="font-mono text-[11px] text-text-3">
            {karat.points.toFixed(1)} / {karat.maxPoints} points ·{' '}
            {karat.tradeCount} manual trades
          </span>
        </div>
        <PillarRings pillars={pillars} />
      </div>
    </Card>
  );
}
