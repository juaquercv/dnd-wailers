import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { ChevronDown, GripVertical, History, RefreshCw, SearchX, Star } from 'lucide-react';
import { ENTRY_KINDS, ENTRY_KIND_LABELS, type EntryKind, type LibraryEntry, type LibraryQuery } from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { SearchInput } from '../../components/ui/SearchInput';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { setEntryDrag } from '../../lib/dnd';
import { EntryThumb, SoundPreviewButton } from './common';
import { EntryDetails } from './EntryDetails';
import { KindIcon, StatChips, entryRarityColor } from './meta';
import { stopSoundPreview } from './soundPreview';
import { useLibrarySearch } from './useLibrarySearch';

export interface LibraryBrowserProps {
  kinds?: EntryKind[];
  initialKind?: EntryKind;
  compact?: boolean;
  campaignId?: string;
  draggable?: boolean;
  onPick?: (entry: LibraryEntry) => void;
  pickLabel?: string;
  className?: string;
}

const PAGE_SIZE = 30;

function markUsed(entry: LibraryEntry, campaignId?: string): void {
  api.library.markUsed(entry.id, campaignId).catch(() => undefined);
}

interface RowProps {
  entry: LibraryEntry;
  compact: boolean;
  draggable: boolean;
  expanded: boolean;
  campaignId?: string;
  pickLabel?: string;
  onToggle: () => void;
  onPick?: (entry: LibraryEntry) => void;
}

