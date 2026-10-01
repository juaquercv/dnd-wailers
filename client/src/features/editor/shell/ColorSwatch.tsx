import { useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ColorPicker, Field } from '../../../components/ui';
import { MAP_PALETTE } from './labels';
import { Popover } from './Popover';

export interface ColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
  /** Accessible name and popover title. */
  label: string;
  palette?: string[];
  size?: 'sm' | 'md';
  /** Show the hex code next to the swatch. */
  showHex?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Compact color button that opens a palette + custom color popover. */
export function ColorSwatch({ value, onChange, label, palette = MAP_PALETTE, size = 'md', showHex = false, disabled, className }: ColorSwatchProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const box = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        title={`${label}: ${value}`}
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'inline-flex shrink-0 items-center gap-2 rounded-md border bg-ink-950/60 p-1 transition hover:border-gold-600 disabled:pointer-events-none disabled:opacity-45',
          open ? 'border-gold-500 ring-2 ring-gold-500/25' : 'border-ink-500',
          showHex && 'pr-2',
          className,
        )}
      >
        <span
          className={clsx(
            'relative overflow-hidden rounded border border-black/40 bg-[repeating-conic-gradient(#4a4239_0%_25%,#1c1915_0%_50%)] bg-[length:8px_8px]',
            box,
          )}
        >
          <span className="absolute inset-0" style={{ backgroundColor: value }} />
        </span>
        {showHex && <span className="font-mono text-[11px] uppercase text-parchment-200">{value}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={label} className="w-[15.5rem]">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-300">{label}</div>
        <ColorPicker value={value} onChange={onChange} palette={palette} size="sm" />
      </Popover>
    </>
  );
}

export interface ColorFieldProps extends Omit<ColorSwatchProps, 'showHex' | 'label'> {
  label: string;
  hint?: ReactNode;
}

/** Labeled color control for property panels. */
export function ColorField({ label, hint, className, ...rest }: ColorFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      <ColorSwatch label={label} showHex {...rest} />
    </Field>
  );
}
