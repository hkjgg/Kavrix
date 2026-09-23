/**
 * The Trade Dossier (CLAUDE.md §4, §17 Stage 4) — everything about one trade,
 * pre-formatted on the server.
 *
 * Like `explain.ts`, this reads engine output and emits strings: the Dossier
 * component is a dumb renderer and ships no engine code. Three things are
 * assembled here, and none of them is a new metric:
 *
 *  - the trade's own figures and impurities, straight off `EnrichedTrade`;
 *  - which pillar each impurity costs points in, and what the Karat Gap
 *    billed for it — the engine's `attributeCost`, the same function the Gap
 *    runs, so the Dossier and the Gap can never disagree about a trade;
 *  - Similar Trades — the engine's `findSimilarTrades` for this trade (§6.9).
 *
 * The price chart's candles come from the demo's own M1 path.
 */

import type { AssayResult } from '@/lib/engine';
import type { HallmarkInput } from '@/components/viz/hallmark';
import type { EnrichedTrade, ImpurityKind } from '@/lib/engine/enrich';
import { sessionsAt } from '@/lib/engine/enrich';
import type { GapPillar } from '@/lib/engine/gap';
import { GAP_PILLAR_LABELS, attributeCost } from '@/lib/engine/gap';
import type { PillarKey } from '@/lib/engine/karat';
import { PILLAR_LABELS } from '@/lib/engine/karat';
import type { SimilarFeature } from '@/lib/engine/similar';
import { findSimilarTrades } from '@/lib/engine/similar';
import type { NewsEvent, SlModification, Trade } from '@/lib/engine/types';
import {
  formatDuration,
  formatLots,
  formatMoney,
  formatPct,
  formatPrice,
  formatR,
} from '@/lib/format';
import type { MinuteBars } from '@/lib/demo/candles';
import { aggregateCandles, candleStart, tradeWindow } from '@/lib/demo/candles';
import { IMPURITY_LABELS, sessionsLabel } from '@/lib/ledger/labels';
import type { LedgerQuery } from '@/lib/ledger/query';
import {
  DEFAULT_LEDGER_QUERY,
  adjacentRows,
  applyLedgerQuery,
  dossierHref,
  pageOfIndex,
  serializeLedgerQuery,
  withQuery,
} from '@/lib/ledger/query';
import type { LedgerRow } from '@/lib/ledger/types';
import { rowHallmark } from '@/lib/ledger/types';
import { hallmarkInputOf } from '@/lib/ledger/rows';
import type { ExplainConfidence, ExplainTone } from '@/components/assay/explain-types';
import { explainConfidence, formatUtc } from '@/components/assay/explain';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export interface DossierFigure {
  label: string;
  value: string;
  tone: ExplainTone;
  caption: string | null;
}

export interface DossierImpurity {
  kind: ImpurityKind | 'overtradingDay';
  label: string;
  /** The rule, with the user's thresholds in it. */
  rule: string;
  /** What this trade did against it. */
  fact: string;
  /** The Karat pillar that deducts for it. */
  pillar: string;
  /** What the Karat Gap billed, or why it billed nothing here. */
  billing: string;
  /** `−$412.20 · −1.6R` when this reason carries the trade's Gap line. */
  cost: string | null;
  billed: boolean;
}

export interface DossierNeighbour {
  id: string;
  href: string;
  hallmark: HallmarkInput;
  time: string;
  source: string;
  direction: string;
  r: string;
  rTone: ExplainTone;
  pnl: string;
  pnlTone: ExplainTone;
  impurities: string;
  matchedOn: string;
}

export interface DossierSimilar {
  headline: string;
  /** "All 12 closed before this trade opened …" — the no-hindsight rule, stated. */
  hindsightLine: string;
  allClosedBefore: boolean;
  record: string;
  confidence: ExplainConfidence | null;
  tentative: boolean;
  neighbours: DossierNeighbour[];
}

/** Epoch seconds, UTC — what lightweight-charts calls a UTCTimestamp. */
export type ChartTime = number;

export interface DossierCandle {
  time: ChartTime;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Sessions the candle's start falls in (§5), for the bands behind it. */
  asia: boolean;
  london: boolean;
  newYork: boolean;
}

