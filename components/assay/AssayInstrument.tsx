'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui';
import { AssayDial, type AssayDialProps } from '@/components/viz/AssayDial';
import {
  ARRIVAL,
  FOCUS_RECEDE_SCALE,
  FOCUS_SCALE,
  RESERVED_RING,
  STAGE_CENTRE,
  beatStyle,
  ringBeat,
  subDialPlacement,
  type SubDialPlacement,
} from '@/components/viz/instrument';
import { ringColor, ringRatio, ringTone } from '@/components/viz/rings';
import { ExplainBody } from './ExplainBody';
import { useExplain } from './ExplainProvider';

/**
 * The Assay Instrument (CLAUDE.md §8.1–§8.2, Stage 3.5).
 *
 * One composition, not a card and a row: the Karat dial at the centre, the
 * six pillar sub-dials fixed round it at 12, 2, 4, 6, 8 and 10 o'clock, each
 * wired to the dial's centre by a gold hairline arm, and a thin, empty outer
 * ring reserved for Stage 4's 24-hour trade clock.
 *
 * Interaction is quiet on purpose:
 *  - **Hover or focus a sub-dial** — its arm brightens, its ring lifts, and
 *    its deduction summary appears beside it. Nothing else moves.
 *  - **Select a sub-dial** — the instrument transforms in place: the outer
 *    ring and the other five recede, the chosen pillar is drawn in towards
 *    the centre, and its explanation (formula, deductions, trades) resolves
 *    beside the instrument. Esc, the close button, or the centre of the dial
 *    restores it. The explanation is the same `ExplainEntry` the drawer
 *    shows, rendered by the same `ExplainBody`: a different presentation of
 *    the same information, never a second copy of it.
 *
 * At phone width the instrument stacks — the dial, then the sub-dials in a
 * two-column grid, then the explanation — and the reserved ring and the arms
 * are not drawn: they only mean something in the round.
 *
 * The component computes no metric (§16). Points, deductions and captions all
 * arrive pre-computed from the engine through the server.
 */

export interface SubDialSummaryLine {
  label: string;
  value: string;
}

export interface SubDialView {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  explainId: string;
  /** The first deductions, pre-formatted: `−0.69 · Risk above the 1.0% limit · 5 trades`. */
  summary: SubDialSummaryLine[];
  /** Deductions not listed in the summary. */
  moreCount: number;
}

export interface AssayInstrumentReading {
  window: string;
  points: string;
  trades: string;
}

export interface AssayInstrumentProps {
  dial: Omit<AssayDialProps, 'className'>;
  pillars: readonly SubDialView[];
  /** `30-day · recency-weighted`, printed beside every pillar value. */
  scopeLabel: string;
  reading: AssayInstrumentReading;
  /** The section heading and its line, server-rendered. */
  intro: ReactNode;
}

const TONE_TEXT = {
  gold: 'text-gold',
  bronze: 'text-bronze',
  oxblood: 'text-oxblood-text',
} as const;

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Minor ticks round a sub-dial, every 30°. */
const SUB_TICKS = Array.from({ length: 12 }, (_, index) => index * 30);

