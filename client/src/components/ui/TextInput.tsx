import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Field } from './Field';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Leading icon inside the field. */
  icon?: ReactNode;
  /** Trailing element inside the field (unit, button…). */
  rightSlot?: ReactNode;
  size?: 'sm' | 'md';
  /** Convenience: receives the string value. */
  onValueChange?: (value: string) => void;
  containerClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, icon, rightSlot, size = 'md', onValueChange, onChange, containerClassName, className, id, required, type, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required} className={containerClassName}>
      <div className="relative">
        {icon && (
          <span
            className={clsx(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-parchment-400 [&>svg]:h-4 [&>svg]:w-4',
              size === 'sm' ? 'left-2' : 'left-3',
            )}
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type ?? 'text'}
          required={required}
          aria-invalid={error ? true : undefined}
          className={clsx(
            'input',
            size === 'sm' && 'input-sm',
            error && 'input-error',
            icon && (size === 'sm' ? 'pl-7' : 'pl-9'),
            rightSlot && 'pr-10',
            className,
          )}
          onChange={(e) => {
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
          {...rest}
        />
        {rightSlot && (
          <span className="absolute inset-y-0 right-1.5 flex items-center text-xs text-parchment-400">{rightSlot}</span>
        )}
      </div>
    </Field>
  );
});
