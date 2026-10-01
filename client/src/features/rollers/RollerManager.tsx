import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Copy, Dices, Disc3, Import, Pencil, Play, Plus, RefreshCw, Sparkles, Trash2, Zap } from 'lucide-react';
import type { Roller, RollerInput, RollerKind } from '@wailers/shared';
import { api } from '../../api/http';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { SearchInput } from '../../components/ui/SearchInput';
import { Spinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { DieGlyph } from '../dice/DieShapes';
import { errorMessage } from '../dice/diceUtils';
import { MiniWheel, SegmentStrip } from '../dice/RouletteWheel';
import { Segmented } from '../dice/Segmented';
import { RollerEditor } from './RollerEditor';
import { RollerImportModal } from './RollerImportModal';
import { RollerPreviewModal } from './RollerPreviewModal';
import { duplicateInput, KIND_LABELS, matchesQuery, rollerSummary, sortRollers, tagCounts } from './rollerUtils';

export interface RollerManagerProps {
  campaignId: string;
  /** Live session (DM): reads/writes the session store so changes apply instantly to the running game. */
  live?: boolean;
}

type KindFilter = 'all' | RollerKind;

interface RollerSource {
  rollers: Roller[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  apply: (fn: (list: Roller[]) => Roller[]) => void;
}

/** Roller list backed by the live session store (live) or by local state loaded over REST (editor). */
function useRollerSource(campaignId: string, live: boolean): RollerSource {
  const liveRollers = useSessionStore((s) => s.rollers);
  const [local, setLocal] = useState<Roller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const s = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const list = await api.campaigns.rollers(campaignId);
      if (s !== seq.current) return;
      if (live) useSessionStore.getState().setRollers(list);
      else setLocal(list);
    } catch (err) {
      if (s === seq.current) setError(errorMessage(err, 'No se pudieron cargar los dados y ruletas'));
    } finally {
      if (s === seq.current) setLoading(false);
    }
  }, [campaignId, live]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const apply = useCallback(
    (fn: (list: Roller[]) => Roller[]) => {
      if (live) {
        const store = useSessionStore.getState();
        store.setRollers(fn(store.rollers));
      } else {
        setLocal((prev) => fn(prev));
      }
    },
    [live],
  );

  const rollers = live ? liveRollers : local;
  return { rollers, loading: loading && rollers.length === 0, error: rollers.length === 0 ? error : null, reload, apply };
}

function upsert(list: Roller[], roller: Roller): Roller[] {
  const i = list.findIndex((r) => r.id === roller.id);
  if (i < 0) return [...list, roller];
  const next = [...list];
  next[i] = roller;
  return next;
}

