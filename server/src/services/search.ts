import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CREATURE_SIZES,
  ENTRY_KINDS,
  RARITIES,
  RARITY_INFO,
  normalizeTags,
  normalizeText,
  type LibraryQuery,
  type LibrarySort,
} from '@wailers/shared';

/*
 * Library search: query validation and the parameterized SQL builder.
 * Every user-supplied value reaches the database as a bound parameter (Prisma.sql / Prisma.join);
 * only fixed keywords (ASC/DESC, NULLS LAST) are spliced in with Prisma.raw.
 */

export const LIBRARY_SORTS = ['relevance', 'name', 'level', 'cr', 'rarity', 'created', 'recent'] as const satisfies readonly LibrarySort[];
export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 200;
/** Minimum pg_trgm word_similarity(q, searchText) for a fuzzy (typo-tolerant) match. */
export const WORD_SIMILARITY_THRESHOLD = 0.3;
/** Allowed keys for `dataEquals` (top-level keys of the entry `data` document). */
export const DATA_KEY_PATTERN = /^[a-zA-Z0-9_]+$/;

const MAX_QUERY_LENGTH = 200;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const finite = z.number({ invalid_type_error: 'Debe ser un número' }).finite('Debe ser un número válido');
const idString = z.string().trim().min(1).max(100);

/** Raw LibraryQuery as sent by clients (null is accepted as "not set"). */
export const libraryQuerySchema = z.object({
  kind: z.enum(ENTRY_KINDS).nullish(),
  q: z.string().max(MAX_QUERY_LENGTH, 'La búsqueda es demasiado larga').nullish(),
  categoryIds: z.array(idString).max(200, 'Demasiadas categorías seleccionadas').nullish(),
  tags: z.array(z.string().max(80)).max(50, 'Demasiadas etiquetas').nullish(),
  rarity: z.array(z.enum(RARITIES)).max(RARITIES.length * 2).nullish(),
  size: z.array(z.enum(CREATURE_SIZES)).max(CREATURE_SIZES.length * 2).nullish(),
  levelMin: finite.nullish(),
  levelMax: finite.nullish(),
  crMin: finite.nullish(),
  crMax: finite.nullish(),
  hpMin: finite.nullish(),
  hpMax: finite.nullish(),
  valueMin: finite.nullish(),
  valueMax: finite.nullish(),
  weightMin: finite.nullish(),
  weightMax: finite.nullish(),
  campaignId: idString.nullish(),
  ownerId: idString.nullish(),
  favoritesOnly: z.boolean().nullish(),
  recentOnly: z.boolean().nullish(),
  dataEquals: z
    .record(
      z.string().regex(DATA_KEY_PATTERN, 'Clave de datos no válida').max(64),
      z.union([z.string().max(200), finite, z.boolean()]),
    )
    .nullish(),
  sort: z.enum(LIBRARY_SORTS).nullish(),
  order: z.enum(['asc', 'desc']).nullish(),
  page: finite.nullish(),
  pageSize: finite.nullish(),
});

const RANGE_KEYS = [
  'levelMin',
  'levelMax',
  'crMin',
  'crMax',
  'hpMin',
  'hpMax',
  'valueMin',
  'valueMax',
  'weightMin',
  'weightMax',
] as const;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Validates and cleans a LibraryQuery: drops empty/null values, trims q, normalizes and dedupes tags,
 * dedupes arrays and clamps page / pageSize. Throws ZodError (-> 400) on invalid input.
 */
export function parseLibraryQuery(raw: unknown): LibraryQuery {
  const input = libraryQuerySchema.parse(raw ?? {});
  const out: LibraryQuery = {};
  if (input.kind) out.kind = input.kind;
  const q = input.q?.trim();
  if (q) out.q = q;
  if (input.categoryIds?.length) out.categoryIds = unique(input.categoryIds);
  if (input.tags?.length) {
    const tags = normalizeTags(input.tags);
    if (tags.length) out.tags = tags;
  }
  if (input.rarity?.length) out.rarity = unique(input.rarity);
  if (input.size?.length) out.size = unique(input.size);
  for (const key of RANGE_KEYS) {
    const value = input[key];
    if (typeof value === 'number') out[key] = value;
  }
  if (input.campaignId) out.campaignId = input.campaignId;
  if (input.ownerId) out.ownerId = input.ownerId;
  if (input.favoritesOnly) out.favoritesOnly = true;
  if (input.recentOnly) out.recentOnly = true;
  if (input.dataEquals && Object.keys(input.dataEquals).length > 0) out.dataEquals = { ...input.dataEquals };
  if (input.sort) out.sort = input.sort;
  if (input.order) out.order = input.order;
  if (typeof input.page === 'number') out.page = Math.max(1, Math.floor(input.page));
  if (typeof input.pageSize === 'number') out.pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize)));
  return out;
}

