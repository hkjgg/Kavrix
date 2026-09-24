import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthFrame, NotConfigured, OrDivider } from '@/components/auth/AuthFrame';
import { MagicLinkForm, PasswordForm } from '@/components/auth/AuthForms';
import { SIGNUP_PATH, safeNextPath } from '@/lib/auth/paths';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Sign in — Kavrix',
  description: 'Sign in to your Kavrix account.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const search = await searchParams;
  const next = safeNextPath(typeof search.next === 'string' ? search.next : null);
  const linkFailed = search.error === 'link';

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Your Assay, your Ledger, your Vault — measured from your own MetaTrader 5 history."
      footer={
        <>
          <p>
            New to Kavrix?{' '}
            <Link href={`${SIGNUP_PATH}?next=${encodeURIComponent(next)}`} className="text-gold hover:text-gold-light">
              Create an account
            </Link>
          </p>
          <p>
            Or look around first: <Link href="/demo" className="text-gold hover:text-gold-light">try the demo</Link>, no account needed.
          </p>
        </>
      }
    >
      {isAuthConfigured() ? (
        <>
          {linkFailed ? (
            <p role="alert" className="text-sm text-oxblood-text">
              That link has expired or was already used. Ask for a new one below.
            </p>
          ) : null}
          <PasswordForm mode="login" next={next} />
          <OrDivider />
          <MagicLinkForm intent="login" next={next} />
        </>
      ) : (
        <NotConfigured />
      )}
    </AuthFrame>
  );
}
