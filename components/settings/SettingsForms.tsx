'use client';

import { useActionState, useState } from 'react';
import { buttonBase, buttonSize, buttonVariant } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { FormState, TokenState } from '@/lib/settings/actions';
import { createToken, revokeToken, saveEa, saveThresholds } from '@/lib/settings/actions';
import type { Thresholds } from '@/lib/settings/thresholds';
import { THRESHOLD_BOUNDS } from '@/lib/settings/thresholds';

const inputClass =
  'mt-2 block w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 font-mono text-sm text-text ' +
  'focus-visible:border-gold focus-visible:outline-none';
const labelClass = 'block text-[11px] font-medium uppercase tracking-[2px] text-text-3';

function Status({ state }: { state: FormState }) {
  return (
    <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm leading-relaxed">
      {state.error ? <span className="text-oxblood-text">{state.error}</span> : null}
      {state.notice ? <span className="text-text-2">{state.notice}</span> : null}
    </p>
  );
}

const THRESHOLD_FIELDS: readonly {
  name: keyof Thresholds;
  label: string;
  unit: string;
  hint: string;
}[] = [
  { name: 'riskLimitPercent', label: 'Risk limit', unit: '% of equity', hint: 'Risk pillar: full marks at or under it, none past 1.5×.' },
  { name: 'dailyMaxTrades', label: 'Daily maximum', unit: 'trades', hint: 'Overtrading: a day past it is a violating day.' },
  { name: 'newsWindowMinutes', label: 'News window', unit: 'min either side', hint: 'Around a high-impact USD release.' },
  { name: 'rolloverWindowMinutes', label: 'Rollover window', unit: 'min either side', hint: 'Around broker server midnight.' },
  { name: 'serverUtcOffsetHours', label: 'Broker offset', unit: 'hours from UTC', hint: 'The connector prints it in the Experts log when it starts.' },
];

export function ThresholdsForm({ initial }: { initial: Thresholds }) {
  const [state, action, pending] = useActionState(saveThresholds, { error: null, notice: null });
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {THRESHOLD_FIELDS.map((field) => {
          const bounds = THRESHOLD_BOUNDS[field.name];
          return (
            <div key={field.name}>
              <label htmlFor={`threshold-${field.name}`} className={labelClass}>
                {field.label} <span className="normal-case tracking-normal text-text-3">· {field.unit}</span>
              </label>
              <input
                id={`threshold-${field.name}`}
                name={field.name}
                type="number"
                inputMode="decimal"
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                defaultValue={initial[field.name]}
                required
                aria-describedby={`threshold-${field.name}-hint`}
                className={inputClass}
              />
              <p id={`threshold-${field.name}-hint`} className="mt-1.5 text-[11px] leading-relaxed text-text-3">
                {field.hint}
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <button type="submit" disabled={pending} className={cn(buttonBase, buttonVariant.primary, buttonSize.md)}>
          {pending ? 'Saving…' : 'Save thresholds'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

const TOKEN_INITIAL: TokenState = { error: null, notice: null, token: null };

export function TokenGenerator() {
  const [state, action, pending] = useActionState(createToken, TOKEN_INITIAL);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="token-name" className={labelClass}>
            Token name
          </label>
          <input id="token-name" name="name" type="text" maxLength={60} placeholder="Trading laptop" required className={inputClass} />
        </div>
        <button type="submit" disabled={pending} className={cn(buttonBase, buttonVariant.primary, buttonSize.md)}>
          {pending ? 'Generating…' : 'Generate token'}
        </button>
      </form>

      {state.token !== null ? (
        <div className="engraved flex flex-col gap-3 rounded-xl bg-bg p-4">
          <span className={labelClass}>Your new token</span>
          <div className="flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-gold">{state.token}</code>
            <button
              type="button"
              onClick={() => void copy(state.token ?? '')}
              className={cn(buttonBase, buttonVariant.ghost, 'min-h-9 border-line px-4 text-xs')}
            >
              {copied === state.token ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}
      <Status state={state} />
    </div>
  );
}

/** Revoking asks twice: a revoked token cannot be brought back. */
export function RevokeButton({ id, name }: { id: string; name: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <form action={revokeToken} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {armed ? (
        <>
          <button
            type="submit"
            className="rounded-full border border-oxblood px-3 py-1.5 text-[11px] font-medium uppercase tracking-[2px] text-oxblood-text hover:bg-oxblood/10"
            aria-label={`Confirm: revoke ${name}`}
          >
            Revoke for good
          </button>
          <button type="button" onClick={() => setArmed(false)} className="px-2 text-[11px] uppercase tracking-[2px] text-text-3 hover:text-text">
            Keep
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="rounded-full border border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-[2px] text-text-2 hover:border-gold hover:text-gold"
          aria-label={`Revoke ${name}`}
        >
          Revoke
        </button>
      )}
    </form>
  );
}

export interface EaFormProps {
  accountId: string;
  magic: number;
  name: string;
  baselineExpectancyR: number | null;
  baselineStdDevR: number | null;
}

export function EaForm({ accountId, magic, name, baselineExpectancyR, baselineStdDevR }: EaFormProps) {
  const [state, action, pending] = useActionState(saveEa, { error: null, notice: null });
  const id = `ea-${accountId.slice(0, 8)}-${magic}`;
  return (
    <form action={action} className="grid items-end gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0 sm:grid-cols-[6rem_minmax(0,1fr)_9rem_9rem_auto]">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="magic" value={magic} />
      <div>
        <span className={labelClass}>Magic</span>
        <span className="mt-2 block py-2.5 font-mono text-sm text-text-2">{magic}</span>
      </div>
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
        <input id={`${id}-name`} name="name" type="text" maxLength={60} defaultValue={name} required className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-exp`} className={labelClass}>Backtest exp. · R</label>
        <input id={`${id}-exp`} name="baselineExpectancyR" type="number" step="0.01" defaultValue={baselineExpectancyR ?? ''} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-sd`} className={labelClass}>Dispersion · R</label>
        <input id={`${id}-sd`} name="baselineStdDevR" type="number" step="0.01" min="0.01" defaultValue={baselineStdDevR ?? ''} className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={cn(buttonBase, buttonVariant.ghost, buttonSize.md, 'border-line')}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      <div className="sm:col-span-5">
        <Status state={state} />
      </div>
    </form>
  );
}
