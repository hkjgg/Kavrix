/**
 * Wrapped as a view (CLAUDE.md §17 Stage 7): the engine's `WrappedResult`
 * placed on the page — strings formatted, charts laid out — so the chapters
 * render without computing anything (§16).
 *
 * Every number here is the engine's. This file only decides where it is
 * drawn: a month's equity on a plane, a trade's hour on a 24-hour ruler, a
 * pillar's share of the bill as a share of the bar.
 */

import type { CertificateData } from '@/components/viz/certificate';
import { certificateAlt } from '@/components/viz/certificate';
import type { StarTone } from '@/components/viz/constellation';
import { layoutConstellation, starRadius, starTone, threadOpacity } from '@/components/viz/constellation';
import { linePath, purityStops, valueDomain, xForTime, yForValue, PURITY_HEIGHT, PURITY_WIDTH, axisTicks } from '@/components/viz/purity';
import type { GradientStop, PurityScale } from '@/components/viz/purity';
import { compactMoney } from '@/components/assay/purity';
import { buildDayAssayView } from '@/components/vault/dayAssay';
import { CHART, daySegments, impurityBands, karatSegments, karatY, timeAxis } from '@/components/vault/dayChart';
import type { SessionDefinition } from '@/lib/engine/enrich';
import type {
  CertificateChapter,
  DayChapterWrapped,
  EasChapter,
  GapChapter,
  KaratChapter,
  MonthKey,
  ProofChapter,
  PurityChapter,
  WindowChapter,
  WrappedChapter,
  WrappedChapterKind,
  WrappedResult,
} from '@/lib/engine/wrapped';
import { CONFIDENCE_LABELS } from '@/lib/engine/confidence';
import { MONTH_NAMES, longDate, monthLabel, shortDate } from '@/lib/dates';
import { formatKarat, formatMoney, formatR } from '@/lib/format';
import type { Surface, SurfaceRoutes } from '@/lib/routes';
import { DEMO_ROUTES } from '@/lib/routes';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export const CHAPTER_TITLES: Record<WrappedChapterKind, string> = {
  karat: 'The month’s Karat',
  purity: 'The purity of the month',
  window: 'Your best window',
  gap: 'What impurity cost',
  day: 'The day that defined the month',
  proof: 'Your proof',
  eas: 'Your EAs',
  certificate: 'The Assay Certificate',
};

interface ChapterBase {
  /** `03`, numbered after any chapter dropped out. */
  number: string;
  title: string;
  headline: string;
  sentences: string[];
}

export interface KaratChapterView extends ChapterBase {
  kind: 'karat';
  karat: number;
  tier: string;
  delta: number | null;
  deltaSuffix: string;
  noDeltaText: string;
  dialCaption: string;
  tradeCount: number;
  pillars: { key: string; label: string; value: string; share: number }[];
}

export interface PurityChapterView extends ChapterBase {
  kind: 'purity';
  width: number;
  height: number;
  d: string;
  stops: GradientStop[];
  stamps: { x: number; y: number }[];
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  marks: { x: number; label: string; tone: 'bright' | 'dull' }[];
  startLabel: string;
  endLabel: string;
  netMoney: number;
  currency: string;
  scopeNote: string;
}

export interface WindowChapterView extends ChapterBase {
  kind: 'window';
  width: number;
  height: number;
  zeroY: number;
  window: { x: number; width: number; label: string };
  sessions: { key: string; label: string; x: number; width: number; color: string }[];
  dots: { x: number; y: number; tone: 'profit' | 'loss' | 'flat'; inWindow: boolean; impure: boolean }[];
  hourTicks: { x: number; label: string }[];
  rTicks: { y: number; label: string }[];
  figures: { label: string; value: string }[];
  netR: number;
  confidence: string;
}

export interface GapChapterView extends ChapterBase {
  kind: 'gap';
  totalMoney: number;
  totalR: number;
  currency: string;
  segments: { pillar: string; label: string; share: number; money: string; r: string; trades: string; shade: number }[];
  costliest: string;
  note: string;
}

