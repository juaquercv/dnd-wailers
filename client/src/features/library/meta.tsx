import type { ReactNode } from 'react';
import {
  AudioLines,
  BookOpen,
  Brain,
  Clock,
  Coins,
  Crown,
  Gem,
  Heart,
  Layers,
  Link2,
  Map as MapIcon,
  Music,
  Package,
  Repeat,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Sword,
  Users,
  Weight,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  ENTRY_KIND_LABELS,
  RARITY_INFO,
  SIZE_INFO,
  SOUND_TYPE_LABELS,
  SPELL_ANIMATION_LABELS,
  ZONE_TYPE_LABELS,
  type EntryKind,
  type LibraryEntry,
  type LibrarySort,
  type SoundType,
  type SpellAnimation,
} from '@wailers/shared';
import { formatCr, formatDuration, formatGold, formatNumber, formatWeight } from '../../lib/format';

/** Discriminated union over every entry kind (LibraryEntry<EntryKind> does not narrow `data`). */
export type AnyEntry = { [K in EntryKind]: LibraryEntry<K> }[EntryKind];

export function asAny(entry: LibraryEntry): AnyEntry {
  return entry as AnyEntry;
}

export function isEntryKindParam(value: unknown): value is EntryKind {
  return typeof value === 'string' && value in ENTRY_KIND_LABELS;
}

const ICON_BY_NAME: Record<string, LucideIcon> = {
  skull: Skull,
  sword: Sword,
  sparkles: Sparkles,
  map: MapIcon,
  music: Music,
  shield: Shield,
};

const ICON_BY_KIND: Record<EntryKind, LucideIcon> = {
  creature: Skull,
  item: Sword,
  spell: Sparkles,
  zone: MapIcon,
  sound: Music,
  hero: Shield,
};

export function kindIcon(kind: EntryKind): LucideIcon {
  return ICON_BY_NAME[ENTRY_KIND_LABELS[kind]?.icon ?? ''] ?? ICON_BY_KIND[kind] ?? Package;
}

export function KindIcon({ kind, className, strokeWidth }: { kind: EntryKind; className?: string; strokeWidth?: number }) {
  const Icon = kindIcon(kind);
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}

/** Accent color per kind (placeholder art, list markers). */
export const KIND_ACCENT: Record<EntryKind, string> = {
  creature: '#e0625a',
  item: '#e9c063',
  spell: '#a98bff',
  zone: '#4fd1a5',
  sound: '#5ab8f0',
  hero: '#f59e5b',
};

/** Lowercases a label for use mid-sentence, keeping acronyms ("Enemigos y NPCs" → "enemigos y NPCs"). */
export function lowerLabel(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => {
    const letters = word.replace(/[^\p{L}]/gu, '');
    const upper = letters.replace(/s$/, '');
    return upper.length >= 2 && upper === upper.toUpperCase() ? word : word.toLowerCase();
  });
}

/** "Nuevo enemigo/NPC", "Nueva zona/mapa"… */
export function newEntryLabel(kind: EntryKind): string {
  const feminine = kind === 'zone';
  return `${feminine ? 'Nueva' : 'Nuevo'} ${lowerLabel(ENTRY_KIND_LABELS[kind].singular)}`;
}

export const SPELL_ANIMATION_COLORS: Record<SpellAnimation, string> = {
  fire: '#ff7a2a',
  ice: '#7fd6ff',
  lightning: '#f0e05a',
  heal: '#5fd07a',
  arcane: '#a98bff',
  poison: '#6abf3a',
  holy: '#ffe680',
  shadow: '#8a6ab8',
};

export const SOUND_TYPE_ICONS: Record<SoundType, LucideIcon> = {
  music: Music,
  ambience: Wind,
  effect: Zap,
};

/** Rarity color for items, null otherwise. */
export function entryRarityColor(entry: LibraryEntry): string | null {
  return entry.rarity ? RARITY_INFO[entry.rarity]?.color ?? null : null;
}

