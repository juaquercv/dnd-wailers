import { useEffect, useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { ROULETTE_PALETTE } from '@wailers/shared';
import { Field } from './Field';

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: ReactNode;
  /** Swatches (default: ROULETTE_PALETTE). */
  palette?: string[];
  /** Show the native picker + hex field. Default true. */
  allowCustom?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function normalizeHex(input: string): string | null {
  let t = input.trim();
  if (!t.startsWith('#')) t = `#${t}`;
  if (/^#[0-9a-f]{3}$/i.test(t)) t = `#${t.slice(1).split('').map((c) => c + c).join('')}`;
  return HEX_RE.test(t) ? t.toLowerCase() : null;
}

/** Palette swatches + native color input + hex text field. */
export function ColorPicker({
  value,
  onChange,
  label,
  palette = ROULETTE_PALETTE,
  allowCustom = true,
  disabled,
  size = 'md',
  className,
}: ColorPickerProps) {
  const id = useId();
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const current = value.toLowerCase();
  const sw = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <Field label={label} htmlFor={id} className={className}>
      <div className={clsx('flex flex-col gap-2', disabled && 'pointer-events-none opacity-50')}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colores">
          {palette.map((c) => {
            const selected = c.toLowerCase() === current;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={c}
                title={c}
                onClick={() => onChange(c)}
                className={clsx(
                  'relative flex items-center justify-center rounded-md border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:scale-110',
                  sw,
                  selected && 'ring-2 ring-gold-300 ring-offset-1 ring-offset-ink-900',
                )}
                style={{ backgroundColor: c }}
              >
                {selected && <Check className="h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        {allowCustom && (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={normalizeHex(value) ?? '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-10 shrink-0 rounded-md border border-ink-500 bg-ink-950 p-0.5"
              aria-label="Color personalizado"
            />
            <input
              type="text"
              value={hex}
              spellCheck={false}
              maxLength={7}
              aria-label="Código hexadecimal"
              className="input input-sm w-24 font-mono uppercase"
              onChange={(e) => {
                setHex(e.target.value);
                const n = normalizeHex(e.target.value);
                if (n && n.length === 7 && e.target.value.replace('#', '').length === 6) onChange(n);
              }}
              onBlur={() => {
                const n = normalizeHex(hex);
                if (n) onChange(n);
                else setHex(value);
              }}
            />
          </div>
        )}
      </div>
    </Field>
  );
}
