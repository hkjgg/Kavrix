import { describe, expect, it } from 'vitest';
import { MAX_DEALS_PER_REQUEST, parseIngestBody } from './schema';

const account = { login: 5001, server: 'Broker-Live', currency: 'USD', balance: 10_000, equity: 10_050, leverage: 100 };
const deal = {
  ticket: 11,
  positionId: 7,
  time: '2026-09-01T08:00:00Z',
  type: 'buy',
  entry: 'in',
  symbol: 'XAUUSD',
  volume: 0.1,
  price: 2400.5,
  sl: 2390,
  tp: 0,
  profit: 0,
  commission: -0.35,
  swap: 0,
  magic: 0,
  comment: '',
  spreadPoints: 22,
};

describe('the ingest schema (§12)', () => {
  it('accepts the §12 body and normalises times to UTC with a Z', () => {
    const result = parseIngestBody({
      account,
      deals: [{ ...deal, time: '2026-09-01T10:00:00+02:00' }],
      modifications: [{ positionId: 7, time: '2026-09-01T08:00:30Z', sl: 2392, tp: 0 }],
      calendar: [{ eventId: 99, time: '2026-09-01T12:30:00Z', currency: 'USD', importance: 'high', name: 'CPI' }],
      symbolInfo: { XAUUSD: { contractSize: 100, digits: 2 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.deals[0]?.time).toBe('2026-09-01T08:00:00.000Z');
    expect(result.value.payload.modifications[0]?.time).toBe('2026-09-01T08:00:30.000Z');
    expect(result.value.heartbeat).toBe(false);
    expect(result.value.rejected).toEqual([]);
  });

  it('reads an account-only body as a heartbeat', () => {
    const result = parseIngestBody({ account });
    expect(result.ok && result.value.heartbeat).toBe(true);
    const explicit = parseIngestBody({ account, deals: [], modifications: [], calendar: [], symbolInfo: {} });
    expect(explicit.ok && explicit.value.heartbeat).toBe(true);
  });

  it('rejects a bad envelope as a whole, naming the field', () => {
    const missing = parseIngestBody({ deals: [] });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0]?.path).toBe('account');

    const currency = parseIngestBody({ account: { ...account, currency: 'usd' } });
    expect(!currency.ok && currency.issues[0]).toMatchObject({ path: 'account.currency' });

    const badSymbol = parseIngestBody({ account, symbolInfo: { XAUUSD: { contractSize: 0, digits: 2 } } });
    expect(!badSymbol.ok && badSymbol.issues[0]?.path).toBe('symbolInfo.XAUUSD.contractSize');

    expect(parseIngestBody(null).ok).toBe(false);
    expect(parseIngestBody('text').ok).toBe(false);
    expect(parseIngestBody([]).ok).toBe(false);
  });

  it(`caps a request at ${MAX_DEALS_PER_REQUEST} deals`, () => {
    const deals = Array.from({ length: MAX_DEALS_PER_REQUEST + 1 }, (_, index) => ({ ...deal, ticket: index + 1 }));
    const result = parseIngestBody({ account, deals });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toContain('at most 100 deals');
    expect(parseIngestBody({ account, deals: deals.slice(0, 100) }).ok).toBe(true);
  });

  it('rejects a bad deal by its ticket and keeps the rest', () => {
    const result = parseIngestBody({
      account,
      deals: [deal, { ...deal, ticket: 12, volume: -1 }, { ...deal, ticket: 13, type: 'hold' }, { nonsense: true }, { ...deal, ticket: 14 }, deal],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.deals.map((entry) => entry.ticket)).toEqual([11, 14]);
    expect(result.value.rejected.map((entry) => entry.ticket)).toEqual([12, 13, null, 11]);
    expect(result.value.rejected[0]?.reason).toContain('volume');
    expect(result.value.rejected[3]?.reason).toBe('the same ticket twice in one request');
  });

  it('refuses times without a zone, NaN and infinities', () => {
    const result = parseIngestBody({
      account,
      deals: [{ ...deal, time: '2026-09-01 08:00:00' }, { ...deal, ticket: 12, price: Number.NaN }, { ...deal, ticket: 13, profit: Infinity }],
    });
    expect(result.ok && result.value.rejected.map((entry) => entry.ticket)).toEqual([11, 12, 13]);
  });
});
