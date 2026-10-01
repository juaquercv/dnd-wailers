import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  /** Called on every keystroke, or after `debounceMs` of inactivity when set. */
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  autoFocus?: boolean;
  /** Called with the current text on Enter. */
  onEnter?: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Element shown on the right (e.g. a <Kbd>). Hidden while there is text. */
  hint?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
}

const SIZE = {
  sm: { input: 'input-sm pl-7 pr-7', icon: 'left-2 h-3.5 w-3.5', clear: 'right-1.5' },
  md: { input: 'pl-9 pr-8', icon: 'left-3 h-4 w-4', clear: 'right-2' },
  lg: { input: 'pl-11 pr-10 py-3 text-base rounded-xl', icon: 'left-3.5 h-5 w-5', clear: 'right-3' },
} as const;

/** Search box with icon, clear button (Esc clears) and optional debounce. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, placeholder = 'Buscar…', debounceMs = 0, autoFocus, onEnter, onKeyDown, size = 'md', className, hint, disabled, 'aria-label': ariaLabel },
  ref,
) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // External value changes (e.g. reset by parent) update the field.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const emit = (v: string, immediate: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    if (immediate || debounceMs <= 0) {
      lastEmitted.current = v;
      onChangeRef.current(v);
      return;
    }
    timer.current = setTimeout(() => {
      lastEmitted.current = v;
      onChangeRef.current(v);
    }, debounceMs);
  };

  const s = SIZE[size];

  return (
    <div className={clsx('relative', className)}>
      <Search aria-hidden className={clsx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-parchment-400', s.icon)} />
      <input
        ref={ref}
        type="search"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        spellCheck={false}
        className={clsx('input', s.input)}
        onChange={(e) => {
          setText(e.target.value);
          emit(e.target.value, false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.preventDefault();
            e.stopPropagation();
            setText('');
            emit('', true);
          } else if (e.key === 'Enter') {
            emit(text, true);
            onEnter?.(text);
          }
          onKeyDown?.(e);
        }}
      />
      {text ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          title="Limpiar (Esc)"
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 rounded p-0.5 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100',
            s.clear,
          )}
          onClick={() => {
            setText('');
            emit('', true);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        hint && <span className={clsx('pointer-events-none absolute top-1/2 -translate-y-1/2', s.clear)}>{hint}</span>
      )}
    </div>
  );
});
