import {
  SIZE_INFO,
  STATUSES,
  blockingSegments,
  cellsForSize,
  customInventoryItem,
  defaultVisibility,
  effectiveVisibility,
  hexAt,
  hexToPixel,
  isOwnHero,
  isOwnHeroToken,
  newId,
  normalizeText,
  pointInAnyPolygon,
  snapTokenCenter,
  visibleAreas,
  allowedZoneIds,
  usageOf,
  HIDDEN_TURN_ENTRY_NAME,
  RARITIES,
  type EntryKind,
  type HeroSheet,
  type InventoryItem,
  type LibraryEntry,
  type LiveState,
  type Rarity,
  type SessionEvent,
  type SpawnPoint,
  type Token,
  type TokenKind,
  type TokenStats,
  type TransitionElement,
  type TurnEntry,
  type TurnUsage,
  type VisibilitySettings,
  type Wall,
  type Zone,
  type ZoneLevel,
  type ZoneNeighbors,
  type ZoneVision,
} from '@wailers/shared';
import { prisma } from '../db';
import { entryInclude, entryToDTO, isPlainObject } from '../services/serializers';
import { claims } from '../auth/claims';
import { TOKEN_COLORS, heroTokenFor } from './runtime';
import { HandlerError, type Audience, type HandlerCtx, type LiveSession, type SessionManagerApi } from './types';

/*
 * Shared helpers for the gameplay handler modules: payload validation, zone/level geometry,
 * token factories, inventory stacking, audiences and naming.
 * Every user-facing message is Spanish; handlers throw HandlerError with it.
 */

export interface Point {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Payload validation (client payloads are untrusted)
// ---------------------------------------------------------------------------

function invalid(label: string): HandlerError {
  return new HandlerError(`Valor no válido para «${label}»`);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Rounds to 2 decimals (gold, weight). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Non-empty identifier string. */
export function reqId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) throw invalid(label);
  return value;
}

/** Optional identifier: undefined/null/'' → undefined. */
export function optId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return reqId(value, label);
}

/** Trimmed text; `min` characters required (default 0). */
export function reqText(value: unknown, label: string, max: number, min = 0): string {
  if (typeof value !== 'string') throw invalid(label);
  const text = value.trim();
  if (text.length < min) throw new HandlerError(min <= 1 ? `Falta «${label}»` : `«${label}» es demasiado corto`);
  if (text.length > max) throw new HandlerError(`«${label}» es demasiado largo (máximo ${max} caracteres)`);
  return text;
}

export function optText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return reqText(value, label, max);
}

/** Free (untrimmed-semantics) long text such as notes. */
export function longText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw invalid(label);
  if (value.length > max) throw new HandlerError(`«${label}» es demasiado largo (máximo ${max} caracteres)`);
  return value;
}

export function reqNum(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(label);
  return value;
}

export function optNum(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return reqNum(value, label);
}

export function reqInt(value: unknown, label: string, min: number, max: number): number {
  return clamp(Math.round(reqNum(value, label)), min, max);
}

export function reqBool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw invalid(label);
  return value;
}

export function oneOf<T extends string>(values: readonly T[], value: unknown, label: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw invalid(label);
  return value as T;
}

export function optOneOf<T extends string>(values: readonly T[], value: unknown, label: string): T | undefined {
  if (value === undefined || value === null) return undefined;
  return oneOf(values, value, label);
}

/** URL-ish string or null (uploads are relative paths like /uploads/...). */
export function urlOrNull(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw invalid(label);
  return value.trim() || null;
}

/** Simple CSS color validation (hex, rgb[a], hsl[a] or a named color). */
export function colorValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw invalid(label);
  const v = value.trim();
  if (v.length === 0 || v.length > 40 || !/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|[a-zA-Z]+)$/.test(v)) throw invalid(label);
  return v;
}

export function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw invalid(label);
  return value;
}

/** Array of unique identifiers (at least `min`). */
export function idList(value: unknown, label: string, min = 1, max = 200): string[] {
  if (!Array.isArray(value)) throw invalid(label);
  const out: string[] = [];
  for (const v of value) {
    const id = reqId(v, label);
    if (!out.includes(id)) out.push(id);
  }
  if (out.length < min) throw new HandlerError(`Falta «${label}»`);
  if (out.length > max) throw new HandlerError(`Demasiados elementos en «${label}»`);
  return out;
}

/** Status key/label: short free text (predefined STATUSES keys or custom). */
export function statusValue(value: unknown): string {
  const text = reqText(value, 'estado', 40, 1);
  return text;
}

export function statusLabel(status: string): string {
  return STATUSES.find((s) => s.key === status)?.label ?? status;
}

