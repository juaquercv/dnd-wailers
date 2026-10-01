import type { CreatureSize, EntryDataMap, EntryKind, LibraryEntry, Rarity } from '@wailers/shared';

/** A library entry as declared by the seed (resolved into a LibraryEntry row by seed/index.ts). */
export interface SeedEntry<K extends EntryKind = EntryKind> {
  id: string;
  kind: K;
  name: string;
  description: string;
  imageUrl: string | null;
  /** Raw tags (normalized with normalizeTag when inserted). */
  tags: string[];
  categoryIds: string[];
  ownerId: string | null;
  /** Campaign the entry was created "for" (sets originCampaignId). */
  origin: 'A' | 'B' | null;
  /** Seed version that introduced the entry: upgrades only add entries newer than the database. */
  since: number;
  level: number | null;
  cr: number | null;
  hp: number | null;
  value: number | null;
  weight: number | null;
  rarity: Rarity | null;
  size: CreatureSize | null;
  data: EntryDataMap[K];
}

export type SeedEntryInit<K extends EntryKind> = Pick<SeedEntry<K>, 'id' | 'kind' | 'name' | 'description' | 'data'> & Partial<Omit<SeedEntry<K>, 'id' | 'kind' | 'name' | 'description' | 'data'>>;

export function seedEntry<K extends EntryKind>(init: SeedEntryInit<K>): SeedEntry<K> {
  return {
    imageUrl: null,
    tags: [],
    categoryIds: [],
    ownerId: null,
    origin: null,
    since: 1,
    level: null,
    cr: null,
    hp: null,
    value: null,
    weight: null,
    rarity: null,
    size: null,
    ...init,
  };
}

/** DTO-shaped view of a seed entry (for shared helpers such as inventoryItemFromEntry). */
export function asLibraryEntry<K extends EntryKind>(e: SeedEntry<K>): LibraryEntry<K> {
  const now = new Date(0).toISOString();
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    description: e.description,
    imageUrl: e.imageUrl,
    tags: e.tags,
    categoryIds: e.categoryIds,
    ownerId: e.ownerId,
    ownerName: null,
    originCampaignId: null,
    originCampaignName: null,
    usedInCampaigns: [],
    level: e.level,
    cr: e.cr,
    hp: e.hp,
    value: e.value,
    weight: e.weight,
    rarity: e.rarity,
    size: e.size,
    isFavorite: false,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    data: e.data,
  };
}