// ---------------------------------------------------------------------------
// Category facets
// ---------------------------------------------------------------------------

export interface CategoryLink {
  id: string;
  parentId: string | null;
}

/**
 * Groups the selected categories by facet (root ancestor) and expands each one to its descendants.
 * Result: one id list per facet. An entry matches when, for EVERY group, it is linked to at least
 * one id of the group (OR inside a facet, AND across facets). Unknown ids are ignored.
 */
export function facetGroups(selectedIds: readonly string[], categories: readonly CategoryLink[]): string[][] {
  const byId = new Map<string, CategoryLink>();
  const children = new Map<string, string[]>();
  for (const c of categories) {
    byId.set(c.id, c);
    if (c.parentId) {
      const list = children.get(c.parentId) ?? [];
      list.push(c.id);
      children.set(c.parentId, list);
    }
  }

  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && current.parentId && byId.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
    return current?.id ?? id;
  };

  const groups = new Map<string, Set<string>>();
  for (const id of selectedIds) {
    if (!byId.has(id)) continue;
    const root = rootOf(id);
    const group = groups.get(root) ?? new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (group.has(current)) continue;
      group.add(current);
      for (const child of children.get(current) ?? []) stack.push(child);
    }
    groups.set(root, group);
  }
  return [...groups.values()].map((g) => [...g]);
}

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

export interface SearchContext {
  /** Current user (favorites, recents). */
  userId: string | null;
  /** Output of facetGroups() for query.categoryIds. */
  facetGroups: string[][];
}

export interface BuiltSearch {
  /** Boolean condition over alias `e` ("LibraryEntry"). */
  where: Prisma.Sql;
  /** ORDER BY list (always ends with a unique tiebreaker for stable pagination). */
  orderBy: Prisma.Sql;
  sort: LibrarySort;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  /** Normalized text query ('' when none). */
  q: string;
}

/** Escapes LIKE wildcards so user text is matched literally (default escape character is backslash). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Accent-free, lowercase entry name. searchText always starts with normalizeText(name), so its prefix of
 * the same length is the normalized name (the database runs with the C locale, where lower() ignores accents).
 * Falls back to lower(name) for rows whose searchText was never computed.
 */
const NAME_NORM = Prisma.sql`COALESCE(NULLIF(left(e."searchText", char_length(e."name")), ''), lower(e."name"))`;

const RARITY_RANK = Prisma.sql`CASE e."rarity" ${Prisma.join(
  RARITIES.map((r) => Prisma.sql`WHEN ${r}::text THEN ${RARITY_INFO[r].rank}::int`),
  ' ',
)} ELSE NULL END`;

function direction(order: 'asc' | 'desc'): Prisma.Sql {
  return Prisma.raw(order === 'desc' ? 'DESC' : 'ASC');
}

function defaultOrder(sort: LibrarySort): 'asc' | 'desc' {
  return sort === 'relevance' || sort === 'recent' || sort === 'created' ? 'desc' : 'asc';
}

function rangeConditions(column: string, min: number | undefined, max: number | undefined): Prisma.Sql[] {
  const col = Prisma.raw(`e."${column}"`);
  const out: Prisma.Sql[] = [];
  if (min !== undefined) out.push(Prisma.sql`${col} >= ${min}::double precision`);
  if (max !== undefined) out.push(Prisma.sql`${col} <= ${max}::double precision`);
  return out;
}

