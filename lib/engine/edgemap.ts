/**
 * The Edge Map (CLAUDE.md §6.8) — where the edge is, and where it is not.
 *
 * Every cell is a group of trades sharing one **pre-trade** condition: the
 * clock, the calendar, what happened just before. Nothing a trade did after it
 * was opened may define a cell, or the map would be sorting trades by their
 * outcome and then reporting that outcome as a pattern.
 *
 * Two rules keep it honest:
 *
 *  - A cell under `edgeMapMinCellTrades` (default 8) is not tested at all.
 *  - Twenty-odd cells are tested at once, so one in twenty looks significant
 *    by luck. Benjamini–Hochberg controls the false-discovery rate across the
 *    whole map before any cell is allowed to call itself Strong (§6.6).
 */

import type { ConfidenceLabel, ConfidenceResult } from './confidence';
import { benjaminiHochberg, correctedLabel, describeTrades } from './confidence';
import type { EnrichedTrade } from './enrich';
import { SESSIONS, manualTrades } from './enrich';
import { mean, round, sum } from './math';
import type { EngineSettings } from './settings';
import { WEEKDAY_NAMES, fractionalHourOfDay } from './time';

/* -------------------------------------------------------------------------
 * Dimensions
 * ---------------------------------------------------------------------- */

export type EdgeDimensionKey = 'sessionPhase' | 'weekday' | 'news' | 'context';

export const EDGE_DIMENSION_LABELS: Record<EdgeDimensionKey, string> = {
  sessionPhase: 'Session',
  weekday: 'Weekday',
  news: 'News proximity',
  context: 'Context',
};

/**
 * Hours that count as a session's open.
 *
 * The open is a different market from the rest of the session — the London
 * open is the demo trader's edge while London as a whole is not (§11) — so the
 * map splits each session rather than averaging the two together.
 */
export const SESSION_OPEN_HOURS = 3;

export interface SessionPhase {
  key: string;
  label: string;
  startHour: number;
  endHour: number;
}

/** Each session's open and its remainder, plus the hours §5 gives to nobody. */
export const SESSION_PHASES: readonly SessionPhase[] = [
  ...SESSIONS.flatMap((session): SessionPhase[] => {
    const openEnd = Math.min(session.startHour + SESSION_OPEN_HOURS, session.endHour);
    const phases: SessionPhase[] = [
      {
        key: `${session.key}-open`,
        label: `${session.label} open`,
        startHour: session.startHour,
        endHour: openEnd,
      },
    ];
    if (openEnd < session.endHour) {
      phases.push({
        key: `${session.key}-rest`,
        label: `${session.label} after the open`,
        startHour: openEnd,
        endHour: session.endHour,
      });
    }
    return phases;
  }),
];

/** Phases a UTC instant falls in. Sessions overlap, so a trade can be in two. */
export function sessionPhasesAt(ms: number): string[] {
  const hour = fractionalHourOfDay(ms);
  const keys = SESSION_PHASES.filter(
    (phase) => hour >= phase.startHour && hour < phase.endHour,
  ).map((phase) => phase.key);
  return keys.length > 0 ? keys : ['outside'];
}

export type NewsBucketKey = 'in-window' | 'near' | 'clear';

/** Minutes from a release that separate `near` from `clear` (§6.8). */
export const NEWS_NEAR_MINUTES = 60;

export const NEWS_BUCKET_LABELS: Record<NewsBucketKey, string> = {
  'in-window': 'In the news window',
  near: '15–60 min from a release',
  clear: 'Clear of the calendar',
};

/** Which news bucket a trade's entry falls in. */
export function newsBucket(
  trade: EnrichedTrade,
  settings: EngineSettings,
): NewsBucketKey {
  const minutes = trade.newsProximityMinutes;
  if (minutes === null) return 'clear';
  if (minutes <= settings.newsWindowMinutes) return 'in-window';
  if (minutes <= NEWS_NEAR_MINUTES) return 'near';
  return 'clear';
}

export type ContextKey = 'first-of-day' | 'after-win' | 'after-loss' | 'no-prior';

export const CONTEXT_LABELS: Record<ContextKey, string> = {
  'first-of-day': 'First trade of the day',
  'after-win': 'After a win',
  'after-loss': 'After a loss',
  'no-prior': 'No previous trade',
};

/**
 * Context cells are exclusive, in that order: a day's first trade is a first
 * trade even when yesterday ended badly. The trader sat down and started; that
 * is a different decision from the one taken eight minutes after a loss.
 */
export function contextOf(trade: EnrichedTrade, isFirstOfDay: boolean): ContextKey {
  if (isFirstOfDay) return 'first-of-day';
  if (trade.previousTradeId === null) return 'no-prior';
  return trade.previousWasLoss ? 'after-loss' : 'after-win';
}

/* -------------------------------------------------------------------------
 * Cells
 * ---------------------------------------------------------------------- */

export interface EdgeCell {
  dimension: EdgeDimensionKey;
  dimensionLabel: string;
  key: string;
  label: string;
  tradeCount: number;
  netR: number;
  avgR: number;
  netMoney: number;
  /** Share of the tested population that fell in this cell, in percent. */
  sharePercent: number;
  confidence: ConfidenceResult;
  /** Two-sided bootstrap p-value for "this cell's mean R is 0". */
  pValue: number;
  /** Benjamini–Hochberg adjusted p-value across every tested cell. */
  qValue: number;
  /** Survived the correction at `edgeMapAlpha`. */
  survivedCorrection: boolean;
  /** The confidence label after the correction — never Strong without BH (§6.8). */
  confidenceLabel: ConfidenceLabel;
  tradeIds: string[];
}

