import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The product's five surfaces (CLAUDE.md §4).
 *
 * All five exist (Stages 3–7). A surface without a page yet (`href: null`)
 * is shown, not hidden — a reader should be able to see where the product
 * goes — but inert: an `aria-disabled` span, never a link that 404s.
 */

export type NavKey = 'assay' | 'ledger' | 'vault' | 'constellation' | 'wrapped';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string | null;
  stage: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'assay', label: 'Assay', href: '/demo', stage: 'Stage 3' },
  { key: 'ledger', label: 'Ledger', href: '/ledger', stage: 'Stage 4' },
  { key: 'vault', label: 'Vault', href: '/vault', stage: 'Stage 5' },
  { key: 'constellation', label: 'Constellation', href: '/constellation', stage: 'Stage 6' },
  { key: 'wrapped', label: 'Wrapped', href: '/wrapped', stage: 'Stage 7' },
];

export interface PrimaryNavProps {
  /** The surface this page belongs to. A Dossier belongs to the Ledger. */
  current: NavKey;
  className?: string;
}

export function PrimaryNav({ current, className }: PrimaryNavProps) {
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

          const active = item.key === current;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  base,
                  'transition-colors',
                  active
                    ? 'bg-surface-2 text-gold hover:bg-surface-2'
                    : 'text-text-2 hover:bg-surface-2 hover:text-text',
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
