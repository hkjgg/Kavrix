/**
 * `05 — The Purity Line` (CLAUDE.md §8.4, §6.10), as a view.
 *
 * Built on the server, like `explain.ts` and the Dossier: every number here is
 * an engine output placed on a plane or formatted into a string, and the
 * browser receives paths, stops and labels — never the `AssayResult`.
 *
 *  - **The line** is `counterfactual.curve`'s actual equity, trade by trade in
 *    close order, whole account (§6.10 draws the account).
 *  - **Its colour** is `series` — the rolling Karat at the close of each day.
 *  - **The stamps** are the manual trades the engine flagged with an impurity.
 *  - **The What-if** is each engine scenario's `removedTradeIds` subtracted
 *    from the same curve, which is exactly how the engine defines the V1
 *    counterfactual: linear, in close order, nothing re-priced. The "every
 *    impurity" curve is therefore the engine's own `counterfactualEquity`,
 *    point for point (asserted in the tests), and every end figure printed is
 *    the scenario's own, never re-added here.
 *
 * Type-only imports from the engine: the client component shares
 * `purityLayers` with this file, and the engine must not ride along.
 */

import type { AssayResult, CounterfactualScenarioKey } from '@/lib/engine';
import type { ImpurityKind } from '@/lib/engine/enrich';
import { formatMoney, formatR } from '@/lib/format';
import { IMPURITY_LABELS } from '@/lib/ledger/labels';
import { dayKeyMs, msDayKey, shortDate, utcClock } from '@/lib/dates';
import type { GradientStop, PlotPoint, PurityScale } from '@/components/viz/purity';
import {
  PURITY_HEIGHT,
  PURITY_WIDTH,
  axisTicks,
  decimate,
  linePath,
  purityStops,
  valueDomain,
  xForTime,
  yForValue,
} from '@/components/viz/purity';

export type PurityTone = 'profit' | 'loss' | 'neutral';

export interface PurityStamp {
  tradeId: string;
  /** Percent of the plot box. */
  x: number;
  y: number;
  /** `Opened 15 Jul · 12:16 UTC`. */
  time: string;
  r: string;
  tone: PurityTone;
  /** `News window · No stop`. */
  reasons: string;
}

export interface PurityScenarioView {
  key: CounterfactualScenarioKey;
  label: string;
  path: string;
  /** The curve's last point, in percent of the plot box. */
  end: { x: number; y: number };
  endEquity: string;
  deltaMoney: string;
  deltaR: string;
  tone: PurityTone;
  /** `130 trades removed · 42 of them winners`. */
  removed: string;
  /** What the Karat Gap bills for the same trades (§6.3) — it need not match. */
  gapBills: string;
}

export interface PurityView {
  width: number;
  height: number;
  actualPath: string;
  stops: GradientStop[];
  actualEnd: { x: number; y: number };
  startEquity: string;
  endEquity: string;
  stamps: PurityStamp[];
  scenarios: PurityScenarioView[];
  /** Percent from the top, and the label. */
  yTicks: { y: number; label: string }[];
  /** Percent from the left, and the label. */
  xTicks: { x: number; label: string }[];
  /** `Counterfactual, not a promise` — the engine's own words (§6.10). */
  label: string;
  method: string;
  /** The text alternative for the chart. */
  summary: string;
}

/** Plot units per decimation bucket: finer than a pixel at any width the page draws. */
const BUCKET = 0.75;

function toneOf(value: number): PurityTone {
  if (value > 0) return 'profit';
  if (value < 0) return 'loss';
  return 'neutral';
}

function percentX(x: number): number {
  return Math.round((x / PURITY_WIDTH) * 100_00) / 100;
}

function percentY(y: number): number {
  return Math.round((y / PURITY_HEIGHT) * 100_00) / 100;
}

/** `$25k`, `$27.5k` — axis labels only; every figure a reader acts on is in full. */
export function compactMoney(value: number, currency = 'USD'): string {
  const symbol = formatMoney(0, { currency, digits: 0 }).replace(/[\d.,\s]/g, '');
  const thousands = value / 1000;
  const body = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1);
  return `${value < 0 ? '−' : ''}${symbol}${body.replace('-', '')}k`;
}

function reasonsOf(kinds: readonly ImpurityKind[]): string {
  return kinds.map((kind) => IMPURITY_LABELS[kind]).join(' · ');
}

