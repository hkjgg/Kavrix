import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * Table base (CLAUDE.md §9, §16). Quiet and fast: hairline rows, no zebra
 * striping, numbers in mono with tabular figures and right aligned.
 *
 * Pass `numeric` on a cell to get mono + right alignment.
 */

export type TableProps = TableHTMLAttributes<HTMLTableElement>;

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  );
}

export type TableHeadProps = HTMLAttributes<HTMLTableSectionElement>;

export function TableHead({ className, ...props }: TableHeadProps) {
  return <thead className={cn('border-b border-line', className)} {...props} />;
}

export type TableBodyProps = HTMLAttributes<HTMLTableSectionElement>;

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={className} {...props} />;
}

export type TableRowProps = HTMLAttributes<HTMLTableRowElement>;

export function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-line last:border-b-0 transition-colors hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}

export interface TableHeaderCellProps
  extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns the column and its cells' mono figures. */
  numeric?: boolean;
}

export function TableHeaderCell({
  numeric = false,
  className,
  scope = 'col',
  ...props
}: TableHeaderCellProps) {
  return (
    <th
      scope={scope}
      className={cn(
        'px-4 py-3 text-[11px] font-medium uppercase tracking-[2px] text-text-3',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Renders the value in mono, right-aligned. */
  numeric?: boolean;
}

export function TableCell({
  numeric = false,
  className,
  ...props
}: TableCellProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle',
        numeric ? 'text-right font-mono tabular-nums text-text' : 'text-text-2',
        className,
      )}
      {...props}
    />
  );
}
