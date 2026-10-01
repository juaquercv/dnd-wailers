import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Copy, Lock, Pencil, Star, Trash2, X } from 'lucide-react';
import { ENTRY_KIND_LABELS, type LibraryEntry } from '@wailers/shared';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Kbd } from '../../components/ui/Kbd';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { useHotkeys } from '../../lib/hotkeys';
import { EntryDetails } from './EntryDetails';
import { KIND_ACCENT, KindIcon, entryRarityColor } from './meta';

export interface EntryDrawerProps {
  entry: LibraryEntry;
  /** False when the current user may not edit / delete it (heroes of other players). */
  canModify: boolean;
  onClose: () => void;
  onEdit: (entry: LibraryEntry) => void;
  onDuplicate: (entry: LibraryEntry) => Promise<void>;
  onDelete: (entry: LibraryEntry) => Promise<void>;
  onToggleFavorite: (entry: LibraryEntry) => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** 1-based position among the loaded results. */
  position?: { index: number; total: number } | null;
}

/** Right-side panel with the full read-only card of an entry and its actions. */
export function EntryDrawer({
  entry,
  canModify,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onPrev,
  onNext,
  position,
}: EntryDrawerProps) {
  const [busy, setBusy] = useState<'dup' | 'del' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accent = entryRarityColor(entry) ?? KIND_ACCENT[entry.kind];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [entry.id]);

  // Keys already handled by an inner widget (seek bar, tabs, popovers) or under a modal are ignored.
  const guard = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.defaultPrevented || isAnyModalOpen()) return;
    e.preventDefault();
    fn();
  };
  useHotkeys(
    {
      escape: guard(onClose),
      'arrowleft, k': guard(() => onPrev?.()),
      'arrowright, j': guard(() => onNext?.()),
      e: guard(() => {
        if (canModify) onEdit(entry);
      }),
      f: guard(() => onToggleFavorite(entry)),
    },
    { preventDefault: false },
  );

  const run = async (kind: 'dup' | 'del', fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const lockedTitle = 'Solo el jugador dueño del héroe puede modificarlo';

  return (
    <>
      <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[2px] animate-fade-in lg:hidden" onClick={onClose} aria-hidden />
      <aside
        className="absolute inset-y-0 right-0 z-40 flex w-full animate-slide-in-right flex-col border-l border-gold-700/40 bg-ink-900/[0.97] shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur sm:w-[34rem] xl:w-[38rem]"
        aria-label={`Ficha de ${entry.name}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-px"
          style={{ background: `linear-gradient(180deg, transparent, ${accent}, transparent)` }}
        />
        <div className="flex shrink-0 items-center gap-2 border-b border-ink-600/70 px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: KIND_ACCENT[entry.kind] }}>
            <KindIcon kind={entry.kind} className="h-3.5 w-3.5" />
            {ENTRY_KIND_LABELS[entry.kind].singular}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {position && position.total > 1 && (
              <>
                <IconButton size="sm" icon={<ChevronLeft />} title="Anterior (←)" disabled={!onPrev} onClick={onPrev} />
                <span className="min-w-[3.5rem] text-center text-[11px] tabular-nums text-parchment-400">
                  {position.index} / {position.total}
                </span>
                <IconButton size="sm" icon={<ChevronRight />} title="Siguiente (→)" disabled={!onNext} onClick={onNext} />
                <span className="divider-vertical mx-1 h-5" aria-hidden />
              </>
            )}
            <IconButton size="sm" icon={<X />} title="Cerrar (Esc)" onClick={onClose} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-600/50 bg-ink-950/30 px-4 py-2">
          <Button
            size="sm"
            variant="primary"
            icon={canModify ? <Pencil /> : <Lock />}
            disabled={!canModify}
            title={canModify ? 'Editar (E)' : lockedTitle}
            onClick={() => onEdit(entry)}
          >
            Editar
          </Button>
          <Button size="sm" variant="secondary" icon={<Copy />} loading={busy === 'dup'} onClick={() => void run('dup', () => onDuplicate(entry))}>
            Duplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Star className={clsx(entry.isFavorite && 'text-gold-300')} fill={entry.isFavorite ? 'currentColor' : 'none'} />}
            onClick={() => onToggleFavorite(entry)}
            title={entry.isFavorite ? 'Quitar de favoritos (F)' : 'Añadir a favoritos (F)'}
            aria-pressed={entry.isFavorite}
            className={clsx(entry.isFavorite && 'text-gold-200')}
          >
            {entry.isFavorite ? 'Favorito' : 'Marcar favorito'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            loading={busy === 'del'}
            disabled={!canModify}
            title={canModify ? 'Eliminar de la biblioteca' : lockedTitle}
            onClick={() => void run('del', () => onDelete(entry))}
            className="ml-auto text-blood-300 hover:bg-blood-600/15 hover:text-blood-200"
          >
            Eliminar
          </Button>
        </div>

        <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div key={entry.id} className="animate-fade-in">
            <EntryDetails entry={entry} />
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-3 border-t border-ink-600/60 px-4 py-1.5 text-[10px] text-parchment-500 sm:flex">
          <span className="inline-flex items-center gap-1">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> anterior / siguiente
          </span>
          {canModify && (
            <span className="inline-flex items-center gap-1">
              <Kbd>E</Kbd> editar
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Kbd>F</Kbd> favorito
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> cerrar
          </span>
        </div>
      </aside>
    </>
  );
}
