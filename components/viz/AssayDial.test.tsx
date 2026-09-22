import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExplainProvider } from '@/components/assay/ExplainProvider';
import { AssayDial } from './AssayDial';
import { angleForKarat } from './dial';

/**
 * The dial's two states. `/demo` only ever renders the scored one, so the
 * "Assaying…" face has no other cover.
 */

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <ExplainProvider index={{}}>{node}</ExplainProvider>,
  );
}

describe('AssayDial', () => {
  it('renders the score, the tier and the week-on-week move', () => {
    const markup = render(
      <AssayDial
        karat={18.4}
        tierLabel="18K · Solid"
        deltaKarat={-1.2}
        tradeCount={44}
        minimumTrades={10}
        periodLabel="Karat · 30 days"
        explainId="karat"
      />,
    );

    expect(markup).toContain('18.4K');
    expect(markup).toContain('18K · Solid');
    expect(markup).toContain('−1.2K');
    expect(markup).toContain(`rotate(${angleForKarat(18.4)}deg)`);
    expect(markup).toContain('Karat 18.4K, 18K Solid, down 1.2K vs last week');
  });

  it('sweeps the hand from the 0K stop to the value, and nowhere else', () => {
    const markup = render(
      <AssayDial
        karat={18.4}
        tierLabel="18K · Solid"
        deltaKarat={0.4}
        tradeCount={44}
        minimumTrades={10}
        periodLabel="Karat · 30 days"
        explainId="karat"
      />,
    );

    // Both the hand and its shadow carry the same sweep.
    expect(markup.match(/class="enter-hand"/g)).toHaveLength(2);
    expect(markup).toContain(`--hand-from:${angleForKarat(0)}deg`);
    expect(markup).toContain(`--hand-to:${angleForKarat(18.4)}deg`);
  });

  it('builds the face from gradients and filters only — no images', () => {
    const markup = render(
      <AssayDial
        karat={23.1}
        tierLabel="22K · Refined"
        deltaKarat={0.3}
        tradeCount={77}
        minimumTrades={10}
        periodLabel="Karat · 30 days"
        explainId="karat"
      />,
    );

    expect(markup).not.toContain('<image');
    expect(markup).not.toContain('<img');
    for (const id of ['bezel', 'chamfer', 'face', 'rim', 'sheen', 'medallion', 'cap', 'hand-lit']) {
      expect(markup).toContain(`id="kavrix-dial-${id}"`);
    }
  });

  it('shows "Assaying…" and how far off a score is, with no hand on the face', () => {
    const markup = render(
      <AssayDial
        karat={null}
        tierLabel={null}
        deltaKarat={null}
        tradeCount={4}
        minimumTrades={10}
        periodLabel="Karat · 30 days"
        explainId="karat"
      />,
    );

    expect(markup).toContain('Assaying…');
    expect(markup).toContain('4 of 10 trades');
    // No hand, no shadow of one, no cap on the pivot it would turn on.
    expect(markup).not.toContain('enter-hand');
    expect(markup).not.toContain('--hand-to');
    expect(markup).not.toContain('url(#kavrix-dial-hand-lit)');
    // And nothing pretends to be a score.
    expect(markup).not.toContain('0.0K');
  });
});
