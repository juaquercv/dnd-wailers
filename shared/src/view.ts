import type { Zone } from './types/campaign';
import type { HeroSheet, LiveState, SessionZone, Token, TurnEntry, VisibilitySettings } from './types/session';
import { blockingSegments, cellsToPx, computeVisibilityPolygon, pointInAnyPolygon, type Segment } from './vision';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Global settings merged with the player's perPlayer overrides. */
export function effectiveVisibility(state: LiveState, userId: string): VisibilitySettings {
  const global = state.visibility.global;
  const overrides = state.visibility.perPlayer[userId];
  if (!overrides) return { ...global };
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([key, value]) => value !== undefined && value !== null && key in global),
  ) as Partial<VisibilitySettings>;
  // sceneImageUrl may legitimately be overridden with null.
  if ('sceneImageUrl' in overrides && overrides.sceneImageUrl === null) defined.sceneImageUrl = null;
  return { ...global, ...defined };
}

/** True when the hero token belongs to the player (token owner or the hero selected by the player). */
export function isOwnHeroToken(state: LiveState, token: Token, userId: string): boolean {
  if (token.kind !== 'hero') return false;
  if (token.ownerUserId === userId) return true;
  const selected = state.players[userId]?.heroId ?? null;
  return token.heroId !== null && selected === token.heroId;
}

/** True when the hero sheet is the player's own: selected by them, or owned by them and not played by someone else. */
export function isOwnHero(state: LiveState, hero: HeroSheet, userId: string): boolean {
  if (state.players[userId]?.heroId === hero.id) return true;
  if (hero.ownerId !== userId) return false;
  return !Object.values(state.players).some((p) => p.userId !== userId && p.heroId === hero.id);
}

/**
 * Vision sources for a player: own hero tokens (even when hidden), plus every other non-hidden hero
 * token when sharedVision. Another player's hidden hero is never a source: the player does not receive
 * that token, so server and client compute the same areas.
 */
export function visionTokensFor(state: LiveState, userId: string): Token[] {
  const eff = effectiveVisibility(state, userId);
  return Object.values(state.tokens).filter(
    (t) => t.kind === 'hero' && (isOwnHeroToken(state, t, userId) || (eff.sharedVision && !t.hidden)),
  );
}

/**
 * Zone ids a player may receive: zones containing the vision tokens (visionTokensFor), plus every
 * zone when canSeeOtherZones. Empty when visionMode = 'none'.
 */
export function allowedZoneIds(state: LiveState, zones: Zone[], userId: string): string[] {
  const eff = effectiveVisibility(state, userId);
  if (eff.visionMode === 'none') return [];
  const ids = new Set<string>();
  if (eff.canSeeOtherZones) for (const z of zones) ids.add(z.id);
  for (const t of visionTokensFor(state, userId)) ids.add(t.zoneId);
  return [...ids];
}

/**
 * Vision radius in grid cells for a token seen through by `userId`: the explicit perPlayer visionRadius
 * of that player when the DM set one, else hero data.visionCells when set, else the effective (global)
 * radius. Without `userId` the perPlayer override is not considered.
 */
export function visionCellsFor(state: LiveState, token: Token, eff: VisibilitySettings, userId?: string): number {
  const override = userId !== undefined ? state.visibility.perPlayer[userId]?.visionRadius : undefined;
  if (typeof override === 'number' && Number.isFinite(override)) return Math.max(0, override);
  const hero = token.heroId ? state.heroes[token.heroId] : undefined;
  const cells = hero?.data.visionCells;
  if (typeof cells === 'number' && Number.isFinite(cells)) return Math.max(0, cells);
  return Math.max(0, eff.visionRadius);
}

/**
 * Current visibility polygons per levelId for a player, from visionTokensFor: radius = visionCellsFor
 * (perPlayer radius, else hero data.visionCells, else global radius), converted with the level grid; cone and
 * token.facing; blocking walls honoring zoneStates[zoneId].doors. {} when visionMode is 'all' or 'none'.
 */
