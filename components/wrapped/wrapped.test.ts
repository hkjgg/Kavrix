import { describe, expect, it } from 'vitest';
import { getDemoWrapped, getDemoWrappedView } from '@/lib/demo/wrapped';
import { formatMoney } from '@/lib/format';
import { storyKey } from './story';
import { RULER, rulerX, rulerY } from './wrapped';

/**
 * Wrapped as a view: every figure the page prints is the engine's, placed —
 * never recomputed. Expected values are read from `getDemoWrapped`.
 */

describe('storyKey', () => {
  it('maps the arrows, the ends and Esc, and leaves Space and Enter to the focused button', () => {
    expect(storyKey('ArrowRight')).toBe('next');
    expect(storyKey('PageDown')).toBe('next');
    expect(storyKey('ArrowLeft')).toBe('previous');
    expect(storyKey('Home')).toBe('first');
    expect(storyKey('End')).toBe('last');
    expect(storyKey('Escape')).toBe('exit');
    expect(storyKey(' ')).toBeNull();
    expect(storyKey('Enter')).toBeNull();
  });
});

describe('the 24-hour ruler', () => {
  it('places hours across the plane and R on a capped scale', () => {
    expect(rulerX(0)).toBe(RULER.left);
    expect(rulerX(24)).toBe(RULER.width - RULER.right);
    expect(rulerX(12)).toBe(500);
    const mid = (RULER.top + RULER.height - RULER.bottom) / 2;
    expect(rulerY(0, 4)).toBe(mid);
    expect(rulerY(4, 4)).toBe(RULER.top);
    // Past the cap is drawn at the cap, not off the plane.
    expect(rulerY(-9, 4)).toBe(RULER.height - RULER.bottom);
  });
});

describe('buildWrappedView — August 2026', () => {
  const wrapped = getDemoWrapped('2026-08');
  const view = getDemoWrappedView('2026-08');

  it('keeps the engine’s chapters, in its order, numbered 01–08', () => {
    expect(view.chapters.map((chapter) => chapter.kind)).toEqual(wrapped.chapters.map((chapter) => chapter.kind));
    expect(view.chapters.map((chapter) => chapter.number)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
    view.chapters.forEach((chapter, index) => {
      expect(chapter.headline).toBe(wrapped.chapters[index]?.headline);
      expect(chapter.sentences).toEqual(wrapped.chapters[index]?.sentences);
    });
    expect(view.periodText).toBe('1–31 August 2026');
    expect(view.href).toBe('/demo/wrapped/2026-08');
  });

  it('lists every month, the current one marked and September month to date', () => {
    expect(view.months.map((month) => [month.short, month.current, month.partial])).toEqual([
      ['Jun 26', false, false],
      ['Jul 26', false, false],
      ['Aug 26', true, false],
      ['Sep 26', false, true],
    ]);
  });

  it('splits the Gap bar by the engine’s own lines, shares summing to one', () => {
    const gap = view.chapters.find((chapter) => chapter.kind === 'gap');
    if (gap?.kind !== 'gap') throw new Error('no gap');
    expect(gap.segments.map((segment) => segment.label)).toEqual(['Market Conditions', 'Revenge', 'Risk']);
    expect(gap.segments.reduce((total, segment) => total + segment.share, 0)).toBeCloseTo(1, 3);
    expect(gap.segments[0]?.money).toBe(formatMoney(2_238.61));
  });

  it('draws the month’s equity through every close, stamped where impure trades closed', () => {
    const purity = view.chapters.find((chapter) => chapter.kind === 'purity');
    const source = wrapped.chapters.find((chapter) => chapter.kind === 'purity');
    if (purity?.kind !== 'purity' || source?.kind !== 'purity') throw new Error('no purity');
    expect(purity.stamps).toHaveLength(source.stamps.length);
    expect(purity.d.startsWith('M0 ')).toBe(true);
    expect(purity.stops.length).toBeGreaterThan(20);
    expect(purity.marks.map((mark) => mark.label)).toEqual(['16.1K · 1 Aug', '22.7K · 31 Aug']);
  });

  it('frames the tilt on the day chart and links the day in the Vault', () => {
    const day = view.chapters.find((chapter) => chapter.kind === 'day');
    if (day?.kind !== 'day') throw new Error('no day');
    expect(day.vaultHref).toBe('/demo/vault?day=2026-08-13');
    expect(day.tilt).not.toBeNull();
    expect(day.chapters.map((entry) => entry.title)).toEqual(['The open', 'The tilt']);
  });

  it('marks the healthiest and the drifting EA', () => {
    const eas = view.chapters.find((chapter) => chapter.kind === 'eas');
    if (eas?.kind !== 'eas') throw new Error('no eas');
    expect(eas.rows.map((row) => [row.name, row.note])).toEqual([
      ['Gold Scalper', null],
      ['London Breakout', 'Healthiest'],
      ['Grid Recovery', 'Drifting'],
    ]);
    expect(eas.threads.some((thread) => thread.sameBet)).toBe(true);
  });
});

describe('buildWrappedView — a month with a chapter missing', () => {
  it('renumbers July after Your Proof drops out', () => {
    const view = getDemoWrappedView('2026-07');
    expect(view.chapters.map((chapter) => `${chapter.number} ${chapter.kind}`)).toEqual([
      '01 karat',
      '02 purity',
      '03 window',
      '04 gap',
      '05 day',
      '06 eas',
      '07 certificate',
    ]);
  });
});
