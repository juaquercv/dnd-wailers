import {
  adaptHeroToRules,
  blockingSegments,
  cellCenter,
  cellsForSize,
  hexAt,
  hexDistance,
  hexToPixel,
  newId,
  type CreatureData,
  type HeroData,
  type HeroSheet,
  type ItemData,
  type LibraryEntry,
  type Roller,
  type RuleSystem,
  type SessionPlayer,
  type SessionZone,
  type SoundData,
  type SpawnPoint,
  type Token,
  type TokenElement,
  type TokenKind,
  type TokenStats,
  type Zone,
  type ZoneLevel,
} from '@wailers/shared';
import { prisma } from '../db';
import { campaignInclude, campaignToDTO, entryToDTO, rollerInclude, rollerToDTO, zoneToDTO } from '../services/serializers';
import { HandlerError, type CampaignRuntime, type SoundRef } from './types';

/*
 * Campaign runtime of a live session: campaign document, ordered zones, rollers, the sound
 * catalogue and a cache of the library entries referenced by design-time TokenElements.
 * Also the pure token factories and spawn placement used by the session engine.
 */

/** Ring colors by token kind (heroes use their player's color). */
export const TOKEN_COLORS: Record<TokenKind, string> = {
  hero: '#e9c063',
  creature: '#c43d33',
  npc: '#4aa3e2',
  item: '#d4a63f',
};

export const DEFAULT_PLAYER_COLOR = '#e9c063';
const FALLBACK_GRID_SIZE = 70;
const SPAWN_MAX_RING = 14;

