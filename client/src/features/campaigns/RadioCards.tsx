import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';

export interface RadioCardOption<T extends string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Hex accent used for the icon tile and the selected glow. */
  accent?: string;
  /** Small element at the right of the title (badge, hint). */
  aside?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: RadioCardOption<T>[];
  /** Grid columns on wide screens. Default 2. */
  columns?: 1 | 2 | 3 | 4;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

const COLUMNS: Record<NonNullable<RadioCardsProps<string>['columns']>, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
};

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Accessible radio group rendered as selectable cards with icon, title and explanation. */
export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: RadioCardsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const enabled = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
    if (enabled.length === 0) return;
    const pos = Math.max(0, enabled.findIndex(({ o }) => o.value === value));
    let next = pos;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (pos + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (pos - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.o.value);
    refs.current[target.i]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className={clsx('grid gap-2.5', COLUMNS[columns], className)}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const accent = opt.accent ?? '#e9c063';
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!options.some((o) => o.value === value) && i === 0) ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'group relative flex w-full items-start gap-3 rounded-xl border text-left transition duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
              'disabled:cursor-not-allowed disabled:opacity-45',
              size === 'sm' ? 'p-2.5' : 'p-3.5',
              selected
                ? 'border-gold-500/70 bg-gradient-to-b from-ink-700/90 to-ink-800/90'
                : 'border-ink-600 bg-ink-950/40 hover:border-ink-400 hover:bg-ink-800/70',
            )}
            style={
              selected
                ? { boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.35)}, 0 10px 28px -14px ${hexToRgba(accent, 0.75)}` }
                : undefined
            }
          >
            {opt.icon && (
              <span
                className={clsx(
                  'flex shrink-0 items-center justify-center rounded-lg border transition',
                  size === 'sm' ? 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4' : 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5',
                )}
                style={{
                  color: accent,
                  borderColor: hexToRgba(accent, selected ? 0.55 : 0.3),
                  background: hexToRgba(accent, selected ? 0.16 : 0.08),
                }}
              >
                {opt.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span
                  className={clsx(
                    'font-display font-semibold tracking-wide',
                    size === 'sm' ? 'text-[13px]' : 'text-sm',
                    selected ? 'text-gold-200' : 'text-parchment-100',
                  )}
                >
                  {opt.title}
                </span>
                {opt.aside}
              </span>
              {opt.description && (
                <span className={clsx('mt-0.5 block leading-snug text-parchment-300', size === 'sm' ? 'text-[11px]' : 'text-xs')}>
                  {opt.description}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className={clsx(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
                selected ? 'border-gold-400 bg-gold-sheen text-ink-950' : 'border-ink-500 text-transparent group-hover:border-ink-400',
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3.5} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
