import { Label } from '@/components/ui';

/**
 * "Assaying…" (CLAUDE.md §9, §10) — the loading state, with the gold-dust
 * shimmer. `/demo` is prerendered, so this is rarely seen; the copy is still
 * the product's, not the framework's.
 */
export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Label>Kavrix</Label>
        <p className="assaying font-serif text-4xl leading-none sm:text-5xl">
          Assaying…
        </p>
        <p className="font-mono text-xs text-text-3">
          Scoring 90 days of XAUUSD trading
        </p>
      </div>
    </div>
  );
}
