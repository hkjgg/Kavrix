import { describe, expect, it } from 'vitest';
import {
  PURITY_ANCHORS,
  PURITY_HEIGHT,
  PURITY_WIDTH,
  axisTicks,
  decimate,
  linePath,
  niceStep,
  purityColor,
  purityStops,
  valueDomain,
  xForTime,
  yForValue,
} from './purity';

/** `#rrggbb` → HSL saturation and lightness, 0–1. */
function hsl(hex: string): { s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

const DAY = 86_400_000;
const scale = { x0Ms: 0, x1Ms: 10 * DAY, yMin: 1000, yMax: 2000 };

describe('purityColor — the metal follows the Karat', () => {
  it('pins the anchors to the §9 tokens', () => {
    expect(purityColor(PURITY_ANCHORS.gold)).toBe('#d4af6a');
    expect(purityColor(PURITY_ANCHORS.bright)).toBe('#f3dfa8');
    expect(purityColor(24)).toBe('#f3dfa8');
    expect(purityColor(3)).toBe(purityColor(PURITY_ANCHORS.dull));
  });

  it('draws an unscored window in the dull alloy, never bright', () => {
    expect(purityColor(null)).toBe(purityColor(0));
    expect(purityColor(Number.NaN)).toBe(purityColor(0));
  });

  it('only ever gets brighter and more saturated as the Karat rises', () => {
    let previous = hsl(purityColor(0));
    for (let karat = 0.5; karat <= 24; karat += 0.5) {
      const next = hsl(purityColor(karat));
      expect(next.l).toBeGreaterThanOrEqual(previous.l - 1e-9);
      expect(next.s).toBeGreaterThanOrEqual(previous.s - 0.02);
      previous = next;
    }
    const raw = hsl(purityColor(9));
    const pure = hsl(purityColor(23.5));
    expect(pure.l - raw.l).toBeGreaterThan(0.3);
    expect(pure.s - raw.s).toBeGreaterThan(0.4);
  });

  it('interpolates between anchors', () => {
    // Halfway from 10K (#6e6658) to 18K (#d4af6a): each channel at the midpoint.
    expect(purityColor(14)).toBe('#a18b61');
  });
});

describe('scales', () => {
  it('maps time across the width and clamps outside it', () => {
    expect(xForTime(0, scale)).toBe(0);
    expect(xForTime(5 * DAY, scale)).toBe(PURITY_WIDTH / 2);
    expect(xForTime(-DAY, scale)).toBe(0);
    expect(xForTime(11 * DAY, scale)).toBe(PURITY_WIDTH);
  });

  it('puts the highest value at the top', () => {
    expect(yForValue(2000, scale)).toBe(0);
    expect(yForValue(1000, scale)).toBe(PURITY_HEIGHT);
    expect(yForValue(1500, scale)).toBe(PURITY_HEIGHT / 2);
  });

  it('pads the value domain so no curve touches an edge', () => {
    expect(valueDomain([1000, 2000])).toEqual({ yMin: 940, yMax: 2060 });
  });

  it('picks round axis steps', () => {
    expect(niceStep(35_000)).toBe(10_000);
    expect(niceStep(12_000)).toBe(2_500);
    expect(axisTicks(12_000, 48_000)).toEqual([20_000, 30_000, 40_000]);
  });
});

describe('decimate', () => {
  it('keeps the first, lowest, highest and last point of each bucket, in order', () => {
    const points = [
      { x: 0.1, y: 50 },
      { x: 0.2, y: 90 },
      { x: 0.3, y: 10 },
      { x: 0.4, y: 60 },
      { x: 0.5, y: 55 },
      { x: 1.2, y: 40 },
    ];
    expect(decimate(points, 1)).toEqual([
      { x: 0.1, y: 50 },
      { x: 0.2, y: 90 },
      { x: 0.3, y: 10 },
      { x: 0.5, y: 55 },
      { x: 1.2, y: 40 },
    ]);
  });

  it('writes a path in whole plot units, dropping points that round onto the last', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 2.345, y: 3 }, { x: 2.4, y: 3.2 }, { x: 5.6, y: 3 }])).toBe(
      'M0 1 L2 3 L6 3',
    );
  });
});

describe('purityStops', () => {
  it('places one stop per day at the instant its Karat was read', () => {
    const stops = purityStops(
      [
        { asOfMs: DAY - 1, karat: null },
        { asOfMs: 2 * DAY - 1, karat: 12 },
        { asOfMs: 5 * DAY - 1, karat: 23 },
      ],
      scale,
    );
    expect(stops.map((stop) => stop.offset)).toEqual([0.1, 0.2, 0.5]);
    expect(stops[0]?.color).toBe(purityColor(null));
    expect(stops[2]?.color).toBe(purityColor(23));
  });
});