/** Campaign dice & roulettes manager (editor and live session). */
export function RollerManager({ campaignId, live = false }: RollerManagerProps) {
  const { rollers, loading, error, reload, apply } = useRollerSource(campaignId, live);
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ key: number; roller: Roller | null; kind: RollerKind } | null>(null);
  const [preview, setPreview] = useState<Roller | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const editorSeq = useRef(0);

  const sorted = useMemo(() => sortRollers(rollers), [rollers]);
  const tags = useMemo(() => tagCounts(rollers), [rollers]);
  const filtered = useMemo(
    () =>
      sorted.filter(
        (r) => (kindFilter === 'all' || r.kind === kindFilter) && (!tagFilter || r.tags.includes(tagFilter)) && matchesQuery(r, query),
      ),
    [sorted, kindFilter, tagFilter, query],
  );

  useEffect(() => {
    if (tagFilter && !tags.some((t) => t.tag === tagFilter)) setTagFilter(null);
  }, [tags, tagFilter]);

  const markBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const openEditor = (roller: Roller | null, kind: RollerKind) => {
    editorSeq.current += 1;
    setEditor({ key: editorSeq.current, roller, kind });
  };

  const toggle = async (roller: Roller, field: 'active' | 'isTurnRoll', value: boolean) => {
    const optimistic = { ...roller, [field]: value };
    apply((list) => upsert(list, optimistic));
    try {
      const saved = await api.rollers.update(roller.id, { [field]: value } as RollerInput);
      apply((list) => upsert(list, saved));
    } catch (err) {
      apply((list) => upsert(list, roller));
      toast.fromError(err, 'No se pudo guardar el cambio');
    }
  };

  const duplicate = async (roller: Roller) => {
    markBusy(roller.id, true);
    try {
      const created = await api.campaigns.createRoller(
        campaignId,
        duplicateInput(
          roller,
          rollers.map((r) => r.name),
        ),
      );
      apply((list) => upsert(list, created));
      toast.success('Copia creada', { description: created.name });
    } catch (err) {
      toast.fromError(err, 'No se pudo duplicar');
    } finally {
      markBusy(roller.id, false);
    }
  };

  const remove = async (roller: Roller) => {
    const ok = await confirm({
      title: roller.kind === 'roulette' ? 'Eliminar ruleta' : 'Eliminar dado',
      message: (
        <>
          Se eliminará <strong className="text-parchment-100">«{roller.name}»</strong> de esta campaña. Las copias importadas en otras campañas no se
          verán afectadas.
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    markBusy(roller.id, true);
    try {
      await api.rollers.remove(roller.id);
      apply((list) => list.filter((r) => r.id !== roller.id));
      toast.success(roller.kind === 'roulette' ? 'Ruleta eliminada' : 'Dado eliminado');
    } catch (err) {
      toast.fromError(err, 'No se pudo eliminar');
    } finally {
      markBusy(roller.id, false);
    }
  };

  const hasFilters = !!query.trim() || kindFilter !== 'all' || !!tagFilter;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Toolbar */}
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => openEditor(null, 'roulette')}>
            Nueva ruleta
          </Button>
          <Button size="sm" icon={<Plus />} onClick={() => openEditor(null, 'dice')}>
            Nuevo dado
          </Button>
          <Button size="sm" variant="ghost" icon={<Import />} onClick={() => setImportOpen(true)}>
            Importar de otra campaña
          </Button>
          <span className="ml-auto" />
          <IconButton size="sm" icon={<RefreshCw />} title="Recargar" onClick={() => void reload()} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} size="sm" placeholder="Buscar por nombre, etiqueta o segmento…" className="min-w-[12rem] flex-1" />
          <Segmented
            fill={false}
            value={kindFilter}
            onChange={setKindFilter}
            ariaLabel="Filtrar por tipo"
            options={[
              { value: 'all', label: `Todo (${rollers.length})` },
              { value: 'roulette', label: 'Ruletas', icon: <Disc3 /> },
              { value: 'dice', label: 'Dados', icon: <Dices /> },
            ]}
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {tags.slice(0, 20).map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                aria-pressed={tagFilter === tag}
                onClick={() => setTagFilter((cur) => (cur === tag ? null : tag))}
                className={clsx(
                  'rounded-full border px-2 py-0.5 text-[11px] font-semibold transition',
                  tagFilter === tag ? 'border-gold-500/70 bg-gold-500/15 text-gold-200' : 'border-ink-500 bg-ink-800 text-parchment-300 hover:text-parchment-100',
                )}
              >
                <span className="text-gold-500">#</span>
                {tag} <span className="text-parchment-400">{count}</span>
              </button>
            ))}
          </div>
        )}
        {live && (
          <div className="flex items-center gap-2 rounded-lg border border-arcane-500/40 bg-arcane-500/10 px-3 py-1.5 text-xs text-arcane-300">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            Edición en vivo: los cambios se aplican al instante en la partida en curso.
          </div>
        )}
      </div>

      {/* List */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" showLabel label="Cargando dados y ruletas…" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<Sparkles />}
            title="No se pudieron cargar"
            description={error}
            action={
              <Button icon={<RefreshCw />} onClick={() => void reload()}>
                Reintentar
              </Button>
            }
          />
        ) : rollers.length === 0 ? (
          <EmptyState
            icon={<Disc3 />}
            title="Aún no hay dados ni ruletas"
            description="Crea ruletas de eventos, botín o encuentros, o dados con caras personalizadas. También puedes importarlos de otra campaña."
            action={
              <>
                <Button variant="primary" icon={<Plus />} onClick={() => openEditor(null, 'roulette')}>
                  Nueva ruleta
                </Button>
                <Button icon={<Plus />} onClick={() => openEditor(null, 'dice')}>
                  Nuevo dado
                </Button>
                <Button variant="ghost" icon={<Import />} onClick={() => setImportOpen(true)}>
                  Importar
                </Button>
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<Sparkles />}
            title="Nada coincide con la búsqueda"
            action={
              hasFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setQuery('');
                    setKindFilter('all');
                    setTagFilter(null);
                  }}
                >
                  Quitar filtros
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <RollerRow
                key={r.id}
                roller={r}
                busy={busy.has(r.id)}
                onToggle={(field, value) => void toggle(r, field, value)}
                onPreview={() => setPreview(r)}
                onEdit={() => openEditor(r, r.kind)}
                onDuplicate={() => void duplicate(r)}
                onRemove={() => void remove(r)}
                onTag={(t) => setTagFilter(t)}
              />
            ))}
          </ul>
        )}
      </div>

      {editor && (
        <RollerEditor
          key={editor.key}
          open
          campaignId={campaignId}
          roller={editor.roller}
          initialKind={editor.kind}
          tagSuggestions={tags.map((t) => t.tag)}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            apply((list) => upsert(list, saved));
            setEditor(null);
          }}
        />
      )}
      <RollerPreviewModal roller={preview} onClose={() => setPreview(null)} />
      <RollerImportModal
        open={importOpen}
        campaignId={campaignId}
        existing={rollers}
        onClose={() => setImportOpen(false)}
        onImported={(copy) => apply((list) => upsert(list, copy))}
      />
    </div>
  );
}

