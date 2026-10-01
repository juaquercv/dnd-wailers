import { useId, type ReactNode } from 'react';
import clsx from 'clsx';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Put the switch after the label (settings rows). Default false. */
  labelFirst?: boolean;
  title?: string;
}

/** On/off switch (role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled, size = 'md', className, labelFirst = false, title }: ToggleProps) {
  const id = useId();
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const shift = size === 'sm' ? 'translate-x-3' : 'translate-x-4';

  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === 'string' ? label : undefined}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border p-px transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        track,
        checked
          ? 'border-gold-500/70 bg-gradient-to-r from-gold-600 to-gold-400 shadow-[0_0_10px_-2px_rgba(233,192,99,0.6)]'
          : 'border-ink-500 bg-ink-700',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'inline-block rounded-full shadow transition-transform duration-200 ease-out',
          knob,
          checked ? clsx(shift, 'bg-parchment-50') : 'translate-x-0 bg-parchment-300',
        )}
      />
    </button>
  );

  if (!label && !description) return <span className={className}>{sw}</span>;

  return (
    <div className={clsx('flex items-start gap-3', labelFirst && 'flex-row-reverse justify-between', className)}>
      <span className="pt-0.5">{sw}</span>
      <label htmlFor={id} className={clsx('min-w-0 flex-1 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-60')}>
        {label && <span className={clsx('block text-parchment-100', size === 'sm' ? 'text-xs' : 'text-sm')}>{label}</span>}
        {description && <span className="mt-0.5 block text-xs leading-snug text-parchment-400">{description}</span>}
      </label>
    </div>
  );
}
