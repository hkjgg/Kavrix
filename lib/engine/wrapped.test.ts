/**
 * Wrapped (CLAUDE.md §17 Stage 7).
 *
 * Two kinds of case:
 *
 * - **A hand-worked fixture month.** March 2026, twelve clean trades, three a
 *   day for four days (+1R at 08:00, −1R at 09:00, +2R at 10:00), after a
 *   February of ten winners, half of them sized at 1.5%. Fixture arithmetic as
 *   everywhere in the engine: $10,000 equity, $100 a trade, so −$100 is −1R.
 *   Every chapter that has data is checked by hand; the ones without drop out.
 * - **The demo.** August 2026, the last full month, every figure hand-checked
 *   against the engine's own modules run over August's trades; and July and
 *   June, where the optional chapters drop out.
 */

import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import { getDemoWrapped, getDemoWrappedMonths, getDemoDefaultMonth } from '@/lib/demo/wrapped';
import { DEMO_END_MS } from '@/lib/demo/generate';
import type { TradeSpec } from './fixtures';
import { makeTrades } from './fixtures';
import { computeKaratGap } from './gap';
import type { EngineInput } from './index';
import { runEngine } from './index';
import { karatFromPoints, pointsFromPillars, scorePillars } from './karat';
import { computeReplay, worstTiltEpisode } from './replay';
import type { WrappedChapter, WrappedChapterKind, WrappedResult } from './wrapped';
import {
  buildWrapped,
  certificateSerial,
  defaultWrappedMonth,
  isMonthComplete,
  monthAsOf,
  monthBounds,
  monthOf,
  periodLabel,
  previousMonth,
  wrappedMonths,
} from './wrapped';

function chapter<K extends WrappedChapterKind>(
  wrapped: WrappedResult,
  kind: K,
): Extract<WrappedChapter, { kind: K }> {
  const found = wrapped.chapters.find((entry) => entry.kind === kind);
  if (found === undefined) throw new Error(`no ${kind} chapter`);
  return found as Extract<WrappedChapter, { kind: K }>;
}

const kinds = (wrapped: WrappedResult) => wrapped.chapters.map((entry) => entry.kind);

/* -------------------------------------------------------------------------
 * The fixture
 * ---------------------------------------------------------------------- */

const FEBRUARY: TradeSpec[] = Array.from({ length: 10 }, (_, index) => ({
  openTime: `2026-02-${String(2 + index).padStart(2, '0')}T08:00:00Z`,
  // Half of them risk 1.5% (a 15.00 stop): Risk scores 0 on each (§6.1).
  slDistance: index % 2 === 0 ? 15 : 10,
  netProfit: 100,
}));

const MARCH_DAYS = ['02', '03', '04', '05'];
const MARCH: TradeSpec[] = MARCH_DAYS.flatMap((day) => [
  { openTime: `2026-03-${day}T08:00:00Z`, netProfit: 100 },
  // The loser closes at 09:30, so the 10:00 trade is 30 minutes clear of the
  // revenge window (§6.1), and loses hold for half as long as wins.
  { openTime: `2026-03-${day}T09:00:00Z`, netProfit: -100, durationMinutes: 30 },
  { openTime: `2026-03-${day}T10:00:00Z`, netProfit: 200 },
]);

const ACCOUNT = { login: 1234, server: 'Fixture-Server', currency: 'USD', balance: 0, equity: 0, leverage: 100 };

function fixtureInput(specs: readonly TradeSpec[]): EngineInput {
  return { account: ACCOUNT, trades: makeTrades(specs), modifications: [], calendar: [], eas: [] };
}

function fixtureWrapped(month: string, asOfMs: number, specs = [...FEBRUARY, ...MARCH]): WrappedResult {
  const result = runEngine(fixtureInput(specs), {}, monthAsOf(month, asOfMs));
  return buildWrapped({ month, result, calendar: [] });
}

const END_OF_MARCH = Date.UTC(2026, 3, 1) - 1;

