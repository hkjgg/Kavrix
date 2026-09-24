import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/engine/settings';
import { DEFAULT_THRESHOLDS, parseThresholds, thresholdsToRow } from './thresholds';

const form = (overrides: Record<string, string> = {}) => ({
  riskLimitPercent: '1',
  dailyMaxTrades: '5',
  newsWindowMinutes: '15',
  rolloverWindowMinutes: '15',
  serverUtcOffsetHours: '2',
  ...overrides,
});

describe('thresholds', () => {
  it('defaults to the spec (§6.1)', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      riskLimitPercent: DEFAULT_SETTINGS.riskLimitPercent,
      dailyMaxTrades: 5,
      newsWindowMinutes: 15,
      rolloverWindowMinutes: 15,
      serverUtcOffsetHours: 0,
    });
  });

  it('parses form strings into numbers', () => {
    expect(parseThresholds(form({ riskLimitPercent: '0.75' }))).toEqual({
      ok: true,
      value: { riskLimitPercent: 0.75, dailyMaxTrades: 5, newsWindowMinutes: 15, rolloverWindowMinutes: 15, serverUtcOffsetHours: 2 },
    });
  });

  it.each([
    [{ riskLimitPercent: '0' }, 'at least 0.05%'],
    [{ riskLimitPercent: '11' }, 'at most 10%'],
    [{ riskLimitPercent: 'abc' }, 'as a number'],
    [{ riskLimitPercent: '' }, 'as a number'],
    [{ dailyMaxTrades: '2.5' }, 'whole number'],
    [{ dailyMaxTrades: '0' }, 'at least one'],
    [{ newsWindowMinutes: '-1' }, 'cannot be negative'],
    [{ rolloverWindowMinutes: '241' }, 'At most 240'],
    [{ serverUtcOffsetHours: '2.25' }, 'half hours'],
    [{ serverUtcOffsetHours: '15' }, '−12 to +14'],
  ])('rejects %o', (overrides, message) => {
    const result = parseThresholds(form(overrides));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it('maps to the settings row', () => {
    const result = parseThresholds(form({ serverUtcOffsetHours: '-3.5' }));
    expect(result.ok && thresholdsToRow(result.value)).toEqual({
      risk_limit_percent: 1,
      daily_max_trades: 5,
      news_window_minutes: 15,
      rollover_window_minutes: 15,
      server_utc_offset_hours: -3.5,
    });
  });
});
