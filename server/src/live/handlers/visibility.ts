import {
  emptyZoneLiveState,
  newId,
  type LiveState,
  type Projection,
  type ProjectionKind,
  type SessionEvent,
  type VisibilitySettings,
  type VisionMode,
  type ZoneLiveState,
  type ZoneVision,
} from '@wailers/shared';
import {
  clamp,
  clampToLevel,
  defaultLevel,
  effectiveFor,
  isPlayer,
  longText,
  oneOf,
  optId,
  parseZoneVision,
  plainObject,
  playerIds,
  playerName,
  reqBool,
  reqId,
  reqNum,
  reqText,
  requireLevel,
  requireZone,
  toast,
  urlOrNull,
  userColor,
  zoneVisionLabel,
} from '../helpers';
import { HandlerError, type HandlerCtx, type HandlerModule, type LiveSession, type SessionManagerApi } from '../types';

/*
 * Visibility handlers (DM): global / per-player settings, fog regions, explored memory, doors,
 * the DM's current view, projections ("mostrar a los jugadores") and pings (everyone).
 */

const VISION_MODES: readonly VisionMode[] = ['all', 'explored', 'vision', 'none'];
const ENEMY_HP: readonly VisibilitySettings['enemyHp'][] = ['exact', 'bar', 'hidden'];
const BOOLEAN_KEYS = [
  'sharedVision',
  'canSeeOverview',
  'canSeeOtherZones',
  'canSeeEnemyDetails',
  'canSeeInitiative',
  'canSeeOthersRolls',
  'canSeeOthersInventory',
  'canMoveOwnToken',
] as const satisfies readonly (keyof VisibilitySettings)[];
const PROJECTION_KINDS: readonly ProjectionKind[] = ['zone', 'image', 'entry', 'overview'];

type VisibilityKey = keyof VisibilitySettings;

/**
 * Parse a visibility patch. With `allowClear`, a null value (except for sceneImageUrl, where null
 * is a real value) removes that per-player override.
 */
function parseVisibilityPatch(raw: unknown, allowClear: boolean): { set: Partial<VisibilitySettings>; clear: VisibilityKey[] } {
  const obj = plainObject(raw, 'visibilidad');
  const set: Partial<VisibilitySettings> = {};
  const clear: VisibilityKey[] = [];
  const isClear = (key: VisibilityKey): boolean => {
    if (obj[key] !== null || key === 'sceneImageUrl') return false;
    if (!allowClear) throw new HandlerError('Valor no válido en la visibilidad');
    clear.push(key);
    return true;
  };
  if (obj.visionMode !== undefined && !isClear('visionMode')) set.visionMode = oneOf(VISION_MODES, obj.visionMode, 'modo de visión');
  if (obj.visionRadius !== undefined && !isClear('visionRadius')) set.visionRadius = clamp(reqNum(obj.visionRadius, 'radio de visión'), 0, 200);
  if (obj.visionCone !== undefined && !isClear('visionCone')) set.visionCone = clamp(reqNum(obj.visionCone, 'cono de visión'), 10, 360);
  if (obj.sceneImageUrl !== undefined) set.sceneImageUrl = urlOrNull(obj.sceneImageUrl, 'imagen de escena');
  if (obj.enemyHp !== undefined && !isClear('enemyHp')) set.enemyHp = oneOf(ENEMY_HP, obj.enemyHp, 'PV de enemigos');
  for (const key of BOOLEAN_KEYS) {
    if (obj[key] !== undefined && !isClear(key)) set[key] = reqBool(obj[key], key);
  }
  return { set, clear };
}

function zoneState(state: LiveState, zoneId: string): ZoneLiveState {
  const existing = state.zoneStates[zoneId];
  if (existing) return existing;
  const created = emptyZoneLiveState();
  state.zoneStates[zoneId] = created;
  return created;
}

/** Whether each player may move their own token right now. */
function movementPermissions(state: LiveState): Map<string, boolean> {
  return new Map(playerIds(state).map((uid) => [uid, effectiveFor(state, uid).canMoveOwnToken]));
}

