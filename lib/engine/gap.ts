/**
 * The Karat Gap (CLAUDE.md §6.3) — what indiscipline cost, in R and in money.
 *
 * Every impurity trade is attributed to **one** pillar, in the order
 * Revenge → Market Conditions → Risk → Exits, so no dollar is ever counted
 * twice. Winning impurity trades cost nothing: the Gap is a bill, not a
 * scorecard.
 *
 * Stops has no line of its own. §6.3 is explicit about it — a stop that was
 * missing or widened shows up as the loss that ran past −1R, which is the
 * Exits line.
 */

import type { EnrichedTrade } from './enrich';
import { manualTrades } from './enrich';
import { round, safeDivide, sum } from './math';
import type { EngineSettings } from './settings';

/** The pillars that can carry a cost (§6.3). */
export type GapPillar = 'revenge' | 'market' | 'risk' | 'exits';

export const GAP_PILLAR_LABELS: Record<GapPillar, string> = {
  revenge: 'Revenge',
  market: 'Market Conditions',
  risk: 'Risk',
  exits: 'Exits',
};

/** Attribution order — first match wins, and a trade matches at most one. */
export const GAP_PRIORITY: readonly GapPillar[] = ['revenge', 'market', 'risk', 'exits'];

export interface GapAttribution {
  tradeId: string;
  pillar: GapPillar;
  /** Cost in R, in the trade's own R units (net loss ÷ its initial risk). */
  costR: number;
  costMoney: number;
}

export interface GapLine {
  pillar: GapPillar;
  label: string;
  costR: number;
  costMoney: number;
  tradeCount: number;
  tradeIds: string[];
}

export interface KaratGapResult {
  totalCostR: number;
  totalCostMoney: number;
  currency: string;
  lines: GapLine[];
  /** Manual trades considered. */
  tradeCount: number;
  /** Trades that carried a cost. */
  impurityCount: number;
  attributions: GapAttribution[];
}

/**
 * Which pillar owns this trade's cost, and how much it is.
 *
 * Returns `null` when the trade is clean, or when it is an impurity that did
 * not cost anything (a revenge trade that happened to win).
 */
export function attributeCost(
  trade: EnrichedTrade,
  settings: EngineSettings,
): GapAttribution | null {
  const loss = trade.isLoss ? -trade.netProfit : 0;

  const make = (pillar: GapPillar, costMoney: number): GapAttribution | null => {
    if (costMoney <= 0) return null;
    return {
      tradeId: trade.id,
      pillar,
      costMoney: round(costMoney, 2),
      // R is reported in the trade's own units, so money = costR × initial risk
      // holds for every line.
      costR: round(safeDivide(costMoney, trade.initialRiskMoney, 0), 4),
    };
  };

  // 1. Revenge — the whole net loss.
  if (trade.revenge) return make('revenge', loss);

  // 2. Market Conditions — the whole net loss.
  if (trade.marketConditionFlagged) return make('market', loss);

  // 3. Risk — the part of the loss that oversizing added.
  if (trade.oversized && loss > 0) {
    const factor = 1 - settings.riskLimitPercent / trade.riskPercent;
    return make('risk', loss * factor);
  }

  // 4. Exits — the part of the loss beyond −1R.
  if (trade.exitOverrun) {
    const beyondOneR = Math.abs(trade.rMultiple) - 1;
    return make('exits', beyondOneR * trade.initialRiskMoney);
  }

  return null;
}

/**
 * The Gap over a set of trades.
 *
 * Manual trades only, like the score itself (§6): an EA's losses are an EA
 * health question (§7), not a discipline bill.
 */
export function computeKaratGap(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  currency = 'USD',
): KaratGapResult {
  const manual = manualTrades(trades);

  const attributions: GapAttribution[] = [];
  for (const trade of manual) {
    const attribution = attributeCost(trade, settings);
    if (attribution !== null) attributions.push(attribution);
  }

  const lines: GapLine[] = GAP_PRIORITY.map((pillar) => {
    const own = attributions.filter((attribution) => attribution.pillar === pillar);
    return {
      pillar,
      label: GAP_PILLAR_LABELS[pillar],
      costR: round(sum(own.map((attribution) => attribution.costR)), 2),
      costMoney: round(sum(own.map((attribution) => attribution.costMoney)), 2),
      tradeCount: own.length,
      tradeIds: own.map((attribution) => attribution.tradeId),
    };
  })
    .filter((line) => line.tradeCount > 0)
    .sort((a, b) => b.costMoney - a.costMoney || a.pillar.localeCompare(b.pillar));

  return {
    totalCostR: round(sum(lines.map((line) => line.costR)), 2),
    totalCostMoney: round(sum(lines.map((line) => line.costMoney)), 2),
    currency,
    lines,
    tradeCount: manual.length,
    impurityCount: attributions.length,
    attributions,
  };
}
