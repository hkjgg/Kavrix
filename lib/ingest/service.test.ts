import { beforeEach, describe, expect, it } from 'vitest';
import type { Deal, IngestPayload } from '@/lib/engine';
import { generateConnectorToken, hashConnectorToken } from '@/lib/connector/token';
import { runAccountEngine } from '@/lib/views/account';
import { MemoryIngestStore } from './memoryStore';
import type { IngestErrorBody, IngestResponseBody, IngestResult } from './service';
import { MAX_SNAPSHOT_DAYS, handleIngest, snapshotDays } from './service';
import { buildSimulation } from './simulate';

const PEPPER = 'pepper-'.repeat(8);
const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const GOLD = { XAUUSD: { contractSize: 100, digits: 2 } };
const account = { login: 5001, server: 'Broker-Live', currency: 'USD', balance: 10_000, equity: 10_000, leverage: 100 };

function deal(overrides: Partial<Deal>): Deal {
  return {
    ticket: 1,
    positionId: 100,
    time: '2026-09-22T08:00:00.000Z',
    type: 'buy',
    entry: 'in',
    symbol: 'XAUUSD',
    volume: 0.1,
    price: 2400,
    sl: 2390,
    tp: 0,
    profit: 0,
    commission: -0.35,
    swap: 0,
    magic: 0,
    comment: '',
    spreadPoints: 20,
    ...overrides,
  };
}

const roundTurn = (position: number, ticket: number, net = 100): Deal[] => [
  deal({ ticket, positionId: position }),
  deal({ ticket: ticket + 1, positionId: position, entry: 'out', type: 'sell', time: '2026-09-22T08:30:00.000Z', price: 2410, profit: net + 0.7 }),
];

let store: MemoryIngestStore;
let token: string;
let userId: string;

beforeEach(() => {
  store = new MemoryIngestStore();
  store.clockMs = () => NOW;
  const generated = generateConnectorToken(PEPPER);
  token = generated.token;
  userId = 'user-1';
  store.addToken(userId, generated.hash);
});

function post(body: unknown, options: { auth?: string | null; raw?: string; nowMs?: number; limit?: number } = {}): Promise<IngestResult> {
  return handleIngest(
    { authorization: options.auth === undefined ? `Bearer ${token}` : options.auth, body: options.raw ?? JSON.stringify(body) },
    { store, pepper: PEPPER, nowMs: options.nowMs ?? NOW, rateLimitPerMinute: options.limit },
  );
}

const ok = (result: IngestResult) => result.body as IngestResponseBody;
const err = (result: IngestResult) => result.body as IngestErrorBody;

describe('authentication', () => {
  it.each([
    ['no header', null],
    ['not a bearer', `Basic ${'x'}`],
    ['not a token', 'Bearer hello'],
    ['an unknown token', `Bearer kvx_${'A'.repeat(43)}`],
  ])('401 for %s', async (_, auth) => {
    const result = await post({ account }, { auth });
    expect(result.status).toBe(401);
    expect(err(result).error).toBe('unauthorized');
  });

  it('401 for a revoked token, and nothing is stored', async () => {
    const generated = generateConnectorToken(PEPPER);
    store.addToken(userId, generated.hash, { revokedAt: '2026-09-01T00:00:00Z' });
    const result = await post({ account, deals: roundTurn(1, 1), symbolInfo: GOLD }, { auth: `Bearer ${generated.token}` });
    expect(result.status).toBe(401);
    expect(store.accounts.size).toBe(0);
  });

  it('never looks a token up by anything but its peppered hash', async () => {
    const found = await store.findTokenByHash(hashConnectorToken(token, PEPPER));
    expect(found?.userId).toBe(userId);
    expect(await store.findTokenByHash(token)).toBeNull();
  });
});

describe('rate limiting', () => {
  it('429 past the limit in a window, with Retry-After, and a fresh window resets it', async () => {
    for (let index = 0; index < 3; index += 1) expect((await post({ account }, { limit: 3 })).status).toBe(200);
    const limited = await post({ account }, { limit: 3 });
    expect(limited.status).toBe(429);
    expect(err(limited).error).toBe('rate_limited');
    expect(Number(limited.headers?.['Retry-After'])).toBeGreaterThan(0);

    store.clockMs = () => NOW + 60_000;
    expect((await post({ account }, { limit: 3 })).status).toBe(200);
  });
});