function RollerRow({
  roller,
  busy,
  onToggle,
  onPreview,
  onEdit,
  onDuplicate,
  onRemove,
  onTag,
}: {
  roller: Roller;
  busy: boolean;
  onToggle: (field: 'active' | 'isTurnRoll', value: boolean) => void;
  onPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onTag: (tag: string) => void;
}) {
  const faces = roller.faces ?? [];
  return (
    <li
      className={clsx(
        'group rounded-xl border bg-ink-900/70 p-3 transition hover:border-gold-700/60',
        roller.active ? 'border-ink-600/80' : 'border-dashed border-ink-500/80 opacity-80',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left"
          title="Editar"
        >
          <span className="mt-0.5 shrink-0 transition duration-500 group-hover:rotate-[24deg]">
            {roller.kind === 'roulette' ? <MiniWheel segments={roller.segments} size={44} /> : <DieGlyph sides={faces.length > 0 ? 6 : 20} size={44} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-display text-[15px] font-semibold text-parchment-50">{roller.name}</span>
              <Badge size="xs" tone={roller.kind === 'roulette' ? 'arcane' : 'sky'}>
                {KIND_LABELS[roller.kind]}
              </Badge>
              {!roller.active && (
                <Badge size="xs" tone="outline">
                  Inactiva
                </Badge>
              )}
              {roller.isTurnRoll && (
                <Badge size="xs" tone="gold">
                  De turno
                </Badge>
              )}
              {roller.copiedFromId && (
                <Badge size="xs" tone="neutral" title="Copia independiente importada de otra campaña">
                  Copia
                </Badge>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-parchment-400">
              {roller.kind === 'dice' && faces.length === 0 ? <span className="font-mono text-gold-300">{rollerSummary(roller)}</span> : rollerSummary(roller)}
              {roller.description ? ` · ${roller.description}` : ''}
            </span>
            {roller.kind === 'roulette' && <SegmentStrip segments={roller.segments} className="mt-2" />}
            {roller.kind === 'dice' && faces.length > 0 && (
              <span className="mt-1.5 flex flex-wrap gap-1">
                {faces.slice(0, 8).map((f, i) => (
                  <span key={i} className="chip max-w-[9rem] py-0 text-[10px]">
                    <span className="truncate">{f}</span>
                  </span>
                ))}
                {faces.length > 8 && <span className="chip py-0 text-[10px]">+{faces.length - 8}</span>}
              </span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
          <div className="flex items-center gap-4">
            <Toggle size="sm" checked={roller.active} onChange={(v) => onToggle('active', v)} label="Activa" title="Visible en los menús rápidos de la partida" />
            <Toggle size="sm" checked={roller.isTurnRoll} onChange={(v) => onToggle('isTurnRoll', v)} label="De turno" title="Se ofrece a cada jugador al empezar su turno" />
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton size="sm" icon={<Play />} title="Probar (solo tú lo ves)" onClick={onPreview} />
            <IconButton size="sm" icon={<Pencil />} title="Editar" onClick={onEdit} />
            <IconButton size="sm" icon={<Copy />} title="Duplicar" loading={busy} onClick={onDuplicate} />
            <IconButton size="sm" variant="danger" icon={<Trash2 />} title="Eliminar" disabled={busy} onClick={onRemove} />
          </div>
        </div>
      </div>
      {roller.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 sm:pl-[3.5rem]">
          {roller.tags.map((t) => (
            <button key={t} type="button" onClick={() => onTag(t)} className="text-[11px] text-parchment-400 transition hover:text-gold-200">
              <span className="text-gold-600">#</span>
              {t}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
