/**
 * Personal baselines (CLAUDE.md §6.7) — the trader's own normal.
 *
 * The Karat Score judges a trade against the thresholds in Settings: 1% risk,
 * five trades a day, the numbers §6.1 fixes. This module judges a trade
 * against the trader instead. Somebody whose ordinary lot is 0.20 and who
 * suddenly trades 0.90 has changed, whatever the configured limit says.
 *
 * Two rules keep the two apart:
 *
 *  - **These are findings only.** Nothing here touches a pillar, a deduction
 *    or the Gap. Karat keeps the configured thresholds (§6.7).
 *  - **The baseline excludes the window it is compared against.** A recent
 *    week measured against a history that contains it hides exactly the change
 *    the card exists to show.
 */

import { formatPct, formatR } from '@/lib/format';
import type { ConfidenceResult } from './confidence';
import { describeTrades } from './confidence';
import type { EnrichedTrade } from './enrich';
import { manualTrades } from './enrich';
import { median, quantile, round, sum } from './math';
import type { EngineSettings } from './settings';
import { DAY_MS, MINUTE_MS } from './time';

export type BaselineMetricKey =
  | 'volume'
  | 'riskPercent'
  | 'tradesPerDay'
  | 'holdingMinutes';

export interface BaselineMetric {
  key: BaselineMetricKey;
  label: string;
  /** What the numbers are in: `lots`, `%`, `trades` or `min`. */
  unit: string;
  /** Observations behind the baseline. Trades, or active days for `tradesPerDay`. */
  sampleCount: number;
  median: number;
  p90: number;
  /** The same statistic over the recent window. */
  recentMedian: number;
  recentSampleCount: number;
  /** `recentMedian > p90` — the trader's typical behaviour is outside their own normal. */
  outsideNormal: boolean;
  /** How far past p90 the recent median sits, as a percentage of p90. */
  exceedancePercent: number;
  /** Recent observations individually above the baseline p90. */
  exceedingTradeIds: string[];
}

export interface BaselineFinding {
  id: string;
  metric: BaselineMetricKey;
  headline: string;
  tradeIds: string[];
  /** Confidence over the recent trades that sit outside the baseline. */
  confidence: ConfidenceResult;
  /** Money those trades made or lost. */
  impactMoney: number;
  impactR: number;
}

export interface BaselinesResult {
  /** Days of behaviour compared against the baseline. */
  recentDays: number;
  recentStart: string;
  /** Baseline trades — everything before the recent window. */
  baselineTradeCount: number;
  recentTradeCount: number;
  /** False when the baseline is too short to claim anybody's "normal" (§6.7). */
  measurable: boolean;
  /** Why the card is quiet. `null` when it is measurable. */
  hiddenReason: string | null;
  metrics: BaselineMetric[];
  findings: BaselineFinding[];
}

const METRIC_LABELS: Record<BaselineMetricKey, { label: string; unit: string }> = {
  volume: { label: 'Lot size', unit: 'lots' },
  riskPercent: { label: 'Risk per trade', unit: '%' },
  tradesPerDay: { label: 'Trades per day', unit: 'trades' },
  holdingMinutes: { label: 'Holding time', unit: 'min' },
};

/** Trades per active UTC day. Days with no trade are not days the trader traded. */
function tradesPerDay(trades: readonly EnrichedTrade[]): number[] {
  const byDay = new Map<string, number>();
  for (const trade of trades) {
    byDay.set(trade.dayKey, (byDay.get(trade.dayKey) ?? 0) + 1);
  }
  return [...byDay.values()];
}

/** The per-trade values a metric is measured from. */
function valuesFor(
  key: BaselineMetricKey,
  trades: readonly EnrichedTrade[],
): number[] {
  switch (key) {
    case 'volume':
      return trades.map((trade) => trade.volume);
    case 'riskPercent':
      return trades.map((trade) => trade.riskPercent);
    case 'holdingMinutes':
      return trades.map((trade) => trade.durationSeconds / 60);
    case 'tradesPerDay':
      return tradesPerDay(trades);
  }
}

function formatValue(key: BaselineMetricKey, value: number): string {
  switch (key) {
    case 'volume':
      return `${value.toFixed(2)} lots`;
    case 'riskPercent':
      return formatPct(value, { digits: 2 });
    case 'holdingMinutes':
      return `${Math.round(value)} min`;
    case 'tradesPerDay':
      return `${value.toFixed(1)} trades a day`;
  }
}

