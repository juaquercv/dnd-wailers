import {
  CREATURE_SIZES,
  RARITIES,
  type CreatureSize,
  type EntryKind,
  type LibraryQuery,
  type LibrarySort,
  type Rarity,
} from '@wailers/shared';

/** Library filters of one kind (everything in LibraryQuery except kind and paging). */
export type FilterState = Omit<LibraryQuery, 'kind' | 'page' | 'pageSize'>;

export type RangeKey = 'level' | 'cr' | 'hp' | 'value' | 'weight';

export interface RangeDef {
  key: RangeKey;
  label: string;
  suffix?: string;
  hint?: string;
  integer?: boolean;
}

export const RANGES_BY_KIND: Record<EntryKind, RangeDef[]> = {
  creature: [
    { key: 'cr', label: 'Desafío (CR)', hint: '0,5 = 1/2 · 0,25 = 1/4' },
    { key: 'hp', label: 'Puntos de vida', integer: true },
  ],
  item: [
    { key: 'value', label: 'Valor', suffix: 'po' },
    { key: 'weight', label: 'Peso', suffix: 'kg' },
  ],
  spell: [{ key: 'level', label: 'Nivel (0 = truco)', integer: true }],
  zone: [{ key: 'level', label: 'Número de niveles', integer: true }],
  hero: [
    { key: 'level', label: 'Nivel', integer: true },
    { key: 'hp', label: 'Puntos de vida', integer: true },
  ],
  sound: [],
};

const RANGE_FIELDS: Record<RangeKey, { min: keyof FilterState; max: keyof FilterState }> = {
  level: { min: 'levelMin', max: 'levelMax' },
  cr: { min: 'crMin', max: 'crMax' },
  hp: { min: 'hpMin', max: 'hpMax' },
  value: { min: 'valueMin', max: 'valueMax' },
  weight: { min: 'weightMin', max: 'weightMax' },
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  level: 'Nivel',
  cr: 'CR',
  hp: 'PV',
  value: 'Valor',
  weight: 'Peso',
};

