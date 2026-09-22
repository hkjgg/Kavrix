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
    // No hand: nothing on the face is rotated.
    expect(markup).not.toContain('rotate(');
    // And nothing pretends to be a score.
    expect(markup).not.toContain('0.0K');
  });
});
