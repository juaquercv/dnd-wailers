import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Copy,
  Eye,
  FilePlus2,
  FilterX,
  FolderTree,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  SlidersHorizontal,
  Star,
  Wand2,
  X,
} from 'lucide-react';
import { ENTRY_KINDS, ENTRY_KIND_LABELS, type EntryKind, type LibraryEntry, type LibraryEntryInput, type LibrarySort } from '@wailers/shared';
import { api } from '../../api/http';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Kbd } from '../../components/ui/Kbd';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { toast } from '../../components/ui/toast';
import { formatNumber, plural } from '../../lib/format';
import { useHotkeys } from '../../lib/hotkeys';
import { useCurrentUser } from '../../stores/auth';
import { useSettingsStore, type LibraryView } from '../../stores/settings';
import { useUsers } from '../../stores/users';
import { HeroCreatorModal } from '../heroes/HeroCreatorModal';
import { ActiveFilters } from './ActiveFilters';
import { CategoryManager } from './CategoryManager';
import { EntryCard, EntryCardSkeleton, EntryTable } from './EntryCard';
import { EntryDrawer } from './EntryDrawer';
import { EntryEditorModal } from './EntryEditorModal';
import { FilterSidebar } from './FilterSidebar';
import {
  activeFilterCount,
  emptyFilters,
  loadStoredFilters,
  rememberKind,
  rememberedKind,
  storeFilters,
  toQuery,
  type FilterState,
  type FiltersByKind,
} from './filters';
import { KindIcon, defaultOrder, isEntryKindParam, lowerLabel, newEntryLabel, sortOptions } from './meta';
import { QuickSearch, type QuickAction } from './QuickSearch';
import { SavedFiltersMenu } from './SavedFilters';
import { stopSoundPreview } from './soundPreview';
import { useCampaignList, useLibrarySearch } from './useLibrarySearch';

const PAGE_SIZE = 36;
const NO_FILTERS: FilterState = emptyFilters();

interface EditorState {
  kind: EntryKind;
  entry: LibraryEntry | null;
  defaults?: Partial<LibraryEntryInput>;
}

