/**
 * The Refinery (CLAUDE.md §10) — the findings the dashboard ranks and the AI
 * later rephrases.
 *
 * Deterministic and engine-only: each finding is a template filled from
 * numbers computed elsewhere in this folder. §2 is the rule that shapes the
 * file — the AI explains findings, it never produces them, so every headline
 * here has to stand on its own without a model.
 *
 * Findings are ranked by money at stake, costs and edges alike, and each one
 * names the trades behind it so the UI can open them.
 */

import { formatMoney, formatPct, formatR } from '@/lib/format';
import type { ConstellationResult } from './ea';
import type { EnrichedTrade } from './enrich';
import { manualTrades } from './enrich';
import type { KaratGapResult } from './gap';
import { mean, round, sum } from './math';
import type { EngineSettings } from './settings';
import { rankHourWindows } from './stats';
import { WEEKDAY_NAMES } from './time';

export type FindingKind =
  | 'news-window-losses'
  | 'revenge-cost'
  | 'best-window'
  | 'worst-weekday'
  | 'overtrading-days'
  | 'rollover-entries'
  | 'oversized-risk'
  | 'no-stop'
  | 'exit-overrun'
  | 'ea-drift'
  | 'ea-same-bet';

/** `strength` is an edge to protect; the rest are costs, by size. */
export type FindingSeverity = 'critical' | 'warning' | 'note' | 'strength';

export interface Finding {
  /** Stable across runs — the AI cache and the UI both key on it. */
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  /** Plain templated sentence. The AI may rephrase it; it may not add numbers. */
  headline: string;
  /** Money at stake. Negative is a cost, positive is an edge. */
  impactMoney: number;
  impactR: number;
  metrics: Record<string, number | string>;
  tradeIds: string[];
  /** 1-based, by absolute money at stake. */
  rank: number;
}

export interface FindingsInput {
  trades: readonly EnrichedTrade[];
  gap: KaratGapResult;
  constellation: ConstellationResult;
  settings: EngineSettings;
  currency?: string;
}

interface Draft extends Omit<Finding, 'rank' | 'severity'> {
  severity?: FindingSeverity;
}

/**
 * Severity from the share of the total Gap a finding carries.
 *
 * Choice: relative, not absolute. A $400 cost is critical on a $5,000 account
 * and noise on a $500,000 one, and the engine has no business inventing a
 * threshold in dollars.
 */
function severityFor(impactMoney: number, totalGapMoney: number): FindingSeverity {
  if (impactMoney > 0) return 'strength';
  const share = totalGapMoney > 0 ? Math.abs(impactMoney) / totalGapMoney : 0;
  if (share >= 0.4) return 'critical';
  if (share >= 0.15) return 'warning';
  return 'note';
}

