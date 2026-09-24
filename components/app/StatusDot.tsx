import { cn } from '@/lib/cn';
import type { ConnectorStatus } from '@/lib/connector/status';

/**
 * The connector's dot. Jade only while heartbeats are arriving, a quiet ring
 * when they have stopped, nothing lit before the first one — the dot is
 * never greener than the data (CLAUDE.md §17 Stage 8).
 */
export function StatusDot({ status, className }: { status: ConnectorStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px]', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'block h-2 w-2 shrink-0 rounded-full',
          status.tone === 'live' && 'bg-jade',
          status.tone === 'stale' && 'border border-text-3',
          status.tone === 'never' && 'border border-line',
        )}
      />
      <span className={status.tone === 'live' ? 'text-text-2' : 'text-text-3'}>{status.label}</span>
    </span>
  );
}