describe('months', () => {
  it('bounds a month in UTC and steps back across a year', () => {
    expect(monthBounds('2026-02')).toEqual({ startMs: Date.UTC(2026, 1, 1), endMs: Date.UTC(2026, 2, 1) });
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(monthOf(Date.UTC(2026, 7, 31, 23, 59))).toBe('2026-08');
    expect(() => monthBounds('2026-13')).toThrow(RangeError);
  });

  it('is complete only once asOf reaches its last millisecond', () => {
    expect(isMonthComplete('2026-03', END_OF_MARCH)).toBe(true);
    expect(isMonthComplete('2026-03', END_OF_MARCH - 1)).toBe(false);
    expect(monthAsOf('2026-03', Date.UTC(2026, 5, 1))).toBe(END_OF_MARCH);
    expect(monthAsOf('2026-03', Date.UTC(2026, 2, 5))).toBe(Date.UTC(2026, 2, 5));
  });

  it('lists every month from the first trade to asOf, and opens on the last full one', () => {
    const result = runEngine(fixtureInput([...FEBRUARY, ...MARCH]), {}, Date.UTC(2026, 3, 10));
    const months = wrappedMonths(result.trades, Date.UTC(2026, 3, 10));
    expect(months).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(defaultWrappedMonth(months, Date.UTC(2026, 3, 10))).toBe('2026-03');
    // Nothing complete yet: the running month.
    expect(defaultWrappedMonth(['2026-04'], Date.UTC(2026, 3, 10))).toBe('2026-04');
    expect(defaultWrappedMonth([], 0)).toBeNull();
  });

  it('prints a period within one month', () => {
    expect(periodLabel('2026-08-01', '2026-08-31')).toBe('1–31 Aug');
    expect(periodLabel('2026-06-22', '2026-06-30')).toBe('22–30 Jun');
    expect(periodLabel('2026-09-01', '2026-09-01')).toBe('1 Sep');
  });
});

describe('certificateSerial', () => {
  it('is six digits, the same for the same account and month, and DEMO- in the demo', () => {
    const serial = certificateSerial(ACCOUNT, '2026-03');
    expect(serial).toMatch(/^\d{6}$/);
    expect(certificateSerial(ACCOUNT, '2026-03')).toBe(serial);
    expect(certificateSerial(ACCOUNT, '2026-03', { demo: true })).toBe(`DEMO-${serial}`);
    expect(certificateSerial(ACCOUNT, '2026-04')).not.toBe(serial);
    expect(certificateSerial({ ...ACCOUNT, login: 1235 }, '2026-03')).not.toBe(serial);
  });
});

