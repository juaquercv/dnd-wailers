import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CREATURE_SIZES,
  LIGHTING_PRESETS,
  RARITIES,
  SOUND_TYPES,
  SOUND_TYPE_LABELS,
  SPELL_ANIMATIONS,
  WEATHER_TYPES,
  ZONE_TYPES,
  ZONE_TYPE_LABELS,
  buildSearchText,
  cloneZoneContent,
  defaultVisibility,
  emptyEntryData,
  newId,
  normalizeTag,
  normalizeTags,
  type EntryDataMap,
  type EntryKind,
  type HeroData,
  type LibraryEntry,
  type LibraryEntryInput,
  type LibraryPage,
  type LibraryQuery,
  type TagCount,
  type ZoneTemplateData,
} from '@wailers/shared';
import { bus } from '../bus';
import { prisma } from '../db';
import { badRequest, forbidden, notFound } from '../http/errors';
import {
  HERO_ACTIONS_PER_TURN_MAX,
  HERO_MOVE_CELLS_MAX,
  ZONE_VISION_LIMITS,
  entryInclude,
  entryToDTO,
  normalizeEntryData,
  parseLevels,
  parseZoneVision,
  toJson,
  withDefaults,
  type EntryRow,
} from './serializers';
import { buildLibrarySearch, escapeLike, facetGroups, parseLibraryQuery, searchCountSql, searchIdsSql } from './search';

/*
 * Shared library domain logic: entry validation/normalization, CRUD, favorites, recents,
 * tags, heroes, search and searchText maintenance. Used by the library and category routes;
 * other modules may reuse createEntry() (e.g. "save zone as template") so every write keeps
 * searchText, tags and facet columns consistent.
 */

export const MESSAGES = {
  entryNotFound: 'Elemento no encontrado',
  heroOwnerOnly: 'Solo el dueño del héroe puede modificarlo',
  kindChange: 'No se puede cambiar el tipo de un elemento',
  ownerNotFound: 'El dueño indicado no existe',
  originNotFound: 'La campaña de origen indicada no existe',
  campaignNotFound: 'Campaña no encontrada',
  categoryWrongKind: 'Una de las categorías elegidas no corresponde a este tipo de elemento',
} as const;

const NAME_MAX = 120;
const COPY_SUFFIX = ' (copia)';
const MAX_TAGS = 50;
const EXTRA_PIECE_MAX = 400;
const TAG_SUGGESTIONS = 40;

// ---------------------------------------------------------------------------
// Category index (small table, loaded on demand)
// ---------------------------------------------------------------------------

export interface CategoryInfo {
  id: string;
  kind: string;
  name: string;
  parentId: string | null;
}

export interface CategoryIndex {
  byId: Map<string, CategoryInfo>;
  children: Map<string, string[]>;
}

export function buildCategoryIndex(rows: readonly CategoryInfo[]): CategoryIndex {
  const byId = new Map<string, CategoryInfo>();
  const children = new Map<string, string[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.parentId) {
      const list = children.get(row.parentId) ?? [];
      list.push(row.id);
      children.set(row.parentId, list);
    }
  }
  return { byId, children };
}

export async function loadCategoryIndex(): Promise<CategoryIndex> {
  const rows = await prisma.category.findMany({ select: { id: true, kind: true, name: true, parentId: true } });
  return buildCategoryIndex(rows);
}

/** The category and every descendant (cycle-safe). */
export function descendantIds(index: CategoryIndex, id: string, includeSelf = true): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (current !== id || includeSelf) out.push(current);
    for (const child of index.children.get(current) ?? []) stack.push(child);
  }
  return out;
}

/** Names of the given categories and their ancestors, excluding facet roots (they would match every entry). */
export function categorySearchNames(ids: readonly string[], index: CategoryIndex): string[] {
  const names = new Set<string>();
  for (const id of ids) {
    const seen = new Set<string>();
    let current = index.byId.get(id);
    while (current && current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id);
      names.add(current.name);
      current = index.byId.get(current.parentId);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const num = z.number({ invalid_type_error: 'Debe ser un número' }).finite('Debe ser un número válido');
const nonNeg = num.min(0, 'No puede ser negativo');
const text = (max: number) => z.string({ invalid_type_error: 'Debe ser un texto' }).max(max, `Máximo ${max} caracteres`);
const nullableId = z.string().max(100).nullable().default(null);

/** Id inside a JSON document: kept when present, generated when missing or empty. */
const docId = (prefix: string) =>
  z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v && v.trim() ? v : newId(prefix)));

