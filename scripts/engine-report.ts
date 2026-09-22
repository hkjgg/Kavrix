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
import type {
  ConfidenceResult,
  EdgeCell,
  PillarResult,
} from '@/lib/engine';
import { CONFIDENCE_LABELS, computeReplay, worstTiltEpisode } from '@/lib/engine';
import { formatKarat, formatMoney, formatPct, formatR } from '@/lib/format';

function line(label: string, value: string): string {
  return `  ${label.padEnd(38, ' ')}${value}`;
}

function heading(index: string, title: string): string {
  return `\n${index} — ${title.toUpperCase()}\n${'─'.repeat(72)}`;
}

/** `Strong · n 70 · 95% CI +1.09R → +1.65R` — the §6.6 read-out in one line. */
function confidenceLine(confidence: ConfidenceResult | null): string {
  if (confidence === null || confidence.n === 0) return 'no sample';
  return [
    CONFIDENCE_LABELS[confidence.label].padEnd(8, ' '),
    `n ${String(confidence.n).padStart(4, ' ')}`,
    `95% CI ${formatR(confidence.ci95.low).padStart(6, ' ')} → ${formatR(confidence.ci95.high).padStart(6, ' ')}`,
    `win ${formatPct(confidence.winRate).padStart(6, ' ')} (${formatPct(confidence.winRateInterval.low)}–${formatPct(confidence.winRateInterval.high)})`,
    `p ${confidence.pValue < 0.001 ? '<0.001' : confidence.pValue.toFixed(3)}`,
  ].join(' · ');
}

