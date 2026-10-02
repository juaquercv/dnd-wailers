import {
  RARITY_INFO,
  checkPlayerMove,
  economyApplies,
  effectiveVisibility,
  isHeroTurn,
  isOwnHeroToken,
  moveBudget,
  newId,
  normalizeDeg,
  type FxEvent,
  type LibraryEntry,
  type SessionEvent,
  type SpawnPoint,
  type Token,
  type TokenStats,
  type TransitionElement,
  type ZoneLevel,
} from '@wailers/shared';
import { isPlainObject } from '../../services/serializers';
import {
  addUsage,
  clamp,
  clampToLevel,
  colorValue,
  createHeroToken,
  defaultLevel,
  effectiveFor,
  entryEdgePoint,
  entryToToken,
  findSoundByKeyword,
  findTransitionTarget,
  formatCr,
  freeCellsAround,
  getLevel,
  gridSize,
  heroTokenOf,
  idList,
  joinNames,
  levelCenter,
  levelSize,
  loadEntry,
  longText,
  markEntryUsed,
  membersExcept,
  neighborDirection,
  numberedNames,
  optNum,
  playerIds,
  playerSeesToken,
  playerSeesZone,
  playerSeesPoint,
  plainObject,
  primaryCategoryName,
  reqBool,
  reqInt,
  reqNum,
  reqText,
  requireLevel,
  requirePlaying,
  requireToken,
  requireZone,
  sizeLabel,
  snapPoint,
  statusLabel,
  statusValue,
  syncHeroTokens,
  tokenCellsForEntry,
  tokenNewsVisibility,
  urlOrNull,
  visibilityForPlayers,
  zoneLabel,
  type NeighborDirection,
  type Point,
} from '../helpers';
import {
  HandlerError,
  type HandlerCtx,
  type HandlerModule,
  type LiveSession,
  type LogInput,
  type MutateOptions,
  type SessionManagerApi,
} from '../types';
import { announceTurnStart, landAfterRemoval, removeTurnEntries, turnPointer, type TurnLanding } from './turns';

/*
 * Token handlers: spawning from the library, hero placement, movement (with drag previews),
 * transfers between zones/levels, quick HP/status edits, removal and duplication.
 * HP/status changes are always explicit DM actions; nothing is derived from dice.
 */

const NO_MOVE = 'No puedes mover esta ficha';

/**
 * Log visibility for a token event: hero news are for the whole party; other tokens are only news
 * for the players when every one of them currently sees the token (per-player settings and zones).
 */
function tokenLogVisibility(
  session: LiveSession,
  token: Pick<Token, 'kind' | 'hidden' | 'zoneId' | 'levelId' | 'x' | 'y'>,
  extra?: (userId: string) => boolean,
): 'all' | 'dm' {
  if (token.kind === 'hero') return 'all';
  return tokenNewsVisibility(session, token, extra);
}

function canPlayerMoveToken(ctx: HandlerCtx, token: Token): boolean {
  const state = ctx.session.state;
  return isOwnHeroToken(state, token, ctx.userId) && effectiveFor(state, ctx.userId).canMoveOwnToken;
}

/** Hero whose turn economy a player's move spends: the hero of the token, else the player's selected hero. */
function economyHeroId(ctx: HandlerCtx, token: Token): string | null {
  const state = ctx.session.state;
  const heroId = token.heroId ?? state.players[ctx.userId]?.heroId ?? null;
  return heroId && state.heroes[heroId] ? heroId : null;
}

// ---------------------------------------------------------------------------
// token:spawn
// ---------------------------------------------------------------------------

async function bossFx(ctx: HandlerCtx, entry: LibraryEntry<'creature'> | LibraryEntry<'item'>): Promise<FxEvent> {
  const parts: string[] = [];
  if (entry.kind === 'creature') {
    const type = await primaryCategoryName(entry);
    if (type) parts.push(type);
    else {
      const size = sizeLabel(entry);
      if (size) parts.push(size);
    }
    const cr = formatCr(entry.cr);
    if (cr) parts.push(`Desafío ${cr}`);
  } else if (entry.rarity) {
    parts.push(RARITY_INFO[entry.rarity].label);
  }
  return {
    kind: 'boss',
    name: entry.name,
    subtitle: parts.length > 0 ? parts.join(' · ') : null,
    imageUrl: entry.imageUrl,
    soundUrl: findSoundByKeyword(ctx.session, 'rugido')?.url ?? null,
  };
}

