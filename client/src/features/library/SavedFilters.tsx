import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Bookmark, BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react';
import { ENTRY_KIND_LABELS, type EntryKind, type SavedFilterDTO } from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { formatRelative } from '../../lib/format';
import { Popover } from './common';
import { activeFilterCount, filtersFromQuery, toQuery, type FilterState } from './filters';
import { KIND_ACCENT, KindIcon, lowerLabel, sortOptions } from './meta';

export interface SavedFiltersMenuProps {
  kind: EntryKind;
  filters: FilterState;
  /** Apply a saved filter (its kind may differ from the current one). */
  onApply: (kind: EntryKind, filters: FilterState) => void;
}

function describe(sf: SavedFilterDTO, fallbackKind: EntryKind): string {
  const kind = sf.kind ?? fallbackKind;
  const f = filtersFromQuery(sf.query);
  const parts: string[] = [];
  const n = activeFilterCount(f, kind);
  if (f.q) parts.push(`«${f.q}»`);
  parts.push(n === 0 ? 'sin filtros' : n === 1 ? '1 filtro' : `${n} filtros`);
  const sort = sortOptions(kind).find((o) => o.value === f.sort);
  if (sort && f.sort !== 'relevance') parts.push(`orden: ${sort.label.toLowerCase()}`);
  return parts.join(' · ');
}

