import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: ReactNode;
  /** Tooltip and accessible label (required). */
  title: string;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Toggled/pressed visual state. */
  active?: boolean;
  loading?: boolean;
  /** Small counter/dot in the corner. */
  badge?: ReactNode;
}

const SIZE: Record<NonNullable<IconButtonProps['size']>, string> = {
  xs: 'h-6 w-6 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5',
  sm: 'h-8 w-8 rounded-md [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-9 w-9 rounded-lg [&_svg]:h-[18px] [&_svg]:w-[18px]',
  lg: 'h-11 w-11 rounded-xl [&_svg]:h-5 [&_svg]:w-5',
};

const VARIANT: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'border-transparent bg-transparent text-parchment-300 hover:bg-ink-700/80 hover:text-parchment-50',
  secondary: 'border-ink-500 bg-ink-700/90 text-parchment-200 hover:border-gold-700 hover:bg-ink-600 hover:text-parchment-50',
  primary: 'border-gold-400/60 bg-gold-sheen text-ink-950 hover:brightness-110',
  danger: 'border-transparent bg-transparent text-blood-400 hover:bg-blood-600/20 hover:text-blood-300',
};

/** Square icon-only button with a native tooltip (title) and aria-label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, title, variant = 'ghost', size = 'md', active, loading, badge, className, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled || loading}
      className={clsx(
        'relative inline-flex shrink-0 select-none items-center justify-center border transition duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        SIZE[size],
        VARIANT[variant],
        active && 'border-gold-600/70 bg-gold-500/15 text-gold-300 shadow-[inset_0_0_0_1px_rgba(233,192,99,0.25)] hover:bg-gold-500/20 hover:text-gold-200',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="xs" /> : icon}
      {badge !== undefined && badge !== null && badge !== false && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blood-500 px-1 text-[10px] font-bold leading-none text-parchment-50 ring-2 ring-ink-900">
          {badge}
        </span>
      )}
    </button>
  );
});
