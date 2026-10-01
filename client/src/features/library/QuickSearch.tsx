import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { CornerDownLeft, History, Search, SearchX } from 'lucide-react';
import { ENTRY_KINDS, ENTRY_KIND_LABELS, type EntryKind, type LibraryEntry, type LibraryQuery } from '@wailers/shared';
import { api } from '../../api/http';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { EntryThumb } from './common';
import { KIND_ACCENT, KindIcon, StatChips, entryRarityColor } from './meta';

export interface QuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  run: () => void;
}

export interface QuickSearchProps {
  open: boolean;
  onClose: () => void;
  kinds?: EntryKind[];
  campaignId?: string;
  placeholder?: string;
  actionsFor: (entry: LibraryEntry) => QuickAction[];
}

const TOTAL = 12;

/** Ctrl+K palette: instant fuzzy search across kinds; ↑/↓ select, Intro runs, Tab cycles actions, Esc closes. */
export function QuickSearch(props: QuickSearchProps) {
  if (!props.open) return null;
  return <Palette {...props} />;
}

async function runSearch(kinds: EntryKind[], q: string): Promise<LibraryEntry[]> {
  const text = q.trim();
  const base: LibraryQuery = text ? { q: text, sort: 'relevance' } : { recentOnly: true, sort: 'recent', order: 'desc' };
  const all = kinds.length === ENTRY_KINDS.length;
  if (all || kinds.length === 1) {
    const res = await api.library.search({ ...base, ...(all ? {} : { kind: kinds[0] }), page: 1, pageSize: TOTAL });
    return res.items ?? [];
  }
  const per = Math.max(4, Math.ceil(TOTAL / kinds.length) + 1);
  const pages = await Promise.all(kinds.map((kind) => api.library.search({ ...base, kind, page: 1, pageSize: per }).catch(() => null)));
  return pages.flatMap((p) => p?.items ?? []);
}

