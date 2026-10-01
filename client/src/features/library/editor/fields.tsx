import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import {
  DEFAULT_ABILITIES,
  ENTRY_KIND_LABELS,
  abilityModifier,
  formatModifier,
  type AbilityScores,
  type EntryKind,
  type LibraryEntry,
} from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { NumberInput } from '../../../components/ui/NumberInput';
import { toast } from '../../../components/ui/toast';
import { LibraryBrowser } from '../LibraryBrowser';
import { KindIcon } from '../meta';

// ---------------------------------------------------------------------------
// Free-text chips (resistances, classes…)
// ---------------------------------------------------------------------------

export interface StringListInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  suggestions?: string[];
  className?: string;
}

/** Free text values as chips: Enter or comma adds, Backspace removes the last one. Keeps capitalization. */
export function StringListInput({ value, onChange, label, hint, placeholder = 'Escribe y pulsa Intro…', suggestions = [], className }: StringListInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) {
      if (!lower.has(p.toLowerCase())) {
        next.push(p);
        lower.add(p.toLowerCase());
      }
    }
    onChange(next);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <div className="input flex min-h-[2.5rem] cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5" onClick={() => document.getElementById(id)?.focus()}>
        {value.map((v) => (
          <span key={v} className="chip pr-1">
            <span className="truncate">{v}</span>
            <button
              type="button"
              aria-label={`Quitar ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((x) => x !== v));
              }}
              className="rounded-full p-0.5 text-parchment-400 transition hover:bg-ink-600 hover:text-parchment-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          list={remaining.length ? listId : undefined}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            // Picking a datalist option fills the whole value at once.
            if (remaining.includes(v)) add(v);
            else setText(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[7rem] flex-1 bg-transparent py-0.5 text-sm text-parchment-100 outline-none placeholder:text-parchment-400/55"
        />
        {remaining.length > 0 && (
          <datalist id={listId}>
            {remaining.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Generic list editor (attacks, traits, loot, inventory, spells, uses)
// ---------------------------------------------------------------------------

export interface ListEditorProps<T extends { id: string }> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  create?: () => T;
  addLabel?: string;
  emptyText: string;
  /** Extra buttons next to "add" (e.g. pick from the library). */
  extraActions?: ReactNode;
  itemName?: (item: T) => string;
  /** Error message per item id (red border). */
  errorFor?: (item: T) => string | undefined;
}

export function ListEditor<T extends { id: string }>({
  items,
  onChange,
  renderItem,
  create,
  addLabel = 'Añadir',
  emptyText,
  extraActions,
  itemName,
  errorFor,
}: ListEditorProps<T>) {
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [it] = next.splice(index, 1);
    if (it) next.splice(target, 0, it);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-500 bg-ink-950/30 px-3 py-4 text-center text-xs text-parchment-400">{emptyText}</div>
      ) : (
        items.map((item, index) => {
          const error = errorFor?.(item);
          return (
            <div
              key={item.id}
              className={clsx(
                'group flex animate-fade-in gap-2 rounded-lg border bg-ink-950/40 p-2.5 transition',
                error ? 'border-blood-500/70' : 'border-ink-600/70 hover:border-ink-500',
              )}
            >
              <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Subir"
                  title="Subir"
                  className="rounded p-0.5 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100 disabled:opacity-25"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label="Bajar"
                  title="Bajar"
                  className="rounded p-0.5 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100 disabled:opacity-25"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                {renderItem(item, (patch) => onChange(items.map((it) => (it.id === item.id ? { ...it, ...patch } : it))), index)}
                {error && <p className="mt-1 text-xs text-blood-400">{error}</p>}
              </div>
              <button
                type="button"
                onClick={() => onChange(items.filter((it) => it.id !== item.id))}
                aria-label={`Eliminar ${itemName?.(item) || 'elemento'}`}
                title="Eliminar"
                className="h-7 w-7 shrink-0 rounded-md text-parchment-400 transition hover:bg-blood-600/20 hover:text-blood-300"
              >
                <Trash2 className="mx-auto h-4 w-4" />
              </button>
            </div>
          );
        })
      )}
      <div className="flex flex-wrap items-center gap-2">
        {create && (
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => onChange([...items, create()])}>
            {addLabel}
          </Button>
        )}
        {extraActions}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ability scores
// ---------------------------------------------------------------------------

export interface AbilityEditorProps {
  value: AbilityScores;
  onChange: (value: AbilityScores) => void;
  /** Keys to show (default: the six classic abilities plus any extra keys present). */
  keys?: { key: string; short: string; label: string }[];
  min?: number;
  max?: number;
  errors?: Record<string, string>;
}

export function AbilityEditor({ value, onChange, keys, min = 1, max = 30, errors }: AbilityEditorProps) {
  const defaults = DEFAULT_ABILITIES.map((a) => ({ key: a.key as string, short: a.short as string, label: a.label as string }));
  const list =
    keys ??
    [...defaults, ...Object.keys(value).filter((k) => !defaults.some((d) => d.key === k)).map((k) => ({ key: k, short: k.slice(0, 3).toUpperCase(), label: k }))];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {list.map((a) => {
        const score = value[a.key] ?? 10;
        const err = errors?.[`ability.${a.key}`];
        return (
          <div key={a.key} className="flex flex-col items-center rounded-lg border border-ink-600/70 bg-gradient-to-b from-ink-800 to-ink-900 px-1.5 pb-1.5 pt-1" title={a.label}>
            <span className="text-[10px] font-bold tracking-wider text-gold-400">{a.short}</span>
            <NumberInput
              integer
              min={min}
              max={max}
              value={score}
              size="sm"
              aria-label={a.label}
              title={err}
              className={clsx('text-center font-display text-base font-bold', err && 'input-error')}
              onChange={(v) => onChange({ ...value, [a.key]: v })}
            />
            <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-parchment-300">{formatModifier(abilityModifier(score))}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pick entries from the library inside forms
// ---------------------------------------------------------------------------

export interface EntryPickerModalProps {
  open: boolean;
  kind: EntryKind;
  onClose: () => void;
  onPick: (entry: LibraryEntry) => void;
  title?: string;
  pickLabel?: string;
  /** Keep the dialog open after each pick (adds several items). */
  multi?: boolean;
  campaignId?: string;
}

export function EntryPickerModal({ open, kind, onClose, onPick, title, pickLabel = 'Añadir', multi = false, campaignId }: EntryPickerModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<KindIcon kind={kind} />}
      title={title ?? `Elegir ${ENTRY_KIND_LABELS[kind].singular.toLowerCase()} de la biblioteca`}
      subtitle={multi ? 'Puedes añadir varios; cierra el diálogo cuando termines.' : undefined}
      bodyClassName="p-0"
      footer={
        <Button variant={multi ? 'primary' : 'ghost'} onClick={onClose}>
          {multi ? 'Hecho' : 'Cancelar'}
        </Button>
      }
    >
      <div className="h-[62vh] min-h-[22rem]">
        <LibraryBrowser
          kinds={[kind]}
          campaignId={campaignId}
          pickLabel={pickLabel}
          className="h-full"
          onPick={(entry) => {
            onPick(entry);
            if (multi) toast.success(`«${entry.name}» añadido`, { duration: 1800 });
            else onClose();
          }}
        />
      </div>
    </Modal>
  );
}

/** Two-column responsive grid for form fields. */
export function FormGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={clsx(
        'grid gap-3',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-3',
        cols === 4 && 'grid-cols-2 sm:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