describe('bad input never crashes', () => {
  it('400 for a body that is not JSON', async () => {
    const result = await post(null, { raw: '{"account":' });
    expect(result.status).toBe(400);
    expect(err(result).error).toBe('invalid_json');
  });

  it('400 naming the field for a bad envelope, and nothing stored', async () => {
    const result = await post({ account: { ...account, login: -1 } });
    expect(result.status).toBe(400);
    expect(err(result).issues?.[0]?.path).toBe('account.login');
    expect(store.accounts.size).toBe(0);
  });

  it('400 for more than 100 deals', async () => {
    const deals = Array.from({ length: 101 }, (_, index) => deal({ ticket: index + 1, positionId: index + 1 }));
    expect((await post({ account, deals, symbolInfo: GOLD })).status).toBe(400);
  });

  it('413 for a body no connector would send', async () => {
    const result = await post(null, { raw: JSON.stringify({ account, pad: 'x'.repeat(1_000_001) }) });
    expect(result.status).toBe(413);
  });

  it('rejects bad deals by ticket, stores the good ones', async () => {
    const result = await post({
      account,
      deals: [...roundTurn(1, 1), { ...deal({ ticket: 9 }), volume: 0 }, deal({ ticket: 10, positionId: 2, symbol: 'XAGUSD' })],
      symbolInfo: GOLD,
    });
    expect(result.status).toBe(200);
    expect(ok(result).accepted).toBe(2);
    expect(ok(result).rejected).toEqual([
      { ticket: 9, reason: expect.stringContaining('volume') },
      { ticket: 10, reason: expect.stringContaining('no contract size for XAGUSD') },
    ]);
  });
});

describe('heartbeats', () => {
  it('update last seen, balance and equity — and recompute nothing', async () => {
    const result = await post({ account: { ...account, balance: 10_250, equity: 10_310.5 } });
    expect(result.status).toBe(200);
    expect(ok(result)).toMatchObject({ heartbeat: true, accepted: 0, duplicates: 0, tradesRebuilt: 0, snapshotsWritten: 0 });
    const stored = store.accountFor(5001);
    expect(stored).toMatchObject({ balance: 10_250, equity: 10_310.5, lastHeartbeatAt: new Date(NOW).toISOString() });
    expect([...store.tokens.values()][0]?.lastSeenAt).toBe(new Date(NOW).toISOString());
    expect(store.snapshots.size).toBe(0);
  });
});

describe('accounts and tokens', () => {
  it('binds a token to the first account that uses it, and refuses a second', async () => {
    expect((await post({ account })).status).toBe(200);
    const bound = [...store.tokens.values()][0]?.accountId;
    expect(bound).toBe(store.accountFor(5001)?.id);

    const other = await post({ account: { ...account, login: 5002 } });
    expect(other.status).toBe(409);
    expect(err(other).error).toBe('account_mismatch');
    expect(store.accountFor(5002)).toBeUndefined();
  });

  it('merges symbolInfo across batches, so a later batch need not repeat it', async () => {
    await post({ account, symbolInfo: GOLD });
    const result = await post({ account, deals: roundTurn(1, 1) });
    expect(ok(result).accepted).toBe(2);
    expect(ok(result).tradesRebuilt).toBe(1);
  });
});

describe('idempotency', () => {
  const batch = (): IngestPayload => ({
    account,
    deals: [...roundTurn(1, 1), ...roundTurn(2, 3, -50)],
    modifications: [{ positionId: 1, time: '2026-09-22T08:10:00.000Z', sl: 2395, tp: 0 }],
    calendar: [{ eventId: 7, time: '2026-09-22T12:30:00.000Z', currency: 'USD', importance: 'high', name: 'CPI' }],
    symbolInfo: GOLD,
  });

  it('the same batch twice stores everything once and reports duplicates', async () => {
    const first = await post(batch());
    expect(ok(first)).toMatchObject({ accepted: 6, duplicates: 0, tradesRebuilt: 2 });
    const snapshot = JSON.stringify({
      deals: [...store.deals.values()].map((map) => [...map.values()]),
      trades: [...store.trades.values()].map((map) => [...map.values()]),
      mods: [...store.modifications.values()].map((map) => [...map.values()]),
      news: [...store.calendar.values()].map((map) => [...map.values()]),
    });

    const second = await post(batch());
    expect(ok(second)).toMatchObject({ accepted: 0, duplicates: 6, tradesRebuilt: 0, snapshotsWritten: 0 });
    expect(ok(second).detail).toEqual({
      deals: { accepted: 0, duplicates: 4 },
      modifications: { accepted: 0, duplicates: 1 },
      calendar: { accepted: 0, duplicates: 1 },
    });
    expect(
      JSON.stringify({
        deals: [...store.deals.values()].map((map) => [...map.values()]),
        trades: [...store.trades.values()].map((map) => [...map.values()]),
        mods: [...store.modifications.values()].map((map) => [...map.values()]),
        news: [...store.calendar.values()].map((map) => [...map.values()]),
      }),
    ).toBe(snapshot);
  });

  it('a position closed in two batches becomes a trade only when flat', async () => {
    const entry = deal({ ticket: 1, positionId: 1, volume: 1 });
    const half = deal({ ticket: 2, positionId: 1, entry: 'out', type: 'sell', volume: 0.5, price: 2405, profit: 250, time: '2026-09-22T08:10:00.000Z' });
    const rest = deal({ ticket: 3, positionId: 1, entry: 'out', type: 'sell', volume: 0.5, price: 2415, profit: 750, time: '2026-09-22T08:20:00.000Z' });
    expect(ok(await post({ account, deals: [entry, half], symbolInfo: GOLD })).tradesRebuilt).toBe(0);
    expect(ok(await post({ account, deals: [rest] })).tradesRebuilt).toBe(1);
    const trade = [...(store.trades.values().next().value?.values() ?? [])][0];
    expect(trade).toMatchObject({ volume: 1, closePrice: 2410, grossProfit: 1000 });
  });

  it('an SL change on a closed position re-assays without rebuilding a new trade', async () => {
    await post({ account, deals: roundTurn(1, 1), symbolInfo: GOLD });
    const result = await post({ account, modifications: [{ positionId: 1, time: '2026-09-22T08:15:00.000Z', sl: 2380, tp: 0 }] });
    expect(ok(result)).toMatchObject({ accepted: 1, tradesRebuilt: 1 });
    expect(ok(result).snapshotsWritten).toBeGreaterThan(0);
  });
});

