import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { AssayScreen } from '@/components/assay/AssayScreen';
import { getDemoAssay } from '@/lib/demo/assay';

/**
 * `/demo` — the Assay over the demo account (CLAUDE.md §11).
 *
 * No auth, no database, instant. The generator and the engine are pure and
 * seeded, so the page is prerendered at build time and served as static HTML;
 * the only JavaScript that ships is the dial's sweep, the counters, the Gap
 * toggle and the Explain drawer.
 */

export const metadata: Metadata = {
  title: 'The Assay — Kavrix demo',
  description:
    'A worked example of the Karat Score on 90 days of XAUUSD trading. Demo data, deterministic seed.',
};

/** The demo has nothing to revalidate: same seed, same numbers, forever. */
export const dynamic = 'force-static';

export default function DemoPage() {
  const assay = getDemoAssay();

  return (
    <AppShell accountLabel="XAUUSD · Demo" periodLabel="Last 30 days" demo>
      <AssayScreen assay={assay} />
    </AppShell>
  );
}
