'use client';

import { cn } from '@/lib/cn';
import { ExplainButton } from '@/components/assay/ExplainButton';
import { ringColor, ringRatio, ringTone } from './rings';

/**
 * Pillar rings (CLAUDE.md §8.2) — six small rings under the dial, one per
 * pillar, filled by `points / maxPoints` and coloured by the §8.2 thresholds.
 *
 * Each ring is a button: clicking it opens that pillar's deductions in the
 * Explain drawer, which is the §6.5 contract made clickable.
 */

const SIZE = 64;
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface PillarRingDatum {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  explainId: string;
}

export interface PillarRingsProps {
  pillars: readonly PillarRingDatum[];
  className?: string;
}

const TONE_TEXT = {
  gold: 'text-gold',
  bronze: 'text-bronze',
  oxblood: 'text-oxblood-text',
} as const;

export function PillarRings({ pillars, className }: PillarRingsProps) {
  return (
    <ul
      className={cn(
        'grid grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-6 sm:gap-x-1',
        className,
      )}
    >
      {pillars.map((pillar) => {
        const ratio = ringRatio(pillar.points, pillar.maxPoints);
        const tone = ringTone(pillar.points, pillar.maxPoints);
        const color = ringColor(pillar.points, pillar.maxPoints);
        const dash = `${(CIRCUMFERENCE * ratio).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`;

        return (
          <li key={pillar.key} className="flex flex-col items-center gap-2">
            <ExplainButton
              explainId={pillar.explainId}
              label={`${pillar.label}, ${pillar.points.toFixed(1)} of ${pillar.maxPoints} points`}
              bare
              className="flex flex-col items-center gap-2 rounded-xl px-1 py-1 transition-colors hover:bg-surface-2"
            >
              <span className="relative block" style={{ width: SIZE, height: SIZE }}>
                <svg
                  viewBox={`0 0 ${SIZE} ${SIZE}`}
                  width={SIZE}
                  height={SIZE}
                  aria-hidden="true"
                  className="block -rotate-90"
                >
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth={4}
                  />
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={dash}
                  />
                </svg>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-0 grid place-items-center font-mono text-[13px] tabular-nums',
                    TONE_TEXT[tone],
                  )}
                >
                  {pillar.points.toFixed(1)}
                </span>
              </span>

              <span
                aria-hidden="true"
                className="block text-center text-[10px] font-medium uppercase leading-tight tracking-[1.5px] text-text-3"
              >
                {pillar.label}
              </span>
            </ExplainButton>
          </li>
        );
      })}
    </ul>
  );
}
