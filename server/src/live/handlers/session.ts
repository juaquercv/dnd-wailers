import { adaptHeroToRules, type SessionView } from '@wailers/shared';
import { claims } from '../../auth/claims';
import { isPlainObject } from '../../services/serializers';
import { DEFAULT_PLAYER_COLOR, resolveSpawn } from '../runtime';
import type { SessionManager } from '../SessionManager';
import { HandlerError, type AppSocket, type HandlerCtx, type LogInput, type MutateOptions } from '../types';
import { announceTurnStart, startTurns, type TurnLanding } from './turns';

/*
 * Session lifecycle: join/leave (presence), start, save, pause, end and session options.
 */

const PAUSED_REASON = 'El DM ha pausado la partida. Podrás volver cuando la reanude.';
const ENDED_REASON = 'El DM ha terminado la partida. ¡Gracias por jugar!';
const UNLOAD_AFTER_END_MS = 4000;

async function join(manager: SessionManager, ctx: HandlerCtx): Promise<SessionView> {
  const { socket, userId, isDm, session } = ctx;
  const state = session.state;
  if (state.status === 'ended') {
    manager.scheduleIdleUnload(session);
    throw new HandlerError('La sesión ha terminado');
  }
  if (state.status === 'paused' && !isDm) {
    manager.scheduleIdleUnload(session);
    throw new HandlerError('La partida está en pausa. Espera a que el DM la reanude.');
  }

  if (socket.data.sessionId && socket.data.sessionId !== session.id) manager.detachSocket(socket, { explicit: true });

  const user = claims.getUser(userId);
  const name = user?.name ?? ctx.userName;
  const color = user?.color ?? DEFAULT_PLAYER_COLOR;
  const alreadyHere = manager.isUserConnected(session, userId);
  const announce = !alreadyHere && manager.announceReturn(session, userId);
  manager.attachSocket(socket, session, isDm);

  if (isDm) {
    if (announce) void manager.log(session, { type: 'system', text: `«${name}» (DM) se ha unido a la partida` });
  } else {
    const isNew = !state.players[userId];
    let log: LogInput | undefined;
    if (isNew) log = { type: 'system', text: `«${name}» se ha unido a la partida` };
    else if (announce) log = { type: 'system', text: `«${name}» ha vuelto a la partida` };
    manager.mutate(
      session,
      (s) => {
        const existing = s.players[userId];
        if (existing) {
          existing.name = name;
          existing.color = color;
          existing.connected = true;
          return;
        }
        s.players[userId] = { userId, name, color, heroId: null, ready: false, connected: true, joinedAt: new Date().toISOString() };
      },
      { log },
    );
  }

  const view = manager.buildView(session, userId);
  if (!view) throw new HandlerError('No se pudo entrar en la partida');
  manager.sendZones(session, socket, true);
  manager.broadcastSessionsList();
  return view;
}

function start(manager: SessionManager, ctx: HandlerCtx): null {
  const session = ctx.session;
  const status = session.state.status;
  if (status === 'playing') throw new HandlerError('La partida ya ha comenzado');
  if (status !== 'lobby') throw new HandlerError('La partida no está en la sala de espera');
  const spawn = resolveSpawn(session.campaign);
  if (!spawn) throw new HandlerError('La campaña no tiene zonas. Crea al menos una zona en el editor antes de empezar.');

  const rules = session.campaign.rules;
  const adaptedHeroes: string[] = [];
  const firstStart = session.state.startedAt === null;
  const opts: MutateOptions = {
    persistNow: true,
    zones: true,
    heroes: adaptedHeroes,
    log: { type: 'system', text: '¡La aventura comienza!' },
  };
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    session,
    (state) => {
      state.status = 'playing';
      state.startedAt ??= new Date().toISOString();
      manager.ensureZoneInstantiated(session, state, spawn.zoneId);
      for (const player of Object.values(state.players).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))) {
        if (!player.heroId) continue;
        const hero = state.heroes[player.heroId];
        if (!hero) {
          player.heroId = null;
          player.ready = false;
          continue;
        }
        const adapted = adaptHeroToRules(hero.data, rules, hero.level);
        if (JSON.stringify(adapted) !== JSON.stringify(hero.data)) {
          hero.data = adapted;
          adaptedHeroes.push(hero.id);
        }
        manager.placeHeroToken(session, state, player.userId, spawn);
      }
      // Resumed sessions: zones that already hold hero tokens are live too.
      for (const token of Object.values(state.tokens)) {
        if (token.kind === 'hero') manager.ensureZoneInstantiated(session, state, token.zoneId);
      }
      state.dmView ??= { zoneId: spawn.zoneId, levelId: spawn.levelId };
      // Every player with a hero takes part; the current entry starts its turn (first start: top of round 1).
      out.landing = startTurns(session, state, opts, firstStart);
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, session, out.landing);
  manager.broadcastSessionsList();
  return null;
}