const namedTextSchema = z
  .object({ id: docId('trt'), name: text(200).default(''), description: text(5000).default('') })
  .passthrough();

const attackSchema = z
  .object({
    id: docId('atk'),
    name: text(200).default(''),
    bonus: text(100).default(''),
    damage: text(200).default(''),
    damageType: text(200).default(''),
    range: text(200).default(''),
    notes: text(2000).default(''),
  })
  .passthrough();

const lootSchema = z
  .object({
    id: docId('loot'),
    entryId: nullableId,
    name: text(200).default(''),
    quantity: nonNeg.default(1),
    notes: text(2000).default(''),
  })
  .passthrough();

const creatureDataSchema = z
  .object({
    isNpc: z.boolean().optional(),
    ac: num.optional(),
    speed: text(200).optional(),
    abilities: z.record(num).optional(),
    attacks: z.array(attackSchema).max(100).optional(),
    traits: z.array(namedTextSchema).max(100).optional(),
    resistances: z.array(text(100)).max(100).optional(),
    weaknesses: z.array(text(100)).max(100).optional(),
    immunities: z.array(text(100)).max(100).optional(),
    suggestedLoot: z.array(lootSchema).max(100).optional(),
    xp: nonNeg.optional(),
    tokenCells: num.positive('Debe ser mayor que cero').max(20).nullable().optional(),
    notes: text(20000).optional(),
  })
  .passthrough();

const itemDataSchema = z
  .object({
    magic: z.boolean().optional(),
    attunement: z.boolean().optional(),
    stackable: z.boolean().optional(),
    effects: text(20000).optional(),
    damage: text(200).optional(),
    armorClass: num.nullable().optional(),
    charges: nonNeg.nullable().optional(),
    slots: nonNeg.optional(),
  })
  .passthrough();

const spellDataSchema = z
  .object({
    school: text(200).optional(),
    castingTime: text(200).optional(),
    range: text(200).optional(),
    duration: text(200).optional(),
    components: text(200).optional(),
    concentration: z.boolean().optional(),
    manaCost: nonNeg.optional(),
    slotLevel: z.number().int().min(0).max(9).optional(),
    effect: text(20000).optional(),
    damage: text(200).optional(),
    damageType: text(200).optional(),
    animation: z.enum(SPELL_ANIMATIONS).optional(),
    classes: z.array(text(100)).max(50).optional(),
  })
  .passthrough();

/** ZoneVision: default vision inside a zone (radius in grid cells, cone in degrees; both rounded). */
export const zoneVisionSchema = z.object({
  mode: z.enum(['all', 'explored', 'vision'], {
    errorMap: () => ({ message: 'Modo de visión no válido (opciones: all, explored, vision)' }),
  }),
  radius: num
    .min(ZONE_VISION_LIMITS.radiusMin, 'El radio de visión no puede ser negativo')
    .max(ZONE_VISION_LIMITS.radiusMax, `El radio de visión admite como máximo ${ZONE_VISION_LIMITS.radiusMax} casillas`)
    .transform((value) => Math.round(value))
    .default(defaultVisibility().visionRadius),
  cone: num
    .min(ZONE_VISION_LIMITS.coneMin, `El cono de visión debe medir al menos ${ZONE_VISION_LIMITS.coneMin}°`)
    .max(ZONE_VISION_LIMITS.coneMax, `El cono de visión admite como máximo ${ZONE_VISION_LIMITS.coneMax}°`)
    .transform((value) => Math.round(value))
    .default(ZONE_VISION_LIMITS.coneMax),
});

