import type { KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Castle } from 'lucide-react';
import { RARITY_INFO, type EntryKind, type LibraryEntry } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { withAlpha } from '../../components/ui/Badge';
import { formatCr } from '../../lib/format';
import { useUser } from '../../stores/users';
import { CategoryChips, EntryThumb, FavoriteButton, SoundPreviewButton, TagList } from './common';
import { StatChips, asAny, entryRarityColor, kindColumns, spellLevelLabel } from './meta';

export interface EntryCardProps {
  entry: LibraryEntry;
  selected?: boolean;
  onOpen: (entry: LibraryEntry) => void;
  onToggleFavorite: (entry: LibraryEntry) => void;
}

function onActivateKey(e: KeyboardEvent, fn: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}

/** The single most important stat, shown on the card image. */
function HeadlineBadge({ entry }: { entry: LibraryEntry }) {
  const e = asAny(entry);
  let text: string | null = null;
  let color = '#e9c063';
  if (e.kind === 'creature' && e.cr !== null) text = `CR ${formatCr(e.cr)}`;
  else if (e.kind === 'item' && e.rarity) {
    text = RARITY_INFO[e.rarity]?.label ?? null;
    color = RARITY_INFO[e.rarity]?.color ?? color;
  } else if (e.kind === 'spell') {
    text = spellLevelLabel(e.level);
    color = '#c7b4ff';
  } else if (e.kind === 'hero' && e.level !== null) text = `Nivel ${e.level}`;
  else if (e.kind === 'zone') {
    const n = e.data?.content?.levels?.length ?? e.level ?? 0;
    text = n === 1 ? '1 nivel' : `${n} niveles`;
    color = '#4fd1a5';
  }
  if (!text) return null;
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider backdrop-blur"
      style={{ color, borderColor: withAlpha(color, 0.55), backgroundColor: 'rgba(11,10,8,0.72)' }}
    >
      {text}
    </span>
  );
}

function OwnerAvatar({ entry, size = 'sm' }: { entry: LibraryEntry; size?: 'xs' | 'sm' }) {
  const user = useUser(entry.ownerId);
  if (entry.kind !== 'hero' || !entry.ownerId) return null;
  const name = user?.name ?? entry.ownerName ?? entry.ownerId;
  return <Avatar name={name} color={user?.color} size={size} title={`Jugador: ${name}`} />;
}