export interface DayChapterView extends ChapterBase {
  kind: 'day';
  mode: 'tilt' | 'pure';
  date: string;
  dateLabel: string;
  karatLabel: string;
  tierLabel: string;
  vaultHref: string;
  width: number;
  height: number;
  karatPaths: { d: string; impure: boolean }[];
  bands: { x: number; width: number }[];
  gridlines: { y: number; label: string }[];
  entries: { x: number; impure: boolean }[];
  news: { x: number; label: string }[];
  timeTicks: { x: number; label: string }[];
  breaks: number[];
  tilt: { x: number; width: number } | null;
  chapters: { title: string; range: string; sentence: string }[];
}

export interface ProofChapterView extends ChapterBase {
  kind: 'proof';
  differenceR: number;
  high: { label: string; value: number; text: string; weeks: string; share: number };
  low: { label: string; value: number; text: string; weeks: string; share: number };
  scopeNote: string;
}

export interface EaStarView {
  magic: number;
  name: string;
  x: number;
  y: number;
  r: number;
  tone: StarTone;
  fineness: string;
  label: string;
  drifting: boolean;
  healthiest: boolean;
  /** The name sits beside the star, on the side away from the middle of the sky. */
  labelX: number;
  labelAnchor: 'start' | 'end';
}

export interface EasChapterView extends ChapterBase {
  kind: 'eas';
  width: number;
  height: number;
  stars: EaStarView[];
  threads: { x1: number; y1: number; x2: number; y2: number; opacity: number; sameBet: boolean }[];
  rows: { name: string; trades: string; netR: string; fineness: string; label: string; note: string | null }[];
}

export interface CertificateChapterView extends ChapterBase {
  kind: 'certificate';
  data: CertificateData;
  alt: string;
}

export type WrappedChapterView =
  | KaratChapterView
  | PurityChapterView
  | WindowChapterView
  | GapChapterView
  | DayChapterView
  | ProofChapterView
  | EasChapterView
  | CertificateChapterView;

export interface WrappedMonthLink {
  month: MonthKey;
  label: string;
  short: string;
  href: string;
  current: boolean;
  partial: boolean;
}

export interface WrappedView {
  month: MonthKey;
  label: string;
  partial: boolean;
  /** `1–31 August 2026`, `1–20 September 2026 · month to date`. */
  periodText: string;
  state: 'scored' | 'assaying';
  tradeCount: number;
  minimumTrades: number;
  months: WrappedMonthLink[];
  chapters: WrappedChapterView[];
  /** The page for this month, the one "Copy link" copies. */
  href: string;
  /** The demo's surfaces or a real account's — every other link follows it. */
  surface: Surface;
}

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

