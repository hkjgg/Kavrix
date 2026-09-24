'use client';

import { useState } from 'react';
import { certificateFilename } from '@/components/viz/certificate';

/**
 * Under the certificate: the two PNG sizes, and a link to this month's
 * Wrapped. The downloads are plain links to the image route, so they work
 * without JavaScript; only "Copy link" needs it.
 */
export function CertificateActions({
  postHref,
  storyHref,
  serial,
  shareHref,
}: {
  postHref: string;
  storyHref: string;
  serial: string;
  shareHref: string;
}) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const button =
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-medium uppercase tracking-[2px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

  const copy = async () => {
    const url = `${window.location.origin}${shareHref}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <a href={postHref} download={certificateFilename(serial, 'post')} className={`${button} bg-gold text-bg hover:bg-gold-light`}>
          Download for post
        </a>
        <a href={storyHref} download={certificateFilename(serial, 'story')} className={`${button} border border-gold/60 text-gold hover:border-gold hover:text-gold-light`}>
          Download for story
        </a>
        <button type="button" onClick={() => void copy()} className={`${button} border border-line text-text-2 hover:border-gold hover:text-gold`}>
          Copy link
        </button>
      </div>
      <p aria-live="polite" className="min-h-4 font-mono text-[11px] text-text-3">
        {copied === 'copied' ? 'Link copied' : copied === 'failed' ? `Copy failed · ${shareHref}` : '1080 × 1350 · 1080 × 1920 · PNG'}
      </p>
    </div>
  );
}
