/**
 * Joins class names, dropping anything falsy.
 * Deliberately tiny — Kavrix composes classes, it does not merge conflicting
 * Tailwind utilities, so the last class in source order simply wins.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
