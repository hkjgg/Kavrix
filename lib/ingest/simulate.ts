/**
 * A realistic connector session, as a list of `POST /api/ingest` bodies —
 * what `scripts/simulate-connector.ts` sends, and what the pipeline test
 * replays in memory.
 *
 * The data is the demo account's (lib/demo/generate.ts): 90 days of XAUUSD,
 * manual and three EAs, with the USD calendar — deals exactly as MT5 records
 * them. It is moved forward by **whole weeks** so it ends in the week before
 * `nowMs`: weekdays, sessions and hours stay what they were, and the rolling
 * 30-day window has something in it.
 *
 * The session:
 * 1. history, oldest first, 100 deals a request (§12) — the first request
 *    also carries the calendar and `symbolInfo`;
 * 2. a new deal: the last manual trade opens (its `in` deal);
 * 3. an SL change on that open position, trailed halfway to entry;
 * 4. the position closes (its `out` deal) — the new trade;
 * 5. a heartbeat: account only.
 *
 * Posted into a real account this is demo data under a real login; the
 * simulator says so when it runs. It exists to exercise the pipeline without
 * MT5, not to be anybody's history.
 */

import type { Account, Deal, IngestPayload, SlModification } from '@/lib/engine';
import { DEMO_END_MS, generateDemoData } from '@/lib/demo/generate';

const WEEK_MS = 7 * 86_400_000;

export interface SimulationStep {
  label: string;
  payload: IngestPayload;
}

export interface Simulation {
  /** Milliseconds every timestamp was moved forward by — a whole number of weeks. */
  shiftMs: number;
  /** The session's "now" for the history: the demo's end, shifted. */
  endMs: number;
  history: SimulationStep[];
  live: SimulationStep[];
  /** The position the live steps open, modify and close. */
  livePositionId: number;
}

export interface SimulationOptions {
  nowMs: number;
  login?: number;
  server?: string;
  batchSize?: number;
}

function shift(iso: string, by: number): string {
  return new Date(Date.parse(iso) + by).toISOString();
}

export function buildSimulation({
  nowMs,
  login = 50_123_456,
  server = 'Kavrix-Simulated',
  batchSize = 100,
}: SimulationOptions): Simulation {
  const data = generateDemoData();
  const shiftMs = Math.floor((nowMs - DEMO_END_MS) / WEEK_MS) * WEEK_MS;

  const deals: Deal[] = data.deals.map((deal) => ({ ...deal, time: shift(deal.time, shiftMs) }));
  const modifications: SlModification[] = data.modifications.map((modification) => ({
    ...modification,
    time: shift(modification.time, shiftMs),
  }));
  const calendar = data.calendar.map((event) => ({ ...event, time: shift(event.time, shiftMs) }));

  // The live position: the last manual trade that had a stop, lasted long
  // enough to trail it, and had no SL change of its own in the demo.
  const modified = new Set(data.modifications.map((modification) => modification.positionId));
  const live = [...data.trades]
    .filter(
      (trade) =>
        trade.magic === 0 && trade.initialSl !== null && trade.durationSeconds >= 120 && !modified.has(trade.positionId),
    )
    .sort((a, b) => Date.parse(b.closeTime) - Date.parse(a.closeTime))[0];
  if (live === undefined) throw new Error('the demo has no trade to replay live');
  const inDeal = deals.find((deal) => deal.ticket === live.entryDealTicket);
  const outDeal = deals.find((deal) => deal.ticket === live.exitDealTicket);
  if (inDeal === undefined || outDeal === undefined) throw new Error('the live trade has no deals');

  const finalAccount: Account = { ...data.account, login, server };
  const beforeClose: Account = {
    ...finalAccount,
    balance: Math.round((finalAccount.balance - live.netProfit) * 100) / 100,
    equity: Math.round((finalAccount.balance - live.netProfit) * 100) / 100,
  };

  const historyDeals = deals.filter((deal) => deal.positionId !== live.positionId);
  const historyMods = modifications;
  const closeBatchOf = new Map<number, number>();
  const history: SimulationStep[] = [];
  for (let index = 0; index * batchSize < historyDeals.length; index += 1) {
    const batch = historyDeals.slice(index * batchSize, (index + 1) * batchSize);
    for (const deal of batch) if (deal.entry === 'out') closeBatchOf.set(deal.positionId, index);
    history.push({
      label: `history ${index + 1}`,
      payload: {
        account: beforeClose,
        deals: batch,
        modifications: [],
        calendar: index === 0 ? calendar : [],
        symbolInfo: index === 0 ? data.symbolInfo : {},
      },
    });
  }
  // A modification rides with the batch that closes its position.
  for (const modification of historyMods) {
    const step = history[closeBatchOf.get(modification.positionId) ?? history.length - 1];
    step?.payload.modifications.push(modification);
  }
  const total = history.length;
  for (const [index, step] of history.entries()) step.label = `history ${index + 1}/${total}`;

  const openMs = Date.parse(inDeal.time);
  const closeMs = Date.parse(outDeal.time);
  const trailAt = new Date(Math.floor((openMs + (closeMs - openMs) / 2) / 1000) * 1000).toISOString();
  const trailedSl = Math.round(((inDeal.sl + inDeal.price) / 2) * 100) / 100;

  return {
    shiftMs,
    endMs: DEMO_END_MS + shiftMs,
    livePositionId: live.positionId,
    history,
    live: [
      {
        label: `new deal · #${inDeal.ticket} opens position ${live.positionId}`,
        payload: { account: beforeClose, deals: [inDeal], modifications: [], calendar: [], symbolInfo: {} },
      },
      {
        label: `SL change · position ${live.positionId} → ${trailedSl}`,
        payload: {
          account: beforeClose,
          deals: [],
          modifications: [{ positionId: live.positionId, time: trailAt, sl: trailedSl, tp: inDeal.tp }],
          calendar: [],
          symbolInfo: {},
        },
      },
      {
        label: `new deal · #${outDeal.ticket} closes position ${live.positionId}`,
        payload: { account: finalAccount, deals: [outDeal], modifications: [], calendar: [], symbolInfo: {} },
      },
      {
        label: 'heartbeat',
        payload: { account: finalAccount, deals: [], modifications: [], calendar: [], symbolInfo: {} },
      },
    ],
  };
}
