import { signOut } from '@/lib/auth/actions';

/** Who is signed in, and the way out. A real form: it works without script. */
export function SignOutButton({ email }: { email: string | null }) {
  return (
    <form action={signOut} className="flex items-center gap-3">
      {email ? <span className="hidden max-w-[16rem] truncate font-mono text-[11px] text-text-3 xl:block">{email}</span> : null}
      <button
        type="submit"
        className="rounded-full border border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-[2px] text-text-2 transition-colors hover:border-gold hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        Sign out
      </button>
    </form>
  );
}
