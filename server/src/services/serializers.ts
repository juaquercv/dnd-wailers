import {
  Prisma,
  type Category as CategoryRow,
  type LibraryEntry as LibraryEntryRow,
  type SavedFilter as SavedFilterRow,
  type SessionLog as SessionLogRow,
  type User as UserRow,
  type Zone as ZoneRow,
} from '@prisma/client';
import {
  CREATURE_SIZES,
  ENTRY_KINDS,
  LIGHTING_PRESETS,
  RARITIES,
  ROULETTE_PALETTE,
  WEATHER_TYPES,
  ZONE_TYPES,
  createRuleSystem,
  createZoneLevel,
  DEFAULT_ACTIONS_PER_TURN,
  defaultSlotsTable,
  defaultVisibility,
  emptyEntryData,
  emptyOverview,
  type Campaign,
  type CampaignSummary,
  type CategoryDTO,
  type CreatureSize,
  type EntryKind,
  type LibraryEntry,
  type LibraryQuery,
  type LiveState,
  type LogEntry,
  type LogType,
  type MagicMode,
  type OverviewMap,
  type Rarity,
  type Roller,
  type RouletteSegment,
  type RuleSystem,
  type SavedFilterDTO,
  type SessionStatus,
  type SessionSummary,
  type SpawnPoint,
  type UserDTO,
  type VisibilitySettings,
  type Zone,
  type HeroData,
  type ZoneLevel,
  type ZoneNeighbors,
  type ZoneTemplateData,
  type ZoneVision,
} from '@wailers/shared';

/*
 * Row -> DTO mappers shared by every REST module and the live engine.
 * JSON columns are read defensively: missing or invalid values fall back to the shared defaults,
 * so old or partially written documents never crash a client.
 */

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeValue(def: unknown, val: unknown): unknown {
  if (val === undefined) return def;
  if (isPlainObject(def)) {
    if (!isPlainObject(val)) return def;
    const out: PlainObject = { ...val };
    for (const key of Object.keys(def)) out[key] = mergeValue(def[key], val[key]);
    return out;
  }
  if (Array.isArray(def)) return Array.isArray(val) ? val : def;
  // Nullable fields default to null: accept whatever is stored.
  if (def === null) return val;
  return typeof val === typeof def ? val : def;
}

/**
 * Deep-merge a stored JSON value over a default document: keeps defaults for missing or
 * wrongly-typed keys, arrays are taken as stored, unknown extra keys are preserved.
 */
export function withDefaults<T>(defaults: T, value: unknown): T {
  return mergeValue(defaults, value) as T;
}

