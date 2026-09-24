/**
 * Every surface's view, built from one account's data — the demo's or a real
 * trader's. The demo memoises these for the life of the process (its data
 * never changes); a real account builds them per request from what the
 * ingest API stored. Either way the numbers are `runEngine`'s and nothing
 * else's (CLAUDE.md §2, §16): this module only gathers, joins and lays out.
 */

import { buildConstellationView } from '@/components/constellation/constellation';
import type { ConstellationView } from '@/components/constellation/constellation';
import type { DossierSources } from '@/components/dossier/dossier';
import { buildVaultView } from '@/components/vault/vault';
import type { VaultView } from '@/components/vault/vault';
import { buildWrappedView } from '@/components/wrapped/wrapped';
import type { WrappedView } from '@/components/wrapped/wrapped';
import type { MinuteBars } from '@/lib/demo/candles';
import type {
  Account,
  AssayResult,
  DayStory,
  Ea,
  EngineSettings,
  EnrichedTrade,
  MonthKey,
  NewsEvent,
  ReplayDay,
  SlModification,
  SymbolInfo,
  Trade,
  WrappedResult,
} from '@/lib/engine';
import {
  SESSIONS,
  buildWrapped,
  computeReplay,
  dayStory,
  isMonthComplete,
  monthAsOf,
  runEngine,
  tierFor,
  worstTiltEpisode,
} from '@/lib/engine';
import { entryVolatilities } from '@/lib/engine/similar';
import { buildLedgerRows } from '@/lib/ledger/rows';
import type { LedgerRow } from '@/lib/ledger/types';
import type { SurfaceRoutes } from '@/lib/routes';
import { DEMO_ROUTES } from '@/lib/routes';

/** Everything the engine reads for one account. */
export interface AccountDataset {
  account: Account;
  trades: readonly Trade[];
  modifications: readonly SlModification[];
  calendar: readonly NewsEvent[];
  eas: readonly Ea[];
  symbolInfo: Record<string, SymbolInfo>;
}

export function runAccountEngine(
  data: AccountDataset,
  settings: Partial<EngineSettings>,
  asOf: number,
): AssayResult {
  return runEngine(
    {
      account: data.account,
      trades: data.trades,
      modifications: data.modifications,
      calendar: data.calendar,
      eas: data.eas,
      symbolInfo: data.symbolInfo,
    },
    settings,
    asOf,
  );
}