export function wrappedHref(month: MonthKey, routes: SurfaceRoutes = DEMO_ROUTES): string {
  return routes.wrappedMonth(month);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

const SESSION_COLORS: Record<string, string> = {
  asia: 'var(--slate)',
  london: 'var(--gold)',
  newYork: 'var(--bronze)',
};

/* -------------------------------------------------------------------------
 * Chapters
 * ---------------------------------------------------------------------- */

function karatView(chapter: KaratChapter, base: ChapterBase, partial: boolean, label: string): KaratChapterView {
  const previousName =
    chapter.previous === null ? null : MONTH_NAMES[Number(chapter.previous.month.slice(5, 7)) - 1] ?? chapter.previous.label;
  return {
    kind: 'karat',
    ...base,
    karat: chapter.karat,
    tier: chapter.tier,
    delta: chapter.delta,
    deltaSuffix: previousName === null ? '' : `vs ${previousName}`,
    noDeltaText: 'no prior month',
    dialCaption: `${partial ? 'To date' : label.replace(/^(\w{3})\w*/, '$1')} · ${chapter.tradeCount} trades`,
    tradeCount: chapter.tradeCount,
    pillars: chapter.pillars.map((pillar) => ({
      key: pillar.key,
      label: pillar.label,
      value: `${pillar.points.toFixed(1)} / ${pillar.maxPoints}`,
      share: round1((pillar.points / pillar.maxPoints) * 1000) / 1000,
    })),
  };
}

function purityView(chapter: PurityChapter, base: ChapterBase, month: MonthKey, currency: string): PurityChapterView {
  const { startMs, endMs } = monthRange(month);
  const values = [chapter.startEquity, ...chapter.points.map((point) => point.equity)];
  const scale: PurityScale = { x0Ms: startMs, x1Ms: endMs, ...valueDomain(values) };
  const firstMs = Date.parse(chapter.points[0]?.time ?? new Date(startMs).toISOString());
  const plot = [
    { x: xForTime(Math.min(firstMs, startMs), scale), y: yForValue(chapter.startEquity, scale) },
    ...chapter.points.map((point) => ({ x: xForTime(Date.parse(point.time), scale), y: yForValue(point.equity, scale) })),
  ];
  const endOfDay = (date: string) => Date.parse(`${date}T23:59:59.999Z`);
  const stops = purityStops(
    chapter.karatDays.map((day) => ({ asOfMs: endOfDay(day.date), karat: day.karat })),
    scale,
  );

  const lastDay = Number(new Date(endMs - 1).toISOString().slice(8, 10));
  const xTicks = [1, 8, 15, 22, 29]
    .filter((day) => day <= lastDay)
    .map((day) => {
      const key = `${month}-${String(day).padStart(2, '0')}`;
      return { x: round1(xForTime(Date.parse(`${key}T00:00:00.000Z`), scale)), label: shortDate(key) };
    });
  const yTicks = axisTicks(scale.yMin, scale.yMax, 4).map((value) => ({
    y: round1(yForValue(value, scale)),
    label: compactMoney(value, currency),
  }));
  const marks: PurityChapterView['marks'] = [];
  if (chapter.brightest !== null && chapter.dullest !== null && chapter.brightest.date !== chapter.dullest.date) {
    marks.push({
      x: round1(xForTime(endOfDay(chapter.dullest.date), scale)),
      label: `${formatKarat(chapter.dullest.karat)} · ${shortDate(chapter.dullest.date)}`,
      tone: 'dull',
    });
    marks.push({
      x: round1(xForTime(endOfDay(chapter.brightest.date), scale)),
      label: `${formatKarat(chapter.brightest.karat)} · ${shortDate(chapter.brightest.date)}`,
      tone: 'bright',
    });
  }

  return {
    kind: 'purity',
    ...base,
    width: PURITY_WIDTH,
    height: PURITY_HEIGHT,
    d: linePath(plot),
    stops,
    stamps: chapter.stamps.map((stamp) => ({
      x: round1(xForTime(Date.parse(stamp.time), scale)),
      y: round1(yForValue(stamp.equity, scale)),
    })),
    yTicks,
    xTicks,
    marks,
    startLabel: formatMoney(chapter.startEquity, { currency, digits: 0 }),
    endLabel: formatMoney(chapter.endEquity, { currency, digits: 0 }),
    netMoney: chapter.netMoney,
    currency,
    scopeNote: 'Equity is the whole account, EAs included. Its light is the rolling 30-day Karat, the dial’s own score, at the end of each day.',
  };
}

/** The window chapter's 24-hour ruler. */
export const RULER = { width: 1000, height: 250, top: 34, bottom: 34, left: 8, right: 8, rCap: 4 } as const;

export function rulerX(hour: number): number {
  return round1(RULER.left + (clamp01(hour / 24) * (RULER.width - RULER.left - RULER.right)));
}

export function rulerY(r: number, cap: number): number {
  const clamped = Math.max(-cap, Math.min(cap, r));
  const mid = (RULER.top + (RULER.height - RULER.bottom)) / 2;
  const half = (RULER.height - RULER.bottom - RULER.top) / 2;
  return round1(mid - (clamped / cap) * half);
}

function windowView(chapter: WindowChapter, base: ChapterBase, sessions: readonly SessionDefinition[], currency: string): WindowChapterView {
  const maxAbs = Math.max(1, ...chapter.trades.map((trade) => Math.abs(trade.rMultiple)));
  const cap = Math.min(RULER.rCap, Math.ceil(maxAbs));
  const inWindow = new Set(chapter.tradeIds);
  return {
    kind: 'window',
    ...base,
    width: RULER.width,
    height: RULER.height,
    zeroY: rulerY(0, cap),
    window: {
      x: rulerX(chapter.startHour),
      width: round1(rulerX(chapter.endHour) - rulerX(chapter.startHour)),
      label: chapter.label,
    },
    sessions: sessions.map((session) => ({
      key: session.key,
      label: session.label,
      x: rulerX(session.startHour),
      width: round1(rulerX(session.endHour) - rulerX(session.startHour)),
      color: SESSION_COLORS[session.key] ?? 'var(--slate)',
    })),
    dots: chapter.trades.map((trade) => ({
      x: rulerX(trade.hour),
      y: rulerY(trade.rMultiple, cap),
      tone: trade.rMultiple > 0 ? 'profit' : trade.rMultiple < 0 ? 'loss' : 'flat',
      inWindow: inWindow.has(trade.tradeId),
      impure: trade.impure,
    })),
    hourTicks: [0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => ({
      x: rulerX(hour),
      label: `${String(hour % 24).padStart(2, '0')}:00`,
    })),
    rTicks: [cap, 0, -cap].map((r) => ({ y: rulerY(r, cap), label: formatR(r, { digits: 0 }) })),
    figures: [
      { label: 'Trades', value: String(chapter.tradeCount) },
      { label: 'Average', value: formatR(chapter.avgR, { digits: 2 }) },
      { label: 'Clean', value: `${chapter.cleanCount} of ${chapter.tradeCount}` },
      { label: 'Result', value: formatMoney(chapter.netMoney, { currency, digits: 0, signed: true }) },
    ],
    netR: chapter.netR,
    confidence: CONFIDENCE_LABELS[chapter.confidence.label],
  };
}

/** Oxblood, shaded by rank: the Gap is one loss, not four hues (Stage 3). */
const GAP_SHADES = [1, 0.72, 0.5, 0.34] as const;

function gapView(chapter: GapChapter, base: ChapterBase): GapChapterView {
  const { gap } = chapter;
  const total = gap.totalCostMoney;
  return {
    kind: 'gap',
    ...base,
    totalMoney: gap.totalCostMoney,
    totalR: gap.totalCostR,
    currency: gap.currency,
    segments: gap.lines.map((line, index) => ({
      pillar: line.pillar,
      label: line.label,
      share: total > 0 ? Math.round((line.costMoney / total) * 10_000) / 10_000 : 0,
      money: formatMoney(line.costMoney, { currency: gap.currency }),
      r: formatR(-line.costR),
      trades: `${line.tradeCount} ${line.tradeCount === 1 ? 'trade' : 'trades'}`,
      shade: GAP_SHADES[index] ?? 0.3,
    })),
    costliest: chapter.costliest.label,
    note: 'Revenge is billed first, then Market Conditions, Risk and Exits. Stops has no line: a stop that was missing shows up in the loss that ran past −1R.',
  };
}

/** The day chart, a mini Day Assay: 1000 wide, the Vault's own folded time scale. */
export const MINI_DAY = { width: 640, height: CHART.height } as const;

function dayView(chapter: DayChapterWrapped, base: ChapterBase, routes: SurfaceRoutes): DayChapterView {
  const assay = buildDayAssayView(chapter.story);
  const top = CHART.top;
  const bottom = CHART.height - CHART.bottom;
  const axis = timeAxis(daySegments(assay.trades, assay.news), CHART.left, MINI_DAY.width - CHART.right);
  const ky = karatY(top, bottom);
  const steps = assay.trades.map((trade) => ({
    id: trade.id,
    entryMs: trade.entryMs,
    karatBefore: trade.karatBefore,
    karatAfter: trade.karatAfter,
    impure: trade.impurities.length > 0,
  }));
  const episode = chapter.episode;
  const tilt =
    episode === null
      ? null
      : (() => {
          const x0 = axis.x(Date.parse(episode.start));
          const x1 = axis.x(Date.parse(episode.end));
          return { x: round1(x0 - 6), width: round1(Math.max(x1 - x0, 0) + 12) };
        })();

  return {
    kind: 'day',
    ...base,
    mode: chapter.mode,
    date: chapter.date,
    dateLabel: longDate(chapter.date),
    karatLabel: formatKarat(chapter.story.karat),
    tierLabel: chapter.story.tier,
    vaultHref: routes.vaultDay(chapter.date),
    width: MINI_DAY.width,
    height: MINI_DAY.height,
    karatPaths: karatSegments(steps, axis.x, ky, axis.x0, axis.x1).map((segment) => ({ d: segment.d, impure: segment.impure })),
    bands: impurityBands(
      assay.trades.map((trade) => ({ entryMs: trade.entryMs, closeMs: trade.closeMs, impure: trade.impurities.length > 0 })),
      axis.x,
    ),
    gridlines: [24, 18, 14, 10].map((karat) => ({ y: round1(ky(karat)), label: `${karat}K` })),
    entries: assay.trades.map((trade) => ({ x: round1(axis.x(trade.entryMs)), impure: trade.impurities.length > 0 })),
    news: assay.news
      .filter((event) => axis.segments.some(([a, b]) => event.ms >= a && event.ms <= b))
      .map((event) => ({ x: round1(axis.x(event.ms)), label: `${event.time} ${event.name}` })),
    timeTicks: axis.ticks.map((tick) => ({ x: tick.x, label: tick.label })),
    breaks: axis.breaks.map(round1),
    tilt,
    chapters: assay.chapters.map((entry) => ({
      title: entry.title,
      range: entry.range,
      sentence: entry.sentences[0]?.text ?? '',
    })),
  };
}

function proofView(chapter: ProofChapter, base: ChapterBase): ProofChapterView {
  const { proof } = chapter;
  const largest = Math.max(Math.abs(proof.high.avgWeeklyR), Math.abs(proof.low.avgWeeklyR), 1e-9);
  const weeks = (count: number) => `${count} ${count === 1 ? 'week' : 'weeks'}`;
  return {
    kind: 'proof',
    ...base,
    differenceR: proof.differenceR,
    high: {
      label: proof.high.label,
      value: proof.high.avgWeeklyR,
      text: formatR(proof.high.avgWeeklyR),
      weeks: weeks(proof.high.weekCount),
      share: round1((Math.abs(proof.high.avgWeeklyR) / largest) * 1000) / 1000,
    },
    low: {
      label: proof.low.label,
      value: proof.low.avgWeeklyR,
      text: formatR(proof.low.avgWeeklyR),
      weeks: weeks(proof.low.weekCount),
      share: round1((Math.abs(proof.low.avgWeeklyR) / largest) * 1000) / 1000,
    },
    scopeNote: `Every scored week of the history through ${shortDate(chapter.through)}, not this month alone: a month holds too few weeks to prove anything by itself.`,
  };
}

/** The EA chapter's sky, smaller than the Constellation's. */
export const MINI_SKY = { width: 560, height: 340 } as const;

function easView(chapter: EasChapter, base: ChapterBase): EasChapterView {
  const maxVolume = Math.max(0, ...chapter.eas.map((ea) => ea.volumeLots));
  const nodes = chapter.eas.map((ea) => ({ id: ea.magic, radius: starRadius(ea.volumeLots, maxVolume) }));
  const placed = layoutConstellation(
    nodes,
    chapter.correlations.map((pair) => ({ a: pair.a, b: pair.b, correlation: pair.correlation })),
    { width: MINI_SKY.width, height: MINI_SKY.height },
  );
  const at = new Map(placed.map((node) => [node.id, node]));
  const stars: EaStarView[] = chapter.eas.map((ea) => {
    const point = at.get(ea.magic);
    const x = point?.x ?? MINI_SKY.width / 2;
    const r = starRadius(ea.volumeLots, maxVolume);
    const right = x >= MINI_SKY.width / 2;
    return {
      magic: ea.magic,
      name: ea.name,
      x,
      y: point?.y ?? MINI_SKY.height / 2,
      r,
      labelX: round1(right ? x + r * 2 + 14 : x - r * 2 - 14),
      labelAnchor: right ? 'start' : 'end',
      tone: starTone(ea.label),
      fineness: ea.fineness === null ? 'Not assayed' : `${ea.fineness.toFixed(1)}‰`,
      label: ea.label ?? 'Under 20 trades',
      drifting: ea.drifting,
      healthiest: chapter.healthiest?.magic === ea.magic,
    };
  });
  const threads = chapter.correlations.flatMap((pair) => {
    const a = at.get(pair.a);
    const b = at.get(pair.b);
    const opacity = threadOpacity(pair.correlation);
    if (a === undefined || b === undefined || opacity <= 0) return [];
    return [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y, opacity, sameBet: pair.sameBet }];
  });
  return {
    kind: 'eas',
    ...base,
    width: MINI_SKY.width,
    height: MINI_SKY.height,
    stars,
    threads,
    rows: chapter.eas.map((ea) => ({
      name: ea.name,
      trades: `${ea.monthTrades} trades`,
      netR: formatR(ea.monthNetR),
      fineness: ea.fineness === null ? '—' : `${ea.fineness.toFixed(1)}‰`,
      label: ea.label ?? 'Not assayed',
      note: ea.drifting ? 'Drifting' : chapter.healthiest?.magic === ea.magic ? 'Healthiest' : null,
    })),
  };
}

