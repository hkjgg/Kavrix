import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDemoLedger } from '@/lib/demo/ledger';
import { rowHallmark } from '@/lib/ledger/types';
import { Hallmark } from './Hallmark';
import type { HallmarkInput } from './hallmark';
import {
  arcPath,
  describeHallmark,
  discRadius,
  durationAngle,
  hallmarkGeometry,
  polar,
  riskSweep,
} from './hallmark';

/**
 * The Hallmark (CLAUDE.md §8.6): six dimensions, deterministic, distinguishable.
 * Expected values are worked by hand from the constants in `hallmark.ts`.
 */

const BASE: HallmarkInput = {
  rMultiple: 1,
  riskPercent: 1,
  riskLimitPercent: 1,
  durationSeconds: 3_600,
  sessions: ['london'],
  news: 'clear',
  newsMinutes: 120,
  stop: 'compliant',
};

const draw = (input: HallmarkInput): string =>
  renderToStaticMarkup(createElement(Hallmark, { input }));

describe('hallmark geometry', () => {
  it('puts 12 o’clock straight up and 3 o’clock to the right', () => {
    expect(polar(10, 0)).toEqual({ x: 16, y: 6 });
    expect(polar(10, 90)).toEqual({ x: 26, y: 16 });
    expect(polar(10, 180)).toEqual({ x: 16, y: 26 });
  });

  it('draws a full turn as two half arcs', () => {
    expect(arcPath(10, 0, 360)).toBe('M16 6A10 10 0 1 1 16 26A10 10 0 1 1 16 6');
    expect(arcPath(10, 0, 90)).toBe('M16 6A10 10 0 0 1 26 16');
    expect(arcPath(10, 90, 90)).toBe('');
  });

  it('sweeps the risk ring a third of the way at the limit and closes it at 3×', () => {
    expect(riskSweep(1, 1)).toBe(120);
    expect(riskSweep(0.5, 1)).toBe(60);
    expect(riskSweep(3, 1)).toBe(360);
    expect(riskSweep(9, 1)).toBe(360);
    expect(riskSweep(1, 0)).toBe(0);
  });

  it('points the hand on a log scale: a minute at 12, a day at 11', () => {
    expect(durationAngle(30)).toBe(0);
    expect(durationAngle(60)).toBe(0);
    expect(durationAngle(86_400)).toBe(330);
    expect(durationAngle(10 * 86_400)).toBe(330);
    // 330 × ln(60) ÷ ln(1440) = 185.79…
    expect(durationAngle(3_600)).toBe(185.79);
  });

  it('grows the disc with |R| and stops at 3R', () => {
    expect(discRadius(0)).toBe(1.6);
    expect(discRadius(1.5)).toBe(3.5);
    expect(discRadius(-1.5)).toBe(3.5);
    expect(discRadius(3)).toBe(5.4);
    expect(discRadius(8)).toBe(5.4);
  });

  it('splits risk over the limit into a brighter excess arc', () => {
    const under = hallmarkGeometry({ ...BASE, riskPercent: 0.8 });
    expect(under.risk.excess).toBe('');
    const over = hallmarkGeometry({ ...BASE, riskPercent: 1.5 });
    expect(over.risk.within).not.toBe('');
    expect(over.risk.excess).not.toBe('');
  });

  it('colours the disc by the sign of R only', () => {
    expect(hallmarkGeometry({ ...BASE, rMultiple: 0.4 }).disc.tone).toBe('profit');
    expect(hallmarkGeometry({ ...BASE, rMultiple: -0.4 }).disc.tone).toBe('loss');
    expect(hallmarkGeometry({ ...BASE, rMultiple: 0 }).disc.tone).toBe('flat');
  });
});

describe('Hallmark', () => {
  it('draws the same trade to the same bytes, every time', () => {
    expect(draw(BASE)).toBe(draw({ ...BASE, sessions: ['london'] }));
    expect(draw(BASE)).toBe(draw(BASE));
  });

  it('changes when any one of the six dimensions changes', () => {
    const variants: HallmarkInput[] = [
      { ...BASE, rMultiple: -1 }, // R result
      { ...BASE, riskPercent: 1.6 }, // risk %
      { ...BASE, durationSeconds: 600 }, // duration
      { ...BASE, sessions: ['asia'] }, // session
      { ...BASE, news: 'in-window', newsMinutes: 4 }, // news proximity
      { ...BASE, stop: 'widened' }, // SL compliance
    ];
    const base = draw(BASE);
    const drawn = variants.map(draw);
    for (const markup of drawn) expect(markup).not.toBe(base);
    expect(new Set(drawn).size).toBe(variants.length);
  });

  it('tells every news and stop state apart', () => {
    const news = (['in-window', 'near', 'clear'] as const).map((value) =>
      draw({ ...BASE, news: value, newsMinutes: null }),
    );
    expect(new Set(news).size).toBe(3);
    const stops = (['compliant', 'widened', 'none'] as const).map((value) =>
      draw({ ...BASE, stop: value }),
    );
    expect(new Set(stops).size).toBe(3);
  });

  it('gives nearly every demo trade a glyph of its own', () => {
    const { rows, context } = getDemoLedger();
    // The title is the description; compare the drawing alone.
    const shapes = rows.map((row) =>
      draw(rowHallmark(row, context.riskLimitPercent)).replace(/<title>.*<\/title>/, '').replace(/aria-label="[^"]*"/, ''),
    );
    const distinct = new Set(shapes).size;
    expect(distinct / rows.length).toBeGreaterThan(0.99);
  });

  it('names itself: role, title and aria-label describe the trade', () => {
    const markup = draw({ ...BASE, rMultiple: -1.25, riskPercent: 1.9, news: 'in-window', newsMinutes: 4, stop: 'widened', sessions: ['london', 'newYork'], durationSeconds: 1_320 });
    const words =
      'Hallmark: stop widened · London and New York · in the news window (4 min from a release) · risk 1.90%, over the 1.0% limit · held 22m · loss −1.25R';
    expect(markup).toContain('role="img"');
    expect(markup).toContain(`aria-label="${words}"`);
    expect(markup).toContain(`<title>${words}</title>`);
  });

  it('describes an off-session trade clear of the calendar', () => {
    expect(describeHallmark({ ...BASE, sessions: [], stop: 'none' })).toBe(
      'Hallmark: no stop · Off-session · clear of news · risk 1.00% · held 1h · win +1.00R',
    );
  });

  it('can stand aside for assistive technology when the row already speaks', () => {
    const markup = renderToStaticMarkup(createElement(Hallmark, { input: BASE, decorative: true }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('<title>');
  });

  it('uses no filters or gradients, so a table of them stays cheap', () => {
    const markup = draw(BASE);
    expect(markup).not.toMatch(/filter|Gradient/);
    expect((markup.match(/<(path|circle|line)/g) ?? []).length).toBeLessThanOrEqual(12);
  });
});
