import type { Metadata } from 'next';
import { WrappedPage } from '@/components/wrapped/WrappedPage';
import { getDemoDefaultMonth, getDemoWrappedView } from '@/lib/demo/wrapped';

/**
 * `/wrapped` — the last full month, told in chapters (CLAUDE.md §17 Stage 7).
 * Each month also has its own page, `/wrapped/YYYY-MM`, which is the link
 * "Copy link" copies. Until Stage 8 brings real accounts it reads the demo.
 *
 * Prerendered: every chapter is real HTML before any script runs.
 */

export const metadata: Metadata = {
  title: 'Wrapped — Kavrix demo',
  description:
    'A month of XAUUSD discipline in chapters — the month’s Karat, its purity, the best window, what impurity cost, the day that defined it — ending in the Assay Certificate. Demo data, deterministic seed.',
};

export const dynamic = 'force-static';

export default function WrappedIndexPage() {
  return <WrappedPage view={getDemoWrappedView(getDemoDefaultMonth())} demo />;
}