/** Winners are removed too (§6.10) — so the count is always said out loud. */
function winnersNote(wins: number): string {
  if (wins === 0) return 'none of them winners';
  if (wins === 1) return 'one of them a winner';
  return `${wins} of them winners`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A scenario's equity after every trade, in the curve's close order: the
 * actual equity minus the running total of what that scenario removes. Linear,
 * nothing re-priced — the engine's V1 method (§6.10), which the engine keeps
 * `removedTradeIds` for.
 */
export function scenarioEquity(assay: AssayResult, key: CounterfactualScenarioKey): number[] {
  const scenario = assay.counterfactual.scenarios.find((entry) => entry.key === key);
  const removed = new Set(scenario?.removedTradeIds ?? []);
  const netById = new Map(assay.trades.map((trade) => [trade.id, trade.netProfit]));
  let taken = 0;
  return assay.counterfactual.curve.map((point) => {
    if (removed.has(point.tradeId)) taken += netById.get(point.tradeId) ?? 0;
    return point.actualEquity - taken;
  });
}

export function buildPurityView(assay: AssayResult): PurityView {
  const whatIf = assay.counterfactual;
  const currency = whatIf.currency;
  const curve = whatIf.curve;
  const byId = new Map(assay.trades.map((trade) => [trade.id, trade]));
  const start = whatIf.startingEquity;

  const scenarioCurves = whatIf.scenarios.map((scenario) => ({
    scenario,
    values: scenarioEquity(assay, scenario.key),
  }));

  // The plot opens at midnight on the day of the first entry and closes at
  // the engine's "now" — the same 90 days the Vault shelves.
  const asOfMs = Date.parse(assay.asOf);
  const firstOpen = assay.trades.reduce((earliest, trade) => Math.min(earliest, trade.openTimeMs), asOfMs);
  const x0Ms = dayKeyMs(msDayKey(firstOpen));
  const x1Ms = Math.max(asOfMs, Date.parse(curve[curve.length - 1]?.time ?? assay.asOf));

  const domain = valueDomain([
    start,
    ...curve.map((point) => point.actualEquity),
    ...scenarioCurves.flatMap((entry) => entry.values),
  ]);
  const scale: PurityScale = { x0Ms, x1Ms, ...domain };

  const origin: PlotPoint = { x: 0, y: yForValue(start, scale) };
  const plot = (values: readonly number[]): PlotPoint[] => [
    origin,
    ...curve.map((point, index) => ({
      x: xForTime(Date.parse(point.time), scale),
      y: yForValue(values[index] ?? start, scale),
    })),
  ];

  const actualPoints = plot(curve.map((point) => point.actualEquity));
  const lastActual = actualPoints[actualPoints.length - 1] ?? origin;

  const scenarios: PurityScenarioView[] = scenarioCurves.map(({ scenario, values }) => {
    const points = plot(values);
    const last = points[points.length - 1] ?? origin;
    return {
      key: scenario.key,
      label: scenario.label,
      path: linePath(decimate(points, BUCKET)),
      end: { x: percentX(last.x), y: percentY(last.y) },
      endEquity: formatMoney(scenario.endEquity, { currency }),
      deltaMoney: formatMoney(scenario.deltaMoney, { currency, signed: true }),
      deltaR: formatR(scenario.deltaR),
      tone: toneOf(scenario.deltaMoney),
      removed: `${plural(scenario.removedTradeCount, 'trade')} removed · ${winnersNote(scenario.removedWins)}`,
      gapBills: formatMoney(-scenario.gapCostMoney, { currency, signed: true }),
    };
  });

  const stamps: PurityStamp[] = [];
  curve.forEach((point, index) => {
    const trade = byId.get(point.tradeId);
    if (trade === undefined || !trade.isManual || trade.impurities.length === 0) return;
    const at = actualPoints[index + 1];
    if (at === undefined) return;
    stamps.push({
      tradeId: trade.id,
      x: percentX(at.x),
      y: percentY(at.y),
      time: `Opened ${shortDate(trade.dayKey)} · ${utcClock(trade.openTime)} UTC`,
      r: formatR(trade.rMultiple),
      tone: toneOf(trade.rMultiple),
      reasons: reasonsOf(trade.impurities),
    });
  });

  const yTicks = axisTicks(scale.yMin, scale.yMax, 8).map((value) => ({
    y: percentY(yForValue(value, scale)),
    label: compactMoney(value, currency),
  }));

  // One tick at the first of every month the plot crosses.
  const xTicks: { x: number; label: string }[] = [];
  const cursor = new Date(x0Ms);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() < x1Ms) {
    const key = msDayKey(cursor.getTime());
    xTicks.push({ x: percentX(xForTime(cursor.getTime(), scale)), label: shortDate(key) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const series = assay.series.map((point) => ({ asOfMs: Date.parse(point.asOf), karat: point.karat }));
  const endEquity = formatMoney(whatIf.actualEndEquity, { currency });

  return {
    width: PURITY_WIDTH,
    height: PURITY_HEIGHT,
    actualPath: linePath(decimate(actualPoints, BUCKET)),
    stops: purityStops(series, scale),
    actualEnd: { x: percentX(lastActual.x), y: percentY(lastActual.y) },
    startEquity: formatMoney(start, { currency }),
    endEquity,
    stamps,
    scenarios,
    yTicks,
    xTicks,
    label: whatIf.label,
    method: whatIf.method,
    summary: `Equity from ${formatMoney(start, { currency })} to ${endEquity}, trade by trade. The line is bright gold where the rolling ${assay.settings.rollingWindowDays}-day Karat was high and dull where it was low; ${plural(stamps.length, 'impurity trade is', 'impurity trades are')} stamped on it.`,
  };
}

/* -------------------------------------------------------------------------
 * Which series are drawn — shared with the client component
 * ---------------------------------------------------------------------- */

export interface PurityState {
  whatIf: boolean;
  scenario: CounterfactualScenarioKey;
}

export const DEFAULT_PURITY_STATE: PurityState = { whatIf: false, scenario: 'all' };

export interface PurityLayers {
  /** Always drawn: the What-if sits beside the account, never instead of it. */
  actual: true;
  counterfactual: PurityScenarioView | null;
}

/** The series on screen for a toggle state. An unknown scenario draws none. */
export function purityLayers(view: PurityView, state: PurityState): PurityLayers {
  return {
    actual: true,
    counterfactual: state.whatIf
      ? (view.scenarios.find((scenario) => scenario.key === state.scenario) ?? null)
      : null,
  };
}