export interface DossierChart {
  timeframe: string;
  candles: DossierCandle[];
  news: Array<{ time: ChartTime; label: string; name: string }>;
  direction: 'buy' | 'sell';
  entry: { time: ChartTime; price: number };
  exit: { time: ChartTime; price: number };
  initialSl: number | null;
  initialTp: number | null;
  slMoves: Array<{ time: ChartTime; price: number | null; label: string }>;
  mfe: { price: number; label: string };
  mae: { price: number; label: string };
  digits: number;
  /** The chart in words — its text alternative, and what a reader without JavaScript gets. */
  summary: string;
}

export interface DossierNavLink {
  href: string;
  label: string;
  time: string;
}

export interface DossierNav {
  back: string;
  previous: DossierNavLink | null;
  next: DossierNavLink | null;
  /** `Trade 12 of 220 in the current filter`. */
  position: string;
  /** Set when the trade is not in the filter the reader came from. */
  note: string | null;
}

export interface DossierView {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  when: string;
  isManual: boolean;
  hallmark: HallmarkInput;
  badges: Array<{ label: string; tone: 'news' | 'neutral' }>;
  figures: DossierFigure[];
  impurities: DossierImpurity[];
  /** The EA note: EA trades are measured, not scored. */
  scopeNote: string | null;
  similar: DossierSimilar;
  chart: DossierChart | null;
  nav: DossierNav;
}