describe('buildWrapped — a hand-worked month where optional chapters drop out', () => {
  const wrapped = fixtureWrapped('2026-03', END_OF_MARCH);

  it('keeps the chapters with data, in order, and drops the rest', () => {
    expect(wrapped.state).toBe('scored');
    expect(wrapped.partial).toBe(false);
    expect([wrapped.from, wrapped.to]).toEqual(['2026-03-01', '2026-03-31']);
    // No impurity cost → no Gap; one week → no Proof; no EA → no EAs.
    expect(kinds(wrapped)).toEqual(['karat', 'purity', 'window', 'day', 'certificate']);
  });

  it('scores the month as a whole: 24.0K, up 3.0K on February’s 21.0K', () => {
    const karat = chapter(wrapped, 'karat');
    expect(karat.karat).toBe(24);
    expect(karat.tier).toBe('24K · Pure');
    expect(karat.points).toBe(100);
    expect(karat.tradeCount).toBe(12);
    expect(karat.tradingDays).toBe(4);
    expect(karat.impurityTradeCount).toBe(0);
    // February: five of ten trades at 1.5% score 0 on Risk → 25 × 5/10 = 12.5
    // points lost → 87.5 points → 21.0K.
    expect(karat.previous).toEqual({ month: '2026-02', label: 'February 2026', karat: 21, tier: '18K · Solid' });
    expect(karat.delta).toBe(3);
    expect(karat.headline).toBe('March 2026 assayed at 24.0K.');
    expect(karat.sentences).toEqual([
      '24K · Pure, up 3.0K on February (21.0K).',
      '12 manual trades over 4 trading days; 0 of them carried an impurity.',
      'No pillar gave up a point.',
    ]);
  });

  it('draws the month’s equity from $11,000 to $11,800', () => {
    const purity = chapter(wrapped, 'purity');
    // February: ten winners of $100 on $10,000. March: 4 × (+100 − 100 + 200).
    expect(purity.startEquity).toBe(11_000);
    expect(purity.endEquity).toBe(11_800);
    expect(purity.netMoney).toBe(800);
    expect(purity.points).toHaveLength(12);
    expect(purity.stamps).toEqual([]);
    expect(purity.karatDays).toHaveLength(31);
    const scored = purity.karatDays.flatMap((day) => (day.karat === null ? [] : [day.karat]));
    expect(purity.brightest?.karat).toBe(Math.max(...scored));
    expect(purity.dullest?.karat).toBe(Math.min(...scored));
    expect(purity.sentences[0]).toBe('Equity went from $11,000 to $11,800, +$800, EAs included.');
    expect(purity.sentences[2]).toBe('No impurity is stamped on the month.');
  });

  it('finds the window that held all twelve: 08:00–11:00, +8.0R', () => {
    const window = chapter(wrapped, 'window');
    // 07:00–10:00 and 09:00–12:00 hold eight trades each, under the ten a window needs.
    expect(window.label).toBe('08:00–11:00 UTC');
    expect(window.tradeCount).toBe(12);
    expect(window.netR).toBe(8);
    expect(window.cleanCount).toBe(12);
    expect(window.karat).toBe(24);
    expect(window.winRate).toBe(66.7);
    expect(window.hours.filter((hour) => hour.tradeCount > 0).map((hour) => [hour.hour, hour.tradeCount, hour.netR])).toEqual([
      [8, 4, 4],
      [9, 4, -4],
      [10, 4, 8],
    ]);
    expect(window.confidence.n).toBe(12);
  });

  it('with no tilt, lets the purest day stand for the month: the first 24.0K day with three trades', () => {
    const day = chapter(wrapped, 'day');
    expect(day.mode).toBe('pure');
    expect(day.episode).toBeNull();
    expect(day.date).toBe('2026-03-02');
    expect(day.story.karat).toBe(24);
    expect(day.sentences).toEqual([
      '3 trades, none of them impure: the day closed at 24.0K.',
      'No tilt episode all month, so the purest day stands for it.',
    ]);
  });

  it('closes with a certificate that carries no money and no R', () => {
    const certificate = chapter(wrapped, 'certificate');
    const serial = certificateSerial(ACCOUNT, '2026-03');
    expect(certificate.legend).toBe(`KAVRIX ASSAY · 24.0K · MARCH 2026 · No. ${serial}`);
    expect(certificate.period).toBe('1–31 Mar');
    expect(certificate.tradeCount).toBe(12);
    expect(certificate.tradingDays).toBe(4);
    expect(certificate.demo).toBe(false);
    expect(Object.keys(certificate).some((key) => /money|netR|cost|equity|balance/i.test(key))).toBe(false);
  });
});

describe('buildWrapped — the month still running, and a month too thin to assay', () => {
  it('labels a partial month "Month to date", certificate included', () => {
    const wrapped = fixtureWrapped('2026-03', Date.UTC(2026, 2, 5, 12));
    expect(wrapped.partial).toBe(true);
    expect(wrapped.to).toBe('2026-03-05');
    expect(chapter(wrapped, 'karat').headline).toBe('March 2026, so far, assayed at 24.0K.');
    const certificate = chapter(wrapped, 'certificate');
    expect(certificate.partial).toBe(true);
    expect(certificate.legend).toContain('MARCH 2026 · MONTH TO DATE · No. ');
    expect(certificate.period).toBe('1–5 Mar');
  });

  it('is "assaying" with no chapters under ten manual trades', () => {
    const wrapped = fixtureWrapped('2026-03', Date.UTC(2026, 2, 4, 12));
    expect(wrapped.tradeCount).toBe(9);
    expect(wrapped.state).toBe('assaying');
    expect(wrapped.chapters).toEqual([]);
  });

  it('does not compare against a month too thin to assay', () => {
    const wrapped = fixtureWrapped('2026-03', END_OF_MARCH, [...FEBRUARY.slice(0, 4), ...MARCH]);
    const karat = chapter(wrapped, 'karat');
    expect(karat.previous).toBeNull();
    expect(karat.delta).toBeNull();
    expect(karat.sentences[0]).toBe('24K · Pure. February held 4 manual trades, too few to assay against.');
  });
});

/* -------------------------------------------------------------------------
 * The demo
 * ---------------------------------------------------------------------- */

describe('the demo — months', () => {
  it('covers June to September and opens on August, the last full month', () => {
    expect(getDemoWrappedMonths()).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
    expect(getDemoDefaultMonth()).toBe('2026-08');
  });
});

