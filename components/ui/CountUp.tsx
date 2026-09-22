'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { formatKarat, formatMoney, formatPct, formatR } from '@/lib/format';

/**
 * A number that counts up like a mechanical counter (CLAUDE.md §9).
 *
 * Two rules shape the implementation:
 *
 *  - **The server renders the final value.** The markup is correct before any
 *    JavaScript arrives, so there is no layout shift and no empty figure for a
 *    reader without JS. The animation is decoration applied afterwards.
 *  - **The animation writes text, not state.** The value never changes except
 *    when a prop does, so driving it through React state would re-render the
 *    tree sixty times a second for nothing. The effect writes `textContent`.
 *
 * Under `prefers-reduced-motion` the number is simply there.
 */

export type CountUpKind = 'karat' | 'money' | 'r' | 'percent' | 'number';

export interface CountUpProps {
  value: number;
  kind?: CountUpKind;
  /** Decimals. Defaults to the house default for the kind. */
  digits?: number;
  /** Leading "+" on positives. Defaults to the house default for the kind. */
  signed?: boolean;
  /** ISO 4217 code, for `kind="money"`. */
  currency?: string;
  /** Sweep duration in ms. */
  durationMs?: number;
  /** Delay before the sweep starts, in ms. */
  delayMs?: number;
  className?: string;
}

function defaultDigits(kind: CountUpKind): number {
  if (kind === 'money') return 2;
  if (kind === 'number') return 0;
  return 1;
}

function defaultSigned(kind: CountUpKind): boolean {
  return kind === 'r';
}

export function formatCountUp(
  value: number,
  kind: CountUpKind,
  digits: number,
  signed: boolean,
  currency: string,
): string {
  switch (kind) {
    case 'karat':
      return formatKarat(value, { digits, signed });
    case 'money':
      return formatMoney(value, { digits, signed, currency });
    case 'r':
      return formatR(value, { digits, signed });
    case 'percent':
      return formatPct(value, { digits, signed });
    default:
      return value.toFixed(digits);
  }
}

/** Fast at the start, settling at the end — a counter coming to rest. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function CountUp({
  value,
  kind = 'number',
  digits,
  signed,
  currency = 'USD',
  durationMs = 1400,
  delayMs = 0,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const decimals = digits ?? defaultDigits(kind);
  const withSign = signed ?? defaultSigned(kind);
  const final = formatCountUp(value, kind, decimals, withSign, currency);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (!Number.isFinite(value)) return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let frame = 0;
    let start: number | null = null;
    // Counting a negative number up from zero would run the wrong way, so the
    // sweep always travels from zero towards the value's own sign.
    const from = 0;

    const step = (now: number): void => {
      if (start === null) start = now;
      const elapsed = now - start - delayMs;
      if (elapsed < 0) {
        frame = window.requestAnimationFrame(step);
        return;
      }
      const t = durationMs <= 0 ? 1 : Math.min(elapsed / durationMs, 1);
      const current = from + (value - from) * easeOutCubic(t);
      node.textContent = formatCountUp(current, kind, decimals, withSign, currency);
      if (t < 1) frame = window.requestAnimationFrame(step);
    };

    node.textContent = formatCountUp(from, kind, decimals, withSign, currency);
    frame = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frame);
      node.textContent = formatCountUp(value, kind, decimals, withSign, currency);
    };
  }, [value, kind, decimals, withSign, currency, durationMs, delayMs]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {final}
    </span>
  );
}