/** "Filtros guardados" dropdown: apply, delete and save the current filters. */
export function SavedFiltersMenu({ kind, filters, onApply }: SavedFiltersMenuProps) {
  const [list, setList] = useState<SavedFilterDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.savedFilters
      .list()
      .then((items) => {
        if (alive) setList(items);
      })
      .catch(() => {
        if (alive) setList([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const { here, others } = useMemo(() => {
    const all = [...(list ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return {
      here: all.filter((sf) => sf.kind === kind || sf.kind === null),
      others: all.filter((sf) => sf.kind !== null && sf.kind !== kind),
    };
  }, [list, kind]);

  const apply = (sf: SavedFilterDTO) => {
    setOpen(false);
    onApply(sf.kind ?? kind, filtersFromQuery(sf.query));
    toast.info(`Filtro «${sf.name}» aplicado`, { duration: 2200 });
  };

  const remove = async (sf: SavedFilterDTO) => {
    // Close the popover first: it is a body portal above the dialog layer and would swallow Esc.
    setOpen(false);
    const ok = await confirm({
      title: `Eliminar «${sf.name}»`,
      message: 'El filtro guardado desaparecerá de tu lista. Los elementos de la biblioteca no se modifican.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(sf.id);
    try {
      await api.savedFilters.remove(sf.id);
      setList((l) => (l ?? []).filter((x) => x.id !== sf.id));
      toast.success('Filtro eliminado');
    } catch (err) {
      toast.fromError(err, 'No se pudo eliminar el filtro');
    } finally {
      setDeletingId(null);
    }
  };

  const renderRow = (sf: SavedFilterDTO) => {
    const rowKind = sf.kind ?? kind;
    return (
      <li key={sf.id} className="group flex items-center gap-1 rounded-lg transition hover:bg-ink-700/80">
        <button type="button" onClick={() => apply(sf)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-600 bg-ink-950/60"
            style={{ color: KIND_ACCENT[rowKind] }}
            title={sf.kind ? ENTRY_KIND_LABELS[sf.kind].plural : 'Cualquier tipo'}
          >
            <KindIcon kind={rowKind} className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-parchment-50">{sf.name}</span>
            <span className="block truncate text-[11px] text-parchment-400">
              {describe(sf, kind)} · {formatRelative(sf.createdAt)}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void remove(sf)}
          disabled={deletingId === sf.id}
          title="Eliminar filtro guardado"
          aria-label={`Eliminar el filtro ${sf.name}`}
          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-parchment-500 opacity-0 transition hover:bg-blood-600/20 hover:text-blood-300 focus-visible:opacity-100 group-hover:opacity-100"
        >
          {deletingId === sf.id ? <Spinner size="xs" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </li>
    );
  };

  const count = here.length;

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant="ghost"
        icon={<Bookmark />}
        iconRight={<ChevronDown className={clsx('transition-transform', open && 'rotate-180')} />}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Filtros guardados"
      >
        <span className="hidden sm:inline">Guardados</span>
        {count > 0 && <span className="ml-1 rounded-full bg-gold-500/20 px-1.5 text-[10px] font-bold text-gold-200">{count}</span>}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="end" width={340}>
        <div className="flex max-h-[min(26rem,70vh)] flex-col">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-400">Filtros guardados</div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {loading && list === null ? (
              <div className="flex justify-center py-5">
                <Spinner size="sm" />
              </div>
            ) : here.length === 0 && others.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs leading-relaxed text-parchment-400">
                Todavía no has guardado ningún filtro. Configura los filtros y pulsa «Guardar filtro actual».
              </p>
            ) : (
              <>
                {here.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">{here.map(renderRow)}</ul>
                ) : (
                  <p className="px-2 py-2 text-xs text-parchment-400">Ninguno para {lowerLabel(ENTRY_KIND_LABELS[kind].plural)}.</p>
                )}
                {others.length > 0 && (
                  <>
                    <div className="mt-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-500">Otros tipos</div>
                    <ul className="flex flex-col gap-0.5">{others.map(renderRow)}</ul>
                  </>
                )}
              </>
            )}
          </div>
          <div className="mt-1 border-t border-ink-600/70 pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSaveOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gold-200 transition hover:bg-gold-500/10"
            >
              <BookmarkPlus className="h-4 w-4" /> Guardar filtro actual…
            </button>
          </div>
        </div>
      </Popover>
      <SaveFilterModal
        open={saveOpen}
        kind={kind}
        filters={filters}
        onClose={() => setSaveOpen(false)}
        onSaved={(sf) => {
          setSaveOpen(false);
          setList((l) => [...(l ?? []).filter((x) => x.id !== sf.id), sf]);
        }}
      />
    </>
  );
}

interface SaveFilterModalProps {
  open: boolean;
  kind: EntryKind;
  filters: FilterState;
  onClose: () => void;
  onSaved: (sf: SavedFilterDTO) => void;
}

function SaveFilterModal({ open, kind, filters, onClose, onSaved }: SaveFilterModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const n = activeFilterCount(filters, kind);
  const q = (filters.q ?? '').trim();

  const save = async () => {
    const clean = name.trim();
    if (!clean) {
      setError('Ponle un nombre al filtro.');
      return;
    }
    if (clean.length > 80) {
      setError('El nombre admite como máximo 80 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const sf = await api.savedFilters.create({ name: clean, kind, query: toQuery(kind, filters) });
      toast.success(`Filtro «${sf.name}» guardado`);
      onSaved(sf);
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar el filtro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      icon={<BookmarkPlus />}
      title="Guardar filtro"
      subtitle={`Para ${lowerLabel(ENTRY_KIND_LABELS[kind].plural)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Bookmark />} loading={saving} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextInput
          label="Nombre"
          data-autofocus
          value={name}
          maxLength={80}
          error={error ?? undefined}
          placeholder="Jefes CR 10+ de cueva"
          onValueChange={(v) => {
            setName(v);
            if (error) setError(null);
          }}
        />
        <div className="rounded-lg border border-ink-600/70 bg-ink-950/40 px-3 py-2 text-xs leading-relaxed text-parchment-300">
          Se guardará {q ? <>la búsqueda «{q}», </> : null}
          {n === 0 ? 'sin filtros adicionales' : n === 1 ? '1 filtro activo' : `${n} filtros activos`} y el orden actual.
        </div>
      </form>
    </Modal>
  );
}