export interface DossierSources {
  assay: AssayResult;
  rows: readonly LedgerRow[];
  /** The raw positions — for tickets, MFE/MAE prices and the TP. */
  rawTrades: ReadonlyMap<string, Trade>;
  modifications: readonly SlModification[];
  calendar: readonly NewsEvent[];
  /** Entry volatilities for Similar Trades, computed once for the account. */
  volatilities: Map<string, number>;
  /** Minute bars for the chart, when the account has them. */
  bars: MinuteBars | null;
  digits: number;
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

function tone(value: number): ExplainTone {
  if (value > 0) return 'profit';
  if (value < 0) return 'loss';
  return 'neutral';
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function toChartTime(ms: number): ChartTime {
  return Math.floor(ms / 1000);
}

/** Which Karat pillars deduct for an impurity (§6.1). */
const IMPURITY_PILLARS: Record<ImpurityKind, PillarKey[]> = {
  revenge: ['revenge'],
  news: ['market'],
  rollover: ['market'],
  oversized: ['risk'],
  noStop: ['risk', 'stops'],
  stopWidened: ['stops'],
  exitOverrun: ['exits'],
};

/** Which Gap line an impurity's cost can land on (§6.3). Stops has none. */
const IMPURITY_GAP: Record<ImpurityKind, GapPillar | null> = {
  revenge: 'revenge',
  news: 'market',
  rollover: 'market',
  oversized: 'risk',
  noStop: null,
  stopWidened: null,
  exitOverrun: 'exits',
};

const GAP_BASIS: Record<GapPillar, string> = {
  revenge: 'the whole net loss',
  market: 'the whole net loss',
  risk: 'loss × (1 − limit ÷ actual risk%), the part oversizing added',
  exits: 'the part of the loss beyond −1R',
};

const FEATURE_LABELS: Record<SimilarFeature, string> = {
  hourSin: 'hour',
  hourCos: 'hour',
  weekdaySin: 'weekday',
  weekdayCos: 'weekday',
  asia: 'session',
  london: 'session',
  newYork: 'session',
  newsProximity: 'news',
  inNewsWindow: 'news',
  previousResult: 'previous result',
  riskPercent: 'risk',
  direction: 'direction',
  volatility: 'volatility',
};

/* -------------------------------------------------------------------------
 * Impurities
 * ---------------------------------------------------------------------- */

function newsFact(trade: EnrichedTrade): string {
  const minutes = trade.signedNewsProximityMinutes;
  const name = trade.nearestNewsName ?? 'a high-impact USD release';
  if (minutes === null) return 'No release on the calendar.';
  const whole = Math.round(Math.abs(minutes));
  if (whole === 0) return `Entered at the minute of ${name}.`;
  return `Entered ${whole} min ${minutes < 0 ? 'before' : 'after'} ${name}.`;
}

function ruleFor(
  kind: ImpurityKind,
  trade: EnrichedTrade,
  assay: AssayResult,
  byId: ReadonlyMap<string, EnrichedTrade>,
  modifications: readonly SlModification[],
): { rule: string; fact: string } {
  const s = assay.settings;
  const currency = assay.account.currency;
  switch (kind) {
    case 'revenge': {
      const previous = trade.previousTradeId === null ? undefined : byId.get(trade.previousTradeId);
      const since = trade.minutesSincePreviousClose;
      const parts: string[] = [];
      if (previous !== undefined) {
        parts.push(`The previous trade, ${previous.id}, closed at ${formatR(previous.rMultiple)}.`);
      }
      if (trade.revengeReason !== 'size' && since !== null) {
        parts.push(`This one opened ${Math.round(since)} min later.`);
      }
      if (trade.revengeReason !== 'window' && previous !== undefined) {
        parts.push(`Its lot was ${formatLots(trade.volume)} against ${formatLots(previous.volume)}.`);
      }
      return {
        rule: `Opened within ${s.revengeWindowMinutes} min of a losing close, or sized above ${s.revengeLotMultiple}× the previous trade's lot after a loss.`,
        fact: parts.join(' '),
      };
    }
    case 'news':
      return {
        rule: `Entered within ±${s.newsWindowMinutes} min of a high-impact USD release${trade.newsExempt ? '' : `, without the ${s.newsStrategyTag} tag that exempts it`}.`,
        fact: newsFact(trade),
      };
    case 'rollover':
      return {
        rule: `Entered within ±${s.rolloverWindowMinutes} min of broker server midnight, where Gold spreads widen.`,
        fact: `Spread at entry: ${trade.spreadPointsAtEntry} points.`,
      };
    case 'oversized':
      return {
        rule: `Risk above the ${formatPct(s.riskLimitPercent)} limit. The Risk pillar scores a trade 1 at or under it, falling to 0 at ${s.riskZeroMultiple}×.`,
        fact: `Risked ${formatPct(trade.riskPercent, { digits: 2 })} — ${formatMoney(trade.initialRiskMoney, { currency })} of ${formatMoney(trade.equityAtEntry, { currency })} equity.`,
      };
    case 'noStop':
      return {
        rule: `No stop at entry and none within ${s.stopSetWithinSeconds} s. Risk scores it 0, Stops counts it non-compliant, and R is measured against the default ${formatPct(s.defaultRiskPercent)} of equity.`,
        fact: `R denominator: ${formatMoney(trade.initialRiskMoney, { currency })}, the default risk.`,
      };
    case 'stopWidened': {
      const moves = modifications.filter((modification) => modification.positionId === trade.positionId);
      const described = moves
        .map((modification) =>
          `${modification.time.slice(11, 16)} ${modification.sl === 0 ? 'stop removed' : `stop to ${formatPrice(modification.sl)}`}`,
        )
        .join(' · ');
      return {
        rule: 'A stop moved further from entry, or removed, while the position was open. Trailing it closer never counts.',
        fact: `Initial stop ${trade.initialSl === null ? 'none' : formatPrice(trade.initialSl)}${described === '' ? '' : ` · ${described}`}.`,
      };
    }
    case 'exitOverrun':
      return {
        rule: `A loss worse than ${formatR(s.exitOverrunR)}. The first R was the plan; the rest was the exit.`,
        fact: `Closed at ${formatR(trade.rMultiple, { digits: 2 })}.`,
      };
  }
}

function impuritiesOf(
  trade: EnrichedTrade,
  assay: AssayResult,
  byId: ReadonlyMap<string, EnrichedTrade>,
  modifications: readonly SlModification[],
): DossierImpurity[] {
  const currency = assay.account.currency;
  const attribution = trade.isManual ? attributeCost(trade, assay.settings) : null;

  const entries: DossierImpurity[] = trade.impurities.map((kind) => {
    const { rule, fact } = ruleFor(kind, trade, assay, byId, modifications);
    const gapPillar = IMPURITY_GAP[kind];
    const pillar = IMPURITY_PILLARS[kind].map((key) => PILLAR_LABELS[key]).join(' and ');

    let billing: string;
    let cost: string | null = null;
    let billed = false;
    if (!trade.isManual) {
      billing = 'Not billed. EA trades are outside the Karat Score and the Gap; they are measured for EA Health.';
    } else if (gapPillar === null) {
      billing =
        'No cost line of its own: §6.3 gives Stops none — a missing or widened stop shows up as the loss past −1R, on the Exits line.';
    } else if (attribution === null) {
      billing = trade.isLoss
        ? 'Billed nothing: the attributed cost came to zero.'
        : 'Billed nothing: the trade did not lose, and the Gap bills losses only.';
    } else if (attribution.pillar === gapPillar) {
      billed = true;
      cost = `${formatMoney(-attribution.costMoney, { currency, signed: true })} · ${formatR(-attribution.costR)}`;
      billing = `Billed to ${GAP_PILLAR_LABELS[gapPillar]} in the Karat Gap: ${GAP_BASIS[gapPillar]}.`;
    } else {
      billing = `Not billed here. The Gap bills a trade once, in the order Revenge → Market Conditions → Risk → Exits, and this one went to ${GAP_PILLAR_LABELS[attribution.pillar]}.`;
    }

    return {
      kind,
      label: IMPURITY_LABELS[kind],
      rule,
      fact,
      pillar: trade.isManual ? pillar : `${pillar} — not scored for EA trades`,
      billing,
      cost,
      billed,
    };
  });

  // Overtrading is a day, not a trade: say so when this trade's day went over.
  if (trade.isManual) {
    const sameDay = assay.trades.filter((other) => other.isManual && other.dayKey === trade.dayKey).length;
    if (sameDay > assay.settings.dailyMaxTrades) {
      entries.push({
        kind: 'overtradingDay',
        label: 'Day over the limit',
        rule: `A UTC day with more than ${assay.settings.dailyMaxTrades} trades violates the Overtrading pillar.`,
        fact: `${trade.dayKey} held ${plural(sameDay, 'manual trade')}.`,
        pillar: PILLAR_LABELS.overtrading,
        billing: 'No cost line: the Gap bills trades, not days.',
        cost: null,
        billed: false,
      });
    }
  }

  return entries;
}

/* -------------------------------------------------------------------------
 * Similar trades
 * ---------------------------------------------------------------------- */

function similarOf(
  trade: EnrichedTrade,
  sources: DossierSources,
  rowsById: ReadonlyMap<string, LedgerRow>,
  query: LedgerQuery,
): DossierSimilar {
  const { assay } = sources;
  const currency = assay.account.currency;
  const result = findSimilarTrades(trade, assay.trades, assay.settings, {
    volatilities: sources.volatilities,
  });
  const byId = new Map(assay.trades.map((other) => [other.id, other]));

  const neighbours: DossierNeighbour[] = result.neighbours.flatMap((neighbour) => {
    const row = rowsById.get(neighbour.tradeId);
    if (row === undefined) return [];
    const matched = [...new Set(neighbour.matchedOn.map((feature) => FEATURE_LABELS[feature]))];
    return [
      {
        id: row.id,
        href: dossierHref(row.id, query),
        hallmark: rowHallmark(row, assay.settings.riskLimitPercent),
        time: formatUtc(row.openTime),
        source: row.source,
        direction: row.direction,
        r: formatR(neighbour.rMultiple, { digits: 2 }),
        rTone: tone(neighbour.rMultiple),
        pnl: formatMoney(neighbour.netProfit, { currency, signed: true }),
        pnlTone: tone(neighbour.netProfit),
        impurities:
          row.impurities.length === 0
            ? '—'
            : row.impurities.map((kind) => IMPURITY_LABELS[kind]).join(' · '),
        matchedOn: matched.join(', '),
      },
    ];
  });

  const allClosedBefore = result.neighbours.every(
    (neighbour) => (byId.get(neighbour.tradeId)?.closeTimeMs ?? Infinity) < trade.openTimeMs,
  );
  const pool = trade.isManual
    ? 'manual trades'
    : `trades of ${rowsById.get(trade.id)?.source ?? `EA ${trade.magic}`}`;
  const count = result.neighbours.length;

  return {
    headline: result.headline,
    hindsightLine:
      count === 0
        ? 'No trade had closed before this one opened, so there is nothing to compare it with.'
        : allClosedBefore
          ? `${count === 1 ? 'The one neighbour' : `All ${count}`} closed before this trade opened — drawn from the ${result.eligibleCount} ${pool} that had. Nothing that happened later is in the comparison.`
          : 'Not every neighbour closed before this trade opened.',
    allClosedBefore,
    record:
      count === 0
        ? '—'
        : `${result.wins} won · ${result.losses} lost · ${formatR(result.meanR, { digits: 2 })} average · ${formatMoney(result.netMoney, { currency, signed: true })}`,
    confidence: explainConfidence(result.confidence),
    tentative: result.confidence.tentative,
    neighbours,
  };
}

/* -------------------------------------------------------------------------
 * Chart
 * ---------------------------------------------------------------------- */

const SHORT_NEWS: ReadonlyArray<[RegExp, string]> = [
  [/non-?farm/i, 'NFP'],
  [/fomc|federal funds|rate decision/i, 'FOMC'],
  [/core cpi/i, 'Core CPI'],
  [/\bcpi\b|consumer price/i, 'CPI'],
  [/\bppi\b|producer price/i, 'PPI'],
  [/\bpce\b/i, 'PCE'],
  [/\bgdp\b/i, 'GDP'],
  [/retail sales/i, 'Retail'],
  [/ism/i, 'ISM'],
  [/jobless|unemployment claims/i, 'Claims'],
  [/jolts/i, 'JOLTS'],
];

export function shortNewsLabel(name: string): string {
  for (const [pattern, label] of SHORT_NEWS) if (pattern.test(name)) return label;
  return name.split(/\s+/).slice(0, 2).join(' ');
}

function chartOf(trade: EnrichedTrade, raw: Trade | undefined, sources: DossierSources): DossierChart | null {
  if (sources.bars === null || raw === undefined) return null;
  const window = tradeWindow(trade.openTimeMs, trade.closeTimeMs);
  const candles = aggregateCandles(sources.bars, window.fromMs, window.toMs, window.timeframe);
  if (candles.length === 0) return null;

  const snap = (ms: number): ChartTime => toChartTime(candleStart(ms, window.timeframe));
  const first = candles[0]?.timeMs ?? window.fromMs;
  const last = candles[candles.length - 1]?.timeMs ?? window.toMs;
  const candleTimes = new Set(candles.map((candle) => candle.timeMs));
  const inView = (ms: number): boolean => candleTimes.has(candleStart(ms, window.timeframe));

  const bands = (ms: number) => {
    const sessions = sessionsAt(ms);
    return {
      asia: sessions.includes('asia'),
      london: sessions.includes('london'),
      newYork: sessions.includes('newYork'),
    };
  };

  const news = sources.calendar
    .filter(
      (event) =>
        event.importance === 'high' &&
        event.currency === 'USD' &&
        Date.parse(event.time) >= first &&
        Date.parse(event.time) <= last + window.timeframe * 60_000,
    )
    .filter((event) => inView(Date.parse(event.time)))
    .map((event) => ({
      time: snap(Date.parse(event.time)),
      label: shortNewsLabel(event.name),
      name: `${event.name} · ${event.time.slice(11, 16)} UTC`,
    }));

  const slMoves = sources.modifications
    .filter((modification) => modification.positionId === trade.positionId)
    .filter((modification) => inView(Date.parse(modification.time)))
    .map((modification, index) => ({
      time: snap(Date.parse(modification.time)),
      price: modification.sl === 0 ? null : modification.sl,
      label:
        modification.sl === 0
          ? `Stop removed ${modification.time.slice(11, 16)}`
          : `SL ${index + 1} · ${modification.time.slice(11, 16)}`,
    }));

  const digits = sources.digits;
  const timeframe = window.timeframe === 60 ? 'H1' : `M${window.timeframe}`;
  const summary = [
    `${timeframe} candles, ${formatUtc(new Date(first).toISOString())} to ${formatUtc(new Date(last).toISOString())} UTC.`,
    `${trade.direction === 'buy' ? 'Bought' : 'Sold'} at ${formatPrice(trade.openPrice, digits)}, closed at ${formatPrice(trade.closePrice, digits)}.`,
    trade.initialSl === null ? 'No initial stop.' : `Initial stop ${formatPrice(trade.initialSl, digits)}.`,
    slMoves.length === 0 ? '' : `${plural(slMoves.length, 'stop modification')}.`,
    `Best price reached ${formatPrice(raw.mfePrice, digits)} (${formatR(trade.mfeR)}), worst ${formatPrice(raw.maePrice, digits)} (${formatR(trade.maeR)}).`,
    news.length === 0
      ? 'No high-impact USD release in view.'
      : `High-impact USD releases in view: ${news.map((event) => event.name).join('; ')}.`,
  ]
    .filter((part) => part !== '')
    .join(' ');

  return {
    timeframe,
    candles: candles.map((candle) => ({
      time: toChartTime(candle.timeMs),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      ...bands(candle.timeMs),
    })),
    news,
    direction: trade.direction,
    entry: { time: snap(trade.openTimeMs), price: trade.openPrice },
    exit: { time: snap(trade.closeTimeMs), price: trade.closePrice },
    initialSl: trade.initialSl,
    initialTp: raw.initialTp,
    slMoves,
    mfe: { price: raw.mfePrice, label: `MFE ${formatR(trade.mfeR)}` },
    mae: { price: raw.maePrice, label: `MAE ${formatR(trade.maeR)}` },
    digits,
    summary,
  };
}

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */

function navOf(
  id: string,
  rows: readonly LedgerRow[],
  query: LedgerQuery,
  asOfMs: number,
): DossierNav {
  let effective = query;
  let ordered = applyLedgerQuery(rows, query, { asOfMs });
  let adjacent = adjacentRows(ordered, id);
  let note: string | null = null;

  if (adjacent.index === -1) {
    effective = { ...DEFAULT_LEDGER_QUERY };
    ordered = applyLedgerQuery(rows, effective, { asOfMs });
    adjacent = adjacentRows(ordered, id);
    note = 'This trade is outside the filter you came from, so previous and next follow the whole Ledger.';
  }

  const link = (row: LedgerRow | null): DossierNavLink | null =>
    row === null ? null : { href: dossierHref(row.id, effective), label: row.id, time: formatUtc(row.openTime) };

  const filtered = serializeLedgerQuery(effective, { withoutPage: true }) !== '';
  return {
    back: withQuery(
      '/ledger',
      serializeLedgerQuery({ ...effective, page: pageOfIndex(Math.max(adjacent.index, 0)) }),
    ),
    previous: link(adjacent.previous),
    next: link(adjacent.next),
    position: `Trade ${adjacent.index + 1} of ${adjacent.total} ${filtered ? 'in the current filter' : 'in the Ledger'}`,
    note,
  };
}

/* -------------------------------------------------------------------------
 * The dossier
 * ---------------------------------------------------------------------- */

export function buildDossier(
  tradeId: string,
  sources: DossierSources,
  query: LedgerQuery,
): DossierView | null {
  const { assay } = sources;
  const byId = new Map(assay.trades.map((trade) => [trade.id, trade]));
  const trade = byId.get(tradeId);
  if (trade === undefined) return null;

  const rowsById = new Map(sources.rows.map((row) => [row.id, row]));
  const row = rowsById.get(tradeId);
  const raw = sources.rawTrades.get(tradeId);
  const currency = assay.account.currency;
  const digits = sources.digits;
  const asOfMs = Date.parse(assay.asOf);
  const source = row?.source ?? (trade.isManual ? 'Manual' : `EA ${trade.magic}`);

  const figures: DossierFigure[] = [
    {
      label: 'R result',
      value: formatR(trade.rMultiple, { digits: 2 }),
      tone: tone(trade.rMultiple),
      caption: trade.noStop ? 'Against the default risk — no stop' : `Against ${formatMoney(trade.initialRiskMoney, { currency })} of initial risk`,
    },
    {
      label: 'Net P&L',
      value: formatMoney(trade.netProfit, { currency, signed: true }),
      tone: tone(trade.netProfit),
      caption: `Gross ${formatMoney(trade.grossProfit, { currency, signed: true })} · commission ${formatMoney(trade.commission, { currency, signed: true })} · swap ${formatMoney(trade.swap, { currency, signed: true })}`,
    },
    {
      label: 'Risk',
      value: formatPct(trade.riskPercent, { digits: 2 }),
      tone: 'neutral',
      caption: `Of ${formatMoney(trade.equityAtEntry, { currency })} equity · limit ${formatPct(assay.settings.riskLimitPercent)}`,
    },
    {
      label: 'Held',
      value: formatDuration(trade.durationSeconds),
      tone: 'neutral',
      caption: sessionsLabel(trade.sessions),
    },
    {
      label: 'Entry → exit',
      value: `${formatPrice(trade.openPrice, digits)} → ${formatPrice(trade.closePrice, digits)}`,
      tone: 'neutral',
      caption: `${formatLots(trade.volume)} lots · spread ${trade.spreadPointsAtEntry} → ${trade.spreadPointsAtExit} pts`,
    },
    {
      label: 'Initial stop',
      value: trade.initialSl === null ? 'None' : formatPrice(trade.initialSl, digits),
      tone: 'neutral',
      caption: trade.noStop
        ? `None within ${assay.settings.stopSetWithinSeconds} s`
        : trade.slWidened
          ? 'Widened while open'
          : (trade.initialSlAfterSeconds ?? 0) > 0
            ? `Set ${Math.round(trade.initialSlAfterSeconds ?? 0)} s after entry · never widened`
            : 'At entry · never widened',
    },
    {
      label: 'MFE / MAE',
      value: `${formatR(trade.mfeR)} / ${formatR(trade.maeR)}`,
      tone: 'neutral',
      caption:
        raw === undefined
          ? 'Best and worst excursion while open'
          : `Best ${formatPrice(raw.mfePrice, digits)} · worst ${formatPrice(raw.maePrice, digits)}`,
    },
    {
      label: 'News',
      value:
        trade.newsProximityMinutes === null
          ? 'Clear'
          : `${Math.round(trade.newsProximityMinutes)} min`,
      tone: 'neutral',
      caption:
        trade.newsProximityMinutes === null
          ? 'No release on the calendar'
          : `${trade.signedNewsProximityMinutes !== null && trade.signedNewsProximityMinutes < 0 ? 'Before' : 'After'} ${trade.nearestNewsName ?? 'a release'}`,
    },
  ];

  const tickets = raw === undefined ? '' : ` · deals ${raw.entryDealTicket} / ${raw.exitDealTicket}`;

  return {
    id: trade.id,
    eyebrow: `Trade Dossier · ${source}${trade.isManual ? '' : ` · magic ${trade.magic}`}`,
    title: trade.id,
    subtitle: `${trade.direction === 'buy' ? 'Buy' : 'Sell'} ${formatLots(trade.volume)} lots ${trade.symbol} · position ${trade.positionId}${tickets}`,
    when: `${formatUtc(trade.openTime)} → ${trade.closeTime.slice(0, 10) === trade.openTime.slice(0, 10) ? trade.closeTime.slice(11, 16) : formatUtc(trade.closeTime)} UTC`,
    isManual: trade.isManual,
    hallmark: row === undefined ? hallmarkInputOf(trade, assay.settings) : rowHallmark(row, assay.settings.riskLimitPercent),
    badges: trade.impurities.map((kind) => ({
      label: IMPURITY_LABELS[kind],
      tone: kind === 'news' ? 'news' : 'neutral',
    })),
    figures,
    impurities: impuritiesOf(trade, assay, byId, sources.modifications),
    scopeNote: trade.isManual
      ? null
      : 'An EA trade. The Karat Score and the Karat Gap cover manual trading only (§6); this trade counts towards its EA’s health instead.',
    similar: similarOf(trade, sources, rowsById, query),
    chart: chartOf(trade, raw, sources),
    nav: navOf(trade.id, sources.rows, query, asOfMs),
  };
}
