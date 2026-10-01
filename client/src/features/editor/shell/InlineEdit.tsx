import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';

export interface InlineEditProps {
  value: string;
  /** Called with the trimmed, non-empty new value when it changed. */
  onCommit: (value: string) => void;
  /** Accessible label of the field. */
  label: string;
  placeholder?: string;
  maxLength?: number;
  /** Classes for the read-only text and the input (font size, weight…). */
  className?: string;
  /** Start in edit mode (e.g. right after creating something). */
  autoEdit?: boolean;
  /** Edit on single click (default) or only on double click. */
  trigger?: 'click' | 'dblclick';
  /** Show a pencil icon on hover. Default true. */
  showIcon?: boolean;
  disabled?: boolean;
}

/** Text that turns into an input on click: Enter/blur saves, Esc cancels. */
export function InlineEdit({
  value,
  onCommit,
  label,
  placeholder = 'Sin nombre',
  maxLength = 80,
  className,
  autoEdit = false,
  trigger = 'click',
  showIcon = true,
  disabled = false,
}: InlineEditProps) {
  const [editing, setEditing] = useState(autoEdit);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const start = () => {
    if (disabled) return;
    cancelled.current = false;
    setText(value);
    setEditing(true);
  };

  const finish = () => {
    setEditing(false);
    if (cancelled.current) return;
    const next = text.trim();
    if (next && next !== value) onCommit(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        maxLength={maxLength}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            inputRef.current?.blur();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx(
          'min-w-0 rounded-md border border-gold-500 bg-ink-950 px-1.5 py-0.5 text-parchment-50 outline-none ring-2 ring-gold-500/25',
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={trigger === 'click' ? `${label}: clic para editar` : `${label}: doble clic para editar`}
      aria-label={`${label}: ${value || placeholder}`}
      onClick={(e) => {
        if (trigger !== 'click') return;
        e.stopPropagation();
        start();
      }}
      onDoubleClick={(e) => {
        if (trigger !== 'dblclick') return;
        e.stopPropagation();
        start();
      }}
      onKeyDown={(e) => {
        if (e.key === 'F2' || (trigger === 'dblclick' && e.key === 'Enter')) {
          e.preventDefault();
          e.stopPropagation();
          start();
        }
      }}
      className={clsx(
        'group/inline inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-left transition',
        !disabled && 'hover:border-ink-500 hover:bg-ink-800/70',
        className,
      )}
    >
      <span className={clsx('truncate', !value && 'italic text-parchment-400')}>{value || placeholder}</span>
      {showIcon && !disabled && (
        <Pencil className="h-3 w-3 shrink-0 text-parchment-400 opacity-0 transition group-hover/inline:opacity-100" aria-hidden />
      )}
    </button>
  );
}
