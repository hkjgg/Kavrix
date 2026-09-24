/**
 * `pnpm simulate:connector` — the Kavrix Connector without MetaTrader 5.
 *
 * Posts a realistic session to `POST /api/ingest`, exactly as the EA would:
 * the history in batches of 100 deals (with the USD calendar and symbolInfo
 * in the first), then a new deal opening a position, an SL change on it, the
 * deal that closes it, and a heartbeat. The data is the demo's 90 days of
 * XAUUSD, moved forward by whole weeks so it ends this week
 * (`lib/ingest/simulate.ts`).
 *
 *   pnpm simulate:connector --url http://localhost:3000 --token kvx_…
 *   pnpm simulate:connector --dry-run          # no server: an in-memory store
 *
 * Options (or the env vars in brackets):
 *   --url <origin>      the deployment [KAVRIX_URL], default http://localhost:3000
 *   --token <kvx_…>     a connector token from Settings [KAVRIX_TOKEN]
 *   --login <n>         the MT5 login to report, default 50123456
 *   --server <name>     the MT5 server to report, default Kavrix-Simulated
 *   --delay <ms>        pause between requests, default 250
 *   --dry-run           run the pipeline in memory instead of over HTTP
 *
 * Retries like the EA: a 429 waits for Retry-After, a 5xx or a network error
 * backs off 2 s, 4 s, 8 s, 16 s. A 4xx other than 429 stops the run — it will
 * not get better by sending it again.
 *
 * Behind an HTTPS proxy, Node's fetch needs NODE_USE_ENV_PROXY=1.
 */

import { generateConnectorToken } from '@/lib/connector/token';
import { MemoryIngestStore } from '@/lib/ingest/memoryStore';
import { handleIngest } from '@/lib/ingest/service';
import type { SimulationStep } from '@/lib/ingest/simulate';
import { buildSimulation } from '@/lib/ingest/simulate';

interface Options {
  url: string;
  token: string | null;
  login: number;
  server: string;
  delayMs: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    url: (value('url') ?? process.env.KAVRIX_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    token: value('token') ?? process.env.KAVRIX_TOKEN ?? null,
    login: Number(value('login') ?? 50_123_456),
    server: value('server') ?? 'Kavrix-Simulated',
    delayMs: Number(value('delay') ?? 250),
    dryRun: argv.includes('--dry-run'),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Sender = (step: SimulationStep) => Promise<{ status: number; body: unknown; retryAfter: number | null }>;

function httpSender(options: Options): Sender {
  return async (step) => {
    const response = await fetch(`${options.url}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
      body: JSON.stringify(step.payload),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON: shown as it came.
    }
    const retryAfter = response.headers.get('retry-after');
    return { status: response.status, body, retryAfter: retryAfter === null ? null : Number(retryAfter) };
  };
}

function memorySender(): { send: Sender; store: MemoryIngestStore } {
  const pepper = 'dry-run-pepper-'.repeat(3);
  const store = new MemoryIngestStore();
  const { token, hash } = generateConnectorToken(pepper);
  store.addToken('dry-run-user', hash);
  return {
    store,
    send: async (step) => {
      const result = await handleIngest(
        { authorization: `Bearer ${token}`, body: JSON.stringify(step.payload) },
        { store, pepper, nowMs: Date.now(), rateLimitPerMinute: 10_000 },
      );
      return { status: result.status, body: result.body, retryAfter: null };
    },
  };
}

async function sendWithRetry(send: Sender, step: SimulationStep) {
  const backoff = [2_000, 4_000, 8_000, 16_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await send(step);
      if (result.status === 429 && attempt < backoff.length) {
        const wait = (result.retryAfter ?? 5) * 1000;
        console.log(`   429 — waiting ${wait / 1000} s`);
        await sleep(wait);
        continue;
      }
      if (result.status >= 500 && attempt < backoff.length) {
        console.log(`   ${result.status} — retrying in ${backoff[attempt]! / 1000} s`);
        await sleep(backoff[attempt]!);
        continue;
      }
      return result;
    } catch (error) {
      if (attempt >= backoff.length) throw error;
      console.log(`   network error (${(error as Error).message}) — retrying in ${backoff[attempt]! / 1000} s`);
      await sleep(backoff[attempt]!);
    }
  }
}

function summary(body: unknown): string {
  if (body === null || typeof body !== 'object') return String(body).slice(0, 200);
  const record = body as Record<string, unknown>;
  if ('error' in record) return `${String(record.error)} — ${String(record.message)}`;
  const rejected = Array.isArray(record.rejected) ? record.rejected.length : 0;
  return [
    `accepted ${String(record.accepted)}`,
    `duplicates ${String(record.duplicates)}`,
    rejected > 0 ? `rejected ${rejected}` : null,
    record.heartbeat === true ? 'heartbeat' : null,
    Number(record.tradesRebuilt) > 0 ? `${String(record.tradesRebuilt)} trades rebuilt` : null,
    Number(record.snapshotsWritten) > 0 ? `${String(record.snapshotsWritten)} snapshots` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun && (options.token === null || !options.token.startsWith('kvx_'))) {
    console.error('Pass a connector token: --token kvx_… (Settings → Connector tokens), or --dry-run.');
    process.exit(2);
  }

  const simulation = buildSimulation({ nowMs: Date.now(), login: options.login, server: options.server });
  const steps = [...simulation.history, ...simulation.live];
  const memory = options.dryRun ? memorySender() : null;
  const send = memory?.send ?? httpSender(options);

  console.log('KAVRIX · CONNECTOR SIMULATOR');
  console.log(`  target     ${options.dryRun ? 'in-memory store (dry run)' : `${options.url}/api/ingest`}`);
  console.log(`  account    ${options.login} · ${options.server}`);
  console.log(`  data       the demo's 90 days of XAUUSD, moved ${simulation.shiftMs / 86_400_000} days forward — demo data under a simulated login`);
  console.log(`  requests   ${simulation.history.length} history + ${simulation.live.length} live\n`);

  for (const step of steps) {
    const result = await sendWithRetry(send, step);
    const mark = result.status === 200 ? '✓' : '✗';
    console.log(`${mark} ${String(result.status).padEnd(3)} ${step.label.padEnd(44)} ${summary(result.body)}`);
    if (result.status !== 200) {
      console.error('\nStopped: the server refused the request. Nothing after it was sent.');
      process.exit(1);
    }
    if (options.delayMs > 0 && !options.dryRun) await sleep(options.delayMs);
  }

  console.log(options.dryRun ? '\nDone. The pipeline ran in memory.' : `\nDone. Open ${options.url}/assay to see the account.`);
  if (memory !== null) {
    const account = memory.store.accountFor(options.login);
    const trades = account === undefined ? 0 : memory.store.trades.get(account.id)?.size ?? 0;
    const snapshots = account === undefined ? [] : [...(memory.store.snapshots.get(account.id)?.values() ?? [])];
    const latest = snapshots.at(-1);
    console.log(`  ${trades} trades · ${snapshots.length} daily snapshots · today ${latest?.karat === null || latest === undefined ? 'Assaying…' : `${latest.karat.toFixed(1)}K · ${latest.tier}`}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
