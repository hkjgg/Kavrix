import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { Scene, SectionHeading } from '@/components/ui';
import { beatStyle } from '@/components/viz/instrument';
import { formatKarat, formatR } from '@/lib/format';
import type { AssayResult } from '@/lib/engine';
import type { ProofWeek } from '@/lib/engine/proof';
import { ExplainButton } from './ExplainButton';
import { EXPLAIN_IDS } from './explain';

/**
 * `04 — Your Proof` (CLAUDE.md §6.4) — the trader's own disciplined weeks
 * against their own impure ones.
 *
 * The scene opens on the weekly Karat arc, drawn left to right as it enters:
 * impure weeks stay dim, disciplined weeks resolve to bright gold. Then the
 * two buckets as diverging bars, then the line that sums it up.
 *
 * When the engine hides the card (§6.4) the reason is shown instead of an
 * empty chart — §2 does not let the product sell three weeks as evidence.
 */

/** When the arc starts drawing, and how long it takes to cross. */
const ARC_BEAT = { delay: 150, duration: 1500 } as const;

/** The plot's inner margins, in percent of the plot box. */
const PAD_X = 3;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

interface PlotPoint {
  week: ProofWeek;
  x: number;
  y: number;
}

/** Catmull-Rom through the points, as cubic Béziers: a smooth arc, no overshoot tricks. */
function smoothPath(points: readonly PlotPoint[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (first === undefined) return '';
  let d = `M ${first.x.toFixed(3)} ${first.y.toFixed(3)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(3)} ${c1y.toFixed(3)} ${c2x.toFixed(3)} ${c2y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`;
  }
  return d;
}

