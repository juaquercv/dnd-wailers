import { useId, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Fired on release (pointer up / key up) for expensive updates. */
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  /** Value label formatter (default: number, or percentage when 0..1). */
  formatValue?: (value: number) => string;
  showValue?: boolean;
  disabled?: boolean;
  /** Leading icon (e.g. volume). */
  icon?: ReactNode;
  className?: string;
  title?: string;
  'aria-label'?: string;
}

/** Range input with a gold fill and a value label. */
export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 1,
  step,
  label,
  formatValue,
  showValue = true,
  disabled,
  icon,
  className,
  title,
  'aria-label': ariaLabel,
}: SliderProps) {
  const id = useId();
  const effectiveStep = step ?? (max - min <= 1 ? 0.01 : 1);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const display = formatValue
    ? formatValue(value)
    : max === 1 && min === 0
      ? `${Math.round(value * 100)}%`
      : String(Math.round(value * 100) / 100).replace('.', ',');
  const style = { '--range-fill': `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties;

  return (
    <div className={clsx('min-w-0', className)} title={title}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={id} className="label mb-0">
            {label}
          </label>
          {showValue && <span className="text-xs font-semibold tabular-nums text-gold-300">{display}</span>}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        {icon && <span className="shrink-0 text-parchment-300 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={effectiveStep}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          aria-valuetext={display}
          style={style}
          className="range-gold min-w-0 flex-1"
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        />
        {showValue && !label && (
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-gold-300">{display}</span>
        )}
      </div>
    </div>
  );
}