/** Quantity 1..9999 (default 1). */
export function quantityValue(value: unknown, label = 'cantidad'): number {
  if (value === undefined || value === null) return 1;
  const n = Math.floor(reqNum(value, label));
  if (n < 1) throw new HandlerError('La cantidad debe ser al menos 1');
  return Math.min(n, 9999);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Display name of a session member (player name, host user name or id). */
export function playerName(session: LiveSession, userId: string): string {
  const player = session.state.players[userId];
  if (player) return player.name;
  return claims.getUser(userId)?.name ?? userId;
}

/** Color of a session member. */
export function userColor(session: LiveSession, userId: string): string {
  return session.state.players[userId]?.color ?? claims.getUser(userId)?.color ?? '#e9c063';
}

/** The hero selected by a player (null for the DM or players without hero). */
export function playerHero(state: LiveState, userId: string): HeroSheet | null {
  const heroId = state.players[userId]?.heroId ?? null;
  return heroId ? (state.heroes[heroId] ?? null) : null;
}

export function isPlayer(state: LiveState, userId: string): boolean {
  return userId !== state.hostUserId && state.players[userId] !== undefined;
}

/** Session member ids except the host. */
export function playerIds(state: LiveState): string[] {
  return Object.keys(state.players).filter((id) => id !== state.hostUserId);
}

/** True when `hero` is the user's own hero (selected by them or owned and not played by another). */
export function isHeroOwner(state: LiveState, hero: HeroSheet, userId: string): boolean {
  return isOwnHero(state, hero, userId);
}

export function requireHero(state: LiveState, heroId: unknown): HeroSheet {
  const id = reqId(heroId, 'héroe');
  const hero = state.heroes[id];
  if (!hero) throw new HandlerError('Ese héroe no está en la partida');
  return hero;
}

export function requireToken(state: LiveState, tokenId: unknown): Token {
  const id = reqId(tokenId, 'ficha');
  const token = state.tokens[id];
  if (!token) throw new HandlerError('Esa ficha ya no existe');
  return token;
}

/** The player's own hero token (prefers the one of the hero they selected). */
export function heroTokenOf(state: LiveState, userId: string): Token | undefined {
  const heroId = state.players[userId]?.heroId ?? null;
  const own = Object.values(state.tokens).filter((t) => isOwnHeroToken(state, t, userId));
  return own.find((t) => heroId !== null && t.heroId === heroId) ?? own[0];
}

/** First token of a hero (heroes normally have a single token). */
export function heroTokenForHero(state: LiveState, heroId: string): Token | undefined {
  return Object.values(state.tokens).find((t) => t.kind === 'hero' && t.heroId === heroId);
}

/** Player user id currently playing a hero (or its owner when nobody selected it). */
export function heroPlayerId(state: LiveState, hero: HeroSheet): string | null {
  const player = Object.values(state.players).find((p) => p.heroId === hero.id);
  if (player) return player.userId;
  return state.players[hero.ownerId] ? hero.ownerId : null;
}

export function requirePlaying(ctx: HandlerCtx): void {
  if (ctx.isDm) return;
  if (ctx.session.state.status !== 'playing') throw new HandlerError('La partida todavía no ha empezado');
}

export function effectiveFor(state: LiveState, userId: string): VisibilitySettings {
  return effectiveVisibility(state, userId);
}

// ---------------------------------------------------------------------------
// Zones and levels
// ---------------------------------------------------------------------------

export function requireZone(manager: SessionManagerApi, session: LiveSession, zoneId: unknown): Zone {
  const id = reqId(zoneId, 'zona');
  const zone = manager.zone(session, id) ?? session.campaign.zones.find((z) => z.id === id);
  if (!zone) throw new HandlerError('Esa zona no existe en la campaña');
  return zone;
}

/** Zone + level lookup without throwing. */
export function getLevel(session: LiveSession, zoneId: string, levelId: string): { zone: Zone; level: ZoneLevel } | null {
  const zone = session.campaign.zones.find((z) => z.id === zoneId);
  const level = zone?.levels.find((l) => l.id === levelId);
  return zone && level ? { zone, level } : null;
}

export function requireLevel(
  manager: SessionManagerApi,
  session: LiveSession,
  zoneId: unknown,
  levelId: unknown,
): { zone: Zone; level: ZoneLevel } {
  const zone = requireZone(manager, session, zoneId);
  const id = reqId(levelId, 'nivel');
  const level = zone.levels.find((l) => l.id === id);
  if (!level) throw new HandlerError('Ese nivel no existe en la zona');
  return { zone, level };
}

export function defaultLevel(zone: Zone): ZoneLevel {
  return zone.levels.find((l) => l.id === zone.defaultLevelId) ?? zone.levels[0]!;
}

export function levelSize(level: ZoneLevel): { width: number; height: number } {
  const width = Number.isFinite(level.background.width) && level.background.width > 0 ? level.background.width : 2100;
  const height = Number.isFinite(level.background.height) && level.background.height > 0 ? level.background.height : 1400;
  return { width, height };
}

export function gridSize(level: ZoneLevel): number {
  return Number.isFinite(level.grid.size) && level.grid.size > 0 ? level.grid.size : 70;
}

export function levelCenter(level: ZoneLevel): Point {
  const { width, height } = levelSize(level);
  return { x: width / 2, y: height / 2 };
}

/** Keep a point inside the level bounds. */
export function clampToLevel(level: ZoneLevel, p: Point): Point {
  const { width, height } = levelSize(level);
  return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) };
}

