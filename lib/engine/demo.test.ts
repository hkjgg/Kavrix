/**
 * Integration: the engine against the demo account.
 *
 * The demo generator (Stage 1) plants the stories in CLAUDE.md §11 as
 * *behaviour* — it never computes a metric. This file is the other half of
 * that contract: the engine must **discover** those stories from the raw
 * trades, with no help and no tuning.
 */

import { describe, expect, it } from 'vitest';
import {
  DEMO_EA_DRIFT_START_MS,
  DEMO_IMPROVEMENT_START_MS,
  generateDemoData,
} from '@/lib/demo/generate';
import {
  DEFAULT_SETTINGS,
  karatFromPoints,
  pointsFromPillars,
  runEngine,
  scorePillars,
} from './index';
import type { AssayResult, EnrichedTrade } from './index';

const demo = generateDemoData();
const result: AssayResult = runEngine(demo, {}, demo.meta.endTime);
const manual = result.trades.filter((trade) => trade.isManual);

/** Unweighted Karat over a set of trades — how a phase scored as a whole. */
function karatOf(trades: readonly EnrichedTrade[]): number {
  return karatFromPoints(pointsFromPillars(scorePillars(trades, DEFAULT_SETTINGS)));
}

describe('the engine reads the demo account', () => {
  it('measures every trade the generator produced', () => {
    expect(result.counts.trades).toBe(834);
    expect(result.counts.manualTrades).toBe(220);
    expect(result.counts.eaTrades).toBe(614);
    expect(result.counts.newsEvents).toBe(37);
  });

  it('scores it, and the score is explainable', () => {
    expect(result.karat.state).toBe('scored');
    expect(result.karat.karat).toBe(23.1);
    expect(result.karat.tier?.label).toBe('22K · Refined');
    for (const pillar of result.karat.pillars) {
      const lost = pillar.deductions.reduce((total, item) => total + item.pointsLost, 0);
      expect(lost).toBeCloseTo(pillar.maxPoints - pillar.points, 1);
    }
  });

  it('is deterministic and JSON-serializable', () => {
    const again = runEngine(generateDemoData(), {}, demo.meta.endTime);
    expect(again.karat).toEqual(result.karat);
    expect(again.findings).toEqual(result.findings);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe('§11 story 1 — discipline improves', () => {
  const early = manual.filter((trade) => trade.openTimeMs < DEMO_IMPROVEMENT_START_MS);
  const late = manual.filter((trade) => trade.openTimeMs >= DEMO_IMPROVEMENT_START_MS);

  it('scores the last 21 days well above the first 69', () => {
    expect(early).toHaveLength(160);
    expect(late).toHaveLength(60);
    expect(karatOf(late)).toBeGreaterThan(karatOf(early));
    expect(karatOf(early)).toBe(17.4);
    expect(karatOf(late)).toBe(22.7);
  });

  it('climbs through the tiers week by week (§6.2)', () => {
    const weeks = result.proof.weeks;
    expect(weeks).toHaveLength(13);

    // The opening month is alloyed, the closing month refined or pure.
    const opening = weeks.slice(0, 4).map((week) => week.karat);
    const closing = weeks.slice(-4).map((week) => week.karat);
    expect(opening).toEqual([11.9, 12.4, 16.2, 13.8]);
    for (const karat of closing) expect(karat).toBeGreaterThanOrEqual(21);

    // Three weeks, all of them in the first month, are impure enough for §6.4.
    const impure = weeks.filter((week) => week.karat < DEFAULT_SETTINGS.proofLowKarat);
    expect(impure).toHaveLength(3);
    for (const week of impure) expect(weeks.indexOf(week)).toBeLessThan(4);
  });

  it('shows the same climb in the daily series and the weekly delta', () => {
    expect(result.series).toHaveLength(91);
    const scored = result.series.filter((point) => point.karat !== null);
    const first = scored[0]?.karat ?? 0;
    const last = scored.at(-1)?.karat ?? 0;
    expect(last).toBeGreaterThan(first);
    expect(result.delta.delta).toBeGreaterThan(0);
  });
});

describe('§11 story 2 — losses cluster around USD news', () => {
  it('puts the news window at the top of the Refinery', () => {
    const news = result.findings[0];
    expect(news?.kind).toBe('news-window-losses');
    expect(news?.rank).toBe(1);
    expect(news?.metrics.trades).toBe(65);
    expect(news?.metrics.losses).toBe(51);
    expect(news?.impactMoney).toBeLessThan(-17_000);
  });

  it('makes Market Conditions the largest line in the Gap', () => {
    // §6.3 attributes Revenge first, so what lands on Market Conditions is
    // everything the trader lost to a release *without* it also being a
    // revenge trade — and the demo plants a bigger news habit than a revenge
    // habit. The two together are the Gap; the rest is rounding.
    const lines = result.gapAllTime.lines;
    expect(lines.map((line) => line.pillar)).toEqual(['market', 'revenge', 'risk']);

    const market = lines[0];
    expect(market?.tradeCount).toBe(45);
    expect(market?.costMoney).toBeGreaterThan(15_000);
  });
});

describe('§11 story 3 — revenge trading', () => {
  it('finds the revenge trades and what they cost', () => {
    const revenge = result.findings.find((finding) => finding.kind === 'revenge-cost');
    expect(revenge?.metrics.trades).toBe(32);
    expect(revenge?.metrics.shareOfTrades).toBe(14.5);
    expect(revenge?.impactMoney).toBe(-10_317.36);
  });

  it('makes revenge the second line of the Gap, ahead of everything else', () => {
    const lines = result.gapAllTime.lines;
    const revenge = lines[1];
    expect(revenge?.pillar).toBe('revenge');
    expect(revenge?.costMoney).toBeGreaterThan(10_000);
    // Ahead of Risk and Exits by an order of magnitude: this is a habit, not
    // a rounding error.
    const others = lines.slice(2);
    expect(revenge?.costMoney).toBeGreaterThan(
      others.reduce((total, line) => total + line.costMoney, 0) * 5,
    );
  });
});

describe('§11 story 4 — the London open is the edge', () => {
  it('names 07:00–10:00 UTC in the top findings', () => {
    const best = result.findings.slice(0, 3).find((finding) => finding.kind === 'best-window');
    expect(best).toBeDefined();
    expect(best?.severity).toBe('strength');
    expect(best?.metrics.startHour).toBe(7);
    expect(best?.metrics.endHour).toBe(10);
    expect(best?.metrics.trades).toBe(70);
    expect(best?.metrics.avgR).toBeGreaterThan(0.7);
    expect(best?.headline).toContain('07:00–10:00 UTC');
  });

  it('agrees in the hourly buckets behind the Gold Clock', () => {
    const londonOpen = result.stats.byHour.filter((hour) => ['07', '08', '09'].includes(hour.key));
    for (const hour of londonOpen) expect(hour.avgR).toBeGreaterThan(0);
  });
});

describe('§11 story 5 — EA 1003 is drifting', () => {
  const eas = new Map(result.constellation.eas.map((ea) => [ea.magic, ea]));

  it('raises the drift alert on Grid Recovery alone', () => {
    expect(eas.get(1003)?.drift.alert).toBe(true);
    expect(eas.get(1003)?.drift.standardErrors).toBeGreaterThan(2);
    expect(eas.get(1001)?.drift.alert).toBe(false);
    expect(eas.get(1002)?.drift.alert).toBe(false);
  });

  it('assays the three EAs into three different bands (§7)', () => {
    expect(eas.get(1001)?.label).toBe('Fine');
    expect(eas.get(1001)?.fineness ?? 0).toBeGreaterThanOrEqual(930);
    expect(eas.get(1002)?.label).toBe('Standard');
    expect(eas.get(1002)?.fineness ?? 0).toBeGreaterThanOrEqual(850);
    expect(eas.get(1003)?.label).toBe('Degraded');
    expect(eas.get(1003)?.fineness ?? 0).toBeLessThan(700);
  });

  it('sees the degradation start where the generator planted it', () => {
    const grid = result.trades.filter((trade) => trade.magic === 1003);
    const before = grid.filter((trade) => trade.openTimeMs < DEMO_EA_DRIFT_START_MS);
    const after = grid.filter((trade) => trade.openTimeMs >= DEMO_EA_DRIFT_START_MS);
    const mean = (trades: readonly EnrichedTrade[]): number =>
      trades.reduce((total, trade) => total + trade.rMultiple, 0) / trades.length;
    expect(mean(before)).toBeGreaterThan(0.2);
    expect(mean(after)).toBeLessThan(-0.2);
  });

  it('reports the drift as a finding', () => {
    const drift = result.findings.find((finding) => finding.kind === 'ea-drift');
    expect(drift?.metrics.magic).toBe(1003);
    expect(drift?.headline).toContain('Grid Recovery is drifting');
  });
});

describe('§11 story 6 — EA 1001 and 1002 take the same bet', () => {
  it('correlates their daily P&L above the flag', () => {
    const pair = result.constellation.correlations.find(
      (candidate) => candidate.a === 1001 && candidate.b === 1002,
    );
    expect(pair?.correlation).toBe(0.836);
    expect(pair?.sameBet).toBe(true);
  });

  it('does not flag either of them against Grid Recovery', () => {
    for (const pair of result.constellation.correlations.filter(
      (candidate) => candidate.a === 1003 || candidate.b === 1003,
    )) {
      expect(pair.sameBet).toBe(false);
    }
  });

  it('reports the pair as a finding', () => {
    const finding = result.findings.find((candidate) => candidate.kind === 'ea-same-bet');
    expect(finding?.metrics.magicA).toBe(1001);
    expect(finding?.metrics.magicB).toBe(1002);
    expect(finding?.headline).toContain('take the same bet');
  });
});

describe('Your Proof on the demo account (§6.4)', () => {
  it('shows the card: three impure weeks against the disciplined ones', () => {
    expect(result.proof.visible).toBe(true);
    expect(result.proof.hiddenReason).toBeNull();
    expect(result.proof.low.weekCount).toBe(3);
    expect(result.proof.high.weekCount).toBeGreaterThanOrEqual(
      DEFAULT_SETTINGS.proofMinWeeksPerBucket,
    );
  });

  it('measures what the difference was worth', () => {
    expect(result.proof.low.avgWeeklyR).toBeLessThan(-10);
    expect(result.proof.high.avgWeeklyR).toBeGreaterThan(10);
    expect(result.proof.differenceR).toBeGreaterThan(20);
    expect(result.proof.differenceR).toBe(
      Number((result.proof.high.avgWeeklyR - result.proof.low.avgWeeklyR).toFixed(2)),
    );
  });
});
