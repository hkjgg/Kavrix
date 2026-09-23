import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayAssay } from '@/components/vault/DayAssay';
import type { VaultDay } from '@/components/vault/vault';
import { getDemoAssay } from '@/lib/demo/assay';
import { getDemoDayStories, getDemoReplay, getDemoVault } from '@/lib/demo/vault';
import { tierFor } from '@/lib/engine';
import { formatKarat, formatMoney } from '@/lib/format';
import VaultPage from './page';

/**
 * `/vault` prerendered, and a Day Assay rendered for real days of the demo.
 * Expected values are read from the engine, never written in.
 */

const markup = renderToStaticMarkup(VaultPage());
const assay = getDemoAssay();
const view = getDemoVault();
const replay = getDemoReplay();
const days = view.months.flatMap((month) => month.weeks.flat()).filter((day): day is VaultDay => day !== null);

function renderAssay(date: string): string {
  return renderToStaticMarkup(
    <DayAssay
      date={date}
      assay={view.assays[date] ?? null}
      vaultDay={days.find((day) => day.date === date) ?? null}
      currency={view.currency}
      sessions={view.sessions}
      onClose={() => undefined}
      onStep={() => undefined}
      canStep={{ previous: true, next: true }}
    />,
  );
}

describe('/vault', () => {
  it('shelves the whole 90-day history, one month a shelf', () => {
    expect(view.firstDate).toBe('2026-06-22');
    expect(view.lastDate).toBe(assay.asOf.slice(0, 10));
    expect(view.months.map((month) => month.label)).toEqual(['June 2026', 'July 2026', 'August 2026', 'September 2026']);
    for (const month of view.months) expect(markup).toContain(month.label);
  });

  it('draws every day of the history as a slot, and every trading day as an ingot', () => {
    expect(days).toHaveLength(91);
    expect((markup.match(/data-kind="trading"/g) ?? []).length).toBe(assay.stats.calendarDays.length);
    expect((markup.match(/data-kind="quiet"/g) ?? []).length).toBe(91 - assay.stats.calendarDays.length);
  });

  it('casts each ingot in the metal of the engine’s day Karat, and strikes the Karat into it', () => {
    for (const calendarDay of assay.stats.calendarDays) {
      const day = days.find((entry) => entry.date === calendarDay.date);
      expect(day?.karat).toBe(calendarDay.karat);
      expect(day?.tierLabel).toBe(calendarDay.karat === null ? null : tierFor(calendarDay.karat).label);
      expect(day?.netMoney).toBe(calendarDay.netMoney);
      expect(day?.strip.direction).toBe(calendarDay.netMoney > 0 ? 'profit' : 'loss');
    }
    // Six metals, one shared gradient each — never one per ingot.
    for (const tier of ['pure', 'refined', 'solid', 'mixed', 'alloyed', 'raw']) {
      expect((markup.match(new RegExp(`id="ingot-top-${tier}"`, 'g')) ?? []).length).toBe(1);
      expect(markup).toContain(`data-tier="${tier}"`);
    }
    expect((markup.match(/<linearGradient/g) ?? []).length).toBeLessThan(20);
    const worstDay = assay.stats.calendarDays.find((entry) => entry.date === '2026-07-15');
    expect(markup).toContain(`>${(worstDay?.karat ?? Number.NaN).toFixed(1)}</text>`);
  });

  it('draws P&L only as the assay strip, full at the month’s largest day', () => {
    for (const month of view.months) {
      const trading = month.weeks.flat().filter((day): day is VaultDay => day !== null && day.kind === 'trading');
      const largest = trading.reduce((a, b) => (Math.abs(b.netMoney) > Math.abs(a.netMoney) ? b : a));
      expect(largest.strip.share).toBe(1);
    }
    expect(markup).toContain('data-strip="profit"');
    expect(markup).toContain('data-strip="loss"');
    // Jade and oxblood appear on the shelves only in the strips.
    const shelves = markup.slice(markup.indexOf('role="group"'));
    expect((shelves.match(/fill="var\(--jade\)"/g) ?? []).length).toBe((shelves.match(/data-strip="profit"/g) ?? []).length);
    expect((shelves.match(/fill="var\(--oxblood\)"/g) ?? []).length).toBe((shelves.match(/data-strip="loss"/g) ?? []).length);
  });

  it('hallmarks each month’s best and worst day', () => {
    for (const month of view.months) {
      expect(markup).toContain(`data-date="${month.summary.best?.date ?? ''}" data-kind="trading" data-mark="best"`);
      expect(markup).toContain(`data-date="${month.summary.worst?.date ?? ''}" data-kind="trading" data-mark="worst"`);
    }
  });

  it('agrees with the Replay and the Day Assay on every day’s Karat', () => {
    for (const day of replay) {
      expect(assay.stats.calendarDays.find((entry) => entry.date === day.date)?.karat).toBe(day.karat);
      expect(view.assays[day.date]?.karat).toBe(day.karat);
    }
    expect(Object.keys(view.assays)).toHaveLength(replay.length);
  });

  it('draws a recessed slot, not a box, for a day with no trades', () => {
    expect((markup.match(/data-slot="empty"/g) ?? []).length).toBe(91 - assay.stats.calendarDays.length + 1);
    expect(markup).not.toContain('border-dashed');
  });

  it('names every day in words: trades, net, day Karat and impurities', () => {
    const day = days.find((entry) => entry.date === '2026-07-15');
    expect(day).toBeDefined();
    if (day === undefined) return;
    expect(markup).toContain(
      `Wednesday 15 July 2026: ${day.tradeCount} trades, ${day.manualTradeCount} manual. Net ${formatMoney(day.netMoney, {
        signed: true,
      })}`,
    );
    expect(markup).toContain(
      `day Karat ${formatKarat(day.karat ?? Number.NaN)}, ${day.tierLabel ?? ''}, ${day.impurityCount} impurities.`,
    );
    expect(markup).toContain('Saturday 27 June 2026: no trades.');
  });

  it('gives the calendar one tab stop and the keyboard help', () => {
    expect((markup.match(/data-date="[^"]+" data-kind="[^"]+"/g) ?? []).length).toBe(91);
    expect((markup.match(/tabindex="0"[^>]*data-date=/g) ?? []).length).toBe(1);
    expect(markup).toContain('Arrow keys move between days');
    expect(markup).toContain('aria-live="polite"');
  });

  it('heads every shelf editorially and summarises it: trading days, net R, best and worst day, average day Karat', () => {
    for (const month of view.months) {
      expect(markup).toContain(`>${month.key.slice(5)}</span>`);
      expect(markup).toContain(`>${formatKarat(month.summary.averageKarat ?? Number.NaN)}</span>`);
    }
    for (const label of ['Trading days', 'Net R', 'Best day', 'Worst day']) {
      expect((markup.match(new RegExp(`>${label}</dt>`, 'g')) ?? []).length).toBe(view.months.length);
    }
    expect((markup.match(/>Avg day Karat</g) ?? []).length).toBe(view.months.length);
    const total = view.months.reduce((sum, month) => sum + month.summary.tradingDays, 0);
    expect(total).toBe(assay.stats.calendarDays.length);
  });

  it('opens on the Day Assay prompt, offering the worst tilt of the history', () => {
    expect(markup).toContain('Choose a day to assay it');
    expect(view.worst?.date).toBe('2026-07-15');
    expect(markup).toContain('Open the worst tilt of the history');
  });

  it('lights the Vault in the nav and keeps the unbuilt surfaces dimmed', () => {
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/vault"/);
    expect(markup).toContain('href="/ledger"');
    expect(markup).toContain('href="/constellation"');
    expect(markup).toMatch(/aria-disabled="true" title="Wrapped arrives in Stage \d"/);
    expect(markup).toContain('Demo data');
  });
});