/** Tell the players whose freedom of movement the DM just took away or gave back. */
function announceMovementChanges(manager: SessionManagerApi, session: LiveSession, before: Map<string, boolean>): void {
  if (session.state.status !== 'playing') return;
  for (const [uid, now] of movementPermissions(session.state)) {
    const was = before.get(uid);
    if (was === undefined || was === now) continue;
    if (now) toast(manager, session, { kind: 'users', userIds: [uid] }, 'success', '🔓 El DM te devuelve la libertad de movimiento: ya puedes mover tu ficha');
    else toast(manager, session, { kind: 'users', userIds: [uid] }, 'warning', '🔒 El DM ha bloqueado el movimiento de tu ficha');
  }
}

// ---------------------------------------------------------------------------

function setGlobal(manager: SessionManagerApi, ctx: HandlerCtx, payload: { patch: Partial<VisibilitySettings> }): null {
  const { set } = parseVisibilityPatch(payload.patch, false);
  if (Object.keys(set).length === 0) return null;
  const before = movementPermissions(ctx.session.state);
  manager.mutate(
    ctx.session,
    (s) => {
      s.visibility.global = { ...s.visibility.global, ...set };
    },
    { zones: true },
  );
  announceMovementChanges(manager, ctx.session, before);
  return null;
}

function setPlayer(manager: SessionManagerApi, ctx: HandlerCtx, payload: { userId: string; patch: Partial<VisibilitySettings> | null }): null {
  const state = ctx.session.state;
  const userId = reqId(payload.userId, 'jugador');
  if (!isPlayer(state, userId)) throw new HandlerError('Ese jugador no está en la partida');
  const before = movementPermissions(state);
  if (payload.patch === null) {
    if (!state.visibility.perPlayer[userId]) return null;
    manager.mutate(
      ctx.session,
      (s) => {
        delete s.visibility.perPlayer[userId];
      },
      { zones: true },
    );
    announceMovementChanges(manager, ctx.session, before);
    return null;
  }
  const { set, clear } = parseVisibilityPatch(payload.patch, true);
  manager.mutate(
    ctx.session,
    (s) => {
      const next: Partial<VisibilitySettings> = { ...(s.visibility.perPlayer[userId] ?? {}), ...set };
      for (const key of clear) delete next[key];
      if (Object.keys(next).length === 0) delete s.visibility.perPlayer[userId];
      else s.visibility.perPlayer[userId] = next;
    },
    { zones: true },
  );
  announceMovementChanges(manager, ctx.session, before);
  return null;
}

function sameVision(a: ZoneVision | null | undefined, b: ZoneVision | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.mode === b.mode && a.radius === b.radius && a.cone === b.cone;
}

/** DM: live vision of a zone (a dark cave...). null = back to the zone default from the campaign. */
function setZoneVision(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; vision: ZoneVision | null }): null {
  const zone = requireZone(manager, ctx.session, payload.zoneId);
  const vision = parseZoneVision(payload.vision);
  const state = ctx.session.state;
  if (sameVision(state.zoneStates[zone.id]?.vision, vision)) return null;
  const fallback = state.zoneVision?.[zone.id] ?? null;
  const text = vision
    ? `👁️ Visión en ${zone.name}: ${zoneVisionLabel(vision)}`
    : `👁️ Visión en ${zone.name}: vuelve a la de la zona (${zoneVisionLabel(fallback)})`;
  manager.mutate(
    ctx.session,
    (s) => {
      const zs = zoneState(s, zone.id);
      if (vision) zs.vision = vision;
      else delete zs.vision;
    },
    { zones: true, log: { type: 'system', text, actorUserId: ctx.userId, visibility: 'dm' } },
  );
  return null;
}

function fogReveal(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; regionId: string; revealed: boolean }): null {
  const zone = requireZone(manager, ctx.session, payload.zoneId);
  const regionId = reqId(payload.regionId, 'región');
  const revealed = reqBool(payload.revealed, 'revelada');
  const region = zone.levels.flatMap((l) => l.fogRegions).find((r) => r.id === regionId);
  if (!region) throw new HandlerError('Esa región de niebla no existe');
  const current = ctx.session.state.zoneStates[zone.id]?.revealedFog.includes(regionId) ?? false;
  if (current === revealed) return null;
  const name = region.name || 'una zona oculta';
  manager.mutate(
    ctx.session,
    (s) => {
      const zs = zoneState(s, zone.id);
      zs.revealedFog = revealed ? [...zs.revealedFog, regionId] : zs.revealedFog.filter((id) => id !== regionId);
    },
    {
      log: {
        type: 'system',
        text: revealed ? `Se revela ${name} (${zone.name})` : `Se vuelve a ocultar ${name} (${zone.name})`,
        actorUserId: ctx.userId,
        visibility: 'dm',
      },
    },
  );
  return null;
}

