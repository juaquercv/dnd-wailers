import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Leading icon (lucide element). */
  icon?: ReactNode;
  /** Trailing icon. */
  iconRight?: ReactNode;
  /** Full width. */
  block?: boolean;
  /** Use the display font (Cinzel) for epic calls to action. */
  epic?: boolean;
}

export const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, iconRight, block, epic, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'btn',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && 'w-full',
        epic && 'font-display font-semibold tracking-wider',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 'sm' : 'xs'} label="Procesando…" />
      ) : (
        icon && <span className="-ml-0.5 inline-flex shrink-0 [&>svg]:h-[1.1em] [&>svg]:w-[1.1em]">{icon}</span>
      )}
      {children !== undefined && children !== null && children !== false && <span className="truncate">{children}</span>}
      {iconRight && <span className="-mr-0.5 inline-flex shrink-0 [&>svg]:h-[1.1em] [&>svg]:w-[1.1em]">{iconRight}</span>}
    </button>
  );
});
