import Link from 'next/link';
import type { Ref } from 'react';
import { cn } from '@/lib/cn';
import type { BandView, EaPanelView } from './constellation';
import type { DriftChartGeometry } from './driftChart';

/**
 * The EA panel (Stage 6): one EA, assayed.
 *
 * Header with the Fineness struck like a hallmark; the four components as thin
 * bars, each with one line on what it measures; the drift chart — rolling
 * expectancy against the baseline and its ±2 SE band, tarnished where it fell
 * under; the Monte Carlo drawdown band; the EA's correlations, strongest
 * first; and a way into the Ledger filtered to this magic number.
 *
 * Every string arrives formatted from `constellation.ts`. Nothing is computed
 * here but pixel positions of numbers that were already decided.
 */

function Kicker({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-[2.5px] text-text-3">{children}</h3>
  );
}

function DriftChart({
  chart,
  legend,
  name,
}: {
  chart: DriftChartGeometry;
  legend: { baseline: string; band: string };
  name: string;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] uppercase tracking-[1.5px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="block h-[1.5px] w-4 bg-gold" />
          Rolling 20
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="block h-[1.5px] w-4 bg-slate" />
          Under the band
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="block h-0 w-4 border-t border-dashed border-gold-deep" />
          {legend.baseline}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="block h-2 w-4 rounded-[2px] bg-gold/15" />
          {legend.band}
        </span>
      </div>
      <div className="relative w-full" style={{ aspectRatio: `${chart.width} / ${chart.height}` }}>
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          {chart.yTicks.map((tick) => (
            <g key={tick.label}>
              <line x1={44} x2={chart.width - 12} y1={tick.at} y2={tick.at} stroke="var(--line)" strokeWidth="1" />
              <text
                x={38}
                y={tick.at}
                dy="0.32em"
                textAnchor="end"
                className="font-mono"
                fontSize="10"
                fill="var(--text-3)"
              >
                {tick.label}
              </text>
            </g>
          ))}
          {chart.xTicks.map((tick, index) => (
            <text
              key={`${tick.label}-${index}`}
              x={tick.at}
              y={chart.height - 8}
              textAnchor={index === 0 ? 'start' : index === chart.xTicks.length - 1 ? 'end' : 'middle'}
              className="font-mono"
              fontSize="10"
              fill="var(--text-3)"
            >
              {tick.label}
            </text>
          ))}
          <path d={chart.bandPath} fill="var(--gold)" fillOpacity="0.1" stroke="var(--gold)" strokeOpacity="0.22" strokeWidth="0.6" />
          <line
            x1={44}
            x2={chart.width - 12}
            y1={chart.baselineY}
            y2={chart.baselineY}
            stroke="var(--gold-deep)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          {chart.segments.map((segment, index) => (
            <path
              key={index}
              d={segment.d}
              fill="none"
              stroke={segment.below ? 'var(--slate)' : 'var(--gold)'}
              strokeWidth={segment.below ? 1.8 : 1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {chart.last !== null ? (
            <g>
              {chart.last.below ? (
                <circle cx={chart.last.x} cy={chart.last.y} r="6" fill="none" stroke="var(--news)" strokeWidth="1" />
              ) : null}
              <circle
                cx={chart.last.x}
                cy={chart.last.y}
                r="2.6"
                fill={chart.last.below ? 'var(--slate)' : 'var(--gold-light)'}
              />
            </g>
          ) : null}
        </svg>
      </div>
      <figcaption className="sr-only">
        {name}: rolling 20-trade expectancy against the baseline and its {legend.band} band. Under the band
        for {Math.round(chart.belowShare * 100)}% of the trades plotted
        {chart.last?.below ? ', including the latest.' : '; the latest reading is inside it.'}
      </figcaption>
    </figure>
  );
}

function BandStrip({ band }: { band: BandView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-7" aria-hidden="true">
        <span className="absolute inset-x-0 top-3 h-px bg-line" />
        <span
          className="absolute top-2 h-[9px] rounded-full bg-gold/20 ring-1 ring-gold/30"
          style={{ left: `${band.p05}%`, width: `${Math.max(band.p95 - band.p05, 0.5)}%` }}
        />
        <span className="absolute top-1.5 h-3 w-px bg-gold-deep" style={{ left: `${band.p50}%` }} />
        <span
          className={cn(
            'absolute top-[5px] size-[13px] -translate-x-1/2 rotate-45 border',
            band.inside ? 'border-gold-light bg-gold' : 'border-news bg-slate',
          )}
          style={{ left: `${band.live}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-text-3">
        <span>0R</span>
        <span>
          p5 {band.p05Text} · p50 {band.p50Text} · p95 {band.p95Text} ·{' '}
          <span className={band.inside ? 'text-gold' : 'text-news'}>live {band.liveText}</span>
        </span>
      </div>
    </div>
  );
}

export interface EaPanelProps {
  panel: EaPanelView;
  onClose: () => void;
  headingRef: Ref<HTMLHeadingElement>;
  className?: string;
}

export function EaPanel({ panel, onClose, headingRef, className }: EaPanelProps) {
  const headingId = `ea-panel-${panel.magic}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-8 rounded-card border border-line bg-surface-1 p-5 sm:p-6', className)}
    >
      <header className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">
              EA Health · Magic {panel.magic}
            </span>
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="font-serif text-3xl leading-tight text-text outline-none focus-visible:outline-2 focus-visible:outline-gold"
            >
              {panel.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${panel.name}`}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-text-2 transition-colors hover:border-gold/40 hover:text-gold"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          {/* The Fineness struck like a hallmark: a cartouche with the ‰ in the serif. */}
          <div
            className={cn(
              'relative flex flex-col items-center rounded-[10px] border px-5 pb-2 pt-2.5',
              panel.tone === 'degraded' || panel.tone === 'unassayed'
                ? 'border-text-3/40'
                : 'border-gold/45',
            )}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[3px] rounded-[7px] border border-gold/15"
            />
            <span
              className={cn(
                'font-serif text-[34px] leading-none',
                panel.tone === 'degraded' || panel.tone === 'unassayed' ? 'text-text-2' : 'metal-gold-text',
              )}
            >
              {panel.finenessText}
            </span>
            <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[3px] text-text-3">
              {panel.labelText}
            </span>
          </div>
          {panel.drift.alert ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-news/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[2px] text-news">
              <span aria-hidden="true" className="size-2 rounded-full border border-news" />
              Drifting
            </span>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {panel.figures.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1">
              <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">{figure.label}</dt>
              <dd className="m-0 font-mono text-base text-text">
                {figure.value}
                {figure.note !== undefined ? (
                  <span className="ml-2 text-[11px] text-text-3">{figure.note}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="flex flex-col gap-4">
        <Kicker>Fineness · four components</Kicker>
        {panel.finenessNote !== null ? <p className="text-xs text-text-3">{panel.finenessNote}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {panel.components.map((component) => (
            <li key={component.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-text">
                  {component.label}
                  <span className="ml-2 font-mono text-[11px] text-text-3">{component.weightText}</span>
                </span>
                <span className="font-mono text-xs text-text-2">{component.valueText}</span>
              </div>
              <span
                aria-hidden="true"
                className="relative block h-[3px] overflow-hidden rounded-full bg-surface-2"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-gold"
                  style={{ width: `${Math.round(component.value * 1000) / 10}%`, opacity: 0.35 + component.value * 0.65 }}
                />
              </span>
              <span className="text-xs leading-relaxed text-text-3">{component.note}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <Kicker>Drift · rolling expectancy</Kicker>
        {panel.drift.chart !== null ? (
          <DriftChart chart={panel.drift.chart} legend={panel.drift.legend} name={panel.name} />
        ) : null}
        <p
          className={cn(
            'text-sm leading-relaxed',
            panel.drift.alert ? 'border-l-2 border-news pl-3 text-text' : 'text-text-2',
          )}
        >
          {panel.drift.sentence}
        </p>
        <p className="text-xs text-text-3">{panel.drift.baselineNote}</p>
      </div>

      <div className="flex flex-col gap-4">
        <Kicker>Drawdown · Monte Carlo band</Kicker>
        {panel.band !== null ? (
          <>
            <BandStrip band={panel.band} />
            <p className="text-sm leading-relaxed text-text-2">{panel.band.sentence}</p>
            <p className="text-xs leading-relaxed text-text-3">{panel.band.method}</p>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-text-2">{panel.drawdownNote}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Kicker>Correlation · daily P&amp;L</Kicker>
        {panel.correlations.length === 0 ? (
          <p className="text-sm text-text-2">No other EA to compare with.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {panel.correlations.map((row) => (
              <li key={row.magic} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm text-text">
                    {row.name}
                    <span className="ml-2 font-mono text-[11px] text-text-3">{row.magic}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-mono',
                      row.enoughOverlap ? 'text-sm' : 'text-[11px] text-text-3',
                      row.sameBet ? 'text-gold' : row.enoughOverlap ? 'text-text-2' : '',
                    )}
                  >
                    {row.valueText}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-3">
                  <span className="font-mono">{row.overlapText}</span>
                  {row.sameBet ? (
                    <span className="rounded-full border border-gold/35 px-2 py-px text-[10px] uppercase tracking-[1.5px] text-gold">
                      Same bet
                    </span>
                  ) : null}
                </div>
                {row.note !== null ? <p className="text-xs leading-relaxed text-text-2">{row.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href={panel.ledgerHref}
        className="self-start border-b border-dotted border-gold/50 pb-0.5 text-sm text-gold transition-colors hover:border-gold hover:text-gold-light"
      >
        View trades in the Ledger →
      </Link>
    </section>
  );
}