function fogResetExplored(manager: SessionManagerApi, ctx: HandlerCtx, payload: { userId?: string; levelId?: string }): null {
  const state = ctx.session.state;
  const userId = optId(payload.userId, 'jugador');
  const levelId = optId(payload.levelId, 'nivel');
  if (userId !== undefined && !isPlayer(state, userId)) throw new HandlerError('Ese jugador no está en la partida');
  const who = userId ? playerName(ctx.session, userId) : 'todos los jugadores';
  manager.mutate(
    ctx.session,
    (s) => {
      const targets = userId ? [userId] : Object.keys(s.explored);
      for (const uid of targets) {
        const perLevel = s.explored[uid];
        if (!perLevel) continue;
        if (levelId) {
          delete perLevel[levelId];
          if (Object.keys(perLevel).length === 0) delete s.explored[uid];
        } else {
          delete s.explored[uid];
        }
      }
    },
    { log: { type: 'system', text: `Se borra la memoria de exploración de ${who}`, actorUserId: ctx.userId, visibility: 'dm' } },
  );
  return null;
}

function doorToggle(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; wallId: string; open: boolean }): null {
  const zone = requireZone(manager, ctx.session, payload.zoneId);
  const wallId = reqId(payload.wallId, 'puerta');
  const open = reqBool(payload.open, 'abierta');
  const wall = zone.levels.flatMap((l) => l.walls).find((w) => w.id === wallId);
  if (!wall) throw new HandlerError('Esa puerta no existe');
  if (wall.kind !== 'door') throw new HandlerError('Esa pared no es una puerta');
  manager.mutate(ctx.session, (s) => {
    zoneState(s, zone.id).doors[wallId] = open;
  });
  return null;
}

