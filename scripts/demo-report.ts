/**
 * `pnpm demo:report` — a plain-text read-out of the demo dataset.
 *
 * This exists so the stories in CLAUDE.md §11 can be eyeballed, not just
 * asserted: it prints the same numbers `lib/demo/generate.test.ts` checks,
 * plus the context a human needs to decide whether the data looks like a real
 * trading account.
 *
 * It is a development tool. Every figure here is computed locally and
 * deliberately so — the analytics engine is Stage 2, and nothing in the demo
 * generator is allowed to pre-empt it.
 */

import { generateDemoData } from '@/lib/demo/generate';
import { isRolloverTime } from '@/lib/demo/price';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import type { NewsEvent, Trade } from '@/lib/engine/types';

const MINUTE_MS = 60_000;
const NEWS_PROXIMITY_MINUTES = 20;
const LONDON_OPEN_START_HOUR = 7;
const LONDON_OPEN_END_HOUR = 10;
const REVENGE_MINUTES = 15;
const REVENGE_LOT_MULTIPLE = 1.25;
const DAILY_TRADE_LIMIT = 5;
const DEFAULT_RISK_PERCENT = 1;

/** R-multiple, per CLAUDE.md §5. Trades without a stop use the 1% default risk. */
function rMultiple(trade: Trade): number {
  const risk =
    trade.initialSl === null
      ? (DEFAULT_RISK_PERCENT / 100) * trade.equityAtEntry
      : Math.abs(trade.openPrice - trade.initialSl) * trade.volume * trade.contractSize;
  return risk > 0 ? trade.netProfit / risk : 0;
}