const zoneDataSchema = z
  .object({
    content: z
      .object({
        zoneType: z.enum(ZONE_TYPES).optional(),
        biome: text(200).optional(),
        weather: z.enum(WEATHER_TYPES).optional(),
        lighting: z.enum(LIGHTING_PRESETS).optional(),
        levels: z.array(z.record(z.unknown())).max(50, 'Demasiados niveles').optional(),
        defaultLevelId: z.string().max(100).optional(),
        notes: text(20000).optional(),
        vision: zoneVisionSchema.nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const soundDataSchema = z
  .object({
    url: text(2000).optional(),
    soundType: z.enum(SOUND_TYPES).optional(),
    loop: z.boolean().optional(),
    volume: num.min(0).max(1).optional(),
    durationSec: nonNeg.nullable().optional(),
  })
  .passthrough();

const inventoryItemSchema = z
  .object({
    id: docId('inv'),
    entryId: nullableId,
    name: text(200).default('Objeto'),
    imageUrl: z.string().max(2000).nullable().default(null),
    quantity: nonNeg.default(1),
    weight: nonNeg.default(0),
    value: nonNeg.default(0),
    slots: nonNeg.default(1),
    rarity: z.enum(RARITIES).nullable().default(null),
    description: text(20000).default(''),
    equipped: z.boolean().default(false),
    notes: text(5000).default(''),
  })
  .passthrough();

const heroSpellSchema = z
  .object({
    id: docId('hsp'),
    entryId: nullableId,
    name: text(200).default(''),
    level: z.number().int().min(0).max(9).default(0),
    manaCost: nonNeg.default(0),
    slotLevel: z.number().int().min(0).max(9).default(0),
    animation: z.enum(SPELL_ANIMATIONS).default('arcane'),
    description: text(20000).default(''),
    prepared: z.boolean().default(true),
  })
  .passthrough();

const slotStateSchema = z
  .object({
    level: z.number().int().min(1).max(9),
    max: nonNeg.default(0),
    used: nonNeg.default(0),
  })
  .passthrough();

const limitedUseSchema = z
  .object({
    id: docId('use'),
    name: text(200).default(''),
    max: nonNeg.default(1),
    used: nonNeg.default(0),
    resetOn: z.enum(['short', 'long']).default('long'),
  })
  .passthrough();

const heroDataSchema = z
  .object({
    abilities: z.record(num).optional(),
    hp: z.object({ current: num.optional(), max: nonNeg.optional(), temp: nonNeg.optional() }).passthrough().optional(),
    ac: num.optional(),
    speed: text(200).optional(),
    initiativeBonus: num.optional(),
    xp: nonNeg.optional(),
    gold: num.optional(),
    inventory: z.array(inventoryItemSchema).max(500).optional(),
    spells: z.array(heroSpellSchema).max(300).optional(),
    resources: z
      .object({
        mana: z.object({ current: num.optional(), max: nonNeg.optional() }).passthrough().optional(),
        slots: z.array(slotStateSchema).max(9).optional(),
        uses: z.array(limitedUseSchema).max(100).optional(),
      })
      .passthrough()
      .optional(),
    statuses: z.array(text(60)).max(50).optional(),
    visionCells: nonNeg.max(1000).nullable().optional(),
    notes: text(20000).optional(),
    moveCells: nonNeg.max(HERO_MOVE_CELLS_MAX, `El movimiento admite como máximo ${HERO_MOVE_CELLS_MAX} casillas`).nullable().optional(),
    actionsPerTurn: num
      .int('Las acciones por turno deben ser un número entero')
      .min(0, 'No puede ser negativo')
      .max(HERO_ACTIONS_PER_TURN_MAX, `Como máximo ${HERO_ACTIONS_PER_TURN_MAX} acciones de combate por turno`)
      .optional(),
  })
  .passthrough();

const entryBaseShape = {
  name: z
    .string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser un texto' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(NAME_MAX, `El nombre admite como máximo ${NAME_MAX} caracteres`),
  description: text(20000).nullish(),
  imageUrl: z.string().trim().max(2000).nullish(),
  tags: z.array(z.string().max(80)).max(100, 'Demasiadas etiquetas').nullish(),
  categoryIds: z.array(z.string().trim().min(1).max(100)).max(200, 'Demasiadas categorías').nullish(),
  ownerId: z.string().trim().max(100).nullish(),
  originCampaignId: z.string().trim().max(100).nullish(),
  level: num.min(0, 'El nivel no puede ser negativo').max(1000).nullish(),
  cr: nonNeg.max(1000).nullish(),
  hp: nonNeg.max(10_000_000).nullish(),
  value: nonNeg.max(1e12).nullish(),
  weight: nonNeg.max(1e9).nullish(),
  rarity: z.enum(RARITIES).nullish(),
  size: z.enum(CREATURE_SIZES).nullish(),
};

/** LibraryEntryInput validation: per-kind `data` checked loosely (unknown keys kept), missing fields defaulted later. */
export const entryInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...entryBaseShape, kind: z.literal('creature'), data: creatureDataSchema.optional() }),
  z.object({ ...entryBaseShape, kind: z.literal('item'), data: itemDataSchema.optional() }),
  z.object({ ...entryBaseShape, kind: z.literal('spell'), data: spellDataSchema.optional() }),
  z.object({ ...entryBaseShape, kind: z.literal('zone'), data: zoneDataSchema.optional() }),
  z.object({ ...entryBaseShape, kind: z.literal('sound'), data: soundDataSchema.optional() }),
  z.object({ ...entryBaseShape, kind: z.literal('hero'), data: heroDataSchema.optional() }),
]);

