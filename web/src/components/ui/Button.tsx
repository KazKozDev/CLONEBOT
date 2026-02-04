'use client';

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed',
        variant === 'primary' &&
          'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
        variant === 'secondary' &&
          'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border)]',
        variant === 'ghost' &&
          'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
        variant === 'danger' &&
          'bg-[var(--error)] text-white hover:opacity-90',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
