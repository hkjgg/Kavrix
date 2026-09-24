-- Kavrix · Stage 8 — the database (CLAUDE.md §13).
--
-- Every table has Row Level Security. The rule is one sentence: a user reads
-- and writes only their own rows, and a row belongs to a user through the MT5
-- account it came from. The ingest API writes with the service role (which
-- bypasses RLS) after it has resolved the account from a connector token; the
-- app reads with the user's own session, so RLS is what keeps one trader out
-- of another's ledger.
--
-- Money, prices and lots are `double precision`: MT5 hands them over as
-- doubles, the engine computes in doubles, and a numeric here would only be
-- converted back on every read.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per Kavrix user, created with the auth user.';

-- ---------------------------------------------------------------------------
-- Settings — the discipline thresholds of §6.1, per user
-- ---------------------------------------------------------------------------

create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  risk_limit_percent double precision not null default 1
    check (risk_limit_percent > 0 and risk_limit_percent <= 10),
  daily_max_trades integer not null default 5
    check (daily_max_trades between 1 and 100),
  news_window_minutes integer not null default 15
    check (news_window_minutes between 0 and 240),
  rollover_window_minutes integer not null default 15
    check (rollover_window_minutes between 0 and 240),
  -- The broker's server clock against UTC. Rollover is broker midnight (§5),
  -- and the §12 payload does not carry the offset, so the trader enters it;
  -- the connector prints it in the Experts log when it starts.
  server_utc_offset_hours double precision not null default 0
    check (server_utc_offset_hours between -12 and 14),
  updated_at timestamptz not null default now()
);

comment on table public.settings is 'Discipline thresholds (CLAUDE.md §6.1). Defaults are the spec''s.';

-- ---------------------------------------------------------------------------
-- New users get a profile and default settings
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  insert into public.settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- MT5 accounts
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  login bigint not null check (login > 0),
  server text not null check (char_length(server) between 1 and 128),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  balance double precision not null default 0,
  equity double precision not null default 0,
  leverage integer not null default 0,
  -- `{ "XAUUSD": { "contractSize": 100, "digits": 2 } }`, merged on every
  -- ingest. Contract size is read from the broker, never hardcoded (§5).
  symbol_info jsonb not null default '{}'::jsonb,
  last_heartbeat_at timestamptz,
  last_ingest_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, login, server)
);

create index accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- Connector tokens — hashed at rest (§2)
-- ---------------------------------------------------------------------------

