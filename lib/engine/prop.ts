/**
 * The prop-firm check (CLAUDE.md §6.12) — which days would have breached.
 *
 * Three things this is not, and the module is built so it cannot become them:
 *
 *  - **It is not a prediction.** Every number is a day that already happened.
 *    Nothing here estimates a probability of passing anything.
 *  - **It names no firm.** The preset is generic and user-editable; the engine
 *    ships one default and never claims it is anybody's rule book. Real firms'
 *    rules differ, change, and are theirs to state.
 *  - **It is not a Karat pillar.** Breaching a drawdown limit is not an
 *    impurity; it is an outcome. The check only reports which pillar's
 *    impurities showed up on the days that breached.
 *
 * The full prop-firm rule tracker is V2 (§4). This is the historical read-out
 * the engine can support honestly today.
 */

import type { EnrichedTrade } from './enrich';
import type { GapPillar } from './gap';
import { GAP_PILLAR_LABELS, attributeCost } from './gap';
import { round, safeDivide, sum } from './math';
import type { EngineSettings } from './settings';
import { dayKey } from './time';

/** The banner every prop surface carries. */
export const PROP_DISCLAIMER =
  'Historical only. These are days that already happened, measured against a preset you set yourself — not a rule from any firm, and not a prediction.';

export interface PropRules {
  /** What to call this preset in the UI. Never a real firm's name. */
  label: string;
  /** Loss in one UTC day, as a percentage of the equity that day opened with. */
  dailyLossPercent: number;
  /** Fall from the account's high-water mark, as a percentage of that mark. */
  maxDrawdownPercent: number;
}

/**
 * A generic preset: 5% in a day, 10% overall.
 *
 * Round numbers, chosen because they are the shape such rules usually take —
 * not a copy of anybody's. Settings lets the user type their own.
 */
export const DEFAULT_PROP_RULES: PropRules = {
  label: 'Generic preset',
  dailyLossPercent: 5,
  maxDrawdownPercent: 10,
};

export interface PropDay {
  /** `YYYY-MM-DD`, UTC, by close time — the day the money landed. */
  date: string;
  tradeCount: number;
  startEquity: number;
  endEquity: number;
  netMoney: number;
  /** Loss as a positive percentage of the day's opening equity. 0 on a green day. */
  dayLossPercent: number;
  /** Worst fall from the high-water mark reached during the day, in percent. */
  drawdownPercent: number;
  breachedDailyLoss: boolean;
  /**
   * The day the overall drawdown limit was first crossed — and only that day.
   *
   * Choice: the daily rule resets every morning, so every day that loses too
   * much breaches it. The overall drawdown rule does not reset: it is
   * terminal. Marking every day after the crossing as a fresh breach would
   * turn one event into fifty and make the count meaningless.
   */
  breachedDrawdown: boolean;
  breached: boolean;
  /** The pillar carrying the most impurity cost that day. `null` when clean. */
  worstPillar: GapPillar | null;
  impurityCostMoney: number;
  impurityTradeCount: number;
  tradeIds: string[];
}

export interface PropPillarTally {
  pillar: GapPillar;
  label: string;
  /** Breach days this pillar carried the most cost on. */
  days: number;
  costMoney: number;
}

export interface PropCheckResult {
  rules: PropRules;
  disclaimer: typeof PROP_DISCLAIMER;
  currency: string;
  startingEquity: number;
  endingEquity: number;
  /** Worst fall from the high-water mark over the whole history, in percent. */
  worstDrawdownPercent: number;
  worstDayLossPercent: number;
  /** The day the overall drawdown limit was first crossed. `null` when never. */
  drawdownBreachDate: string | null;
  activeDays: number;
  breachDayCount: number;
  dailyLossBreachCount: number;
  drawdownBreachCount: number;
  /** `YYYY-MM-DD` of the first breach of either rule. `null` when there is none. */
  firstBreachDate: string | null;
  firstBreachRule: 'daily-loss' | 'drawdown' | null;
  days: PropDay[];
  breachDays: PropDay[];
  /** Which pillar's impurities showed up on the most breach days. */
  pillarTally: PropPillarTally[];
  worstPillar: GapPillar | null;
}

/**
 * Walks the account day by day against a preset.
 *
 * The walk is over **every** trade in close order, manual and EA alike: a
 * drawdown limit does not care who placed the trade. The impurity attribution
 * on a breach day is manual-only, because that is what the Gap bills (§6.3).
 */