function dataValueText(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Builds the WHERE / ORDER BY fragments and pagination for a cleaned LibraryQuery (see parseLibraryQuery). */
export function buildLibrarySearch(query: LibraryQuery, ctx: SearchContext): BuiltSearch {
  const uid = ctx.userId ?? '';
  const conditions: Prisma.Sql[] = [];

  if (query.kind) conditions.push(Prisma.sql`e."kind" = ${query.kind}::text`);

  for (const group of ctx.facetGroups) {
    if (group.length === 0) continue;
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "EntryCategory" ec WHERE ec."entryId" = e."id" AND ec."categoryId" IN (${Prisma.join(group)}))`,
    );
  }

  if (query.tags?.length) {
    conditions.push(Prisma.sql`e."tags" @> ARRAY[${Prisma.join(query.tags.map((t) => Prisma.sql`${t}::text`))}]::text[]`);
  }
  if (query.rarity?.length) {
    conditions.push(Prisma.sql`e."rarity" IN (${Prisma.join(query.rarity.map((r) => Prisma.sql`${r}::text`))})`);
  }
  if (query.size?.length) {
    conditions.push(Prisma.sql`e."size" IN (${Prisma.join(query.size.map((s) => Prisma.sql`${s}::text`))})`);
  }

  conditions.push(
    ...rangeConditions('level', query.levelMin, query.levelMax),
    ...rangeConditions('cr', query.crMin, query.crMax),
    ...rangeConditions('hp', query.hpMin, query.hpMax),
    ...rangeConditions('value', query.valueMin, query.valueMax),
    ...rangeConditions('weight', query.weightMin, query.weightMax),
  );

  if (query.campaignId) {
    conditions.push(
      Prisma.sql`(e."originCampaignId" = ${query.campaignId}::text OR EXISTS (SELECT 1 FROM "EntryUsage" u WHERE u."entryId" = e."id" AND u."campaignId" = ${query.campaignId}::text))`,
    );
  }
  if (query.ownerId) conditions.push(Prisma.sql`e."ownerId" = ${query.ownerId}::text`);
  if (query.favoritesOnly) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "Favorite" f WHERE f."entryId" = e."id" AND f."userId" = ${uid}::text)`);
  }
  if (query.recentOnly) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "RecentUse" r WHERE r."entryId" = e."id" AND r."userId" = ${uid}::text)`);
  }

  for (const [key, value] of Object.entries(query.dataEquals ?? {})) {
    // Keys are validated by parseLibraryQuery; checked again so the builder stays safe on its own.
    if (!DATA_KEY_PATTERN.test(key)) continue;
    conditions.push(Prisma.sql`(e."data" ->> ${key}::text) = ${dataValueText(value)}::text`);
  }

  const q = normalizeText(query.q ?? '');
  let relevance: Prisma.Sql | null = null;
  if (q) {
    const contains = `%${escapeLike(q)}%`;
    const prefix = `${escapeLike(q)}%`;
    conditions.push(Prisma.sql`(
      e."searchText" ILIKE ${contains}::text
      OR lower(e."name") LIKE ${contains}::text
      OR word_similarity(${q}::text, e."searchText") > ${WORD_SIMILARITY_THRESHOLD}::real
      OR to_tsvector('simple', e."searchText") @@ plainto_tsquery('simple', ${q}::text)
    )`);
    relevance = Prisma.sql`(
      3 * (${NAME_NORM} LIKE ${prefix}::text)::int
      + (${NAME_NORM} LIKE ${contains}::text)::int
      + 2 * similarity(${q}::text, ${NAME_NORM})
      + word_similarity(${q}::text, e."searchText")
    )`;
  }

  const requested: LibrarySort = query.sort ?? (q ? 'relevance' : 'name');
  const sort: LibrarySort = requested === 'relevance' && !relevance ? 'name' : requested;
  const order = query.order ?? defaultOrder(sort);
  const dir = direction(order);
  const byName = Prisma.sql`${NAME_NORM} ASC`;

  let orderParts: Prisma.Sql[];
  switch (sort) {
    case 'relevance':
      orderParts = [Prisma.sql`${relevance!} ${dir}`, byName];
      break;
    case 'level':
      orderParts = [Prisma.sql`e."level" ${dir} NULLS LAST`, byName];
      break;
    case 'cr':
      orderParts = [Prisma.sql`e."cr" ${dir} NULLS LAST`, byName];
      break;
    case 'rarity':
      orderParts = [Prisma.sql`${RARITY_RANK} ${dir} NULLS LAST`, byName];
      break;
    case 'created':
      orderParts = [Prisma.sql`e."createdAt" ${dir}`];
      break;
    case 'recent':
      orderParts = [
        Prisma.sql`(SELECT r."usedAt" FROM "RecentUse" r WHERE r."entryId" = e."id" AND r."userId" = ${uid}::text) ${dir} NULLS LAST`,
        byName,
      ];
      break;
    case 'name':
    default:
      orderParts = [Prisma.sql`${NAME_NORM} ${dir}`, Prisma.sql`lower(e."name") ${dir}`];
      break;
  }
  orderParts.push(Prisma.sql`e."id" ASC`);

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)));

  return {
    where: conditions.length > 0 ? Prisma.join(conditions.map((c) => Prisma.sql`(${c})`), ' AND ') : Prisma.sql`TRUE`,
    orderBy: Prisma.join(orderParts, ', '),
    sort,
    order,
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    q,
  };
}

/** SELECT of the ordered ids of one page. */
export function searchIdsSql(built: BuiltSearch): Prisma.Sql {
  return Prisma.sql`SELECT e."id" AS id FROM "LibraryEntry" e WHERE ${built.where} ORDER BY ${built.orderBy} LIMIT ${built.limit}::int OFFSET ${built.offset}::int`;
}

/** SELECT of the total number of matches. */
export function searchCountSql(built: BuiltSearch): Prisma.Sql {
  return Prisma.sql`SELECT count(*)::int AS total FROM "LibraryEntry" e WHERE ${built.where}`;
}
