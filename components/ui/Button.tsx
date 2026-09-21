'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Shared by Button and any link styled as one. */
export const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium ' +
  'transition-colors duration-200 select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ' +
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:opacity-40';

export const buttonVariant: Record<ButtonVariant, string> = {
  primary:
    'border border-gold text-gold hover:bg-gold hover:text-bg active:bg-gold-light',
  ghost:
    'border border-transparent text-text-2 hover:border-line hover:bg-surface-2 hover:text-text',
};

/** Minimum 44px tall for a comfortable hit target (CLAUDE.md §16). */
export const buttonSize: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-7 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        buttonBase,
        buttonVariant[variant],
        buttonSize[size],
        className,
      )}
      {...props}
    />
  );
}
