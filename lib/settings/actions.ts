'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { connectorPepper, generateConnectorToken } from '@/lib/connector/token';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseThresholds, thresholdsToRow, tokenNameSchema } from './thresholds';

/**
 * Settings' server actions. Each one runs as the signed-in user, so RLS
 * decides what it may touch; none of them uses the service role.
 */

export interface FormState {
  error: string | null;
  notice: string | null;
}

export interface TokenState extends FormState {
  /** The new token — returned once, to be shown once. */
  token: string | null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  if (supabase === null) return null;
  const { data } = await supabase.auth.getUser();
  return data.user === null ? null : { supabase, userId: data.user.id };
}

const SIGNED_OUT = 'Your session has ended. Sign in again.';

export async function saveThresholds(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseThresholds({
    riskLimitPercent: field(formData, 'riskLimitPercent'),
    dailyMaxTrades: field(formData, 'dailyMaxTrades'),
    newsWindowMinutes: field(formData, 'newsWindowMinutes'),
    rolloverWindowMinutes: field(formData, 'rolloverWindowMinutes'),
    serverUtcOffsetHours: field(formData, 'serverUtcOffsetHours'),
  });
  if (!parsed.ok) return { error: parsed.error, notice: null };

  const session = await signedIn();
  if (session === null) return { error: SIGNED_OUT, notice: null };
  const { error } = await session.supabase
    .from('settings')
    .upsert({ user_id: session.userId, ...thresholdsToRow(parsed.value), updated_at: new Date().toISOString() });
  if (error !== null) return { error: 'The thresholds could not be saved. Try again.', notice: null };

  revalidatePath('/', 'layout');
  return { error: null, notice: 'Saved. Every surface is now assayed against these thresholds.' };
}

export async function createToken(_: TokenState, formData: FormData): Promise<TokenState> {
  const name = tokenNameSchema.safeParse(field(formData, 'name'));
  if (!name.success) return { error: name.error.issues[0]?.message ?? 'Name the token.', notice: null, token: null };

  const pepper = connectorPepper();
  if (pepper === null) {
    return { error: 'Connector tokens are not configured on this deployment.', notice: null, token: null };
  }
  const session = await signedIn();
  if (session === null) return { error: SIGNED_OUT, notice: null, token: null };

  const generated = generateConnectorToken(pepper);
  const { error } = await session.supabase.from('connector_tokens').insert({
    user_id: session.userId,
    name: name.data,
    prefix: generated.prefix,
    token_hash: generated.hash,
  });
  if (error !== null) return { error: 'The token could not be created. Try again.', notice: null, token: null };

  revalidatePath('/settings');
  return {
    error: null,
    notice: 'Copy it now: this is the only time it is shown. Kavrix keeps only its hash.',
    token: generated.token,
  };
}

export async function revokeToken(formData: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(field(formData, 'id'));
  if (!id.success) return;
  const session = await signedIn();
  if (session === null) return;
  await session.supabase
    .from('connector_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id.data)
    .is('revoked_at', null);
  revalidatePath('/settings');
}

const optionalR = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? Number(value) : value),
  z.number({ message: 'Enter R as a number, or leave it empty.' }).min(-10).max(10).nullable(),
);

export async function saveEa(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      accountId: z.string().uuid(),
      magic: z.coerce.number().int().positive(),
      name: z.string().trim().min(1, 'Name the EA.').max(60, 'Keep the name under 60 characters.'),
      baselineExpectancyR: optionalR,
      baselineStdDevR: optionalR.refine((value) => value === null || value > 0, 'The dispersion must be above 0R.'),
    })
    .safeParse({
      accountId: field(formData, 'accountId'),
      magic: field(formData, 'magic'),
      name: field(formData, 'name'),
      baselineExpectancyR: field(formData, 'baselineExpectancyR'),
      baselineStdDevR: field(formData, 'baselineStdDevR'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.', notice: null };
  const { accountId, magic, name, baselineExpectancyR, baselineStdDevR } = parsed.data;
  if (baselineStdDevR !== null && baselineExpectancyR === null) {
    return { error: 'A dispersion needs the backtest expectancy beside it.', notice: null };
  }

  const session = await signedIn();
  if (session === null) return { error: SIGNED_OUT, notice: null };
  const { error, count } = await session.supabase
    .from('eas')
    .update(
      { name, baseline_expectancy_r: baselineExpectancyR, baseline_std_dev_r: baselineStdDevR },
      { count: 'exact' },
    )
    .eq('account_id', accountId)
    .eq('magic', magic);
  if (error !== null || count === 0) return { error: 'The EA could not be saved. Try again.', notice: null };

  revalidatePath('/', 'layout');
  return { error: null, notice: 'Saved.' };
}