/** Snap a token center to the level grid (when the grid snaps) and keep it inside the level. */
export function snapPoint(level: ZoneLevel, p: Point, cells = 1): Point {
  const inside = clampToLevel(level, p);
  if (!level.grid.snap || !(level.grid.size > 0)) return inside;
  const snapped = snapTokenCenter(inside, cells, level.grid);
  const { width, height } = levelSize(level);
  // Snapping may push the center just outside: step back one cell when it happens.
  const size = gridSize(level);
  let { x, y } = snapped;
  if (x > width) x -= size;
  if (y > height) y -= size;
  if (x < 0) x += size;
  if (y < 0) y += size;
  return clampToLevel(level, { x, y });
}

/** Candidate cell centers around an origin, ring by ring (nearest first). */
function* spiralCandidates(level: ZoneLevel, origin: Point, cells: number, maxRing: number): Generator<Point> {
  const size = gridSize(level);
  if (level.grid.type === 'hex' && level.grid.size > 0) {
    const center = hexAt(origin, level.grid);
    yield hexToPixel(center, level.grid);
    const directions = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    for (let ring = 1; ring <= maxRing; ring++) {
      let hex = { q: center.q + directions[4]!.q * ring, r: center.r + directions[4]!.r * ring };
      const ringPoints: Point[] = [];
      for (let side = 0; side < 6; side++) {
        for (let step = 0; step < ring; step++) {
          ringPoints.push(hexToPixel(hex, level.grid));
          hex = { q: hex.q + directions[side]!.q, r: hex.r + directions[side]!.r };
        }
      }
      ringPoints.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
      yield* ringPoints;
    }
    return;
  }
  const step = size * Math.max(1, Math.round(cells));
  const start = snapPoint(level, origin, cells);
  yield start;
  for (let ring = 1; ring <= maxRing; ring++) {
    const ringPoints: Point[] = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        ringPoints.push({ x: start.x + dx * step, y: start.y + dy * step });
      }
    }
    ringPoints.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
    yield* ringPoints;
  }
}

/**
 * Whether the path a→b is blocked by the wall segment cd. Passing exactly through a wall vertex
 * or ending on the wall counts as blocked; a path starting on the wall line, or running along
 * it, does not (so a point dropped on a wall can still spread around).
 */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (d1 === 0 || (d3 === 0 && d4 === 0)) return false;
  return ((d1 > 0 && d2 <= 0) || (d1 < 0 && d2 >= 0)) && d3 * d4 <= 0;
}

/**
 * `count` free positions (token centers) around `origin` on a level, in a spiral of grid cells.
 * A position is free when no other token of the level (except `excludeIds`) overlaps it and it is
 * not behind a blocking wall (closed doors included) as seen from the origin.
 * Falls back to the origin cell when the level is full.
 */
export function freeCellsAround(
  state: LiveState,
  zoneId: string,
  level: ZoneLevel,
  origin: Point,
  count: number,
  cells = 1,
  excludeIds: ReadonlySet<string> = new Set(),
): Point[] {
  const size = gridSize(level);
  const { width, height } = levelSize(level);
  const from = clampToLevel(level, origin);
  const walls = blockingSegments(level.walls, state.zoneStates[zoneId]?.doors);
  const occupied: { x: number; y: number; cells: number }[] = Object.values(state.tokens)
    .filter((t) => t.zoneId === zoneId && t.levelId === level.id && !excludeIds.has(t.id))
    .map((t) => ({ x: t.x, y: t.y, cells: Number.isFinite(t.cells) && t.cells > 0 ? t.cells : 1 }));
  const out: Point[] = [];
  const maxRing = Math.ceil(Math.max(width, height) / size) + 1;
  for (const candidate of spiralCandidates(level, from, cells, maxRing)) {
    if (out.length >= count) break;
    if (candidate.x < 0 || candidate.y < 0 || candidate.x > width || candidate.y > height) continue;
    const blocked = occupied.some((o) => {
      const minDist = ((o.cells + cells) / 2) * size * 0.9;
      return Math.hypot(o.x - candidate.x, o.y - candidate.y) < minDist;
    });
    if (blocked) continue;
    const far = Math.hypot(candidate.x - from.x, candidate.y - from.y) > size * 0.75;
    if (far && walls.some((w) => segmentsCross(from, candidate, w.a, w.b))) continue;
    out.push(candidate);
    occupied.push({ x: candidate.x, y: candidate.y, cells });
  }
  const fallback = snapPoint(level, from, cells);
  while (out.length < count) out.push(fallback);
  return out;
}

export type NeighborDirection = keyof ZoneNeighbors;

/** Direction in which `targetZoneId` neighbors `zone` (null when not a neighbor). */
export function neighborDirection(zone: Zone, targetZoneId: string): NeighborDirection | null {
  const dirs: NeighborDirection[] = ['up', 'down', 'left', 'right'];
  return dirs.find((d) => zone.neighbors[d] === targetZoneId) ?? null;
}

