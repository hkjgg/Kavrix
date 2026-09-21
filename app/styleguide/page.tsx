import type { Metadata } from 'next';
import {
  Badge,
  Button,
  Card,
  Label,
  SectionHeading,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { formatKarat, formatMoney, formatPct, formatR } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Styleguide — Kavrix',
  description: 'Temporary visual reference for the Obsidian Gold design system.',
};

/**
 * Temporary Stage 0 page. It exists only to verify the design system visually
 * and is removed once the real surfaces are built.
 */

interface Token {
  name: string;
  variable: string;
  hex: string;
  note: string;
}

const SURFACE_TOKENS: Token[] = [
  { name: 'bg', variable: '--bg', hex: '#0A0A0C', note: 'page (obsidian)' },
  { name: 'surface-1', variable: '--surface-1', hex: '#111114', note: 'cards' },
  { name: 'surface-2', variable: '--surface-2', hex: '#1A1A1E', note: 'hover / raised' },
  { name: 'line', variable: '--line', hex: '#1E1D21', note: 'hairlines' },
];

const TEXT_TOKENS: Token[] = [
  { name: 'text', variable: '--text', hex: '#EDE9E1', note: 'primary, warm off-white' },
  { name: 'text-2', variable: '--text-2', hex: '#B8B2A6', note: 'secondary' },
  { name: 'text-3', variable: '--text-3', hex: '#8E897F', note: 'labels / captions' },
];

const GOLD_TOKENS: Token[] = [
  { name: 'gold', variable: '--gold', hex: '#D4AF6A', note: 'the one accent' },
  { name: 'gold-light', variable: '--gold-light', hex: '#F3DFA8', note: 'highlights, sheen' },
  { name: 'gold-deep', variable: '--gold-deep', hex: '#8C6A2F', note: 'metallic shading' },
  { name: 'champagne', variable: '--champagne', hex: '#E9D8A6', note: 'soft gold' },
];

const SERIES_TOKENS: Token[] = [
  { name: 'bronze', variable: '--bronze', hex: '#A8743F', note: 'New York session' },
  { name: 'slate', variable: '--slate', hex: '#5E5B66', note: 'Asia session' },
  { name: 'news', variable: '--news', hex: '#C9953F', note: 'news markers' },
];

const PNL_TOKENS: Token[] = [
  { name: 'jade', variable: '--jade', hex: '#6FC291', note: 'profit only' },
  { name: 'oxblood', variable: '--oxblood', hex: '#C0564B', note: 'loss only' },
  { name: 'oxblood-text', variable: '--oxblood-text', hex: '#E08A7E', note: 'loss, text variant' },
];

function Swatch({ token }: { token: Token }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="size-14 shrink-0 rounded-card border border-line"
        style={{ backgroundColor: `var(${token.variable})` }}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-sm text-text">{token.name}</span>
        <span className="font-mono text-xs text-text-3">{token.hex}</span>
        <span className="text-xs text-text-2">{token.note}</span>
      </div>
    </div>
  );
}

function SwatchGroup({ title, tokens }: { title: string; tokens: Token[] }) {
  return (
    <Card>
      <Label className="mb-5">{title}</Label>
      <div className="grid gap-5 sm:grid-cols-2">
        {tokens.map((token) => (
          <Swatch key={token.name} token={token} />
        ))}
      </div>
    </Card>
  );
}

interface LedgerRow {
  id: string;
  session: string;
  risk: number;
  result: number;
  pnl: number;
}

const SAMPLE_ROWS: LedgerRow[] = [
  { id: '#100241', session: 'London', risk: 0.9, result: 1.8, pnl: 216.4 },
  { id: '#100242', session: 'New York', risk: 1.4, result: -0.6, pnl: -84.2 },
  { id: '#100243', session: 'Asia', risk: 0.7, result: 0, pnl: 0 },
  { id: '#100244', session: 'London', risk: 1.1, result: -1.3, pnl: -171.9 },
];

