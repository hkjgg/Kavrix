'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Card, Label } from '@/components/ui';
import { CountUp } from '@/components/ui/CountUp';
import { formatMoney, formatR } from '@/lib/format';
import { ExplainButton } from './ExplainButton';

/**
 * The Karat Gap card (CLAUDE.md §6.3, §8.5) — what indiscipline cost, in money
 * and in R, segmented by the pillar each trade was billed to. In the Gap scene
 * (Stage 3.5) it is the *bill* beneath the bullion bars: the total on the
 * left, set smaller than the Karat, and the per-pillar breakdown on the right.
 *
 * The bar is oxblood throughout, shaded per pillar: the Gap is a loss, and §9
 * reserves oxblood for exactly that. Using four unrelated hues would make a
 * bill look like a palette.
 */

export type GapScopeKey = 'window' | 'all';

export interface GapLineView {
  pillar: string;
  label: string;
  /** Positive: the cost. */
  costMoney: number;
  costR: number;
  tradeCount: number;
  explainId: string;
}

export interface GapScopeView {
  key: GapScopeKey;
  /** `30-day window` / `90-day total`. */
  toggleLabel: string;
  caption: string;
  totalMoney: number;
  totalR: number;
  currency: string;
  impurityCount: number;
  tradeCount: number;
  explainId: string;
  lines: GapLineView[];
}

/** Shading per pillar, strongest first in the §6.3 priority order. */
const PILLAR_OPACITY: Record<string, number> = {
  revenge: 0.95,
  market: 0.74,
  risk: 0.54,
  exits: 0.38,
};

function shade(pillar: string): string {
  return `color-mix(in srgb, var(--oxblood) ${(
    (PILLAR_OPACITY[pillar] ?? 0.5) * 100
  ).toFixed(0)}%, var(--surface-1))`;
}

export interface GapCardProps {
  scopes: readonly GapScopeView[];
  /** When the counters start, once the scene is seen — its beat in the sequence. */
  countDelayMs?: number;
}

export function GapCard({ scopes, countDelayMs = 0 }: GapCardProps) {
  const [scopeKey, setScopeKey] = useState<GapScopeKey>('window');
  const scope = scopes.find((item) => item.key === scopeKey) ?? scopes[0];
  if (scope === undefined) return null;

  const total = scope.lines.reduce((sum, line) => sum + line.costMoney, 0);

  return (
    <Card className="grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Label>Karat Gap · the bill</Label>
        <div
          role="group"
          aria-label="Karat Gap period"
          className="flex items-center rounded-full border border-line p-0.5"
        >
          {scopes.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setScopeKey(item.key);
              }}
              aria-pressed={item.key === scopeKey}
              className={cn(
                'rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
                item.key === scopeKey
                  ? 'bg-surface-2 text-gold'
                  : 'text-text-3 hover:text-text-2',
              )}
            >
              {item.toggleLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <ExplainButton
          explainId={scope.explainId}
          label={`Karat Gap, ${formatMoney(-scope.totalMoney, {
            currency: scope.currency,
            signed: true,
          })} over the ${scope.toggleLabel}`}
          bare
          className="self-start"
        >
          <span className="font-serif text-4xl leading-none text-oxblood-text">
            <CountUp
              value={-scope.totalMoney}
              kind="money"
              currency={scope.currency}
              signed
              durationMs={1400}
              delayMs={countDelayMs}
            />
          </span>
        </ExplainButton>
        <span className="font-mono text-xs text-text-3">
          <CountUp value={-scope.totalR} kind="r" durationMs={1400} delayMs={countDelayMs} /> ·{' '}
          {scope.impurityCount} impurity trades of {scope.tradeCount} manual ·{' '}
          {scope.caption}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-text-3">
        A bill, not a curve: losses only, each trade billed once, to one pillar. The
        bars above remove whole trades, winners included, so the two numbers are not
        supposed to match.
      </p>
      </div>

      <div className="flex flex-col gap-6 lg:pt-1">

      {/* Segmented bar, by pillar. */}
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={scope.lines
          .map(
            (line) =>
              `${line.label} ${formatMoney(-line.costMoney, {
                currency: scope.currency,
                signed: true,
              })}`,
          )
          .join(', ')}
      >
        {scope.lines.map((line) => (
          <span
            key={line.pillar}
            className="block h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${total > 0 ? (line.costMoney / total) * 100 : 0}%`,
              backgroundColor: shade(line.pillar),
            }}
          />
        ))}
      </div>

      <ul className="flex flex-col">
        {scope.lines.map((line) => (
          <li
            key={line.pillar}
            className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0"
          >
            <ExplainButton
              explainId={line.explainId}
              label={`${line.label}, ${formatMoney(-line.costMoney, {
                currency: scope.currency,
                signed: true,
              })} across ${line.tradeCount} trades`}
              bare
              className="min-w-0 items-center gap-2.5"
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: shade(line.pillar) }}
              />
              <span className="truncate text-sm text-text-2">{line.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-text-3">
                {line.tradeCount}
              </span>
            </ExplainButton>

            <span className="shrink-0 text-right">
              <span className="block font-mono text-sm tabular-nums text-oxblood-text">
                {formatMoney(-line.costMoney, {
                  currency: scope.currency,
                  signed: true,
                })}
              </span>
              <span className="block font-mono text-[11px] tabular-nums text-text-3">
                {formatR(-line.costR)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      </div>
    </Card>
  );
}
