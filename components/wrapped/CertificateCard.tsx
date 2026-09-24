import { AssayCertificate, PAGE_FONTS } from '@/components/viz/AssayCertificate';
import type { CertificateData, CertificateFormat } from '@/components/viz/certificate';
import { CERTIFICATE_FORMATS } from '@/components/viz/certificate';

/**
 * The Assay Certificate on the page: the exact tree the PNG route renders,
 * laid out at export size (1080 wide) and scaled to its box with one
 * transform (`.cert-canvas` in `app/globals.css`). The box keeps the export's
 * aspect ratio, so the page never shifts and what is on screen is what
 * downloads.
 */
export function CertificateCard({
  data,
  alt,
  format = 'post',
  idPrefix,
  motion = false,
}: {
  data: CertificateData;
  alt: string;
  format?: CertificateFormat;
  idPrefix: string;
  motion?: boolean;
}) {
  const { width, height } = CERTIFICATE_FORMATS[format];
  return (
    <figure className="cert-frame" role="img" aria-label={alt} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="cert-canvas" aria-hidden="true" style={{ width, height }}>
        <AssayCertificate data={data} format={format} fonts={PAGE_FONTS} idPrefix={idPrefix} motion={motion} />
      </div>
    </figure>
  );
}