function edgeCellLine(cell: EdgeCell): string {
  return line(
    `  ${cell.label}`,
    [
      `${String(cell.tradeCount).padStart(4, ' ')} trades`,
      formatR(cell.avgR).padStart(7, ' '),
      CONFIDENCE_LABELS[cell.confidenceLabel].padEnd(8, ' '),
      `q ${cell.qValue < 0.001 ? '<0.001' : cell.qValue.toFixed(3)}`,
      `${cell.dimensionLabel}`,
    ].join(' · '),
  );
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
  const {
    karat,
    gap,
    gapAllTime,
    proof,
    constellation,
    findings,
    refinery,
    delta,
    edgeMap,
    baselines,
    counterfactual,
    prop,
    similar,
  } = result;
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
  for (const finding of refinery) {
    lines.push(
      `  ${finding.rank}. [${finding.severity}] ${finding.headline}`,
    );
    lines.push(
      line('     impact', `${money(finding.impactMoney)} · ${formatR(finding.impactR)} · ${finding.tradeIds.length} trades`),
    );
    lines.push(line('     confidence', confidenceLine(finding.confidence)));
  }
  lines.push(
    line(
      'Other findings',
      findings
        .filter((finding) => !refinery.includes(finding))
        .map((finding) => `${finding.kind}${finding.tentative ? ' (tentative)' : ''}`)
        .join(', '),
    ),
  );

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

  // 07 — the edge map
  lines.push(heading('07', 'Edge map · corrected across every cell'));
  lines.push(
    line(
      'Cells',
      `${edgeMap.testedCells} tested · ${edgeMap.skippedCells.length} under ${edgeMap.minTrades} trades · BH at α ${edgeMap.alpha}`,
    ),
  );
  lines.push(line('Top 3 strengths', ''));
  for (const cell of edgeMap.strengths) lines.push(edgeCellLine(cell));
  lines.push(line('Bottom 3 weaknesses', ''));
  for (const cell of edgeMap.weaknesses) lines.push(edgeCellLine(cell));

  // 08 — similar trades
  lines.push(heading('08', 'Similar trades · one worked example'));
  const example = similar[0];
  if (example === undefined) {
    lines.push(line('Example', 'no impurity trade in the window'));
  } else {
    const target = result.trades.find((trade) => trade.id === example.tradeId);
    lines.push(
      line(
        'Target',
        `${example.tradeId} · ${target?.openTime.slice(0, 16).replace('T', ' ')} UTC · ${formatR(target?.rMultiple ?? 0)} · ${target?.impurities.join(', ') || 'clean'}`,
      ),
    );
    lines.push(
      line(
        'Nearest 12',
        `${example.wins} won · ${example.losses} lost · ${formatR(example.meanR)} average · ${money(example.netMoney)}`,
      ),
    );
    lines.push(line('  confidence', confidenceLine(example.confidence)));
    lines.push(line('  drawn from', `${example.eligibleCount} trades closed before it opened`));
  }

  // 09 — outside your normal
  lines.push(heading('09', 'Outside your normal'));
  lines.push(
    line(
      'Baseline',
      baselines.measurable
        ? `${baselines.baselineTradeCount} trades before the last ${baselines.recentDays} days · ${baselines.recentTradeCount} since`
        : (baselines.hiddenReason ?? ''),
    ),
  );
  for (const metric of baselines.metrics) {
    const value = (amount: number): string =>
      metric.unit === '%'
        ? formatPct(amount, { digits: 2 })
        : `${amount.toFixed(2)} ${metric.unit}`;
    lines.push(
      line(
        `  ${metric.label}`,
        [
          `median ${value(metric.median)}`,
          `p90 ${value(metric.p90)}`,
          `last ${baselines.recentDays} days ${value(metric.recentMedian)}`,
          metric.outsideNormal ? '← outside your normal' : '',
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    );
  }
  if (baselines.findings.length === 0) {
    lines.push(line('Findings', 'nothing outside your normal this week'));
  }
  for (const finding of baselines.findings) {
    lines.push(`  · ${finding.headline}`);
  }

  // 10 — the what-if
  lines.push(heading('10', 'What-if · counterfactual, not a promise'));
  lines.push(line('Method', counterfactual.method));
  lines.push(
    line(
      'Actual',
      `${money(counterfactual.actualEndMoney)} · ${formatR(counterfactual.actualEndR)} · closing equity ${formatMoney(counterfactual.actualEndEquity, { currency })}`,
    ),
  );
  for (const scenario of counterfactual.scenarios) {
    lines.push(
      line(
        `  ${scenario.label}`,
        [
          `${String(scenario.removedTradeCount).padStart(3, ' ')} removed (${scenario.removedWins}W/${scenario.removedLosses}L)`,
          `→ ${money(scenario.endMoney).padStart(12, ' ')}`,
          `delta ${money(scenario.deltaMoney).padStart(12, ' ')} · ${formatR(scenario.deltaR).padStart(8, ' ')}`,
          `gap bills ${money(-scenario.gapCostMoney)}`,
        ].join(' · '),
      ),
    );
  }

  // 11 — the worst tilt episode
  lines.push(heading('11', 'Discipline replay · worst tilt episode'));
  const allDays = computeReplay(result.trades, result.settings);
  const worst = worstTiltEpisode(allDays);
  const episodeCount = allDays.reduce((total, day) => total + day.episodes.length, 0);
  lines.push(
    line('Episodes', `${episodeCount} across ${allDays.length} trading days · ${result.replay.length} days in the scored window`),
  );
  if (worst === null) {
    lines.push(line('Worst', 'none — no two impurities inside an hour'));
  } else {
    lines.push(
      line(
        'Worst',
        `${worst.date} · ${worst.episode.start.slice(11, 16)}–${worst.episode.end.slice(11, 16)} UTC · ${worst.episode.durationMinutes} min`,
      ),
    );
    lines.push(
      line(
        '  damage',
        `${worst.episode.impurityTradeCount} impurities · day Karat ${formatKarat(worst.episode.karatBefore)} → ${formatKarat(worst.episode.karatAfter)} (${formatKarat(-worst.episode.karatDrop, { signed: true })}) · ${money(-worst.episode.costMoney)}`,
      ),
    );
    const day = allDays.find((entry) => entry.date === worst.date);
    for (const tradeId of worst.episode.tradeIds) {
      const trade = day?.trades.find((entry) => entry.tradeId === tradeId);
      if (trade === undefined) continue;
      lines.push(
        `      ${trade.openTime.slice(11, 16)}  ${formatR(trade.rMultiple).padStart(6, ' ')}  ${trade.impurities.map((impurity) => impurity.kind).join(', ')}`,
      );
    }
  }

  // 12 — the prop check
  lines.push(heading('12', 'Prop check · historical only'));
  lines.push(
    line(
      'Preset',
      `${prop.rules.label} · ${formatPct(prop.rules.dailyLossPercent, { digits: 0 })} a day · ${formatPct(prop.rules.maxDrawdownPercent, { digits: 0 })} overall`,
    ),
  );
  lines.push(
    line(
      'Breach days',
      `${prop.breachDayCount} of ${prop.activeDays} · daily loss ${prop.dailyLossBreachCount} · overall drawdown ${prop.drawdownBreachCount}`,
    ),
  );
  lines.push(
    line(
      'First breach',
      prop.firstBreachDate === null
        ? 'none'
        : `${prop.firstBreachDate} · ${prop.firstBreachRule === 'daily-loss' ? 'daily loss' : 'overall drawdown'}`,
    ),
  );
  lines.push(
    line(
      'Worst',
      `day loss ${formatPct(prop.worstDayLossPercent)} · drawdown ${formatPct(prop.worstDrawdownPercent)}`,
    ),
  );
  for (const tally of prop.pillarTally) {
    lines.push(
      line(`  ${tally.label}`, `${tally.days} breach ${tally.days === 1 ? 'day' : 'days'} · ${money(-tally.costMoney)}`),
    );
  }
  lines.push(line('Note', prop.disclaimer));

  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
