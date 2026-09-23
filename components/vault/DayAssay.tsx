'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui';
import type { SessionDefinition } from '@/lib/engine/enrich';
import { formatKarat, formatMoney, formatR } from '@/lib/format';
import { longDate } from '@/lib/dates';
import { IMPURITY_LABELS } from '@/lib/ledger/labels';
import type { AssayChapterView, AssayTradeView, DayAssayView } from './dayAssay';
import { sentenceParts } from './dayAssay';
import type { Interval } from './dayChart';
import {
  CHART,
  clipSegments,
  daySegments,
  easeOut,
  impurityBands,
  karatSegments,
  karatY,
  pnlDomain,
  pnlPath,
  pnlY,
  timeAxis,
  zoomWindow,
} from './dayChart';
import type { VaultDay } from './vault';

/**
 * The Day Assay (CLAUDE.md §6.11, §8.7) — one day as a picture, a story and a
 * bill.
 *
 * A. The chart: the day's P&L as a neutral running line with a mark at each
 *    close (jade or oxblood — the only place those colours appear here), and
 *    the running day Karat as a gold line on a 0–24K scale that tarnishes
 *    where an impurity set it, over a faint slate band. News releases are
 *    dashed amber rules; the sessions are the faintest wash behind.
 * B. The chapters: the engine's own (`dayStory`), each with its sentences.
 *    A heading or a phrase zooms the chart to its trades and dims the rest;
 *    the same again, or Esc, lets go.
 * C. The receipt: the Karat Gap's bill for the day, pillar by pillar.
 *
 * It is a day story, not a replay of ticks. Nothing here is computed: every
 * figure is the engine's, and the chart only places it.
 */

const SESSION_TINT: Record<string, string> = {
  asia: 'var(--slate)',
  london: 'var(--gold)',
  newYork: 'var(--bronze)',
};

const TARNISH = 'color-mix(in srgb, var(--gold-deep) 55%, var(--slate))';
const ZOOM_MS = 200;
const DIM = 0.15;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Focus {
  key: string;
  tradeIds: string[];
}