function BrowserRow({ entry, compact, draggable, expanded, campaignId, pickLabel, onToggle, onPick }: RowProps) {
  const rarity = entryRarityColor(entry);
  const pick = () => {
    if (!onPick) return;
    markUsed(entry, campaignId);
    onPick(entry);
  };
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    setEntryDrag(e, { id: entry.id, kind: entry.kind, name: entry.name, imageUrl: entry.imageUrl });
  };
  const onDragEnd = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.dropEffect !== 'none') markUsed(entry, campaignId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onPick) pick();
      else onToggle();
    } else if (e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={clsx(
        'group animate-fade-in overflow-hidden rounded-lg border bg-ink-900/80 transition',
        expanded ? 'border-gold-600/60 shadow-glow-gold' : 'border-ink-600/70 hover:border-ink-500 hover:bg-ink-800/80',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
      style={rarity && !expanded ? { borderLeftColor: rarity, borderLeftWidth: 3 } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onDoubleClick={onPick ? pick : undefined}
        onKeyDown={onKeyDown}
        title={onPick ? 'Clic: ver ficha · Doble clic o Intro: ' + (pickLabel ?? 'usar') : 'Clic para ver la ficha'}
        className={clsx('flex items-center gap-2', compact ? 'p-1.5' : 'p-2')}
      >
        {draggable && <GripVertical className="h-3.5 w-3.5 shrink-0 text-parchment-500 opacity-40 transition group-hover:opacity-100" aria-hidden />}
        <EntryThumb entry={entry} size={compact ? 32 : 40} round={entry.kind === 'hero'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={clsx('truncate font-medium text-parchment-50', compact ? 'text-xs' : 'text-sm')} title={entry.name}>
              {entry.name}
            </span>
            {entry.isFavorite && <Star className="h-3 w-3 shrink-0 text-gold-300" fill="currentColor" aria-label="Favorito" />}
          </div>
          <StatChips entry={entry} max={compact ? 2 : 3} size="xs" className="mt-0.5 flex flex-wrap gap-1 overflow-hidden" />
        </div>
        {entry.kind === 'sound' && <SoundPreviewButton entry={entry} size="sm" />}
        <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 text-parchment-500 transition', expanded && 'rotate-180 text-gold-300')} aria-hidden />
        {onPick && (
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              pick();
            }}
          >
            {pickLabel ?? 'Usar'}
          </Button>
        )}
      </div>
      {expanded && (
        <div className="animate-fade-in border-t border-ink-600/70 bg-ink-950/40 p-3">
          <EntryDetails entry={entry} compact />
        </div>
      )}
    </div>
  );
}

/** Compact embeddable library panel: kind tabs, search, favorites/recent toggles, draggable rows. */
export function LibraryBrowser({ kinds, initialKind, compact = false, campaignId, draggable = false, onPick, pickLabel, className }: LibraryBrowserProps) {
  const allowed = useMemo<EntryKind[]>(() => (kinds && kinds.length > 0 ? kinds : [...ENTRY_KINDS]), [kinds]);
  const [kind, setKind] = useState<EntryKind>(() => (initialKind && allowed.includes(initialKind) ? initialKind : allowed[0] ?? 'creature'));
  const [q, setQ] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!allowed.includes(kind)) setKind(allowed[0] ?? 'creature');
  }, [allowed, kind]);

  const query = useMemo<LibraryQuery>(() => {
    const out: LibraryQuery = { kind, sort: recentOnly ? 'recent' : q.trim() ? 'relevance' : 'name', order: recentOnly ? 'desc' : 'asc' };
    if (q.trim()) out.q = q.trim();
    if (favoritesOnly) out.favoritesOnly = true;
    if (recentOnly) out.recentOnly = true;
    return out;
  }, [kind, q, favoritesOnly, recentOnly]);

  const search = useLibrarySearch(query, PAGE_SIZE);
  const { hasMore, loading, loadingMore, loadMore } = search;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setExpandedId(null);
  }, [query]);

  useEffect(() => () => stopSoundPreview(), []);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting) && hasMore && !loading && !loadingMore) loadMore();
      },
      { root, rootMargin: '240px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  const label = ENTRY_KIND_LABELS[kind];
  const firstLoad = loading && !search.loaded;

  return (
    <div className={clsx('flex h-full min-h-0 flex-col', className)}>
      <div className={clsx('flex shrink-0 flex-col gap-2 border-b border-ink-600/70', compact ? 'p-2' : 'p-3')}>
        {allowed.length > 1 && (
          <Tabs<EntryKind>
            variant="pills"
            size="sm"
            fill
            aria-label="Tipo de elemento"
            value={kind}
            onChange={setKind}
            items={allowed.map((k) => ({
              id: k,
              title: ENTRY_KIND_LABELS[k].plural,
              icon: <KindIcon kind={k} />,
              label: compact || allowed.length > 4 ? <span className="sr-only">{ENTRY_KIND_LABELS[k].plural}</span> : ENTRY_KIND_LABELS[k].plural,
            }))}
          />
        )}
        <div className="flex items-center gap-1">
          <SearchInput
            value={q}
            onChange={setQ}
            debounceMs={200}
            size="sm"
            className="min-w-0 flex-1"
            placeholder={`Buscar ${label.plural.toLowerCase()}…`}
          />
          <IconButton
            size="sm"
            icon={<Star />}
            title={favoritesOnly ? 'Mostrar todos' : 'Solo favoritos'}
            active={favoritesOnly}
            onClick={() => setFavoritesOnly((v) => !v)}
          />
          <IconButton
            size="sm"
            icon={<History />}
            title={recentOnly ? 'Mostrar todos' : 'Usados recientemente'}
            active={recentOnly}
            onClick={() => setRecentOnly((v) => !v)}
          />
        </div>
      </div>

      <div ref={scrollRef} className={clsx('scroll-thin relative min-h-0 flex-1 overflow-y-auto', compact ? 'p-1.5' : 'p-2')}>
        {loading && search.loaded && (
          <div className="pointer-events-none sticky top-0 z-10 -mb-0.5 h-0.5 overflow-hidden rounded-full">
            <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,#e9c063,transparent)] bg-[length:200%_100%]" />
          </div>
        )}
        {firstLoad ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-ink-700/60 p-2">
                <div className={clsx('skeleton shrink-0', compact ? 'h-8 w-8' : 'h-10 w-10')} />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : search.error && search.items.length === 0 ? (
          <EmptyState
            compact
            icon={<RefreshCw />}
            title="No se pudo cargar"
            description={search.error}
            action={
              <Button size="sm" variant="secondary" icon={<RefreshCw />} onClick={search.reload}>
                Reintentar
              </Button>
            }
          />
        ) : search.items.length === 0 ? (
          <EmptyState
            compact
            icon={q ? <SearchX /> : <KindIcon kind={kind} />}
            title={
              q
                ? 'Sin resultados'
                : favoritesOnly
                  ? 'Sin favoritos'
                  : recentOnly
                    ? 'Nada usado recientemente'
                    : `No hay ${label.plural.toLowerCase()}`
            }
            description={
              q
                ? `Nada coincide con «${q}». Prueba con otra palabra.`
                : favoritesOnly
                  ? 'Marca elementos con la estrella para tenerlos a mano.'
                  : recentOnly
                    ? 'Lo que uses aparecerá aquí.'
                    : 'Créalos desde la biblioteca compartida.'
            }
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {search.items.map((entry) => (
              <BrowserRow
                key={entry.id}
                entry={entry}
                compact={compact}
                draggable={draggable}
                expanded={expandedId === entry.id}
                campaignId={campaignId}
                pickLabel={pickLabel}
                onPick={onPick}
                onToggle={() => setExpandedId((id) => (id === entry.id ? null : entry.id))}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center py-2">
                {loadingMore ? (
                  <Spinner size="sm" />
                ) : (
                  <Button size="sm" variant="ghost" onClick={loadMore}>
                    Cargar más
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        <div ref={sentinelRef} className="h-px" aria-hidden />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-600/70 px-3 py-1.5 text-[10px] text-parchment-400">
        <span>{search.loaded ? `${search.total} ${search.total === 1 ? 'resultado' : 'resultados'}` : '…'}</span>
        {draggable && <span className="truncate">Arrastra un elemento para colocarlo</span>}
      </div>
    </div>
  );
}
