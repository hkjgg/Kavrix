import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { ConstellationSection } from '@/components/constellation/ConstellationSection';
import { getDemoConstellation } from '@/lib/demo/constellation';

/**
 * `/demo/constellation` — EA Health (CLAUDE.md §4, §7, §8.8, §17 Stage 6).
 *
 * Every EA as a star: bright where its Fineness is high, dim where it has
 * degraded, ringed in amber where it drifts, and threaded to the EAs it moves
 * with. Beside it, the EA panel; below it, the same correlations as a grid.
 * A signed-in trader's own is `/constellation`; the page body is shared.
 *
 * Prerendered: the force layout ran at build time, so the sky is real SVG
 * before any script runs. The open EA is read from `?ea=` as the page hydrates.
 */

export const metadata: Metadata = {
  title: 'Constellation — Kavrix demo',
  description:
    'EA Health for three demo Expert Advisors: Fineness in ‰, drift against the backtest, a Monte Carlo drawdown band, and which EAs are secretly the same bet. Demo data, deterministic seed.',
};

export const dynamic = 'force-static';

export default function ConstellationPage() {
  const view = getDemoConstellation();

  return (
    <AppShell accountLabel="XAUUSD · Demo" periodLabel="Last 90 days" current="constellation" demo>
      <ConstellationSection view={view} />
    </AppShell>
  );
}