export interface EdgeMapResult {
  minTrades: number;
  alpha: number;
  /** Manual trades the map was built from. */
  tradeCount: number;
  /** Cells that met the minimum and were tested. */
  testedCells: number;
  /** Cells that did not meet the minimum, named so the UI can say why. */
  skippedCells: { dimension: EdgeDimensionKey; key: string; label: string; tradeCount: number }[];
  cells: EdgeCell[];
  /** Best cells by mean R, Weak ones excluded (§6.8). */
  strengths: EdgeCell[];
  /** Worst cells by mean R, Weak ones excluded. */
  weaknesses: EdgeCell[];
}

interface CellDraft {
  dimension: EdgeDimensionKey;
  key: string;
  label: string;
  trades: EnrichedTrade[];
}

/**
 * The Edge Map over an account's manual trades.
 *
 * Manual only, like the score (§6): an EA's hour of the day is the EA's
 * setting, not the trader's decision.
 */
export function computeEdgeMap(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
): EdgeMapResult {
  const manual = manualTrades(trades);

  // Which trades open a day — needed before the context cells can be built.
  const seenDays = new Set<string>();
  const firstOfDay = new Set<string>();
  for (const trade of manual) {
    if (!seenDays.has(trade.dayKey)) {
      seenDays.add(trade.dayKey);
      firstOfDay.add(trade.id);
    }
  }

  const drafts = new Map<string, CellDraft>();
  const push = (
    dimension: EdgeDimensionKey,
    key: string,
    label: string,
    trade: EnrichedTrade,
  ): void => {
    const id = `${dimension}:${key}`;
    const draft = drafts.get(id);
    if (draft === undefined) drafts.set(id, { dimension, key, label, trades: [trade] });
    else draft.trades.push(trade);
  };

  const phaseLabels = new Map(SESSION_PHASES.map((phase) => [phase.key, phase.label]));
  for (const trade of manual) {
    for (const phase of sessionPhasesAt(trade.openTimeMs)) {
      push('sessionPhase', phase, phaseLabels.get(phase) ?? 'Outside sessions', trade);
    }
    push(
      'weekday',
      String(trade.weekdayUtc),
      WEEKDAY_NAMES[trade.weekdayUtc] ?? 'Unknown',
      trade,
    );
    const news = newsBucket(trade, settings);
    push('news', news, NEWS_BUCKET_LABELS[news], trade);
    const context = contextOf(trade, firstOfDay.has(trade.id));
    push('context', context, CONTEXT_LABELS[context], trade);
  }

  const ordered = [...drafts.values()].sort(
    (a, b) => a.dimension.localeCompare(b.dimension) || a.key.localeCompare(b.key),
  );
  const tested = ordered.filter(
    (draft) => draft.trades.length >= settings.edgeMapMinCellTrades,
  );
  const skippedCells = ordered
    .filter((draft) => draft.trades.length < settings.edgeMapMinCellTrades)
    .map((draft) => ({
      dimension: draft.dimension,
      key: draft.key,
      label: draft.label,
      tradeCount: draft.trades.length,
    }));

  const confidences = tested.map((draft) => describeTrades(draft.trades, { settings }));
  const correction = benjaminiHochberg(
    confidences.map((confidence) => confidence.pValue),
    settings.edgeMapAlpha,
  );

  const cells: EdgeCell[] = tested.map((draft, index) => {
    const confidence = confidences[index] ?? describeTrades([]);
    const survived = correction.rejected[index] ?? false;
    return {
      dimension: draft.dimension,
      dimensionLabel: EDGE_DIMENSION_LABELS[draft.dimension],
      key: draft.key,
      label: draft.label,
      tradeCount: draft.trades.length,
      netR: round(sum(draft.trades.map((trade) => trade.rMultiple)), 2),
      avgR: round(mean(draft.trades.map((trade) => trade.rMultiple)), 3),
      netMoney: round(sum(draft.trades.map((trade) => trade.netProfit)), 2),
      sharePercent:
        manual.length === 0 ? 0 : round((draft.trades.length / manual.length) * 100, 1),
      confidence,
      pValue: confidence.pValue,
      qValue: correction.qValues[index] ?? 1,
      survivedCorrection: survived,
      confidenceLabel: correctedLabel(confidence.label, survived),
      tradeIds: draft.trades.map((trade) => trade.id),
    };
  });

  // Ranked by mean R, and only cells the data supports: a Weak cell is a
  // handful of trades pointing somewhere, which is not an edge (§6.8).
  const reportable = cells.filter((cell) => cell.confidenceLabel !== 'weak');
  const strengths = reportable
    .filter((cell) => cell.avgR > 0)
    .sort((a, b) => b.avgR - a.avgR || a.key.localeCompare(b.key))
    .slice(0, settings.edgeMapTopCells);
  const weaknesses = reportable
    .filter((cell) => cell.avgR < 0)
    .sort((a, b) => a.avgR - b.avgR || a.key.localeCompare(b.key))
    .slice(0, settings.edgeMapTopCells);

  return {
    minTrades: settings.edgeMapMinCellTrades,
    alpha: settings.edgeMapAlpha,
    tradeCount: manual.length,
    testedCells: cells.length,
    skippedCells,
    cells,
    strengths,
    weaknesses,
  };
}