async function spawnTokens(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { entryId: string; zoneId: string; levelId: string; x: number; y: number; hidden?: boolean; count?: number; dramatic?: boolean },
): Promise<string[]> {
  const { zone, level } = requireLevel(manager, ctx.session, payload.zoneId, payload.levelId);
  const origin = { x: reqNum(payload.x, 'x'), y: reqNum(payload.y, 'y') };
  const hidden = payload.hidden === undefined ? false : reqBool(payload.hidden, 'oculto');
  const dramatic = payload.dramatic === undefined ? false : reqBool(payload.dramatic, 'entrada dramática');
  const count = payload.count === undefined || payload.count === null ? 1 : reqInt(payload.count, 'cantidad', 1, 20);
  const entry = await loadEntry(payload.entryId, ['creature', 'item'] as const, 'Solo se pueden colocar enemigos, NPCs u objetos');
  const fx = dramatic ? await bossFx(ctx, entry) : null;

  // The campaign may have changed while the entry was loading.
  const current = getLevel(ctx.session, zone.id, level.id);
  if (!current) throw new HandlerError('Ese nivel ya no existe en la zona');

  const cells = tokenCellsForEntry(entry);
  const what = count === 1 ? entry.name : `${count} × ${entry.name}`;
  const ids: string[] = [];
  const log: LogInput = {
    type: 'system',
    text: `${count === 1 ? 'Aparece' : 'Aparecen'} ${what}${hidden ? ' (oculto)' : ''} en ${zoneLabel(zone, current.level)}`,
    actorUserId: ctx.userId,
    visibility: 'dm',
  };

  manager.mutate(
    ctx.session,
    (s) => {
      manager.ensureZoneInstantiated(ctx.session, s, zone.id);
      const positions = freeCellsAround(s, zone.id, current.level, origin, count, cells);
      const names = numberedNames(s, entry.name, count);
      const created: Token[] = [];
      positions.forEach((pos, i) => {
        const token = entryToToken(entry, { zoneId: zone.id, levelId: current.level.id, x: pos.x, y: pos.y }, { hidden, name: names[i], cells });
        s.tokens[token.id] = token;
        ids.push(token.id);
        created.push(token);
      });
      // A dramatic entrance is shown to everyone; otherwise only news when every player sees the new tokens.
      if (!hidden) {
        log.visibility = dramatic ? 'all' : visibilityForPlayers(s, (uid) => created.some((t) => playerSeesToken(ctx.session, uid, t)));
      }
    },
    { log },
  );

  // A hidden dramatic entrance is only previewed by the DM: players must not learn about it yet.
  if (fx) manager.emitEvent(ctx.session, { type: 'fx', fx }, hidden ? { kind: 'dm' } : { kind: 'all' });
  void markEntryUsed(entry.id, ctx.session.state.campaignId, ctx.userId);
  return ids;
}

// ---------------------------------------------------------------------------
// token:placeHeroes
// ---------------------------------------------------------------------------

function resolvePlacementTarget(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  target: unknown,
): { point: Point; zoneId: string; level: ZoneLevel; label: string } {
  if (target !== undefined && target !== null) {
    const t = plainObject(target, 'destino');
    const { zone, level } = requireLevel(manager, ctx.session, t.zoneId, t.levelId);
    return { point: clampToLevel(level, { x: reqNum(t.x, 'x'), y: reqNum(t.y, 'y') }), zoneId: zone.id, level, label: zoneLabel(zone, level) };
  }
  const spawn = ctx.session.campaign.spawn;
  if (spawn) {
    const loc = getLevel(ctx.session, spawn.zoneId, spawn.levelId);
    if (loc) return { point: clampToLevel(loc.level, spawn), zoneId: loc.zone.id, level: loc.level, label: zoneLabel(loc.zone, loc.level) };
  }
  const zone = ctx.session.campaign.zones.find((z) => z.parentZoneId === null) ?? ctx.session.campaign.zones[0];
  if (!zone) throw new HandlerError('La campaña no tiene ninguna zona');
  const level = defaultLevel(zone);
  return { point: levelCenter(level), zoneId: zone.id, level, label: zoneLabel(zone, level) };
}

function placeHeroes(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { userIds?: string[]; target?: { zoneId: string; levelId: string; x: number; y: number } },
): null {
  const state = ctx.session.state;
  const requested = payload.userIds === undefined || payload.userIds === null ? playerIds(state) : idList(payload.userIds, 'jugadores', 1, 50);
  const userIds = requested.filter((uid) => {
    const heroId = state.players[uid]?.heroId;
    return uid !== state.hostUserId && !!heroId && !!state.heroes[heroId];
  });
  if (userIds.length === 0) throw new HandlerError('Ninguno de esos jugadores tiene héroe todavía');
  const target = resolvePlacementTarget(manager, ctx, payload.target);
  const names = userIds.map((uid) => state.heroes[state.players[uid]!.heroId!]!.name);

  manager.mutate(
    ctx.session,
    (s) => {
      manager.ensureZoneInstantiated(ctx.session, s, target.zoneId);
      const moving = new Set<string>();
      for (const uid of userIds) {
        const token = heroTokenOf(s, uid);
        if (token) moving.add(token.id);
      }
      const positions = freeCellsAround(s, target.zoneId, target.level, target.point, userIds.length, 1, moving);
      userIds.forEach((uid, i) => {
        const player = s.players[uid];
        const hero = player?.heroId ? s.heroes[player.heroId] : undefined;
        if (!player || !hero) return;
        const pos = positions[i]!;
        const at: SpawnPoint = { zoneId: target.zoneId, levelId: target.level.id, x: pos.x, y: pos.y };
        const existing = heroTokenOf(s, uid);
        let tokenId: string;
        if (existing && existing.heroId === hero.id) {
          existing.zoneId = at.zoneId;
          existing.levelId = at.levelId;
          existing.x = at.x;
          existing.y = at.y;
          existing.ownerUserId = uid;
          existing.color = player.color || existing.color;
          tokenId = existing.id;
        } else {
          if (existing) delete s.tokens[existing.id];
          const token = createHeroToken(s, hero, uid, at);
          s.tokens[token.id] = token;
          tokenId = token.id;
        }
        for (const entry of s.turn.order) {
          if (entry.type === 'player' && entry.heroId === hero.id) entry.tokenId = tokenId;
        }
      });
    },
    {
      zones: true,
      log: {
        type: 'move',
        text: `${joinNames(names)} ${names.length > 1 ? 'aparecen' : 'aparece'} en ${target.label}`,
        actorUserId: ctx.userId,
        visibility: 'all',
      },
    },
  );
  return null;
}