function Palette({ onClose, kinds, campaignId, placeholder, actionsFor }: QuickSearchProps) {
  const allowedKey = (kinds && kinds.length ? kinds : ENTRY_KINDS).join(',');
  const allowed = useMemo(() => allowedKey.split(',') as EntryKind[], [allowedKey]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    const timer = setTimeout(
      () => {
        runSearch(allowed, q)
          .then((items) => {
            if (my !== seq.current) return;
            setResults(items.filter((i) => allowed.includes(i.kind)));
            setError(null);
            setSelected(0);
            setActionIndex(0);
          })
          .catch((err: unknown) => {
            if (my !== seq.current) return;
            setResults([]);
            setError(err instanceof Error ? err.message : 'No se pudo buscar');
          })
          .finally(() => {
            if (my === seq.current) setLoading(false);
          });
      },
      q ? 120 : 0,
    );
    return () => clearTimeout(timer);
  }, [q, allowed]);

  // Group by kind (order of first appearance = relevance), flatten for keyboard navigation.
  const groups = useMemo(() => {
    const map = new Map<EntryKind, LibraryEntry[]>();
    for (const r of results) {
      const list = map.get(r.kind) ?? [];
      list.push(r);
      map.set(r.kind, list);
    }
    return [...map.entries()].map(([kind, items]) => ({ kind, items }));
  }, [results]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = flat[selected] ?? null;
  const currentActions = useMemo(() => (current ? actionsFor(current) : []), [current, actionsFor]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const runAction = (entry: LibraryEntry, action: QuickAction | undefined) => {
    if (!action) return;
    api.library.markUsed(entry.id, campaignId).catch(() => undefined);
    onClose();
    action.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setSelected((s) => (s + dir + flat.length) % flat.length);
      setActionIndex(0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current) runAction(current, currentActions[actionIndex] ?? currentActions[0]);
    } else if (e.key === 'Tab' || (e.key === 'ArrowRight' && (e.currentTarget.selectionStart ?? 0) >= q.length)) {
      if (currentActions.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.shiftKey ? -1 : 1;
      setActionIndex((i) => (i + dir + currentActions.length) % currentActions.length);
    } else if (e.key === 'ArrowLeft' && actionIndex > 0 && (e.currentTarget.selectionStart ?? 0) === 0) {
      e.preventDefault();
      setActionIndex((i) => Math.max(0, i - 1));
    }
  };

  let index = -1;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      hideClose
      bodyClassName="p-0"
      className="mt-[10vh] self-start"
      initialFocus={inputRef}
    >
      <div className="flex max-h-[70vh] flex-col">
        <div className="flex items-center gap-3 border-b border-ink-600/70 px-4 py-3">
          {loading ? <Spinner size="sm" /> : <Search className="h-5 w-5 shrink-0 text-gold-400" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? 'Buscar en la biblioteca…'}
            aria-label="Búsqueda rápida"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base text-parchment-50 outline-none placeholder:text-parchment-400/60"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="scroll-thin min-h-[8rem] flex-1 overflow-y-auto p-2">
          {!q && flat.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-400">
              <History className="h-3 w-3" /> Usados recientemente
            </div>
          )}
          {error ? (
            <p className="px-3 py-6 text-center text-sm text-blood-300">{error}</p>
          ) : flat.length === 0 && !loading ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              {q ? <SearchX className="h-7 w-7 text-parchment-500" /> : <Search className="h-7 w-7 text-parchment-500" />}
              <p className="text-sm text-parchment-200">{q ? `Nada coincide con «${q}»` : 'Escribe para buscar en la biblioteca'}</p>
              <p className="text-xs text-parchment-400">
                {q ? 'La búsqueda tolera erratas y tildes; prueba con otra palabra.' : 'Aquí aparecerá lo que hayas usado últimamente.'}
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.kind} className="mb-1.5">
                {(q || groups.length > 1) && (
                  <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: KIND_ACCENT[g.kind] }}>
                    <KindIcon kind={g.kind} className="h-3 w-3" />
                    {ENTRY_KIND_LABELS[g.kind].plural}
                  </div>
                )}
                {g.items.map((entry) => {
                  index += 1;
                  const i = index;
                  const active = i === selected;
                  const actions = active ? currentActions : [];
                  const rarity = entryRarityColor(entry);
                  return (
                    <div
                      key={entry.id}
                      data-index={i}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => {
                        if (selected !== i) {
                          setSelected(i);
                          setActionIndex(0);
                        }
                      }}
                      onClick={() => {
                        const acts = actionsFor(entry);
                        runAction(entry, acts[active ? actionIndex : 0] ?? acts[0]);
                      }}
                      className={clsx(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors',
                        active ? 'bg-ink-700/90 shadow-[inset_0_0_0_1px_rgba(176,133,43,0.45)]' : 'hover:bg-ink-800/70',
                      )}
                    >
                      <EntryThumb entry={entry} size={36} round={entry.kind === 'hero'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" style={{ color: rarity ?? '#fbf6ea' }}>
                          {entry.name}
                        </div>
                        <StatChips entry={entry} max={3} size="xs" className="mt-0.5 flex gap-1 overflow-hidden" />
                      </div>
                      {active && actions.length > 0 && (
                        <div className="flex shrink-0 items-center gap-1">
                          {actions.map((a, ai) => (
                            <button
                              key={a.id}
                              type="button"
                              tabIndex={-1}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                runAction(entry, a);
                              }}
                              className={clsx(
                                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition [&_svg]:h-3 [&_svg]:w-3',
                                ai === actionIndex
                                  ? 'border-gold-500/70 bg-gold-500/20 text-gold-100'
                                  : 'border-ink-500 bg-ink-800 text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
                              )}
                            >
                              {a.icon}
                              {a.label}
                              {ai === actionIndex && <CornerDownLeft className="opacity-70" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-600/70 bg-ink-950/40 px-4 py-2 text-[11px] text-parchment-400">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Intro</Kbd> ejecutar
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Tab</Kbd> otras acciones
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> cerrar
          </span>
        </div>
      </div>
    </Modal>
  );
}
