/**
 * `pnpm engine:report` — a plain-text read-out of the analytics engine.
 *
 * It runs the engine over the demo account at the end of the demo window and
 * prints what the Assay is supposed to show: the score and its tier, the six
 * pillars with their largest deductions, the Karat Gap, Your Proof, the top
 * findings and the EA Fineness table.
 *
 * Every number here comes from `lib/engine` — the script computes nothing of
 * its own, which is the point: if the report reads badly, the engine is wrong.
 */

import { generateDemoData } from '@/lib/demo/generate';
import { runEngine } from '@/lib/engine';
import type { PillarResult } from '@/lib/engine';
import { formatKarat, formatMoney, formatPct, formatR } from '@/lib/format';

function line(label: string, value: string): string {
  return `  ${label.padEnd(38, ' ')}${value}`;
}

function heading(index: string, title: string): string {
  return `\n${index} — ${title.toUpperCase()}\n${'─'.repeat(72)}`;
}

function pillarLine(pillar: PillarResult): string {
  const points = `${pillar.points.toFixed(1)} / ${pillar.maxPoints}`;
  const filled = Math.round((pillar.points / pillar.maxPoints) * 10);
  const bar = '█'.repeat(filled) + '·'.repeat(10 - filled);
  return line(`${pillar.label}`, `${bar}  ${points.padStart(11, ' ')}`);
}

function main(): void {
  const demo = generateDemoData();
  const result = runEngine(demo, {}, demo.meta.endTime);
  const { karat, gap, gapAllTime, proof, constellation, findings, delta } = result;
  const currency = result.account.currency;
  const money = (value: number): string => formatMoney(value, { currency, signed: true });

  const lines: string[] = [];
  lines.push('KAVRIX · ENGINE REPORT');
  lines.push('═'.repeat(72));
  lines.push(line('Source', `${demo.meta.label} · seed ${demo.meta.seed}`));
  lines.push(line('As of', result.asOf));
  lines.push(
    line(
      'Trades',
      `${result.counts.trades} · manual ${result.counts.manualTrades} · EA ${result.counts.eaTrades}`,
    ),
  );

  // 01 — the score
  lines.push(heading('01', 'The assay'));
  if (karat.state === 'assaying') {
    lines.push(line('Karat', `Assaying… (${karat.tradeCount} of ${karat.minimumTrades} trades)`));
  } else {
    lines.push(line('Karat', `${formatKarat(karat.karat ?? 0)} · ${karat.tier?.label ?? ''}`));
  }
  lines.push(line('Points', `${karat.points.toFixed(2)} / ${karat.maxPoints}`));
  lines.push(
    line(
      'Delta vs last week',
      delta.delta === null
        ? '—'
        : `${formatKarat(delta.delta, { signed: true })} (from ${formatKarat(delta.previous ?? 0)})`,
    ),
  );
  lines.push(
    line(
      'Window',
      `${karat.windowStart.slice(0, 10)} → ${karat.windowEnd.slice(0, 10)} · ${karat.tradeCount} manual trades`,
    ),
  );

  // 02 — pillars
  lines.push(heading('02', 'Pillars'));
  for (const pillar of karat.pillars) {
    lines.push(pillarLine(pillar));
    for (const deduction of pillar.deductions.slice(0, 2)) {
      lines.push(
        `      −${deduction.pointsLost.toFixed(2)}  ${deduction.reason} · ${deduction.tradeIds.length} ${deduction.tradeIds.length === 1 ? 'trade' : 'trades'}`,
      );
    }
  }

  // 03 — the gap
  lines.push(heading('03', 'Karat gap · 30-day window'));
  lines.push(line('Total', `${money(-gap.totalCostMoney)} · ${formatR(-gap.totalCostR)}`));
  for (const gapLine of gap.lines) {
    lines.push(
      line(
        `  ${gapLine.label}`,
        `${money(-gapLine.costMoney).padStart(13, ' ')} · ${formatR(-gapLine.costR).padStart(8, ' ')} · ${gapLine.tradeCount} ${gapLine.tradeCount === 1 ? 'trade' : 'trades'}`,
      ),
    );
  }
  lines.push(line('All 90 days', `${money(-gapAllTime.totalCostMoney)} · ${formatR(-gapAllTime.totalCostR)}`));
  for (const gapLine of gapAllTime.lines) {
    lines.push(
      line(
        `  ${gapLine.label}`,
        `${money(-gapLine.costMoney).padStart(13, ' ')} · ${formatR(-gapLine.costR).padStart(8, ' ')} · ${gapLine.tradeCount} ${gapLine.tradeCount === 1 ? 'trade' : 'trades'}`,
      ),
    );
  }

  // 04 — proof
  lines.push(heading('04', 'Your proof'));
  if (!proof.visible) {
    lines.push(line('Hidden', proof.hiddenReason ?? ''));
  }
  lines.push(
    line(
      `${proof.highKarat}K and above`,
      `${proof.high.weekCount} weeks · ${formatR(proof.high.avgWeeklyR)} a week`,
    ),
  );
  lines.push(
    line(
      `Under ${proof.lowKarat}K`,
      `${proof.low.weekCount} weeks · ${formatR(proof.low.avgWeeklyR)} a week`,
    ),
  );
  lines.push(line('Discipline paid', `${formatR(proof.differenceR)} a week`));
  lines.push(
    line(
      'Weeks scored',
      proof.weeks
        .map((week) => `${week.isoWeek.slice(5)} ${formatKarat(week.karat)}`)
        .join(' · '),
    ),
  );

  // 05 — the refinery
  lines.push(heading('05', 'The refinery · top 3 findings'));
  for (const finding of findings.slice(0, 3)) {
    lines.push(
      `  ${finding.rank}. [${finding.severity}] ${finding.headline}`,
    );
    lines.push(
      line('     impact', `${money(finding.impactMoney)} · ${formatR(finding.impactR)} · ${finding.tradeIds.length} trades`),
    );
  }
  lines.push(line('Other findings', findings.slice(3).map((finding) => finding.kind).join(', ')));

  // 06 — constellation
  lines.push(heading('06', 'Constellation · EA fineness'));
  lines.push(
    line(
      '  EA',
      'trades   exp      PF    DD     recent-20  fineness  label',
    ),
  );
  for (const ea of constellation.eas) {
    lines.push(
      line(
        `  ${ea.magic} · ${ea.name}`,
        [
          String(ea.tradeCount).padStart(5, ' '),
          formatR(ea.expectancyR).padStart(7, ' '),
          (ea.profitFactor ?? 0).toFixed(2).padStart(6, ' '),
          formatR(-ea.maxDrawdownR).padStart(7, ' '),
          formatR(ea.recent20ExpectancyR).padStart(9, ' '),
          `${(ea.fineness ?? 0).toFixed(1)}‰`.padStart(10, ' '),
          `  ${ea.label ?? '—'}${ea.drift.alert ? ' · drift' : ''}`,
        ].join(' '),
      ),
    );
    lines.push(
      line(
        '     components',
        `stability ${formatPct(ea.components.expectancyStability * 100)} · drawdown ${formatPct(ea.components.drawdownVsBaseline * 100)} · consistency ${formatPct(ea.components.consistency * 100)} · execution ${formatPct(ea.components.executionQuality * 100)}`,
      ),
    );
  }
  for (const pair of constellation.correlations) {
    lines.push(
      line(
        `  ${pair.a} ↔ ${pair.b}`,
        `${pair.correlation.toFixed(3)}${pair.sameBet ? '  · same bet' : ''}`,
      ),
    );
  }

  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