describe('a Day Assay', () => {
  const date = '2026-06-25';
  const story = getDemoDayStories().find((day) => day.date === date);
  const html = renderAssay(date);

  it('heads the day: date, day Karat and tier, net money and R, trade count', () => {
    expect(story).toBeDefined();
    if (story === undefined) return;
    expect(html).toContain('Thursday 25 June 2026');
    expect(html).toContain(`>${formatKarat(story.karat)}</span>`);
    expect(html).toContain(`>${story.tier}</span>`);
    expect(html).toContain(formatMoney(story.netMoney, { signed: true }));
    expect(html).toContain(`>${story.tradeCount}<`);
  });

  it('marks every trade on the chart, each a link to its Dossier, in jade or oxblood', () => {
    for (const step of story?.karatSeries ?? []) {
      expect(html).toContain(`href="/trade/${step.tradeId}"`);
      expect(html).toContain(`data-marker="${step.tradeId}"`);
    }
    expect(html).toContain('fill="var(--oxblood)"');
  });

  it('tarnishes the Karat line where impurities set it, over slate — never red', () => {
    expect((html.match(/data-karat-segment="tarnished"/g) ?? []).length).toBe(story?.impurityTradeCount);
    expect(html).toContain('fill="var(--slate)"');
    expect(html).not.toMatch(/fill="var\(--oxblood\)" fill-opacity/);
  });

  it('draws the 12:30 USD release as a dashed news rule', () => {
    expect(html).toContain('data-news="12:30"');
    expect(html).toContain('stroke="var(--news)"');
    expect(html).toContain('Final GDP q/q');
  });

  it('tells the day in the engine’s chapters, with every phrase a control', () => {
    for (const chapter of story?.chapters ?? []) {
      expect(html).toContain(`data-chapter="${chapter.id}"`);
      expect(html).toContain(`>${chapter.title}</span>`);
      for (const sentence of chapter.sentences) {
        for (const link of sentence.links) expect(html).toContain(`data-phrase="${link.phrase}"`);
      }
    }
    expect(html).toContain('>The tilt</span>');
    expect(html).toContain('>Recovery</span>');
  });

  it('prints the day’s Karat Gap receipt, a row per pillar and a total', () => {
    for (const line of story?.receipt.lines ?? []) {
      expect(html).toContain(`data-receipt="${line.pillar}"`);
      expect(html).toContain(formatMoney(-line.costMoney, { signed: true }));
    }
    expect(html).toContain('Total billed');
    expect(html).toContain(formatMoney(-(story?.receipt.totalMoney ?? 0), { signed: true }));
  });

  it('marks the worst tilt of the history on its day', () => {
    const worst = renderAssay(view.worst?.date ?? '');
    expect(worst).toContain('Worst tilt in the history');
    expect(html).not.toContain('Worst tilt in the history');
  });

  it('shows an empty state for a day with no trades', () => {
    const empty = renderAssay('2026-06-27');
    expect(empty).toContain('Saturday 27 June 2026');
    expect(empty).toContain('No trades on this day.');
    expect(empty).not.toContain('data-marker=');
  });
});