export function computePropCheck(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  rules: PropRules = DEFAULT_PROP_RULES,
  currency = 'USD',
): PropCheckResult {
  const ordered = trades
    .slice()
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs || a.id.localeCompare(b.id));

  const startingEquity = ordered[0]?.equityAtEntry ?? 0;

  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of ordered) {
    const key = dayKey(trade.closeTimeMs);
    const list = byDay.get(key);
    if (list === undefined) byDay.set(key, [trade]);
    else list.push(trade);
  }

  let equity = startingEquity;
  let highWater = startingEquity;
  let worstDrawdownPercent = 0;
  let worstDayLossPercent = 0;
  let drawdownBreached = false;

  const days: PropDay[] = [];
  for (const [date, dayTrades] of [...byDay.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const startEquity = equity;
    let dayDrawdownPercent = 0;

    for (const trade of dayTrades) {
      equity += trade.netProfit;
      if (equity > highWater) highWater = equity;
      const drawdown = safeDivide((highWater - equity) * 100, highWater, 0);
      if (drawdown > dayDrawdownPercent) dayDrawdownPercent = drawdown;
    }
    if (dayDrawdownPercent > worstDrawdownPercent) {
      worstDrawdownPercent = dayDrawdownPercent;
    }

    const netMoney = equity - startEquity;
    const dayLossPercent =
      netMoney >= 0 ? 0 : safeDivide(-netMoney * 100, startEquity, 0);
    if (dayLossPercent > worstDayLossPercent) worstDayLossPercent = dayLossPercent;

    // Which habit showed up on the day, using the Gap's own attribution so the
    // two surfaces never disagree about what a trade cost.
    const costByPillar = new Map<GapPillar, number>();
    let impurityCostMoney = 0;
    let impurityTradeCount = 0;
    for (const trade of dayTrades) {
      if (!trade.isManual) continue;
      const attribution = attributeCost(trade, settings);
      if (attribution === null) continue;
      impurityTradeCount += 1;
      impurityCostMoney += attribution.costMoney;
      costByPillar.set(
        attribution.pillar,
        (costByPillar.get(attribution.pillar) ?? 0) + attribution.costMoney,
      );
    }
    const worstPillar =
      [...costByPillar.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? null;

    const breachedDailyLoss = dayLossPercent >= rules.dailyLossPercent;
    const breachedDrawdown =
      !drawdownBreached && dayDrawdownPercent >= rules.maxDrawdownPercent;
    if (breachedDrawdown) drawdownBreached = true;

    days.push({
      date,
      tradeCount: dayTrades.length,
      startEquity: round(startEquity, 2),
      endEquity: round(equity, 2),
      netMoney: round(netMoney, 2),
      dayLossPercent: round(dayLossPercent, 2),
      drawdownPercent: round(dayDrawdownPercent, 2),
      breachedDailyLoss,
      breachedDrawdown,
      breached: breachedDailyLoss || breachedDrawdown,
      worstPillar,
      impurityCostMoney: round(impurityCostMoney, 2),
      impurityTradeCount,
      tradeIds: dayTrades.map((trade) => trade.id),
    });
  }

  const breachDays = days.filter((day) => day.breached);
  const first = breachDays[0] ?? null;

  const tallyMap = new Map<GapPillar, { days: number; costMoney: number }>();
  for (const day of breachDays) {
    if (day.worstPillar === null) continue;
    const entry = tallyMap.get(day.worstPillar) ?? { days: 0, costMoney: 0 };
    entry.days += 1;
    entry.costMoney += day.impurityCostMoney;
    tallyMap.set(day.worstPillar, entry);
  }
  const pillarTally: PropPillarTally[] = [...tallyMap.entries()]
    .map(([pillar, entry]) => ({
      pillar,
      label: GAP_PILLAR_LABELS[pillar],
      days: entry.days,
      costMoney: round(entry.costMoney, 2),
    }))
    .sort((a, b) => b.days - a.days || b.costMoney - a.costMoney);

  return {
    rules,
    disclaimer: PROP_DISCLAIMER,
    currency,
    startingEquity: round(startingEquity, 2),
    endingEquity: round(equity, 2),
    worstDrawdownPercent: round(worstDrawdownPercent, 2),
    worstDayLossPercent: round(worstDayLossPercent, 2),
    drawdownBreachDate: days.find((day) => day.breachedDrawdown)?.date ?? null,
    activeDays: days.length,
    breachDayCount: breachDays.length,
    dailyLossBreachCount: days.filter((day) => day.breachedDailyLoss).length,
    drawdownBreachCount: days.filter((day) => day.breachedDrawdown).length,
    firstBreachDate: first?.date ?? null,
    firstBreachRule:
      first === null ? null : first.breachedDailyLoss ? 'daily-loss' : 'drawdown',
    days,
    breachDays,
    pillarTally,
    worstPillar: pillarTally[0]?.pillar ?? null,
  };
}

/** Total money lost on the days that breached — the line the report prints. */
export function breachCost(result: PropCheckResult): number {
  return round(sum(result.breachDays.map((day) => day.netMoney)), 2);
}
