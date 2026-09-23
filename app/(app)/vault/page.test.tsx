import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Replay } from '@/components/vault/Replay';
import type { VaultDay } from '@/components/vault/vault';
import { getDemoAssay } from '@/lib/demo/assay';
import { getDemoReplay, getDemoVault } from '@/lib/demo/vault';
import { formatKarat, formatMoney } from '@/lib/format';
import VaultPage from './page';

/**
 * `/vault` prerendered, and a Discipline Replay rendered for real days of the
 * demo. Expected values are read from the engine, never written in.
 */

const markup = renderToStaticMarkup(VaultPage());
const assay = getDemoAssay();
const view = getDemoVault();
const replay = getDemoReplay();
const days = view.months.flatMap((month) => month.weeks.flat()).filter((day): day is VaultDay => day !== null);

function renderReplay(date: string): string {
  return renderToStaticMarkup(
    <Replay
      date={date}
      day={view.replays[date] ?? null}
      vaultDay={days.find((day) => day.date === date) ?? null}
      currency={view.currency}
      reasons={view.reasons}
      onClose={() => undefined}
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

  it('engraves each ingot with the engine’s day Karat, and fills it by the day’s P&L', () => {
    for (const calendarDay of assay.stats.calendarDays) {
      const day = days.find((entry) => entry.date === calendarDay.date);
      expect(day?.karat).toBe(calendarDay.karat);
      expect(day?.netMoney).toBe(calendarDay.netMoney);
      expect(day?.fill.direction).toBe(calendarDay.netMoney > 0 ? 'up' : 'down');
    }
    const worstDay = assay.stats.calendarDays.reduce((a, b) => (b.netMoney < a.netMoney ? b : a));
    expect(days.find((day) => day.date === worstDay.date)?.fill).toEqual({ direction: 'down', share: 1 });
    expect(markup).toContain('fill="var(--jade)"');
    expect(markup).toContain('fill="var(--oxblood)"');
  });

  it('agrees with the Replay on every day’s Karat', () => {
    for (const day of replay) {
      expect(assay.stats.calendarDays.find((entry) => entry.date === day.date)?.karat).toBe(day.karat);
    }
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
    expect(markup).toContain(`day Karat ${formatKarat(day.karat ?? Number.NaN)}, ${day.impurityCount} impurities.`);
    expect(markup).toContain('Saturday 27 June 2026: no trades.');
  });

  it('gives the calendar one tab stop and the keyboard help', () => {
    expect((markup.match(/data-date="[^"]+" data-kind="[^"]+"/g) ?? []).length).toBe(91);
    expect((markup.match(/tabindex="0"[^>]*data-date=/g) ?? []).length).toBe(1);
    expect(markup).toContain('Arrow keys move between days');
    expect(markup).toContain('aria-live="polite"');
  });

  it('summarises every shelf: trading days, net R, best and worst day, average day Karat', () => {
    for (const label of ['Trading days', 'Net R', 'Best day', 'Worst day', 'Avg day Karat']) {
      expect((markup.match(new RegExp(`>${label}</dt>`, 'g')) ?? []).length).toBe(view.months.length);
    }
    const total = view.months.reduce((sum, month) => sum + month.summary.tradingDays, 0);
    expect(total).toBe(assay.stats.calendarDays.length);
  });

  it('opens on the replay prompt, offering the worst tilt of the history', () => {
    expect(markup).toContain('Choose a day to replay it');
    expect(view.worst?.date).toBe('2026-07-15');
    expect(markup).toContain('Open the worst tilt of the history');
  });

  it('lights the Vault in the nav and keeps the unbuilt surfaces dimmed', () => {
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/vault"/);
    expect(markup).toContain('href="/ledger"');
    for (const surface of ['Constellation', 'Wrapped']) {
      expect(markup).toMatch(new RegExp(`aria-disabled="true" title="${surface} arrives in Stage \\d"`));
    }
    expect(markup).toContain('Demo data');
  });
});

describe('a replay day', () => {
  const worst = view.worst?.date ?? '';
  const engineDay = replay.find((day) => day.date === worst);
  const html = renderReplay(worst);

  it('lists the day’s trades in the engine’s order, each linked to its Dossier', () => {
    expect(engineDay).toBeDefined();
    const order = [...html.matchAll(/data-trade-id="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(engineDay?.trades.map((trade) => trade.tradeId));
    for (const trade of engineDay?.trades ?? []) expect(html).toContain(`href="/trade/${trade.tradeId}"`);
  });

  it('prints the running day Karat after every trade, and the day’s close', () => {
    for (const trade of engineDay?.trades ?? []) {
      expect(html).toContain(`Day Karat after <span class="text-text">${formatKarat(trade.karatAfter)}</span>`);
    }
    expect(html).toContain(`The day closes at <span class="text-gold">${formatKarat(engineDay?.karat ?? Number.NaN)}</span>`);
  });

  it('gives every impurity the engine’s reason', () => {
    for (const trade of engineDay?.trades ?? []) {
      for (const impurity of trade.impurities) expect(html).toContain(impurity.reason);
    }
  });

  it('brackets each tilt episode with its start, end, Karat drop and cost, and labels the worst', () => {
    const episodes = engineDay?.episodes ?? [];
    expect(episodes.length).toBeGreaterThan(0);
    expect((html.match(/data-tilt-span=/g) ?? []).length).toBe(episodes.length);
    for (const episode of episodes) {
      expect(html).toContain(`${episode.start.slice(11, 16)}–${episode.end.slice(11, 16)} UTC`);
      expect(html).toContain(`(${formatKarat(-episode.karatDrop, { signed: true })})`);
      expect(html).toContain(formatMoney(-episode.costMoney, { signed: true }));
    }
    expect(html).toContain('Worst in the history');
  });

  it('draws the timeline top to bottom and marks the spans after it', () => {
    expect(html).toContain('class="enter-drop');
    expect(html).toMatch(/enter-fade absolute inset-y-0/);
  });

  it('shows an empty state for a day with no trades', () => {
    const empty = renderReplay('2026-06-27');
    expect(empty).toContain('Saturday 27 June 2026');
    expect(empty).toContain('No trades on this day.');
    expect(empty).not.toContain('data-trade-id=');
  });
});