/** Every finding the engine knows how to make, ranked by money at stake. */
export function computeFindings(input: FindingsInput): Finding[] {
  const { gap, constellation, settings } = input;
  const currency = input.currency ?? gap.currency;
  const money = (value: number): string => formatMoney(value, { currency, signed: true });

  const manual = manualTrades(input.trades);
  const drafts: Draft[] = [];

  const netMoneyOf = (trades: readonly EnrichedTrade[]): number =>
    round(sum(trades.map((trade) => trade.netProfit)), 2);
  const netROf = (trades: readonly EnrichedTrade[]): number =>
    round(sum(trades.map((trade) => trade.rMultiple)), 2);

  /* — News windows (§5, §6.1) — */
  const newsTrades = manual.filter((trade) => trade.inNewsWindow && !trade.newsExempt);
  if (newsTrades.length > 0) {
    const losses = newsTrades.filter((trade) => trade.isLoss);
    drafts.push({
      id: 'news-window-losses',
      kind: 'news-window-losses',
      headline: `${newsTrades.length} trades opened within ${settings.newsWindowMinutes} min of a high-impact USD release, ${losses.length} of them losses, for ${money(netMoneyOf(newsTrades))} and ${formatR(netROf(newsTrades))}.`,
      impactMoney: netMoneyOf(newsTrades),
      impactR: netROf(newsTrades),
      metrics: {
        trades: newsTrades.length,
        losses: losses.length,
        windowMinutes: settings.newsWindowMinutes,
        avgR: round(mean(newsTrades.map((trade) => trade.rMultiple)), 2),
        shareOfTrades: round((newsTrades.length / Math.max(manual.length, 1)) * 100, 1),
      },
      tradeIds: newsTrades.map((trade) => trade.id),
    });
  }

  /* — Revenge (§6.1, §6.3) — */
  const revengeTrades = manual.filter((trade) => trade.revenge);
  if (revengeTrades.length > 0) {
    const revengeLine = gap.lines.find((line) => line.pillar === 'revenge');
    const cost = revengeLine?.costMoney ?? 0;
    drafts.push({
      id: 'revenge-cost',
      kind: 'revenge-cost',
      headline: `${revengeTrades.length} revenge trades cost ${money(-cost)}, averaging ${formatR(mean(revengeTrades.map((trade) => trade.rMultiple)))} against ${formatR(mean(manual.filter((trade) => !trade.revenge).map((trade) => trade.rMultiple)))} everywhere else.`,
      impactMoney: round(-cost, 2),
      impactR: round(-(revengeLine?.costR ?? 0), 2),
      metrics: {
        trades: revengeTrades.length,
        shareOfTrades: round((revengeTrades.length / Math.max(manual.length, 1)) * 100, 1),
        avgR: round(mean(revengeTrades.map((trade) => trade.rMultiple)), 2),
        windowMinutes: settings.revengeWindowMinutes,
      },
      tradeIds: revengeTrades.map((trade) => trade.id),
    });
  }

  /* — Best window (§8.3) — */
  const bestWindow = rankHourWindows(manual)[0];
  if (bestWindow !== undefined && bestWindow.avgR > 0) {
    drafts.push({
      id: `best-window-${String(bestWindow.startHour).padStart(2, '0')}`,
      kind: 'best-window',
      severity: 'strength',
      headline: `${bestWindow.label} is your best window: ${bestWindow.tradeCount} trades at ${formatR(bestWindow.avgR)} average, ${money(bestWindow.netMoney)}.`,
      impactMoney: bestWindow.netMoney,
      impactR: bestWindow.netR,
      metrics: {
        startHour: bestWindow.startHour,
        endHour: bestWindow.endHour,
        trades: bestWindow.tradeCount,
        avgR: bestWindow.avgR,
        winRate: bestWindow.winRate,
      },
      tradeIds: manual
        .filter(
          (trade) =>
            trade.hourUtc >= bestWindow.startHour && trade.hourUtc < bestWindow.endHour,
        )
        .map((trade) => trade.id),
    });
  }

  /* — Worst weekday — */
  const weekdays = WEEKDAY_NAMES.map((name, index) => {
    const own = manual.filter((trade) => trade.weekdayUtc === index);
    return { name, index, trades: own, netMoney: netMoneyOf(own) };
  }).filter((day) => day.trades.length >= 5);
  const worstWeekday = weekdays
    .slice()
    .sort((a, b) => a.netMoney - b.netMoney)[0];
  if (worstWeekday !== undefined && worstWeekday.netMoney < 0) {
    drafts.push({
      id: `worst-weekday-${worstWeekday.index}`,
      kind: 'worst-weekday',
      headline: `${worstWeekday.name} is your worst day: ${worstWeekday.trades.length} trades for ${money(worstWeekday.netMoney)} and ${formatR(netROf(worstWeekday.trades))}.`,
      impactMoney: worstWeekday.netMoney,
      impactR: netROf(worstWeekday.trades),
      metrics: {
        weekday: worstWeekday.name,
        weekdayIndex: worstWeekday.index,
        trades: worstWeekday.trades.length,
        avgR: round(mean(worstWeekday.trades.map((trade) => trade.rMultiple)), 2),
      },
      tradeIds: worstWeekday.trades.map((trade) => trade.id),
    });
  }

  /* — Overtrading (§6.1) — */
  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of manual) {
    const list = byDay.get(trade.dayKey);
    if (list === undefined) byDay.set(trade.dayKey, [trade]);
    else list.push(trade);
  }
  const busyDays = [...byDay.entries()]
    .filter(([, dayTrades]) => dayTrades.length > settings.dailyMaxTrades)
    .sort(([a], [b]) => a.localeCompare(b));
  if (busyDays.length > 0) {
    const busyTrades = busyDays.flatMap(([, dayTrades]) => dayTrades);
    drafts.push({
      id: 'overtrading-days',
      kind: 'overtrading-days',
      headline: `${busyDays.length} days went past ${settings.dailyMaxTrades} trades, ${busyTrades.length} trades in total, for ${money(netMoneyOf(busyTrades))}.`,
      impactMoney: netMoneyOf(busyTrades),
      impactR: netROf(busyTrades),
      metrics: {
        days: busyDays.length,
        activeDays: byDay.size,
        trades: busyTrades.length,
        dailyMax: settings.dailyMaxTrades,
        avgR: round(mean(busyTrades.map((trade) => trade.rMultiple)), 2),
      },
      tradeIds: busyTrades.map((trade) => trade.id),
    });
  }

  /* — Rollover (§5) — */
  const rolloverTrades = manual.filter((trade) => trade.inRolloverWindow && !trade.newsExempt);
  if (rolloverTrades.length > 0) {
    drafts.push({
      id: 'rollover-entries',
      kind: 'rollover-entries',
      headline: `${rolloverTrades.length} trades were opened in the rollover window, where the Gold spread is widest, for ${money(netMoneyOf(rolloverTrades))}.`,
      impactMoney: netMoneyOf(rolloverTrades),
      impactR: netROf(rolloverTrades),
      metrics: {
        trades: rolloverTrades.length,
        windowMinutes: settings.rolloverWindowMinutes,
        avgR: round(mean(rolloverTrades.map((trade) => trade.rMultiple)), 2),
        avgSpreadPoints: round(mean(rolloverTrades.map((trade) => trade.spreadPointsAtEntry)), 1),
      },
      tradeIds: rolloverTrades.map((trade) => trade.id),
    });
  }

  /* — Oversized risk (§6.1, §6.3) — */
  const oversized = manual.filter((trade) => trade.oversized);
  if (oversized.length > 0) {
    const worst = Math.max(...oversized.map((trade) => trade.riskPercent));
    // What the extra size cost, across every oversized loser. The Gap may bill
    // part of this to Revenge or Market Conditions instead (§6.3) — a finding
    // describes a habit, the Gap bills each trade once.
    const oversizeCost = round(
      sum(
        oversized
          .filter((trade) => trade.isLoss)
          .map(
            (trade) =>
              -trade.netProfit * (1 - settings.riskLimitPercent / trade.riskPercent),
          ),
      ),
      2,
    );
    drafts.push({
      id: 'oversized-risk',
      kind: 'oversized-risk',
      headline: `${oversized.length} trades risked more than ${formatPct(settings.riskLimitPercent)} of equity, the worst at ${formatPct(worst)}, and the extra size alone cost ${money(-oversizeCost)}.`,
      impactMoney: round(-oversizeCost, 2),
      impactR: round(
        -sum(
          oversized
            .filter((trade) => trade.isLoss)
            .map(
              (trade) =>
                Math.abs(trade.rMultiple) *
                (1 - settings.riskLimitPercent / trade.riskPercent),
            ),
        ),
        2,
      ),
      metrics: {
        trades: oversized.length,
        limitPercent: settings.riskLimitPercent,
        worstRiskPercent: round(worst, 2),
      },
      tradeIds: oversized.map((trade) => trade.id),
    });
  }

  /* — No stop (§5, §6.1) — */
  const noStop = manual.filter((trade) => trade.noStop);
  if (noStop.length > 0) {
    const noStopLosses = noStop.filter((trade) => trade.isLoss);
    drafts.push({
      id: 'no-stop',
      kind: 'no-stop',
      headline: `${noStop.length} trades were opened without a stop within ${settings.stopSetWithinSeconds} s, and the ${noStopLosses.length} that lost gave back ${money(netMoneyOf(noStopLosses))}.`,
      impactMoney: netMoneyOf(noStopLosses),
      impactR: netROf(noStopLosses),
      metrics: { trades: noStop.length, losses: noStopLosses.length },
      tradeIds: noStop.map((trade) => trade.id),
    });
  }

  /* — Exit overruns (§6.1, §6.3) — */
  const overruns = manual.filter((trade) => trade.exitOverrun);
  if (overruns.length > 0) {
    // Same as above: the whole overrun, before the Gap decides which pillar
    // each of these trades belongs to.
    const overrunR = round(
      sum(overruns.map((trade) => Math.abs(trade.rMultiple) - 1)),
      2,
    );
    const overrunCost = round(
      sum(
        overruns.map(
          (trade) => (Math.abs(trade.rMultiple) - 1) * trade.initialRiskMoney,
        ),
      ),
      2,
    );
    drafts.push({
      id: 'exit-overrun',
      kind: 'exit-overrun',
      headline: `${overruns.length} losses ran past ${formatR(settings.exitOverrunR)}, and the part beyond ${formatR(-1, { digits: 0 })} cost ${money(-overrunCost)}.`,
      impactMoney: round(-overrunCost, 2),
      impactR: round(-overrunR, 2),
      metrics: {
        trades: overruns.length,
        overrunR: settings.exitOverrunR,
        worstR: round(Math.min(...overruns.map((trade) => trade.rMultiple)), 2),
      },
      tradeIds: overruns.map((trade) => trade.id),
    });
  }

  /* — EA drift (§7) — */
  for (const ea of constellation.eas) {
    if (!ea.drift.alert) continue;
    const recent = input.trades
      .filter((trade) => trade.magic === ea.magic)
      .slice(-settings.eaRecentTradeCount);
    drafts.push({
      id: `ea-drift-${ea.magic}`,
      kind: 'ea-drift',
      headline: `${ea.name} is drifting: its last ${ea.drift.recentTradeCount} trades expect ${formatR(ea.drift.recentExpectancyR)} against a ${formatR(ea.drift.baselineExpectancyR)} baseline, ${ea.drift.standardErrors.toFixed(1)} standard errors below.`,
      impactMoney: netMoneyOf(recent),
      impactR: netROf(recent),
      metrics: {
        magic: ea.magic,
        recentExpectancyR: ea.drift.recentExpectancyR,
        baselineExpectancyR: ea.drift.baselineExpectancyR,
        standardErrors: ea.drift.standardErrors,
        fineness: ea.fineness ?? 0,
      },
      tradeIds: recent.map((trade) => trade.id),
    });
  }

  /* — EAs taking the same bet (§7) — */
  for (const pair of constellation.correlations) {
    if (!pair.sameBet) continue;
    const a = constellation.eas.find((ea) => ea.magic === pair.a);
    const b = constellation.eas.find((ea) => ea.magic === pair.b);
    if (a === undefined || b === undefined) continue;
    // Choice: what is at stake is the two EAs' drawdowns landing together, so
    // the combined worst drawdown stands in as the impact.
    const combinedDrawdown = round(a.maxDrawdownMoney + b.maxDrawdownMoney, 2);
    drafts.push({
      id: `ea-same-bet-${pair.a}-${pair.b}`,
      kind: 'ea-same-bet',
      headline: `${a.name} and ${b.name} take the same bet: their daily P&L correlates ${pair.correlation.toFixed(2)}, so their drawdowns land together — ${money(-combinedDrawdown)} at the worst.`,
      impactMoney: round(-combinedDrawdown, 2),
      impactR: 0,
      metrics: {
        correlation: pair.correlation,
        magicA: pair.a,
        magicB: pair.b,
        threshold: settings.eaSameBetCorrelation,
      },
      tradeIds: [],
    });
  }

  return drafts
    .slice()
    .sort(
      (x, y) =>
        Math.abs(y.impactMoney) - Math.abs(x.impactMoney) || x.id.localeCompare(y.id),
    )
    .map((draft, index) => ({
      ...draft,
      severity: draft.severity ?? severityFor(draft.impactMoney, gap.totalCostMoney),
      rank: index + 1,
    }));
}
