'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/site';
import { LOGIN_PATH, safeNextPath } from './paths';

/**
 * Sign-up and sign-in: email and password, or a magic link (Supabase Auth).
 * Every action returns calm, plain copy — never a raw provider error, and
 * never whether an email has an account.
 */

export interface AuthFormState {
  error: string | null;
  notice: string | null;
}

const NOT_CONFIGURED: AuthFormState = {
  error: 'Accounts are not configured on this deployment. The demo is open to everyone.',
  notice: null,
};

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(8, 'Use at least 8 characters.').max(128, 'Use at most 128 characters.');

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithPassword(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.object({ email, password: z.string().min(1, 'Enter your password.') }).safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.', notice: null };

  const supabase = await createSupabaseServerClient();
  if (supabase === null) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error !== null) {
    return {
      error: /confirm/i.test(error.message)
        ? 'Confirm your email first — the link is in your inbox.'
        : 'That email and password do not match an account.',
      notice: null,
    };
  }
  redirect(safeNextPath(field(formData, 'next')));
}

export async function signUpWithPassword(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.object({ email, password }).safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.', notice: null };

  const supabase = await createSupabaseServerClient();
  if (supabase === null) return NOT_CONFIGURED;
  const next = safeNextPath(field(formData, 'next'));
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error !== null) {
    return {
      error: /weak|password/i.test(error.message) ? error.message : 'The account could not be created. Try again in a moment.',
      notice: null,
    };
  }
  // With email confirmation on, there is no session until the link is followed.
  if (data.session === null) {
    return { error: null, notice: `Check ${parsed.data.email} — the confirmation link signs you in.` };
  }
  redirect(next);
}

export async function sendMagicLink(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(field(formData, 'email'));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email address.', notice: null };

  const supabase = await createSupabaseServerClient();
  if (supabase === null) return NOT_CONFIGURED;
  const next = safeNextPath(field(formData, 'next'));
  const createUser = field(formData, 'intent') === 'signup';
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), next), shouldCreateUser: createUser },
  });
  if (error !== null && /rate|seconds/i.test(error.message)) {
    return { error: 'A link was sent a moment ago. Wait a minute before asking for another.', notice: null };
  }
  // The same words whether or not the address has an account.
  return { error: null, notice: `If ${parsed.data} can sign in, a link is on its way. It works once.` };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase !== null) await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
