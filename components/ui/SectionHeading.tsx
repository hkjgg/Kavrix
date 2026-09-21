import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SectionHeadingProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Editorial index, e.g. "01". Rendered in gold mono. */
  index?: string;
  /** The heading itself, set in the display serif. */
  title: ReactNode;
  /** Optional one-line subtitle under the heading. */
  subtitle?: ReactNode;
  /** Heading level. Default 2. */
  as?: 'h1' | 'h2' | 'h3';
}

/**
 * Editorial section heading (CLAUDE.md §9): `01 — The Assay`.
 */
export function SectionHeading({
  index,
  title,
  subtitle,
  as: Tag = 'h2',
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <header className={cn('flex flex-col gap-2', className)} {...props}>
      <Tag className="flex flex-wrap items-baseline gap-3 font-serif text-3xl font-normal text-text">
        {index ? (
          <span className="font-mono text-xs tracking-[2px] text-gold">
            {index} &mdash;
          </span>
        ) : null}
        <span>{title}</span>
      </Tag>
      {subtitle ? (
        <p className="max-w-prose text-sm text-text-2">{subtitle}</p>
      ) : null}
    </header>
  );
}
