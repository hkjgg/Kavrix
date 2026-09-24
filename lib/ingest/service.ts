/**
 * `POST /api/ingest` (CLAUDE.md §12), independent of HTTP framework and
 * database: the route hands it the `Authorization` header and the raw body,
 * and a store; it returns a status and a JSON body. Every path is covered by
 * `service.test.ts` against the in-memory store.
 *
 * The order of work:
 *
 * 1. Bearer token → HMAC hash → an active token, or 401.
 * 2. Count the request against the token's rate limit (Postgres-backed), or 429.
 * 3. Parse and validate the body (Zod); a bad envelope is a 400 that names the
 *    field, a bad deal is rejected by ticket and the rest go on.
 * 4. Resolve the account: the one the token is bound to, or — on first use —
 *    the user's account for this login and server, which the token is then
 *    bound to. A token never writes into a second account (409).
 * 5. Store deals, modifications and calendar events idempotently: the same
 *    batch twice changes nothing and reports duplicates.
 * 6. Rebuild every position the batch touched into `trades`, then run the
 *    engine and write `karat_snapshots` for the affected days and the current
 *    `findings`.
 *
 * A heartbeat (no deals, modifications or events) stops after step 4: the
 * token's `last_seen_at` and the account's balance, equity and heartbeat time
 * are updated, and nothing is recomputed.
 */

import type { Deal, EngineSettings } from '@/lib/engine';
import { computeKarat } from '@/lib/engine';
import { DAY_MS, dayKey, dayStartMs } from '@/lib/engine/time';
import { bearerToken, hashConnectorToken, isWellFormedToken } from '@/lib/connector/token';
import { runAccountEngine } from '@/lib/views/account';
import { aggregateDeals } from './aggregate';
import type { RejectedDeal } from './schema';
import { MAX_BODY_BYTES, parseIngestBody } from './schema';
import type { FindingRecord, IngestStore, SnapshotRecord } from './store';

export const RATE_LIMIT_PER_MINUTE = 60;
export const RATE_WINDOW_SECONDS = 60;
/** A first sync of years of history snapshots at most this many days back. */
export const MAX_SNAPSHOT_DAYS = 400;

export interface IngestResponseBody {
  accepted: number;
  duplicates: number;
  rejected: RejectedDeal[];
  /** The same counts, per kind of row. */
  detail: {
    deals: { accepted: number; duplicates: number };
    modifications: { accepted: number; duplicates: number };
    calendar: { accepted: number; duplicates: number };
  };
  heartbeat: boolean;
  /** Positions rebuilt into trades by this request. */
  tradesRebuilt: number;
  /** Days whose Karat snapshot this request rewrote. */
  snapshotsWritten: number;
}

export interface IngestErrorBody {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}

export interface IngestResult {
  status: number;
  body: IngestResponseBody | IngestErrorBody;
  headers?: Record<string, string>;
}

export interface IngestDeps {
  store: IngestStore;
  /** `CONNECTOR_TOKEN_PEPPER`. */
  pepper: string;
  nowMs: number;
  rateLimitPerMinute?: number;
}