// ---------------------------------------------------------------------------
// token:move / token:drag
// ---------------------------------------------------------------------------

function moveToken(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string; x: number; y: number; facing?: number }): null {
  const token = requireToken(ctx.session.state, payload.tokenId);
  const x = reqNum(payload.x, 'x');
  const y = reqNum(payload.y, 'y');
  const facing = optNum(payload.facing, 'orientación');
  if (!ctx.isDm) {
    requirePlaying(ctx);
    if (!canPlayerMoveToken(ctx, token)) throw new HandlerError(NO_MOVE);
  }
  const loc = getLevel(ctx.session, token.zoneId, token.levelId);
  const point = loc ? snapPoint(loc.level, { x, y }, token.cells) : { x, y };
  // In combat a player's hero moves only on its turn and within its movement per turn (the DM is never limited).
  const heroId = !ctx.isDm && loc ? economyHeroId(ctx, token) : null;
  manager.mutate(ctx.session, (s) => {
    const t = s.tokens[token.id];
    if (!t) return;
    // Turning in place (same position, new facing) is free, also while waiting for the turn.
    const samePoint = (p: Point): boolean => Math.abs(p.x - t.x) < 0.5 && Math.abs(p.y - t.y) < 0.5;
    if (facing !== undefined && (samePoint({ x, y }) || samePoint(point))) {
      t.facing = normalizeDeg(facing);
      return;
    }
    if (heroId && loc && economyApplies(s)) {
      const check = checkPlayerMove(s, heroId, { x: t.x, y: t.y }, point, loc.level.grid);
      if (!check.ok) throw new HandlerError(check.reason);
      if (check.cost > 0) addUsage(s, heroId, { moved: check.cost });
    }
    t.x = point.x;
    t.y = point.y;
    if (facing !== undefined) t.facing = normalizeDeg(facing);
  });
  return null;
}

function dragToken(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string; x: number; y: number }): null {
  const state = ctx.session.state;
  const token = requireToken(state, payload.tokenId);
  const x = reqNum(payload.x, 'x');
  const y = reqNum(payload.y, 'y');
  if (!ctx.isDm) {
    requirePlaying(ctx);
    if (!canPlayerMoveToken(ctx, token)) throw new HandlerError(NO_MOVE);
    // A move the turn economy would reject is not previewed to the others.
    const heroId = economyHeroId(ctx, token);
    if (heroId && economyApplies(state) && (!isHeroTurn(state, heroId) || moveBudget(state, heroId).left <= 0)) return null;
  }
  const recipients = membersExcept(state, ctx.userId).filter((uid) => {
    if (uid === state.hostUserId) return true;
    if (token.hidden) return false;
    if (token.kind === 'hero') return playerSeesZone(ctx.session, uid, token.zoneId);
    return playerSeesPoint(ctx.session, uid, token.zoneId, token.levelId, { x, y });
  });
  if (recipients.length === 0) return null;
  const event: SessionEvent = { type: 'tokenDrag', tokenId: token.id, x, y, userId: ctx.userId };
  manager.emitEvent(ctx.session, event, { kind: 'users', userIds: recipients });
  return null;
}

// ---------------------------------------------------------------------------
// token:moveMany (DM)
// ---------------------------------------------------------------------------