/** Shared library: browse, filter and manage every kind of entry (routes /biblioteca and /biblioteca/:kind). */
export default function LibraryPage() {
  const { kind: kindParam } = useParams<{ kind?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fallbackKind] = useState<EntryKind>(rememberedKind);
  const kind: EntryKind = isEntryKindParam(kindParam) ? kindParam : fallbackKind;
  const user = useCurrentUser();
  const userId = user?.id ?? '';
  const confirm = useConfirm();
  const { users } = useUsers();
  const campaigns = useCampaignList();
  const view = useSettingsStore((s) => s.libraryView);
  const setView = useSettingsStore((s) => s.setLibraryView);

  // ----- kind & filters -----------------------------------------------------
  useEffect(() => {
    if (kindParam !== undefined && !isEntryKindParam(kindParam)) navigate('/biblioteca', { replace: true });
  }, [kindParam, navigate]);

  useEffect(() => rememberKind(kind), [kind]);

  const [allFilters, setAllFilters] = useState<FiltersByKind>(loadStoredFilters);
  useEffect(() => storeFilters(allFilters), [allFilters]);
  const filters = allFilters[kind] ?? NO_FILTERS;
  const setFiltersFor = useCallback((k: EntryKind, next: FilterState) => setAllFilters((prev) => ({ ...prev, [k]: next })), []);
  const setFilters = useCallback((next: FilterState) => setFiltersFor(kind, next), [kind, setFiltersFor]);

  const query = useMemo(() => toQuery(kind, filters), [kind, filters]);
  const queryKey = JSON.stringify(query);
  const search = useLibrarySearch(query, PAGE_SIZE);
  const { patch, reload, loadMore, hasMore, loading, loadingMore } = search;
  const filterCount = activeFilterCount(filters, kind);
  const hasQuery = (filters.q ?? '').trim().length > 0;

  // ----- detail drawer (?id=) --------------------------------------------------
  const openId = searchParams.get('id');
  const [fetched, setFetched] = useState<LibraryEntry | null>(null);
  const detail = useMemo<LibraryEntry | null>(() => {
    if (!openId) return null;
    return search.items.find((i) => i.id === openId) ?? (fetched && fetched.id === openId ? fetched : null);
  }, [openId, search.items, fetched]);

  const setOpenParam = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('id', id);
          else next.delete('id');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openEntry = useCallback(
    (entry: LibraryEntry) => {
      setFetched(entry);
      if (entry.kind !== kind) navigate(`/biblioteca/${entry.kind}?id=${encodeURIComponent(entry.id)}`);
      else setOpenParam(entry.id);
    },
    [kind, navigate, setOpenParam],
  );
  const closeDetail = useCallback(() => setOpenParam(null), [setOpenParam]);

  // Deep link: load the entry when it is not among the loaded results.
  const missingDetail = openId !== null && detail === null;
  useEffect(() => {
    if (!missingDetail || !openId) return;
    let alive = true;
    api.library
      .get(openId)
      .then((entry) => {
        if (!alive) return;
        setFetched(entry);
        if (entry.kind !== kind) navigate(`/biblioteca/${entry.kind}?id=${encodeURIComponent(entry.id)}`, { replace: true });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        toast.fromError(err, 'No se encontró ese elemento de la biblioteca');
        closeDetail();
      });
    return () => {
      alive = false;
    };
  }, [missingDetail, openId, kind, navigate, closeDetail]);

  // ----- modals ------------------------------------------------------------------
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [heroCreatorOpen, setHeroCreatorOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ----- entry actions -------------------------------------------------------------
  const canModify = useCallback(
    (entry: LibraryEntry) => entry.kind !== 'hero' || entry.ownerId === null || entry.ownerId === userId,
    [userId],
  );

  const applyEntry = useCallback(
    (updated: LibraryEntry) => {
      patch((items) => items.map((i) => (i.id === updated.id ? updated : i)));
      setFetched((f) => (f && f.id === updated.id ? updated : f));
    },
    [patch],
  );

  const toggleFavorite = async (entry: LibraryEntry) => {
    const next = !entry.isFavorite;
    applyEntry({ ...entry, isFavorite: next });
    try {
      await api.library.setFavorite(entry.id, next);
      if (!next && filters.favoritesOnly && entry.kind === kind) patch((items) => items.filter((i) => i.id !== entry.id), -1);
    } catch (err) {
      applyEntry({ ...entry, isFavorite: entry.isFavorite });
      toast.fromError(err, 'No se pudo actualizar el favorito');
    }
  };

  const duplicate = async (entry: LibraryEntry) => {
    try {
      const copy = await api.library.duplicate(entry.id);
      if (copy.kind === kind) {
        patch((items) => {
          const idx = items.findIndex((i) => i.id === entry.id);
          const next = [...items];
          next.splice(idx + 1, 0, copy);
          return next;
        }, 1);
      }
      toast.success('Copia creada', { description: copy.name });
      openEntry(copy);
    } catch (err) {
      toast.fromError(err, 'No se pudo duplicar el elemento');
    }
  };

  const remove = async (entry: LibraryEntry) => {
    const used = entry.usedInCampaigns?.length ?? 0;
    const ok = await confirm({
      title: `Eliminar «${entry.name}»`,
      message: (
        <>
          Desaparecerá de la biblioteca compartida para todos los usuarios.
          {entry.kind === 'hero' && ' Se perderán su progreso, su inventario y sus hechizos.'}
          {used > 0 && ` Se ha usado en ${plural(used, 'campaña', 'campañas')}.`} Esta acción no se puede deshacer.
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.library.remove(entry.id);
      patch((items) => items.filter((i) => i.id !== entry.id), entry.kind === kind ? -1 : 0);
      if (openId === entry.id) closeDetail();
      toast.success(`«${entry.name}» eliminado de la biblioteca`);
    } catch (err) {
      toast.fromError(err, 'No se pudo eliminar el elemento');
    }
  };

  const editEntry = (entry: LibraryEntry) => {
    if (!canModify(entry)) {
      toast.warning('Solo el jugador dueño del héroe puede modificarlo');
      return;
    }
    setEditor({ kind: entry.kind, entry });
  };

  const openNew = useCallback(() => {
    if (kind === 'hero') {
      setHeroCreatorOpen(true);
      return;
    }
    const defaults: Partial<LibraryEntryInput> = {};
    if (filters.categoryIds?.length) defaults.categoryIds = [...filters.categoryIds];
    if (filters.campaignId) defaults.originCampaignId = filters.campaignId;
    setEditor({ kind, entry: null, defaults });
  }, [kind, filters.categoryIds, filters.campaignId]);

  const openManualHero = () => setEditor({ kind: 'hero', entry: null });

  const onEditorSaved = (saved: LibraryEntry) => {
    const wasNew = !editor?.entry;
    setEditor(null);
    if (wasNew) {
      reload();
      openEntry(saved);
    } else {
      applyEntry(saved);
    }
  };

  const onHeroCreated = (hero: LibraryEntry<'hero'>) => {
    setHeroCreatorOpen(false);
    toast.success(`¡${hero.name} está listo para la aventura!`);
    reload();
    openEntry(hero);
  };

  const quickActions = (entry: LibraryEntry): QuickAction[] => {
    const actions: QuickAction[] = [{ id: 'open', label: 'Ver ficha', icon: <Eye />, run: () => openEntry(entry) }];
    if (canModify(entry)) actions.push({ id: 'edit', label: 'Editar', icon: <Pencil />, run: () => setEditor({ kind: entry.kind, entry }) });
    actions.push({
      id: 'favorite',
      label: entry.isFavorite ? 'Quitar favorito' : 'Favorito',
      icon: <Star />,
      run: () => void toggleFavorite(entry),
    });
    actions.push({ id: 'duplicate', label: 'Duplicar', icon: <Copy />, run: () => void duplicate(entry) });
    return actions;
  };

  // ----- scrolling, infinite loading ----------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [queryKey]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting) && hasMore && !loading && !loadingMore) loadMore();
      },
      { root, rootMargin: '400px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  // Keep the selected result visible while browsing with the drawer arrows.
  useEffect(() => {
    if (!openId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(openId)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [openId]);

  useEffect(() => () => stopSoundPreview(), []);

  // ----- hotkeys ---------------------------------------------------------------------------
  useHotkeys(
    {
      'mod+k': () => {
        if (!isAnyModalOpen()) setQuickOpen(true);
      },
    },
    { allowInInputs: true },
  );
  useHotkeys({
    '/': () => {
      if (!isAnyModalOpen()) searchRef.current?.focus();
    },
    n: () => {
      if (!isAnyModalOpen()) openNew();
    },
  });

  // ----- derived -----------------------------------------------------------------------------
  const label = ENTRY_KIND_LABELS[kind];
  const firstLoad = loading && !search.loaded;
  const detailIndex = detail ? search.items.findIndex((i) => i.id === detail.id) : -1;
  const prevEntry = detailIndex > 0 ? search.items[detailIndex - 1] ?? null : null;
  const nextEntry = detailIndex >= 0 ? search.items[detailIndex + 1] ?? null : null;
  const sort: LibrarySort = filters.sort ?? 'relevance';
  const order = filters.order ?? defaultOrder(sort);

  const clearAll = () => setFilters({ ...emptyFilters(), sort: filters.sort ?? 'relevance', order: filters.order ?? 'asc' });

  const sidebar = (
    <FilterSidebar kind={kind} filters={filters} onChange={setFilters} campaigns={campaigns} users={users} showSearch={false} />
  );

  const renderResults = () => {
    if (firstLoad) {
      return view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-4">
          {Array.from({ length: 12 }, (_, i) => (
            <EntryCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <EntryTable kind={kind} entries={[]} selectedId={null} onOpen={openEntry} onToggleFavorite={(e) => void toggleFavorite(e)} loadingRows={10} />
      );
    }
    if (search.error && search.items.length === 0) {
      return (
        <EmptyState
          icon={<RefreshCw />}
          title="No se pudo consultar la biblioteca"
          description={search.error}
          action={
            <Button variant="secondary" icon={<RefreshCw />} onClick={reload}>
              Reintentar
            </Button>
          }
        />
      );
    }
    if (search.items.length === 0) {
      if (filterCount > 0 || hasQuery) {
        return (
          <EmptyState
            icon={<SearchX />}
            title="Ningún resultado"
            description={
              hasQuery
                ? `Nada coincide con «${(filters.q ?? '').trim()}»${filterCount > 0 ? ' con los filtros activos' : ''}. La búsqueda tolera erratas y tildes: prueba con otra palabra o quita algún filtro.`
                : 'Ningún elemento cumple todos los filtros activos. Quita alguno para ampliar la búsqueda.'
            }
            action={
              <Button variant="secondary" icon={<FilterX />} onClick={clearAll}>
                Limpiar búsqueda y filtros
              </Button>
            }
          />
        );
      }
      return (
        <EmptyState
          icon={<KindIcon kind={kind} />}
          title={`Todavía no hay ${lowerLabel(label.plural)}`}
          description="La biblioteca es compartida: todo lo que crees aquí estará disponible en todas las campañas."
          action={
            <Button variant="primary" icon={kind === 'hero' ? <Wand2 /> : <Plus />} onClick={openNew}>
              {kind === 'hero' ? 'Crear héroe' : newEntryLabel(kind)}
            </Button>
          }
        />
      );
    }
    return (
      <>
        {view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-4">
            {search.items.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                selected={detail?.id === entry.id}
                onOpen={openEntry}
                onToggleFavorite={(e) => void toggleFavorite(e)}
              />
            ))}
            {loadingMore && Array.from({ length: 4 }, (_, i) => <EntryCardSkeleton key={`more-${i}`} />)}
          </div>
        ) : (
          <EntryTable
            kind={kind}
            entries={search.items}
            selectedId={detail?.id ?? null}
            onOpen={openEntry}
            onToggleFavorite={(e) => void toggleFavorite(e)}
            loadingRows={loadingMore ? 3 : 0}
          />
        )}
        <div className="flex justify-center py-6">
          {hasMore ? (
            loadingMore ? (
              <Spinner size="sm" label="Cargando más…" showLabel />
            ) : (
              <Button variant="ghost" onClick={loadMore}>
                Cargar más ({formatNumber(search.items.length, 0)} de {formatNumber(search.total, 0)})
              </Button>
            )
          ) : (
            search.total > PAGE_SIZE && (
              <span className="inline-flex items-center gap-2 text-xs text-parchment-500">
                <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-700/60" />
                Fin de la lista · {plural(search.total, 'resultado', 'resultados')}
                <span className="h-px w-10 bg-gradient-to-l from-transparent to-gold-700/60" />
              </span>
            )
          )}
        </div>
      </>
    );
  };

  return (
    <AppShell
      title="Biblioteca compartida"
      subtitle={`${label.plural} · disponible en todas las campañas`}
      back="/menu"
      fullBleed
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<Search />}
            onClick={() => setQuickOpen(true)}
            title="Búsqueda rápida (Ctrl+K)"
            className="hidden md:inline-flex"
          >
            <span className="hidden xl:inline-flex xl:items-center xl:gap-2">
              Búsqueda rápida <Kbd combo="mod+k" />
            </span>
          </Button>
          <Button variant="secondary" size="sm" icon={<FolderTree />} onClick={() => setCategoriesOpen(true)} title="Gestionar categorías">
            <span className="hidden md:inline">Categorías</span>
          </Button>
          {kind === 'hero' ? (
            <>
              <Button variant="secondary" size="sm" icon={<FilePlus2 />} onClick={openManualHero} title="Ficha de héroe en blanco" className="hidden sm:inline-flex">
                <span className="hidden lg:inline">Ficha manual</span>
              </Button>
              <Button variant="primary" size="sm" icon={<Wand2 />} onClick={() => setHeroCreatorOpen(true)} title="Asistente de creación (N)">
                Crear héroe
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" icon={<Plus />} onClick={openNew} title={`${newEntryLabel(kind)} (N)`}>
              <span className="hidden sm:inline">{newEntryLabel(kind)}</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Kind tabs */}
        <div className="shrink-0 bg-ink-900/50">
          <Tabs<EntryKind>
            aria-label="Tipo de elemento"
            value={kind}
            onChange={(k) => navigate(`/biblioteca/${k}`)}
            className="px-2 sm:px-4"
            items={ENTRY_KINDS.map((k) => ({
              id: k,
              title: ENTRY_KIND_LABELS[k].plural,
              icon: <KindIcon kind={k} />,
              label: (
                <span className="inline-flex items-center gap-2">
                  <span className="hidden sm:inline">{ENTRY_KIND_LABELS[k].plural}</span>
                  <span className="sm:hidden">{ENTRY_KIND_LABELS[k].singular.split('/')[0]}</span>
                </span>
              ),
              badge: k === kind && search.loaded && !loading ? formatNumber(search.total, 0) : undefined,
            }))}
          />
        </div>

        <div className="relative flex min-h-0 flex-1">
          {/* Desktop filter sidebar */}
          <aside className="hidden w-72 shrink-0 flex-col border-r border-ink-600/60 bg-ink-900/40 lg:flex xl:w-80">
            <div className="flex shrink-0 items-center gap-2 border-b border-ink-600/50 px-4 py-2.5">
              <SlidersHorizontal className="h-4 w-4 text-gold-400" />
              <span className="font-display text-sm font-semibold tracking-wide text-parchment-100">Filtros</span>
              {filterCount > 0 && (
                <span className="rounded-full bg-gold-500/20 px-1.5 text-[10px] font-bold text-gold-200">{filterCount}</span>
              )}            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">{sidebar}</div>
          </aside>

          {/* Results */}
          <section className={clsx('flex min-w-0 flex-1 flex-col transition-[margin] duration-300', detail && '2xl:mr-[38rem]')}>
            <div className="flex shrink-0 flex-col gap-2 border-b border-ink-600/50 bg-ink-900/30 px-3 py-2.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<SlidersHorizontal />}
                  className="lg:hidden"
                  onClick={() => setFiltersOpen(true)}
                  aria-label="Mostrar filtros"
                >
                  Filtros
                  {filterCount > 0 && <span className="ml-1 rounded-full bg-gold-500/25 px-1.5 text-[10px] font-bold text-gold-200">{filterCount}</span>}
                </Button>
                <SearchInput
                  ref={searchRef}
                  value={filters.q ?? ''}
                  onChange={(q) => setFilters({ ...filters, q })}
                  debounceMs={250}
                  placeholder={`Buscar ${lowerLabel(label.plural)} por nombre, etiqueta o categoría…`}
                  aria-label="Buscar en la biblioteca"
                  className="min-w-[12rem] flex-1"
                  hint={<Kbd>/</Kbd>}
                />
                <div className="flex items-center gap-1">
                  <Select<LibrarySort>
                    size="sm"
                    aria-label="Ordenar por"
                    title="Ordenar por"
                    value={sort}
                    containerClassName="w-40"
                    placeholder="Orden personalizado"
                    onChange={(s) => setFilters({ ...filters, sort: s, order: defaultOrder(s) })}
                    options={sortOptions(kind)}
                  />
                  <IconButton
                    size="sm"
                    variant="secondary"
                    icon={order === 'asc' ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
                    title={sort === 'relevance' ? 'La relevancia siempre muestra primero lo más parecido' : order === 'asc' ? 'Ascendente (clic para invertir)' : 'Descendente (clic para invertir)'}
                    disabled={sort === 'relevance'}
                    onClick={() => setFilters({ ...filters, order: order === 'asc' ? 'desc' : 'asc' })}
                  />
                </div>
                <SavedFiltersMenu
                  kind={kind}
                  filters={filters}
                  onApply={(k, f) => {
                    setFiltersFor(k, f);
                    if (k !== kind) navigate(`/biblioteca/${k}`);
                  }}
                />
                <Tabs<LibraryView>
                  variant="pills"
                  size="sm"
                  aria-label="Vista de resultados"
                  value={view}
                  onChange={setView}
                  items={[
                    { id: 'grid', label: <span className="sr-only">Cuadrícula</span>, icon: <LayoutGrid />, title: 'Vista en cuadrícula' },
                    { id: 'list', label: <span className="sr-only">Lista</span>, icon: <List />, title: 'Vista en lista compacta' },
                  ]}
                />
              </div>
              <div className="flex min-h-[1.5rem] flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs text-parchment-400" aria-live="polite">
                  {loading && <Spinner size="xs" />}
                  {search.loaded ? plural(search.total, 'resultado', 'resultados') : 'Buscando…'}
                  {hasQuery && sort === 'relevance' && search.loaded && <span className="text-parchment-500">· por relevancia</span>}
                </span>
                <ActiveFilters kind={kind} filters={filters} onChange={setFilters} campaigns={campaigns} users={users} />
              </div>
            </div>

            <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
              {loading && search.loaded && (
                <div className="pointer-events-none sticky top-0 z-10 h-0.5 overflow-hidden">
                  <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,#e9c063,transparent)] bg-[length:200%_100%]" />
                </div>
              )}
              <div className={clsx('px-3 py-4 transition-opacity sm:px-5', loading && search.loaded && 'opacity-70')}>{renderResults()}</div>
              <div ref={sentinelRef} className="h-px" aria-hidden />
            </div>
          </section>

          {/* Mobile filters */}
          {filtersOpen && (
            <div className="absolute inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]" onClick={() => setFiltersOpen(false)} aria-hidden />
              <aside className="absolute inset-y-0 left-0 flex w-[min(22rem,92vw)] animate-fade-in flex-col border-r border-gold-700/40 bg-ink-900 shadow-modal">
                <div className="flex shrink-0 items-center gap-2 border-b border-ink-600/60 px-4 py-2.5">
                  <SlidersHorizontal className="h-4 w-4 text-gold-400" />
                  <span className="font-display text-sm font-semibold text-parchment-100">Filtros</span>
                  <IconButton size="sm" icon={<X />} title="Cerrar filtros" className="ml-auto" onClick={() => setFiltersOpen(false)} />
                </div>
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">{sidebar}</div>
                <div className="shrink-0 border-t border-ink-600/60 p-3">
                  <Button variant="primary" block onClick={() => setFiltersOpen(false)}>
                    Ver {search.loaded ? plural(search.total, 'resultado', 'resultados') : 'resultados'}
                  </Button>
                </div>
              </aside>
            </div>
          )}

          {detail && (
            <EntryDrawer
              entry={detail}
              canModify={canModify(detail)}
              onClose={closeDetail}
              onEdit={editEntry}
              onDuplicate={duplicate}
              onDelete={remove}
              onToggleFavorite={(e) => void toggleFavorite(e)}
              onPrev={prevEntry ? () => openEntry(prevEntry) : undefined}
              onNext={nextEntry ? () => openEntry(nextEntry) : detailIndex >= 0 && hasMore ? loadMore : undefined}
              position={detailIndex >= 0 ? { index: detailIndex + 1, total: search.total } : null}
            />
          )}
        </div>
      </div>

      <EntryEditorModal
        open={editor !== null}
        kind={editor?.kind ?? kind}
        entry={editor?.entry ?? null}
        defaults={editor?.defaults}
        onClose={() => setEditor(null)}
        onSaved={onEditorSaved}
      />
      <HeroCreatorModal open={heroCreatorOpen} onClose={() => setHeroCreatorOpen(false)} onCreated={onHeroCreated} rules={null} ownerId={userId} />
      <CategoryManager open={categoriesOpen} kind={kind} onClose={() => setCategoriesOpen(false)} />
      <QuickSearch
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        placeholder="Buscar en toda la biblioteca…"
        actionsFor={quickActions}
      />
    </AppShell>
  );
}