/** Grid card. */
export function EntryCard({ entry, selected = false, onOpen, onToggleFavorite }: EntryCardProps) {
  const rarity = entryRarityColor(entry);
  const accent = rarity ?? null;
  const e = asAny(entry);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(ev) => onActivateKey(ev, () => onOpen(entry))}
      aria-label={entry.name}
      className={clsx(
        'group relative flex animate-fade-in cursor-pointer flex-col overflow-hidden rounded-xl border bg-ink-900/90 shadow-panel transition duration-200 ease-out',
        'hover:-translate-y-0.5 focus-visible:-translate-y-0.5',
        selected ? 'border-gold-400/80 shadow-glow-gold' : !accent && 'border-ink-600/80 hover:border-gold-600/70 hover:shadow-glow-gold',
      )}
      style={
        accent && !selected
          ? { borderColor: withAlpha(accent, 0.55), boxShadow: `0 10px 30px -14px rgba(0,0,0,0.85), 0 0 18px -10px ${accent}` }
          : undefined
      }
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink-950">
        <EntryThumb entry={entry} className="transition duration-500 group-hover:scale-[1.04]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/10 to-transparent" />
        {accent && <div className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
        <div className="absolute left-2 top-2">
          <HeadlineBadge entry={entry} />
        </div>
        <div className="absolute right-1.5 top-1.5">
          <FavoriteButton active={entry.isFavorite} onToggle={() => onToggleFavorite(entry)} className="bg-ink-950/50 backdrop-blur" />
        </div>
        {e.kind === 'sound' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SoundPreviewButton entry={entry} size="lg" />
          </div>
        )}
        {e.kind === 'hero' && (
          <div className="absolute bottom-2 right-2">
            <OwnerAvatar entry={entry} />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-1 font-display text-[15px] font-semibold leading-5 tracking-wide text-parchment-50 group-hover:text-gold-100" title={entry.name}>
          {entry.name}
        </h3>
        {entry.description && <p className="line-clamp-2 text-xs leading-snug text-parchment-400">{entry.description}</p>}
        <StatChips entry={entry} max={4} size="xs" />
        <CategoryChips ids={entry.categoryIds} max={3} size="xs" />
        <TagList tags={entry.tags} max={3} />
        {entry.originCampaignName && (
          <div className="mt-auto pt-1">
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-arcane-500/30 bg-arcane-500/10 px-1.5 py-0.5 text-[10px] font-medium text-arcane-300"
              title={`Creado en la campaña «${entry.originCampaignName}»`}
            >
              <Castle className="h-3 w-3 shrink-0" />
              <span className="truncate">{entry.originCampaignName}</span>
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export function EntryCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-ink-600/60 bg-ink-900/70">
      <div className="skeleton aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-full" />
        <div className="flex gap-1">
          <div className="skeleton h-4 w-12" />
          <div className="skeleton h-4 w-14" />
          <div className="skeleton h-4 w-10" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

export interface EntryTableProps {
  kind: EntryKind;
  entries: LibraryEntry[];
  selectedId: string | null;
  onOpen: (entry: LibraryEntry) => void;
  onToggleFavorite: (entry: LibraryEntry) => void;
  loadingRows?: number;
}

/** Compact table for the list view. */
export function EntryTable({ kind, entries, selectedId, onOpen, onToggleFavorite, loadingRows = 0 }: EntryTableProps) {
  const columns = kindColumns(kind);
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-600/70 bg-ink-900/70 shadow-panel">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-600/80 bg-ink-950/50 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-parchment-400">
            <th className="w-12 py-2 pl-3" aria-label="Imagen" />
            <th className="py-2 pr-3">Nombre</th>
            {columns.map((c) => (
              <th key={c.id} className={clsx('px-2 py-2', c.className)}>
                {c.header}
              </th>
            ))}
            <th className="px-2 py-2">Categorías</th>
            <th className="hidden px-2 py-2 xl:table-cell">Origen</th>
            <th className="w-10 py-2 pr-2" aria-label="Favorito" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const rarity = entryRarityColor(entry);
            const e = asAny(entry);
            return (
              <tr
                key={entry.id}
                tabIndex={0}
                onClick={() => onOpen(entry)}
                onKeyDown={(ev) => onActivateKey(ev, () => onOpen(entry))}
                className={clsx(
                  'group cursor-pointer border-b border-ink-700/60 transition last:border-b-0 hover:bg-ink-800/80 focus-visible:bg-ink-800/80',
                  selectedId === entry.id && 'bg-gold-500/[0.08]',
                )}
              >
                <td className="py-1.5 pl-3">
                  <span className="relative block">
                    <EntryThumb entry={entry} size={36} round={entry.kind === 'hero'} />
                    {rarity && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink-900" style={{ backgroundColor: rarity }} />}
                  </span>
                </td>
                <td className="max-w-[18rem] py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-parchment-50 group-hover:text-gold-100" title={entry.name}>
                      {entry.name}
                    </span>
                    {e.kind === 'creature' && e.data?.isNpc && (
                      <span className="shrink-0 rounded border border-emerald-500/40 px-1 text-[9px] font-bold uppercase text-emerald-300">NPC</span>
                    )}
                    {e.kind === 'sound' && <SoundPreviewButton entry={entry} size="sm" />}
                    {e.kind === 'hero' && <OwnerAvatar entry={entry} size="xs" />}
                  </div>
                  {entry.tags.length > 0 && <TagList tags={entry.tags} max={3} className="mt-0.5 flex gap-1.5 overflow-hidden" />}
                </td>
                {columns.map((c) => (
                  <td key={c.id} className={clsx('px-2 py-1.5 tabular-nums text-parchment-200', c.className)}>
                    {c.render(entry)}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <CategoryChips ids={entry.categoryIds} max={2} size="xs" className="flex max-w-[16rem] flex-wrap gap-1" />
                </td>
                <td className="hidden max-w-[10rem] truncate px-2 py-1.5 text-xs text-arcane-300 xl:table-cell" title={entry.originCampaignName ?? undefined}>
                  {entry.originCampaignName ?? <span className="text-parchment-500">—</span>}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <FavoriteButton size="sm" active={entry.isFavorite} onToggle={() => onToggleFavorite(entry)} />
                </td>
              </tr>
            );
          })}
          {Array.from({ length: loadingRows }, (_, i) => (
            <tr key={`sk-${i}`} className="border-b border-ink-700/60 last:border-b-0">
              <td className="py-2 pl-3">
                <div className="skeleton h-9 w-9" />
              </td>
              <td className="py-2 pr-3">
                <div className="skeleton h-3.5 w-40" />
              </td>
              {columns.map((c) => (
                <td key={c.id} className="px-2 py-2">
                  <div className="skeleton h-3 w-10" />
                </td>
              ))}
              <td className="px-2 py-2">
                <div className="skeleton h-3 w-24" />
              </td>
              <td className="hidden px-2 py-2 xl:table-cell">
                <div className="skeleton h-3 w-16" />
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