function moveManyTokens(manager: SessionManagerApi, ctx: HandlerCtx, payload: { moves: { tokenId: string; x: number; y: number }[] }): null {
  const state = ctx.session.state;
  if (!Array.isArray(payload.moves)) throw new HandlerError('Valor no válido para «movimientos»');
  if (payload.moves.length === 0) return null;
  if (payload.moves.length > 200) throw new HandlerError('Demasiadas fichas a la vez');
  const targets = new Map<string, Point>();
  for (const raw of payload.moves) {
    const move = plainObject(raw, 'movimiento');
    const token = requireToken(state, move.tokenId);
    const loc = getLevel(ctx.session, token.zoneId, token.levelId);
    const p = { x: reqNum(move.x, 'x'), y: reqNum(move.y, 'y') };
    targets.set(token.id, loc ? snapPoint(loc.level, p, token.cells) : p);
  }
  manager.mutate(ctx.session, (s) => {
    for (const [tokenId, point] of targets) {
      const t = s.tokens[tokenId];
      if (!t) continue;
      t.x = point.x;
      t.y = point.y;
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// token:transfer
// ---------------------------------------------------------------------------

/** How far (cells) outside a door/stairs element or from a zone edge a player's hero may still use it. */
const PASSAGE_REACH_CELLS = 1;
/** Players see the arrow to a neighbor zone within 2 cells of that edge (client EdgeNavigator). */
const EDGE_REACH_CELLS = 2 + PASSAGE_REACH_CELLS;

/** Whether p lies inside the (rotated) rectangle of a transition element, grown by `margin` px. */
function pointNearTransition(p: Point, el: TransitionElement, margin: number): boolean {
  const rad = (-(el.rotation || 0) * Math.PI) / 180;
  const dx = p.x - el.x;
  const dy = p.y - el.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= Math.max(8, el.width) / 2 + margin && Math.abs(ly) <= Math.max(8, el.height) / 2 + margin;
}

/** Visible transition of `level` leading to the zone/level whose area the hero stands on (or right next to). */
function transitionUnderHero(level: ZoneLevel, hero: Point, zoneId: string, levelId: string): TransitionElement | null {
  const margin = PASSAGE_REACH_CELLS * gridSize(level);
  for (const el of level.elements) {
    if (el.type !== 'transition' || el.hidden || !el.target) continue;
    if (el.target.zoneId !== zoneId || el.target.levelId !== levelId) continue;
    if (pointNearTransition(hero, el, margin)) return el;
  }
  return null;
}

/** Whether a point is close enough to an edge of the level to cross to the neighbor zone there. */
function nearLevelEdge(level: ZoneLevel, p: Point, direction: NeighborDirection): boolean {
  const { width, height } = levelSize(level);
  const distance = direction === 'left' ? p.x : direction === 'right' ? width - p.x : direction === 'up' ? p.y : height - p.y;
  return distance <= EDGE_REACH_CELLS * gridSize(level);
}

function transferTokens(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { tokenIds: string[]; zoneId: string; levelId: string; x?: number; y?: number },
): null {
  const state = ctx.session.state;
  const tokenIds = idList(payload.tokenIds, 'fichas', 1, 100);
  const tokens = tokenIds.map((id) => requireToken(state, id));
  const first = tokens[0]!;
  const fromLoc = getLevel(ctx.session, first.zoneId, first.levelId);
  const zone = requireZone(manager, ctx.session, payload.zoneId);
  if (zone.levels.length === 0) throw new HandlerError('Esa zona no tiene niveles');
  const neighbor = fromLoc && fromLoc.zone.id !== zone.id ? neighborDirection(fromLoc.zone, zone.id) : null;
  // Neighbor edges join zones at their default (ground) level: from another level a player takes the stairs first.
  const onGround = fromLoc !== null && fromLoc.level.id === defaultLevel(fromLoc.zone).id;
  const direction = neighbor && (ctx.isDm || onGround) ? neighbor : null;

  // An empty level id (e.g. a player travelling to a zone they do not know yet) picks the level a
  // neighbor edge or a transition of the current level leads to, else the zone's default level.
  let level: ZoneLevel;
  const rawLevelId: unknown = payload.levelId;
  if (rawLevelId === undefined || rawLevelId === null || rawLevelId === '') {
    const transition = !direction && fromLoc ? findTransitionTarget(fromLoc.level, zone.id, null, ctx.isDm) : null;
    level = (transition && zone.levels.find((l) => l.id === transition.levelId)) || defaultLevel(zone);
  } else {
    level = requireLevel(manager, ctx.session, zone.id, payload.levelId).level;
  }
  let x = optNum(payload.x, 'x');
  let y = optNum(payload.y, 'y');
  let transitionTarget = fromLoc ? findTransitionTarget(fromLoc.level, zone.id, level.id, ctx.isDm) : null;
  // Hero whose movement this transfer spends (a player's plain move on the same level, in combat).
  let costHeroId: string | null = null;

  if (!ctx.isDm) {
    requirePlaying(ctx);
    if (tokens.length !== 1 || !canPlayerMoveToken(ctx, first)) throw new HandlerError(NO_MOVE);
    // Doors, stairs and zone edges are interactions (no movement cost), but in combat only on the hero's turn.
    const heroId = economyHeroId(ctx, first);
    const limited = heroId !== null && economyApplies(state);
    if (limited && !isHeroTurn(state, heroId)) {
      throw new HandlerError('Combate en curso: espera a tu turno para moverte');
    }
    // A player passes through a door/stairs only standing on it, and to a neighbor zone only next to that edge.
    const passage = fromLoc ? transitionUnderHero(fromLoc.level, first, zone.id, level.id) : null;
    const sameLevel = first.zoneId === zone.id && first.levelId === level.id;
    const neighborReachable = direction !== null && level.id === defaultLevel(zone).id;
    const viaNeighbor = neighborReachable && fromLoc !== null && nearLevelEdge(fromLoc.level, first, direction);
    if (passage) {
      // Passing through a door/stairs always lands on its target point.
      transitionTarget = passage.target;
      x = undefined;
      y = undefined;
    } else if (!sameLevel && !viaNeighbor) {
      if (neighborReachable) throw new HandlerError('Acércate al borde del mapa para pasar a la zona vecina');
      if (transitionTarget) throw new HandlerError('Acerca tu ficha a la puerta o escalera para usarla');
      throw new HandlerError('Tu ficha no puede llegar a esa zona desde aquí');
    } else if (sameLevel && limited) {
      // On the same level it is a plain move: in combat it spends movement like token:move.
      costHeroId = heroId;
    }
  }

  // Default destination: explicit point > transition target > entry edge of a neighbor > level center.
  let anchor: Point;
  if (x !== undefined && y !== undefined) {
    anchor = clampToLevel(level, { x, y });
  } else if (transitionTarget) {
    anchor = clampToLevel(level, transitionTarget);
  } else if (direction && fromLoc) {
    const from = levelSize(fromLoc.level);
    const along = direction === 'left' || direction === 'right' ? first.y / Math.max(1, from.height) : first.x / Math.max(1, from.width);
    anchor = entryEdgePoint(level, direction, along);
  } else {
    anchor = levelCenter(level);
  }

  const heroNames: string[] = [];
  const otherNames: string[] = [];
  let heroChangedZone = false;
  for (const t of tokens) {
    const changesZone = t.zoneId !== zone.id;
    const changesLevel = t.levelId !== level.id;
    if (changesZone || changesLevel) {
      if (t.kind === 'hero' && !t.hidden) heroNames.push(t.name);
      else otherNames.push(t.name);
    }
    if (changesZone && t.kind === 'hero') heroChangedZone = true;
  }

  const logs: LogInput[] = [];
  const crossZone = tokens.some((t) => t.zoneId !== zone.id);
  const describe = (names: string[]): string =>
    crossZone
      ? `${joinNames(names)} ${names.length > 1 ? 'entran' : 'entra'} en ${zoneLabel(zone, level)}`
      : `${joinNames(names)} ${names.length > 1 ? 'pasan' : 'pasa'} a ${level.name}`;
  if (heroNames.length > 0) logs.push({ type: 'move', text: describe(heroNames), actorUserId: ctx.userId, visibility: 'all' });
  if (otherNames.length > 0) logs.push({ type: 'move', text: describe(otherNames), actorUserId: ctx.userId, visibility: 'dm' });

  const maxCells = Math.max(...tokens.map((t) => t.cells));
  manager.mutate(
    ctx.session,
    (s) => {
      manager.ensureZoneInstantiated(ctx.session, s, zone.id);
      const live = tokenIds.map((id) => s.tokens[id]).filter((t): t is Token => t !== undefined);
      const positions = freeCellsAround(s, zone.id, level, anchor, live.length, maxCells, new Set(tokenIds));
      live.forEach((t, i) => {
        const pos = snapPoint(level, positions[i]!, t.cells);
        if (costHeroId && economyApplies(s)) {
          const check = checkPlayerMove(s, costHeroId, { x: t.x, y: t.y }, pos, level.grid);
          if (!check.ok) throw new HandlerError(check.reason);
          if (check.cost > 0) addUsage(s, costHeroId, { moved: check.cost });
        }
        t.zoneId = zone.id;
        t.levelId = level.id;
        t.x = pos.x;
        t.y = pos.y;
      });
    },
    { zones: heroChangedZone, log: logs.length > 0 ? logs : undefined },
  );
  return null;
}

// ---------------------------------------------------------------------------
// token:update
// ---------------------------------------------------------------------------

function sanitizeStatuses(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HandlerError('Valor no válido para «estados»');
  const out: string[] = [];
  for (const v of value) {
    const s = statusValue(v);
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 40);
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new HandlerError(`Valor no válido para «${label}»`);
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 200)).slice(0, 100);
}

function sanitizeStats(value: unknown, current: TokenStats | null): TokenStats | null {
  if (value === null) return null;
  const obj = plainObject(value, 'estadísticas');
  const base: TokenStats = current
    ? structuredClone(current)
    : { speed: '', abilities: {}, attacks: [], traits: [], resistances: [], weaknesses: [], immunities: [], xp: 0, cr: null, description: '' };
  if (obj.speed !== undefined) base.speed = reqText(obj.speed, 'velocidad', 120);
  if (obj.abilities !== undefined) {
    const abilities = plainObject(obj.abilities, 'características');
    base.abilities = {};
    for (const [key, v] of Object.entries(abilities).slice(0, 30)) {
      if (typeof v === 'number' && Number.isFinite(v)) base.abilities[key.slice(0, 20)] = clamp(Math.round(v), 0, 99);
    }
  }
  if (obj.attacks !== undefined) {
    if (!Array.isArray(obj.attacks)) throw new HandlerError('Valor no válido para «ataques»');
    base.attacks = obj.attacks.filter(isPlainObject).slice(0, 50).map((a) => ({
      id: typeof a.id === 'string' && a.id ? a.id : newId('atk'),
      name: typeof a.name === 'string' ? a.name.slice(0, 120) : 'Ataque',
      bonus: typeof a.bonus === 'string' ? a.bonus.slice(0, 40) : '',
      damage: typeof a.damage === 'string' ? a.damage.slice(0, 80) : '',
      damageType: typeof a.damageType === 'string' ? a.damageType.slice(0, 80) : '',
      range: typeof a.range === 'string' ? a.range.slice(0, 80) : '',
      notes: typeof a.notes === 'string' ? a.notes.slice(0, 2000) : '',
    }));
  }
  if (obj.traits !== undefined) {
    if (!Array.isArray(obj.traits)) throw new HandlerError('Valor no válido para «rasgos»');
    base.traits = obj.traits.filter(isPlainObject).slice(0, 50).map((t) => ({
      id: typeof t.id === 'string' && t.id ? t.id : newId('trt'),
      name: typeof t.name === 'string' ? t.name.slice(0, 120) : 'Rasgo',
      description: typeof t.description === 'string' ? t.description.slice(0, 4000) : '',
    }));
  }
  if (obj.resistances !== undefined) base.resistances = stringList(obj.resistances, 'resistencias');
  if (obj.weaknesses !== undefined) base.weaknesses = stringList(obj.weaknesses, 'debilidades');
  if (obj.immunities !== undefined) base.immunities = stringList(obj.immunities, 'inmunidades');
  if (obj.xp !== undefined) base.xp = reqInt(obj.xp, 'XP', 0, 100000000);
  if (obj.cr !== undefined) base.cr = obj.cr === null ? null : clamp(reqNum(obj.cr, 'desafío'), 0, 100);
  if (obj.description !== undefined) base.description = longText(obj.description, 'descripción', 10000);
  return base;
}

function updateToken(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { tokenId: string; patch: Partial<Omit<Token, 'id' | 'kind' | 'heroId' | 'entryId'>> },
): null {
  const state = ctx.session.state;
  const token = requireToken(state, payload.tokenId);
  const raw = plainObject(payload.patch, 'cambios');
  const patch: Partial<Token> = {};
  const heroPatch: { hp?: number; maxHp?: number; tempHp?: number; ac?: number; statuses?: string[]; name?: string; imageUrl?: string | null } = {};
  const hero = token.kind === 'hero' && token.heroId ? state.heroes[token.heroId] : undefined;

  if (raw.name !== undefined) {
    const name = reqText(raw.name, 'nombre', 80, 1);
    if (hero) heroPatch.name = name;
    else patch.name = name;
  }
  if (raw.imageUrl !== undefined) {
    const url = urlOrNull(raw.imageUrl, 'imagen');
    if (hero) heroPatch.imageUrl = url;
    else patch.imageUrl = url;
  }
  if (raw.hidden !== undefined) patch.hidden = reqBool(raw.hidden, 'oculto');
  if (raw.statuses !== undefined) {
    const statuses = sanitizeStatuses(raw.statuses);
    if (hero) heroPatch.statuses = statuses;
    else patch.statuses = statuses;
  }
  if (raw.cells !== undefined) patch.cells = clamp(reqNum(raw.cells, 'tamaño'), 0.25, 12);
  if (raw.color !== undefined) patch.color = colorValue(raw.color, 'color');
  if (raw.light !== undefined) {
    if (raw.light === null) patch.light = null;
    else {
      const light = plainObject(raw.light, 'luz');
      patch.light = { radius: clamp(reqNum(light.radius, 'radio de luz'), 0, 5000), color: colorValue(light.color ?? '#ffcf7a', 'color de luz') };
    }
  }
  if (raw.notes !== undefined) patch.notes = longText(raw.notes, 'notas', 10000);
  if (raw.ac !== undefined) {
    if (hero) {
      if (raw.ac !== null) heroPatch.ac = reqInt(raw.ac, 'CA', 0, 99);
    } else patch.ac = raw.ac === null ? null : reqInt(raw.ac, 'CA', 0, 99);
  }
  if (raw.maxHp !== undefined) {
    if (hero) {
      if (raw.maxHp !== null) heroPatch.maxHp = reqInt(raw.maxHp, 'PV máximos', 0, 1000000);
    } else patch.maxHp = raw.maxHp === null ? null : reqInt(raw.maxHp, 'PV máximos', 0, 1000000);
  }
  if (raw.hp !== undefined) {
    if (hero) {
      if (raw.hp !== null) heroPatch.hp = reqInt(raw.hp, 'PV', 0, 1000000);
    } else patch.hp = raw.hp === null ? null : reqInt(raw.hp, 'PV', 0, 1000000);
  }
  if (raw.tempHp !== undefined) {
    const temp = reqInt(raw.tempHp, 'PV temporales', 0, 100000);
    if (hero) heroPatch.tempHp = temp;
    else patch.tempHp = temp;
  }
  if (raw.facing !== undefined) patch.facing = normalizeDeg(reqNum(raw.facing, 'orientación'));
  if (raw.stats !== undefined) patch.stats = sanitizeStats(raw.stats, token.stats);
  if (raw.ownerUserId !== undefined) {
    if (raw.ownerUserId === null) patch.ownerUserId = null;
    else {
      const uid = reqText(raw.ownerUserId, 'jugador', 200, 1);
      if (!state.players[uid] || uid === state.hostUserId) throw new HandlerError('Ese jugador no está en la partida');
      patch.ownerUserId = uid;
    }
  }
  let position: Point | null = null;
  if (raw.x !== undefined || raw.y !== undefined) {
    const loc = getLevel(ctx.session, token.zoneId, token.levelId);
    const p = { x: raw.x === undefined ? token.x : reqNum(raw.x, 'x'), y: raw.y === undefined ? token.y : reqNum(raw.y, 'y') };
    position = loc ? clampToLevel(loc.level, p) : p;
  }

  const logs: LogInput[] = [];
  if (patch.hidden === true && !token.hidden) {
    logs.push({ type: 'system', text: `${token.name} queda oculto para los jugadores`, actorUserId: ctx.userId, visibility: 'dm' });
  } else if (patch.hidden === false && token.hidden) {
    // Revealed: news only when every player will see the token where it stands (not a boss in another zone).
    const visibility = tokenLogVisibility(ctx.session, {
      kind: token.kind,
      hidden: false,
      zoneId: token.zoneId,
      levelId: token.levelId,
      x: position?.x ?? token.x,
      y: position?.y ?? token.y,
    });
    logs.push({ type: 'system', text: `Aparece ${patch.name ?? token.name}`, actorUserId: ctx.userId, visibility });
  }

  manager.mutate(
    ctx.session,
    (s) => {
      const t = s.tokens[token.id];
      if (!t) return;
      Object.assign(t, patch);
      if (position) {
        t.x = position.x;
        t.y = position.y;
      }
      if (t.kind !== 'hero' && t.hp !== null) {
        t.hp = Math.max(0, t.hp);
        if (t.maxHp !== null) t.hp = Math.min(t.hp, t.maxHp);
      }
      const h = t.heroId ? s.heroes[t.heroId] : undefined;
      if (t.kind === 'hero' && h) {
        if (heroPatch.name !== undefined) h.name = heroPatch.name;
        if (heroPatch.imageUrl !== undefined) h.imageUrl = heroPatch.imageUrl;
        if (heroPatch.statuses !== undefined) h.data.statuses = heroPatch.statuses;
        if (heroPatch.ac !== undefined) h.data.ac = heroPatch.ac;
        if (heroPatch.maxHp !== undefined) h.data.hp.max = heroPatch.maxHp;
        if (heroPatch.hp !== undefined) h.data.hp.current = heroPatch.hp;
        if (heroPatch.tempHp !== undefined) h.data.hp.temp = heroPatch.tempHp;
        h.data.hp.current = clamp(h.data.hp.current, 0, Math.max(0, h.data.hp.max));
        syncHeroTokens(s, h.id);
      }
    },
    { heroes: hero ? [hero.id] : undefined, log: logs.length > 0 ? logs : undefined },
  );
  return null;
}

// ---------------------------------------------------------------------------
// token:hp / token:status
// ---------------------------------------------------------------------------

function hpText(name: string, delta: number | undefined, current: number, max: number | null): string {
  const tail = max !== null ? `(PV ${current}/${max})` : `(PV ${current})`;
  if (delta === undefined) return `PV de ${name}: ${max !== null ? `${current}/${max}` : current}`;
  if (delta < 0) return `${name} recibe ${-delta} de daño ${tail}`;
  return `${name} recupera ${delta} PV ${tail}`;
}

function tokenHp(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string; delta?: number; set?: number }): null {
  const state = ctx.session.state;
  const token = requireToken(state, payload.tokenId);
  if (token.kind === 'item') throw new HandlerError('Los objetos no tienen puntos de vida');
  const delta = optNum(payload.delta, 'cambio de PV');
  const set = optNum(payload.set, 'PV');
  if (delta === undefined && set === undefined) throw new HandlerError('Indica cuántos PV cambian');
  if (set === undefined && delta === 0) return null;
  const roundedDelta = delta === undefined ? undefined : Math.round(delta);
  const hero = token.kind === 'hero' && token.heroId ? state.heroes[token.heroId] : undefined;

  if (hero) {
    const max = Math.max(0, hero.data.hp.max);
    const before = hero.data.hp.current;
    const next = clamp(set !== undefined ? Math.round(set) : before + (roundedDelta ?? 0), 0, max);
    manager.mutate(
      ctx.session,
      (s) => {
        const h = s.heroes[hero.id];
        if (!h) return;
        h.data.hp.current = next;
        syncHeroTokens(s, h.id);
      },
      {
        heroes: [hero.id],
        log: { type: 'hp', text: hpText(hero.name, set !== undefined ? undefined : roundedDelta, next, max), actorUserId: ctx.userId, visibility: 'all' },
      },
    );
    return null;
  }

  const before = token.hp ?? token.maxHp ?? 0;
  let next = set !== undefined ? Math.round(set) : before + (roundedDelta ?? 0);
  next = Math.max(0, next);
  if (token.maxHp !== null) next = Math.min(next, token.maxHp);
  // Exact numbers only when every player sees the token and its exact HP.
  const visibility = tokenLogVisibility(ctx.session, token, (uid) => effectiveVisibility(state, uid).enemyHp === 'exact');
  manager.mutate(
    ctx.session,
    (s) => {
      const t = s.tokens[token.id];
      if (!t) return;
      t.hp = next;
    },
    { log: { type: 'hp', text: hpText(token.name, set !== undefined ? undefined : roundedDelta, next, token.maxHp), actorUserId: ctx.userId, visibility } },
  );
  return null;
}

function tokenStatus(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string; status: string; on: boolean }): null {
  const state = ctx.session.state;
  const token = requireToken(state, payload.tokenId);
  const status = statusValue(payload.status);
  const on = reqBool(payload.on, 'activar');
  const hero = token.kind === 'hero' && token.heroId ? state.heroes[token.heroId] : undefined;
  const currentList = hero ? hero.data.statuses : token.statuses;
  if (currentList.includes(status) === on) return null;
  const name = hero?.name ?? token.name;
  const text = `${name}: ${on ? '+' : '−'} ${statusLabel(status)}`;
  manager.mutate(
    ctx.session,
    (s) => {
      if (hero) {
        const h = s.heroes[hero.id];
        if (!h) return;
        h.data.statuses = on ? [...h.data.statuses, status] : h.data.statuses.filter((x) => x !== status);
        syncHeroTokens(s, h.id);
        return;
      }
      const t = s.tokens[token.id];
      if (!t) return;
      t.statuses = on ? [...t.statuses, status] : t.statuses.filter((x) => x !== status);
    },
    { heroes: hero ? [hero.id] : undefined, log: { type: 'system', text, actorUserId: ctx.userId, visibility: tokenLogVisibility(ctx.session, token) } },
  );
  return null;
}