export function AssayInstrument({
  dial,
  pillars,
  scopeLabel,
  reading,
  intro,
}: AssayInstrumentProps) {
  const { get } = useExplain();
  const [hot, setHot] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<string | null>(null);
  const baseId = useId();
  const detailId = `${baseId}-detail`;
  const detailTitleId = `${baseId}-detail-title`;

  const focusedPillar = pillars.find((pillar) => pillar.key === focused) ?? null;
  const entry = focusedPillar === null ? null : get(focusedPillar.explainId);

  const restore = useCallback(() => {
    returnTo.current = focused;
    setFocused(null);
  }, [focused]);

  const select = useCallback((key: string) => {
    setHot(null);
    setFocused((current) => (current === key ? null : key));
    returnTo.current = key;
  }, []);

  /* Focus follows the explanation in, and goes back to its sub-dial on the way out. */
  useEffect(() => {
    if (focused !== null) {
      detailTitle.current?.focus();
      return;
    }
    const key = returnTo.current;
    returnTo.current = null;
    if (key !== null) buttons.current.get(key)?.focus({ preventScroll: true });
  }, [focused]);

  /* Esc restores the instrument. */
  useEffect(() => {
    if (focused === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restore();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [focused, restore]);

  const anyFocused = focused !== null;

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-12 gap-y-10',
        'lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:grid-rows-[auto_1fr] xl:gap-x-16',
      )}
    >
      {/* The heading: first on a phone, top right beside the instrument on a desk. */}
      <div className="lg:col-start-2 lg:row-start-1 lg:pt-6">{intro}</div>

      {/* ── The instrument ─────────────────────────────────────────────── */}
      <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div
          className="relative mx-auto w-full lg:aspect-square lg:max-w-[max(560px,min(760px,calc(100svh-8rem)))]"
          style={{ containerType: 'inline-size' }}
          data-focus={focused ?? undefined}
        >
          {/* The stage's own layer: the reserved ring and the arms. Round only. */}
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 hidden size-full overflow-visible lg:block"
            aria-hidden="true"
          >
            {/*
              RESERVED — Stage 4's 24-hour trade clock (the Gold Clock, §8.3)
              lives in this band: each trade at the angle of its entry time,
              round the whole instrument. It is deliberately empty until then.
              Do not put anything else here.
            */}
            <g
              style={{
                transformOrigin: `${STAGE_CENTRE}px ${STAGE_CENTRE}px`,
                transformBox: 'view-box',
                transform: anyFocused ? 'scale(0.975)' : 'none',
                opacity: anyFocused ? 0.3 : 1,
                transition: `transform 500ms ${EASE}, opacity 500ms ${EASE}`,
              }}
            >
              <g className="enter-fade" style={beatStyle(ARRIVAL.face) as CSSProperties}>
                <circle
                  cx={STAGE_CENTRE}
                  cy={STAGE_CENTRE}
                  r={(RESERVED_RING.inner + RESERVED_RING.outer) / 2}
                  fill="none"
                  stroke="#000000"
                  strokeOpacity={0.55}
                  strokeWidth={RESERVED_RING.outer - RESERVED_RING.inner}
                />
                <circle
                  cx={STAGE_CENTRE}
                  cy={STAGE_CENTRE}
                  r={RESERVED_RING.inner}
                  fill="none"
                  stroke="var(--gold)"
                  strokeOpacity={0.1}
                  strokeWidth={0.12}
                />
                <circle
                  cx={STAGE_CENTRE}
                  cy={STAGE_CENTRE}
                  r={RESERVED_RING.outer}
                  fill="none"
                  stroke="var(--gold)"
                  strokeOpacity={0.14}
                  strokeWidth={0.12}
                />
              </g>
            </g>

            {/* The arms, from the dial's bezel out to each sub-dial. */}
            {pillars.map((pillar, index) => {
              const place = subDialPlacement(index);
              const lit = hot === pillar.key || focused === pillar.key;
              const receded = anyFocused && focused !== pillar.key;
              return (
                <g
                  key={`arm-${pillar.key}`}
                  style={{
                    opacity: receded ? 0.35 : 1,
                    transition: `opacity 500ms ${EASE}`,
                  }}
                >
                  <path
                    d={`M ${place.arm.x1} ${place.arm.y1} L ${place.arm.x2} ${place.arm.y2}`}
                    pathLength={1}
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth={lit ? 0.24 : 0.16}
                    strokeOpacity={lit ? 0.9 : 0.34}
                    strokeLinecap="round"
                    className="enter-draw"
                    style={
                      {
                        ...beatStyle(ARRIVAL.arms),
                        transition: `stroke-opacity 280ms ease, stroke-width 280ms ease`,
                      } as CSSProperties
                    }
                  />
                </g>
              );
            })}
          </svg>

          {/* The dial, at the centre of the stage. */}
          <div
            className={cn(
              'relative mx-auto w-full max-w-[400px]',
              'lg:absolute lg:left-1/2 lg:top-1/2 lg:z-0 lg:w-[48%] lg:max-w-none lg:-translate-x-1/2 lg:-translate-y-1/2',
            )}
          >
            <div
              style={{
                transform: anyFocused ? 'scale(0.97)' : 'none',
                opacity: anyFocused ? 0.5 : 1,
                transition: `transform 500ms ${EASE}, opacity 500ms ${EASE}`,
              }}
            >
              <AssayDial {...dial} />
            </div>

            {anyFocused ? (
              <button
                type="button"
                onClick={restore}
                aria-label="Return to the instrument"
                className={cn(
                  'absolute left-1/2 top-1/2 size-[52%] -translate-x-1/2 -translate-y-1/2 cursor-zoom-out rounded-full',
                  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold',
                )}
              />
            ) : null}
          </div>

          {/* The six sub-dials. A grid on a phone; placed round the dial on a desk. */}
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:contents">
            {pillars.map((pillar, index) => (
              <SubDial
                key={pillar.key}
                pillar={pillar}
                index={index}
                place={subDialPlacement(index)}
                scopeLabel={scopeLabel}
                hot={hot === pillar.key && !anyFocused}
                focused={focused === pillar.key}
                receded={anyFocused && focused !== pillar.key}
                detailId={detailId}
                summaryId={`${baseId}-summary-${pillar.key}`}
                buttonRef={(node) => {
                  if (node === null) buttons.current.delete(pillar.key);
                  else buttons.current.set(pillar.key, node);
                }}
                onHot={(on) => {
                  setHot((current) => (on ? pillar.key : current === pillar.key ? null : current));
                }}
                onSelect={() => {
                  select(pillar.key);
                }}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* ── Beside it: the reading, or the chosen pillar's explanation ─── */}
      <div id={detailId} className="lg:col-start-2 lg:row-start-2">
        {entry !== null && focusedPillar !== null ? (
          <section
            key={focusedPillar.key}
            aria-labelledby={detailTitleId}
            className="resolve-in engraved rounded-card bg-surface-1 p-6"
          >
            <header className="flex items-start gap-4 border-b border-line pb-5">
              <div className="min-w-0 flex-1">
                <Label>{entry.eyebrow}</Label>
                <h2
                  ref={detailTitle}
                  id={detailTitleId}
                  tabIndex={-1}
                  className="mt-3 font-serif text-2xl leading-tight text-text outline-none"
                >
                  {entry.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={restore}
                aria-label="Close, and return to the instrument"
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full border border-line',
                  'text-text-3 transition-colors hover:border-gold hover:text-gold',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
                )}
              >
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                  <path
                    d="M2 2 L14 14 M14 2 L2 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            </header>
            <div className="pt-6">
              <ExplainBody entry={entry} />
            </div>
            <p className="mt-6 text-[11px] tracking-[1px] text-text-3">
              Esc, or the centre of the dial, returns to the instrument.
            </p>
          </section>
        ) : (
          <div className="flex flex-col gap-6 border-t border-line pt-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2">
                <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">
                  Scored window
                </dt>
                <dd className="mt-1.5 font-mono text-sm text-text-2">{reading.window}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">
                  Points
                </dt>
                <dd className="mt-1.5 font-mono text-sm text-text-2">{reading.points}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">
                  Manual trades
                </dt>
                <dd className="mt-1.5 font-mono text-sm text-text-2">{reading.trades}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">
                  Pillar values
                </dt>
                <dd className="mt-1.5 font-mono text-sm text-text-2">{scopeLabel}</dd>
              </div>
            </dl>
            <p className="max-w-sm text-xs leading-relaxed text-text-3">
              <span className="hidden lg:inline">
                Rest on a sub-dial to see what it lost.{' '}
              </span>
              Select one to read its formula, its deductions and the trades behind them
              here. The value at the centre opens the Karat itself.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * One sub-dial
 * ---------------------------------------------------------------------- */

interface SubDialProps {
  pillar: SubDialView;
  index: number;
  place: SubDialPlacement;
  scopeLabel: string;
  hot: boolean;
  focused: boolean;
  receded: boolean;
  detailId: string;
  summaryId: string;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onHot: (on: boolean) => void;
  onSelect: () => void;
}

function SubDial({
  pillar,
  index,
  place,
  scopeLabel,
  hot,
  focused,
  receded,
  detailId,
  summaryId,
  buttonRef,
  onHot,
  onSelect,
}: SubDialProps) {
  const ratio = ringRatio(pillar.points, pillar.maxPoints);
  const tone = ringTone(pillar.points, pillar.maxPoints);
  const color = ringColor(pillar.points, pillar.maxPoints);
  const above = place.labelSide === 'above';

  const move = focused
    ? `translate(${place.focusShift.x}cqw, ${place.focusShift.y}cqw) scale(${FOCUS_SCALE})`
    : receded
      ? `scale(${FOCUS_RECEDE_SCALE})`
      : 'none';

  const summaryText =
    pillar.summary.length === 0
      ? 'Nothing deducted in the window.'
      : pillar.summary.map((line) => `${line.value} ${line.label}`).join('. ');

  return (
    <li
      className={cn(
        'relative flex justify-center',
        'lg:absolute lg:left-(--x) lg:top-(--y) lg:z-10 lg:block lg:size-[11cqw] lg:-translate-x-1/2 lg:-translate-y-1/2',
        (hot || focused) && 'lg:z-20',
      )}
      style={{ '--x': `${place.x}%`, '--y': `${place.y}%` } as CSSProperties}
    >
      <div
        className="size-full lg:[transform:var(--move)]"
        style={
          {
            '--move': move,
            opacity: receded ? 0.35 : 1,
            transition: `transform 500ms ${EASE}, opacity 500ms ${EASE}`,
          } as CSSProperties
        }
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={onSelect}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') onHot(true);
          }}
          onPointerLeave={() => {
            onHot(false);
          }}
          onFocus={() => {
            onHot(true);
          }}
          onBlur={() => {
            onHot(false);
          }}
          aria-expanded={focused}
          aria-controls={detailId}
          aria-describedby={summaryId}
          aria-label={`${pillar.label}, ${pillar.points.toFixed(1)} of ${pillar.maxPoints} points, ${scopeLabel}`}
          style={beatStyle(ARRIVAL.arms) as CSSProperties}
          className={cn(
            'enter-fade group/sub flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl text-center',
            'lg:relative lg:block lg:size-full lg:rounded-full',
            'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold',
          )}
          data-hot={hot || focused ? '' : undefined}
        >
          {/* The ring. Lifts a little when it is the one being read. */}
          <span
            className={cn(
              'relative block size-[84px] transition-transform duration-300 lg:size-full',
              'group-data-[hot]/sub:-translate-y-[3px]',
            )}
            style={{ transitionTimingFunction: EASE }}
          >
            <svg viewBox="0 0 100 100" className="block size-full overflow-visible" aria-hidden="true">
              <circle
                cx={50}
                cy={50}
                r={48}
                fill="var(--surface-1)"
                stroke="var(--gold)"
                strokeOpacity={0.18}
                strokeWidth={1}
                className="transition-[fill,stroke-opacity] duration-300 group-data-[hot]/sub:fill-surface-2 group-data-[hot]/sub:[stroke-opacity:0.5]"
              />
              <g stroke="var(--gold)" strokeOpacity={0.28} strokeWidth={0.8}>
                {SUB_TICKS.map((angle) => (
                  <line
                    key={angle}
                    x1={50}
                    y1={4.5}
                    x2={50}
                    y2={angle % 90 === 0 ? 9.5 : 7.5}
                    transform={`rotate(${angle} 50 50)`}
                  />
                ))}
              </g>
              <circle cx={50} cy={50} r={36} fill="none" stroke="var(--line)" strokeWidth={5} />
              <circle
                cx={50}
                cy={50}
                r={36}
                fill="none"
                stroke={color}
                strokeWidth={5}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${ratio.toFixed(4)} 1`}
                transform="rotate(-90 50 50)"
                className="enter-fill"
                style={{ '--len': ratio.toFixed(4), ...beatStyle(ringBeat(index)) } as CSSProperties}
              />
            </svg>
            <span
              aria-hidden="true"
              className="absolute inset-0 flex flex-col items-center justify-center leading-none"
            >
              <span
                className={cn('font-mono tabular-nums text-[17px] lg:text-[max(13px,2.3cqw)]', TONE_TEXT[tone])}
              >
                {pillar.points.toFixed(1)}
              </span>
              <span className="mt-1 font-mono text-[10px] text-text-3 lg:text-[max(9px,1.3cqw)]">
                / {pillar.maxPoints}
              </span>
            </span>
          </span>

          {/* Engraved label, on the side away from the dial. */}
          <span
            aria-hidden="true"
            className={cn(
              'flex flex-col items-center gap-1',
              'lg:absolute lg:left-1/2 lg:w-[19cqw] lg:-translate-x-1/2',
              above ? 'lg:bottom-[calc(100%+1.1cqw)] lg:flex-col-reverse' : 'lg:top-[calc(100%+1.1cqw)]',
            )}
          >
            <span className="block text-[10px] font-medium uppercase leading-tight tracking-[2px] text-text-2 transition-colors group-data-[hot]/sub:text-gold-light">
              {pillar.label}
            </span>
            <span className="block whitespace-nowrap text-[9px] leading-tight tracking-[0.5px] text-text-3">
              {scopeLabel}
            </span>
          </span>
        </button>
      </div>

      {/* What it lost, for a screen reader: always present. */}
      <span id={summaryId} className="sr-only">
        {summaryText}
        {pillar.moreCount > 0 ? `. And ${pillar.moreCount} more.` : ''}
      </span>

      {/* …and for the eye, beside the sub-dial while it is being read. */}
      {hot ? (
        <div
          aria-hidden="true"
          className={cn(
            'resolve-in pointer-events-none absolute top-1/2 z-30 hidden w-[15.5rem] -translate-y-1/2 [will-change:opacity,transform] lg:block',
            'engraved rounded-xl bg-surface-1 px-4 py-3 text-left',
            place.summarySide === 'right' ? 'left-[calc(100%+1.6cqw)]' : 'right-[calc(100%+1.6cqw)]',
          )}
        >
          <span className="block text-[10px] font-medium uppercase tracking-[2px] text-text-3">
            {pillar.label} · points lost
          </span>
          {pillar.summary.length === 0 ? (
            <span className="mt-2 block text-xs text-text-2">Nothing deducted in the window.</span>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {pillar.summary.map((line) => (
                <li key={line.label} className="flex items-baseline gap-2.5 text-xs leading-snug">
                  <span className="shrink-0 font-mono tabular-nums text-oxblood-text">{line.value}</span>
                  <span className="text-text-2">{line.label}</span>
                </li>
              ))}
              {pillar.moreCount > 0 ? (
                <li className="text-[11px] text-text-3">and {pillar.moreCount} more</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}