function viewDm(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; levelId: string }): null {
  const { zone, level } = requireLevel(manager, ctx.session, payload.zoneId, payload.levelId);
  const current = ctx.session.state.dmView;
  const alreadyInstantiated = ctx.session.state.instantiatedZones.includes(zone.id);
  if (current && current.zoneId === zone.id && current.levelId === level.id && alreadyInstantiated) return null;
  manager.mutate(ctx.session, (s) => {
    s.dmView = { zoneId: zone.id, levelId: level.id };
    manager.ensureZoneInstantiated(ctx.session, s, zone.id);
  });
  return null;
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

function parseProjection(manager: SessionManagerApi, ctx: HandlerCtx, raw: unknown): Projection {
  const obj = plainObject(raw, 'proyección');
  const state = ctx.session.state;
  const kind = oneOf(PROJECTION_KINDS, obj.kind, 'tipo de proyección');
  let title = obj.title === undefined || obj.title === null ? '' : reqText(obj.title, 'título', 160);
  let zoneId: string | null = null;
  let levelId: string | null = null;
  let imageUrl = urlOrNull(obj.imageUrl, 'imagen');
  let entry: Projection['entry'] = null;

  if (kind === 'zone') {
    const zone = requireZone(manager, ctx.session, obj.zoneId);
    const requestedLevel = optId(obj.levelId, 'nivel');
    const level = requestedLevel ? zone.levels.find((l) => l.id === requestedLevel) : defaultLevel(zone);
    if (!level) throw new HandlerError('Ese nivel no existe en la zona');
    zoneId = zone.id;
    levelId = level.id;
    if (!title) title = zone.name;
  } else if (kind === 'image') {
    if (!imageUrl) throw new HandlerError('Elige una imagen para mostrar');
  } else if (kind === 'entry') {
    const e = plainObject(obj.entry, 'elemento');
    const details: { label: string; value: string }[] = [];
    if (e.details !== undefined) {
      if (!Array.isArray(e.details)) throw new HandlerError('Valor no válido para «detalles»');
      for (const d of e.details.slice(0, 40)) {
        const detail = plainObject(d, 'detalle');
        details.push({ label: reqText(detail.label, 'etiqueta', 80), value: reqText(detail.value, 'valor', 1000) });
      }
    }
    entry = {
      kind: reqText(e.kind ?? '', 'tipo', 40),
      name: reqText(e.name, 'nombre', 160, 1),
      imageUrl: urlOrNull(e.imageUrl, 'imagen'),
      description: e.description === undefined ? '' : longText(e.description, 'descripción', 10000),
      details,
    };
    if (!title) title = entry.name;
    imageUrl ??= entry.imageUrl;
  } else if (!title) {
    title = ctx.session.campaign.name;
  }

  let targets: Projection['targets'] = 'all';
  if (obj.targets !== undefined && obj.targets !== 'all') {
    if (!Array.isArray(obj.targets)) throw new HandlerError('Valor no válido para «destinatarios»');
    const ids = [...new Set(obj.targets.filter((t): t is string => typeof t === 'string'))].filter((uid) => isPlayer(state, uid));
    if (ids.length === 0) throw new HandlerError('Elige al menos un jugador');
    targets = ids;
  }

  return { id: newId('proj'), kind, title, zoneId, levelId, imageUrl, entry, targets };
}

function showOpen(manager: SessionManagerApi, ctx: HandlerCtx, payload: { projection: Omit<Projection, 'id'> }): null {
  const projection = parseProjection(manager, ctx, payload.projection);
  const whom = projection.targets === 'all' ? 'todos' : projection.targets.map((uid) => playerName(ctx.session, uid)).join(', ');
  manager.mutate(
    ctx.session,
    (s) => {
      s.projection = projection;
      if (projection.zoneId) manager.ensureZoneInstantiated(ctx.session, s, projection.zoneId);
    },
    {
      log: {
        type: 'system',
        text: `El DM muestra «${projection.title || 'una imagen'}» a ${whom}`,
        actorUserId: ctx.userId,
        visibility: 'dm',
      },
    },
  );
  return null;
}

function showClose(manager: SessionManagerApi, ctx: HandlerCtx): null {
  if (ctx.session.state.projection === null) return null;
  manager.mutate(ctx.session, (s) => {
    s.projection = null;
  });
  return null;
}

// ---------------------------------------------------------------------------
// Pings (rate limited: 5 per 2 s per user and session)
// ---------------------------------------------------------------------------

const PING_WINDOW_MS = 2000;
const PING_LIMIT = 5;
const pingTimes = new Map<string, number[]>();

function allowPing(sessionId: string, userId: string): boolean {
  const key = `${sessionId}:${userId}`;
  const now = Date.now();
  const recent = (pingTimes.get(key) ?? []).filter((t) => now - t < PING_WINDOW_MS);
  if (recent.length >= PING_LIMIT) {
    pingTimes.set(key, recent);
    return false;
  }
  recent.push(now);
  pingTimes.set(key, recent);
  if (pingTimes.size > 500) {
    for (const [k, times] of pingTimes) if (times.every((t) => now - t >= PING_WINDOW_MS)) pingTimes.delete(k);
  }
  return true;
}

function ping(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; levelId: string; x: number; y: number }): null {
  const { zone, level } = requireLevel(manager, ctx.session, payload.zoneId, payload.levelId);
  const point = clampToLevel(level, { x: reqNum(payload.x, 'x'), y: reqNum(payload.y, 'y') });
  if (!allowPing(ctx.session.id, ctx.userId)) throw new HandlerError('Espera un momento antes de volver a señalar');
  const event: SessionEvent = {
    type: 'ping',
    userId: ctx.userId,
    name: playerName(ctx.session, ctx.userId),
    color: userColor(ctx.session, ctx.userId),
    zoneId: zone.id,
    levelId: level.id,
    x: point.x,
    y: point.y,
  };
  manager.emitEvent(ctx.session, event, { kind: 'all' });
  return null;
}

export const registerVisibilityHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'vis:setGlobal', (ctx, payload) => setGlobal(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'vis:setPlayer', (ctx, payload) => setPlayer(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'fog:reveal', (ctx, payload) => fogReveal(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'fog:resetExplored', (ctx, payload) => fogResetExplored(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'door:toggle', (ctx, payload) => doorToggle(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'zone:vision', (ctx, payload) => setZoneVision(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'view:dm', (ctx, payload) => viewDm(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'show:open', (ctx, payload) => showOpen(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'show:close', (ctx) => showClose(manager, ctx), { dmOnly: true });
  manager.register(socket, 'ping', (ctx, payload) => ping(manager, ctx, payload));
};