describe('the demo — August 2026, every chapter', () => {
  const wrapped = getDemoWrapped('2026-08');
  const assay = getDemoAssay();
  const august = assay.trades.filter((trade) => trade.isManual && trade.dayKey.startsWith('2026-08'));

  it('plays all eight chapters', () => {
    expect(wrapped.state).toBe('scored');
    expect(wrapped.partial).toBe(false);
    expect(kinds(wrapped)).toEqual(['karat', 'purity', 'window', 'gap', 'day', 'proof', 'eas', 'certificate']);
  });

  it('assays August at 21.9K, up 6.8K on July', () => {
    const karat = chapter(wrapped, 'karat');
    // 21.6 + 19.39 + 14.09 + 14.13 + 14.29 + 7.58 = 91.08 points → 21.9K.
    expect(karat.pillars.map((pillar) => pillar.points)).toEqual([21.6, 19.39, 14.09, 14.13, 14.29, 7.58]);
    expect(karat.points).toBe(91.08);
    expect(karat.karat).toBe(21.9);
    expect(karat.karat).toBe(karatFromPoints(pointsFromPillars(scorePillars(august, assay.settings))));
    expect(karat.tier).toBe('18K · Solid');
    expect([karat.tradeCount, karat.tradingDays, karat.impurityTradeCount]).toEqual([66, 21, 27]);
    expect(karat.previous?.karat).toBe(15.1);
    expect(karat.delta).toBe(6.8);
    expect(karat.sentences[0]).toBe('18K · Solid, up 6.8K on July (15.1K).');
    expect(karat.sentences[2]).toBe('Risk gave up the most, keeping 21.6 of 25 points.');
  });

  it('draws the month’s equity, lit by the rolling Karat', () => {
    const purity = chapter(wrapped, 'purity');
    expect(purity.startEquity).toBe(13_465);
    expect(purity.endEquity).toBe(20_615.26);
    expect(purity.netMoney).toBe(7_150.26);
    expect(purity.points).toHaveLength(261);
    expect(purity.brightest).toEqual({ date: '2026-08-31', karat: 22.7 });
    expect(purity.dullest).toEqual({ date: '2026-08-01', karat: 16.1 });
    expect(purity.stamps).toHaveLength(27);
    // The rolling series is the Assay's own: August's last point matches the
    // score the full run printed for that day.
    const day = assay.series.find((point) => point.date === '2026-08-31');
    expect(purity.karatDays.at(-1)?.karat).toBe(day?.karat);
  });

  it('finds the London open again: 07:00–10:00, 27 trades, +38.9R, Strong', () => {
    const window = chapter(wrapped, 'window');
    expect(window.label).toBe('07:00–10:00 UTC');
    expect([window.tradeCount, window.netR, window.avgR, window.cleanCount]).toEqual([27, 38.94, 1.442, 22]);
    expect(window.netMoney).toBe(5_669.92);
    expect(window.karat).toBe(23.7);
    expect(window.tier).toBe('24K · Pure');
    expect(window.confidence.label).toBe('strong');
  });

  it('bills $2,754.49 of impurity, most of it to Market Conditions', () => {
    const gap = chapter(wrapped, 'gap');
    expect(gap.gap).toEqual(computeKaratGap(august, assay.settings, 'USD'));
    expect(gap.gap.lines.map((line) => [line.label, line.costMoney, line.tradeCount])).toEqual([
      ['Market Conditions', 2_238.61, 9],
      ['Revenge', 473.54, 2],
      ['Risk', 42.34, 4],
    ]);
    // 2,238.61 + 473.54 + 42.34 = 2,754.49.
    expect(gap.gap.totalCostMoney).toBe(2_754.49);
    expect(gap.gap.totalCostR).toBe(14.32);
    expect(gap.headline).toBe('Market Conditions cost the most.');
    expect(gap.sentences).toEqual([
      'Impurity cost $2,754.49 this month, or −14.3R, across the 15 impure trades that lost money.',
      'Market Conditions billed 9 trades for $2,238.61; Revenge and Risk billed the rest.',
      'Each trade is billed to one pillar only.',
    ]);
  });

  it('names 13 August, the month’s worst tilt', () => {
    const day = chapter(wrapped, 'day');
    const replay = computeReplay(august, assay.settings);
    expect(worstTiltEpisode(replay)?.date).toBe('2026-08-13');
    expect(day.mode).toBe('tilt');
    expect(day.date).toBe('2026-08-13');
    expect(day.episode?.tradeIds).toEqual(['T-700498', 'T-700499', 'T-700500']);
    expect([day.episode?.karatBefore, day.episode?.karatAfter, day.episode?.costMoney]).toEqual([24, 15.8, 792.32]);
    expect(day.sentences).toEqual([
      'From 12:19 to 12:47, 3 impurities took the day Karat from 24.0K to 15.8K.',
      'The Gap bills that tilt $792.32; the day closed at 15.8K.',
      'The worst of 7 tilt episodes this month.',
    ]);
  });

  it('shows Your Proof as it stood on 31 August: +27.4R a week', () => {
    const proof = chapter(wrapped, 'proof');
    expect(proof.through).toBe('2026-08-31');
    expect(proof.proof.visible).toBe(true);
    // +11.07R − (−16.29R) = +27.36R, printed +27.4R.
    expect([proof.proof.high.avgWeeklyR, proof.proof.low.avgWeeklyR]).toEqual([11.07, -16.29]);
    expect(proof.proof.differenceR).toBe(27.36);
    expect(proof.headline).toBe('Discipline paid you +27.4R a week.');
  });

  it('reads the Constellation as it stood on 31 August', () => {
    const eas = chapter(wrapped, 'eas');
    expect(eas.monthTradeCount).toBe(195);
    expect(eas.eas.map((ea) => [ea.magic, ea.monthTrades, ea.label])).toEqual([
      [1001, 92, 'Watch'],
      [1002, 42, 'Fine'],
      [1003, 61, 'Degraded'],
    ]);
    expect(eas.healthiest?.name).toBe('London Breakout');
    expect(eas.healthiest?.fineness).toBe(950);
    expect(eas.drifting.map((ea) => ea.magic)).toEqual([1003]);
    expect(eas.sameBets.map((pair) => [pair.a, pair.b, pair.correlation])).toEqual([[1001, 1002, 0.821]]);
    expect(eas.headline).toBe('London Breakout was your healthiest EA, at 950.0‰.');
  });

  it('closes on a demo certificate: DEMO- serial, Karat, tier, period, trade count', () => {
    const certificate = chapter(wrapped, 'certificate');
    expect(certificate.serial).toBe('DEMO-088723');
    expect(certificate.demo).toBe(true);
    expect(certificate.legend).toBe('KAVRIX ASSAY · 21.9K · AUGUST 2026 · No. DEMO-088723');
    expect([certificate.karat, certificate.tier, certificate.period]).toEqual([21.9, '18K · Solid', '1–31 Aug']);
    expect([certificate.tradeCount, certificate.tradingDays]).toEqual([66, 21]);
  });
});

