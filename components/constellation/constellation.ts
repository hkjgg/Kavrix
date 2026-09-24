/**
 * `04 — Constellation` (CLAUDE.md §7, §8.8), as a view.
 *
 * Built on the server, like `explain.ts`, the Dossier and the Vault: every
 * figure is an engine output — `ConstellationResult` — formatted into a string
 * or placed on a plane. The browser receives stars, threads, sentences and
 * paths; never the engine, never a trade.
 *
 * The sentences are templates over engine numbers. None of them computes
 * anything: a drift sentence quotes `drift`, a band sentence quotes
 * `drawdownBand`, a "same bet" row quotes `correlations`.
 */

import type {
  ConstellationResult,
  DrawdownBand,
  EaCorrelation,
  EaResult,
  FinenessComponents,
} from '@/lib/engine/ea';
import { FINENESS_WEIGHTS } from '@/lib/engine/ea';
import type { EngineSettings } from '@/lib/engine/settings';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import type { FieldStar, StarTone } from '@/components/viz/constellation';
import {
  SKY_HEIGHT,
  SKY_WIDTH,
  doubleThread,
  labelOffset,
  layoutConstellation,
  starField,
  starRadius,
  starTone,
  threadOpacity,
} from '@/components/viz/constellation';
import type { DriftChartGeometry } from './driftChart';
import { buildDriftChart } from './driftChart';
import type { SurfaceRoutes } from '@/lib/routes';
import { DEMO_ROUTES } from '@/lib/routes';

/** The one sentence a "same bet" pair carries, wherever it is shown. */
export const SAME_BET_SENTENCE =
  'These EAs win and lose on the same days — together they are one position, not two.';

const MINUS = '\u2212';

/** ρ from which the band's method line says an EA's same-day trades move together. Wording only. */
const SAME_DAY_TOGETHER = 0.2;

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export interface StarView {
  magic: number;
  name: string;
  /** Plane units. */
  x: number;
  y: number;
  /** The same point as a percent of the plane, for the HTML overlay. */
  left: number;
  top: number;
  r: number;
  tone: StarTone;
  drifting: boolean;
  /** `942.9‰`, or `Not assayed`. */
  finenessText: string;
  /** `Fine`, or `Under 20 trades`. */
  labelText: string;
  netR: string;
  /** The name label sits on the side facing the middle of the sky. */
  labelSide: 'left' | 'right';
  /** The label's anchor, percent of the plane: its near edge, at the star's height. */
  labelLeft: number;
  ariaLabel: string;
  /** Entrance delay, ms. */
  delay: number;
}

export interface ThreadView {
  a: number;
  b: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  sameBet: boolean;
  /** The double thread's two lines, for a same-bet pair. */
  lines: [number, number, number, number][] | null;
  /** `0.84`. */
  correlationText: string;
  /** Where the same-bet label sits, percent of the plane. */
  labelLeft: number;
  labelTop: number;
  delay: number;
}

export interface SummaryItem {
  label: string;
  value: string;
  note: string;
}

export interface ComponentView {
  key: keyof FinenessComponents;
  label: string;
  /** `40%`. */
  weightText: string;
  /** 0–1, for the bar. */
  value: number;
  /** `71.4%`. */
  valueText: string;
  /** What it measures, in one line. */
  note: string;
}

export interface BandView {
  /** Percent positions along a strip running 0R → `scaleMaxR`. */
  p05: number;
  p50: number;
  p95: number;
  live: number;
  p05Text: string;
  p50Text: string;
  p95Text: string;
  liveText: string;
  inside: boolean;
  sentence: string;
  /** How the paths were laid out. */
  method: string;
}

export interface CorrelationRowView {
  magic: number;
  name: string;
  /** `0.84`, or `Not enough overlap`. */
  valueText: string;
  /** 0–1: positive correlation, for the gold intensity. */
  intensity: number;
  overlapText: string;
  sameBet: boolean;
  enoughOverlap: boolean;
  note: string | null;
}

export interface FigureView {
  label: string;
  value: string;
  note?: string;
}

export interface EaPanelView {
  magic: number;
  name: string;
  tone: StarTone;
  finenessText: string;
  labelText: string;
  figures: FigureView[];
  components: ComponentView[];
  /** `null` under 20 trades: nothing to assay yet. */
  finenessNote: string | null;
  drift: {
    alert: boolean;
    sentence: string;
    baselineNote: string;
    chart: DriftChartGeometry | null;
    /** `Baseline +0.30R`, `±2 SE`. */
    legend: { baseline: string; band: string };
  };
  band: BandView | null;
  drawdownNote: string;
  correlations: CorrelationRowView[];
  ledgerHref: string;
}

