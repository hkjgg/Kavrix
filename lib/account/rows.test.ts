import { describe, expect, it } from 'vitest';
import {
  engineSettingsFromRow,
  equityAtEntryByTrade,
  isoUtc,
  newsFromRow,
  symbolInfoFromJson,
} from './rows';

describe('equity at entry — the balance walked back', () => {
  // Balance now $10,300. Three trades: A +200 (09:00–10:00), B −100
  // (09:30–11:00), C +200 (12:00–13:00).
  const trades = [
    { id: 'A', openTime: '2026-09-01T09:00:00Z', closeTime: '2026-09-01T10:00:00Z', netProfit: 200 },
    { id: 'B', openTime: '2026-09-01T09:30:00Z', closeTime: '2026-09-01T11:00:00Z', netProfit: -100 },
    { id: 'C', openTime: '2026-09-01T12:00:00Z', closeTime: '2026-09-01T13:00:00Z', netProfit: 200 },
  ];

  it('subtracts every close after the entry, the trade’s own included', () => {
    const equity = equityAtEntryByTrade(trades, 10_300);
    // A opened before all three closed: 10,300 − (200 − 100 + 200) = 10,000.
    expect(equity.get('A')).toBe(10_000);
    // B opened before all three closed too (A closed at 10:00).
    expect(equity.get('B')).toBe(10_000);
    // C opened after A and B closed: 10,300 − 200 = 10,100.
    expect(equity.get('C')).toBe(10_100);
  });

  it('does not depend on the order the trades arrive in', () => {
    const forward = equityAtEntryByTrade(trades, 10_300);
    const backward = equityAtEntryByTrade([...trades].reverse(), 10_300);
    expect([...backward.entries()].sort()).toEqual([...forward.entries()].sort());
  });

  it('falls back to the balance where an unseen withdrawal would make it nonsense', () => {
    const equity = equityAtEntryByTrade([{ id: 'X', openTime: '2026-09-01T09:00:00Z', closeTime: '2026-09-01T10:00:00Z', netProfit: 5_000 }], 1_000);
    expect(equity.get('X')).toBe(1_000);
  });
});

describe('row conversions', () => {
  it('prints Postgres timestamps as ISO with a Z', () => {
    expect(isoUtc('2026-09-01 09:00:00+00')).toBe('2026-09-01T09:00:00.000Z');
    expect(isoUtc('2026-09-01T11:00:00+02:00')).toBe('2026-09-01T09:00:00.000Z');
    expect(() => isoUtc('nope')).toThrow(RangeError);
  });

  it('reads symbol info defensively', () => {
    expect(symbolInfoFromJson({ XAUUSD: { contractSize: 100, digits: 2 }, BAD: { contractSize: 0, digits: 2 }, WORSE: 3 })).toEqual({
      XAUUSD: { contractSize: 100, digits: 2 },
    });
    expect(symbolInfoFromJson(null)).toEqual({});
    expect(symbolInfoFromJson([1])).toEqual({});
  });

  it('carries the trader’s thresholds into the engine, and nothing else', () => {
    expect(
      engineSettingsFromRow({
        user_id: 'u',
        risk_limit_percent: 0.5,
        daily_max_trades: 3,
        news_window_minutes: 30,
        rollover_window_minutes: 10,
        server_utc_offset_hours: 3,
        updated_at: '',
      }),
    ).toEqual({ riskLimitPercent: 0.5, dailyMaxTrades: 3, newsWindowMinutes: 30, rolloverWindowMinutes: 10, serverUtcOffsetHours: 3 });
    expect(engineSettingsFromRow(null)).toEqual({});
  });

  it('never lets an unknown importance into the news windows', () => {
    const event = newsFromRow({ account_id: 'a', event_id: 1, time: '2026-09-01 12:30:00+00', currency: 'USD', importance: 'extreme', name: 'CPI' });
    expect(event).toEqual({ eventId: 1, time: '2026-09-01T12:30:00.000Z', currency: 'USD', importance: 'low', name: 'CPI' });
  });
});
