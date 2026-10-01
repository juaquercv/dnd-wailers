import { forwardRef, useCallback, useEffect, useId, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Field } from './Field';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Grow with content up to maxRows. */
  autoResize?: boolean;
  maxRows?: number;
  onValueChange?: (value: string) => void;
  containerClassName?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, autoResize = false, maxRows = 16, onValueChange, onChange, containerClassName, className, id, rows = 3, required, value, ...rest },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoResize) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = lineHeight * maxRows + 18;
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }, [autoResize, maxRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <Field label={label} htmlFor={areaId} hint={hint} error={error} required={required} className={containerClassName}>
      <textarea
        ref={setRefs}
        id={areaId}
        rows={rows}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        className={clsx('input scroll-thin min-h-[2.5rem] leading-relaxed', autoResize ? 'resize-none' : 'resize-y', error && 'input-error', className)}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
          resize();
        }}
        {...rest}
      />
    </Field>
  );
});
