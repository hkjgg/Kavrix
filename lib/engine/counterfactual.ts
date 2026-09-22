/**
 * The What-if (CLAUDE.md §6.10) — the equity curve with the impurities taken out.
 *
 * Deliberately, conspicuously honest:
 *
 *  - **Winners are removed too.** Removing only the impurity trades that lost
 *    would not be a counterfactual, it would be an advertisement. A trader who
 *    would not have taken a trade would not have taken it when it won either,
 *    and some accounts come out *worse* on this curve. That is the point.
 *  - **Every result carries the label "Counterfactual, not a promise."**
 *
 * ## What V1 computes
 *
 * The method is **linear**: the removed trades' P&L is subtracted from the
 * curve in close order, and nothing else changes. No re-sizing of the trades
 * that remain, no margin recomputation, no compounding — a trade that risked
 * 1% of a larger equity is *not* re-priced against the equity it would have
 * had. The curve answers one question exactly: what would this account read if
 * those trades had never been placed and everything else had happened as it
 * did?
 *
 * ## How it differs from the Karat Gap (§6.3)
 *
 * The Gap is a **bill**. It counts what indiscipline cost: only losses, each
 * attributed to exactly one pillar, in priority order, so no dollar is billed
 * twice.
 *
 * The What-if is a **curve**. It removes whole trades, winners included, and a
 * per-pillar toggle removes every trade carrying that kind of impurity — a
 * revenge trade opened in a news window is removed by both toggles, because
 * either habit alone would have been enough to prevent it.
 *
 * So the two numbers do not match, and neither is the smaller by rule. The
 * Gap counts only losses, and only part of an oversized or overrun loss; the
 * What-if also removes the impurity trades that won, which pulls its
 * difference down. On most accounts the What-if difference is the smaller.
 */

import type { EnrichedTrade } from './enrich';
import { attributeCost } from './gap';
import { round, sum } from './math';
import type { EngineSettings } from './settings';
import { dayKey } from './time';

/** The label every What-if surface must carry (§6.10). */
export const COUNTERFACTUAL_LABEL = 'Counterfactual, not a promise';

/** One line of the method, for the UI to print under the chart. */
export const COUNTERFACTUAL_METHOD =
  'Removed trades are subtracted from the curve in close order. Nothing else is re-computed: no re-sizing, no margin, no compounding.';

export type CounterfactualScenarioKey =
  | 'all'
  | 'revenge'
  | 'market'
  | 'risk'
  | 'stops'
  | 'exits';

export const SCENARIO_LABELS: Record<CounterfactualScenarioKey, string> = {
  all: 'Every impurity',
  revenge: 'Revenge only',
  market: 'Market conditions only',
  risk: 'Oversized risk only',
  stops: 'Stops only',
  exits: 'Exit overruns only',
};

/**
 * Which trades a scenario removes.
 *
 * Unlike the Gap's exclusive attribution, a trade belongs to every scenario
 * whose impurity it carries: each toggle answers "what if this habit had not
 * existed", and two habits can independently account for the same trade.
 */
export function scenarioRemoves(
  trade: EnrichedTrade,
  scenario: CounterfactualScenarioKey,
): boolean {
  if (!trade.isManual) return false;
  switch (scenario) {
    case 'all':
      return trade.impurities.length > 0;
    case 'revenge':
      return trade.revenge;
    case 'market':
      return trade.marketConditionFlagged;
    case 'risk':
      return trade.oversized;
    case 'stops':
      return trade.noStop || trade.slWidened;
    case 'exits':
      return trade.exitOverrun;
  }
}

export interface CounterfactualPoint {
  time: string;
  date: string;
  tradeId: string;
  /** This trade was removed in the counterfactual. */
  removed: boolean;
  actualMoney: number;
  actualR: number;
  counterfactualMoney: number;
  counterfactualR: number;
  actualEquity: number;
  counterfactualEquity: number;
}

