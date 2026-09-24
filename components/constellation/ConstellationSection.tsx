import { SectionHeading } from '@/components/ui';
import { ConstellationBody } from './ConstellationBody';
import type { ConstellationView } from './constellation';

/** The Constellation's page, heading and all, for the demo and for a real account alike. */
export function ConstellationSection({ view }: { view: ConstellationView }) {
  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        index="04"
        title="Constellation"
        as="h1"
        subtitle="Every Expert Advisor, grouped by magic number, as a star: its brightness is its Fineness, its size the volume it traded, and the closer two stars sit, the more their daily P&L moves together. EA trades are outside the Karat Score."
      />

      <ConstellationBody view={view} />
    </div>
  );
}