/** Image to show for an entry: its own image, or the default level background for zone templates. */
export function entryImage(entry: LibraryEntry): string | null {
  if (entry.imageUrl) return entry.imageUrl;
  const e = asAny(entry);
  if (e.kind === 'zone') {
    const content = e.data?.content;
    const level = content?.levels?.find((l) => l.id === content.defaultLevelId) ?? content?.levels?.[0];
    return level?.background?.url ?? null;
  }
  return null;
}

export function spellLevelLabel(level: number | null | undefined): string {
  if (level === null || level === undefined) return 'Sin nivel';
  return level <= 0 ? 'Truco' : `Nivel ${level}`;
}

export interface StatChip {
  key: string;
  label: string;
  title: string;
  icon?: LucideIcon;
  /** Hex color for icon/text. */
  color?: string;
}

/** Key stats of an entry as small chips (cards, lists, quick search). */
export function entryStats(entry: LibraryEntry): StatChip[] {
  const e = asAny(entry);
  const out: StatChip[] = [];
  switch (e.kind) {
    case 'creature': {
      if (e.cr !== null) out.push({ key: 'cr', label: `CR ${formatCr(e.cr)}`, title: 'Valor de desafío', icon: Swords, color: '#e9c063' });
      if (e.hp !== null) out.push({ key: 'hp', label: `${formatNumber(e.hp, 0)} PV`, title: 'Puntos de vida', icon: Heart, color: '#e0625a' });
      if (typeof e.data?.ac === 'number') out.push({ key: 'ac', label: `CA ${e.data.ac}`, title: 'Clase de armadura', icon: Shield, color: '#9fb3c8' });
      if (e.size) out.push({ key: 'size', label: SIZE_INFO[e.size]?.label ?? e.size, title: 'Tamaño' });
      if (e.data?.isNpc) out.push({ key: 'npc', label: 'NPC', title: 'Personaje no jugador', icon: Users, color: '#5fd07a' });
      break;
    }
    case 'item': {
      if (e.value !== null) out.push({ key: 'value', label: formatGold(e.value, true), title: 'Valor', icon: Coins, color: '#e9c063' });
      if (e.weight !== null) out.push({ key: 'weight', label: formatWeight(e.weight), title: 'Peso', icon: Weight });
      if (e.data?.magic) out.push({ key: 'magic', label: 'Mágico', title: 'Objeto mágico', icon: Sparkles, color: '#a98bff' });
      if (e.data?.attunement) out.push({ key: 'attune', label: 'Sintonía', title: 'Requiere sintonización', icon: Link2, color: '#c7b4ff' });
      break;
    }
    case 'spell': {
      out.push({ key: 'level', label: spellLevelLabel(e.level), title: 'Nivel del hechizo', icon: Sparkles, color: '#a98bff' });
      if (e.data?.school) out.push({ key: 'school', label: e.data.school, title: 'Escuela', icon: BookOpen });
      if (e.data?.animation) {
        out.push({
          key: 'anim',
          label: SPELL_ANIMATION_LABELS[e.data.animation] ?? e.data.animation,
          title: 'Animación',
          icon: Zap,
          color: SPELL_ANIMATION_COLORS[e.data.animation],
        });
      }
      if (e.data?.concentration) out.push({ key: 'conc', label: 'Concentración', title: 'Requiere concentración', icon: Brain });
      break;
    }
    case 'zone': {
      const levels = e.data?.content?.levels?.length ?? e.level ?? 0;
      out.push({ key: 'levels', label: levels === 1 ? '1 nivel' : `${levels} niveles`, title: 'Niveles o pisos', icon: Layers, color: '#4fd1a5' });
      const zt = e.data?.content?.zoneType;
      if (zt) out.push({ key: 'type', label: ZONE_TYPE_LABELS[zt] ?? zt, title: 'Tipo de zona', icon: MapIcon });
      break;
    }
    case 'sound': {
      const st = e.data?.soundType;
      if (st) out.push({ key: 'type', label: SOUND_TYPE_LABELS[st] ?? st, title: 'Tipo de sonido', icon: SOUND_TYPE_ICONS[st], color: '#5ab8f0' });
      if (e.data?.durationSec) out.push({ key: 'dur', label: formatDuration(e.data.durationSec), title: 'Duración', icon: Clock });
      if (e.data?.loop) out.push({ key: 'loop', label: 'Bucle', title: 'Se repite en bucle', icon: Repeat });
      break;
    }
    case 'hero': {
      if (e.level !== null) out.push({ key: 'level', label: `Nivel ${e.level}`, title: 'Nivel', icon: Crown, color: '#e9c063' });
      const hpMax = e.data?.hp?.max ?? e.hp;
      if (hpMax !== null && hpMax !== undefined) out.push({ key: 'hp', label: `${formatNumber(hpMax, 0)} PV`, title: 'Puntos de vida máximos', icon: Heart, color: '#e0625a' });
      if (typeof e.data?.ac === 'number') out.push({ key: 'ac', label: `CA ${e.data.ac}`, title: 'Clase de armadura', icon: Shield, color: '#9fb3c8' });
      break;
    }
  }
  return out;
}

