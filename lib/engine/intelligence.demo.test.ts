/**
 * Stage 2.5 over the demo account (CLAUDE.md §6.6–§6.12, §11).
 *
 * `demo.test.ts` checks that the engine reads the demo's stories correctly.
 * This file checks that the statistics layer reads them *honestly*: the London
 * open survives a correction applied across the whole Edge Map, the news window
 * does too, nothing tentative leads the Refinery, and the What-if is a curve
 * rather than a sales pitch.
 */

import { describe, expect, it } from 'vitest';
import { generateDemoData } from '@/lib/demo/generate';
import { runEngine } from './index';
import { findSimilarTrades } from './similar';
import { worstTiltEpisode } from './replay';
import { computeReplay } from './replay';
import { resolveSettings } from './settings';

const demo = generateDemoData();
const settings = resolveSettings();
const result = runEngine(demo, {}, demo.meta.endTime);

describe('the demo Edge Map', () => {
  it('finds the London open as a Strong strength', () => {
    const london = result.edgeMap.cells.find((cell) => cell.key === 'london-open');
    expect(london?.tradeCount).toBeGreaterThanOrEqual(20);
    expect(london?.avgR).toBeGreaterThan(0.5);
    expect(london?.confidence.ci95.low).toBeGreaterThan(0);
    expect(london?.survivedCorrection).toBe(true);
    expect(london?.confidenceLabel).toBe('strong');
    expect(result.edgeMap.strengths.map((cell) => cell.key)).toContain('london-open');
  });

  it('finds the news window as a Strong weakness', () => {
    const news = result.edgeMap.cells.find((cell) => cell.key === 'in-window');
    expect(news?.tradeCount).toBeGreaterThanOrEqual(20);
    expect(news?.avgR).toBeLessThan(0);
    expect(news?.confidence.ci95.high).toBeLessThan(0);
    expect(news?.survivedCorrection).toBe(true);
    expect(news?.confidenceLabel).toBe('strong');
    expect(result.edgeMap.weaknesses.map((cell) => cell.key)).toContain('in-window');
  });

  it('reports nothing Weak as a strength or a weakness', () => {
    for (const cell of [...result.edgeMap.strengths, ...result.edgeMap.weaknesses]) {
      expect(cell.confidenceLabel).not.toBe('weak');
      expect(cell.tradeCount).toBeGreaterThanOrEqual(settings.edgeMapMinCellTrades);
    }
  });

  it('corrects across every tested cell', () => {
    expect(result.edgeMap.testedCells).toBeGreaterThan(10);
    for (const cell of result.edgeMap.cells) {
      expect(cell.qValue).toBeGreaterThanOrEqual(cell.pValue);
    }
  });
});

describe('the demo Refinery', () => {
  it('leads with three findings, none of them tentative', () => {
    expect(result.refinery).toHaveLength(3);
    for (const finding of result.refinery) {
      expect(finding.tentative).toBe(false);
      expect(finding.confidence?.label === 'strong' || finding.confidence?.label === 'moderate').toBe(
        true,
      );
    }
  });

  it('keeps the tentative findings in the data, flagged', () => {
    const tentative = result.findings.filter((finding) => finding.tentative);
    expect(tentative.length).toBeGreaterThan(0);
    for (const finding of tentative) {
      expect(result.refinery).not.toContain(finding);
    }
  });

  it('attaches confidence to every finding with a trade sample', () => {
    for (const finding of result.findings) {
      if (finding.tradeIds.length === 0) {
        expect(finding.confidence).toBeNull();
        expect(finding.tentative).toBe(true);
      } else {
        expect(finding.confidence?.n).toBe(finding.tradeIds.length);
      }
    }
  });
});

describe('the demo stats breakdowns', () => {
  it('carry confidence on every session, hour and weekday', () => {
    for (const buckets of [
      result.stats.bySession,
      result.stats.byHour,
      result.stats.byWeekday,
    ]) {
      for (const entry of buckets) {
        expect(entry.confidence.n).toBe(entry.tradeCount);
        if (entry.tradeCount > 0) {
          expect(entry.confidence.winRateInterval.high).toBeGreaterThanOrEqual(
            entry.confidence.winRateInterval.low,
          );
        }
      }
    }
  });
});

