import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons / links. */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Friendly placeholder for empty lists and missing content. */
export function EmptyState({ icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex animate-fade-in flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-3 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {icon && (
        <div
          className={clsx(
            'flex items-center justify-center rounded-full border border-gold-700/40 bg-gradient-to-b from-ink-700 to-ink-800 text-gold-400 shadow-[0_0_30px_-8px_rgba(212,166,63,0.45)]',
            compact ? 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5' : 'h-16 w-16 [&>svg]:h-7 [&>svg]:w-7',
          )}
        >
          {icon}
        </div>
      )}
      <div className={clsx('font-display font-semibold text-parchment-100', compact ? 'text-sm' : 'text-lg')}>{title}</div>
      {description && (
        <div className={clsx('max-w-md text-parchment-300', compact ? 'text-xs' : 'text-sm')}>{description}</div>
      )}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