async function save(manager: SessionManager, ctx: HandlerCtx): Promise<null> {
  try {
    await manager.persist(ctx.session);
  } catch (err) {
    console.error('[live] No se pudo guardar la partida:', err);
    throw new HandlerError('No se pudo guardar la partida. Inténtalo de nuevo.');
  }
  manager.emitEvent(ctx.session, { type: 'toast', level: 'success', text: 'Partida guardada' }, { kind: 'dm' });
  // savedAt changed: refresh the DM view.
  manager.broadcast(ctx.session);
  return null;
}

async function pause(manager: SessionManager, ctx: HandlerCtx): Promise<null> {
  const session = ctx.session;
  const status = session.state.status;
  if (status !== 'lobby' && status !== 'playing') throw new HandlerError('La partida no está activa');
  manager.mutate(
    session,
    (state) => {
      state.status = 'paused';
      for (const player of Object.values(state.players)) player.connected = false;
    },
    { log: { type: 'system', text: 'El DM ha pausado la partida' } },
  );
  manager.evictPlayers(session, PAUSED_REASON);
  manager.broadcastSessionsList();
  try {
    await manager.persist(session);
  } catch (err) {
    console.error('[live] No se pudo guardar la partida al pausar:', err);
    throw new HandlerError('La partida se ha pausado, pero no se pudo guardar. Pulsa «Guardar» de nuevo.');
  }
  return null;
}

async function end(manager: SessionManager, ctx: HandlerCtx): Promise<null> {
  const session = ctx.session;
  if (session.state.status === 'ended') throw new HandlerError('La partida ya ha terminado');
  manager.mutate(
    session,
    (state) => {
      state.status = 'ended';
      state.turnOffer = null;
      for (const player of Object.values(state.players)) {
        player.connected = false;
        player.ready = false;
      }
    },
    { log: { type: 'system', text: 'La partida ha terminado' } },
  );
  manager.evictPlayers(session, ENDED_REASON);
  manager.broadcastSessionsList();
  try {
    await manager.persist(session);
  } catch (err) {
    console.error('[live] No se pudo guardar la partida al terminar:', err);
    throw new HandlerError('La partida ha terminado, pero no se pudo guardar su estado final.');
  } finally {
    if (manager.get(session.id) === session) manager.scheduleUnload(session, UNLOAD_AFTER_END_MS);
  }
  return null;
}

export function registerSessionHandlers(socket: AppSocket, manager: SessionManager): void {
  const dmOnly = { dmOnly: true };

  manager.register(socket, 'session:join', (ctx) => join(manager, ctx));

  manager.register(socket, 'session:leave', (ctx) => {
    manager.detachSocket(ctx.socket, { explicit: true });
    return null;
  });

  manager.register(socket, 'session:start', (ctx) => start(manager, ctx), dmOnly);
  manager.register(socket, 'session:save', (ctx) => save(manager, ctx), dmOnly);
  manager.register(socket, 'session:pause', (ctx) => pause(manager, ctx), dmOnly);
  manager.register(socket, 'session:end', (ctx) => end(manager, ctx), dmOnly);

  manager.register(
    socket,
    'session:setOptions',
    (ctx, payload) => {
      const patch: unknown = payload.patch;
      if (!isPlainObject(patch)) throw new HandlerError('Datos inválidos');
      const tradeNeedsApproval = patch.tradeNeedsApproval;
      if (tradeNeedsApproval !== undefined && typeof tradeNeedsApproval !== 'boolean') {
        throw new HandlerError('Valor no válido para «aprobación de trueques»');
      }
      if (tradeNeedsApproval === undefined) return null;
      manager.mutate(ctx.session, (state) => {
        state.options.tradeNeedsApproval = tradeNeedsApproval;
      });
      return null;
    },
    dmOnly,
  );
}