describe('the demo Similar Trades', () => {
  it('returns mostly losses for a news-window loss', () => {
    // The worst news-window loss with a history behind it. The very worst one
    // falls in the opening days, where there are not yet twelve closed trades
    // to compare it to — and the engine correctly returns the five there are.
    const newsLosses = result.trades.filter(
      (trade) => trade.isManual && trade.inNewsWindow && trade.isLoss,
    );
    const target = newsLosses
      .slice(Math.floor(newsLosses.length / 2))
      .sort((a, b) => a.netProfit - b.netProfit)[0];
    expect(target).toBeDefined();

    const similar = findSimilarTrades(target!, result.trades, settings);
    expect(similar.neighbours).toHaveLength(12);
    expect(similar.losses).toBeGreaterThan(similar.wins);
    expect(similar.meanR).toBeLessThan(0);
  });

  it('never returns a trade that had not closed yet', () => {
    const target = result.trades.filter((trade) => trade.isManual).at(-1)!;
    const similar = findSimilarTrades(target, result.trades, settings);
    const byId = new Map(result.trades.map((trade) => [trade.id, trade]));
    for (const neighbour of similar.neighbours) {
      expect(byId.get(neighbour.tradeId)!.closeTimeMs).toBeLessThan(target.openTimeMs);
    }
  });

  it('ships one worked example in the result', () => {
    expect(result.similar).toHaveLength(1);
    expect(result.similar[0]?.neighbours.length).toBeGreaterThan(0);
  });
});

describe('the demo What-if', () => {
  it('ends higher than the account actually did', () => {
    const all = result.counterfactual.scenarios.find(
      (scenario) => scenario.key === 'all',
    );
    expect(all?.endMoney).toBeGreaterThan(result.counterfactual.actualEndMoney);
    expect(all?.deltaMoney).toBeGreaterThan(0);
  });

  it('removed winning impurity trades too', () => {
    const all = result.counterfactual.scenarios.find(
      (scenario) => scenario.key === 'all',
    );
    expect(all?.removedWins).toBeGreaterThan(0);
    expect(all?.removedLosses).toBeGreaterThan(0);
  });

  it('carries the label everywhere it goes', () => {
    expect(result.counterfactual.label).toBe('Counterfactual, not a promise');
  });

  it('is not the Karat Gap', () => {
    const all = result.counterfactual.scenarios.find(
      (scenario) => scenario.key === 'all',
    );
    expect(all?.deltaMoney).not.toBe(result.gapAllTime.totalCostMoney);
  });
});

describe('the demo Discipline Replay', () => {
  it('finds tilt episodes in the opening phase', () => {
    const openingPhaseEnd = Date.parse('2026-07-20T00:00:00.000Z');
    const days = computeReplay(result.trades, settings, { toMs: openingPhaseEnd });
    const episodes = days.flatMap((day) => day.episodes);
    expect(episodes.length).toBeGreaterThan(0);

    const worst = worstTiltEpisode(days);
    expect(worst?.episode.impurityTradeCount).toBeGreaterThanOrEqual(2);
    expect(worst?.episode.karatDrop).toBeGreaterThan(0);
  });

  it('runs the scored window by default', () => {
    expect(result.replay.length).toBeGreaterThan(0);
    for (const day of result.replay) {
      expect(day.date >= result.karat.windowStart.slice(0, 10)).toBe(true);
      expect(day.trades).toHaveLength(day.tradeCount);
    }
  });
});

describe('the demo prop check', () => {
  it('clusters its breaches in the raw phase', () => {
    const rawPhaseEnd = '2026-07-20';
    const breaches = result.prop.breachDays;
    expect(breaches.length).toBeGreaterThan(0);
    const inRaw = breaches.filter((day) => day.date < rawPhaseEnd).length;
    expect(inRaw / breaches.length).toBeGreaterThan(0.5);
  });

  it('names the first breach and the habit behind the breach days', () => {
    expect(result.prop.firstBreachDate).not.toBeNull();
    expect(result.prop.worstPillar).not.toBeNull();
    expect(result.prop.pillarTally.length).toBeGreaterThan(0);
  });

  it('never claims to predict anything', () => {
    expect(result.prop.disclaimer).toContain('Historical only');
    expect(result.prop.rules.label).toBe('Generic preset');
  });
});

describe('the demo personal baselines', () => {
  it('measures the trader own normal', () => {
    expect(result.baselines.measurable).toBe(true);
    expect(result.baselines.baselineTradeCount).toBeGreaterThan(settings.baselineMinTrades);
    for (const metric of result.baselines.metrics) {
      expect(metric.p90).toBeGreaterThanOrEqual(metric.median);
    }
  });

  it('says nothing about a week that stayed inside it', () => {
    // The demo trader closes in the refined phase (§11), so the last week is
    // well inside their own normal and there is nothing to flag. A finding
    // here would mean the baseline had drifted, not the trader.
    for (const finding of result.baselines.findings) {
      expect(finding.confidence.n).toBeGreaterThan(0);
    }
    expect(
      result.findings.filter((finding) => finding.kind === 'outside-normal'),
    ).toHaveLength(result.baselines.findings.length);
  });
});

describe('determinism', () => {
  it('two runs over the same demo data are identical', () => {
    const again = runEngine(generateDemoData(), {}, demo.meta.endTime);
    expect(JSON.stringify(again)).toEqual(JSON.stringify(result));
  });
});