/** The price decimals the Dossier prints with: the most common symbol's, else 2. */
export function accountDigits(data: AccountDataset): number {
  const counts = new Map<string, number>();
  for (const trade of data.trades) counts.set(trade.symbol, (counts.get(trade.symbol) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return (top === undefined ? undefined : data.symbolInfo[top[0]]?.digits) ?? 2;
}

/* -------------------------------------------------------------------------
 * The Ledger
 * ---------------------------------------------------------------------- */

export interface LedgerSourceOption {
  /** `manual` or the magic number. */
  value: string;
  label: string;
}

export interface LedgerContext {
  /** The engine's "now". Periods end here. */
  asOfMs: number;
  currency: string;
  riskLimitPercent: number;
  rollingWindowDays: number;
  sources: LedgerSourceOption[];
  /** Whether any trade opened outside every session — the filter offers it only then. */
  hasOffSession: boolean;
}

export interface LedgerData {
  rows: LedgerRow[];
  context: LedgerContext;
}

/**
 * The engine's own trades as Ledger rows, with the deal tickets joined back
 * on from the positions, so the ticket search finds what a trader would type
 * from MT5.
 */
export function buildLedger(assay: AssayResult, data: AccountDataset): LedgerData {
  const eaNames = new Map(assay.constellation.eas.map((ea) => [ea.magic, ea.name]));
  for (const ea of data.eas) if (!eaNames.has(ea.magic)) eaNames.set(ea.magic, ea.name);
  const tickets = new Map(
    data.trades.map((trade) => [trade.id, { entry: trade.entryDealTicket, exit: trade.exitDealTicket }]),
  );

  const rows = buildLedgerRows(assay.trades, { settings: assay.settings, eaNames, tickets });
  const magics = [...new Set(rows.filter((row) => row.magic !== 0).map((row) => row.magic))].sort((a, b) => a - b);

  return {
    rows,
    context: {
      asOfMs: Date.parse(assay.asOf),
      currency: assay.account.currency,
      riskLimitPercent: assay.settings.riskLimitPercent,
      rollingWindowDays: assay.settings.rollingWindowDays,
      sources: [
        { value: 'manual', label: 'Manual' },
        ...magics.map((magic) => ({ value: String(magic), label: `${eaNames.get(magic) ?? 'EA'} · ${magic}` })),
      ],
      hasOffSession: rows.some((row) => row.sessions.length === 0),
    },
  };
}

/* -------------------------------------------------------------------------
 * The Vault
 * ---------------------------------------------------------------------- */

/**
 * Every day of the history, replayed. `runEngine` replays only the scored
 * window (§6.11: "the Vault asks for any other day on demand"); the Vault
 * shelves the whole history, so it asks the engine's own `computeReplay`.
 */
export function replayAllDays(assay: AssayResult): ReplayDay[] {
  return computeReplay(assay.trades, assay.settings, { toMs: Date.parse(assay.asOf) });
}

/** Every replayed day, told as a Day Assay by the engine's `dayStory`. */
export function dayStories(
  assay: AssayResult,
  replay: readonly ReplayDay[],
  calendar: readonly NewsEvent[],
): DayStory[] {
  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of assay.trades) {
    if (!trade.isManual) continue;
    const list = byDay.get(trade.dayKey);
    if (list === undefined) byDay.set(trade.dayKey, [trade]);
    else list.push(trade);
  }
  return replay.map((day) =>
    dayStory({
      day,
      trades: byDay.get(day.date) ?? [],
      calendar,
      settings: assay.settings,
      currency: assay.account.currency,
    }),
  );
}

export function buildVault(
  assay: AssayResult,
  replay: readonly ReplayDay[],
  stories: readonly DayStory[],
): VaultView {
  const firstOpen = assay.trades.reduce((earliest, trade) => Math.min(earliest, trade.openTimeMs), Date.parse(assay.asOf));
  const worst = worstTiltEpisode([...replay]);
  return buildVaultView({
    calendarDays: assay.stats.calendarDays,
    stories: [...stories],
    firstDate: new Date(firstOpen).toISOString().slice(0, 10),
    lastDate: assay.asOf.slice(0, 10),
    currency: assay.account.currency,
    worst: worst === null ? null : { date: worst.date, start: worst.episode.start },
    tierOf: (karat) => tierFor(karat).label,
    sessions: SESSIONS,
  });
}

/* -------------------------------------------------------------------------
 * The Dossier and the Constellation
 * ---------------------------------------------------------------------- */

export function buildDossierSources(
  assay: AssayResult,
  data: AccountDataset,
  rows: readonly LedgerRow[],
  options: { bars: MinuteBars | null; digits: number; routes?: SurfaceRoutes },
): DossierSources {
  return {
    assay,
    rows,
    rawTrades: new Map(data.trades.map((trade) => [trade.id, trade])),
    modifications: data.modifications,
    calendar: data.calendar,
    volatilities: entryVolatilities(assay.trades, assay.settings.similarVolatilityLookback),
    bars: options.bars,
    digits: options.digits,
    routes: options.routes ?? DEMO_ROUTES,
  };
}

export function buildConstellation(assay: AssayResult, routes: SurfaceRoutes = DEMO_ROUTES): ConstellationView {
  return buildConstellationView({
    constellation: assay.constellation,
    settings: assay.settings,
    currency: assay.account.currency,
    routes,
  });
}

/* -------------------------------------------------------------------------
 * Wrapped
 * ---------------------------------------------------------------------- */

/**
 * One month's Wrapped, assayed the way the month stood: `runEngine` as of the
 * month's last millisecond — or of the data, for the month still running.
 */
export function wrappedForMonth(
  month: MonthKey,
  data: AccountDataset,
  settings: Partial<EngineSettings>,
  asOfMs: number,
  demo: boolean,
): WrappedResult {
  const result = runAccountEngine(data, settings, monthAsOf(month, asOfMs));
  return buildWrapped({ month, result, calendar: data.calendar, demo });
}

export function wrappedView(
  wrapped: WrappedResult,
  months: readonly MonthKey[],
  asOfMs: number,
  currency: string,
  routes: SurfaceRoutes = DEMO_ROUTES,
): WrappedView {
  return buildWrappedView({
    wrapped,
    months: months.map((entry) => ({ month: entry, partial: !isMonthComplete(entry, asOfMs) })),
    currency,
    sessions: SESSIONS,
    routes,
  });
}
