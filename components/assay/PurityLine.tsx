'use client';

import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { beatStyle } from '@/components/viz/instrument';
import { PURITY_ANCHORS, purityColor } from '@/components/viz/purity';
import type { CounterfactualScenarioKey } from '@/lib/engine';
import { ExplainButton } from './ExplainButton';
import { EXPLAIN_IDS } from './explain';
import type { PurityState, PurityStamp, PurityTone, PurityView } from './purity';
import { DEFAULT_PURITY_STATE, purityLayers } from './purity';
import { useRoutes } from '@/components/app/SurfaceContext';

/**
 * The Purity Line (CLAUDE.md §8.4), with its What-if (§6.10).
 *
 * The account's equity as a gold line whose brightness and saturation follow
 * the rolling Karat — bright gold-light while the trader was disciplined, a
 * dull alloy while they were not. Impurity trades are stamped on the line
 * where their P&L landed; hover or focus one for its time, R and reason, and
 * follow it to its Dossier.
 *
 * The What-if draws a counterfactual beside the account, never instead of it:
 * every impurity removed, or one habit at a time, each the engine's own
 * scenario. "Counterfactual, not a promise" is printed whether it is on or
 * off. One value scale covers every series, so switching it on never moves
 * the actual line.
 *
 * The stamps are one tab stop: arrows walk them in time order.
 */

/** When the line starts drawing, and how long it takes to cross. */
const LINE_BEAT = { delay: 150, duration: 1800 } as const;

function toneText(tone: PurityTone): string {
  if (tone === 'profit') return 'text-jade';
  if (tone === 'loss') return 'text-oxblood-text';
  return 'text-text-2';
}

function StampTooltip({ stamp }: { stamp: PurityStamp }) {
  const horizontal =
    stamp.x > 72 ? '-translate-x-full -ml-3' : stamp.x < 28 ? 'ml-3' : '-translate-x-1/2';
  const vertical = stamp.y > 40 ? '-translate-y-full -mt-3' : 'mt-3';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute z-20 w-56 rounded-xl border border-line bg-surface-2 p-3 shadow-[0_12px_32px_rgb(0_0_0/0.55)]',
        horizontal,
        vertical,
      )}
      style={{ left: `${stamp.x}%`, top: `${stamp.y}%` }}
    >
      <span className="block text-[10px] font-medium uppercase tracking-[2px] text-text-3">
        {stamp.time}
      </span>
      <span className="mt-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs text-text">{stamp.tradeId}</span>
        <span className={cn('font-mono text-xs', toneText(stamp.tone))}>{stamp.r}</span>
      </span>
      <span className="mt-1.5 block text-[11px] leading-snug text-text-2">{stamp.reasons}</span>
      <span className="mt-2 block text-[10px] text-text-3">Open the Trade Dossier</span>
    </span>
  );
}

export interface PurityLineProps {
  view: PurityView;
  /** The toggles' first state. Tests set it; the page starts on the account alone. */
  initialState?: PurityState;
}

