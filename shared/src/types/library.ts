import type { CreatureSize, EntryKind, Rarity, SoundType, SpellAnimation } from '../constants';
import type { ZoneContent } from './campaign';

/**
 * A single shared-library table holds every kind of entry. Facet columns
 * (level, cr, hp, value, weight, rarity, size) are canonical and edited directly;
 * kind-specific mechanics live in `data`.
 *
 * Facet column meaning per kind:
 *  - creature: cr, hp (max HP), size
 *  - item:     rarity, value (gold), weight
 *  - spell:    level (0 = cantrip)
 *  - zone:     level (= number of levels/floors)
 *  - hero:     level, hp (derived from data.hp.max by the server on save)
 *  - sound:    none
 */
export interface LibraryEntryBase {
  id: string;
  kind: EntryKind;
  name: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  categoryIds: string[];
  ownerId: string | null;
  ownerName: string | null;
  originCampaignId: string | null;
  originCampaignName: string | null;
  usedInCampaigns: { id: string; name: string }[];
  level: number | null;
  cr: number | null;
  hp: number | null;
  value: number | null;
  weight: number | null;
  rarity: Rarity | null;
  size: CreatureSize | null;
  /** Per requesting user. */
  isFavorite: boolean;
  /** Per requesting user. ISO date or null. */
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntryDataMap {
  creature: CreatureData;
  item: ItemData;
  spell: SpellData;
  zone: ZoneTemplateData;
  sound: SoundData;
  hero: HeroData;
}

export interface LibraryEntry<K extends EntryKind = EntryKind> extends LibraryEntryBase {
  kind: K;
  data: EntryDataMap[K];
}

export type CreatureEntry = LibraryEntry<'creature'>;
export type ItemEntry = LibraryEntry<'item'>;
export type SpellEntry = LibraryEntry<'spell'>;
export type ZoneTemplateEntry = LibraryEntry<'zone'>;
export type SoundEntry = LibraryEntry<'sound'>;
export type HeroEntry = LibraryEntry<'hero'>;

/** Ability scores keyed by AttributeDef.key (str, dex, con, int, wis, cha or custom). */
export type AbilityScores = Record<string, number>;

export interface CreatureAttack {
  id: string;
  name: string;
  /** Free text, e.g. "+7". Never evaluated automatically. */
  bonus: string;
  /** Free text, e.g. "2d6+4". */
  damage: string;
  damageType: string;
  range: string;
  notes: string;
}

export interface NamedText {
  id: string;
  name: string;
  description: string;
}

export interface SuggestedLoot {
  id: string;
  entryId: string | null;
  name: string;
  quantity: number;
  notes: string;
}

export interface CreatureData {
  isNpc: boolean;
  ac: number;
  speed: string;
  abilities: AbilityScores;
  attacks: CreatureAttack[];
  traits: NamedText[];
  resistances: string[];
  weaknesses: string[];
  immunities: string[];
  /** Reference only, never applied automatically. */
  suggestedLoot: SuggestedLoot[];
  xp: number;
  /** Token diameter override in grid cells; null = derived from size. */
  tokenCells: number | null;
  notes: string;
}

export interface ItemData {
  magic: boolean;
  attunement: boolean;
  stackable: boolean;
  effects: string;
  damage: string;
  armorClass: number | null;
  charges: number | null;
  /** Inventory slots used when the campaign counts slots. */
  slots: number;
}

export interface SpellData {
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  components: string;
  concentration: boolean;
  /** Mana cost when the campaign uses mana. */
  manaCost: number;
  /** Spell slot level when the campaign uses slots (0 = cantrip, no slot). */
  slotLevel: number;
  effect: string;
  damage: string;
  damageType: string;
  animation: SpellAnimation;
  /** Display names of classes (also categorized). */
  classes: string[];
}

export interface ZoneTemplateData {
  content: ZoneContent;
}

export interface SoundData {
  url: string;
  soundType: SoundType;
  loop: boolean;
  /** 0..1 default playback volume. */
  volume: number;
  durationSec: number | null;
}

export interface InventoryItem {
  id: string;
  entryId: string | null;
  name: string;
  imageUrl: string | null;
  quantity: number;
  weight: number;
  value: number;
  slots: number;
  rarity: Rarity | null;
  description: string;
  equipped: boolean;
  notes: string;
}

export interface HeroSpell {
  id: string;
  entryId: string | null;
  name: string;
  level: number;
  manaCost: number;
  slotLevel: number;
  animation: SpellAnimation;
  description: string;
  prepared: boolean;
}

export interface SpellSlotState {
  level: number; // 1..9
  max: number;
  used: number;
}

export interface LimitedUse {
  id: string;
  name: string;
  max: number;
  used: number;
  resetOn: 'short' | 'long';
}

/** A hero carries every resource kind; the UI shows only what the campaign rules enable. */
export interface HeroResources {
  mana: { current: number; max: number };
  slots: SpellSlotState[];
  uses: LimitedUse[];
}

export interface HeroData {
  abilities: AbilityScores;
  hp: { current: number; max: number; temp: number };
  ac: number;
  speed: string;
  initiativeBonus: number;
  xp: number;
  gold: number;
  inventory: InventoryItem[];
  spells: HeroSpell[];
  resources: HeroResources;
  statuses: string[];
  /** Vision radius in grid cells (darkvision etc.); null = session default. */
  visionCells: number | null;
  notes: string;
  /** Movement per turn in grid cells; null/undefined = derived from `speed` (see heroMoveCells in turns.ts). */
  moveCells?: number | null;
  /** Combat actions per turn (attack, spell, use an item...). undefined = 1. */
  actionsPerTurn?: number;
}

export interface CategoryDTO {
  id: string;
  kind: EntryKind;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface CategoryNode extends CategoryDTO {
  children: CategoryNode[];
}

export type LibrarySort = 'relevance' | 'name' | 'level' | 'cr' | 'rarity' | 'created' | 'recent';

/**
 * Library search. Semantics:
 *  - q: fuzzy (trigram) + accent/case-insensitive over name, description, tags and category names.
 *  - categoryIds: descendants included; OR inside the same facet (root category), AND across facets.
 *  - tags: entry must contain all.
 *  - dataEquals: exact match on top-level keys of `data` (e.g. { magic: true, soundType: 'music' }).
 *  - campaignId: origin campaign OR used in campaign.
 */
export interface LibraryQuery {
  kind?: EntryKind;
  q?: string;
  categoryIds?: string[];
  tags?: string[];
  rarity?: Rarity[];
  size?: CreatureSize[];
  levelMin?: number;
  levelMax?: number;
  crMin?: number;
  crMax?: number;
  hpMin?: number;
  hpMax?: number;
  valueMin?: number;
  valueMax?: number;
  weightMin?: number;
  weightMax?: number;
  campaignId?: string;
  ownerId?: string;
  favoritesOnly?: boolean;
  recentOnly?: boolean;
  dataEquals?: Record<string, string | number | boolean>;
  sort?: LibrarySort;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface LibraryPage {
  items: LibraryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SavedFilterDTO {
  id: string;
  userId: string;
  name: string;
  kind: EntryKind | null;
  query: LibraryQuery;
  createdAt: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Payload to create/update an entry. Server fills ids, owner defaults, searchText, timestamps. */
export interface LibraryEntryInput<K extends EntryKind = EntryKind> {
  kind: K;
  name: string;
  description?: string;
  imageUrl?: string | null;
  tags?: string[];
  categoryIds?: string[];
  ownerId?: string | null;
  originCampaignId?: string | null;
  level?: number | null;
  cr?: number | null;
  hp?: number | null;
  value?: number | null;
  weight?: number | null;
  rarity?: Rarity | null;
  size?: CreatureSize | null;
  data: EntryDataMap[K];
}
