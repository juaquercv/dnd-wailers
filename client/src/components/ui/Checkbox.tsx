import { useEffect, useId, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Mixed state (some children selected). */
  indeterminate?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

/** Themed checkbox backed by a real (visually hidden) input for accessibility. */
export function Checkbox({ checked, onChange, label, description, disabled, indeterminate = false, size = 'md', className, title }: CheckboxProps) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const box = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const on = checked || indeterminate;

  return (
    <label
      htmlFor={id}
      title={title}
      className={clsx(
        'group inline-flex cursor-pointer select-none items-start gap-2.5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={clsx(
            'flex items-center justify-center rounded border transition duration-150',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-ink-900',
            box,
            on
              ? 'border-gold-400 bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950'
              : 'border-ink-400 bg-ink-950/70 text-transparent group-hover:border-gold-600',
          )}
        >
          {indeterminate ? <Minus className="h-3 w-3" strokeWidth={3.5} /> : <Check className="h-3 w-3" strokeWidth={3.5} />}
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className={clsx('block text-parchment-100', size === 'sm' ? 'text-xs' : 'text-sm')}>{label}</span>}
          {description && <span className="mt-0.5 block text-xs leading-snug text-parchment-400">{description}</span>}
        </span>
      )}
    </label>
  );
}