export function PurityLine({ view, initialState = DEFAULT_PURITY_STATE }: PurityLineProps) {
  const routes = useRoutes();
  const [state, setState] = useState<PurityState>(initialState);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const gradientId = `kavrix-purity-${useId().replace(/:/g, '')}`;

  const layers = purityLayers(view, state);
  const counterfactual = layers.counterfactual;
  const active = hovered ?? focused;
  const activeStamp = active === null ? null : (view.stamps[active] ?? null);

  const setScenario = (key: CounterfactualScenarioKey) => {
    setState({ whatIf: true, scenario: key });
  };

  const onStampKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 };
    let next: number | null = null;
    if (event.key in step) next = cursor + (step[event.key] ?? 0);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = view.stamps.length - 1;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(Math.max(next, 0), view.stamps.length - 1);
    setCursor(clamped);
    const container = event.currentTarget;
    container.querySelector<HTMLAnchorElement>(`[data-stamp="${clamped}"]`)?.focus();
  };

  // The difference tag sits between the two ends of the lines.
  const tagY =
    counterfactual === null ? 0 : (counterfactual.end.y + view.actualEnd.y) / 2;

  return (
    <div className="flex flex-col gap-6">
      {/* The toggles. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={state.whatIf}
            onClick={() => {
              setState((current) => ({ ...current, whatIf: !current.whatIf }));
            }}
            className={cn(
              'inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-[11px] font-medium uppercase tracking-[2px] transition-colors',
              state.whatIf
                ? 'border-gold/60 bg-surface-2 text-gold'
                : 'border-line text-text-2 hover:border-gold/40 hover:text-text',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'relative inline-block h-3.5 w-6 rounded-full border transition-colors',
                state.whatIf ? 'border-gold bg-gold/25' : 'border-text-3',
              )}
            >
              <span
                className={cn(
                  'absolute top-1/2 size-2 -translate-y-1/2 rounded-full transition-[left]',
                  state.whatIf ? 'left-[13px] bg-gold' : 'left-[2px] bg-text-3',
                )}
              />
            </span>
            What-if
          </button>
          <span className="engraved inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-medium uppercase leading-none tracking-[2px] text-gold">
            {view.label}
          </span>
        </div>

        {state.whatIf ? (
          <div role="group" aria-label="Which impurities to remove" className="flex flex-wrap gap-2">
            {view.scenarios.map((scenario) => {
              const selected = state.scenario === scenario.key;
              return (
                <button
                  key={scenario.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setScenario(scenario.key);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    selected
                      ? 'border-gold/60 bg-surface-2 text-gold'
                      : 'border-line text-text-2 hover:border-gold/40 hover:text-text',
                  )}
                >
                  {scenario.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <figure className="flex flex-col gap-3">
        <div className="flex">
          {/* Value axis. */}
          <div aria-hidden="true" className="relative w-11 shrink-0">
            {view.yTicks.map((tick) => (
              <span
                key={tick.label}
                className="absolute right-2.5 -translate-y-1/2 font-mono text-[10px] text-text-3"
                style={{ top: `${tick.y}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          <div
            role="img"
            aria-label={view.summary}
            className="relative h-[260px] min-w-0 flex-1 sm:h-[340px]"
            data-series={counterfactual === null ? 'actual' : `actual+${counterfactual.key}`}
          >
            {/* Guides. */}
            <svg
              viewBox={`0 0 ${view.width} ${view.height}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              aria-hidden="true"
            >
              {view.yTicks.map((tick) => (
                <line
                  key={tick.label}
                  x1={0}
                  x2={view.width}
                  y1={(tick.y / 100) * view.height}
                  y2={(tick.y / 100) * view.height}
                  stroke="var(--line)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {view.xTicks.map((tick) => (
                <line
                  key={tick.label}
                  x1={(tick.x / 100) * view.width}
                  x2={(tick.x / 100) * view.width}
                  y1={0}
                  y2={view.height}
                  stroke="var(--line)"
                  strokeWidth={1}
                  strokeDasharray="2 5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {/* The What-if, beside the account. Drawn left to right when switched on. */}
            {counterfactual !== null ? (
              <svg
                key={counterfactual.key}
                viewBox={`0 0 ${view.width} ${view.height}`}
                preserveAspectRatio="none"
                className="wipe-in absolute inset-0 size-full overflow-visible"
                aria-hidden="true"
                data-layer="counterfactual"
              >
                <path
                  d={counterfactual.path}
                  fill="none"
                  stroke="var(--champagne)"
                  strokeOpacity={0.75}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}

            {/* The account, lit by its Karat, drawn left to right on arrival. */}
            <svg
              viewBox={`0 0 ${view.width} ${view.height}`}
              preserveAspectRatio="none"
              className="enter-wipe absolute inset-0 size-full overflow-visible"
              style={beatStyle(LINE_BEAT) as CSSProperties}
              aria-hidden="true"
              data-layer="actual"
            >
              <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={view.width} y2={0}>
                  {view.stops.map((stop) => (
                    <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                  ))}
                </linearGradient>
              </defs>
              <path
                d={view.actualPath}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Impurity stamps, on the line where each trade's P&L landed. */}
            <div
              role="group"
              aria-label={`${view.stamps.length} impurity trades. Arrow keys move between them; Enter opens the Trade Dossier.`}
              onKeyDown={onStampKey}
              className="absolute inset-0"
            >
              {view.stamps.map((stamp, index) => (
                <Link
                  key={stamp.tradeId}
                  href={routes.trade(stamp.tradeId)}
                  prefetch={false}
                  data-stamp={index}
                  tabIndex={index === cursor ? 0 : -1}
                  aria-label={`${stamp.tradeId}, ${stamp.time}, ${stamp.r}, ${stamp.reasons}. Open the Trade Dossier.`}
                  onMouseEnter={() => {
                    setHovered(index);
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                  }}
                  onFocus={() => {
                    setFocused(index);
                    setCursor(index);
                  }}
                  onBlur={() => {
                    setFocused(null);
                  }}
                  className="enter-fade group absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  style={
                    {
                      left: `${stamp.x}%`,
                      top: `${stamp.y}%`,
                      ...beatStyle({
                        delay: Math.round(LINE_BEAT.delay + (stamp.x / 100) * LINE_BEAT.duration),
                        duration: 300,
                      }),
                    } as CSSProperties
                  }
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block size-[7px] rotate-45 border border-gold bg-bg transition-transform',
                      'group-hover:scale-150 group-hover:bg-gold group-focus-visible:scale-150 group-focus-visible:bg-gold',
                      active === index && 'scale-150 bg-gold',
                    )}
                  />
                </Link>
              ))}
            </div>

            {activeStamp !== null ? <StampTooltip stamp={activeStamp} /> : null}

            {/* The difference, engraved between the two ends — top left on a phone, where it would cover them. */}
            {counterfactual !== null ? (
              <div
                className="resolve-in pointer-events-auto absolute right-0 z-10 -translate-y-1/2 max-sm:!top-1 max-sm:left-0 max-sm:right-auto max-sm:translate-y-0"
                style={{ top: `${tagY}%` }}
                data-difference={counterfactual.key}
              >
                <div className="engraved flex flex-col items-end gap-0.5 rounded-xl bg-bg/90 px-3 py-2 text-right">
                  <span className="text-[9px] font-medium uppercase tracking-[2px] text-text-3">
                    Difference
                  </span>
                  {counterfactual.key === 'all' ? (
                    <ExplainButton
                      explainId={EXPLAIN_IDS.whatIf}
                      label={`Every impurity removed: ${counterfactual.deltaMoney} against the actual result`}
                      bare
                    >
                      <span className={cn('font-mono text-sm', toneText(counterfactual.tone))}>
                        {counterfactual.deltaMoney}
                      </span>
                    </ExplainButton>
                  ) : (
                    <span className={cn('font-mono text-sm', toneText(counterfactual.tone))}>
                      {counterfactual.deltaMoney}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-text-3">{counterfactual.deltaR}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Month ticks. */}
        <div aria-hidden="true" className="relative ml-11 h-4">
          {view.xTicks.map((tick) => (
            <span
              key={tick.label}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-text-3"
              style={{ left: `${tick.x}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <figcaption className="ml-11 mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-text-3">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="block h-[3px] w-10 rounded-full"
              style={{
                backgroundImage: `linear-gradient(90deg, ${purityColor(PURITY_ANCHORS.dull)}, ${purityColor(
                  PURITY_ANCHORS.gold,
                )}, ${purityColor(PURITY_ANCHORS.bright)})`,
              }}
            />
            Dull to bright: the rolling Karat, low to high
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="block size-[7px] rotate-45 border border-gold bg-bg" />
            Impurity trade
          </span>
          {counterfactual !== null ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="block w-8 border-t border-dashed border-champagne" />
              {counterfactual.label} removed
            </span>
          ) : null}
        </figcaption>
      </figure>

      {/* What the toggle is showing, in words, and the permanent label's small print. */}
      <div className="flex flex-col gap-3 border-t border-line pt-5 text-xs leading-relaxed text-text-3 lg:flex-row lg:gap-10">
        <p className="lg:max-w-md">
          <span className="text-text-2">Actual</span> {view.startEquity} → {view.endEquity}
          {counterfactual !== null ? (
            <>
              <br />
              <span className="text-text-2">{counterfactual.label} removed</span> →{' '}
              {counterfactual.endEquity} · {counterfactual.removed}. The Karat Gap bills{' '}
              {counterfactual.gapBills} for the same trades.
            </>
          ) : null}
        </p>
        <p className="lg:flex-1">{view.method}</p>
      </div>
    </div>
  );
}