export type ParsedEntryInput = z.infer<typeof entryInputSchema>;

/** Validates a create/update payload (throws ZodError -> 400). */
export function parseEntryInput(raw: unknown): ParsedEntryInput {
  return entryInputSchema.parse(raw);
}

/** Complete data document for a kind: the given (validated) value merged over the shared defaults. */
export function completeEntryData<K extends EntryKind>(kind: K, data: unknown): EntryDataMap[K] {
  const merged = normalizeEntryData(kind, withDefaults(emptyEntryData(kind), data ?? {})) as EntryDataMap[K];
  if (kind === 'zone') return normalizeZoneData(merged as ZoneTemplateData) as EntryDataMap[K];
  return merged;
}

function normalizeZoneData(data: ZoneTemplateData): ZoneTemplateData {
  const content = data.content;
  const levels = parseLevels(content.levels, newId('tpl'), content.defaultLevelId);
  const defaultLevelId = levels.some((l) => l.id === content.defaultLevelId) ? content.defaultLevelId : levels[0]!.id;
  return { ...data, content: { ...content, levels, defaultLevelId, vision: parseZoneVision(content.vision) } };
}

// ---------------------------------------------------------------------------
// searchText
// ---------------------------------------------------------------------------

const HAS_WORD = /[\p{L}\p{N}]/u;

function strings(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : [];
}

function namesOf(values: unknown, key: string): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    if (typeof v === 'object' && v !== null && key in v) {
      const field = (v as Record<string, unknown>)[key];
      if (typeof field === 'string') out.push(field);
    }
  }
  return out;
}

/** Key strings of the data document that should be searchable (attack names, spell school, item effects…). */
export function dataSearchStrings(kind: EntryKind, data: unknown): string[] {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  let pieces: string[] = [];
  switch (kind) {
    case 'creature':
      pieces = [
        ...namesOf(d.attacks, 'name'),
        ...namesOf(d.attacks, 'damageType'),
        ...namesOf(d.traits, 'name'),
        ...strings(d.resistances),
        ...strings(d.weaknesses),
        ...strings(d.immunities),
      ];
      break;
    case 'item':
      pieces = [d.magic === true ? 'mágico' : '', typeof d.damage === 'string' ? d.damage : '', typeof d.effects === 'string' ? d.effects : ''];
      break;
    case 'spell':
      pieces = [
        typeof d.school === 'string' ? d.school : '',
        typeof d.damageType === 'string' ? d.damageType : '',
        ...strings(d.classes),
        typeof d.effect === 'string' ? d.effect : '',
      ];
      break;
    case 'zone': {
      const content = (typeof d.content === 'object' && d.content !== null ? d.content : {}) as Record<string, unknown>;
      const zoneType = typeof content.zoneType === 'string' && content.zoneType in ZONE_TYPE_LABELS ? ZONE_TYPE_LABELS[content.zoneType as keyof typeof ZONE_TYPE_LABELS] : '';
      pieces = [zoneType, typeof content.biome === 'string' ? content.biome : ''];
      break;
    }
    case 'sound':
      pieces = [typeof d.soundType === 'string' && d.soundType in SOUND_TYPE_LABELS ? SOUND_TYPE_LABELS[d.soundType as keyof typeof SOUND_TYPE_LABELS] : ''];
      break;
    case 'hero':
      pieces = [];
      break;
  }
  const out: string[] = [];
  for (const piece of pieces) {
    const trimmed = piece.trim().slice(0, EXTRA_PIECE_MAX);
    if (trimmed && HAS_WORD.test(trimmed) && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

export interface SearchableEntry {
  kind: EntryKind;
  name: string;
  description: string;
  tags: readonly string[];
  categoryIds: readonly string[];
  data: unknown;
}

/** searchText column value: normalized name first (search relies on it), then description, tags, categories and key data. */
export function buildEntrySearchText(entry: SearchableEntry, index: CategoryIndex): string {
  return buildSearchText({
    name: entry.name,
    description: entry.description,
    tags: [...entry.tags],
    extra: [...categorySearchNames(entry.categoryIds, index), ...dataSearchStrings(entry.kind, entry.data)],
  });
}

/** Recomputes searchText for the given entries (only rows whose value changed are written; updatedAt untouched). */
export async function refreshSearchText(entryIds: readonly string[], index?: CategoryIndex): Promise<number> {
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) return 0;
  const idx = index ?? (await loadCategoryIndex());
  const rows = await prisma.libraryEntry.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, name: true, description: true, tags: true, data: true, searchText: true, categories: { select: { categoryId: true } } },
  });
  const updates: Prisma.PrismaPromise<number>[] = [];
  for (const row of rows) {
    const next = buildEntrySearchText(
      {
        kind: row.kind as EntryKind,
        name: row.name,
        description: row.description,
        tags: row.tags,
        categoryIds: row.categories.map((c) => c.categoryId),
        data: row.data,
      },
      idx,
    );
    if (next !== row.searchText) {
      updates.push(prisma.$executeRaw`UPDATE "LibraryEntry" SET "searchText" = ${next} WHERE "id" = ${row.id}`);
    }
  }
  if (updates.length > 0) await prisma.$transaction(updates);
  return updates.length;
}