/** Transitions of a level pointing to a zone (and level, when given). Hidden ones only when `includeHidden`. */
export function findTransitionTarget(
  level: ZoneLevel,
  targetZoneId: string,
  targetLevelId: string | null,
  includeHidden: boolean,
): SpawnPoint | null {
  for (const el of level.elements) {
    if (el.type !== 'transition') continue;
    const tr = el as TransitionElement;
    if (!tr.target || (!includeHidden && tr.hidden)) continue;
    if (tr.target.zoneId !== targetZoneId) continue;
    if (targetLevelId !== null && tr.target.levelId !== targetLevelId) continue;
    return tr.target;
  }
  return null;
}

/**
 * Where a token appears when entering a neighbor zone from `direction` without explicit
 * coordinates: just inside the opposite edge, keeping the relative position along that edge.
 */
export function entryEdgePoint(level: ZoneLevel, direction: NeighborDirection, along: number): Point {
  const { width, height } = levelSize(level);
  const margin = gridSize(level) * 1.5;
  const t = clamp(Number.isFinite(along) ? along : 0.5, 0.05, 0.95);
  switch (direction) {
    case 'right':
      return { x: Math.min(margin, width / 2), y: height * t };
    case 'left':
      return { x: Math.max(width - margin, width / 2), y: height * t };
    case 'up':
      return { x: width * t, y: Math.max(height - margin, height / 2) };
    case 'down':
      return { x: width * t, y: Math.min(margin, height / 2) };
  }
}

