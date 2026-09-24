/**
 * A throwaway Postgres for tests: PGlite (Postgres compiled to WebAssembly),
 * shaped like a Supabase project, with every migration in
 * `supabase/migrations/` applied in order.
 *
 * Supabase provides the `anon`, `authenticated` and `service_role` roles, an
 * `auth.users` table and `auth.uid()`; the stub below reproduces exactly the
 * parts the migrations rely on, including the default grants a Supabase
 * project gives new tables in `public`. So the migrations under test are the
 * files that ship, unmodified, and RLS is enforced by a real Postgres.
 *
 * Test-only. Nothing in the app imports it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Transaction } from '@electric-sql/pglite';

const SUPABASE_STUB = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

export type Role = 'anon' | 'authenticated' | 'service_role';

export interface TestDb {
  db: PGlite;
  /** Creates an auth user (firing the new-user trigger) and returns its id. */
  createUser(email: string): Promise<string>;
  /**
   * Runs `work` as a role — and, for `authenticated`, as a user — inside a
   * transaction, exactly as PostgREST does for a request.
   */
  as<T>(role: Role, userId: string | null, work: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));

  return {
    db,
    async createUser(email) {
      const result = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
      const id = result.rows[0]?.id;
      if (id === undefined) throw new Error('user not created');
      return id;
    },
    async as(role, userId, work) {
      return db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify(userId === null ? { role } : { sub: userId, role }),
        ]);
        return work(tx);
      });
    },
    close: () => db.close(),
  };
}