export function toIso(date: Date): string {
  return date.toISOString();
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function oneOfOrNull<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isEntryKind(value: unknown): value is EntryKind {
  return typeof value === 'string' && (ENTRY_KINDS as readonly string[]).includes(value);
}

/** Typed document -> value for a Prisma Json column. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Typed document or null -> value for a nullable Prisma Json column (null becomes SQL NULL). */
export function toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

// ---------------------------------------------------------------------------
// Users & categories
// ---------------------------------------------------------------------------

export function userToDTO(row: Pick<UserRow, 'id' | 'name' | 'color'>): UserDTO {
  return { id: row.id, name: row.name, color: row.color };
}

export function categoryToDTO(row: CategoryRow): CategoryDTO {
  return {
    id: row.id,
    kind: oneOf(ENTRY_KINDS, row.kind, 'item'),
    parentId: row.parentId,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
  };
}

// ---------------------------------------------------------------------------
// Library entries
// ---------------------------------------------------------------------------

/** Prisma include for library entries; favorites/recents are filtered for `userId` (none when null). */
export function entryInclude(userId: string | null) {
  const uid = userId ?? '';
  return {
    categories: { select: { categoryId: true } },
    owner: { select: { name: true } },
    originCampaign: { select: { id: true, name: true } },
    usages: { include: { campaign: { select: { id: true, name: true } } }, orderBy: { lastUsedAt: 'desc' } },
    favorites: { where: { userId: uid }, select: { userId: true } },
    recents: { where: { userId: uid }, select: { usedAt: true } },
  } satisfies Prisma.LibraryEntryInclude;
}

export type EntryInclude = ReturnType<typeof entryInclude>;
export type EntryRow = Prisma.LibraryEntryGetPayload<{ include: EntryInclude }>;

/** Any library row; relations that were not loaded produce empty/false values. */
export type EntryRowInput = LibraryEntryRow & {
  categories?: { categoryId: string }[];
  owner?: { name: string } | null;
  originCampaign?: { id: string; name: string } | null;
  usages?: { campaign: { id: string; name: string } }[];
  favorites?: unknown[];
  recents?: { usedAt: Date }[];
};

/** Limits of the turn economy fields of a hero sheet. */
export const HERO_MOVE_CELLS_MAX = 1000;
export const HERO_ACTIONS_PER_TURN_MAX = 10;

/** Hero sheet with sane turn economy fields: moveCells = whole cells >= 0 or null (derived from speed), actionsPerTurn = 0..10. */
export function normalizeHeroEconomy<T extends HeroData>(data: T): T {
  const move = finiteNumber(data.moveCells);
  const actions = finiteNumber(data.actionsPerTurn);
  return {
    ...data,
    moveCells: move !== null && move >= 0 ? Math.min(HERO_MOVE_CELLS_MAX, Math.floor(move)) : null,
    actionsPerTurn: actions !== null ? clamp(Math.floor(actions), 0, HERO_ACTIONS_PER_TURN_MAX) : DEFAULT_ACTIONS_PER_TURN,
  };
}

/** Per-kind cleanup of a data document already merged over the shared defaults. */
export function normalizeEntryData(kind: EntryKind, data: unknown): unknown {
  if (kind === 'hero') return normalizeHeroEconomy(data as HeroData);
  if (kind === 'zone') {
    const zone = data as ZoneTemplateData;
    return { ...zone, content: { ...zone.content, vision: parseZoneVision(zone.content.vision) } };
  }
  return data;
}

export function entryToDTO<K extends EntryKind = EntryKind>(row: EntryRowInput): LibraryEntry<K> {
  const kind = isEntryKind(row.kind) ? row.kind : null;
  const data = kind ? normalizeEntryData(kind, withDefaults(emptyEntryData(kind), row.data)) : row.data;
  const used = new Map<string, { id: string; name: string }>();
  for (const usage of row.usages ?? []) {
    if (!used.has(usage.campaign.id)) used.set(usage.campaign.id, { id: usage.campaign.id, name: usage.campaign.name });
  }
  const lastRecent = (row.recents ?? []).reduce<Date | null>(
    (latest, r) => (latest === null || r.usedAt > latest ? r.usedAt : latest),
    null,
  );
  const dto = {
    id: row.id,
    kind: (kind ?? row.kind) as EntryKind,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    tags: [...row.tags],
    categoryIds: (row.categories ?? []).map((c) => c.categoryId),
    ownerId: row.ownerId,
    ownerName: row.owner?.name ?? null,
    originCampaignId: row.originCampaignId,
    originCampaignName: row.originCampaign?.name ?? null,
    usedInCampaigns: [...used.values()],
    level: row.level,
    cr: row.cr,
    hp: row.hp,
    value: row.value,
    weight: row.weight,
    rarity: oneOfOrNull<Rarity>(RARITIES, row.rarity),
    size: oneOfOrNull<CreatureSize>(CREATURE_SIZES, row.size),
    isFavorite: (row.favorites ?? []).length > 0,
    lastUsedAt: lastRecent ? toIso(lastRecent) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    data,
  };
  return dto as LibraryEntry<K>;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const campaignInclude = {
  owner: { select: { name: true } },
  _count: { select: { zones: true } },
} satisfies Prisma.CampaignInclude;

export type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;

const MAGIC_MODES: readonly MagicMode[] = ['mana', 'slots', 'uses', 'none'];

function normalizeSlotsTable(value: unknown): number[][] {
  const defaults = defaultSlotsTable();
  const rows = Array.isArray(value) ? value : [];
  return defaults.map((defRow, i) => {
    const row: unknown = rows[i];
    return defRow.map((def, j) => {
      const cell = Array.isArray(row) ? finiteNumber(row[j]) : null;
      return cell !== null && cell >= 0 ? Math.floor(cell) : def;
    });
  });
}

/** RuleSystem JSON -> RuleSystem with every field present. */
export function parseRules(value: unknown): RuleSystem {
  const storedMode = isPlainObject(value) && isPlainObject(value.magic) ? value.magic.mode : undefined;
  const mode = oneOf(MAGIC_MODES, storedMode, 'mana');
  const rules = withDefaults(createRuleSystem(mode), value);
  rules.magic.mode = mode;
  rules.magic.slotsTable = normalizeSlotsTable(rules.magic.slotsTable);
  const inventoryModes = ['none', 'weight', 'slots'] as const;
  rules.inventory.mode = oneOf(inventoryModes, rules.inventory.mode, 'weight');
  const methods = ['free', 'standard_array', 'point_buy'] as const;
  rules.heroCreation.abilityMethod = oneOf(methods, rules.heroCreation.abilityMethod, 'free');
  return rules;
}

/** OverviewMap JSON -> OverviewMap. */
export function parseOverview(value: unknown): OverviewMap {
  const overview = withDefaults(emptyOverview(), value);
  overview.pins = overview.pins.filter(isPlainObject) as OverviewMap['pins'];
  overview.links = overview.links.filter(isPlainObject) as OverviewMap['links'];
  return overview;
}

/** VisibilitySettings JSON (possibly partial) -> full VisibilitySettings. */
export function parseVisibility(value: unknown): VisibilitySettings {
  const vis = withDefaults(defaultVisibility(), value);
  vis.visionMode = oneOf(['all', 'explored', 'vision', 'none'] as const, vis.visionMode, 'all');
  vis.enemyHp = oneOf(['exact', 'bar', 'hidden'] as const, vis.enemyHp, 'bar');
  if (vis.sceneImageUrl !== null && typeof vis.sceneImageUrl !== 'string') vis.sceneImageUrl = null;
  return vis;
}

/** SpawnPoint JSON -> SpawnPoint | null. */
export function parseSpawn(value: unknown): SpawnPoint | null {
  if (!isPlainObject(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  if (typeof value.zoneId !== 'string' || typeof value.levelId !== 'string' || x === null || y === null) return null;
  return { zoneId: value.zoneId, levelId: value.levelId, x, y };
}

export function campaignSummaryToDTO(row: CampaignRow): CampaignSummary {
  const storedMode = isPlainObject(row.rules) && isPlainObject(row.rules.magic) ? row.rules.magic.mode : undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    coverUrl: row.coverUrl,
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    zoneCount: row._count.zones,
    magicMode: oneOf(MAGIC_MODES, storedMode, 'mana'),
    tags: [...row.tags],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function campaignToDTO(row: CampaignRow): Campaign {
  const rules = parseRules(row.rules);
  return {
    ...campaignSummaryToDTO(row),
    magicMode: rules.magic.mode,
    rules,
    overview: parseOverview(row.overview),
    spawn: parseSpawn(row.spawn),
    defaultVisibility: parseVisibility(row.defaultVisibility),
  };
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

function normalizeLevel(raw: unknown, fallbackId: string): ZoneLevel {
  const base = createZoneLevel();
  base.id = fallbackId;
  const level = withDefaults(base, raw);
  if (!level.id) level.id = fallbackId;
  level.grid.type = oneOf(['square', 'hex'] as const, level.grid.type, 'square');
  level.elements = level.elements.filter(isPlainObject) as unknown as ZoneLevel['elements'];
  level.walls = level.walls.filter(isPlainObject) as unknown as ZoneLevel['walls'];
  level.lights = level.lights.filter(isPlainObject) as unknown as ZoneLevel['lights'];
  level.fogRegions = level.fogRegions.filter(isPlainObject) as unknown as ZoneLevel['fogRegions'];
  return level;
}

/** ZoneLevel[] JSON -> at least one valid level (stable ids derived from the zone when missing). */
export function parseLevels(value: unknown, zoneId: string, defaultLevelId: string): ZoneLevel[] {
  const raw = Array.isArray(value) ? value : [];
  const levels = raw.map((lvl, i) => normalizeLevel(lvl, i === 0 && defaultLevelId ? defaultLevelId : `lvl_${zoneId}_${i}`));
  if (levels.length === 0) levels.push(normalizeLevel({}, defaultLevelId || `lvl_${zoneId}_0`));
  return levels;
}

export function parseNeighbors(value: unknown): ZoneNeighbors {
  const obj = isPlainObject(value) ? value : {};
  const pick = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return { up: pick(obj.up), down: pick(obj.down), left: pick(obj.left), right: pick(obj.right) };
}

export function parseGridPos(value: unknown): { x: number; y: number } | null {
  if (!isPlainObject(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  return x === null || y === null ? null : { x, y };
}

const ZONE_VISION_MODES = ['all', 'explored', 'vision'] as const;
export const ZONE_VISION_LIMITS = { radiusMin: 0, radiusMax: 60, coneMin: 10, coneMax: 360 } as const;
const DEFAULT_ZONE_VISION_RADIUS = defaultVisibility().visionRadius;

/** ZoneVision JSON -> ZoneVision | null (unknown mode = null; radius and cone rounded and clamped to their ranges). */
export function parseZoneVision(value: unknown): ZoneVision | null {
  if (!isPlainObject(value)) return null;
  const mode = oneOfOrNull(ZONE_VISION_MODES, value.mode);
  if (!mode) return null;
  const L = ZONE_VISION_LIMITS;
  return {
    mode,
    radius: clamp(Math.round(finiteNumber(value.radius) ?? DEFAULT_ZONE_VISION_RADIUS), L.radiusMin, L.radiusMax),
    cone: clamp(Math.round(finiteNumber(value.cone) ?? L.coneMax), L.coneMin, L.coneMax),
  };
}

/*
 * The zone table has no column of its own for the default vision of a zone: it is stored inside the
 * `neighbors` JSON document under the key `vision`. Every write of `neighbors` goes through
 * neighborsColumn() with the zone's vision so it is never lost; parseNeighbors() ignores the extra key.
 */

/** Value for the `neighbors` column: the four directions plus the zone vision (omitted when null). */
export function neighborsColumn(neighbors: ZoneNeighbors, vision: ZoneVision | null | undefined): Prisma.InputJsonValue {
  const directions = { up: neighbors.up ?? null, down: neighbors.down ?? null, left: neighbors.left ?? null, right: neighbors.right ?? null };
  const parsed = parseZoneVision(vision);
  return (parsed ? { ...directions, vision: parsed } : directions) as Prisma.InputJsonValue;
}

/** Zone vision stored in a `neighbors` column value. */
export function storedZoneVision(neighbors: unknown): ZoneVision | null {
  return isPlainObject(neighbors) ? parseZoneVision(neighbors.vision) : null;
}

export function zoneToDTO(row: ZoneRow): Zone {
  const levels = parseLevels(row.levels, row.id, row.defaultLevelId);
  const defaultLevelId = levels.some((l) => l.id === row.defaultLevelId) ? row.defaultLevelId : levels[0]!.id;
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    order: row.order,
    parentZoneId: row.parentZoneId,
    gridPos: parseGridPos(row.gridPos),
    neighbors: parseNeighbors(row.neighbors),
    musicSoundId: row.musicSoundId,
    ambienceSoundId: row.ambienceSoundId,
    tags: [...row.tags],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    zoneType: oneOf(ZONE_TYPES, row.zoneType, 'exterior'),
    biome: row.biome,
    weather: oneOf(WEATHER_TYPES, row.weather, 'none'),
    lighting: oneOf(LIGHTING_PRESETS, row.lighting, 'day'),
    levels,
    defaultLevelId,
    notes: row.notes,
    vision: storedZoneVision(row.neighbors),
  };
}

// ---------------------------------------------------------------------------
// Rollers
// ---------------------------------------------------------------------------

export const rollerInclude = {
  campaign: { select: { name: true } },
} satisfies Prisma.RollerInclude;

export type RollerRow = Prisma.RollerGetPayload<{ include: typeof rollerInclude }>;

export function parseSegments(value: unknown): RouletteSegment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((seg, i) => {
    const weight = finiteNumber(seg.weight);
    return {
      id: typeof seg.id === 'string' && seg.id ? seg.id : `seg_${i}`,
      label: typeof seg.label === 'string' ? seg.label : '',
      color: typeof seg.color === 'string' && seg.color ? seg.color : ROULETTE_PALETTE[i % ROULETTE_PALETTE.length]!,
      weight: weight !== null && weight > 0 ? weight : 1,
      icon: typeof seg.icon === 'string' && seg.icon ? seg.icon : null,
      description: typeof seg.description === 'string' ? seg.description : '',
    };
  });
}

export function rollerToDTO(row: RollerRow): Roller {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    name: row.name,
    kind: row.kind === 'dice' ? 'dice' : 'roulette',
    description: row.description,
    tags: [...row.tags],
    active: row.active,
    isTurnRoll: row.isTurnRoll,
    segments: parseSegments(row.segments),
    formula: row.formula,
    faces: Array.isArray(row.faces) ? row.faces.map((f) => (typeof f === 'string' ? f : String(f))) : null,
    copiedFromId: row.copiedFromId,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Saved filters
// ---------------------------------------------------------------------------

export function savedFilterToDTO(row: SavedFilterRow): SavedFilterDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: oneOfOrNull(ENTRY_KINDS, row.kind),
    query: isPlainObject(row.query) ? (row.query as LibraryQuery) : {},
    createdAt: toIso(row.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Sessions & logs
// ---------------------------------------------------------------------------

const LOG_TYPES: readonly LogType[] = ['chat', 'roll', 'system', 'hp', 'item', 'turn', 'move', 'loot', 'trade', 'fx', 'audio'];
const LOG_VISIBILITIES: readonly LogEntry['visibility'][] = ['all', 'dm', 'user'];
const SESSION_STATUSES: readonly SessionStatus[] = ['lobby', 'playing', 'paused', 'ended'];

export function logToDTO(row: SessionLogRow): LogEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    at: toIso(row.createdAt),
    type: oneOf(LOG_TYPES, row.type, 'system'),
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    text: row.text,
    visibility: oneOf(LOG_VISIBILITIES, row.visibility, 'all'),
    targetUserId: row.targetUserId,
    data: row.data ?? null,
  };
}

export const sessionInclude = {
  campaign: { select: { name: true } },
  host: { select: { name: true } },
} satisfies Prisma.GameSessionInclude;

export type SessionRow = Prisma.GameSessionGetPayload<{ include: typeof sessionInclude }>;

export interface SessionSummaryLive {
  /** In-memory state (preferred over the persisted snapshot). */
  state?: LiveState | null;
  /** Presence check (e.g. SessionManager.isUserConnected); everyone is offline when omitted. */
  isUserConnected?: (userId: string) => boolean;
}

/** Persisted or live session -> public summary for the join screen. */
export function sessionSummaryToDTO(row: SessionRow, live: SessionSummaryLive = {}): SessionSummary {
  const snapshot: PlainObject = live.state ? (live.state as unknown as PlainObject) : isPlainObject(row.state) ? row.state : {};
  const players = isPlainObject(snapshot.players) ? snapshot.players : {};
  const heroes = isPlainObject(snapshot.heroes) ? snapshot.heroes : {};
  const connected = live.isUserConnected ?? (() => false);

  const summaryPlayers: SessionSummary['players'] = [];
  for (const value of Object.values(players)) {
    if (!isPlainObject(value) || typeof value.userId !== 'string') continue;
    const heroId = typeof value.heroId === 'string' ? value.heroId : null;
    const hero = heroId && isPlainObject(heroes[heroId]) ? (heroes[heroId] as PlainObject) : null;
    summaryPlayers.push({
      userId: value.userId,
      name: typeof value.name === 'string' ? value.name : value.userId,
      connected: connected(value.userId),
      heroName: hero && typeof hero.name === 'string' ? hero.name : null,
    });
  }

  return {
    id: row.id,
    name: typeof snapshot.name === 'string' && snapshot.name ? snapshot.name : row.name,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    hostUserId: row.hostUserId,
    hostName: row.host.name,
    status: oneOf(SESSION_STATUSES, live.state?.status ?? row.status, 'lobby'),
    hostConnected: connected(row.hostUserId),
    players: summaryPlayers,
    hasStarted: typeof snapshot.startedAt === 'string' && snapshot.startedAt !== '',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