/**
 * Recomputes searchText for the whole library in batches (idempotent; only changed rows are written).
 * Keeps rows written by older code or by the seed in line with the current rules.
 */
export async function refreshAllSearchText(batchSize = 300): Promise<number> {
  const index = await loadCategoryIndex();
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.libraryEntry.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    updated += await refreshSearchText(
      batch.map((b) => b.id),
      index,
    );
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }
  return updated;
}

/** Entries linked to any of the given categories. */
export async function entryIdsForCategories(categoryIds: readonly string[]): Promise<string[]> {
  if (categoryIds.length === 0) return [];
  const links = await prisma.entryCategory.findMany({
    where: { categoryId: { in: [...categoryIds] } },
    select: { entryId: true },
    distinct: ['entryId'],
  });
  return links.map((l) => l.entryId);
}

// ---------------------------------------------------------------------------
// Entry persistence helpers
// ---------------------------------------------------------------------------

type FacetKey = 'level' | 'cr' | 'hp' | 'value' | 'weight';
const INT_FACETS: ReadonlySet<FacetKey> = new Set<FacetKey>(['level', 'hp']);

interface ExistingEntry {
  id: string;
  kind: string;
  ownerId: string | null;
  originCampaignId: string | null;
  description: string;
  imageUrl: string | null;
  tags: string[];
  data: Prisma.JsonValue;
  level: number | null;
  cr: number | null;
  hp: number | null;
  value: number | null;
  weight: number | null;
  rarity: string | null;
  size: string | null;
  categories: { categoryId: string }[];
}

interface EntryWrite {
  kind: EntryKind;
  name: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  categoryIds: string[];
  ownerId: string | null;
  originCampaignId: string | null;
  level: number | null;
  cr: number | null;
  hp: number | null;
  value: number | null;
  weight: number | null;
  rarity: string | null;
  size: string | null;
  data: unknown;
  searchText: string;
}

async function loadEntry(id: string): Promise<ExistingEntry> {
  const row = await prisma.libraryEntry.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      ownerId: true,
      originCampaignId: true,
      description: true,
      imageUrl: true,
      tags: true,
      data: true,
      level: true,
      cr: true,
      hp: true,
      value: true,
      weight: true,
      rarity: true,
      size: true,
      categories: { select: { categoryId: true } },
    },
  });
  if (!row) throw notFound(MESSAGES.entryNotFound);
  return row;
}

async function loadEntryRow(id: string, userId: string | null): Promise<EntryRow> {
  const row = await prisma.libraryEntry.findUnique({ where: { id }, include: entryInclude(userId) });
  if (!row) throw notFound(MESSAGES.entryNotFound);
  return row;
}

async function assertUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw badRequest(MESSAGES.ownerNotFound);
}

async function assertCampaignExists(campaignId: string, message: string, status: 'bad' | 'missing'): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) throw status === 'bad' ? badRequest(message) : notFound(message);
}

/** Known category ids of the right kind (unknown ids — e.g. just deleted — are dropped). */
function validCategoryIds(ids: readonly string[], kind: EntryKind, index: CategoryIndex): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const category = index.byId.get(id);
    if (!category) continue;
    if (category.kind !== kind) throw badRequest(MESSAGES.categoryWrongKind, { categoryId: id });
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function cleanTags(tags: readonly string[]): string[] {
  return normalizeTags([...tags]).slice(0, MAX_TAGS);
}

function facetValue(key: FacetKey, value: number | null): number | null {
  if (value === null) return null;
  return INT_FACETS.has(key) ? Math.round(value) : value;
}

