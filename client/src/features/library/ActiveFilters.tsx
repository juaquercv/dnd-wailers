import type { ReactNode } from 'react';
import { Castle, History, Star, User, X } from 'lucide-react';
import {
  RARITY_INFO,
  SIZE_INFO,
  SOUND_TYPE_LABELS,
  SPELL_ANIMATION_LABELS,
  type CampaignSummary,
  type EntryKind,
  type SoundType,
  type SpellAnimation,
  type UserStatusDTO,
} from '@wailers/shared';
import { withAlpha } from '../../components/ui/Badge';
import { formatCr, formatNumber } from '../../lib/format';
import { useCategoriesStore } from '../../stores/categories';
import { RANGES_BY_KIND, RANGE_LABELS, clearFilters, getRange, withDataEquals, withRange, type FilterState, type RangeKey } from './filters';

export interface ActiveFiltersProps {
  kind: EntryKind;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  campaigns: CampaignSummary[];
  users: UserStatusDTO[];
}

interface ChipDef {
  key: string;
  label: ReactNode;
  color?: string;
  icon?: ReactNode;
  remove: () => FilterState;
}

const DATA_LABELS: Record<string, (value: string | number | boolean) => string> = {
  magic: (v) => (v ? 'Mágico' : 'No mágico'),
  attunement: (v) => (v ? 'Requiere sintonización' : 'Sin sintonización'),
  isNpc: (v) => (v ? 'Solo NPCs' : 'Solo enemigos'),
  concentration: (v) => (v ? 'Concentración' : 'Sin concentración'),
  loop: (v) => (v ? 'En bucle' : 'Sin bucle'),
  soundType: (v) => SOUND_TYPE_LABELS[v as SoundType] ?? String(v),
  animation: (v) => `Animación: ${SPELL_ANIMATION_LABELS[v as SpellAnimation] ?? String(v)}`,
};

function formatRangeValue(key: RangeKey, v: number): string {
  if (key === 'cr') return formatCr(v);
  return formatNumber(v, 2);
}

function rangeLabel(key: RangeKey, min: number | null, max: number | null): string {
  const name = RANGE_LABELS[key];
  if (min !== null && max !== null) return `${name} ${formatRangeValue(key, min)}–${formatRangeValue(key, max)}`;
  if (min !== null) return `${name} ≥ ${formatRangeValue(key, min)}`;
  return `${name} ≤ ${formatRangeValue(key, max ?? 0)}`;
}

/** Removable chips summarizing the active filters (search text excluded). */
export function ActiveFilters({ kind, filters, onChange, campaigns, users }: ActiveFiltersProps) {
  const byId = useCategoriesStore((s) => s.byId);
  const chips: ChipDef[] = [];

  for (const id of filters.categoryIds ?? []) {
    const cat = byId[id];
    if (!cat) continue;
    chips.push({
      key: `cat-${id}`,
      label: cat.name,
      color: cat.color ?? undefined,
      icon: cat.icon ? <span className="leading-none">{cat.icon}</span> : undefined,
      remove: () => ({ ...filters, categoryIds: (filters.categoryIds ?? []).filter((c) => c !== id) }),
    });
  }
  for (const tag of filters.tags ?? []) {
    chips.push({
      key: `tag-${tag}`,
      label: (
        <>
          <span className="text-gold-500">#</span>
          {tag}
        </>
      ),
      remove: () => ({ ...filters, tags: (filters.tags ?? []).filter((t) => t !== tag) }),
    });
  }
  if (kind === 'item') {
    for (const r of filters.rarity ?? []) {
      chips.push({
        key: `rarity-${r}`,
        label: RARITY_INFO[r].label,
        color: RARITY_INFO[r].color,
        remove: () => ({ ...filters, rarity: (filters.rarity ?? []).filter((x) => x !== r) }),
      });
    }
  }
  if (kind === 'creature') {
    for (const s of filters.size ?? []) {
      chips.push({
        key: `size-${s}`,
        label: SIZE_INFO[s].label,
        remove: () => ({ ...filters, size: (filters.size ?? []).filter((x) => x !== s) }),
      });
    }
  }
  for (const r of RANGES_BY_KIND[kind]) {
    const { min, max } = getRange(filters, r.key);
    if (min === null && max === null) continue;
    chips.push({ key: `range-${r.key}`, label: rangeLabel(r.key, min, max), remove: () => withRange(filters, r.key, null, null) });
  }
  for (const [key, value] of Object.entries(filters.dataEquals ?? {})) {
    const fmt = DATA_LABELS[key];
    chips.push({ key: `data-${key}`, label: fmt ? fmt(value) : `${key}: ${String(value)}`, remove: () => withDataEquals(filters, key, null) });
  }
  if (filters.campaignId) {
    const name = campaigns.find((c) => c.id === filters.campaignId)?.name ?? 'Campaña';
    chips.push({
      key: 'campaign',
      label: name,
      icon: <Castle className="h-3 w-3" />,
      color: '#a98bff',
      remove: () => {
        const next = { ...filters };
        delete next.campaignId;
        return next;
      },
    });
  }
  if (kind === 'hero' && filters.ownerId) {
    const user = users.find((u) => u.id === filters.ownerId);
    chips.push({
      key: 'owner',
      label: user?.name ?? filters.ownerId,
      icon: <User className="h-3 w-3" />,
      color: user?.color,
      remove: () => {
        const next = { ...filters };
        delete next.ownerId;
        return next;
      },
    });
  }
  if (filters.favoritesOnly) {
    chips.push({
      key: 'fav',
      label: 'Favoritos',
      icon: <Star className="h-3 w-3" fill="currentColor" />,
      color: '#e9c063',
      remove: () => {
        const next = { ...filters };
        delete next.favoritesOnly;
        return next;
      },
    });
  }
  if (filters.recentOnly) {
    chips.push({
      key: 'recent',
      label: 'Usados recientemente',
      icon: <History className="h-3 w-3" />,
      color: '#5ab8f0',
      remove: () => {
        const next = { ...filters };
        delete next.recentOnly;
        return next;
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos">
      {chips.map((c) => {
        const color = c.color ?? '#cdb98f';
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.remove())}
            title="Quitar este filtro"
            className="group inline-flex max-w-[16rem] animate-fade-in items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-1 text-[11px] font-medium text-parchment-100 transition hover:brightness-125 active:scale-95"
            style={{ borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.12) }}
          >
            {c.icon ? (
              <span className="shrink-0" style={{ color }}>
                {c.icon}
              </span>
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            )}
            <span className="truncate">{c.label}</span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-parchment-400 transition group-hover:bg-black/30 group-hover:text-parchment-50">
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(clearFilters(filters))}
          className="ml-1 text-[11px] font-semibold text-parchment-400 underline-offset-2 transition hover:text-gold-200 hover:underline"
        >
          Quitar todos
        </button>
      )}
    </div>
  );
}