export interface MatrixCellView {
  magic: number;
  self: boolean;
  text: string;
  intensity: number;
  sameBet: boolean;
  enoughOverlap: boolean;
  ariaLabel: string;
}

export interface MatrixView {
  columns: { magic: number; name: string }[];
  rows: { magic: number; name: string; cells: MatrixCellView[] }[];
}

export interface ConstellationView {
  empty: boolean;
  width: number;
  height: number;
  summary: SummaryItem[];
  stars: StarView[];
  threads: ThreadView[];
  field: FieldStar[];
  panels: Record<string, EaPanelView>;
  matrix: MatrixView;
  /** The drifting EA the prompt offers, if any. */
  drifting: { magic: number; name: string } | null;
  minOverlapDays: number;
  sameBetThreshold: string;
  alt: string;
}

/* -------------------------------------------------------------------------
 * Small formatters
 * ---------------------------------------------------------------------- */

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/** `0.836` → `0.84`; `−0.237` → `−0.24`, with a real minus. */
export function correlationText(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  return value < 0 && Number(fixed) !== 0 ? `${MINUS}${fixed}` : fixed;
}

export function finenessText(value: number | null): string {
  return value === null ? 'Not assayed' : `${value.toFixed(1)}‰`;
}

function r2(value: number): string {
  return formatR(value, { digits: 2 });
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/* -------------------------------------------------------------------------
 * Sentences
 * ---------------------------------------------------------------------- */

/** The drift alert in one sentence, engine numbers only (§7). */
export function driftSentence(ea: EaResult): string {
  const { drift } = ea;
  const recent = `The last ${plural(drift.recentTradeCount, 'trade')} average ${r2(drift.recentExpectancyR)} against a ${r2(drift.baselineExpectancyR)} baseline`;
  if (drift.recentTradeCount < 2 || drift.standardErrorR === 0) {
    return `${recent}; with no spread between them there is no standard error, so no drift test.`;
  }
  const se = formatR(drift.standardErrorR, { digits: 2, signed: false });
  if (drift.alert) {
    return `${recent} — ${drift.standardErrors.toFixed(2)} standard errors below it, past the drift line at ${r2(drift.thresholdR)} (${drift.thresholdStandardErrors} × SE ${se}).`;
  }
  if (drift.standardErrors > 0) {
    return `${recent} — ${drift.standardErrors.toFixed(2)} standard errors below it, inside the drift line at ${r2(drift.thresholdR)} (${drift.thresholdStandardErrors} × SE ${se}).`;
  }
  return `${recent} — at or above it, so there is nothing to drift from (SE ${se}).`;
}

function baselineNote(ea: EaResult, settings: EngineSettings): string {
  switch (ea.baselineSource) {
    case 'user':
      return 'Baseline: the backtest expectancy, as entered.';
    case 'first-live-trades':
      return `Baseline: the first ${plural(Math.min(settings.eaBaselineTradeCount, ea.tradeCount), 'live trade')} — no backtest was entered.`;
    default:
      return 'No baseline yet.';
  }
}

/** Where the live drawdown sits in the Monte Carlo band (§7). */
export function bandSentence(band: DrawdownBand): string {
  const live = formatR(band.liveDrawdownR, { signed: false });
  const paths = plural(band.paths, 'path');
  const backtest = `its backtest (${r2(band.expectancyR)} a trade, σ ${formatR(band.dispersionR, { digits: 2, signed: false })})`;
  const range = `${formatR(band.p05R, { signed: false })}–${formatR(band.p95R, { signed: false })}`;
  const share =
    band.livePercentile >= 1
      ? `deeper than every one of ${paths}`
      : `deeper than ${formatPct(band.livePercentile * 100, { digits: 0 })} of ${paths}`;
  return `Its live drawdown, ${live}, is ${share} drawn from ${backtest} — ${band.inside ? 'inside' : 'outside'} the ${range} band.`;
}

function bandView(band: DrawdownBand): BandView {
  const scaleMax = Math.max(band.p95R, band.liveDrawdownR) * 1.12 || 1;
  const at = (value: number): number => Math.round((value / scaleMax) * 1000) / 10;
  return {
    p05: at(band.p05R),
    p50: at(band.p50R),
    p95: at(band.p95R),
    live: at(band.liveDrawdownR),
    p05Text: formatR(band.p05R, { signed: false }),
    p50Text: formatR(band.p50R, { signed: false }),
    p95Text: formatR(band.p95R, { signed: false }),
    liveText: formatR(band.liveDrawdownR, { signed: false }),
    inside: band.inside,
    sentence: bandSentence(band),
    method: `${plural(band.paths, 'path')} laid over the EA’s own ${plural(band.days, 'trading day')}. ${
      band.intradayCorrelation >= SAME_DAY_TOGETHER
        ? `Its same-day trades move together (ρ ${band.intradayCorrelation.toFixed(2)}), so each path keeps that bunching.`
        : `Its same-day trades are close to independent (ρ ${band.intradayCorrelation.toFixed(2)}), and so are each path’s.`
    }`,
  };
}

function componentNotes(
  ea: EaResult,
  settings: EngineSettings,
): Record<keyof FinenessComponents, { label: string; note: string }> {
  const k = settings.eaDriftStandardErrors;
  const drawdown =
    ea.drawdownBasis === 'monte-carlo'
      ? `Live drawdown against the band ${plural(ea.drawdownBand?.paths ?? settings.eaDrawdownPaths, 'path')} drew from the backtest: 1 inside its 95th percentile, then the band’s edge over the drawdown.`
      : ea.drawdownBasis === 'baseline-period'
        ? `Live drawdown against the first ${settings.eaBaselineTradeCount} trades’, scaled by √n: 1 inside that allowance, then the allowance over the drawdown.`
        : 'No live history past the baseline yet, so nothing to fault: 1.';
  return {
    expectancyStability: {
      label: 'Expectancy stability',
      note: `Recent ${settings.eaRecentTradeCount} against the baseline, in standard errors: 1 at or above it, 0.5 at the ${k}-SE drift line, 0 at ${2 * k} SE.`,
    },
    drawdownVsBaseline: { label: 'Drawdown vs baseline', note: drawdown },
    consistency: {
      label: 'Consistency',
      note: `The share of whole ${settings.eaConsistencyBlockTrades}-trade blocks that finished positive.`,
    },
    executionQuality: {
      label: 'Execution quality',
      note: 'The account’s median entry spread over the spread this EA paid. Slippage is not in the data yet.',
    },
  };
}

/* -------------------------------------------------------------------------
 * Builders
 * ---------------------------------------------------------------------- */

function correlationRows(
  ea: EaResult,
  eas: readonly EaResult[],
  correlations: readonly EaCorrelation[],
): CorrelationRowView[] {
  const names = new Map(eas.map((other) => [other.magic, other.name]));
  return correlations
    .filter((pair) => pair.a === ea.magic || pair.b === ea.magic)
    .map((pair) => {
      const other = pair.a === ea.magic ? pair.b : pair.a;
      return {
        magic: other,
        name: names.get(other) ?? `EA ${other}`,
        valueText: pair.correlation === null ? 'Not enough overlap' : correlationText(pair.correlation),
        intensity: threadOpacity(pair.correlation),
        overlapText: plural(pair.overlapDays, 'shared day'),
        sameBet: pair.sameBet,
        enoughOverlap: pair.enoughOverlap,
        note: pair.sameBet ? SAME_BET_SENTENCE : null,
      };
    });
  // Already strongest first: `eaCorrelations` sorts that way, nulls last.
}

function panelView(
  ea: EaResult,
  eas: readonly EaResult[],
  correlations: readonly EaCorrelation[],
  settings: EngineSettings,
  currency: string,
  routes: SurfaceRoutes,
): EaPanelView {
  const notes = componentNotes(ea, settings);
  const keys: (keyof FinenessComponents)[] = [
    'expectancyStability',
    'drawdownVsBaseline',
    'consistency',
    'executionQuality',
  ];
  return {
    magic: ea.magic,
    name: ea.name,
    tone: starTone(ea.label),
    finenessText: finenessText(ea.fineness),
    labelText: ea.label ?? `Under ${settings.eaConsistencyBlockTrades} trades`,
    figures: [
      { label: 'Net R', value: formatR(ea.netR), note: formatMoney(ea.netMoney, { currency, signed: true }) },
      {
        label: 'Profit factor',
        value: ea.profitFactor === null ? 'No losses' : ea.profitFactor.toFixed(2),
      },
      {
        label: 'Max drawdown',
        value: formatR(-ea.maxDrawdownR),
        note: formatMoney(-ea.maxDrawdownMoney, { currency }),
      },
      { label: 'Expectancy', value: r2(ea.expectancyR), note: `${plural(ea.tradeCount, 'trade')}` },
    ],
    components: keys.map((key) => ({
      key,
      label: notes[key].label,
      weightText: formatPct(FINENESS_WEIGHTS[key] * 100, { digits: 0 }),
      value: ea.components[key],
      valueText: formatPct(ea.components[key] * 100),
      note: notes[key].note,
    })),
    finenessNote:
      ea.fineness === null
        ? `Fineness needs ${settings.eaConsistencyBlockTrades} trades; ${ea.name} has ${ea.tradeCount}.`
        : null,
    drift: {
      alert: ea.drift.alert,
      sentence: driftSentence(ea),
      baselineNote: baselineNote(ea, settings),
      chart: ea.driftSeries.length === 0 ? null : buildDriftChart(ea.driftSeries, ea.drift.baselineExpectancyR),
      legend: {
        baseline: `Baseline ${r2(ea.drift.baselineExpectancyR)}`,
        band: `±${settings.eaDriftStandardErrors} SE`,
      },
    },
    band: ea.drawdownBand === null ? null : bandView(ea.drawdownBand),
    drawdownNote:
      ea.drawdownBasis === 'monte-carlo'
        ? ''
        : 'No backtest dispersion was entered, so there is no Monte Carlo band: the drawdown is judged against the baseline period instead.',
    correlations: correlationRows(ea, eas, correlations),
    ledgerHref: routes.ledgerSource(ea.magic),
  };
}

function matrixView(eas: readonly EaResult[], correlations: readonly EaCorrelation[]): MatrixView {
  const pairOf = (a: number, b: number): EaCorrelation | undefined =>
    correlations.find((pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a));
  const columns = eas.map((ea) => ({ magic: ea.magic, name: ea.name }));
  return {
    columns,
    rows: eas.map((row) => ({
      magic: row.magic,
      name: row.name,
      cells: eas.map((column) => {
        if (column.magic === row.magic) {
          return {
            magic: column.magic,
            self: true,
            text: '',
            intensity: 0,
            sameBet: false,
            enoughOverlap: true,
            ariaLabel: `${row.name} with itself`,
          };
        }
        const pair = pairOf(row.magic, column.magic);
        const correlation = pair?.correlation ?? null;
        return {
          magic: column.magic,
          self: false,
          text: correlation === null ? '·' : correlationText(correlation),
          intensity: threadOpacity(correlation),
          sameBet: pair?.sameBet ?? false,
          enoughOverlap: pair?.enoughOverlap ?? false,
          ariaLabel:
            correlation === null
              ? `${row.name} and ${column.name}: not enough overlap, ${plural(pair?.overlapDays ?? 0, 'shared day')}`
              : `${row.name} and ${column.name}: ${correlationText(correlation)} over ${plural(pair?.overlapDays ?? 0, 'shared day')}${pair?.sameBet ? ', same bet' : ''}`,
        };
      }),
    })),
  };
}

export interface BuildConstellationInput {
  constellation: ConstellationResult;
  settings: EngineSettings;
  currency: string;
  /** Where the links go. Default the demo. */
  routes?: SurfaceRoutes;
}

export function buildConstellationView({
  constellation,
  settings,
  currency,
  routes = DEMO_ROUTES,
}: BuildConstellationInput): ConstellationView {
  const { eas, correlations, summary } = constellation;
  const byMagic = new Map(eas.map((ea) => [ea.magic, ea]));
  const maxVolume = Math.max(0, ...eas.map((ea) => ea.volumeLots));

  const radii = new Map(eas.map((ea) => [ea.magic, starRadius(ea.volumeLots, maxVolume)]));
  const placed = layoutConstellation(
    eas.map((ea) => ({ id: ea.magic, radius: radii.get(ea.magic) ?? 0 })),
    correlations.map((pair) => ({ a: pair.a, b: pair.b, correlation: pair.correlation })),
  );
  const at = new Map(placed.map((node) => [node.id, node]));
  const pct = (value: number, of: number): number => Math.round((value / of) * 10000) / 100;

  const sameBetWith = (magic: number): string[] =>
    correlations
      .filter((pair) => pair.sameBet && (pair.a === magic || pair.b === magic))
      .map((pair) => byMagic.get(pair.a === magic ? pair.b : pair.a)?.name ?? '');

  const stars: StarView[] = eas.map((ea, index) => {
    const node = at.get(ea.magic) ?? { x: SKY_WIDTH / 2, y: SKY_HEIGHT / 2 };
    const tone = starTone(ea.label);
    const partners = sameBetWith(ea.magic);
    const labelText = ea.label ?? `Under ${settings.eaConsistencyBlockTrades} trades`;
    return {
      magic: ea.magic,
      name: ea.name,
      x: node.x,
      y: node.y,
      left: pct(node.x, SKY_WIDTH),
      top: pct(node.y, SKY_HEIGHT),
      r: radii.get(ea.magic) ?? 0,
      tone,
      drifting: ea.drift.alert,
      finenessText: finenessText(ea.fineness),
      labelText,
      netR: formatR(ea.netR),
      labelSide: node.x > SKY_WIDTH / 2 ? 'left' : 'right',
      labelLeft: pct(
        node.x + (node.x > SKY_WIDTH / 2 ? -1 : 1) * labelOffset(radii.get(ea.magic) ?? 0),
        SKY_WIDTH,
      ),
      ariaLabel: [
        `${ea.name}, magic ${ea.magic}.`,
        ea.fineness === null ? 'Not assayed yet.' : `Fineness ${finenessText(ea.fineness)}, ${labelText}.`,
        `Net ${formatR(ea.netR)}.`,
        ea.drift.alert ? 'Drifting.' : '',
        partners.length > 0 ? `Same bet as ${listNames(partners)}.` : '',
      ]
        .filter((part) => part !== '')
        .join(' '),
      delay: Math.min(150 + index * 90, 600),
    };
  });

  const threads: ThreadView[] = correlations
    .filter((pair) => threadOpacity(pair.correlation) > 0)
    .map((pair, index) => {
      const a = at.get(pair.a) ?? { x: 0, y: 0 };
      const b = at.get(pair.b) ?? { x: 0, y: 0 };
      // The label sits off the midpoint, perpendicular to the thread.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const offset = 16;
      const mx = (a.x + b.x) / 2 + (-dy / length) * offset;
      const my = (a.y + b.y) / 2 + (dx / length) * offset;
      return {
        a: pair.a,
        b: pair.b,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        opacity: threadOpacity(pair.correlation),
        sameBet: pair.sameBet,
        lines: pair.sameBet ? doubleThread(a.x, a.y, b.x, b.y, 4) : null,
        correlationText: correlationText(pair.correlation ?? 0),
        labelLeft: pct(mx, SKY_WIDTH),
        labelTop: pct(my, SKY_HEIGHT),
        delay: Math.min(index * 60, 180),
      };
    });

  const panels: Record<string, EaPanelView> = {};
  for (const ea of eas) panels[String(ea.magic)] = panelView(ea, eas, correlations, settings, currency, routes);

  const driftingNames = summary.driftingMagics.map((magic) => byMagic.get(magic)?.name ?? `EA ${magic}`);
  const sameBetNames = correlations
    .filter((pair) => pair.sameBet)
    .map((pair) => `${byMagic.get(pair.a)?.name ?? pair.a} · ${byMagic.get(pair.b)?.name ?? pair.b}`);
  const firstDrifting = summary.driftingMagics[0];

  const alt =
    eas.length === 0
      ? 'No EA trades yet.'
      : [
          `${plural(eas.length, 'EA')} drawn as stars; the closer two stars, the more their daily P&L moves together.`,
          ...eas.map(
            (ea) =>
              `${ea.name}: ${ea.fineness === null ? 'not assayed' : `${finenessText(ea.fineness)}, ${ea.label ?? ''}`}${ea.drift.alert ? ', drifting' : ''}.`,
          ),
          sameBetNames.length > 0 ? `Same bet: ${sameBetNames.join('; ')}.` : 'No pair takes the same bet.',
        ].join(' ');

  return {
    empty: eas.length === 0,
    width: SKY_WIDTH,
    height: SKY_HEIGHT,
    summary: [
      { label: 'EAs', value: String(summary.eaCount), note: 'grouped by magic number' },
      {
        label: 'Average Fineness',
        value: summary.averageFineness === null ? '—' : `${summary.averageFineness.toFixed(1)}‰`,
        note: `${plural(summary.assayedCount, 'EA')} assayed`,
      },
      {
        label: 'Same-bet pairs',
        value: String(summary.sameBetPairs),
        note: sameBetNames.length > 0 ? sameBetNames.join(', ') : 'none',
      },
      {
        label: 'Drifting',
        value: String(summary.driftingMagics.length),
        note: driftingNames.length > 0 ? listNames(driftingNames) : 'none',
      },
    ],
    stars,
    threads,
    field: starField(96, 0x0f1e1d),
    panels,
    matrix: matrixView(eas, correlations),
    drifting:
      firstDrifting === undefined
        ? null
        : { magic: firstDrifting, name: byMagic.get(firstDrifting)?.name ?? `EA ${firstDrifting}` },
    minOverlapDays: settings.eaMinOverlapDays,
    sameBetThreshold: settings.eaSameBetCorrelation.toFixed(1),
    alt,
  };
}
