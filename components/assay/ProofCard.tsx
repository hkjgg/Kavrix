import { cn } from '@/lib/cn';
import { Card, Label } from '@/components/ui';
import { formatKarat, formatR } from '@/lib/format';
import type { AssayResult } from '@/lib/engine';
import { ExplainButton } from './ExplainButton';
import { EXPLAIN_IDS } from './explain';

/**
 * Your Proof (CLAUDE.md §6.4) — the trader's own disciplined weeks against
 * their own impure ones.
 *
 * The bars diverge from a centre line because the two numbers usually have
 * opposite signs, and the whole point of the card is the distance between
 * them. When the engine hides the card (§6.4), the reason is shown instead of
 * an empty chart — §2 does not let the product sell three weeks as evidence.
 */

interface BarProps {
  label: string;
  weeks: number;
  value: number;
  max: number;
  tone: 'profit' | 'loss';
}

function DivergingBar({ label, weeks, value, max, tone }: BarProps) {
  const share = max > 0 ? Math.min(Math.abs(value) / max, 1) * 50 : 0;
  const positive = value >= 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-text-2">{label}</span>
        <span
          className={cn(
            'font-mono text-sm tabular-nums',
            tone === 'profit' ? 'text-jade' : 'text-oxblood-text',
          )}
        >
          {formatR(value)} a week
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-surface-2">
        <span
          aria-hidden="true"
          className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-line"
        />
        <span
          className="absolute inset-y-0 block rounded-full"
          style={{
            width: `${share}%`,
            left: positive ? '50%' : `${50 - share}%`,
            backgroundColor: tone === 'profit' ? 'var(--jade)' : 'var(--oxblood)',
          }}
        />
      </div>
      <span className="font-mono text-[11px] text-text-3">{weeks} weeks</span>
    </div>
  );
}

export function ProofCard({ assay }: { assay: AssayResult }) {
  const { proof } = assay;

  if (!proof.visible) {
    return (
      <Card className="flex flex-col gap-4">
        <Label>Your Proof</Label>
        <p className="text-sm leading-relaxed text-text-2">
          {proof.hiddenReason ??
            'Not enough scored weeks on either side to compare yet.'}
        </p>
        <p className="text-xs text-text-3">
          The card appears once there are {proof.minWeeksPerBucket} weeks in each
          bucket.
        </p>
      </Card>
    );
  }

  const max = Math.max(
    Math.abs(proof.high.avgWeeklyR),
    Math.abs(proof.low.avgWeeklyR),
  );

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <Label>Your Proof</Label>
        <span className="font-mono text-[11px] text-text-3">
          {proof.weeks.length} weeks scored
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <DivergingBar
          label={`${formatKarat(proof.highKarat)} and above`}
          weeks={proof.high.weekCount}
          value={proof.high.avgWeeklyR}
          max={max}
          tone="profit"
        />
        <DivergingBar
          label={`Under ${formatKarat(proof.lowKarat)}`}
          weeks={proof.low.weekCount}
          value={proof.low.avgWeeklyR}
          max={max}
          tone="loss"
        />
      </div>

      <ExplainButton
        explainId={EXPLAIN_IDS.proof}
        label={`Discipline paid you ${formatR(proof.differenceR)} a week`}
        bare
        className="block border-t border-line pt-5"
      >
        <span className="font-serif text-xl italic leading-snug text-text sm:text-2xl">
          Discipline paid you{' '}
          <span className="text-jade not-italic">{formatR(proof.differenceR)}</span> a
          week.
        </span>
      </ExplainButton>
    </Card>
  );
}
