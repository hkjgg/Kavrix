import { describe, expect, it } from 'vitest';
import {
  EM_DASH,
  MINUS,
  formatDuration,
  formatKarat,
  formatLots,
  formatMoney,
  formatPct,
  formatPrice,
  formatR,
} from './format';

describe('MINUS', () => {
  it('is the real minus sign, not a hyphen', () => {
    expect(MINUS).toBe('−');
    expect(MINUS).not.toBe('-');
  });
});

describe('formatR', () => {
  it('signs and fixes positives to one decimal', () => {
    expect(formatR(1.8)).toBe('+1.8R');
    expect(formatR(2)).toBe('+2.0R');
    expect(formatR(0.05)).toBe('+0.1R');
  });

  it('uses a real minus sign for losses', () => {
    expect(formatR(-0.6)).toBe(`${MINUS}0.6R`);
    expect(formatR(-1.1)).toBe(`${MINUS}1.1R`);
    expect(formatR(-0.6)).not.toContain('-');
  });

  it('renders zero without a sign', () => {
    expect(formatR(0)).toBe('0.0R');
    expect(formatR(-0.004)).toBe('0.0R');
  });

  it('can drop the leading plus', () => {
    expect(formatR(1.8, { signed: false })).toBe('1.8R');
    expect(formatR(-1.8, { signed: false })).toBe(`${MINUS}1.8R`);
  });

  it('honours a custom decimal count', () => {
    expect(formatR(1.834, { digits: 2 })).toBe('+1.83R');
    expect(formatR(1.8, { digits: 0 })).toBe('+2R');
  });

  it('falls back to an em dash for non-finite input', () => {
    expect(formatR(Number.NaN)).toBe(EM_DASH);
    expect(formatR(Number.POSITIVE_INFINITY)).toBe(EM_DASH);
  });
});

describe('formatMoney', () => {
  it('formats USD with grouping and two decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('puts a real minus sign outside the currency symbol', () => {
    expect(formatMoney(-820)).toBe(`${MINUS}$820.00`);
    expect(formatMoney(-820)).not.toContain('-');
  });

  it('can sign positive amounts', () => {
    expect(formatMoney(240.5, { signed: true })).toBe('+$240.50');
    expect(formatMoney(0, { signed: true })).toBe('$0.00');
  });

  it('supports other account currencies', () => {
    expect(formatMoney(1000, { currency: 'EUR' })).toBe('€1,000.00');
  });

  it('honours a custom decimal count', () => {
    expect(formatMoney(1234.56, { digits: 0 })).toBe('$1,235');
  });

  it('falls back to an em dash for non-finite input', () => {
    expect(formatMoney(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatPct', () => {
  it('formats a percentage value to one decimal', () => {
    expect(formatPct(1.25)).toBe('1.3%');
    expect(formatPct(0.75)).toBe('0.8%');
    expect(formatPct(100)).toBe('100.0%');
  });

  it('converts ratios when asked', () => {
    expect(formatPct(0.0125, { fromRatio: true })).toBe('1.3%');
    expect(formatPct(1, { fromRatio: true })).toBe('100.0%');
  });

  it('uses a real minus sign', () => {
    expect(formatPct(-2.5)).toBe(`${MINUS}2.5%`);
  });

  it('can sign positive values', () => {
    expect(formatPct(3.2, { signed: true })).toBe('+3.2%');
    expect(formatPct(0, { signed: true })).toBe('0.0%');
  });

  it('honours a custom decimal count', () => {
    expect(formatPct(66.666, { digits: 2 })).toBe('66.67%');
    expect(formatPct(66.666, { digits: 0 })).toBe('67%');
  });

  it('falls back to an em dash for non-finite input', () => {
    expect(formatPct(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatKarat', () => {
  it('renders the score to one decimal with a K suffix', () => {
    expect(formatKarat(21.4)).toBe('21.4K');
    expect(formatKarat(21.35)).toBe('21.4K');
    expect(formatKarat(24)).toBe('24.0K');
    expect(formatKarat(0)).toBe('0.0K');
  });

  it('renders a signed delta', () => {
    expect(formatKarat(0.8, { signed: true })).toBe('+0.8K');
    expect(formatKarat(-1.2, { signed: true })).toBe(`${MINUS}1.2K`);
    expect(formatKarat(0, { signed: true })).toBe('0.0K');
  });

  it('never uses a hyphen for a negative delta', () => {
    expect(formatKarat(-1.2)).not.toContain('-');
  });

  it('honours a custom decimal count', () => {
    expect(formatKarat(21.44, { digits: 2 })).toBe('21.44K');
  });

  it('falls back to an em dash for non-finite input', () => {
    expect(formatKarat(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatDuration', () => {
  it('reads seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(42)).toBe('42s');
  });

  it('shows two units, largest first, truncated rather than rounded', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3_599)).toBe('59m');
    expect(formatDuration(5_040)).toBe('1h 24m');
    expect(formatDuration(3_600)).toBe('1h');
    expect(formatDuration(183_600)).toBe('2d 3h');
    expect(formatDuration(86_400 + 59)).toBe('1d');
  });

  it('falls back to an em dash for a negative or non-finite value', () => {
    expect(formatDuration(-1)).toBe(EM_DASH);
    expect(formatDuration(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatLots and formatPrice', () => {
  it('fixes lots at two decimals', () => {
    expect(formatLots(0.5)).toBe('0.50');
    expect(formatLots(1.234)).toBe('1.23');
  });

  it('fixes a price at the symbol precision', () => {
    expect(formatPrice(2412.3)).toBe('2412.30');
    expect(formatPrice(1.23456, 5)).toBe('1.23456');
    expect(formatPrice(Number.NaN)).toBe(EM_DASH);
  });
});