export function StatChips({ entry, max, size = 'sm', className }: { entry: LibraryEntry; max?: number; size?: 'xs' | 'sm'; className?: string }) {
  const stats = entryStats(entry).slice(0, max ?? 8);
  if (stats.length === 0) return null;
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1'}>
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <span
            key={s.key}
            title={s.title}
            className={
              size === 'xs'
                ? 'inline-flex items-center gap-1 rounded border border-ink-600 bg-ink-950/60 px-1.5 py-px text-[10px] font-semibold leading-4 text-parchment-200'
                : 'inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-950/60 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-parchment-200'
            }
          >
            {Icon && <Icon className="h-3 w-3 shrink-0" style={s.color ? { color: s.color } : undefined} aria-hidden />}
            <span className="truncate">{s.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export interface EntryColumn {
  id: string;
  header: string;
  className?: string;
  render: (entry: LibraryEntry) => ReactNode;
}

const dash = <span className="text-parchment-500">—</span>;

/** Kind-specific columns of the compact list view. */
export function kindColumns(kind: EntryKind): EntryColumn[] {
  switch (kind) {
    case 'creature':
      return [
        { id: 'cr', header: 'CR', className: 'w-16 text-center', render: (e) => (e.cr === null ? dash : formatCr(e.cr)) },
        { id: 'hp', header: 'PV', className: 'w-16 text-center', render: (e) => (e.hp === null ? dash : formatNumber(e.hp, 0)) },
        {
          id: 'ac',
          header: 'CA',
          className: 'w-14 text-center',
          render: (e) => {
            const a = asAny(e);
            return a.kind === 'creature' && typeof a.data?.ac === 'number' ? a.data.ac : dash;
          },
        },
        { id: 'size', header: 'Tamaño', className: 'w-28', render: (e) => (e.size ? SIZE_INFO[e.size]?.label ?? e.size : dash) },
      ];
    case 'item':
      return [
        {
          id: 'rarity',
          header: 'Rareza',
          className: 'w-28',
          render: (e) =>
            e.rarity ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: RARITY_INFO[e.rarity]?.color }}>
                <Gem className="h-3 w-3" aria-hidden />
                {RARITY_INFO[e.rarity]?.label ?? e.rarity}
              </span>
            ) : (
              dash
            ),
        },
        { id: 'value', header: 'Valor', className: 'w-24 text-right', render: (e) => (e.value === null ? dash : formatGold(e.value, true)) },
        { id: 'weight', header: 'Peso', className: 'w-20 text-right', render: (e) => (e.weight === null ? dash : formatWeight(e.weight)) },
      ];
    case 'spell':
      return [
        { id: 'level', header: 'Nivel', className: 'w-20', render: (e) => spellLevelLabel(e.level) },
        {
          id: 'school',
          header: 'Escuela',
          className: 'w-32',
          render: (e) => {
            const a = asAny(e);
            return a.kind === 'spell' && a.data?.school ? a.data.school : dash;
          },
        },
        {
          id: 'anim',
          header: 'Animación',
          className: 'w-28',
          render: (e) => {
            const a = asAny(e);
            if (a.kind !== 'spell' || !a.data?.animation) return dash;
            return (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: SPELL_ANIMATION_COLORS[a.data.animation] }}>
                <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
                {SPELL_ANIMATION_LABELS[a.data.animation]}
              </span>
            );
          },
        },
      ];
    case 'zone':
      return [
        {
          id: 'levels',
          header: 'Niveles',
          className: 'w-20 text-center',
          render: (e) => {
            const a = asAny(e);
            return a.kind === 'zone' ? a.data?.content?.levels?.length ?? e.level ?? dash : dash;
          },
        },
        {
          id: 'type',
          header: 'Tipo',
          className: 'w-28',
          render: (e) => {
            const a = asAny(e);
            return a.kind === 'zone' && a.data?.content?.zoneType ? ZONE_TYPE_LABELS[a.data.content.zoneType] : dash;
          },
        },
      ];
    case 'sound':
      return [
        {
          id: 'type',
          header: 'Tipo',
          className: 'w-28',
          render: (e) => {
            const a = asAny(e);
            if (a.kind !== 'sound' || !a.data?.soundType) return dash;
            const Icon = SOUND_TYPE_ICONS[a.data.soundType] ?? AudioLines;
            return (
              <span className="inline-flex items-center gap-1.5 text-xs text-sky-300">
                <Icon className="h-3 w-3" aria-hidden />
                {SOUND_TYPE_LABELS[a.data.soundType]}
              </span>
            );
          },
        },
        {
          id: 'dur',
          header: 'Duración',
          className: 'w-20 text-right',
          render: (e) => {
            const a = asAny(e);
            return a.kind === 'sound' && a.data?.durationSec ? formatDuration(a.data.durationSec) : dash;
          },
        },
      ];
    case 'hero':
      return [
        { id: 'level', header: 'Nivel', className: 'w-16 text-center', render: (e) => (e.level === null ? dash : e.level) },
        {
          id: 'hp',
          header: 'PV',
          className: 'w-16 text-center',
          render: (e) => {
            const a = asAny(e);
            const v = a.kind === 'hero' ? a.data?.hp?.max ?? a.hp : a.hp;
            return v === null || v === undefined ? dash : formatNumber(v, 0);
          },
        },
        {
          id: 'ac',
          header: 'CA',
          className: 'w-14 text-center',
          render: (e) => {
            const a = asAny(e);
            return a.kind === 'hero' && typeof a.data?.ac === 'number' ? a.data.ac : dash;
          },
        },
      ];
    default:
      return [];
  }
}

