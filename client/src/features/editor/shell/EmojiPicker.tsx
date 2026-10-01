import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MARKER_EMOJIS } from './labels';
import { Popover } from './Popover';

export interface EmojiGridProps {
  value: string;
  onChange: (emoji: string) => void;
  emojis?: string[];
  /** Allow typing any other emoji. Default true. */
  allowCustom?: boolean;
  className?: string;
}

/** Grid of fantasy emojis plus a free field for any other emoji. */
export function EmojiGrid({ value, onChange, emojis = MARKER_EMOJIS, allowCustom = true, className }: EmojiGridProps) {
  const [custom, setCustom] = useState('');
  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-10 gap-0.5" role="radiogroup" aria-label="Iconos">
        {emojis.map((emoji) => {
          const selected = emoji === value;
          return (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={emoji}
              title={emoji}
              onClick={() => onChange(emoji)}
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-md text-base leading-none transition hover:scale-110 hover:bg-ink-700',
                selected && 'bg-gold-500/20 ring-1 ring-gold-400',
              )}
            >
              {emoji}
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = custom.trim();
            if (v) {
              onChange(Array.from(v).slice(0, 4).join(''));
              setCustom('');
            }
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Otro emoji…"
            aria-label="Otro emoji"
            maxLength={8}
            className="input input-sm flex-1"
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!custom.trim()}>
            Usar
          </button>
        </form>
      )}
    </div>
  );
}

export interface EmojiButtonProps {
  value: string;
  onChange: (emoji: string) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Button showing the current emoji; opens the emoji grid in a popover. */
export function EmojiButton({ value, onChange, label, size = 'md', className }: EmojiButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const lastValue = useRef(value);
  useEffect(() => {
    // Close once a new emoji is picked.
    if (lastValue.current !== value) setOpen(false);
    lastValue.current = value;
  }, [value]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-md border bg-ink-950/60 leading-none transition hover:border-gold-600',
          size === 'sm' ? 'h-7 w-7 text-base' : 'h-9 w-9 text-xl',
          open ? 'border-gold-500 ring-2 ring-gold-500/25' : 'border-ink-500',
          className,
        )}
      >
        {value || '📍'}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={label} className="w-[19.5rem]">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-300">{label}</div>
        <EmojiGrid value={value} onChange={onChange} />
      </Popover>
    </>
  );
}
