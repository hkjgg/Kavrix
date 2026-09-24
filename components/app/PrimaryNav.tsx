import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { Surface } from '@/lib/routes';
import { routesFor } from '@/lib/routes';

/**
 * The product's five surfaces (CLAUDE.md §4), for the demo or for a real
 * account — the same five, at `/demo/*` or at the root (§11, §15). A real
 * account also gets Settings, which the read-only demo has no use for.
 */

export type NavKey = 'assay' | 'ledger' | 'vault' | 'constellation' | 'wrapped' | 'settings';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
}

export function navItems(surface: Surface): NavItem[] {
  const routes = routesFor(surface);
  const items: NavItem[] = [
    { key: 'assay', label: 'Assay', href: routes.assay },
    { key: 'ledger', label: 'Ledger', href: routes.ledger },
    { key: 'vault', label: 'Vault', href: routes.vault },
    { key: 'constellation', label: 'Constellation', href: routes.constellation },
    { key: 'wrapped', label: 'Wrapped', href: routes.wrapped },
  ];
  if (routes.settings !== null) items.push({ key: 'settings', label: 'Settings', href: routes.settings });
  return items;
}

/** The demo's navigation — what every surface drew before Stage 8. */
export const NAV_ITEMS: readonly NavItem[] = navItems('demo');

export interface PrimaryNavProps {
  /** The surface this page belongs to. A Dossier belongs to the Ledger. */
  current: NavKey;
  surface?: Surface;
  className?: string;
}

export function PrimaryNav({ current, surface = 'demo', className }: PrimaryNavProps) {
  return (
    <nav aria-label="Primary" className={className}>
      <ul className="flex items-center gap-1">
        {navItems(surface).map((item) => {
          const active = item.key === current;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-full px-3.5 py-2 text-[11px] font-medium uppercase tracking-[2px] transition-colors',
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