function KaratArc({
  weeks,
  highKarat,
  lowKarat,
}: {
  weeks: readonly ProofWeek[];
  highKarat: number;
  lowKarat: number;
}) {
  const lowest = Math.min(...weeks.map((week) => week.karat), lowKarat);
  const floor = Math.max(Math.floor(lowest) - 2, 0);
  const ceiling = 24;
  const yFor = (karat: number): number =>
    PAD_TOP + (1 - (karat - floor) / (ceiling - floor)) * (100 - PAD_TOP - PAD_BOTTOM);
  const xFor = (index: number): number =>
    weeks.length <= 1 ? 50 : PAD_X + (index / (weeks.length - 1)) * (100 - PAD_X * 2);

  const points: PlotPoint[] = weeks.map((week, index) => ({
    week,
    x: xFor(index),
    y: yFor(week.karat),
  }));
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const firstPoint = points[0];
  const area =
    last === undefined || firstPoint === undefined
      ? ''
      : `${line} L ${last.x} ${100} L ${firstPoint.x} ${100} Z`;

  const guides = [
    { karat: ceiling, label: `${ceiling}K`, dashed: false },
    { karat: highKarat, label: `${highKarat}K`, dashed: true },
    { karat: lowKarat, label: `${lowKarat}K`, dashed: true },
  ];

  const summary = `Weekly Karat, ${weeks
    .map((week) => `${week.isoWeek.slice(-3)} ${formatKarat(week.karat)}`)
    .join(', ')}.`;

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex">
        {/* Guide labels. */}
        <div aria-hidden="true" className="relative w-10 shrink-0">
          {guides.map((guide) => (
            <span
              key={guide.label}
              className="absolute right-3 -translate-y-1/2 font-mono text-[10px] text-text-3"
              style={{ top: `${yFor(guide.karat)}%` }}
            >
              {guide.label}
            </span>
          ))}
        </div>

        <div role="img" aria-label={summary} className="relative h-[220px] flex-1 sm:h-[260px]">
          {/* Guides: 24K, and the two bucket thresholds (§6.4). */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            {guides.map((guide) => (
              <line
                key={guide.label}
                x1={0}
                x2={100}
                y1={yFor(guide.karat)}
                y2={yFor(guide.karat)}
                stroke={guide.dashed ? 'var(--gold)' : 'var(--line)'}
                strokeOpacity={guide.dashed ? 0.28 : 1}
                strokeWidth={1}
                strokeDasharray={guide.dashed ? '3 5' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* The arc, revealed left to right. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="enter-wipe absolute inset-0 size-full overflow-visible"
            style={beatStyle(ARC_BEAT) as CSSProperties}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="kavrix-proof-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#kavrix-proof-area)" />
            <path
              d={line}
              fill="none"
              stroke="var(--gold)"
              strokeOpacity={0.8}
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* One mark a week. Impure weeks stay dim; disciplined ones resolve to bright gold. */}
          {points.map((point) => {
            const delay = ARC_BEAT.delay + (point.x / 100) * ARC_BEAT.duration;
            const bucket = point.week.bucket;
            return (
              <span
                key={point.week.isoWeek}
                aria-hidden="true"
                className={cn(
                  'absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full',
                  bucket === 'high' &&
                    'enter-resolve bg-gold-light shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_22%,transparent)]',
                  bucket === 'middle' && 'enter-fade bg-gold opacity-60',
                  bucket === 'low' && 'enter-fade border border-gold-deep bg-bg',
                )}
                style={
                  {
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    ...beatStyle({
                      delay: Math.round(delay),
                      duration: bucket === 'high' ? 900 : 400,
                    }),
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      </div>

      {/* Week labels, under their marks. Every other one on a phone. */}
      <div aria-hidden="true" className="relative ml-10 h-4">
        {points.map((point, index) => (
          <span
            key={point.week.isoWeek}
            className={cn(
              'absolute -translate-x-1/2 font-mono text-[10px] text-text-3',
              index % 2 === 1 && 'hidden sm:inline',
            )}
            style={{ left: `${point.x}%` }}
          >
            {point.week.isoWeek.slice(-3)}
          </span>
        ))}
      </div>

      <figcaption className="ml-10 mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-text-3">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-[9px] rounded-full bg-gold-light" />
          {highKarat}K and above
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-[9px] rounded-full bg-gold opacity-60" />
          Between
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-[9px] rounded-full border border-gold-deep bg-bg" />
          Under {lowKarat}K
        </span>
      </figcaption>
    </figure>
  );
}

interface BarProps {
  label: string;
  weeks: number;
  value: number;
  max: number;
  tone: 'profit' | 'loss';
}

/** The bars diverge from a centre line: the two numbers usually have opposite signs. */
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

export function ProofScene({ assay }: { assay: AssayResult }) {
  const { proof } = assay;
  const barsAt = ARC_BEAT.delay + ARC_BEAT.duration;

  return (
    <Scene aria-labelledby="scene-proof">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <SectionHeading id="scene-proof" index="04" title="Your Proof" />
        <p className="max-w-md text-sm text-text-3 lg:text-right">
          Your own weeks, each scored on its own trades.
        </p>
      </div>

      {!proof.visible ? (
        <div className="mt-12 flex max-w-xl flex-col gap-3">
          <p className="text-sm leading-relaxed text-text-2">
            {proof.hiddenReason ?? 'Not enough scored weeks on either side to compare yet.'}
          </p>
          <p className="text-xs text-text-3">
            Your Proof appears once there are {proof.minWeeksPerBucket} weeks in each
            bucket.
          </p>
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-14 lg:mt-16 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16">
          <KaratArc weeks={proof.weeks} highKarat={proof.highKarat} lowKarat={proof.lowKarat} />

          <div className="flex flex-col justify-center gap-8">
            <div
              className="enter-rise flex flex-col gap-6"
              style={beatStyle({ delay: barsAt, duration: 700 }) as CSSProperties}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">
                  Average week
                </span>
                <span className="font-mono text-[11px] text-text-3">
                  {proof.weeks.length} weeks scored
                </span>
              </div>
              <DivergingBar
                label={`${formatKarat(proof.highKarat)} and above`}
                weeks={proof.high.weekCount}
                value={proof.high.avgWeeklyR}
                max={Math.max(Math.abs(proof.high.avgWeeklyR), Math.abs(proof.low.avgWeeklyR))}
                tone="profit"
              />
              <DivergingBar
                label={`Under ${formatKarat(proof.lowKarat)}`}
                weeks={proof.low.weekCount}
                value={proof.low.avgWeeklyR}
                max={Math.max(Math.abs(proof.high.avgWeeklyR), Math.abs(proof.low.avgWeeklyR))}
                tone="loss"
              />
            </div>

            <div
              className="enter-fade border-t border-line pt-6"
              style={beatStyle({ delay: barsAt + 450, duration: 700 }) as CSSProperties}
            >
              <ExplainButton
                explainId={EXPLAIN_IDS.proof}
                label={`Discipline paid you ${formatR(proof.differenceR)} a week`}
                bare
                className="block"
              >
                <span className="font-serif text-2xl italic leading-snug text-text sm:text-3xl">
                  Discipline paid you{' '}
                  <span className="not-italic text-jade">{formatR(proof.differenceR)}</span> a
                  week.
                </span>
              </ExplainButton>
            </div>
          </div>
        </div>
      )}
    </Scene>
  );
}