export interface CounterfactualScenario {
  key: CounterfactualScenarioKey;
  label: string;
  removedTradeCount: number;
  removedWins: number;
  removedLosses: number;
  /** P&L of the removed trades — negative means removing them helps. */
  removedMoney: number;
  removedR: number;
  endMoney: number;
  endR: number;
  endEquity: number;
  /** `endMoney − actual end money`. Positive means the account ends higher. */
  deltaMoney: number;
  deltaR: number;
  /** What the Gap bills for these same trades (§6.3) — losses only, so it need not match `deltaMoney`. */
  gapCostMoney: number;
  /** Trade ids, so the UI can redraw any toggle by subtraction alone. */
  removedTradeIds: string[];
}

export interface CounterfactualResult {
  label: typeof COUNTERFACTUAL_LABEL;
  method: typeof COUNTERFACTUAL_METHOD;
  currency: string;
  startingEquity: number;
  actualEndMoney: number;
  actualEndR: number;
  actualEndEquity: number;
  /** The "every impurity" curve, point by point. */
  curve: CounterfactualPoint[];
  scenarios: CounterfactualScenario[];
}

/**
 * Actual against counterfactual, for every scenario.
 *
 * The curve runs over **every** trade, manual and EA, in close order — it is
 * the account's money, and the Purity Line draws the account. Only manual
 * trades are ever removed: an EA's trade is not the trader's indiscipline
 * (§7 measures those in Fineness).
 */
export function computeCounterfactual(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  currency = 'USD',
): CounterfactualResult {
  const ordered = trades
    .slice()
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs || a.id.localeCompare(b.id));

  const startingEquity = ordered[0]?.equityAtEntry ?? 0;

  const scenarioKeys: CounterfactualScenarioKey[] = [
    'all',
    'revenge',
    'market',
    'risk',
    'stops',
    'exits',
  ];

  let actualMoney = 0;
  let actualR = 0;
  let allMoney = 0;
  let allR = 0;
  const curve: CounterfactualPoint[] = [];

  for (const trade of ordered) {
    actualMoney += trade.netProfit;
    actualR += trade.rMultiple;
    const removed = scenarioRemoves(trade, 'all');
    if (!removed) {
      allMoney += trade.netProfit;
      allR += trade.rMultiple;
    }
    curve.push({
      time: trade.closeTime,
      date: dayKey(trade.closeTimeMs),
      tradeId: trade.id,
      removed,
      actualMoney: round(actualMoney, 2),
      actualR: round(actualR, 3),
      counterfactualMoney: round(allMoney, 2),
      counterfactualR: round(allR, 3),
      actualEquity: round(startingEquity + actualMoney, 2),
      counterfactualEquity: round(startingEquity + allMoney, 2),
    });
  }

  const actualEndMoney = round(actualMoney, 2);
  const actualEndR = round(actualR, 2);

  const scenarios: CounterfactualScenario[] = scenarioKeys.map((key) => {
    const removed = ordered.filter((trade) => scenarioRemoves(trade, key));
    const removedMoney = round(sum(removed.map((trade) => trade.netProfit)), 2);
    const removedR = round(sum(removed.map((trade) => trade.rMultiple)), 2);
    const endMoney = round(actualEndMoney - removedMoney, 2);
    const endR = round(actualEndR - removedR, 2);
    const gapCostMoney = round(
      sum(
        removed.map((trade) => attributeCost(trade, settings)?.costMoney ?? 0),
      ),
      2,
    );

    return {
      key,
      label: SCENARIO_LABELS[key],
      removedTradeCount: removed.length,
      removedWins: removed.filter((trade) => trade.isWin).length,
      removedLosses: removed.filter((trade) => trade.isLoss).length,
      removedMoney,
      removedR,
      endMoney,
      endR,
      endEquity: round(startingEquity + endMoney, 2),
      deltaMoney: round(endMoney - actualEndMoney, 2),
      deltaR: round(endR - actualEndR, 2),
      gapCostMoney,
      removedTradeIds: removed.map((trade) => trade.id),
    };
  });

  return {
    label: COUNTERFACTUAL_LABEL,
    method: COUNTERFACTUAL_METHOD,
    currency,
    startingEquity: round(startingEquity, 2),
    actualEndMoney,
    actualEndR,
    actualEndEquity: round(startingEquity + actualMoney, 2),
    curve,
    scenarios,
  };
}