function fail(status: number, error: string, message: string, extra: Partial<IngestErrorBody> = {}, headers?: Record<string, string>): IngestResult {
  return { status, body: { error, message, ...extra }, headers };
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

export async function handleIngest(
  request: { authorization: string | null; body: string },
  deps: IngestDeps,
): Promise<IngestResult> {
  const { store, pepper, nowMs } = deps;
  const limit = deps.rateLimitPerMinute ?? RATE_LIMIT_PER_MINUTE;
  const now = new Date(nowMs).toISOString();

  /* 1 — the token */
  const token = bearerToken(request.authorization);
  if (token === null || !isWellFormedToken(token)) {
    return fail(401, 'unauthorized', 'Send the connector token as `Authorization: Bearer kvx_…`.');
  }
  const record = await store.findTokenByHash(hashConnectorToken(token, pepper));
  if (record === null || record.revokedAt !== null) {
    return fail(401, 'unauthorized', 'This connector token is not valid, or was revoked. Generate a new one in Settings.');
  }

  /* 2 — the rate limit */
  const count = await store.hitRateLimit(record.id, RATE_WINDOW_SECONDS);
  if (count > limit) {
    const retryAfter = RATE_WINDOW_SECONDS - Math.floor((nowMs / 1000) % RATE_WINDOW_SECONDS);
    return fail(
      429,
      'rate_limited',
      `At most ${limit} requests a minute per token. Retry in ${retryAfter} s.`,
      {},
      { 'Retry-After': String(retryAfter) },
    );
  }

  /* 3 — the body */
  if (Buffer.byteLength(request.body, 'utf8') > MAX_BODY_BYTES) {
    return fail(413, 'too_large', `The body is over ${MAX_BODY_BYTES} bytes. Send at most 100 deals per request.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(request.body);
  } catch {
    return fail(400, 'invalid_json', 'The body is not valid JSON.');
  }
  const parsed = parseIngestBody(json);
  if (!parsed.ok) {
    return fail(400, 'invalid_body', 'The body does not match the ingest schema (CLAUDE.md §12).', { issues: parsed.issues });
  }
  const { payload, heartbeat } = parsed.value;
  const rejected = [...parsed.value.rejected];

  /* 4 — the account */
  if (record.accountId !== null) {
    const bound = await store.getAccount(record.accountId);
    if (bound !== null && (bound.login !== payload.account.login || bound.server !== payload.account.server)) {
      return fail(
        409,
        'account_mismatch',
        `This token is linked to account ${bound.login} on ${bound.server}. Generate a separate token for each MT5 account.`,
      );
    }
  }
  const account = await store.upsertAccount(record.userId, payload.account, payload.symbolInfo, now);
  if (record.accountId !== account.id) await store.bindToken(record.id, account.id);
  await store.touchToken(record.id, now);

  const detail: IngestResponseBody['detail'] = {
    deals: { accepted: 0, duplicates: 0 },
    modifications: { accepted: 0, duplicates: 0 },
    calendar: { accepted: 0, duplicates: 0 },
  };
  const respond = (tradesRebuilt: number, snapshotsWritten: number): IngestResult => ({
    status: 200,
    body: {
      accepted: detail.deals.accepted + detail.modifications.accepted + detail.calendar.accepted,
      duplicates: detail.deals.duplicates + detail.modifications.duplicates + detail.calendar.duplicates,
      rejected,
      detail,
      heartbeat,
      tradesRebuilt,
      snapshotsWritten,
    },
  });
  if (heartbeat) return respond(0, 0);

  /* 5 — store, idempotently */
  const priced: Deal[] = [];
  for (const deal of payload.deals) {
    if (account.symbolInfo[deal.symbol] === undefined) {
      rejected.push({
        ticket: deal.ticket,
        reason: `no contract size for ${deal.symbol}: send it in symbolInfo (CLAUDE.md §5)`,
      });
    } else {
      priced.push(deal);
    }
  }
  const insertedTickets = new Set(await store.insertDeals(account.id, priced));
  detail.deals = { accepted: insertedTickets.size, duplicates: priced.length - insertedTickets.size };

  const newModifications = await store.insertModifications(account.id, payload.modifications);
  detail.modifications = {
    accepted: newModifications.length,
    duplicates: payload.modifications.length - newModifications.length,
  };
  const newEvents = await store.upsertCalendar(account.id, payload.calendar);
  detail.calendar = { accepted: newEvents.length, duplicates: payload.calendar.length - newEvents.length };

  if (insertedTickets.size === 0 && newModifications.length === 0 && newEvents.length === 0) {
    return respond(0, 0);
  }

  /* 6 — rebuild, then assay */
  const positions = new Set<number>();
  for (const deal of priced) if (insertedTickets.has(deal.ticket)) positions.add(deal.positionId);
  for (const modification of newModifications) positions.add(modification.positionId);

  let tradesRebuilt = 0;
  const affectedDays: string[] = [];
  if (positions.size > 0) {
    const deals = await store.loadDealsForPositions(account.id, [...positions]);
    const { trades } = aggregateDeals(deals, account.symbolInfo);
    if (trades.length > 0) {
      await store.upsertTrades(account.id, trades);
      await store.ensureEas(account.id, [...new Set(trades.map((trade) => trade.magic).filter((magic) => magic > 0))]);
    }
    tradesRebuilt = trades.length;
    for (const trade of trades) affectedDays.push(isoDay(trade.openTime));
  }
  for (const modification of newModifications) affectedDays.push(isoDay(modification.time));
  for (const event of newEvents) affectedDays.push(isoDay(event.time));

  const snapshotsWritten = await assay(store, account.id, record.userId, affectedDays, nowMs);
  await store.markIngested(account.id, now);
  return respond(tradesRebuilt, snapshotsWritten);
}

/**
 * Runs the engine over the whole account as of now and writes what it found:
 * one Karat snapshot per day from the earliest affected day to today (a trade
 * moves every window it falls in, so every later day is affected too), and
 * the account's findings, replaced. Returns the snapshots written.
 */
async function assay(
  store: IngestStore,
  accountId: string,
  userId: string,
  affectedDays: readonly string[],
  nowMs: number,
): Promise<number> {
  const { dataset, settings } = await store.loadEngineInput(accountId, userId);
  if (dataset.trades.length === 0) return 0;
  const result = runAccountEngine(dataset, settings, nowMs);

  const snapshots = snapshotDays(result.trades.map((trade) => trade.openTimeMs), affectedDays, nowMs).map(
    (day): SnapshotRecord => {
      const endMs = Math.min(dayStartMs(Date.parse(`${day}T00:00:00.000Z`)) + DAY_MS - 1, nowMs);
      const karat = computeKarat(result.trades, result.settings as EngineSettings, endMs);
      return {
        day,
        asOf: new Date(endMs).toISOString(),
        state: karat.state,
        karat: karat.karat,
        points: karat.state === 'scored' ? karat.points : null,
        tier: karat.tier?.label ?? null,
        tradeCount: karat.tradeCount,
        pillars: karat.pillars,
      };
    },
  );
  await store.writeSnapshots(accountId, snapshots);

  const refinery = new Map(result.refinery.map((finding, index) => [finding.id, index + 1]));
  const findings = result.findings.map(
    (finding): FindingRecord => ({
      key: finding.id,
      refineryRank: refinery.get(finding.id) ?? null,
      kind: finding.kind,
      severity: finding.severity,
      headline: finding.headline,
      tentative: finding.tentative,
      finding,
      asOf: result.asOf,
    }),
  );
  await store.replaceFindings(accountId, findings);
  return snapshots.length;
}

/**
 * The UTC days to snapshot: from the earliest affected day — but never before
 * the first trade, nor more than `MAX_SNAPSHOT_DAYS` back — through today.
 */
export function snapshotDays(openTimesMs: readonly number[], affectedDays: readonly string[], nowMs: number): string[] {
  if (openTimesMs.length === 0 || affectedDays.length === 0) return [];
  const today = dayStartMs(nowMs);
  const firstTrade = dayStartMs(Math.min(...openTimesMs));
  const earliestAffected = Math.min(...affectedDays.map((day) => Date.parse(`${day}T00:00:00.000Z`)));
  const from = Math.max(firstTrade, earliestAffected, today - (MAX_SNAPSHOT_DAYS - 1) * DAY_MS);
  const days: string[] = [];
  for (let ms = from; ms <= today; ms += DAY_MS) days.push(dayKey(ms));
  return days;
}