function certificateView(chapter: CertificateChapter, base: ChapterBase): CertificateChapterView {
  const data: CertificateData = {
    karat: chapter.karat,
    tier: chapter.tier,
    monthName: chapter.monthName,
    partial: chapter.partial,
    period: chapter.period,
    tradeCount: chapter.tradeCount,
    tradingDays: chapter.tradingDays,
    serial: chapter.serial,
    demo: chapter.demo,
    legend: chapter.legend,
  };
  return { kind: 'certificate', ...base, data, alt: certificateAlt(data) };
}

function monthRange(month: MonthKey): { startMs: number; endMs: number } {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return { startMs: Date.UTC(year, index, 1), endMs: Date.UTC(year, index + 1, 1) };
}

/* -------------------------------------------------------------------------
 * The view
 * ---------------------------------------------------------------------- */

export interface BuildWrappedViewInput {
  wrapped: WrappedResult;
  months: readonly { month: MonthKey; partial: boolean }[];
  currency: string;
  sessions: readonly SessionDefinition[];
  /** Where the links go. Default the demo. */
  routes?: SurfaceRoutes;
}

export function buildWrappedView({
  wrapped,
  months,
  currency,
  sessions,
  routes = DEMO_ROUTES,
}: BuildWrappedViewInput): WrappedView {
  const chapters: WrappedChapterView[] = wrapped.chapters.map((chapter: WrappedChapter, index) => {
    const base: ChapterBase = {
      number: String(index + 1).padStart(2, '0'),
      title: CHAPTER_TITLES[chapter.kind],
      headline: chapter.headline,
      sentences: chapter.sentences,
    };
    switch (chapter.kind) {
      case 'karat':
        return karatView(chapter, base, wrapped.partial, wrapped.label);
      case 'purity':
        return purityView(chapter, base, wrapped.month, currency);
      case 'window':
        return windowView(chapter, base, sessions, currency);
      case 'gap':
        return gapView(chapter, base);
      case 'day':
        return dayView(chapter, base, routes);
      case 'proof':
        return proofView(chapter, base);
      case 'eas':
        return easView(chapter, base);
      case 'certificate':
        return certificateView(chapter, base);
    }
  });

  const monthName = MONTH_NAMES[Number(wrapped.month.slice(5, 7)) - 1] ?? '';
  const year = wrapped.month.slice(0, 4);
  const range = `${Number(wrapped.from.slice(8, 10))}–${Number(wrapped.to.slice(8, 10))} ${monthName} ${year}`;

  return {
    month: wrapped.month,
    label: wrapped.label,
    partial: wrapped.partial,
    periodText: wrapped.partial ? `${range} · month to date` : range,
    state: wrapped.state,
    tradeCount: wrapped.tradeCount,
    minimumTrades: wrapped.minimumTrades,
    months: months.map((entry) => ({
      month: entry.month,
      label: monthLabel(entry.month),
      short: `${(MONTH_NAMES[Number(entry.month.slice(5, 7)) - 1] ?? '').slice(0, 3)} ${entry.month.slice(2, 4)}`,
      href: wrappedHref(entry.month, routes),
      current: entry.month === wrapped.month,
      partial: entry.partial,
    })),
    chapters,
    href: wrappedHref(wrapped.month, routes),
    surface: routes.surface,
  };
}
