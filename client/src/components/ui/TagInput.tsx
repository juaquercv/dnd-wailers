import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Hash, X } from 'lucide-react';
import { normalizeTag, type EntryKind, type TagCount } from '@wailers/shared';
import { api } from '../../api/http';
import { Field } from './Field';

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Library kind used for autocomplete (api.library.tags). Omit for all kinds. */
  kind?: EntryKind;
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  /** Extra local suggestions merged with the server ones. */
  suggestions?: string[];
  /** Disable server autocomplete. */
  noRemoteSuggestions?: boolean;
  maxTags?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

function safeNormalize(raw: string): string {
  try {
    return normalizeTag(raw);
  } catch {
    return raw
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
  }
}

/** Free tags as "#chips" with debounced autocomplete. Enter, comma or Tab adds; Backspace removes the last. */
export function TagInput({
  value,
  onChange,
  kind,
  label,
  hint,
  placeholder = 'Añadir etiqueta…',
  suggestions: localSuggestions,
  noRemoteSuggestions = false,
  maxTags,
  disabled,
  size = 'md',
  className,
}: TagInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [remote, setRemote] = useState<TagCount[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** True once the user moved through suggestions with the arrow keys. */
  const [navigated, setNavigated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  const query = safeNormalize(text);

  useEffect(() => {
    if (noRemoteSuggestions || disabled || !open) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      api.library
        .tags(kind, query || undefined)
        .then((res) => {
          if (seq === requestSeq.current) setRemote(res);
        })
        .catch(() => {
          if (seq === requestSeq.current) setRemote([]);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, kind, noRemoteSuggestions, disabled, open]);

  const options = useMemo(() => {
    const taken = new Set(value);
    const seen = new Set<string>();
    const out: { tag: string; count: number | null }[] = [];
    const push = (tag: string, count: number | null) => {
      const t = safeNormalize(tag);
      if (!t || taken.has(t) || seen.has(t)) return;
      if (query && !t.includes(query)) return;
      seen.add(t);
      out.push({ tag: t, count });
    };
    for (const r of remote) push(r.tag, r.count);
    for (const s of localSuggestions ?? []) push(s, null);
    return out.slice(0, 8);
  }, [remote, localSuggestions, value, query]);

  useEffect(() => {
    setHighlight(0);
    setNavigated(false);
  }, [query, options.length]);

  const full = maxTags !== undefined && value.length >= maxTags;

  const addTags = (raws: string[]) => {
    const next = [...value];
    for (const raw of raws) {
      const t = safeNormalize(raw);
      if (!t || next.includes(t)) continue;
      if (maxTags !== undefined && next.length >= maxTags) break;
      next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setText('');
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const showing = open && options.length > 0;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && showing) {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (navigated ? (h + dir + options.length) % options.length : dir > 0 ? 0 : options.length - 1));
      setNavigated(true);
    } else if (e.key === ',') {
      e.preventDefault();
      if (text.trim()) addTags([text]);
    } else if (e.key === 'Enter' || (e.key === 'Tab' && (text.trim() || (showing && navigated)))) {
      const picked = showing && navigated ? options[highlight]?.tag : undefined;
      if (picked) {
        e.preventDefault();
        addTags([picked]);
      } else if (text.trim()) {
        e.preventDefault();
        addTags([text]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
      }
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      e.preventDefault();
      removeTag(value[value.length - 1]!);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <div className="relative">
        <div
          className={clsx(
            'input flex min-h-[2.5rem] cursor-text flex-wrap items-center gap-1.5',
            size === 'sm' ? 'px-1.5 py-1' : 'px-2 py-1.5',
            disabled && 'pointer-events-none opacity-50',
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag) => (
            <span key={tag} className="chip border-gold-700/50 bg-gold-500/10 pr-1 text-gold-200">
              <span className="truncate">
                <span className="text-gold-500">#</span>
                {tag}
              </span>
              <button
                type="button"
                aria-label={`Quitar etiqueta ${tag}`}
                className="rounded-full p-0.5 text-gold-400/80 transition hover:bg-gold-500/20 hover:text-gold-200"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!full && (
            <input
              ref={inputRef}
              id={id}
              value={text}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : ''}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={open && options.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              className="min-w-[6rem] flex-1 bg-transparent py-0.5 text-sm text-parchment-100 outline-none placeholder:text-parchment-400/55"
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes(',')) {
                  const parts = v.split(',');
                  const rest = parts.pop() ?? '';
                  addTags(parts);
                  setText(rest);
                } else {
                  setText(v);
                }
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setOpen(false);
                if (text.trim()) addTags([text]);
              }}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (/[,\n]/.test(pasted)) {
                  e.preventDefault();
                  addTags(pasted.split(/[,\n]/));
                }
              }}
            />
          )}
        </div>
        {open && options.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="scroll-thin absolute left-0 right-0 top-full z-60 mt-1 max-h-56 animate-fade-in overflow-y-auto rounded-lg border border-ink-500 bg-ink-900 p-1 shadow-modal"
          >
            {options.map((o, i) => (
              <li
                key={o.tag}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTags([o.tag]);
                }}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  i === highlight && navigated ? 'bg-ink-700 text-parchment-50' : 'text-parchment-200 hover:bg-ink-800',
                )}
              >
                <Hash className="h-3.5 w-3.5 text-gold-500" />
                <span className="flex-1 truncate">{o.tag}</span>
                {o.count !== null && <span className="text-xs text-parchment-400">{o.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
