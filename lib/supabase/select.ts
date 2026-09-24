import type { PostgrestError } from '@supabase/supabase-js';

/** PostgREST returns at most `max_rows` (1,000 by default) per request, so reads page. */
export const PAGE_SIZE = 1000;

/** Every row of a query, one `range` at a time. Throws on a database error. */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error !== null) throw new Error(`database read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

/** `items` in chunks of `size`, for `in (…)` filters and bulk writes. */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
