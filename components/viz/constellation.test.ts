/**
 * The Constellation's geometry (§8.8): star size, thread opacity, the double
 * thread, and a force layout that is frozen and repeatable.
 */

import { describe, expect, it } from 'vitest';
import {
  LINK_BASE,
  LINK_SPAN,
  SKY_HEIGHT,
  SKY_WIDTH,
  STAR_MAX_RADIUS,
  STAR_MIN_RADIUS,
  doubleThread,
  labelOffset,
  layoutConstellation,
  linkDistance,
  starField,
  starRadius,
  starTone,
  threadOpacity,
} from './constellation';

describe('star size = volume', () => {
  it('runs from the minimum to the maximum core radius on a √ scale', () => {
    expect(starRadius(29.4, 29.4)).toBe(STAR_MAX_RADIUS);
    expect(starRadius(0, 29.4)).toBe(STAR_MIN_RADIUS);
    // A quarter of the volume is half the extra radius: 6 + 9 × √0.25 = 10.5.
    expect(starRadius(25, 100)).toBe(10.5);
  });

  it('never divides by nothing', () => {
    expect(starRadius(5, 0)).toBe(STAR_MIN_RADIUS);
  });
});

describe('brightness = Fineness', () => {
  it('maps every label to a tone, and no label to unassayed', () => {
    expect(starTone('Fine')).toBe('fine');
    expect(starTone('Standard')).toBe('standard');
    expect(starTone('Watch')).toBe('watch');
    expect(starTone('Degraded')).toBe('degraded');
    expect(starTone(null)).toBe('unassayed');
  });
});

describe('threads', () => {
  it('want to be 1 − correlation long', () => {
    expect(linkDistance(1)).toBe(LINK_BASE);
    expect(linkDistance(0)).toBe(LINK_BASE + LINK_SPAN);
    expect(linkDistance(-1)).toBe(LINK_BASE + 2 * LINK_SPAN);
    expect(linkDistance(0.5)).toBe(LINK_BASE + 0.5 * LINK_SPAN);
  });

  it('are as opaque as the correlation, and not drawn at all when it is not positive', () => {
    expect(threadOpacity(0.836)).toBe(0.84);
    expect(threadOpacity(0)).toBe(0);
    expect(threadOpacity(-0.24)).toBe(0);
    expect(threadOpacity(null)).toBe(0);
  });

  it('double into two parallel lines, the gap apart', () => {
    // A horizontal thread, gap 4: one line 2 above, one 2 below.
    expect(doubleThread(0, 10, 100, 10, 4)).toEqual([
      [0, 12, 100, 12],
      [0, 8, 100, 8],
    ]);
  });

  it('keep a star’s name clear of its core', () => {
    expect(labelOffset(10)).toBe(31);
  });
});

describe('the layout', () => {
  const nodes = [
    { id: 1003, radius: 14 },
    { id: 1001, radius: 15 },
    { id: 1002, radius: 14 },
  ];
  const links = [
    { a: 1001, b: 1002, correlation: 0.836 },
    { a: 1001, b: 1003, correlation: -0.237 },
    { a: 1002, b: 1003, correlation: -0.242 },
  ];

  it('is the same sky every time, whatever order the EAs arrive in', () => {
    const one = layoutConstellation(nodes, links);
    const two = layoutConstellation([...nodes].reverse(), [...links].reverse());
    expect(two).toEqual(one);
    expect(one.map((node) => node.id)).toEqual([1001, 1002, 1003]);
  });

  it('pulls the correlated pair together and pushes the third away', () => {
    const placed = new Map(layoutConstellation(nodes, links).map((node) => [node.id, node]));
    const distance = (a: number, b: number): number => {
      const p = placed.get(a);
      const q = placed.get(b);
      return Math.hypot((p?.x ?? 0) - (q?.x ?? 0), (p?.y ?? 0) - (q?.y ?? 0));
    };
    expect(distance(1001, 1002)).toBeLessThan(distance(1001, 1003) / 1.8);
    expect(distance(1001, 1002)).toBeLessThan(distance(1002, 1003) / 1.8);
  });

  it('fits inside the plane', () => {
    for (const node of layoutConstellation(nodes, links)) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(SKY_WIDTH);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(SKY_HEIGHT);
    }
  });

  it('centres one star, and draws nothing for none', () => {
    expect(layoutConstellation([{ id: 7, radius: 8 }], [])).toEqual([
      { id: 7, x: SKY_WIDTH / 2, y: SKY_HEIGHT / 2 },
    ]);
    expect(layoutConstellation([], [])).toEqual([]);
  });

  it('adds no spring for a pair without enough overlap', () => {
    const apart = layoutConstellation(
      [
        { id: 1, radius: 8 },
        { id: 2, radius: 8 },
      ],
      [{ a: 1, b: 2, correlation: null }],
    );
    const bound = layoutConstellation(
      [
        { id: 1, radius: 8 },
        { id: 2, radius: 8 },
      ],
      [{ a: 1, b: 2, correlation: 1 }],
    );
    const span = (placed: typeof apart): number =>
      Math.hypot((placed[0]?.x ?? 0) - (placed[1]?.x ?? 0), (placed[0]?.y ?? 0) - (placed[1]?.y ?? 0));
    expect(span(apart)).toBeGreaterThan(span(bound));
  });
});

describe('the background field', () => {
  it('is seeded and static', () => {
    expect(starField(20, 42)).toEqual(starField(20, 42));
    expect(starField(20, 42)).not.toEqual(starField(20, 43));
    for (const dot of starField(50, 7)) {
      expect(dot.opacity).toBeLessThanOrEqual(0.45);
      expect(dot.r).toBeLessThanOrEqual(1.1);
    }
  });
});