export interface Point {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Editor order: slide order, then creation date, then name. */
export function sortZones(zones: Zone[]): Zone[] {
  return [...zones].sort(
    (a, b) =>
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  );
}

export async function loadZones(campaignId: string): Promise<Zone[]> {
  const rows = await prisma.zone.findMany({ where: { campaignId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return sortZones(rows.map(zoneToDTO));
}

export async function loadRollers(campaignId: string): Promise<Roller[]> {
  const rows = await prisma.roller.findMany({
    where: { campaignId },
    include: rollerInclude,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(rollerToDTO);
}

/** Sound entry -> SoundRef (null when the entry is not a playable sound). */
export function soundRefFromEntry(entry: LibraryEntry): SoundRef | null {
  if (entry.kind !== 'sound') return null;
  const data = entry.data as SoundData;
  if (typeof data.url !== 'string' || data.url === '') return null;
  const volume = Number.isFinite(data.volume) ? Math.min(1, Math.max(0, data.volume)) : 0.8;
  const soundType = data.soundType === 'music' || data.soundType === 'ambience' ? data.soundType : 'effect';
  return { id: entry.id, name: entry.name, url: data.url, soundType, loop: Boolean(data.loop), volume };
}

/** Every sound of the library, by id. */
export async function loadSounds(): Promise<Map<string, SoundRef>> {
  const rows = await prisma.libraryEntry.findMany({ where: { kind: 'sound' } });
  const out = new Map<string, SoundRef>();
  for (const row of rows) {
    const ref = soundRefFromEntry(entryToDTO(row));
    if (ref) out.set(ref.id, ref);
  }
  return out;
}

/** Library entry ids referenced by TokenElements of the given zones. */
export function tokenElementEntryIds(zones: Zone[]): string[] {
  const ids = new Set<string>();
  for (const zone of zones) {
    for (const level of zone.levels) {
      for (const el of level.elements) {
        if (el.type === 'token' && typeof el.entryId === 'string' && el.entryId) ids.add(el.entryId);
      }
    }
  }
  return [...ids];
}

export async function loadEntries(ids: string[]): Promise<Map<string, LibraryEntry>> {
  const out = new Map<string, LibraryEntry>();
  if (ids.length === 0) return out;
  const rows = await prisma.libraryEntry.findMany({ where: { id: { in: ids } } });
  for (const row of rows) out.set(row.id, entryToDTO(row));
  return out;
}

/** Campaign runtime + entry cache for a session. Throws HandlerError when the campaign is gone. */
export async function loadCampaignRuntime(
  campaignId: string,
  sounds: Map<string, SoundRef>,
): Promise<{ campaign: CampaignRuntime; entries: Map<string, LibraryEntry> }> {
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, include: campaignInclude });
  if (!row) throw new HandlerError('La campaña de esta partida ya no existe');
  const dto = campaignToDTO(row);
  const [zones, rollers] = await Promise.all([loadZones(campaignId), loadRollers(campaignId)]);
  const entries = await loadEntries(tokenElementEntryIds(zones));
  return {
    campaign: {
      id: dto.id,
      name: dto.name,
      rules: dto.rules,
      overview: dto.overview,
      spawn: dto.spawn,
      defaultVisibility: dto.defaultVisibility,
      zones,
      rollers,
      sounds,
    },
    entries,
  };
}

// ---------------------------------------------------------------------------
// Zones & levels
// ---------------------------------------------------------------------------

export function defaultLevel(zone: Zone): ZoneLevel | undefined {
  return zone.levels.find((l) => l.id === zone.defaultLevelId) ?? zone.levels[0];
}

export function findLevel(zones: Zone[], zoneId: string, levelId: string): { zone: Zone; level: ZoneLevel } | null {
  const zone = zones.find((z) => z.id === zoneId);
  const level = zone?.levels.find((l) => l.id === levelId);
  return zone && level ? { zone, level } : null;
}

function levelCenter(level: ZoneLevel): Point {
  return { x: level.background.width / 2, y: level.background.height / 2 };
}

/**
 * Where heroes appear: the campaign spawn when valid; a missing level falls back to the zone default
 * level; without a spawn, the center of the first top-level zone. Null when the campaign has no zones.
 */
export function resolveSpawn(campaign: CampaignRuntime): SpawnPoint | null {
  const spawn = campaign.spawn;
  if (spawn) {
    const zone = campaign.zones.find((z) => z.id === spawn.zoneId);
    if (zone) {
      const level = zone.levels.find((l) => l.id === spawn.levelId);
      if (level) return { ...spawn };
      const fallback = defaultLevel(zone);
      if (fallback) return { zoneId: zone.id, levelId: fallback.id, ...levelCenter(fallback) };
    }
  }
  const first = campaign.zones.find((z) => !z.parentZoneId) ?? campaign.zones[0];
  const level = first ? defaultLevel(first) : undefined;
  if (!first || !level) return null;
  return { zoneId: first.id, levelId: level.id, ...levelCenter(level) };
}

/** Zone document as delivered to session clients, with music/ambience urls resolved. */
export function toSessionZone(zone: Zone, sounds: Map<string, SoundRef>): SessionZone {
  return {
    ...zone,
    musicUrl: zone.musicSoundId ? (sounds.get(zone.musicSoundId)?.url ?? null) : null,
    ambienceUrl: zone.ambienceSoundId ? (sounds.get(zone.ambienceSoundId)?.url ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Spawn placement
// ---------------------------------------------------------------------------

interface Candidate {
  p: Point;
  ring: number;
  dist: number;
  angle: number;
}

function validGridSize(level: ZoneLevel): number | null {
  const size = level.grid.size;
  return Number.isFinite(size) && size > 0 ? size : null;
}

/** Grid cell centers around `origin`, nearest rings first. */
function candidateCells(level: ZoneLevel, origin: Point, maxRing: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (p: Point, ring: number): void => {
    out.push({ p, ring, dist: Math.hypot(p.x - origin.x, p.y - origin.y), angle: Math.atan2(p.y - origin.y, p.x - origin.x) });
  };
  const size = validGridSize(level);
  if (level.grid.type === 'hex' && size !== null) {
    const center = hexAt(origin, level.grid);
    for (let dq = -maxRing; dq <= maxRing; dq++) {
      const drMin = Math.max(-maxRing, -dq - maxRing);
      const drMax = Math.min(maxRing, -dq + maxRing);
      for (let dr = drMin; dr <= drMax; dr++) {
        const hex = { q: center.q + dq, r: center.r + dr };
        push(hexToPixel(hex, level.grid), hexDistance(center, hex));
      }
    }
  } else {
    const step = size ?? FALLBACK_GRID_SIZE;
    const c = size !== null ? cellCenter(origin, level.grid) : origin;
    for (let dy = -maxRing; dy <= maxRing; dy++) {
      for (let dx = -maxRing; dx <= maxRing; dx++) {
        push({ x: c.x + dx * step, y: c.y + dy * step }, Math.max(Math.abs(dx), Math.abs(dy)));
      }
    }
  }
  return out.sort((a, b) => a.ring - b.ring || a.dist - b.dist || a.angle - b.angle);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Up to `count` free cell centers around `origin` (spiral of grid cells, nearest first): inside the
 * level, not overlapping `occupied` tokens and not behind a blocking wall as seen from the origin.
 * Falls back to the origin itself when the area is full.
 */
export function freeTokenPositions(
  level: ZoneLevel,
  doors: Record<string, boolean> | undefined,
  origin: Point,
  occupied: { x: number; y: number; cells: number }[],
  count: number,
): Point[] {
  const size = validGridSize(level) ?? FALLBACK_GRID_SIZE;
  const width = level.background.width;
  const height = level.background.height;
  const walls = blockingSegments(level.walls, doors);
  const taken = occupied.map((t) => ({ x: t.x, y: t.y, cells: Number.isFinite(t.cells) && t.cells > 0 ? t.cells : 1 }));
  const out: Point[] = [];
  for (const candidate of candidateCells(level, origin, SPAWN_MAX_RING)) {
    if (out.length >= count) break;
    const { p } = candidate;
    if (width > 0 && height > 0 && (p.x < 0 || p.y < 0 || p.x > width || p.y > height)) continue;
    const overlaps = taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < ((t.cells + 1) * size) / 2 - 1);
    if (overlaps) continue;
    if (candidate.ring > 0 && walls.some((w) => segmentsCross(origin, p, w.a, w.b))) continue;
    out.push(p);
    taken.push({ x: p.x, y: p.y, cells: 1 });
  }
  while (out.length < count) out.push({ x: origin.x, y: origin.y });
  return out;
}

// ---------------------------------------------------------------------------
// Token & hero factories
// ---------------------------------------------------------------------------

function statsFromCreature(entry: LibraryEntry, data: CreatureData): TokenStats {
  return {
    speed: data.speed ?? '',
    abilities: { ...(data.abilities ?? {}) },
    attacks: structuredClone(data.attacks ?? []),
    traits: structuredClone(data.traits ?? []),
    resistances: [...(data.resistances ?? [])],
    weaknesses: [...(data.weaknesses ?? [])],
    immunities: [...(data.immunities ?? [])],
    xp: Number.isFinite(data.xp) ? data.xp : 0,
    cr: entry.cr,
    description: entry.description,
  };
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Live token for a design-time TokenElement (entry may be missing from the library). */
export function tokenFromElement(el: TokenElement, zoneId: string, levelId: string, entry: LibraryEntry | undefined): Token {
  const isItem = el.entryKind === 'item';
  const creature = !isItem && entry?.kind === 'creature' ? (entry.data as CreatureData) : null;
  const item = isItem && entry?.kind === 'item' ? (entry.data as ItemData) : null;
  const kind: TokenKind = isItem ? 'item' : creature?.isNpc ? 'npc' : 'creature';
  const label = typeof el.label === 'string' ? el.label.trim() : '';
  const name = label || entry?.name || el.name || (isItem ? 'Objeto' : 'Criatura');
  const maxHp = !isItem && typeof entry?.hp === 'number' && Number.isFinite(entry.hp) ? Math.max(0, Math.round(entry.hp)) : null;
  const cells =
    positiveNumber(el.cells) ?? (creature ? (positiveNumber(creature.tokenCells) ?? cellsForSize(entry?.size)) : 1);
  return {
    id: newId('tok'),
    kind,
    entryId: el.entryId || null,
    heroId: null,
    ownerUserId: null,
    name,
    imageUrl: el.imageUrl ?? entry?.imageUrl ?? null,
    zoneId,
    levelId,
    x: Number.isFinite(el.x) ? el.x : 0,
    y: Number.isFinite(el.y) ? el.y : 0,
    cells,
    facing: Number.isFinite(el.rotation) ? el.rotation : 0,
    hp: maxHp,
    maxHp,
    tempHp: 0,
    hpRatio: null,
    ac: creature ? (Number.isFinite(creature.ac) ? creature.ac : null) : (item?.armorClass ?? null),
    statuses: [],
    hidden: Boolean(el.startHidden || el.hidden),
    light: null,
    color: TOKEN_COLORS[kind],
    loot: [],
    stats: creature && entry ? statsFromCreature(entry, creature) : null,
    notes: creature?.notes ?? '',
    sourceElementId: el.id,
  };
}

/** Hero token for a player's hero at a position. */
export function heroTokenFor(hero: HeroSheet, player: Pick<SessionPlayer, 'userId' | 'color'>, at: SpawnPoint): Token {
  return {
    id: newId('tok'),
    kind: 'hero',
    entryId: null,
    heroId: hero.id,
    ownerUserId: player.userId,
    name: hero.name,
    imageUrl: hero.imageUrl,
    zoneId: at.zoneId,
    levelId: at.levelId,
    x: at.x,
    y: at.y,
    cells: 1,
    facing: 0,
    hp: hero.data.hp.current,
    maxHp: hero.data.hp.max,
    tempHp: hero.data.hp.temp || 0,
    hpRatio: null,
    ac: hero.data.ac,
    statuses: [...hero.data.statuses],
    hidden: false,
    light: null,
    color: player.color || TOKEN_COLORS.hero,
    loot: [],
    stats: null,
    notes: '',
    sourceElementId: null,
  };
}

/** Live hero sheet from a library hero, adapted to the campaign rules (nothing is removed). */
export function heroSheetFromEntry(entry: LibraryEntry, rules: RuleSystem): HeroSheet {
  const level = typeof entry.level === 'number' && Number.isFinite(entry.level) && entry.level > 0 ? Math.round(entry.level) : 1;
  return {
    id: entry.id,
    ownerId: entry.ownerId ?? '',
    name: entry.name,
    imageUrl: entry.imageUrl,
    level,
    categoryIds: [...entry.categoryIds],
    data: adaptHeroToRules(entry.data as HeroData, rules, level),
  };
}