// ---------------------------------------------------------------------------
// token:remove / token:duplicate
// ---------------------------------------------------------------------------

function removeToken(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string }): null {
  const state = ctx.session.state;
  const token = requireToken(state, payload.tokenId);
  const visibility: 'all' | 'dm' = token.kind === 'hero' && !token.hidden ? 'all' : 'dm';
  const opts: MutateOptions = {
    zones: token.kind === 'hero',
    log: { type: 'system', text: `${token.name} se retira del mapa`, actorUserId: ctx.userId, visibility },
  };
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    ctx.session,
    (s) => {
      const before = turnPointer(s);
      delete s.tokens[token.id];
      // Players keep their turn (their hero token can be placed again); other entries of the token go.
      for (const entry of s.turn.order) {
        if (entry.tokenId === token.id && entry.type === 'player') entry.tokenId = null;
      }
      removeTurnEntries(s, (entry) => entry.tokenId === token.id && entry.type !== 'player');
      // A creature removed during its own turn passes the turn to the next entry.
      out.landing = landAfterRemoval(ctx.session, s, opts, before);
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, ctx.session, out.landing);
  return null;
}

function duplicateToken(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string }): null {
  const token = requireToken(ctx.session.state, payload.tokenId);
  if (token.kind === 'hero') throw new HandlerError('Las fichas de héroe no se pueden duplicar');
  const loc = getLevel(ctx.session, token.zoneId, token.levelId);
  if (!loc) throw new HandlerError('La zona de esa ficha ya no existe');
  const baseName = token.name.replace(/ \d+$/, '') || token.name;
  manager.mutate(
    ctx.session,
    (s) => {
      const original = s.tokens[token.id];
      if (!original) return;
      const [pos] = freeCellsAround(s, original.zoneId, loc.level, { x: original.x, y: original.y }, 1, original.cells);
      const [name] = numberedNames(s, baseName, 1);
      const copy: Token = {
        ...structuredClone(original),
        id: newId('tok'),
        name: name ?? original.name,
        x: pos!.x,
        y: pos!.y,
        loot: original.loot.map((it) => ({ ...structuredClone(it), id: newId('inv') })),
        sourceElementId: null,
      };
      s.tokens[copy.id] = copy;
    },
    { log: { type: 'system', text: `Se duplica ${token.name}`, actorUserId: ctx.userId, visibility: 'dm' } },
  );
  return null;
}

// ---------------------------------------------------------------------------

export const registerTokenHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'token:spawn', (ctx, payload) => spawnTokens(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:placeHeroes', (ctx, payload) => placeHeroes(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:move', (ctx, payload) => moveToken(manager, ctx, payload));
  manager.register(socket, 'token:drag', (ctx, payload) => dragToken(manager, ctx, payload));
  manager.register(socket, 'token:moveMany', (ctx, payload) => moveManyTokens(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:transfer', (ctx, payload) => transferTokens(manager, ctx, payload));
  manager.register(socket, 'token:update', (ctx, payload) => updateToken(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:hp', (ctx, payload) => tokenHp(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:status', (ctx, payload) => tokenStatus(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:remove', (ctx, payload) => removeToken(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'token:duplicate', (ctx, payload) => duplicateToken(manager, ctx, payload), { dmOnly: true });
};
