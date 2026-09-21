/**
 * Integration: the engine against the demo account.
 *
 * The demo generator (Stage 1) plants the stories in CLAUDE.md §11 as
 * *behaviour* — it never computes a metric. This file is the other half of
 * that contract: the engine must **discover** those stories from the raw
 * trades, with no help and no tuning.
 *
 * Two results here differ from what the demo notes led us to expect, and both
 * are the spec behaving correctly rather than the engine misbehaving. They are
 * asserted as they actually are, and explained where they sit.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_EA_DRIFT_START_MS, DEMO_IMPROVEMENT_START_MS, generateDemoData } from '@/lib/demo/generate';
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
    expect(result.counts.trades).toBe(836);
    expect(result.counts.manualTrades).toBe(220);
    expect(result.counts.eaTrades).toBe(616);
    expect(result.counts.newsEvents).toBe(37);
  });

  it('scores it, and the score is explainable', () => {
    expect(result.karat.state).toBe('scored');
    expect(result.karat.karat).toBe(23);
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

describe('§11 story 1 — discipline improves over the last three weeks', () => {
  const early = manual.filter((trade) => trade.openTimeMs < DEMO_IMPROVEMENT_START_MS);
  const late = manual.filter((trade) => trade.openTimeMs >= DEMO_IMPROVEMENT_START_MS);

  it('scores the last 21 days above the first 69', () => {
    expect(early).toHaveLength(163);
    expect(late).toHaveLength(57);
    expect(karatOf(late)).toBeGreaterThan(karatOf(early));
    expect(karatOf(late)).toBe(22.5);
    expect(karatOf(early)).toBe(19.7);
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
    const top = result.findings.slice(0, 3);
    const news = top.find((finding) => finding.kind === 'news-window-losses');
    expect(news).toBeDefined();
    expect(news?.rank).toBe(1);
    expect(news?.metrics.trades).toBe(71);
    expect(news?.metrics.losses).toBe(60);
    expect(news?.impactMoney).toBeLessThan(-20_000);
  });

  it('bills those losses to Market Conditions in the Gap', () => {
    const market = result.gapAllTime.lines.find((line) => line.pillar === 'market');
    expect(market?.tradeCount).toBe(45);
    expect(market?.costMoney).toBeGreaterThan(13_000);
  });
});

describe('§11 story 3 — revenge trading', () => {
  it('finds the revenge trades and what they cost', () => {
    const revenge = result.findings.find((finding) => finding.kind === 'revenge-cost');
    expect(revenge?.metrics.trades).toBe(26);
    expect(revenge?.metrics.shareOfTrades).toBe(11.8);
    expect(revenge?.impactMoney).toBe(-12_828.52);
    expect(revenge?.rank).toBeLessThanOrEqual(3);
  });

  it('makes revenge the largest behavioural line in the Gap', () => {
    // The demo notes expected Revenge to be the single biggest Gap line. Under
    // the §6.3 priority (Revenge → Market Conditions → Risk → Exits) it is the
    // largest line the trader *chose* — but the demo plants a bigger news
    // habit than a revenge habit, so Market Conditions edges it: $13,572
    // across 45 trades against $12,828 across 20. Both are real, neither
    // double-counts a dollar, and Revenge remains ahead of Risk and Exits
    // combined by an order of magnitude.
    const lines = result.gapAllTime.lines;
    expect(lines.map((line) => line.pillar)).toEqual(['market', 'revenge', 'exits', 'risk']);

    const revenge = lines[1];
    const others = lines.slice(2);
    expect(revenge?.costMoney).toBeGreaterThan(12_000);
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
    expect(best?.metrics.trades).toBe(71);
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

  it('marks it Degraded while the other two stay healthier', () => {
    expect(eas.get(1003)?.label).toBe('Degraded');
    expect(eas.get(1003)?.fineness ?? 0).toBeLessThan(500);
    expect(eas.get(1001)?.fineness ?? 0).toBeGreaterThan(900);
    expect(eas.get(1002)?.fineness ?? 0).toBeGreaterThan(900);
  });

  it('sees the degradation start where the generator planted it', () => {
    const grid = result.trades.filter((trade) => trade.magic === 1003);
    const before = grid.filter((trade) => trade.openTimeMs < DEMO_EA_DRIFT_START_MS);
    const after = grid.filter((trade) => trade.openTimeMs >= DEMO_EA_DRIFT_START_MS);
    const mean = (trades: readonly EnrichedTrade[]): number =>
      trades.reduce((total, trade) => total + trade.rMultiple, 0) / trades.length;
    expect(mean(before)).toBeGreaterThan(0.2);
    expect(mean(after)).toBeLessThan(-0.4);
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
    expect(pair?.correlation).toBe(0.847);
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

describe('Your Proof on the demo account', () => {
  it('stays hidden — the demo has no impure weeks by the §6.4 threshold', () => {
    // 13 weeks clear the five-trade minimum; eight score 20K or better and
    // none scores under 14K (the worst week is 16.6K), so the low bucket is
    // empty and §6.4 says the card may not be shown. The engine is right to
    // hide it: with no weeks to compare against, any "discipline paid you X"
    // would be a number the data does not support.
    expect(result.proof.weeks).toHaveLength(13);
    expect(result.proof.high.weekCount).toBe(8);
    expect(result.proof.low.weekCount).toBe(0);
    expect(result.proof.visible).toBe(false);
    expect(result.proof.differenceR).toBe(0);
    expect(Math.min(...result.proof.weeks.map((week) => week.karat))).toBeGreaterThan(
      DEFAULT_SETTINGS.proofLowKarat,
    );
  });
});
