import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface FieldProps {
  label?: ReactNode;
  /** id of the control the label points to. */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Element shown at the right of the label (e.g. a small action). */
  labelAside?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error wrapper used by every form control. */
export function Field({ label, htmlFor, hint, error, labelAside, required, className, children }: FieldProps) {
  return (
    <div className={clsx('min-w-0', className)}>
      {(label || labelAside) && (
        <div className="flex items-end justify-between gap-2">
          {label ? (
            <label htmlFor={htmlFor} className="label">
              {label}
              {required && <span className="ml-0.5 text-blood-400">*</span>}
            </label>
          ) : (
            <span />
          )}
          {labelAside && <div className="mb-1 shrink-0 text-xs text-parchment-400">{labelAside}</div>}
        </div>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-blood-400">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-parchment-400">{hint}</p>
      ) : null}
    </div>
  );
}
