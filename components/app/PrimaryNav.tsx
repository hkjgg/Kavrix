import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The product's five surfaces (CLAUDE.md §4).
 *
 * Only the Assay exists in Stage 3. The rest are shown, not hidden — a reader
 * should be able to see where the product goes — but they are inert: an
 * `aria-disabled` span, never a link that 404s.
 */

export interface NavItem {
  label: string;
  href: string | null;
  stage: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Assay', href: '/demo', stage: 'Stage 3' },
  { label: 'Ledger', href: null, stage: 'Stage 5' },
  { label: 'Vault', href: null, stage: 'Stage 4' },
  { label: 'Constellation', href: null, stage: 'Stage 6' },
  { label: 'Wrapped', href: null, stage: 'Stage 7' },
];

export function PrimaryNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Primary" className={className}>
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const base =
            'block rounded-full px-3.5 py-2 text-[11px] font-medium uppercase tracking-[2px] whitespace-nowrap';

          if (item.href === null) {
            return (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  title={`${item.label} arrives in ${item.stage}`}
                  className={cn(base, 'cursor-not-allowed text-text-3/55')}
                >
                  {item.label}
                </span>
              </li>
            );
          }

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current="page"
                className={cn(
                  base,
                  'bg-surface-2 text-gold transition-colors hover:bg-surface-2',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