describe('snapshot days', () => {
  it('run from the earliest affected day to today, never before the first trade', () => {
    const first = Date.parse('2026-09-20T09:00:00Z');
    expect(snapshotDays([first], ['2026-09-22'], NOW)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
    expect(snapshotDays([first], ['2026-09-01'], NOW)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(snapshotDays([], ['2026-09-22'], NOW)).toEqual([]);
  });

  it(`reach at most ${MAX_SNAPSHOT_DAYS} days back`, () => {
    expect(snapshotDays([Date.parse('2020-01-01T00:00:00Z')], ['2020-01-01'], NOW)).toHaveLength(MAX_SNAPSHOT_DAYS);
  });
});

describe('a whole connector session — scripts/simulate-connector.ts, in memory', () => {
  it('syncs the history, a live trade, an SL change and a heartbeat into the engine’s own numbers', async () => {
    const simulation = buildSimulation({ nowMs: NOW });
    const results: IngestResult[] = [];
    for (const step of [...simulation.history, ...simulation.live]) results.push(await post(step.payload, { limit: 1_000 }));
    expect(results.map((result) => result.status).every((status) => status === 200)).toBe(true);
    expect(results.flatMap((result) => ok(result).rejected)).toEqual([]);

    const stored = store.accountFor(50_123_456);
    expect(stored).toBeDefined();
    const { dataset } = await store.loadEngineInput(stored!.id, userId);
    expect(dataset.trades).toHaveLength(834);
    expect(dataset.eas.map((ea) => ea.magic).sort()).toEqual([1001, 1002, 1003]);
    expect(dataset.modifications).toHaveLength(17); // the demo's 16, and the live trail
    expect(dataset.calendar).toHaveLength(45);

    // The live trade: its trailed stop is a modification, not a widening.
    const live = runAccountEngine(dataset, {}, NOW).trades.find((trade) => trade.positionId === simulation.livePositionId);
    expect(live).toMatchObject({ isManual: true, slWidened: false, noStop: false });

    // The engine wrote snapshots through today and the Refinery's findings.
    const snapshots = [...(store.snapshots.get(stored!.id)?.values() ?? [])];
    expect(snapshots.at(-1)?.day).toBe('2026-09-24');
    const today = runAccountEngine(dataset, {}, NOW).karat;
    expect(snapshots.at(-1)).toMatchObject({ state: today.state, karat: today.karat, tradeCount: today.tradeCount });
    const findings = store.findings.get(stored!.id) ?? [];
    expect(findings.length).toBeGreaterThan(3);
    expect(findings.filter((finding) => finding.refineryRank !== null).map((finding) => finding.refineryRank)).toEqual([1, 2, 3]);

    // The heartbeat was the last word: balance is the demo's closing balance.
    expect(ok(results.at(-1)!).heartbeat).toBe(true);
    expect(store.accountFor(50_123_456)?.balance).toBe(27_787.1);

    // Replaying the whole session changes nothing.
    const before = JSON.stringify([...store.trades.values()].map((map) => [...map.values()]));
    for (const step of simulation.history) {
      const again = await post(step.payload, { limit: 1_000 });
      expect(ok(again).accepted).toBe(0);
    }
    expect(JSON.stringify([...store.trades.values()].map((map) => [...map.values()]))).toBe(before);
  }, 60_000);
});