export interface SortOption {
  value: LibrarySort;
  label: string;
}

/** Sort options that make sense for a kind. */
export function sortOptions(kind: EntryKind): SortOption[] {
  const out: SortOption[] = [
    { value: 'relevance', label: 'Relevancia' },
    { value: 'name', label: 'Nombre' },
  ];
  if (kind === 'creature') out.push({ value: 'cr', label: 'Desafío (CR)' });
  if (kind === 'spell' || kind === 'hero' || kind === 'zone') out.push({ value: 'level', label: kind === 'zone' ? 'Número de niveles' : 'Nivel' });
  if (kind === 'item') out.push({ value: 'rarity', label: 'Rareza' });
  out.push({ value: 'created', label: 'Fecha de creación' }, { value: 'recent', label: 'Uso reciente' });
  return out;
}

/** Natural direction when the user picks a sort. */
export function defaultOrder(sort: LibrarySort): 'asc' | 'desc' {
  return sort === 'created' || sort === 'recent' || sort === 'rarity' ? 'desc' : 'asc';
}

/** Generic Spanish D&D damage types (suggestions for resistances, attacks…). */
export const DAMAGE_TYPE_SUGGESTIONS = [
  'Ácido',
  'Contundente',
  'Cortante',
  'Frío',
  'Fuego',
  'Fuerza',
  'Necrótico',
  'Perforante',
  'Psíquico',
  'Radiante',
  'Rayo',
  'Trueno',
  'Veneno',
];