export function emptyFilters(): FilterState {
  return { q: '', sort: 'relevance', order: 'asc' };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function getRange(f: FilterState, key: RangeKey): { min: number | null; max: number | null } {
  const fields = RANGE_FIELDS[key];
  return { min: num(f[fields.min]), max: num(f[fields.max]) };
}

export function withRange(f: FilterState, key: RangeKey, min: number | null, max: number | null): FilterState {
  const fields = RANGE_FIELDS[key];
  const next: FilterState = { ...f };
  const rec = next as Record<string, unknown>;
  if (min === null) delete rec[fields.min];
  else rec[fields.min] = min;
  if (max === null) delete rec[fields.max];
  else rec[fields.max] = max;
  return next;
}

export function withDataEquals(f: FilterState, key: string, value: string | number | boolean | null): FilterState {
  const data = { ...(f.dataEquals ?? {}) };
  if (value === null) delete data[key];
  else data[key] = value;
  const next: FilterState = { ...f };
  if (Object.keys(data).length === 0) delete next.dataEquals;
  else next.dataEquals = data;
  return next;
}

/** Number of active filters (search text and sort are not counted). */
export function activeFilterCount(f: FilterState, kind: EntryKind): number {
  let n = 0;
  n += f.categoryIds?.length ?? 0;
  n += f.tags?.length ?? 0;
  n += f.rarity?.length ?? 0;
  n += f.size?.length ?? 0;
  for (const r of RANGES_BY_KIND[kind]) {
    const { min, max } = getRange(f, r.key);
    if (min !== null || max !== null) n += 1;
  }
  n += Object.keys(f.dataEquals ?? {}).length;
  if (f.campaignId) n += 1;
  if (f.ownerId) n += 1;
  if (f.favoritesOnly) n += 1;
  if (f.recentOnly) n += 1;
  return n;
}

/** Clear every filter but keep search text and sort. */
export function clearFilters(f: FilterState): FilterState {
  return { q: f.q ?? '', sort: f.sort ?? 'relevance', order: f.order ?? 'asc' };
}

/** Builds the API query: drops empty values and filters that do not apply to the kind. */
export function toQuery(kind: EntryKind, f: FilterState, extra: Pick<LibraryQuery, 'page' | 'pageSize'> = {}): LibraryQuery {
  const q: LibraryQuery = { kind, ...extra };
  const text = (f.q ?? '').trim();
  if (text) q.q = text;
  if (f.categoryIds?.length) q.categoryIds = [...f.categoryIds];
  if (f.tags?.length) q.tags = [...f.tags];
  if (kind === 'item' && f.rarity?.length) q.rarity = [...f.rarity];
  if (kind === 'creature' && f.size?.length) q.size = [...f.size];
  for (const r of RANGES_BY_KIND[kind]) {
    const { min, max } = getRange(f, r.key);
    const fields = RANGE_FIELDS[r.key];
    if (min !== null) (q as Record<string, unknown>)[fields.min] = min;
    if (max !== null) (q as Record<string, unknown>)[fields.max] = max;
  }
  if (f.dataEquals && Object.keys(f.dataEquals).length) q.dataEquals = { ...f.dataEquals };
  if (f.campaignId) q.campaignId = f.campaignId;
  if (kind === 'hero' && f.ownerId) q.ownerId = f.ownerId;
  if (f.favoritesOnly) q.favoritesOnly = true;
  if (f.recentOnly) q.recentOnly = true;
  const sort: LibrarySort = f.sort ?? 'relevance';
  q.sort = sort;
  if (sort !== 'relevance') q.order = f.order ?? 'asc';
  return q;
}

const SORTS: LibrarySort[] = ['relevance', 'name', 'level', 'cr', 'rarity', 'created', 'recent'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Turns a stored query (saved filter) back into filter state, ignoring unknown or invalid fields. */
export function filtersFromQuery(query: LibraryQuery | null | undefined): FilterState {
  const f = emptyFilters();
  if (!query || typeof query !== 'object') return f;
  if (typeof query.q === 'string') f.q = query.q;
  if (isStringArray(query.categoryIds) && query.categoryIds.length) f.categoryIds = [...query.categoryIds];
  if (isStringArray(query.tags) && query.tags.length) f.tags = [...query.tags];
  if (isStringArray(query.rarity)) {
    const r = query.rarity.filter((x): x is Rarity => (RARITIES as readonly string[]).includes(x));
    if (r.length) f.rarity = r;
  }
  if (isStringArray(query.size)) {
    const s = query.size.filter((x): x is CreatureSize => (CREATURE_SIZES as readonly string[]).includes(x));
    if (s.length) f.size = s;
  }
  for (const key of Object.keys(RANGE_FIELDS) as RangeKey[]) {
    const fields = RANGE_FIELDS[key];
    const min = num((query as Record<string, unknown>)[fields.min]);
    const max = num((query as Record<string, unknown>)[fields.max]);
    if (min !== null) (f as Record<string, unknown>)[fields.min] = min;
    if (max !== null) (f as Record<string, unknown>)[fields.max] = max;
  }
  if (query.dataEquals && typeof query.dataEquals === 'object') {
    const data: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(query.dataEquals)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') data[k] = v;
    }
    if (Object.keys(data).length) f.dataEquals = data;
  }
  if (typeof query.campaignId === 'string' && query.campaignId) f.campaignId = query.campaignId;
  if (typeof query.ownerId === 'string' && query.ownerId) f.ownerId = query.ownerId;
  if (query.favoritesOnly === true) f.favoritesOnly = true;
  if (query.recentOnly === true) f.recentOnly = true;
  if (query.sort && SORTS.includes(query.sort)) f.sort = query.sort;
  if (query.order === 'asc' || query.order === 'desc') f.order = query.order;
  return f;
}
