import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  /** Stretch options to fill the width. */
  fill?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Compact single-choice button group. */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', fill = false, className, 'aria-label': ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx('inline-flex items-center gap-0.5 rounded-lg border border-ink-600 bg-ink-950/60 p-0.5', fill && 'flex w-full', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2 py-0.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3' : 'px-2.5 py-1 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5',
              fill && 'flex-1',
              active
                ? 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[inset_0_1px_0_rgba(243,234,214,0.08),0_0_0_1px_rgba(176,133,43,0.45)]'
                : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Inline "LABEL control" pair for the toolbar options row. */
export function ToolbarField({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-1.5', className)}>
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-parchment-400">{label}</span>
      {children}
    </div>
  );
}

/** Two-column grid for compact property fields. */
export function FieldGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 2 | 3; className?: string }) {
  return <div className={clsx('grid gap-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-3', className)}>{children}</div>;
}

/** Small read-only stat line ("12 elementos · 3 paredes"). */
export function StatLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('text-[11px] leading-snug text-parchment-400', className)}>{children}</p>;
}
