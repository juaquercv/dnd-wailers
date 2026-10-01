import { useId, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { Field } from './Field';

export type SelectValue = string | number | null;

export interface SelectOption<T extends SelectValue = string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Optional native optgroup label. */
  group?: string;
}

export interface SelectProps<T extends SelectValue = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shown when the current value matches no option. */
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  containerClassName?: string;
  id?: string;
  title?: string;
  'aria-label'?: string;
}

/** Native <select> with themed styling. Values may be strings, numbers or null (mapped by index). */
export function Select<T extends SelectValue = string>({
  value,
  onChange,
  options,
  label,
  hint,
  error,
  placeholder,
  disabled,
  size = 'md',
  className,
  containerClassName,
  id,
  title,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const selectedIndex = options.findIndex((o) => o.value === value);

  const groups: { name: string | null; items: { opt: SelectOption<T>; index: number }[] }[] = [];
  options.forEach((opt, index) => {
    const name = opt.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push({ opt, index });
    else groups.push({ name, items: [{ opt, index }] });
  });

  const renderOption = ({ opt, index }: { opt: SelectOption<T>; index: number }) => (
    <option key={index} value={String(index)} disabled={opt.disabled} className="bg-ink-900 text-parchment-100">
      {opt.label}
    </option>
  );

  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} className={containerClassName}>
      <div className="relative">
        <select
          id={selectId}
          value={selectedIndex >= 0 ? String(selectedIndex) : ''}
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const opt = options[Number(e.target.value)];
            if (opt) onChange(opt.value);
          }}
          className={clsx(
            'input cursor-pointer appearance-none pr-8',
            size === 'sm' && 'input-sm pr-7',
            selectedIndex < 0 && 'text-parchment-400',
            error && 'input-error',
            className,
          )}
        >
          {selectedIndex < 0 && (
            <option value="" disabled hidden>
              {placeholder ?? 'Selecciona…'}
            </option>
          )}
          {groups.map((g, gi) =>
            g.name ? (
              <optgroup key={`g-${gi}`} label={g.name} className="bg-ink-900 text-parchment-300">
                {g.items.map(renderOption)}
              </optgroup>
            ) : (
              g.items.map(renderOption)
            ),
          )}
        </select>
        <ChevronDown
          aria-hidden
          className={clsx(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-parchment-400',
            size === 'sm' ? 'right-2 h-3.5 w-3.5' : 'right-2.5 h-4 w-4',
          )}
        />
      </div>
    </Field>
  );
}