export function visibleAreas(state: LiveState, zones: Zone[], userId: string): Record<string, number[][]> {
  const eff = effectiveVisibility(state, userId);
  if (eff.visionMode === 'all' || eff.visionMode === 'none') return {};
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const segmentCache = new Map<string, Segment[]>();
  const out: Record<string, number[][]> = {};
  for (const token of visionTokensFor(state, userId)) {
    const zone = zoneById.get(token.zoneId);
    const level = zone?.levels.find((l) => l.id === token.levelId);
    if (!zone || !level) continue;
    const cacheKey = `${zone.id}:${level.id}`;
    let segments = segmentCache.get(cacheKey);
    if (!segments) {
      segments = blockingSegments(level.walls, state.zoneStates[zone.id]?.doors);
      segmentCache.set(cacheKey, segments);
    }
    const radius = cellsToPx(visionCellsFor(state, token, eff, userId), level.grid);
    const polygon = computeVisibilityPolygon(
      { x: token.x, y: token.y, radius, cone: eff.visionCone, facing: token.facing },
      segments,
      { width: level.background.width, height: level.background.height },
    );
    if (polygon.length >= 6) (out[level.id] ??= []).push(polygon);
  }
  return out;
}

/** Approximate HP ratio for 'bar' mode: rounded to 0.1, but a living creature never shows an empty bar. */
function approximateRatio(token: Token): number | null {
  let ratio: number | null = null;
  if (token.hp !== null && token.maxHp !== null && token.maxHp > 0) ratio = clamp01(token.hp / token.maxHp);
  else if (token.hpRatio !== null && Number.isFinite(token.hpRatio)) ratio = clamp01(token.hpRatio);
  if (ratio === null) return null;
  const rounded = Math.round(ratio * 10) / 10;
  return ratio > 0 && rounded === 0 ? 0.1 : rounded;
}

function tokenForPlayer(token: Token, eff: VisibilitySettings): Token {
  const t = structuredClone(token);
  t.notes = '';
  t.loot = [];
  if (t.kind === 'creature' || t.kind === 'npc') {
    if (!eff.canSeeEnemyDetails) {
      t.stats = null;
      t.ac = null;
    }
    if (eff.enemyHp === 'bar') {
      t.hpRatio = approximateRatio(token);
      t.hp = null;
      t.maxHp = null;
      t.tempHp = 0;
    } else if (eff.enemyHp === 'hidden') {
      t.hp = null;
      t.maxHp = null;
      t.hpRatio = null;
      t.tempHp = 0;
    }
  }
  return t;
}

/** Name players see for an initiative entry whose creature is hidden from them. */
export const HIDDEN_TURN_ENTRY_NAME = 'Criatura desconocida';

/**
 * Initiative entry as a player receives it. A non-hero entry linked to a hidden token keeps its id,
 * tokenId and position (currentIndex stays valid) but loses name, portrait, type and roll.
 */
function turnEntryForPlayer(state: LiveState, entry: TurnEntry): TurnEntry {
  const copy = structuredClone(entry);
  if (entry.type === 'player' || entry.heroId || !entry.tokenId) return copy;
  if (state.tokens[entry.tokenId]?.hidden !== true) return copy;
  return { ...copy, type: 'creature', name: HIDDEN_TURN_ENTRY_NAME, imageUrl: null, initiative: null };
}

/**
 * Pure filter used by the server for every player and by the DM client for "Ver como jugador X".
 * If userId is the host, returns the state unchanged. Rules for players:
 *  - tokens: drop hidden (except the player's own hero token); drop tokens outside allowedZoneIds;
 *    in 'vision'/'explored' drop non-hero tokens whose center is outside visibleAreas of their level;
 *    in 'none' drop all tokens.
 *  - enemy tokens (creature/npc): enemyHp 'exact' keeps hp/maxHp; 'bar' -> hp/maxHp null and hpRatio
 *    rounded to 0.1; 'hidden' -> hp/maxHp/hpRatio null. stats null unless canSeeEnemyDetails.
 *    notes '' and loot [] for every token.
 *  - heroes: other players' heroes keep name/image/level/hp/statuses/resources; inventory [] and gold 0
 *    unless canSeeOthersInventory. Own hero untouched.
 *  - explored: only own entry. rollRequests: only own. trades: only those involving the player.
 *  - turn.order: [] unless canSeeInitiative (currentIndex/round kept); entries of hidden creatures are
 *    anonymized ('Criatura desconocida', no portrait, no initiative) but keep their place.
 *  - visibility.perPlayer: only own entry. turnOffer: null unless own.
 *  - projection: null unless targets is 'all' or includes the player.
 *  - zoneStates kept. Never mutates the input.
 * Also: while the session is in the lobby players receive no tokens (campaign hidden until start);
 * enemy AC is part of the stat sheet (hidden without canSeeEnemyDetails); other heroes' private notes are cleared.
 */
