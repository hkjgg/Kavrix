/**
 * Row Level Security, on a real Postgres (PGlite) running the migrations that
 * ship. Two traders, each with an account and a row in every table; every
 * test asks what one of them — or a visitor, or the service role — can see
 * and change.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import type { TestDb } from './testdb';
import { createTestDb } from './testdb';

const ACCOUNT_TABLES = [
  'deals',
  'sl_modifications',
  'news_events',
  'eas',
  'trades',
  'karat_snapshots',
  'findings',
  'certificates',
] as const;

let t: TestDb;
let alice: string;
let bob: string;
let aliceAccount: string;
let bobAccount: string;

async function seedAccount(tx: Transaction, userId: string, login: number, serial: string): Promise<string> {
  const account = await tx.query<{ id: string }>(
    `insert into public.accounts (user_id, login, server, currency, balance, equity, leverage)
     values ($1, $2, 'Broker-Live', 'USD', 10000, 10000, 100) returning id`,
    [userId, login],
  );
  const id = account.rows[0]!.id;
  await tx.query(
    `insert into public.connector_tokens (user_id, account_id, name, prefix, token_hash)
     values ($1, $2, 'Laptop', 'kvx_abcdefgh', $3)`,
    [userId, id, (login % 10).toString(16).repeat(64)],
  );
  await tx.query(
    `insert into public.deals (account_id, ticket, position_id, time, type, entry, symbol, volume, price)
     values ($1, 1, 1, now(), 'buy', 'in', 'XAUUSD', 0.1, 2400)`,
    [id],
  );
  await tx.query(`insert into public.sl_modifications (account_id, position_id, time, sl) values ($1, 1, now(), 2390)`, [id]);
  await tx.query(
    `insert into public.news_events (account_id, event_id, time, currency, importance, name)
     values ($1, 7, now(), 'USD', 'high', 'Nonfarm Payrolls')`,
    [id],
  );
  await tx.query(`insert into public.eas (account_id, magic, name) values ($1, 1001, 'EA 1001')`, [id]);
  await tx.query(
    `insert into public.trades (account_id, position_id, id, symbol, direction, volume, open_time, close_time,
       open_price, close_price, gross_profit, commission, swap, net_profit, mfe_price, mae_price,
       spread_points_at_entry, spread_points_at_exit, contract_size, duration_seconds, entry_deal_ticket, exit_deal_ticket)
     values ($1, 1, 'T-1', 'XAUUSD', 'buy', 0.1, now(), now(), 2400, 2410, 100, -0.7, 0, 99.3, 2410, 2400, 20, 20, 100, 60, 1, 2)`,
    [id],
  );
  await tx.query(
    `insert into public.karat_snapshots (account_id, day, as_of, state, trade_count, pillars)
     values ($1, current_date, now(), 'assaying', 1, '[]')`,
    [id],
  );
  await tx.query(
    `insert into public.findings (account_id, finding_key, kind, severity, headline, tentative, finding, as_of)
     values ($1, 'revenge-cost', 'cost', 'warning', 'x', false, '{}', now())`,
    [id],
  );
  await tx.query(
    `insert into public.certificates (serial, account_id, month, karat, tier, trade_count, trading_days, period)
     values ($1, $2, '2026-08', 21.9, '18K · Solid', 60, 18, '1–31 Aug 2026')`,
    [serial, id],
  );
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice@example.com');
  bob = await t.createUser('bob@example.com');
  await t.db.transaction(async (tx) => {
    aliceAccount = await seedAccount(tx, alice, 5001, '111111');
    bobAccount = await seedAccount(tx, bob, 5002, '222222');
  });
}, 30_000);

afterAll(async () => {
  await t.close();
});

async function count(tx: Transaction, table: string): Promise<number> {
  const result = await tx.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
  return result.rows[0]!.n;
}

describe('new users', () => {
  it('get a profile and default settings from the auth trigger', async () => {
    const settings = await t.db.query<{ risk_limit_percent: number; daily_max_trades: number; news_window_minutes: number; rollover_window_minutes: number }>(
      'select * from public.settings where user_id = $1',
      [alice],
    );
    expect(settings.rows[0]).toMatchObject({
      risk_limit_percent: 1,
      daily_max_trades: 5,
      news_window_minutes: 15,
      rollover_window_minutes: 15,
    });
    const profiles = await t.db.query('select * from public.profiles where id = $1', [alice]);
    expect(profiles.rows).toHaveLength(1);
  });
});

describe('RLS: a trader sees only their own rows', () => {
  it.each([...ACCOUNT_TABLES, 'accounts', 'connector_tokens', 'settings', 'profiles'])('%s', async (table) => {
    const seen = await t.as('authenticated', alice, async (tx) => count(tx, table));
    expect(seen).toBe(1);
  });

  it('never returns another trader’s account id from any table', async () => {
    await t.as('authenticated', alice, async (tx) => {
      for (const table of ACCOUNT_TABLES) {
        const rows = await tx.query<{ account_id: string }>(`select account_id from public.${table}`);
        expect(rows.rows.every((row) => row.account_id === aliceAccount), table).toBe(true);
      }
      const bobs = await tx.query(`select * from public.deals where account_id = $1`, [bobAccount]);
      expect(bobs.rows).toHaveLength(0);
    });
  });

  it('cannot write into another trader’s account', async () => {
    await expect(
      t.as('authenticated', alice, (tx) =>
        tx.query(
          `insert into public.deals (account_id, ticket, position_id, time, type, entry, symbol, volume, price)
           values ($1, 99, 99, now(), 'buy', 'in', 'XAUUSD', 0.1, 2400)`,
          [bobAccount],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot update or delete another trader’s rows (0 rows touched)', async () => {
    await t.as('authenticated', alice, async (tx) => {
      const updated = await tx.query(`update public.trades set net_profit = 0 where account_id = $1`, [bobAccount]);
      expect(updated.affectedRows).toBe(0);
      const revoked = await tx.query(`update public.connector_tokens set revoked_at = now() where user_id = $1`, [bob]);
      expect(revoked.affectedRows).toBe(0);
      const deleted = await tx.query(`delete from public.accounts where id = $1`, [bobAccount]);
      expect(deleted.affectedRows).toBe(0);
    });
    const still = await t.db.query('select * from public.accounts where id = $1', [bobAccount]);
    expect(still.rows).toHaveLength(1);
  });

  it('cannot change someone else’s thresholds', async () => {
    await t.as('authenticated', alice, async (tx) => {
      const result = await tx.query(`update public.settings set daily_max_trades = 99 where user_id = $1`, [bob]);
      expect(result.affectedRows).toBe(0);
    });
  });

  it('bob sees his rows and not alice’s', async () => {
    await t.as('authenticated', bob, async (tx) => {
      const accounts = await tx.query<{ id: string }>('select id from public.accounts');
      expect(accounts.rows.map((row) => row.id)).toEqual([bobAccount]);
      const tokens = await tx.query<{ user_id: string }>('select user_id from public.connector_tokens');
      expect(tokens.rows.map((row) => row.user_id)).toEqual([bob]);
    });
  });
});

describe('RLS: what the owner may and may not do', () => {
  it('may revoke and rename their own token, but never change its hash', async () => {
    await t.as('authenticated', alice, async (tx) => {
      const revoked = await tx.query(`update public.connector_tokens set revoked_at = now(), name = 'Old laptop'`);
      expect(revoked.affectedRows).toBe(1);
      await expect(tx.query(`update public.connector_tokens set token_hash = repeat('0', 64)`)).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it('may create a token only for themselves', async () => {
    await t.as('authenticated', alice, async (tx) => {
      await tx.query(
        `insert into public.connector_tokens (user_id, name, prefix, token_hash) values ($1, 'Desk', 'kvx_desk', repeat('a', 64))`,
        [alice],
      );
    });
    await expect(
      t.as('authenticated', alice, (tx) =>
        tx.query(
          `insert into public.connector_tokens (user_id, name, prefix, token_hash) values ($1, 'Sneaky', 'kvx_snek', repeat('b', 64))`,
          [bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('may not create or edit an account — those facts come from the connector', async () => {
    await expect(
      t.as('authenticated', alice, (tx) =>
        tx.query(`update public.accounts set balance = 1e9`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('may update their own thresholds, within the checks', async () => {
    await t.as('authenticated', alice, async (tx) => {
      const ok = await tx.query(`update public.settings set risk_limit_percent = 0.5`);
      expect(ok.affectedRows).toBe(1);
    });
    await expect(
      t.as('authenticated', alice, (tx) => tx.query(`update public.settings set daily_max_trades = 0`)),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('visitors and the service role', () => {
  it('a visitor who is not signed in reads nothing', async () => {
    for (const table of [...ACCOUNT_TABLES, 'accounts', 'connector_tokens', 'settings', 'profiles']) {
      await expect(t.as('anon', null, (tx) => count(tx, table)), table).rejects.toThrow(/permission denied/);
    }
  });

  it('the rate-limit table is the service role’s alone', async () => {
    await expect(
      t.as('authenticated', alice, (tx) => tx.query('select * from public.ingest_rate_limits')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.as('authenticated', alice, (tx) => tx.query(`select public.ingest_rate_hit(gen_random_uuid(), 60)`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('the service role sees every account (it is what the ingest API writes with)', async () => {
    const seen = await t.as('service_role', null, (tx) => count(tx, 'accounts'));
    expect(seen).toBe(2);
  });
});

describe('verify_certificate', () => {
  it('lets anyone look a serial up, and returns only what the certificate prints', async () => {
    const result = await t.as('anon', null, (tx) =>
      tx.query<Record<string, unknown>>(`select * from public.verify_certificate('111111')`),
    );
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      ['issued_at', 'karat', 'month', 'partial', 'period', 'serial', 'tier', 'trade_count', 'trading_days'].sort(),
    );
    expect(result.rows[0]).not.toHaveProperty('account_id');
  });

  it('returns nothing for an unknown serial', async () => {
    const result = await t.as('anon', null, (tx) => tx.query(`select * from public.verify_certificate('999999')`));
    expect(result.rows).toHaveLength(0);
  });
});

describe('ingest_rate_hit', () => {
  it('counts requests in the current window, atomically, per token', async () => {
    const tokens = await t.db.query<{ id: string }>('select id from public.connector_tokens order by created_at limit 2');
    const [first, second] = tokens.rows.map((row) => row.id);
    const hits: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await t.as('service_role', null, (tx) =>
        tx.query<{ n: number }>('select public.ingest_rate_hit($1, 60) as n', [first]),
      );
      hits.push(result.rows[0]!.n);
    }
    expect(hits).toEqual([1, 2, 3]);
    const other = await t.as('service_role', null, (tx) =>
      tx.query<{ n: number }>('select public.ingest_rate_hit($1, 60) as n', [second]),
    );
    expect(other.rows[0]!.n).toBe(1);
  });
});

describe('idempotency lives in the keys', () => {
  it('a deal ticket, a modification and a calendar event are stored once', async () => {
    await t.as('service_role', null, async (tx) => {
      for (let pass = 0; pass < 2; pass += 1) {
        await tx.query(
          `insert into public.deals (account_id, ticket, position_id, time, type, entry, symbol, volume, price)
           values ($1, 1, 1, now(), 'buy', 'in', 'XAUUSD', 0.1, 2400) on conflict do nothing`,
          [aliceAccount],
        );
        await tx.query(
          `insert into public.sl_modifications (account_id, position_id, time, sl)
           values ($1, 5, '2026-09-01T10:00:00Z', 2390) on conflict do nothing`,
          [aliceAccount],
        );
        await tx.query(
          `insert into public.news_events (account_id, event_id, time, currency, importance, name)
           values ($1, 7, now(), 'USD', 'high', 'NFP') on conflict do nothing`,
          [aliceAccount],
        );
      }
      const deals = await tx.query(`select * from public.deals where account_id = $1 and ticket = 1`, [aliceAccount]);
      const mods = await tx.query(`select * from public.sl_modifications where account_id = $1 and position_id = 5`, [aliceAccount]);
      const news = await tx.query(`select * from public.news_events where account_id = $1 and event_id = 7`, [aliceAccount]);
      expect([deals.rows.length, mods.rows.length, news.rows.length]).toEqual([1, 1, 1]);
    });
  });

  it('two traders may hold the same ticket numbers (different brokers)', async () => {
    const result = await t.db.query('select * from public.deals where ticket = 1');
    expect(result.rows).toHaveLength(2);
  });
});
