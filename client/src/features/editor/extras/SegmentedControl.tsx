import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: 'sm' | 'md';
  /** Stretch segments to fill the width. */
  fill?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Compact single-choice control (radio group styled as joined buttons). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  fill = false,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const enabled = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
    const pos = Math.max(0, enabled.findIndex(({ o }) => o.value === value));
    const next = enabled[(pos + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    if (!next) return;
    e.preventDefault();
    onChange(next.o.value);
    refs.current[next.i]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={clsx(
        'inline-flex max-w-full items-center gap-1 rounded-lg border border-ink-600 bg-ink-950/60 p-1',
        fill && 'flex w-full',
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70 disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'px-2.5 py-1 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5' : 'px-3 py-1.5 text-sm [&_svg]:h-4 [&_svg]:w-4',
              fill && 'flex-1',
              active
                ? 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[inset_0_1px_0_rgba(243,234,214,0.08),0_0_0_1px_rgba(176,133,43,0.45)]'
                : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