function riskPercent(trade: Trade): number {
  if (trade.initialSl === null) return DEFAULT_RISK_PERCENT;
  const risk = Math.abs(trade.openPrice - trade.initialSl) * trade.volume * trade.contractSize;
  return (risk / trade.equityAtEntry) * 100;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = mean(a.slice(0, n));
  const meanB = mean(b.slice(0, n));
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

function nearHighImpactNews(trade: Trade, eventTimes: readonly number[]): boolean {
  const openMs = Date.parse(trade.openTime);
  return eventTimes.some(
    (eventMs) => Math.abs(openMs - eventMs) <= NEWS_PROXIMITY_MINUTES * MINUTE_MS,
  );
}

function isLondonOpen(trade: Trade): boolean {
  const hour = new Date(trade.openTime).getUTCHours();
  return hour >= LONDON_OPEN_START_HOUR && hour < LONDON_OPEN_END_HOUR;
}

/** Revenge, per CLAUDE.md §6.1, measured against the previous manual trade to close. */
function findRevengeTrades(manual: readonly Trade[]): Set<string> {
  const byOpen = manual.slice().sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
  const byClose = manual
    .slice()
    .sort((a, b) => Date.parse(a.closeTime) - Date.parse(b.closeTime));
  const revenge = new Set<string>();

  for (const trade of byOpen) {
    const openMs = Date.parse(trade.openTime);
    let previous: Trade | null = null;
    for (const candidate of byClose) {
      if (Date.parse(candidate.closeTime) >= openMs) break;
      previous = candidate;
    }
    if (previous === null || previous.netProfit >= 0) continue;
    const gapMinutes = (openMs - Date.parse(previous.closeTime)) / MINUTE_MS;
    if (gapMinutes <= REVENGE_MINUTES || trade.volume > REVENGE_LOT_MULTIPLE * previous.volume) {
      revenge.add(trade.id);
    }
  }
  return revenge;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function groupCount<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function line(label: string, value: string): string {
  return `  ${label.padEnd(42, ' ')}${value}`;
}

function heading(index: string, title: string): string {
  return `\n${index} — ${title.toUpperCase()}\n${'─'.repeat(64)}`;
}

function main(): void {
  const data = generateDemoData();
  const { trades, deals, modifications, calendar, account, meta } = data;

  const highImpact: NewsEvent[] = calendar.filter((event) => event.importance === 'high');
  const eventTimes = highImpact.map((event) => Date.parse(event.time));

  const manual = trades.filter((trade) => trade.magic === 0);
  const eaTrades = trades.filter((trade) => trade.magic !== 0);
  const manualLosses = manual.filter((trade) => trade.netProfit < 0);
  const manualWins = manual.filter((trade) => trade.netProfit > 0);
  const revenge = findRevengeTrades(manual);

  const lines: string[] = [];
  lines.push('KAVRIX · DEMO DATA REPORT');
  lines.push('═'.repeat(64));
  lines.push(line('Label', meta.label));
  lines.push(line('Seed', String(meta.seed)));
  lines.push(line('Window', `${meta.startTime.slice(0, 10)} → ${meta.endTime.slice(0, 10)} (${meta.days} days)`));
  lines.push(line('Improvement phase starts', meta.improvementPhaseStart.slice(0, 10)));
  lines.push(line('Starting price / balance', `${meta.startingPrice.toFixed(2)} · ${formatMoney(meta.startingBalance)}`));

  // 01 — volume of data
  lines.push(heading('01', 'The ledger'));
  lines.push(line('Trades (total)', String(trades.length)));
  lines.push(line('Manual trades (magic 0)', String(manual.length)));
  lines.push(line('EA trades', String(eaTrades.length)));
  lines.push(line('Deals', String(deals.length)));
  lines.push(line('SL/TP modifications', String(modifications.length)));
  lines.push(line('High-impact USD events', `${highImpact.length} of ${calendar.length}`));
  lines.push(line('Manual win rate', formatPct((manualWins.length / manual.length) * 100)));
  lines.push(line('Manual net P&L', formatMoney(sum(manual.map((t) => t.netProfit)), { signed: true })));
  lines.push(line('Manual net R', formatR(sum(manual.map(rMultiple)))));
  lines.push(line('EA net P&L', formatMoney(sum(eaTrades.map((t) => t.netProfit)), { signed: true })));
  lines.push(line('Closing balance', formatMoney(account.balance)));

  // 02 — news
  lines.push(heading('02', 'Losses cluster around USD news'));
  const lossesNearNews = manualLosses.filter((trade) => nearHighImpactNews(trade, eventTimes));
  lines.push(line('Manual losses', String(manualLosses.length)));
  lines.push(line('…within ±20 min of a high-impact event', `${lossesNearNews.length}  (${formatPct((lossesNearNews.length / manualLosses.length) * 100)})`));
  lines.push(line('Target', '≥ 60.0%'));
  const newsTrades = manual.filter((trade) => nearHighImpactNews(trade, eventTimes));
  lines.push(line('All manual trades in a news window', `${newsTrades.length}  (avg ${formatR(mean(newsTrades.map(rMultiple)))})`));

  // 03 — revenge
  lines.push(heading('03', 'Revenge trading'));
  const revengeTrades = manual.filter((trade) => revenge.has(trade.id));
  const calmTrades = manual.filter((trade) => !revenge.has(trade.id));
  lines.push(line('Revenge trades', `${revengeTrades.length}  (${formatPct((revengeTrades.length / manual.length) * 100)})`));
  lines.push(line('Target share', '10.0% – 15.0%'));
  lines.push(line('Average R · revenge', formatR(mean(revengeTrades.map(rMultiple)))));
  lines.push(line('Average R · everything else', formatR(mean(calmTrades.map(rMultiple)))));
  lines.push(line('Revenge net P&L', formatMoney(sum(revengeTrades.map((t) => t.netProfit)), { signed: true })));

  // 04 — London
  lines.push(heading('04', 'The London open is the edge'));
  const london = manual.filter(isLondonOpen);
  lines.push(line('Manual trades 07:00–10:00 UTC', String(london.length)));
  lines.push(line('Average R', formatR(mean(london.map(rMultiple)))));
  lines.push(line('Target', '≥ +0.7R'));
  lines.push(line('Win rate', formatPct((london.filter((t) => t.netProfit > 0).length / london.length) * 100)));
  for (const [label, from, to] of [
    ['Asia 00:00–07:00', 0, 7],
    ['London open 07:00–10:00', 7, 10],
    ['London 10:00–12:30', 10, 12.5],
    ['New York 12:30–21:00', 12.5, 21],
    ['After hours 21:00–24:00', 21, 24],
  ] as const) {
    const bucket = manual.filter((trade) => {
      const date = new Date(trade.openTime);
      const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
      return hour >= from && hour < to;
    });
    lines.push(line(`  ${label}`, `${String(bucket.length).padStart(3, ' ')} trades · avg ${formatR(mean(bucket.map(rMultiple)))}`));
  }

  // 05 — other impurities
  lines.push(heading('05', 'Impurities'));
  const oversized = manual.filter((trade) => riskPercent(trade) > 1.5);
  const noStop = manual.filter((trade) => trade.initialSl === null);
  const widened = modifications.filter((modification) => {
    const trade = trades.find((candidate) => candidate.positionId === modification.positionId);
    if (trade === undefined || trade.initialSl === null) return false;
    return (
      Math.abs(modification.sl - trade.openPrice) > Math.abs(trade.initialSl - trade.openPrice) + 0.01
    );
  });
  const rollover = manual.filter((trade) => isRolloverTime(Date.parse(trade.openTime)));
  const perDay = groupCount(manual, (trade) => dayKey(trade.openTime));
  const overtradingDays = [...perDay.values()].filter((count) => count > DAILY_TRADE_LIMIT).length;
  lines.push(line('Risk over 1.5% of equity', `${oversized.length} trades · worst ${formatPct(Math.max(...oversized.map(riskPercent)))}`));
  lines.push(line('Opened without a stop', String(noStop.length)));
  lines.push(line('Stops widened after entry', String(widened.length)));
  lines.push(line('Entries in the rollover window', String(rollover.length)));
  lines.push(line('Active days / overtrading days (> 5)', `${perDay.size} / ${overtradingDays}`));

  // 06 — improvement
  lines.push(heading('06', 'Discipline improves'));
  const improvementMs = Date.parse(meta.improvementPhaseStart);
  const isViolation = (trade: Trade): boolean =>
    revenge.has(trade.id) ||
    nearHighImpactNews(trade, eventTimes) ||
    riskPercent(trade) > 1.5 ||
    trade.initialSl === null ||
    isRolloverTime(Date.parse(trade.openTime));
  for (const [label, phase] of [
    ['First 69 days', manual.filter((t) => Date.parse(t.openTime) < improvementMs)],
    ['Last 21 days', manual.filter((t) => Date.parse(t.openTime) >= improvementMs)],
  ] as const) {
    const violations = phase.filter(isViolation);
    lines.push(
      line(
        label,
        `${String(phase.length).padStart(3, ' ')} trades · ${String(violations.length).padStart(3, ' ')} impure (${formatPct((violations.length / phase.length) * 100)}) · avg ${formatR(mean(phase.map(rMultiple)))}`,
      ),
    );
  }

  // 07 — EAs
  lines.push(heading('07', 'Constellation'));
  const dayKeys = [...new Set(eaTrades.map((trade) => dayKey(trade.closeTime)))].sort();
  const dailyByMagic = new Map<number, number[]>();
  for (const ea of data.eas) {
    dailyByMagic.set(
      ea.magic,
      dayKeys.map((key) =>
        sum(
          eaTrades
            .filter((trade) => trade.magic === ea.magic && dayKey(trade.closeTime) === key)
            .map((trade) => trade.netProfit),
        ),
      ),
    );
  }
  for (const ea of data.eas) {
    const own = eaTrades.filter((trade) => trade.magic === ea.magic);
    const rs = own.map(rMultiple);
    const wins = own.filter((trade) => trade.netProfit > 0);
    const grossWin = sum(wins.map((trade) => trade.netProfit));
    const grossLoss = Math.abs(sum(own.filter((t) => t.netProfit < 0).map((t) => t.netProfit)));
    lines.push(
      line(
        `${ea.magic} · ${ea.name}`,
        `${String(own.length).padStart(3, ' ')} trades · exp ${formatR(mean(rs))} · PF ${(grossLoss === 0 ? 0 : grossWin / grossLoss).toFixed(2)} · win ${formatPct((wins.length / own.length) * 100)} · ${formatMoney(sum(own.map((t) => t.netProfit)), { signed: true })}`,
      ),
    );
    lines.push(line('     baseline expectancy', formatR(ea.baselineExpectancyR ?? 0)));
  }
  const series1001 = dailyByMagic.get(1001) ?? [];
  const series1002 = dailyByMagic.get(1002) ?? [];
  lines.push(line('Correlation 1001 ↔ 1002 (daily P&L)', pearson(series1001, series1002).toFixed(3)));
  lines.push(line('Target', '≥ 0.600'));

  const driftMs = Date.parse(meta.eaDriftStart);
  const grid = eaTrades.filter((trade) => trade.magic === 1003);
  const gridRecent = grid.filter((trade) => Date.parse(trade.openTime) >= driftMs);
  const gridEarly = grid.filter((trade) => Date.parse(trade.openTime) < driftMs);
  lines.push(line('1003 expectancy · first 60 days', `${formatR(mean(gridEarly.map(rMultiple)))} over ${gridEarly.length} trades`));
  lines.push(line('1003 expectancy · last 30 days', `${formatR(mean(gridRecent.map(rMultiple)))} over ${gridRecent.length} trades`));
  lines.push(line('1003 baseline', formatR(data.eas.find((ea) => ea.magic === 1003)?.baselineExpectancyR ?? 0)));

  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