/** Facet columns derived from the data document (they always win over the payload). */
function applyDerivedColumns(write: EntryWrite): void {
  if (write.kind === 'hero') {
    const hero = write.data as HeroData;
    write.hp = Math.max(0, Math.round(hero.hp.max));
    if (write.level === null) write.level = 1;
  } else if (write.kind === 'zone') {
    write.level = (write.data as ZoneTemplateData).content.levels.length;
  }
}

function persistData(write: EntryWrite) {
  return {
    kind: write.kind,
    name: write.name,
    description: write.description,
    imageUrl: write.imageUrl,
    tags: write.tags,
    ownerId: write.ownerId,
    originCampaignId: write.originCampaignId,
    level: write.level,
    cr: write.cr,
    hp: write.hp,
    value: write.value,
    weight: write.weight,
    rarity: write.rarity,
    size: write.size,
    data: toJson(write.data),
    searchText: write.searchText,
  };
}

function emitChanged(row: EntryRow, heroUpdated: boolean): LibraryEntry {
  const entry = entryToDTO(row);
  bus.emit('library:changed', { entry });
  if (heroUpdated && entry.kind === 'hero') bus.emit('hero:changed', { hero: entry as LibraryEntry<'hero'> });
  return entry;
}

function copyName(name: string): string {
  const base = name.trim().slice(0, NAME_MAX - COPY_SUFFIX.length).trimEnd();
  return `${base}${COPY_SUFFIX}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getEntry(id: string, userId: string | null): Promise<LibraryEntry> {
  return entryToDTO(await loadEntryRow(id, userId));
}

/**
 * Creates a library entry from a LibraryEntryInput (validated here, so typed callers from other modules
 * are safe). Heroes always get an owner (default: requester). Emits 'library:changed'.
 */
export async function createEntry(input: LibraryEntryInput | Record<string, unknown>, requesterId: string): Promise<LibraryEntry> {
  const parsed = parseEntryInput(input);
  const kind = parsed.kind;
  const index = await loadCategoryIndex();

  let ownerId: string | null = parsed.ownerId === undefined ? requesterId : parsed.ownerId || null;
  if (kind === 'hero' && !ownerId) ownerId = requesterId;
  if (ownerId && ownerId !== requesterId) await assertUserExists(ownerId);

  const originCampaignId = parsed.originCampaignId || null;
  if (originCampaignId) await assertCampaignExists(originCampaignId, MESSAGES.originNotFound, 'bad');

  const data = completeEntryData(kind, parsed.data);
  const write: EntryWrite = {
    kind,
    name: parsed.name,
    description: parsed.description ?? '',
    imageUrl: parsed.imageUrl || null,
    tags: cleanTags(parsed.tags ?? []),
    categoryIds: validCategoryIds(parsed.categoryIds ?? [], kind, index),
    ownerId,
    originCampaignId,
    level: facetValue('level', parsed.level ?? null),
    cr: facetValue('cr', parsed.cr ?? null),
    hp: facetValue('hp', parsed.hp ?? null),
    value: facetValue('value', parsed.value ?? null),
    weight: facetValue('weight', parsed.weight ?? null),
    rarity: parsed.rarity ?? null,
    size: parsed.size ?? null,
    data,
    searchText: '',
  };
  if (kind === 'spell' && write.level === null) write.level = (data as EntryDataMap['spell']).slotLevel;
  applyDerivedColumns(write);
  write.searchText = buildEntrySearchText(write, index);

  const row = await prisma.libraryEntry.create({
    data: {
      ...persistData(write),
      categories: { createMany: { data: write.categoryIds.map((categoryId) => ({ categoryId })) } },
    },
    include: entryInclude(requesterId),
  });
  return emitChanged(row, false);
}

/**
 * Updates an entry. Omitted optional fields keep their stored value (null clears); `data`, when sent,
 * replaces the document (merged over defaults). Heroes: only the owner may edit.
 * Emits 'library:changed' (+ 'hero:changed' for heroes).
 */
export async function updateEntry(id: string, input: LibraryEntryInput | Record<string, unknown>, requesterId: string): Promise<LibraryEntry> {
  const parsed = parseEntryInput(input);
  const existing = await loadEntry(id);
  const kind = parsed.kind;
  if (existing.kind !== kind) throw badRequest(MESSAGES.kindChange);
  if (kind === 'hero' && existing.ownerId !== null && existing.ownerId !== requesterId) throw forbidden(MESSAGES.heroOwnerOnly);

  const index = await loadCategoryIndex();

  let ownerId: string | null = parsed.ownerId === undefined ? existing.ownerId : parsed.ownerId || null;
  if (kind === 'hero' && !ownerId) ownerId = existing.ownerId ?? requesterId;
  if (ownerId && ownerId !== existing.ownerId && ownerId !== requesterId) await assertUserExists(ownerId);

  const originCampaignId = parsed.originCampaignId === undefined ? existing.originCampaignId : parsed.originCampaignId || null;
  if (originCampaignId && originCampaignId !== existing.originCampaignId) {
    await assertCampaignExists(originCampaignId, MESSAGES.originNotFound, 'bad');
  }

  const data = parsed.data === undefined ? completeEntryData(kind, existing.data) : completeEntryData(kind, parsed.data);
  const pickFacet = (key: FacetKey): number | null => {
    const value = parsed[key];
    return value === undefined ? existing[key] : facetValue(key, value);
  };

  const write: EntryWrite = {
    kind,
    name: parsed.name,
    description: parsed.description === undefined ? existing.description : parsed.description ?? '',
    imageUrl: parsed.imageUrl === undefined ? existing.imageUrl : parsed.imageUrl || null,
    tags: parsed.tags === undefined ? existing.tags : cleanTags(parsed.tags ?? []),
    categoryIds:
      parsed.categoryIds === undefined
        ? existing.categories.map((c) => c.categoryId).filter((cid) => index.byId.has(cid))
        : validCategoryIds(parsed.categoryIds ?? [], kind, index),
    ownerId,
    originCampaignId,
    level: pickFacet('level'),
    cr: pickFacet('cr'),
    hp: pickFacet('hp'),
    value: pickFacet('value'),
    weight: pickFacet('weight'),
    rarity: parsed.rarity === undefined ? existing.rarity : parsed.rarity,
    size: parsed.size === undefined ? existing.size : parsed.size,
    data,
    searchText: '',
  };
  applyDerivedColumns(write);
  write.searchText = buildEntrySearchText(write, index);

  const row = await prisma.libraryEntry.update({
    where: { id },
    data: {
      ...persistData(write),
      categories: {
        deleteMany: {},
        createMany: { data: write.categoryIds.map((categoryId) => ({ categoryId })) },
      },
    },
    include: entryInclude(requesterId),
  });
  return emitChanged(row, kind === 'hero');
}

/** Deletes an entry (heroes: owner only). Emits 'library:deleted'. */
export async function deleteEntry(id: string, requesterId: string): Promise<void> {
  const existing = await loadEntry(id);
  if (existing.kind === 'hero' && existing.ownerId !== null && existing.ownerId !== requesterId) {
    throw forbidden(MESSAGES.heroOwnerOnly);
  }
  await prisma.libraryEntry.delete({ where: { id } });
  bus.emit('library:deleted', { entryId: id, kind: existing.kind });
}

/** Independent copy named "Nombre (copia)" owned by the requester (zone templates get fresh internal ids). */
export async function duplicateEntry(id: string, requesterId: string): Promise<LibraryEntry> {
  const source = await prisma.libraryEntry.findUnique({
    where: { id },
    include: { categories: { select: { categoryId: true } } },
  });
  if (!source) throw notFound(MESSAGES.entryNotFound);
  const kind = source.kind as EntryKind;
  const index = await loadCategoryIndex();

  let data: unknown = source.data;
  if (kind === 'zone') {
    const complete = completeEntryData('zone', source.data);
    data = { ...complete, content: cloneZoneContent(complete.content) };
  }

  const write: EntryWrite = {
    kind,
    name: copyName(source.name),
    description: source.description,
    imageUrl: source.imageUrl,
    tags: [...source.tags],
    categoryIds: source.categories.map((c) => c.categoryId).filter((cid) => index.byId.has(cid)),
    ownerId: requesterId,
    originCampaignId: source.originCampaignId,
    level: source.level,
    cr: source.cr,
    hp: source.hp,
    value: source.value,
    weight: source.weight,
    rarity: source.rarity,
    size: source.size,
    data,
    searchText: '',
  };
  write.searchText = buildEntrySearchText(write, index);

  const row = await prisma.libraryEntry.create({
    data: {
      ...persistData(write),
      categories: { createMany: { data: write.categoryIds.map((categoryId) => ({ categoryId })) } },
    },
    include: entryInclude(requesterId),
  });
  return emitChanged(row, false);
}

// ---------------------------------------------------------------------------
// Favorites, recents, usage
// ---------------------------------------------------------------------------

export async function setFavorite(entryId: string, userId: string, favorite: boolean): Promise<void> {
  const exists = await prisma.libraryEntry.findUnique({ where: { id: entryId }, select: { id: true } });
  if (!exists) throw notFound(MESSAGES.entryNotFound);
  if (favorite) {
    await prisma.favorite.upsert({
      where: { userId_entryId: { userId, entryId } },
      create: { userId, entryId },
      update: {},
    });
  } else {
    await prisma.favorite.deleteMany({ where: { userId, entryId } });
  }
}

/** Marks an entry as recently used by the user and, with a campaign, as used in that campaign. */
export async function markEntryUsed(entryId: string, userId: string, campaignId?: string | null): Promise<void> {
  const exists = await prisma.libraryEntry.findUnique({ where: { id: entryId }, select: { id: true } });
  if (!exists) throw notFound(MESSAGES.entryNotFound);
  if (campaignId) await assertCampaignExists(campaignId, MESSAGES.campaignNotFound, 'missing');
  const now = new Date();
  const writes: (() => Prisma.PrismaPromise<unknown>)[] = [
    () =>
      prisma.recentUse.upsert({
        where: { userId_entryId: { userId, entryId } },
        create: { userId, entryId, usedAt: now },
        update: { usedAt: now },
      }),
  ];
  if (campaignId) {
    writes.push(() =>
      prisma.entryUsage.upsert({
        where: { entryId_campaignId: { entryId, campaignId } },
        create: { entryId, campaignId, lastUsedAt: now },
        update: { lastUsedAt: now },
      }),
    );
  }
  // Sequential (no transaction) and in the same order as live/helpers.ts to avoid deadlocks.
  // A concurrent upsert of the same row can still race on create: retry once with a fresh query.
  for (const write of writes) {
    try {
      await write();
    } catch {
      await new Promise((r) => setTimeout(r, 50));
      await write();
    }
  }
}

// ---------------------------------------------------------------------------
// Tags, heroes, search
// ---------------------------------------------------------------------------

/** Tag autocomplete: tags containing q (normalized), prefix matches first, then by usage count. */
export async function listTags(opts: { kind?: EntryKind; q?: string; limit?: number } = {}): Promise<TagCount[]> {
  const q = normalizeTag(opts.q ?? '');
  const limit = Math.min(200, Math.max(1, opts.limit ?? TAG_SUGGESTIONS));
  const conditions: Prisma.Sql[] = [];
  if (opts.kind) conditions.push(Prisma.sql`e."kind" = ${opts.kind}::text`);
  if (q) conditions.push(Prisma.sql`t.tag LIKE ${`%${escapeLike(q)}%`}::text`);
  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const prefixFirst = q ? Prisma.sql`(t.tag LIKE ${`${escapeLike(q)}%`}::text) DESC,` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ tag: string; count: number }[]>`
    SELECT t.tag AS tag, count(*)::int AS count
    FROM "LibraryEntry" e CROSS JOIN LATERAL unnest(e."tags") AS t(tag)
    ${where}
    GROUP BY t.tag
    ORDER BY ${prefixFirst} count(*) DESC, t.tag ASC
    LIMIT ${limit}::int`;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

/** Hero entries (optionally of one owner), sorted by name. */
export async function listHeroes(ownerId: string | undefined, userId: string | null): Promise<LibraryEntry<'hero'>[]> {
  const rows = await prisma.libraryEntry.findMany({
    where: { kind: 'hero', ...(ownerId ? { ownerId } : {}) },
    include: entryInclude(userId),
  });
  return rows
    .map((row) => entryToDTO<'hero'>(row))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** Runs a library search (query is validated/cleaned again, so any caller is safe). */
export async function searchLibrary(rawQuery: LibraryQuery | Record<string, unknown>, userId: string | null): Promise<LibraryPage> {
  const query = parseLibraryQuery(rawQuery);
  const groups = query.categoryIds?.length
    ? facetGroups(query.categoryIds, await prisma.category.findMany({ select: { id: true, parentId: true } }))
    : [];
  const built = buildLibrarySearch(query, { userId, facetGroups: groups });
  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(searchIdsSql(built)),
    prisma.$queryRaw<{ total: number }[]>(searchCountSql(built)),
  ]);
  const ids = idRows.map((r) => r.id);
  const rows = ids.length > 0 ? await prisma.libraryEntry.findMany({ where: { id: { in: ids } }, include: entryInclude(userId) }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: LibraryEntry[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) items.push(entryToDTO(row));
  }
  return { items, total: Number(countRows[0]?.total ?? 0), page: built.page, pageSize: built.pageSize };
}