create table public.connector_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Bound on first use: one token, one MT5 account.
  account_id uuid references public.accounts (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  -- The first characters of the token, shown in Settings so a trader can
  -- tell two tokens apart. Never enough to use.
  prefix text not null check (char_length(prefix) between 4 and 16),
  -- HMAC-SHA-256 of the token under a server-side pepper, hex. The token
  -- itself is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index connector_tokens_user_idx on public.connector_tokens (user_id);

-- ---------------------------------------------------------------------------
-- What the connector sends (§12)
-- ---------------------------------------------------------------------------

create table public.deals (
  account_id uuid not null references public.accounts (id) on delete cascade,
  ticket bigint not null check (ticket > 0),
  position_id bigint not null check (position_id > 0),
  time timestamptz not null,
  type text not null check (type in ('buy', 'sell')),
  entry text not null check (entry in ('in', 'out')),
  symbol text not null,
  volume double precision not null check (volume > 0),
  price double precision not null check (price > 0),
  sl double precision not null default 0 check (sl >= 0),
  tp double precision not null default 0 check (tp >= 0),
  profit double precision not null default 0,
  commission double precision not null default 0,
  swap double precision not null default 0,
  magic bigint not null default 0 check (magic >= 0),
  comment text not null default '',
  spread_points integer not null default 0 check (spread_points >= 0),
  received_at timestamptz not null default now(),
  primary key (account_id, ticket)
);

create index deals_position_idx on public.deals (account_id, position_id);

create table public.sl_modifications (
  account_id uuid not null references public.accounts (id) on delete cascade,
  position_id bigint not null check (position_id > 0),
  time timestamptz not null,
  sl double precision not null default 0 check (sl >= 0),
  tp double precision not null default 0 check (tp >= 0),
  received_at timestamptz not null default now(),
  primary key (account_id, position_id, time)
);

-- Per account, not global: the calendar arrives through a user's own token,
-- and one trader's connector must never be able to write another's news.
create table public.news_events (
  account_id uuid not null references public.accounts (id) on delete cascade,
  event_id bigint not null,
  time timestamptz not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  importance text not null check (importance in ('low', 'medium', 'high')),
  name text not null,
  primary key (account_id, event_id)
);

create index news_events_time_idx on public.news_events (account_id, time);

-- ---------------------------------------------------------------------------
-- Derived by the ingest pipeline
-- ---------------------------------------------------------------------------

-- EAs, by magic number (§7). Created on first sight of a magic number; the
-- name and the backtest baseline are the trader's to edit.
create table public.eas (
  account_id uuid not null references public.accounts (id) on delete cascade,
  magic bigint not null check (magic > 0),
  name text not null check (char_length(name) between 1 and 60),
  baseline_expectancy_r double precision,
  baseline_std_dev_r double precision check (baseline_std_dev_r is null or baseline_std_dev_r > 0),
  created_at timestamptz not null default now(),
  primary key (account_id, magic)
);

-- Closed positions, rebuilt from their deals after every batch (§5). Equity
-- at entry is not stored: it is the balance walked back through every later
-- close, which changes as history arrives, so it is derived on read.
create table public.trades (
  account_id uuid not null references public.accounts (id) on delete cascade,
  position_id bigint not null,
  id text not null,
  symbol text not null,
  magic bigint not null default 0,
  comment text not null default '',
  direction text not null check (direction in ('buy', 'sell')),
  volume double precision not null,
  open_time timestamptz not null,
  close_time timestamptz not null,
  open_price double precision not null,
  close_price double precision not null,
  initial_sl double precision,
  initial_tp double precision,
  final_sl double precision,
  final_tp double precision,
  gross_profit double precision not null,
  commission double precision not null,
  swap double precision not null,
  net_profit double precision not null,
  mfe_price double precision not null,
  mae_price double precision not null,
  spread_points_at_entry integer not null,
  spread_points_at_exit integer not null,
  contract_size double precision not null check (contract_size > 0),
  duration_seconds integer not null,
  entry_deal_ticket bigint not null,
  exit_deal_ticket bigint not null,
  rebuilt_at timestamptz not null default now(),
  primary key (account_id, position_id)
);

create index trades_close_idx on public.trades (account_id, close_time);

-- The Karat of each day, as of that day's end (§13). The app computes the
-- live Assay from the trades; snapshots are the record the engine wrote after
-- each batch, and what the AI layer (Stage 9) will cache against.
create table public.karat_snapshots (
  account_id uuid not null references public.accounts (id) on delete cascade,
  day date not null,
  as_of timestamptz not null,
  state text not null check (state in ('scored', 'assaying')),
  karat double precision,
  points double precision,
  tier text,
  trade_count integer not null,
  pillars jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (account_id, day)
);

-- The engine's findings (§6.6, Refinery items), replaced after every batch.
create table public.findings (
  account_id uuid not null references public.accounts (id) on delete cascade,
  finding_key text not null,
  -- 1–3 for the Refinery's top three, null for the rest.
  refinery_rank integer check (refinery_rank between 1 and 3),
  kind text not null,
  severity text not null,
  headline text not null,
  tentative boolean not null,
  finding jsonb not null,
  as_of timestamptz not null,
  computed_at timestamptz not null default now(),
  primary key (account_id, finding_key)
);

-- Assay Certificates (§8.9). The serial is a hash of account and month, so it
-- prints the same everywhere; this table is where it is unique.
create table public.certificates (
  serial text primary key check (serial ~ '^[0-9]{6}$'),
  account_id uuid not null references public.accounts (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  karat double precision not null,
  tier text not null,
  trade_count integer not null,
  trading_days integer not null,
  period text not null,
  partial boolean not null default false,
  issued_at timestamptz not null default now(),
  unique (account_id, month)
);

-- ---------------------------------------------------------------------------
-- Rate limiting — Postgres-backed, because a serverless function has no
-- memory between requests
-- ---------------------------------------------------------------------------

create table public.ingest_rate_limits (
  token_id uuid not null references public.connector_tokens (id) on delete cascade,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (token_id, window_start)
);

-- Counts one request against a token's current fixed window and returns the
-- count so far (this request included). Atomic: two requests at once both
-- increment. Windows older than an hour are swept as it goes.
create function public.ingest_rate_hit(p_token_id uuid, p_window_seconds integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count integer;
begin
  insert into public.ingest_rate_limits as l (token_id, window_start, count)
    values (p_token_id, v_window, 1)
    on conflict (token_id, window_start) do update set count = l.count + 1
    returning l.count into v_count;

  delete from public.ingest_rate_limits
    where token_id = p_token_id and window_start < v_window - interval '1 hour';

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public certificate lookup (`/verify/[serial]`)
-- ---------------------------------------------------------------------------

-- A shared certificate is a public surface, so anyone may look one up — but
-- only what the certificate itself prints: Karat, tier, period and trade
-- count. Never the account, never money (§17 Stage 7).
create function public.verify_certificate(p_serial text)
returns table (
  serial text,
  month text,
  karat double precision,
  tier text,
  trade_count integer,
  trading_days integer,
  period text,
  partial boolean,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.serial, c.month, c.karat, c.tier, c.trade_count, c.trading_days,
         c.period, c.partial, c.issued_at
  from public.certificates c
  where c.serial = p_serial;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.accounts enable row level security;
alter table public.connector_tokens enable row level security;
alter table public.deals enable row level security;
alter table public.sl_modifications enable row level security;
alter table public.news_events enable row level security;
alter table public.eas enable row level security;
alter table public.trades enable row level security;
alter table public.karat_snapshots enable row level security;
alter table public.findings enable row level security;
alter table public.certificates enable row level security;
alter table public.ingest_rate_limits enable row level security;

-- `(select auth.uid())` is evaluated once per statement, not once per row.

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own settings" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own accounts: read" on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own accounts: unlink" on public.accounts
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own tokens: read" on public.connector_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own tokens: create" on public.connector_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own tokens: rename or revoke" on public.connector_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Everything below belongs to a user through its account.
create policy "own account rows" on public.deals
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.sl_modifications
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.news_events
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.eas
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.trades
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.karat_snapshots
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.findings
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));
create policy "own account rows" on public.certificates
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())))
  with check (account_id in (select a.id from public.accounts a where a.user_id = (select auth.uid())));

-- `ingest_rate_limits` has no policy at all: only the service role touches it.

-- ---------------------------------------------------------------------------
-- Privileges — defence in depth under RLS
-- ---------------------------------------------------------------------------

-- Visitors who are not signed in reach nothing directly.
revoke all on
  public.profiles, public.settings, public.accounts, public.connector_tokens,
  public.deals, public.sl_modifications, public.news_events, public.eas,
  public.trades, public.karat_snapshots, public.findings, public.certificates,
  public.ingest_rate_limits
  from anon;

revoke all on public.ingest_rate_limits from authenticated;

-- A token row's hash, prefix, owner and account are fixed at creation; the
-- owner may only rename it or revoke it.
revoke update on public.connector_tokens from authenticated;
grant update (name, revoked_at) on public.connector_tokens to authenticated;

-- An account's facts come from the connector, never from the browser.
revoke insert, update on public.accounts from authenticated;

revoke execute on function public.ingest_rate_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.ingest_rate_hit(uuid, integer) to service_role;

revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated, service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