/** Zone label for logs: "Zona" or "Zona · Nivel" when the zone has several levels. */
export function zoneLabel(zone: Zone, level?: ZoneLevel | null): string {
  if (level && zone.levels.length > 1) return `${zone.name} · ${level.name}`;
  return zone.name;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export { TOKEN_COLORS };

/** Creature stat sheet snapshot for a token. */
export function statsFromEntry(entry: LibraryEntry<'creature'>): TokenStats {
  const d = entry.data;
  return {
    speed: d.speed ?? '',
    abilities: { ...(d.abilities ?? {}) },
    attacks: structuredClone(d.attacks ?? []),
    traits: structuredClone(d.traits ?? []),
    resistances: [...(d.resistances ?? [])],
    weaknesses: [...(d.weaknesses ?? [])],
    immunities: [...(d.immunities ?? [])],
    xp: d.xp ?? 0,
    cr: entry.cr,
    description: entry.description,
  };
}

/** Live token from a library creature or item. */
export function entryToToken(
  entry: LibraryEntry<'creature'> | LibraryEntry<'item'>,
  at: { zoneId: string; levelId: string; x: number; y: number },
  opts: { hidden?: boolean; name?: string; cells?: number } = {},
): Token {
  const base = {
    id: newId('tok'),
    entryId: entry.id,
    heroId: null,
    ownerUserId: null,
    name: opts.name ?? entry.name,
    imageUrl: entry.imageUrl,
    zoneId: at.zoneId,
    levelId: at.levelId,
    x: at.x,
    y: at.y,
    facing: 0,
    tempHp: 0,
    hpRatio: null,
    statuses: [],
    hidden: opts.hidden ?? false,
    light: null,
    loot: [],
    notes: '',
    sourceElementId: null,
  };
  if (entry.kind === 'item') {
    const item = entry as LibraryEntry<'item'>;
    return {
      ...base,
      kind: 'item',
      cells: opts.cells ?? 1,
      hp: null,
      maxHp: null,
      ac: item.data.armorClass ?? null,
      color: TOKEN_COLORS.item,
      stats: null,
    };
  }
  const creature = entry as LibraryEntry<'creature'>;
  const kind: TokenKind = creature.data.isNpc ? 'npc' : 'creature';
  const maxHp = typeof creature.hp === 'number' && Number.isFinite(creature.hp) ? Math.max(0, Math.round(creature.hp)) : null;
  return {
    ...base,
    kind,
    cells: opts.cells ?? tokenCellsForEntry(creature),
    hp: maxHp,
    maxHp,
    ac: typeof creature.data.ac === 'number' ? creature.data.ac : null,
    color: TOKEN_COLORS[kind],
    stats: statsFromEntry(creature),
    notes: creature.data.notes ?? '',
  };
}

export function tokenCellsForEntry(entry: LibraryEntry<'creature'> | LibraryEntry<'item'>): number {
  if (entry.kind !== 'creature') return 1;
  const creature = entry as LibraryEntry<'creature'>;
  const override = creature.data.tokenCells;
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return clamp(override, 0.25, 12);
  return cellsForSize(creature.size);
}

/** Hero token for a hero sheet played by `userId` (ring in the player's color). */
export function createHeroToken(state: LiveState, hero: HeroSheet, userId: string, at: SpawnPoint): Token {
  return heroTokenFor(hero, { userId, color: state.players[userId]?.color ?? TOKEN_COLORS.hero }, at);
}

/** Mirror hero statuses/AC on every token of the hero (hp/name/image are mirrored by the manager). */
export function syncHeroTokens(state: LiveState, heroId: string): void {
  const hero = state.heroes[heroId];
  if (!hero) return;
  for (const token of Object.values(state.tokens)) {
    if (token.kind !== 'hero' || token.heroId !== heroId) continue;
    token.statuses = [...hero.data.statuses];
    token.ac = hero.data.ac;
    token.hp = hero.data.hp.current;
    token.maxHp = hero.data.hp.max;
    token.tempHp = hero.data.hp.temp || 0;
    token.name = hero.name;
    token.imageUrl = hero.imageUrl;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Names for `count` new tokens of `baseName`: plain name when it is the only one,
 * otherwise numbered after the existing ones ("Goblin 2", "Goblin 3"...).
 */
export function numberedNames(state: LiveState, baseName: string, count: number): string[] {
  const re = new RegExp(`^${escapeRegExp(baseName)}(?: (\\d+))?$`);
  let maxNumber = 0;
  let existing = 0;
  for (const t of Object.values(state.tokens)) {
    const m = re.exec(t.name);
    if (!m) continue;
    existing++;
    maxNumber = Math.max(maxNumber, m[1] ? Number(m[1]) : 1);
  }
  if (existing === 0 && count === 1) return [baseName];
  const start = existing === 0 ? 1 : maxNumber + 1;
  return Array.from({ length: count }, (_, i) => `${baseName} ${start + i}`);
}

/** "Desafío 1/4" style CR text. */
export function formatCr(cr: number | null): string | null {
  if (cr === null || !Number.isFinite(cr)) return null;
  const fractions: [number, string][] = [
    [0.125, '1/8'],
    [0.25, '1/4'],
    [0.5, '1/2'],
  ];
  const fraction = fractions.find(([v]) => Math.abs(v - cr) < 1e-6);
  return fraction ? fraction[1] : String(Math.round(cr * 100) / 100);
}

export function sizeLabel(entry: LibraryEntry): string | null {
  return entry.size ? SIZE_INFO[entry.size].label : null;
}

// ---------------------------------------------------------------------------
// Library access
// ---------------------------------------------------------------------------

/** Load a library entry of one of the given kinds (Spanish error when missing or of another kind). */
export async function loadEntry<K extends EntryKind>(
  entryId: unknown,
  kinds: readonly K[],
  notFound: string,
): Promise<{ [P in K]: LibraryEntry<P> }[K]> {
  const id = reqId(entryId, 'elemento');
  const row = await prisma.libraryEntry.findUnique({ where: { id }, include: entryInclude(null) });
  if (!row) throw new HandlerError('Ese elemento ya no existe en la biblioteca');
  if (!(kinds as readonly string[]).includes(row.kind)) throw new HandlerError(notFound);
  return entryToDTO(row) as { [P in K]: LibraryEntry<P> }[K];
}

/** Record "used in this campaign" and "recently used by" (best effort). */
export async function markEntryUsed(entryId: string, campaignId: string, userId: string): Promise<void> {
  const now = new Date();
  try {
    // Sequential, recentUse first: same order as services/library.ts (avoids deadlocks).
    await prisma.recentUse.upsert({
      where: { userId_entryId: { userId, entryId } },
      create: { userId, entryId, usedAt: now },
      update: { usedAt: now },
    });
    await prisma.entryUsage.upsert({
      where: { entryId_campaignId: { entryId, campaignId } },
      create: { entryId, campaignId, lastUsedAt: now },
      update: { lastUsedAt: now },
    });
  } catch (err) {
    console.error('[live] No se pudo registrar el uso del elemento', entryId, err);
  }
}

/**
 * Name of the entry's category under the first facet (lowest sortOrder root) of its kind,
 * e.g. the creature type. Null when the entry has no category there.
 */
export async function primaryCategoryName(entry: LibraryEntry): Promise<string | null> {
  if (entry.categoryIds.length === 0) return null;
  try {
    const rows = await prisma.category.findMany({ where: { kind: entry.kind }, select: { id: true, parentId: true, name: true, sortOrder: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const rootOf = (id: string): { id: string; sortOrder: number } | null => {
      let current = byId.get(id);
      for (let guard = 0; current && current.parentId && guard < 20; guard++) current = byId.get(current.parentId);
      return current ? { id: current.id, sortOrder: current.sortOrder } : null;
    };
    let best: { name: string; rootOrder: number } | null = null;
    for (const categoryId of entry.categoryIds) {
      const category = byId.get(categoryId);
      if (!category || category.parentId === null) continue;
      const root = rootOf(categoryId);
      if (!root) continue;
      if (!best || root.sortOrder < best.rootOrder) best = { name: category.name, rootOrder: root.sortOrder };
    }
    return best?.name ?? null;
  } catch {
    return null;
  }
}

/** Find a sound of the session runtime whose name matches a keyword (accent/case-insensitive). */
export function findSoundByKeyword(session: LiveSession, keyword: string): { url: string; name: string } | null {
  const needle = normalizeText(keyword);
  let fallback: { url: string; name: string } | null = null;
  for (const sound of session.campaign.sounds.values()) {
    if (!sound.url || !normalizeText(sound.name).includes(needle)) continue;
    if (sound.soundType === 'effect') return { url: sound.url, name: sound.name };
    fallback ??= { url: sound.url, name: sound.name };
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

const ITEM_TEXT_MAX = 4000;

/** Sanitized partial InventoryItem from an untrusted payload (id/entryId never accepted). */
export function sanitizeItemPatch(raw: unknown): Partial<InventoryItem> {
  if (raw === undefined || raw === null) return {};
  const obj = plainObject(raw, 'objeto');
  const out: Partial<InventoryItem> = {};
  if (obj.name !== undefined) out.name = reqText(obj.name, 'nombre del objeto', 120, 1);
  if (obj.imageUrl !== undefined) out.imageUrl = urlOrNull(obj.imageUrl, 'imagen');
  if (obj.quantity !== undefined) out.quantity = quantityValue(obj.quantity);
  if (obj.weight !== undefined) out.weight = round2(clamp(reqNum(obj.weight, 'peso'), 0, 100000));
  if (obj.value !== undefined) out.value = round2(clamp(reqNum(obj.value, 'valor'), 0, 100000000));
  if (obj.slots !== undefined) out.slots = clamp(Math.round(reqNum(obj.slots, 'espacios')), 0, 1000);
  if (obj.rarity !== undefined) out.rarity = obj.rarity === null ? null : oneOf<Rarity>(RARITIES, obj.rarity, 'rareza');
  if (obj.description !== undefined) out.description = longText(obj.description, 'descripción', ITEM_TEXT_MAX);
  if (obj.equipped !== undefined) out.equipped = reqBool(obj.equipped, 'equipado');
  if (obj.notes !== undefined) out.notes = longText(obj.notes, 'notas', ITEM_TEXT_MAX);
  return out;
}

/** A complete inventory item from an untrusted object (used for hero:update inventory lists). */
export function sanitizeInventoryItem(raw: unknown): InventoryItem {
  const obj = plainObject(raw, 'objeto');
  const patch = sanitizeItemPatch({ ...obj, name: obj.name ?? 'Objeto' });
  const item = customInventoryItem(patch);
  if (typeof obj.id === 'string' && obj.id.trim() !== '' && obj.id.length <= 100) item.id = obj.id;
  if (typeof obj.entryId === 'string' && obj.entryId.length <= 100) item.entryId = obj.entryId || null;
  return item;
}

/**
 * Ids (among `entryIds`) of library items flagged as stackable. Items of other library entries
 * (weapons, artifacts…) never merge into stacks; custom items (no entry) are not listed here.
 */
export async function stackableEntryIds(entryIds: Iterable<string | null | undefined>): Promise<Set<string>> {
  const ids = [...new Set([...entryIds].filter((id): id is string => typeof id === 'string' && id !== ''))];
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const rows = await prisma.libraryEntry.findMany({ where: { id: { in: ids }, kind: 'item' }, select: { id: true, data: true } });
  for (const row of rows) {
    if (isPlainObject(row.data) && row.data.stackable === true) out.add(row.id);
  }
  return out;
}

/**
 * Two stacks can merge when they describe the same thing and neither is equipped. Items of a
 * library entry merge only when that entry is stackable (`stackable` from stackableEntryIds).
 */
export function canStack(a: InventoryItem, b: InventoryItem, stackable: ReadonlySet<string>): boolean {
  if (a.entryId !== null && !stackable.has(a.entryId)) return false;
  return (
    a.entryId === b.entryId &&
    a.name === b.name &&
    a.value === b.value &&
    a.weight === b.weight &&
    a.rarity === b.rarity &&
    a.slots === b.slots &&
    !a.equipped &&
    !b.equipped
  );
}

/** Add `item` to a list, merging with a compatible stack (see canStack). Returns the resulting stack. */
export function addItemTo(list: InventoryItem[], item: InventoryItem, stackable: ReadonlySet<string>): InventoryItem {
  const target = list.find((it) => it.id !== item.id && canStack(it, item, stackable));
  if (target) {
    target.quantity = Math.min(target.quantity + item.quantity, 999999);
    return target;
  }
  list.push(item);
  return item;
}

/**
 * Take `quantity` units of an item out of a list (all when omitted). Splitting a stack creates
 * a copy with a new id; taking the whole stack removes it. Returns the taken piece.
 */
export function takeItem(list: InventoryItem[], itemId: string, quantity?: number): InventoryItem | null {
  const index = list.findIndex((it) => it.id === itemId);
  if (index < 0) return null;
  const item = list[index]!;
  const q = quantity === undefined ? item.quantity : Math.min(quantity, item.quantity);
  if (q >= item.quantity) {
    list.splice(index, 1);
    return { ...item, equipped: false };
  }
  item.quantity -= q;
  return { ...structuredClone(item), id: newId('inv'), quantity: q, equipped: false };
}

/** "Poción de curación ×2" (×1 omitted). */
export function itemLabel(name: string, quantity: number): string {
  return quantity > 1 ? `${name} ×${quantity}` : name;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Events and audiences
// ---------------------------------------------------------------------------

export function toast(
  manager: SessionManagerApi,
  session: LiveSession,
  audience: Audience,
  level: 'info' | 'success' | 'warning' | 'error',
  text: string,
): void {
  const event: SessionEvent = { type: 'toast', level, text };
  manager.emitEvent(session, event, audience);
}

/** Every session member (players + host) except `userId`. */
export function membersExcept(state: LiveState, userId: string): string[] {
  const ids = new Set<string>(Object.keys(state.players));
  ids.add(state.hostUserId);
  ids.delete(userId);
  return [...ids];
}

interface ViewCacheEntry {
  version: number;
  allowed: Set<string>;
  mode: VisibilitySettings['visionMode'];
  areas: Record<string, number[][]>;
}

const viewCache = new WeakMap<LiveSession, Map<string, ViewCacheEntry>>();

/**
 * Whether a player currently sees a point of a level (zone allowed and, in vision/explored modes,
 * inside the visible area). Cached per state version, cheap enough for drag relays.
 */
function playerViewEntry(session: LiveSession, userId: string): ViewCacheEntry {
  const state = session.state;
  let perUser = viewCache.get(session);
  if (!perUser) {
    perUser = new Map();
    viewCache.set(session, perUser);
  }
  let entry = perUser.get(userId);
  if (!entry || entry.version !== state.version) {
    const eff = effectiveVisibility(state, userId);
    const zones = session.campaign.zones;
    const limited = eff.visionMode === 'vision' || eff.visionMode === 'explored';
    entry = {
      version: state.version,
      allowed: new Set(allowedZoneIds(state, zones, userId)),
      mode: eff.visionMode,
      areas: limited ? visibleAreas(state, zones, userId) : {},
    };
    perUser.set(userId, entry);
  }
  return entry;
}

/** Whether a player currently receives the tokens of a zone (hero tokens are always visible there). */
export function playerSeesZone(session: LiveSession, userId: string, zoneId: string): boolean {
  if (session.state.status === 'lobby') return false;
  const entry = playerViewEntry(session, userId);
  return entry.mode !== 'none' && entry.allowed.has(zoneId);
}

/**
 * Whether a point of a level lies inside a fog region the DM has not revealed in this session. Players'
 * maps mask those regions (and every non-hero token in them), like the client's isHiddenByFog.
 */
export function pointUnderFog(session: LiveSession, zoneId: string, levelId: string, p: Point): boolean {
  const zone = session.campaign.zones.find((z) => z.id === zoneId);
  const level = zone?.levels.find((l) => l.id === levelId);
  if (!level || level.fogRegions.length === 0) return false;
  const revealed = new Set(session.state.zoneStates[zoneId]?.revealedFog ?? []);
  const polygons = level.fogRegions.filter((r) => !revealed.has(r.id) && r.points.length >= 6).map((r) => r.points);
  return polygons.length > 0 && pointInAnyPolygon(p, polygons);
}

/** Whether a player currently sees a point of a level: zone allowed, in sight (vision modes) and not under fog. */
export function playerSeesPoint(session: LiveSession, userId: string, zoneId: string, levelId: string, p: Point): boolean {
  if (session.state.status === 'lobby') return false;
  const entry = playerViewEntry(session, userId);
  if (entry.mode === 'none' || !entry.allowed.has(zoneId)) return false;
  if (pointUnderFog(session, zoneId, levelId, p)) return false;
  if (entry.mode === 'all') return true;
  return pointInAnyPolygon(p, entry.areas[levelId] ?? []);
}

/**
 * Whether a player sees a token on their map: the tokens buildPlayerView sends them, minus non-hero
 * tokens under an unrevealed fog region (the client masks those).
 */
export function playerSeesToken(
  session: LiveSession,
  userId: string,
  token: Pick<Token, 'kind' | 'hidden' | 'zoneId' | 'levelId' | 'x' | 'y'>,
): boolean {
  if (token.hidden) return false;
  if (token.kind === 'hero') return playerSeesZone(session, userId, token.zoneId);
  return playerSeesPoint(session, userId, token.zoneId, token.levelId, token);
}

/**
 * Visibility of a log line about something only some players may know: 'all' when there are players
 * and every one of them passes `canSee`, else 'dm' (a line reaches every player or only the DM).
 */
export function visibilityForPlayers(state: LiveState, canSee: (userId: string) => boolean): 'all' | 'dm' {
  const ids = playerIds(state);
  return ids.length > 0 && ids.every(canSee) ? 'all' : 'dm';
}

/** Log visibility for news about a non-hero token: every player must see it on the map (and pass `extra`). */
export function tokenNewsVisibility(
  session: LiveSession,
  token: Pick<Token, 'kind' | 'hidden' | 'zoneId' | 'levelId' | 'x' | 'y'>,
  extra?: (userId: string) => boolean,
): 'all' | 'dm' {
  return visibilityForPlayers(session.state, (uid) => playerSeesToken(session, uid, token) && (extra ? extra(uid) : true));
}

/**
 * Whether a player may know who a turn entry is: player and hero entries and entries without a token
 * always; a creature/NPC entry only while the player sees its token on the map (not hidden, in sight,
 * not under unrevealed fog). Same rule as the client's initiative panel.
 */
export function playerKnowsTurnEntry(session: LiveSession, userId: string, entry: TurnEntry): boolean {
  if (entry.type === 'player' || entry.heroId || !entry.tokenId) return true;
  const token = session.state.tokens[entry.tokenId];
  return token !== undefined && playerSeesToken(session, userId, token);
}

/** A turn entry as a player who must not know it receives it: same id, token and place, no identity. */
export function anonymizedTurnEntry(entry: TurnEntry): TurnEntry {
  return { ...entry, type: 'creature', name: HIDDEN_TURN_ENTRY_NAME, imageUrl: null, initiative: null };
}

/** Whether every player except `except` may see other heroes' inventories (and so does the session default). */
export function inventoriesArePublic(state: LiveState, except: ReadonlyArray<string | null>): boolean {
  if (!state.visibility.global.canSeeOthersInventory) return false;
  return playerIds(state)
    .filter((uid) => !except.includes(uid))
    .every((uid) => effectiveVisibility(state, uid).canSeeOthersInventory);
}

// ---------------------------------------------------------------------------
// Zone vision
// ---------------------------------------------------------------------------

export const ZONE_VISION_MODES: readonly ZoneVision['mode'][] = ['all', 'explored', 'vision'];
export const ZONE_VISION_MAX_RADIUS = 60;
const DEFAULT_ZONE_VISION_RADIUS = defaultVisibility().visionRadius;

/** Stored zone vision (campaign document or saved state) -> valid ZoneVision, or null. Never throws. */
export function sanitizeZoneVision(value: unknown): ZoneVision | null {
  if (!isPlainObject(value)) return null;
  const mode = value.mode;
  if (typeof mode !== 'string' || !(ZONE_VISION_MODES as readonly string[]).includes(mode)) return null;
  const radius = typeof value.radius === 'number' && Number.isFinite(value.radius) ? clamp(Math.round(value.radius), 0, ZONE_VISION_MAX_RADIUS) : DEFAULT_ZONE_VISION_RADIUS;
  const cone = typeof value.cone === 'number' && Number.isFinite(value.cone) ? clamp(Math.round(value.cone), 10, 360) : 360;
  return { mode: mode as ZoneVision['mode'], radius, cone };
}

/** Zone vision from an untrusted payload (null = back to the zone default). Throws a Spanish error. */
export function parseZoneVision(value: unknown): ZoneVision | null {
  if (value === null || value === undefined) return null;
  const obj = plainObject(value, 'visión de la zona');
  return {
    mode: oneOf(ZONE_VISION_MODES, obj.mode, 'modo de visión'),
    radius: obj.radius === undefined ? DEFAULT_ZONE_VISION_RADIUS : reqInt(obj.radius, 'radio de visión', 0, ZONE_VISION_MAX_RADIUS),
    cone: obj.cone === undefined ? 360 : reqInt(obj.cone, 'cono de visión', 10, 360),
  };
}

/** zoneId -> default vision of each campaign zone (what the server copies into state.zoneVision). */
export function zoneVisionMap(zones: Zone[]): Record<string, ZoneVision | null> {
  const out: Record<string, ZoneVision | null> = {};
  for (const zone of zones) out[zone.id] = sanitizeZoneVision(zone.vision);
  return out;
}

function cellsText(n: number): string {
  return n === 1 ? '1 casilla' : `${n} casillas`;
}

/** "Solo lo que tiene delante (3 casillas, cono de 90°)" style label. */
export function zoneVisionLabel(vision: ZoneVision | null): string {
  if (!vision || vision.mode === 'all') return 'todo visible';
  const cone = vision.cone < 360 ? `, cono de ${vision.cone}°` : '';
  const what = vision.mode === 'explored' ? 'lo explorado' : 'lo que tiene delante';
  return `solo ${what} (${cellsText(vision.radius)}${cone})`;
}

// ---------------------------------------------------------------------------
// Turn economy
// ---------------------------------------------------------------------------

/** Inside mutate: add to (or subtract from) what a hero spent this turn. Values never go below 0. */
export function addUsage(state: LiveState, heroId: string, delta: Partial<TurnUsage>): TurnUsage {
  const current = usageOf(state, heroId);
  const next: TurnUsage = {
    moved: Math.max(0, current.moved + (delta.moved ?? 0)),
    actions: Math.max(0, current.actions + (delta.actions ?? 0)),
    bonusMove: Math.max(0, current.bonusMove + (delta.bonusMove ?? 0)),
    bonusActions: Math.max(0, current.bonusActions + (delta.bonusActions ?? 0)),
  };
  state.turn.usage ??= {};
  state.turn.usage[heroId] = next;
  return next;
}

/** Inside mutate: a hero's turn starts again (nothing spent, no DM bonus). */
export function resetUsage(state: LiveState, heroId: string): void {
  if (state.turn.usage) delete state.turn.usage[heroId];
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance in px from a point to the nearest point of a wall polyline (Infinity without segments). */
export function distanceToWall(p: Point, wall: Pick<Wall, 'points'>): number {
  const pts = wall.points;
  let best = Number.POSITIVE_INFINITY;
  if (pts.length === 2 && Number.isFinite(pts[0]) && Number.isFinite(pts[1])) return Math.hypot(p.x - pts[0]!, p.y - pts[1]!);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const a = { x: pts[i]!, y: pts[i + 1]! };
    const b = { x: pts[i + 2]!, y: pts[i + 3]! };
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
    best = Math.min(best, pointSegmentDistance(p, a, b));
  }
  return best;
}
