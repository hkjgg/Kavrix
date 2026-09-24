'use client';

import { useActionState } from 'react';
import type { AuthFormState } from '@/lib/auth/actions';
import { sendMagicLink, signInWithPassword, signUpWithPassword } from '@/lib/auth/actions';
import { buttonBase, buttonSize, buttonVariant } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const INITIAL: AuthFormState = { error: null, notice: null };

const inputClass =
  'mt-2 block w-full rounded-xl border border-line bg-bg px-4 py-3 font-mono text-sm text-text placeholder:text-text-3 ' +
  'focus-visible:border-gold focus-visible:outline-none';

function Field({
  id,
  label,
  type,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-medium uppercase tracking-[3px] text-text-3">
        {label}
      </label>
      <input id={id} name={id.split('-').pop()} type={type} autoComplete={autoComplete} required className={inputClass} />
      {hint ? <p className="mt-1.5 text-[11px] text-text-3">{hint}</p> : null}
    </div>
  );
}

function Status({ state }: { state: AuthFormState }) {
  return (
    <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm leading-relaxed">
      {state.error ? <span className="text-oxblood-text">{state.error}</span> : null}
      {state.notice ? <span className="text-text-2">{state.notice}</span> : null}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonBase, buttonVariant.primary, buttonSize.md, 'w-full')}
    >
      {pending ? 'One moment…' : children}
    </button>
  );
}

/** Email and password — sign in, or create an account. */
export function PasswordForm({ mode, next }: { mode: 'login' | 'signup'; next: string }) {
  const [state, action, pending] = useActionState(mode === 'login' ? signInWithPassword : signUpWithPassword, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field id={`${mode}-email`} label="Email" type="email" autoComplete="email" />
      <Field
        id={`${mode}-password`}
        label="Password"
        type="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
      />
      <Submit pending={pending}>{mode === 'login' ? 'Sign in' : 'Create account'}</Submit>
      <Status state={state} />
    </form>
  );
}

/** A one-time link by email, instead of a password. */
export function MagicLinkForm({ intent, next }: { intent: 'login' | 'signup'; next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="intent" value={intent} />
      <Field id={`${intent}-magic-email`} label="Email" type="email" autoComplete="email" />
      <button
        type="submit"
        disabled={pending}
        className={cn(buttonBase, buttonVariant.ghost, buttonSize.md, 'w-full border-line')}
      >
        {pending ? 'Sending…' : 'Email me a link'}
      </button>
      <Status state={state} />
    </form>
  );
}
