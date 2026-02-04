'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IconButtonProps {
  icon: LucideIcon;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function IconButton({
  icon: Icon,
  onClick,
  className,
  size = 'md',
  disabled,
}: IconButtonProps) {
  const sizeClasses = {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-3',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        className
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
