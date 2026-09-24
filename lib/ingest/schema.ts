/**
 * The body of `POST /api/ingest`, exactly as CLAUDE.md §12 defines it,
 * validated with Zod. Pure and browser-safe.
 *
 * Two levels, on purpose:
 *
 * - the **envelope** (account, modifications, calendar, symbolInfo, and that
 *   `deals` is an array of at most 100) is all-or-nothing: a malformed
 *   envelope is a 400 naming the field, and nothing is stored;
 * - each **deal** is validated on its own, so one bad deal is rejected by
 *   ticket and the other ninety-nine are kept — the connector must never
 *   have to resend a whole batch to get past one odd row.
 *
 * Only `account` is required. A body with no deals, modifications or calendar
 * events is a heartbeat.
 */

import { z } from 'zod';
import type { Deal, IngestPayload, NewsEvent, SlModification, SymbolInfo } from '@/lib/engine';

/** §12: "batched, 100 deals per request". */
export const MAX_DEALS_PER_REQUEST = 100;
export const MAX_MODIFICATIONS_PER_REQUEST = 1_000;
export const MAX_CALENDAR_PER_REQUEST = 1_000;
/** A full batch of 100 deals is ~30 KB; anything past this is not a connector. */
export const MAX_BODY_BYTES = 1_000_000;

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite();

/** ISO 8601 with an offset or `Z`, normalised to UTC with a `Z`. */
const isoTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const accountSchema = z.object({
  login: id,
  server: z.string().trim().min(1).max(128),
  currency: z.string().regex(/^[A-Z]{3}$/, 'an ISO 4217 code, e.g. USD'),
  balance: finite,
  equity: finite,
  leverage: z.number().int().min(0).max(1_000_000),
});

export const dealSchema = z.object({
  ticket: id,
  positionId: id,
  time: isoTime,
  type: z.enum(['buy', 'sell']),
  entry: z.enum(['in', 'out']),
  symbol: z.string().trim().min(1).max(32),
  volume: z.number().finite().positive(),
  price: z.number().finite().positive(),
  sl: z.number().finite().min(0),
  tp: z.number().finite().min(0),
  profit: finite,
  commission: finite,
  swap: finite,
  magic: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  comment: z.string().max(255),
  spreadPoints: z.number().int().min(0).max(1_000_000),
});

export const modificationSchema = z.object({
  positionId: id,
  time: isoTime,
  sl: z.number().finite().min(0),
  tp: z.number().finite().min(0),
});

export const calendarSchema = z.object({
  eventId: id,
  time: isoTime,
  currency: z.string().regex(/^[A-Z]{3}$/, 'an ISO 4217 code, e.g. USD'),
  importance: z.enum(['low', 'medium', 'high']),
  name: z.string().trim().min(1).max(200),
});

export const symbolInfoSchema = z.object({
  contractSize: z.number().finite().positive(),
  digits: z.number().int().min(0).max(10),
});

export const envelopeSchema = z.object({
  account: accountSchema,
  deals: z
    .array(z.unknown())
    .max(MAX_DEALS_PER_REQUEST, `at most ${MAX_DEALS_PER_REQUEST} deals per request`)
    .default([]),
  modifications: z.array(modificationSchema).max(MAX_MODIFICATIONS_PER_REQUEST).default([]),
  calendar: z.array(calendarSchema).max(MAX_CALENDAR_PER_REQUEST).default([]),
  symbolInfo: z.record(z.string().min(1).max(32), symbolInfoSchema).default({}),
});

export interface RejectedDeal {
  /** The deal's ticket, or `null` when even that could not be read. */
  ticket: number | null;
  reason: string;
}

export interface ParsedIngest {
  payload: IngestPayload;
  rejected: RejectedDeal[];
  /** No deals, modifications or calendar events: a heartbeat. */
  heartbeat: boolean;
}

export interface IngestValidationIssue {
  path: string;
  message: string;
}

function describe(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

/** Validates a parsed JSON body. Never throws. */
export function parseIngestBody(
  body: unknown,
): { ok: true; value: ParsedIngest } | { ok: false; issues: IngestValidationIssue[] } {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) {
    return {
      ok: false,
      issues: envelope.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const deals: Deal[] = [];
  const rejected: RejectedDeal[] = [];
  const seen = new Set<number>();
  for (const raw of envelope.data.deals) {
    const parsed = dealSchema.safeParse(raw);
    const ticket =
      raw !== null && typeof raw === 'object' && typeof (raw as { ticket?: unknown }).ticket === 'number'
        ? (raw as { ticket: number }).ticket
        : null;
    if (!parsed.success) {
      rejected.push({ ticket, reason: parsed.error.issues.slice(0, 3).map(describe).join('; ') });
      continue;
    }
    if (seen.has(parsed.data.ticket)) {
      rejected.push({ ticket: parsed.data.ticket, reason: 'the same ticket twice in one request' });
      continue;
    }
    seen.add(parsed.data.ticket);
    deals.push(parsed.data);
  }

  const { account, modifications, calendar, symbolInfo } = envelope.data;
  const payload: IngestPayload = {
    account,
    deals,
    modifications: modifications as SlModification[],
    calendar: calendar as NewsEvent[],
    symbolInfo: symbolInfo as Record<string, SymbolInfo>,
  };
  const heartbeat = envelope.data.deals.length === 0 && modifications.length === 0 && calendar.length === 0;
  return { ok: true, value: { payload, rejected, heartbeat } };
}
