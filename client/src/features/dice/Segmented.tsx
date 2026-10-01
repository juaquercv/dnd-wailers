import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  /** Stretch to the full width (default true). */
  fill?: boolean;
  className?: string;
}

/** Compact segmented control (radio group) used by the dice and roller tools. */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel, fill = true, className }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx('flex gap-0.5 rounded-lg border border-ink-600 bg-ink-950/60 p-0.5', fill ? 'w-full' : 'inline-flex', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title ?? o.label}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5',
              fill && 'flex-1',
              active
                ? 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[0_0_0_1px_rgba(176,133,43,0.5)]'
                : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
            )}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