describe('the demo — months where optional chapters drop out', () => {
  it('July: Your Proof was still hidden on 31 July, so its chapter drops', () => {
    const july = getDemoWrapped('2026-07');
    expect(kinds(july)).toEqual(['karat', 'purity', 'window', 'gap', 'day', 'eas', 'certificate']);
    expect(chapter(july, 'day').date).toBe('2026-07-15');
  });

  it('June: nine days of history, no window that made money, no Proof', () => {
    const june = getDemoWrapped('2026-06');
    expect([june.from, june.to]).toEqual(['2026-06-22', '2026-06-30']);
    expect(kinds(june)).toEqual(['karat', 'purity', 'gap', 'day', 'eas', 'certificate']);
    expect(chapter(june, 'karat').previous).toBeNull();
    expect(chapter(june, 'certificate').period).toBe('22–30 Jun');
  });

  it('September: month to date, everywhere', () => {
    const september = getDemoWrapped('2026-09');
    expect(september.partial).toBe(true);
    expect(september.asOf).toBe(new Date(DEMO_END_MS).toISOString());
    expect(chapter(september, 'certificate').legend).toContain('SEPTEMBER 2026 · MONTH TO DATE');
  });

  it('never hands the certificate a figure in money or R', () => {
    for (const month of getDemoWrappedMonths()) {
      const certificate = chapter(getDemoWrapped(month), 'certificate');
      expect(certificate.legend).not.toMatch(/\$|\d(\.\d+)?R\b/);
    }
  });
});
