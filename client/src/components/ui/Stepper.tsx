import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';

export type StepperTone = 'default' | 'hp' | 'gold' | 'mana' | 'xp';

export interface StepperProps {
  value: number;
  /** next = clamped new value, delta = next - value (handy for delta-based socket events). */
  onChange: (next: number, delta: number) => void;
  min?: number;
  max?: number;
  /** Click step. Default 1. */
  step?: number;
  /** Shift-click step. Default 5. */
  bigStep?: number;
  label?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: StepperTone;
  /** Click the value to type a number ("+5"/"-3" are relative). Default true. */
  editable?: boolean;
  format?: (value: number) => ReactNode;
  /** Shown after the value, e.g. "/ 45". */
  suffix?: ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
}

const TONE: Record<StepperTone, { value: string; ring: string }> = {
  default: { value: 'text-parchment-50', ring: 'border-ink-500' },
  hp: { value: 'text-blood-300', ring: 'border-blood-600/60' },
  gold: { value: 'text-gold-300', ring: 'border-gold-700/60' },
  mana: { value: 'text-arcane-300', ring: 'border-arcane-600/60' },
  xp: { value: 'text-emerald-300', ring: 'border-emerald-700/60' },
};

const SIZE = {
  sm: { btn: 'h-6 w-6 [&>svg]:h-3 [&>svg]:w-3', value: 'min-w-[2.5rem] text-xs h-6', input: 'w-14 text-xs h-6' },
  md: { btn: 'h-8 w-8 [&>svg]:h-3.5 [&>svg]:w-3.5', value: 'min-w-[3.25rem] text-sm h-8', input: 'w-16 text-sm h-8' },
  lg: { btn: 'h-10 w-10 [&>svg]:h-4 [&>svg]:w-4', value: 'min-w-[4.5rem] text-lg h-10', input: 'w-20 text-lg h-10' },
} as const;

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

/**
 * − value + control for quick manual adjustments (HP, gold, mana…).
 * Click ±step, Shift-click ±bigStep, click the value to type it directly.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  bigStep = 5,
  label,
  size = 'md',
  tone = 'default',
  editable = true,
  format,
  suffix,
  disabled = false,
  className,
  title,
}: StepperProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [bump, setBump] = useState<'up' | 'down' | null>(null);
  const s = SIZE[size];
  const t = TONE[tone];

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!bump) return;
    const id = setTimeout(() => setBump(null), 220);
    return () => clearTimeout(id);
  }, [bump]);

  const apply = (next: number) => {
    const clamped = clamp(Math.round(next * 100) / 100, min, max);
    if (clamped === value) return;
    setBump(clamped > value ? 'up' : 'down');
    onChange(clamped, clamped - value);
  };

  const click = (dir: 1 | -1) => (e: MouseEvent) => apply(value + dir * (e.shiftKey ? bigStep : step));

  const commit = () => {
    setEditing(false);
    const raw = text.trim().replace(',', '.');
    if (!raw) return;
    const relative = raw.startsWith('+') || (raw.startsWith('-') && (min ?? -Infinity) >= 0);
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    apply(relative ? value + n : n);
  };

  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  const btnClass = clsx(
    'inline-flex shrink-0 items-center justify-center rounded-md border border-ink-500 bg-ink-700/90 text-parchment-200 transition',
    'hover:border-gold-700 hover:bg-ink-600 hover:text-parchment-50 active:scale-90 disabled:pointer-events-none disabled:opacity-35',
    s.btn,
  );

  return (
    <div className={clsx('inline-flex flex-col', className)} title={title}>
      {label && <span className="label">{label}</span>}
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          className={btnClass}
          disabled={disabled || atMin}
          onClick={click(-1)}
          title={`−${step} (Mayús: −${bigStep})`}
          aria-label={`Restar ${step}`}
        >
          <Minus />
        </button>
        {editing ? (
          <input
            ref={inputRef}
            value={text}
            inputMode="decimal"
            aria-label="Valor"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
            className={clsx('input px-1 py-0 text-center font-semibold tabular-nums', s.input)}
          />
        ) : (
          <button
            type="button"
            disabled={disabled || !editable}
            onClick={() => {
              setText(String(value));
              setEditing(true);
            }}
            title={editable ? 'Clic para escribir un valor (+5 / −3 relativos)' : undefined}
            className={clsx(
              'inline-flex items-center justify-center gap-1 rounded-md border bg-ink-950/60 px-2 font-semibold tabular-nums transition',
              'enabled:hover:border-gold-600 disabled:cursor-default',
              t.ring,
              t.value,
              s.value,
              bump === 'up' && 'animate-pop text-emerald-300',
              bump === 'down' && 'animate-shake text-blood-300',
            )}
          >
            <span>{format ? format(value) : value}</span>
            {suffix && <span className="text-[0.85em] font-normal text-parchment-400">{suffix}</span>}
          </button>
        )}
        <button
          type="button"
          className={btnClass}
          disabled={disabled || atMax}
          onClick={click(1)}
          title={`+${step} (Mayús: +${bigStep})`}
          aria-label={`Sumar ${step}`}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}