export function buildPlayerView(state: LiveState, zones: Zone[], userId: string): LiveState {
  if (userId === state.hostUserId) return state;
  const eff = effectiveVisibility(state, userId);

  const tokens: Record<string, Token> = {};
  if (state.status !== 'lobby' && eff.visionMode !== 'none') {
    const allowed = new Set(allowedZoneIds(state, zones, userId));
    const limited = eff.visionMode === 'vision' || eff.visionMode === 'explored';
    const areas = limited ? visibleAreas(state, zones, userId) : {};
    for (const [id, token] of Object.entries(state.tokens)) {
      if (token.hidden && !isOwnHeroToken(state, token, userId)) continue;
      if (!allowed.has(token.zoneId)) continue;
      if (limited && token.kind !== 'hero' && !pointInAnyPolygon({ x: token.x, y: token.y }, areas[token.levelId] ?? [])) continue;
      tokens[id] = tokenForPlayer(token, eff);
    }
  }

  const heroes: Record<string, HeroSheet> = {};
  for (const [id, hero] of Object.entries(state.heroes)) {
    const copy = structuredClone(hero);
    if (!isOwnHero(state, hero, userId)) {
      copy.data.notes = '';
      if (!eff.canSeeOthersInventory) {
        copy.data.inventory = [];
        copy.data.gold = 0;
      }
    }
    heroes[id] = copy;
  }

  const ownExplored = state.explored[userId];
  const ownPerPlayer = state.visibility.perPlayer[userId];
  const projection = state.projection;
  const projectionVisible =
    projection !== null && (projection.targets === 'all' || (Array.isArray(projection.targets) && projection.targets.includes(userId)));

  return {
    ...state,
    players: structuredClone(state.players),
    heroes,
    tokens,
    instantiatedZones: [...state.instantiatedZones],
    turn: {
      ...state.turn,
      order: eff.canSeeInitiative ? state.turn.order.map((entry) => turnEntryForPlayer(state, entry)) : [],
    },
    zoneStates: structuredClone(state.zoneStates),
    visibility: {
      global: { ...state.visibility.global },
      perPlayer: ownPerPlayer ? { [userId]: { ...ownPerPlayer } } : {},
    },
    options: { ...state.options },
    explored: ownExplored ? { [userId]: { ...ownExplored } } : {},
    dmView: state.dmView ? { ...state.dmView } : null,
    rollRequests: state.rollRequests.filter((r) => r.targetUserId === userId).map((r) => structuredClone(r)),
    turnOffer: state.turnOffer && state.turnOffer.userId === userId ? structuredClone(state.turnOffer) : null,
    audio: structuredClone(state.audio),
    projection: projectionVisible ? structuredClone(projection) : null,
    trades: state.trades.filter((t) => t.fromUserId === userId || t.toUserId === userId).map((t) => structuredClone(t)),
  };
}

/**
 * Player-safe zone copy: removes 'notes' layer elements and NoteElements, hidden elements and
 * TokenElements (live tokens replace them), clears zone.notes. Fog regions are kept (client masks them).
 */
export function filterZoneForPlayer(zone: SessionZone): SessionZone {
  const copy = structuredClone(zone);
  copy.notes = '';
  copy.levels = copy.levels.map((level) => ({
    ...level,
    elements: level.elements.filter((el) => el.layer !== 'notes' && el.type !== 'note' && el.type !== 'token' && !el.hidden),
  }));
  return copy;
}

/** HP for display: hero tokens read the hero sheet; others the token. ratio = hp/maxHp or token.hpRatio. */
export function tokenHp(
  state: LiveState,
  token: Token,
): { hp: number | null; maxHp: number | null; temp: number; ratio: number | null } {
  if (token.kind === 'item') return { hp: null, maxHp: null, temp: 0, ratio: null };
  if (token.kind === 'hero' && token.heroId) {
    const hero = state.heroes[token.heroId];
    if (hero) {
      const { current, max, temp } = hero.data.hp;
      return { hp: current, maxHp: max, temp: temp || 0, ratio: max > 0 ? clamp01(current / max) : null };
    }
  }
  const { hp, maxHp } = token;
  let ratio: number | null = null;
  if (hp !== null && maxHp !== null && maxHp > 0) ratio = clamp01(hp / maxHp);
  else if (token.hpRatio !== null && Number.isFinite(token.hpRatio)) ratio = clamp01(token.hpRatio);
  return { hp, maxHp, temp: token.tempHp || 0, ratio };
}
