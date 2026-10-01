import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Field } from './Field';

interface NumberInputBase {
  min?: number;
  max?: number;
  /** Arrow-key step (Shift = ×10). Default 1. */
  step?: number;
  /** Round to integers. Default false. */
  integer?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  /** Unit or hint shown inside the field on the right ("kg", "px"…). */
  suffix?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  containerClassName?: string;
  id?: string;
  autoFocus?: boolean;
  title?: string;
  'aria-label'?: string;
  /** Called on blur (after commit). */
  onBlur?: () => void;
}

export interface NullableNumberInputProps extends NumberInputBase {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Empty field → null. */
  nullable: true;
}

export interface StrictNumberInputProps extends NumberInputBase {
  value: number;
  onChange: (value: number) => void;
  nullable?: false;
}

export type NumberInputProps = NullableNumberInputProps | StrictNumberInputProps;

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

function toText(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  return String(Math.round(v * 1e6) / 1e6).replace('.', ',');
}

function parse(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric field accepting "," or "." as decimal separator. Valid values within range are emitted
 * while typing; on blur the value is clamped and normalized. Arrow keys step (Shift ×10).
 */
export function NumberInput(props: NumberInputProps) {
  const {
    value,
    min,
    max,
    step = 1,
    integer = false,
    label,
    hint,
    error,
    placeholder,
    disabled,
    suffix,
    size = 'md',
    className,
    containerClassName,
    id,
    autoFocus,
    title,
    onBlur,
  } = props;
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(() => toText(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(toText(value));
  }, [value]);

  const emit = (n: number | null) => {
    if (props.nullable) props.onChange(n);
    else if (n !== null) props.onChange(n);
  };

  const normalize = (n: number) => clamp(integer ? Math.round(n) : n, min, max);

  const commit = () => {
    const parsed = parse(text);
    if (parsed === null) {
      if (props.nullable) {
        if (value !== null) emit(null);
        setText('');
      } else {
        setText(toText(value));
      }
      return;
    }
    const next = normalize(parsed);
    if (next !== value) emit(next);
    setText(toText(next));
  };

  const stepBy = (dir: 1 | -1, big: boolean) => {
    const base = parse(text) ?? (value ?? min ?? 0);
    const next = normalize(base + dir * step * (big ? 10 : 1));
    setText(toText(next));
    emit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
    } else if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape') {
      setText(toText(value));
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} className={containerClassName}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={placeholder ?? (props.nullable ? '—' : undefined)}
          disabled={disabled}
          autoFocus={autoFocus}
          title={title}
          aria-label={props['aria-label']}
          aria-invalid={error ? true : undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          className={clsx('input tabular-nums', size === 'sm' && 'input-sm', error && 'input-error', suffix ? 'pr-9' : undefined, className)}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
          }}
          onBlur={() => {
            focused.current = false;
            commit();
            onBlur?.();
          }}
          onChange={(e) => {
            const t = e.target.value;
            if (!/^[-+]?[\d\s.,]*$/.test(t)) return;
            setText(t);
            const parsed = parse(t);
            if (parsed === null) {
              if (props.nullable && t.trim() === '') emit(null);
              return;
            }
            const inRange = (min === undefined || parsed >= min) && (max === undefined || parsed <= max);
            if (inRange) emit(integer ? Math.round(parsed) : parsed);
          }}
          onKeyDown={onKeyDown}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-parchment-400">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}