export default function StyleguidePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16">
      <header className="flex flex-col gap-4">
        <Label>Stage 0 · temporary</Label>
        <h1 className="sheen font-serif text-6xl leading-none">KAVRIX</h1>
        <p className="max-w-prose text-text-2">
          Profit tells you what happened. Karat tells you if it will last.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge>Demo data</Badge>
          <Badge tone="neutral">Assaying…</Badge>
          <Badge tone="profit">Compliant</Badge>
          <Badge tone="loss">Impurity</Badge>
          <Badge tone="news">News window</Badge>
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <SectionHeading
          index="01"
          title="Colour tokens"
          subtitle="Gold is brand and interaction only. Jade and oxblood are reserved for P&L."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <SwatchGroup title="Surfaces" tokens={SURFACE_TOKENS} />
          <SwatchGroup title="Text" tokens={TEXT_TOKENS} />
          <SwatchGroup title="Gold" tokens={GOLD_TOKENS} />
          <SwatchGroup title="Series & markers" tokens={SERIES_TOKENS} />
          <SwatchGroup title="P&L" tokens={PNL_TOKENS} />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeading
          index="02"
          title="Typography"
          subtitle="Instrument Serif for numerals and headings, Manrope for UI, JetBrains Mono for figures."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <Label className="mb-4">Instrument Serif · display</Label>
            <p className="font-serif text-5xl leading-none text-gold">21.4K</p>
            <p className="mt-3 font-serif text-2xl">The Assay</p>
          </Card>
          <Card>
            <Label className="mb-4">Manrope · UI</Label>
            <p className="text-base text-text">
              Two trades opened within eight minutes after a loss.
            </p>
            <p className="mt-3 text-sm text-text-2">
              Secondary copy sits one tone down.
            </p>
          </Card>
          <Card>
            <Label className="mb-4">JetBrains Mono · figures</Label>
            <p className="font-mono text-base text-text">1111.11</p>
            <p className="font-mono text-base text-text">0000.00</p>
            <p className="mt-3 text-xs text-text-3">
              Both lines must be exactly the same width.
            </p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeading
          index="03"
          title="Metal & motion"
          subtitle="The metallic gradient and the sheen are reserved for signature elements. Both stop under reduced motion."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <Label className="mb-4">metal-gold</Label>
            <div className="metal-gold h-20 rounded-card" />
          </Card>
          <Card>
            <Label className="mb-4">metal-gold-text</Label>
            <p className="metal-gold-text font-serif text-5xl leading-none">
              24K
            </p>
          </Card>
          <Card engraved>
            <Label className="mb-4">engraved · sheen</Label>
            <p className="sheen font-serif text-4xl leading-none">KAVRIX</p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeading index="04" title="Primitives" />

        <Card>
          <Label className="mb-5">Buttons</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Try demo</Button>
            <Button size="lg">Open the Assay</Button>
            <Button variant="ghost">Cancel</Button>
            <Button disabled>Assaying…</Button>
          </div>
        </Card>

        <Card>
          <Label className="mb-5">Stats</Label>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Karat"
              value={formatKarat(21.4)}
              tone="gold"
              delta={`${formatKarat(0.8, { signed: true })} vs last week`}
              deltaDirection="up"
            />
            <Stat
              label="Karat gap"
              value={formatMoney(-1284.5)}
              tone="loss"
              delta={formatR(-4.2)}
              deltaDirection="down"
            />
            <Stat
              label="Net result"
              value={formatR(12.6)}
              tone="profit"
              mono
              delta={formatMoney(1512, { signed: true })}
              deltaDirection="up"
            />
            <Stat
              label="Average risk"
              value={formatPct(0.0094, { fromRatio: true })}
              mono
              delta="limit 1.0%"
            />
          </div>
        </Card>

        <Card flush>
          <div className="px-6 pt-6">
            <Label className="mb-5">Table</Label>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Trade</TableHeaderCell>
                <TableHeaderCell>Session</TableHeaderCell>
                <TableHeaderCell numeric>Risk</TableHeaderCell>
                <TableHeaderCell numeric>Result</TableHeaderCell>
                <TableHeaderCell numeric>P&amp;L</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SAMPLE_ROWS.map((row) => (
                <TableRow key={row.id}>
                  <TableCell numeric className="text-left">
                    {row.id}
                  </TableCell>
                  <TableCell>{row.session}</TableCell>
                  <TableCell numeric>{formatPct(row.risk)}</TableCell>
                  <TableCell
                    numeric
                    className={
                      row.result > 0
                        ? 'text-jade'
                        : row.result < 0
                          ? 'text-oxblood-text'
                          : undefined
                    }
                  >
                    {formatR(row.result)}
                  </TableCell>
                  <TableCell
                    numeric
                    className={
                      row.pnl > 0
                        ? 'text-jade'
                        : row.pnl < 0
                          ? 'text-oxblood-text'
                          : undefined
                    }
                  >
                    {formatMoney(row.pnl, { signed: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <Label className="mb-5">Card · default</Label>
            <p className="text-sm text-text-2">
              20px radius, 1px hairline border, no drop shadow.
            </p>
          </Card>
          <Card raised engraved>
            <Label className="mb-5">Card · raised, engraved</Label>
            <p className="text-sm text-text-2">
              Depth comes from a lighter surface, never from a shadow.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}