/**
 * Median and p90 of the trader's own behaviour, and what the recent window
 * did against them.
 *
 * Choice: the flag fires on the recent **median**, not on a single trade. One
 * oversized lot is an event; a week whose typical lot sits above the p90 of
 * every week before it is a change of behaviour, and only the second is worth
 * putting in front of somebody. The individual exceedances still ride along in
 * `exceedingTradeIds` so the UI can open them.
 */
export function computeBaselines(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  asOfMs: number,
): BaselinesResult {
  const manual = manualTrades(trades).filter((trade) => trade.openTimeMs <= asOfMs);
  const recentStartMs = asOfMs - settings.baselineRecentDays * DAY_MS;
  const baseline = manual.filter((trade) => trade.openTimeMs <= recentStartMs);
  const recent = manual.filter((trade) => trade.openTimeMs > recentStartMs);

  const measurable =
    baseline.length >= settings.baselineMinTrades && recent.length > 0;

  const keys: BaselineMetricKey[] = [
    'volume',
    'riskPercent',
    'tradesPerDay',
    'holdingMinutes',
  ];

  const metrics: BaselineMetric[] = keys.map((key) => {
    const baselineValues = valuesFor(key, baseline);
    const recentValues = valuesFor(key, recent);
    const p90 = round(quantile(baselineValues, 0.9), 4);
    const recentMedian = round(median(recentValues), 4);
    const outsideNormal = measurable && baselineValues.length > 0 && recentMedian > p90;

    // Per-trade metrics can name the trades outside the baseline; trades-per-day
    // is a property of a day, so it names every trade on the days that exceeded.
    let exceedingTradeIds: string[] = [];
    if (key === 'tradesPerDay') {
      const byDay = new Map<string, EnrichedTrade[]>();
      for (const trade of recent) {
        const list = byDay.get(trade.dayKey);
        if (list === undefined) byDay.set(trade.dayKey, [trade]);
        else list.push(trade);
      }
      exceedingTradeIds = [...byDay.values()]
        .filter((dayTrades) => dayTrades.length > p90)
        .flatMap((dayTrades) => dayTrades.map((trade) => trade.id));
    } else {
      const perTrade = valuesFor(key, recent);
      exceedingTradeIds = recent
        .filter((_, index) => (perTrade[index] ?? 0) > p90)
        .map((trade) => trade.id);
    }

    return {
      key,
      label: METRIC_LABELS[key].label,
      unit: METRIC_LABELS[key].unit,
      sampleCount: baselineValues.length,
      median: round(median(baselineValues), 4),
      p90,
      recentMedian,
      recentSampleCount: recentValues.length,
      outsideNormal,
      exceedancePercent:
        p90 > 0 && outsideNormal ? round(((recentMedian - p90) / p90) * 100, 1) : 0,
      exceedingTradeIds,
    };
  });

  const byId = new Map(manual.map((trade) => [trade.id, trade]));
  const findings: BaselineFinding[] = metrics
    .filter((metric) => metric.outsideNormal)
    .map((metric) => {
      const own = metric.exceedingTradeIds
        .map((id) => byId.get(id))
        .filter((trade): trade is EnrichedTrade => trade !== undefined);
      const impactMoney = round(sum(own.map((trade) => trade.netProfit)), 2);
      const impactR = round(sum(own.map((trade) => trade.rMultiple)), 2);
      return {
        id: `outside-normal-${metric.key}`,
        metric: metric.key,
        headline: `${metric.label} over the last ${settings.baselineRecentDays} days is ${formatValue(metric.key, metric.recentMedian)}, outside your own normal — your p90 before this week was ${formatValue(metric.key, metric.p90)}, your median ${formatValue(metric.key, metric.median)}. ${own.length} ${own.length === 1 ? 'trade' : 'trades'} above it, for ${formatR(impactR)}.`,
        tradeIds: own.map((trade) => trade.id),
        confidence: describeTrades(own, { settings }),
        impactMoney,
        impactR,
      };
    });

  return {
    recentDays: settings.baselineRecentDays,
    recentStart: new Date(recentStartMs).toISOString(),
    baselineTradeCount: baseline.length,
    recentTradeCount: recent.length,
    measurable,
    hiddenReason: measurable
      ? null
      : `Needs ${settings.baselineMinTrades} trades before the last ${settings.baselineRecentDays} days · ${baseline.length} so far`,
    metrics,
    findings: measurable ? findings : [],
  };
}

/** Minutes a trade was held — the unit `holdingMinutes` is measured in. */
export function holdingMinutes(trade: EnrichedTrade): number {
  return (trade.closeTimeMs - trade.openTimeMs) / MINUTE_MS;
}
