/**
 * "Explain this number" — the shape of one explanation (CLAUDE.md §17, Stage 3).
 *
 * Every field is a **pre-formatted string**. The drawer is a dumb renderer:
 * it neither computes nor formats, which keeps `lib/format.ts` the single
 * place decimals are decided (§16) and keeps the client bundle free of engine
 * code. `components/assay/explain.ts` builds these server-side from the
 * `AssayResult` and nothing else.
 *
 * The tone is fixed by §10: calm, factual, sentence case. An explanation
 * explains — it does not reassure, and it never argues with the number.
 */

export type ExplainTone = 'gold' | 'loss' | 'profit' | 'neutral';

/** One trade behind a number: `12:36 · −1.0R · Revenge, news`. */
export interface ExplainRow {
  tradeId: string;
  /** `2026-09-11 12:36` (UTC). */
  time: string;
  /** Already formatted, e.g. `−1.0R`. */
  r: string;
  reason: string;
  tone: ExplainTone;
}

/** A labelled figure in the breakdown list. */
export interface ExplainLine {
  label: string;
  value: string;
  tone?: ExplainTone;
}

/** The §6.6 read-out, pre-formatted. */
export interface ExplainConfidence {
  /** Strong · Moderate · Weak. */
  label: string;
  /** `n = 65`. */
  sample: string;
  /** `95% CI −1.2R → −0.7R`. */
  interval: string;
  /** `Win rate 21.5% (13.2%–33.1%)`. */
  winRate: string;
  /** `p < 0.001`. */
  pValue: string;
  /** What the label means, in one sentence. */
  meaning: string;
}

export interface ExplainEntry {
  id: string;
  /** Uppercase kicker, e.g. `Pillar · 25 points`. */
  eyebrow: string;
  title: string;
  /** The headline figure, formatted. */
  value: string;
  valueTone: ExplainTone;
  /** One line under the figure, e.g. `77 manual trades · 2026-08-21 → 2026-09-20`. */
  valueCaption: string | null;
  /** Plain language: what this number is. */
  definition: string;
  /**
   * What period and weighting the number covers, when a reader could mistake
   * it for another number on the page that covers a different one — a
   * 30-day, recency-weighted pillar beside a 90-day, unweighted finding.
   */
  scopeNote: string | null;
  /** The formula, quoted from CLAUDE.md. */
  formula: string;
  /** Where the formula comes from, e.g. `CLAUDE.md §6.1 — Risk`. */
  source: string;
  /** The breakdown: deductions, gap lines, bucket weeks. */
  lines: ExplainLine[];
  linesTitle: string | null;
  /** The trades behind the number. */
  rows: ExplainRow[];
  rowsTitle: string | null;
  /** `Showing the 12 costliest of 65 trades.` */
  rowsNote: string | null;
  confidence: ExplainConfidence | null;
  /** Anything the reader should know before acting on it. */
  note: string | null;
}

export type ExplainIndex = Record<string, ExplainEntry>;
