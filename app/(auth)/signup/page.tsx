import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthFrame, NotConfigured, OrDivider } from '@/components/auth/AuthFrame';
import { MagicLinkForm, PasswordForm } from '@/components/auth/AuthForms';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/paths';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Create an account — Kavrix',
  description: 'Create a Kavrix account and connect MetaTrader 5.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const search = await searchParams;
  const next = safeNextPath(typeof search.next === 'string' ? search.next : null);

  return (
    <AuthFrame
      title="Create an account"
      subtitle="Then connect MetaTrader 5. Kavrix reads your trades; it never places, changes or closes one."
      footer={
        <p>
          Already have an account?{' '}
          <Link href={`${LOGIN_PATH}?next=${encodeURIComponent(next)}`} className="text-gold hover:text-gold-light">
            Sign in
          </Link>
        </p>
      }
    >
      {isAuthConfigured() ? (
        <>
          <PasswordForm mode="signup" next={next} />
          <OrDivider />
          <MagicLinkForm intent="signup" next={next} />
        </>
      ) : (
        <NotConfigured />
      )}
    </AuthFrame>
  );
}