function toneClass(value: number): string {
  if (value > 0) return 'text-jade';
  if (value < 0) return 'text-oxblood-text';
  return 'text-text-2';
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function shortMoney(value: number, currency: string): string {
  return formatMoney(value, { currency, digits: 0 });
}

/* -------------------------------------------------------------------------
 * A. The chart
 * ---------------------------------------------------------------------- */

interface ChartProps {
  assay: DayAssayView;
  sessions: readonly SessionDefinition[];
  currency: string;
  focus: Focus | null;
  hoverTrade: string | null;
  onHoverTrade: (id: string | null) => void;
  window: Interval;
}

function DayChart({ assay, sessions, currency, focus, hoverTrade, onHoverTrade, window: view }: ChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [hoverNews, setHoverNews] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    const measure = () => {
      const next = Math.round(box.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, []);

  const segments = useMemo(() => daySegments(assay.trades, assay.news), [assay.trades, assay.news]);
  const axis = timeAxis(clipSegments(segments, view[0], view[1]), CHART.left, width - CHART.right);
  const top = CHART.top;
  const bottom = CHART.height - CHART.bottom;
  const ky = karatY(top, bottom);
  const pnl = pnlY(pnlDomain(assay.trades.map((trade) => trade.cumulative)), top, bottom);

  const byClose = assay.trades.slice().sort((a, b) => a.closeMs - b.closeMs || a.id.localeCompare(b.id));
  const lit = focus === null ? null : new Set(focus.tradeIds);
  const opacityOf = (id: string | null) => (lit === null || id === null || lit.has(id) ? 1 : DIM);

  const dayStart = Date.parse(`${assay.date}T00:00:00.000Z`);
  const labelled: number[] = [];
  const bands = sessions.flatMap((session) => {
    const x0 = axis.x(dayStart + session.startHour * 3_600_000);
    const x1 = axis.x(dayStart + session.endHour * 3_600_000);
    if (x1 - x0 < 1) return [];
    const showLabel = x1 - x0 > 46 && labelled.every((x) => Math.abs(x - x0) > 60);
    if (showLabel) labelled.push(x0);
    return [{ key: session.key, label: session.label, x: x0, width: x1 - x0, showLabel }];
  });

  const shownFrom = axis.segments[0]?.[0] ?? Number.POSITIVE_INFINITY;
  const shownTo = axis.segments[axis.segments.length - 1]?.[1] ?? Number.NEGATIVE_INFINITY;
  const visibleNews = assay.news.filter((event) => event.ms >= shownFrom && event.ms <= shownTo);
  const hoveredTrade = hoverTrade === null ? null : (assay.trades.find((trade) => trade.id === hoverTrade) ?? null);
  const hoveredNews = hoverNews === null ? null : (assay.news.find((event) => event.id === hoverNews) ?? null);

  const first = assay.trades[0];
  const last = byClose[byClose.length - 1];
  const summary =
    first === undefined || last === undefined
      ? ''
      : `The day's P&L ran from ${formatMoney(0, { currency })} to ${formatMoney(last.cumulative, {
          currency,
          signed: true,
        })} across ${plural(assay.trades.length, 'trade')}; the day Karat from ${formatKarat(first.karatBefore)} to ${formatKarat(
          assay.karat,
        )}.${
          assay.news.length === 0
            ? ''
            : ` High-impact USD releases: ${assay.news.map((event) => `${event.time} ${event.name}`).join(', ')}.`
        }`;

  return (
    <figure className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" className="overflow-visible">
            <path d="M0 6 H6 V2 H16" fill="none" stroke="var(--text-3)" strokeWidth={1.25} />
          </svg>
          Day P&amp;L
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8">
            <path d="M0 2 H16" stroke="var(--gold)" strokeWidth={2} />
          </svg>
          Day Karat
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8">
            <rect x={0} y={0} width={16} height={8} fill="var(--slate)" fillOpacity={0.22} />
            <path d="M0 4 H16" stroke={TARNISH} strokeWidth={2} />
          </svg>
          Tarnished by an impurity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="8" height="10">
            <path d="M4 0 V10" stroke="var(--news)" strokeWidth={1} strokeDasharray="2 2" />
          </svg>
          USD news
        </span>
      </div>

      <div ref={boxRef} className="relative w-full" style={{ height: CHART.height }}>
        <svg
          width={width}
          height={CHART.height}
          viewBox={`0 0 ${width} ${CHART.height}`}
          className="block overflow-visible"
          onMouseLeave={() => {
            onHoverTrade(null);
            setHoverNews(null);
          }}
        >
          <g aria-hidden="true">
            {/* The sessions: the faintest wash behind everything. */}
            {bands.map((band) => (
              <g key={band.key}>
                <rect x={band.x} y={top} width={band.width} height={bottom - top} fill={SESSION_TINT[band.key]} fillOpacity={0.05} />
                {band.showLabel ? (
                  <text x={band.x + 4} y={top - 8} className="font-sans" fontSize={9} letterSpacing={1.2} fill="var(--text-3)">
                    {band.label.toUpperCase()}
                  </text>
                ) : null}
              </g>
            ))}

            {/* Where an impure trade was open: a faint slate band, never red. */}
            {impurityBands(
              assay.trades.map((trade) => ({ ...trade, impure: trade.impurities.length > 0 })),
              axis.x,
            ).map((band) => (
              <rect key={`${band.x}-${band.width}`} x={band.x} y={top} width={band.width} height={bottom - top} fill="var(--slate)" fillOpacity={lit === null ? 0.16 : 0.08} />
            ))}

            {/* Tier guides on the Karat scale, and zero on the P&L scale. */}
            {[14, 18, 22].map((karat) => (
              <line key={karat} x1={axis.x0} x2={axis.x1} y1={ky(karat)} y2={ky(karat)} stroke="var(--line)" strokeWidth={1} />
            ))}
            <line x1={axis.x0} x2={axis.x1} y1={pnl.y(0)} y2={pnl.y(0)} stroke="var(--text-3)" strokeOpacity={0.45} strokeDasharray="2 3" strokeWidth={1} />

            {/* Folded gaps. */}
            {axis.breaks.map((x) => (
              <g key={x} data-break="">
                <line x1={x} x2={x} y1={top} y2={bottom} stroke="var(--text-3)" strokeOpacity={0.25} strokeDasharray="1 3" />
                <path d={`M${x - 4} ${bottom + 4} l3 -8 M${x + 1} ${bottom + 4} l3 -8`} stroke="var(--text-3)" strokeWidth={1} />
              </g>
            ))}

            {/* Axes. */}
            {pnl.ticks.map((tick) => (
              <text key={tick} x={CHART.left - 8} y={pnl.y(tick) + 3} textAnchor="end" className="font-mono" fontSize={9} fill="var(--text-3)">
                {shortMoney(tick, currency)}
              </text>
            ))}
            {[0, 12, 24].map((karat) => (
              <text key={karat} x={axis.x1 + 8} y={ky(karat) + 3} className="font-mono" fontSize={9} fill="var(--gold)" fillOpacity={0.8}>
                {karat}K
              </text>
            ))}
            {axis.ticks.map((tick) => (
              <text key={tick.ms} x={tick.x} y={bottom + 18} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--text-3)">
                {tick.label}
              </text>
            ))}
            <line x1={axis.x0} x2={axis.x1} y1={bottom} y2={bottom} stroke="var(--line)" />
          </g>

          {/* High-impact USD news. */}
          {visibleNews.map((event) => {
            const x = axis.x(event.ms);
            return (
              <g
                key={event.id}
                data-news={event.time}
                onMouseEnter={() => {
                  setHoverNews(event.id);
                  onHoverTrade(null);
                }}
              >
                <title>{`${event.time} UTC · ${event.name}`}</title>
                <line x1={x} x2={x} y1={top - 2} y2={bottom} stroke="var(--news)" strokeWidth={1} strokeDasharray="3 3" />
                <path d={`M${x} ${top - 6} l3 3 l-3 3 l-3 -3 Z`} fill="var(--news)" />
                <rect x={x - 6} y={top - 8} width={12} height={bottom - top + 8} fill="transparent" />
              </g>
            );
          })}

          {/* The running day Karat: gold where the trade that set it was clean, tarnished where it was not. */}
          <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {karatSegments(
              assay.trades.map((trade) => ({ ...trade, impure: trade.impurities.length > 0 })),
              axis.x,
              ky,
              axis.x0,
              axis.x1,
            ).map((segment, index) => (
              <path
                key={segment.tradeId ?? `open-${index}`}
                data-karat-segment={segment.impure ? 'tarnished' : 'clean'}
                d={segment.d}
                stroke={segment.impure ? TARNISH : 'var(--gold)'}
                strokeWidth={2}
                opacity={segment.tradeId === null ? (lit === null ? 1 : DIM) : opacityOf(segment.tradeId)}
                style={{ transition: 'opacity 200ms ease-out' }}
              />
            ))}
          </g>

          {/* The running P&L, neutral. */}
          <path
            aria-hidden="true"
            d={pnlPath(byClose, axis.x, pnl.y, axis.x0, axis.x1)}
            fill="none"
            stroke="var(--text-2)"
            strokeOpacity={lit === null ? 0.75 : 0.35}
            strokeWidth={1.25}
          />

          {/* A mark at each close: the only jade and oxblood on the panel. */}
          {byClose.map((trade) => {
            // Zoomed in, a close outside the window is not drawn at the edge.
            if (trade.closeMs < shownFrom || trade.closeMs > shownTo) return null;
            const x = axis.x(trade.closeMs);
            const y = pnl.y(trade.cumulative);
            const hovered = hoverTrade === trade.id;
            return (
              <a
                key={trade.id}
                href={`/trade/${trade.id}`}
                data-marker={trade.id}
                aria-label={`${trade.id}, ${trade.entry}–${trade.close} UTC, ${formatR(trade.rMultiple)}, ${formatMoney(trade.netMoney, {
                  currency,
                  signed: true,
                })}${trade.impurities.length === 0 ? ', clean' : `, ${trade.impurities.map((kind) => IMPURITY_LABELS[kind].toLowerCase()).join(', ')}`}. Open its Trade Dossier.`}
                onMouseEnter={() => {
                  onHoverTrade(trade.id);
                  setHoverNews(null);
                }}
                onFocus={() => {
                  onHoverTrade(trade.id);
                }}
                onBlur={() => {
                  onHoverTrade(null);
                }}
                className="day-marker"
                style={{ opacity: opacityOf(trade.id), transition: 'opacity 200ms ease-out' }}
              >
                <circle cx={x} cy={y} r={11} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={hovered ? 5.5 : 4.5}
                  fill={trade.netMoney >= 0 ? 'var(--jade)' : 'var(--oxblood)'}
                  stroke="var(--surface-1)"
                  strokeWidth={1.5}
                />
              </a>
            );
          })}
        </svg>

        {hoveredTrade !== null ? (
          <ChartTip x={axis.x(hoveredTrade.closeMs)} y={pnl.y(hoveredTrade.cumulative)} width={width}>
            <span className="block font-mono text-[11px] text-text">{hoveredTrade.id}</span>
            <span className="block font-mono text-[10px] text-text-3">
              {hoveredTrade.entry}–{hoveredTrade.close} UTC
            </span>
            <span className="mt-1 block font-mono text-[11px]">
              <span className={toneClass(hoveredTrade.rMultiple)}>{formatR(hoveredTrade.rMultiple)}</span>
              <span className="text-text-3"> · </span>
              <span className={toneClass(hoveredTrade.netMoney)}>
                {formatMoney(hoveredTrade.netMoney, { currency, signed: true })}
              </span>
            </span>
            <span className="mt-1 block text-[10px] leading-snug text-text-2">
              {hoveredTrade.impurities.length === 0
                ? 'Clean'
                : hoveredTrade.impurities.map((kind) => IMPURITY_LABELS[kind]).join(' · ')}
            </span>
            <span className="mt-1 block font-mono text-[10px] text-gold">
              Day Karat {formatKarat(hoveredTrade.karatBefore)} → {formatKarat(hoveredTrade.karatAfter)}
            </span>
          </ChartTip>
        ) : hoveredNews !== null ? (
          <ChartTip x={axis.x(hoveredNews.ms)} y={top} width={width}>
            <span className="block text-[10px] font-medium uppercase tracking-[2px] text-news">High-impact USD</span>
            <span className="mt-1 block font-mono text-[11px] text-text">{hoveredNews.time} UTC</span>
            <span className="block text-[11px] text-text-2">{hoveredNews.name}</span>
          </ChartTip>
        ) : null}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function ChartTip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 4), width - 176);
  const flip = x + 12 + 172 > width;
  return (
    <span
      aria-hidden="true"
      className="tip-in pointer-events-none absolute z-10 w-[172px] rounded-lg border border-line bg-surface-2 px-3 py-2"
      style={{ left: flip ? Math.max(x - 184, 4) : left, top: Math.max(y - 20, 0) }}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * B. Chapters · C. Receipt
 * ---------------------------------------------------------------------- */

function Chapter({
  chapter,
  focus,
  highlighted,
  onFocus,
}: {
  chapter: AssayChapterView;
  focus: Focus | null;
  highlighted: boolean;
  onFocus: (focus: Focus) => void;
}) {
  const headingKey = `chapter:${chapter.id}`;
  const active = focus?.key === headingKey;
  return (
    <li
      data-chapter={chapter.id}
      data-highlighted={highlighted ? '' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-xl border px-4 py-3.5 transition-colors duration-200',
        highlighted ? 'border-gold/40 bg-surface-2' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="m-0">
          <button
            type="button"
            aria-pressed={active}
            onClick={() => {
              onFocus({ key: headingKey, tradeIds: chapter.tradeIds });
            }}
            className="group inline-flex cursor-pointer items-baseline gap-2 text-left"
          >
            <span className="font-mono text-[11px] tracking-[2px] text-gold">
              {String(chapter.number).padStart(2, '0')}
            </span>
            <span aria-hidden="true" className="text-text-3">
              —
            </span>
            <span className="font-serif text-xl leading-none text-text transition-colors group-hover:text-gold-light">
              {chapter.title}
            </span>
          </button>
        </h3>
        <span className="font-mono text-[11px] text-text-3">
          {chapter.range} UTC · {plural(chapter.tradeIds.length, 'trade')}
        </span>
      </div>
      {chapter.worstOverall ? (
        <span className="engraved self-start rounded-full px-2 py-0.5 text-[9px] font-medium uppercase leading-none tracking-[1.5px] text-gold-light">
          Worst tilt in the history
        </span>
      ) : null}
      <p className="text-[13px] leading-relaxed text-text-2">
        {chapter.sentences.map((sentence, index) => (
          <span key={index}>
            {index > 0 ? ' ' : null}
            {sentenceParts(sentence).map((part, partIndex) =>
              'tradeIds' in part ? (
                <button
                  key={part.key}
                  type="button"
                  data-phrase={part.text}
                  aria-pressed={focus?.key === `${chapter.id}:${index}:${part.key}`}
                  onClick={() => {
                    onFocus({ key: `${chapter.id}:${index}:${part.key}`, tradeIds: part.tradeIds });
                  }}
                  className={cn(
                    'explainable cursor-pointer text-text transition-colors hover:border-gold hover:text-gold-light',
                    focus?.key === `${chapter.id}:${index}:${part.key}` && 'border-gold text-gold-light',
                  )}
                >
                  {part.text}
                </button>
              ) : (
                <span key={partIndex}>{part.text}</span>
              ),
            )}
          </span>
        ))}
      </p>
    </li>
  );
}

function Receipt({
  assay,
  currency,
  focus,
  onFocus,
}: {
  assay: DayAssayView;
  currency: string;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}) {
  const { receipt } = assay;
  if (receipt.lines.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-text-3">
        Nothing billed. No impurity on this day lost money, so the Karat Gap has no line for it.
      </p>
    );
  }
  const row = 'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 px-3 py-2 text-left';
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {receipt.lines.map((line) => {
          const key = `receipt:${line.pillar}`;
          const active = focus?.key === key;
          return (
            <li key={line.pillar} className="border-b border-dashed border-line">
              <button
                type="button"
                aria-pressed={active}
                data-receipt={line.pillar}
                onClick={() => {
                  onFocus({ key, tradeIds: line.tradeIds });
                }}
                className={cn(row, 'cursor-pointer rounded-md transition-colors hover:bg-surface-2', active && 'bg-surface-2 text-gold-light')}
              >
                <span className="text-[13px] text-text">{line.label}</span>
                <span className="font-mono text-[11px] text-text-3">{plural(line.tradeIds.length, 'trade')}</span>
                <span className="text-right font-mono text-xs">
                  <span className="text-oxblood-text">{formatMoney(-line.costMoney, { currency, signed: true })}</span>
                  <span className="text-text-3"> · {formatR(-line.costR)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 border-t border-gold/25 pt-1">
        <button
          type="button"
          aria-pressed={focus?.key === 'receipt:total'}
          onClick={() => {
            onFocus({ key: 'receipt:total', tradeIds: receipt.tradeIds });
          }}
          className={cn(row, 'cursor-pointer rounded-md transition-colors hover:bg-surface-2', focus?.key === 'receipt:total' && 'bg-surface-2')}
        >
          <span className="text-[11px] font-medium uppercase tracking-[2px] text-text-3">Total billed</span>
          <span className="font-mono text-[11px] text-text-3">{plural(receipt.tradeIds.length, 'trade')}</span>
          <span className="text-right font-mono text-sm">
            <span className="text-oxblood-text">{formatMoney(-receipt.totalMoney, { currency, signed: true })}</span>
            <span className="text-text-3"> · {formatR(-receipt.totalR)}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The panel
 * ---------------------------------------------------------------------- */

export interface DayAssayProps {
  date: string;
  /** `null` when the day holds no manual trade. */
  assay: DayAssayView | null;
  /** The calendar's own record of the day, for the empty state. */
  vaultDay: VaultDay | null;
  currency: string;
  sessions: readonly SessionDefinition[];
  onClose?: () => void;
  /** The nearest day either side with an assay, and a way there. */
  onStep?: (direction: -1 | 1) => void;
  canStep?: { previous: boolean; next: boolean };
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

export function DayAssay({
  date,
  assay,
  vaultDay,
  currency,
  sessions,
  onClose,
  onStep,
  canStep = { previous: false, next: false },
  headingRef,
  className,
}: DayAssayProps) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [hoverTrade, setHoverTrade] = useState<string | null>(null);

  const full = useMemo<Interval>(() => {
    const segments = assay === null ? [] : daySegments(assay.trades, assay.news);
    const first = segments[0];
    const last = segments[segments.length - 1];
    return first === undefined || last === undefined ? [0, 1] : [first[0], last[1]];
  }, [assay]);
  const [view, setView] = useState<Interval>(full);
  const viewRef = useRef<Interval>(full);
  const frame = useRef<number | null>(null);

  const zoomTo = useCallback((target: Interval) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const from = viewRef.current;
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      viewRef.current = target;
      setView(target);
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const t = easeOut((now - started) / ZOOM_MS);
      const next: Interval = [from[0] + (target[0] - from[0]) * t, from[1] + (target[1] - from[1]) * t];
      viewRef.current = next;
      setView(next);
      frame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const toggle = useCallback(
    (next: Focus) => {
      if (assay === null) return;
      if (focus?.key === next.key) {
        setFocus(null);
        zoomTo(full);
        return;
      }
      setFocus(next);
      const ids = new Set(next.tradeIds);
      zoomTo(zoomWindow(assay.trades.filter((trade) => ids.has(trade.id)), full));
    },
    [assay, focus, full, zoomTo],
  );

  const reset = useCallback(() => {
    setFocus(null);
    zoomTo(full);
  }, [full, zoomTo]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && focus !== null) {
      // The first Esc lets go of the highlight; the next closes the panel.
      event.preventDefault();
      reset();
      return;
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && onStep !== undefined) {
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (direction === -1 ? !canStep.previous : !canStep.next) return;
      event.preventDefault();
      onStep(direction);
    }
  };

  const hoveredChapter =
    hoverTrade === null ? null : (assay?.trades.find((trade: AssayTradeView) => trade.id === hoverTrade)?.chapterId ?? null);
  const focusedChapter = focus?.key.startsWith('chapter:') === true ? focus.key.slice(8) : null;

  return (
    <section
      id="vault-replay"
      aria-labelledby="vault-replay-title"
      onKeyDown={onKeyDown}
      className={cn('resolve-in flex flex-col rounded-card border border-line bg-surface-1 p-5 sm:p-6', className)}
    >
      <header className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <Label>Day Assay</Label>
          <div className="-mr-1 flex items-center gap-1">
            {onStep !== undefined ? (
              <>
                <button
                  type="button"
                  disabled={!canStep.previous}
                  onClick={() => {
                    onStep(-1);
                  }}
                  aria-label="Previous trading day"
                  className="inline-flex size-9 items-center justify-center rounded-full text-base text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  disabled={!canStep.next}
                  onClick={() => {
                    onStep(1);
                  }}
                  aria-label="Next trading day"
                  className="inline-flex size-9 items-center justify-center rounded-full text-base text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}
            {onClose !== undefined ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close the Day Assay"
                className="inline-flex size-9 items-center justify-center rounded-full text-lg text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>
        </div>

        <h2
          id="vault-replay-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-2xl leading-tight text-text focus:outline-none sm:text-3xl"
        >
          {longDate(date)}
        </h2>

        {assay !== null && assay.trades.length > 0 ? (
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-line pt-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Day Karat</span>
              <span className="flex items-baseline gap-3">
                <span className="font-serif text-5xl leading-none text-gold">{formatKarat(assay.karat)}</span>
                <span className="text-[11px] font-medium uppercase tracking-[2px] text-gold/80">{assay.tierLabel}</span>
              </span>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono text-xs">
              <dt className="text-text-3">Net</dt>
              <dd className="text-right">
                <span className={toneClass(assay.netMoney)}>{formatMoney(assay.netMoney, { currency, signed: true })}</span>
                <span className="text-text-3"> · </span>
                <span className={toneClass(assay.netR)}>{formatR(assay.netR)}</span>
              </dd>
              <dt className="text-text-3">Trades</dt>
              <dd className="text-right text-text">
                {assay.tradeCount}
                <span className="text-text-3"> · {assay.impurityTradeCount} impure</span>
              </dd>
            </dl>
          </div>
        ) : null}
      </header>

      {assay === null || assay.trades.length === 0 ? (
        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
          <p className="text-sm leading-relaxed text-text-2">
            {vaultDay !== null && vaultDay.tradeCount > 0
              ? `No manual trades on this day — ${plural(vaultDay.tradeCount, 'EA trade')} ran, and EA trades are outside the day Karat.`
              : 'No trades on this day.'}
          </p>
          <p className="text-xs text-text-3">A day with no trades has nothing to fault, so there is nothing to assay.</p>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <DayChart
              assay={assay}
              sessions={sessions}
              currency={currency}
              focus={focus}
              hoverTrade={hoverTrade}
              onHoverTrade={setHoverTrade}
              window={view}
            />
            <div className="mt-2 flex min-h-5 items-center justify-between gap-3 text-[11px] text-text-3">
              <span>Select a mark to open its Trade Dossier.</span>
              {focus !== null ? (
                <button type="button" onClick={reset} className="text-gold transition-colors hover:text-gold-light">
                  Show the whole day <span className="text-text-3">· Esc</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3">
            <Label>The day, in chapters</Label>
            <ol className="flex flex-col gap-2.5" aria-label={`The chapters of ${longDate(date)}`}>
              {assay.chapters.map((chapter) => (
                <Chapter
                  key={chapter.id}
                  chapter={chapter}
                  focus={focus}
                  highlighted={chapter.id === hoveredChapter || chapter.id === focusedChapter}
                  onFocus={toggle}
                />
              ))}
            </ol>
          </div>

          <div className="mt-7 flex flex-col gap-3">
            <Label>Karat Gap · the day&rsquo;s bill</Label>
            <Receipt assay={assay} currency={currency} focus={focus} onFocus={toggle} />
          </div>

          <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-text-3">
            The day Karat is this day&rsquo;s own manual trades, unweighted — a mark on a day, not the score.
            Chapters follow fixed rules: the open runs to the first impurity, a tilt is two or more impurities
            each within 60 minutes of the last, and each trade is billed to one pillar only.
            {assay.eaTradeCount > 0
              ? ` ${plural(assay.eaTradeCount, 'EA trade')} also ran that day; EA trades are outside the day Karat.`
              : ''}
          </p>
        </>
      )}
    </section>
  );
}
