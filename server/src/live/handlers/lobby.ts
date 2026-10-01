import type { HeroSheet, LiveState, SpawnPoint } from '@wailers/shared';
import { prisma } from '../../db';
import { entryToDTO } from '../../services/serializers';
import { heroSheetFromEntry } from '../runtime';
import type { SessionManager } from '../SessionManager';
import { HandlerError, type AppSocket, type HandlerCtx, type LiveSession } from '../types';
import { removeTurnEntries } from './turns';

/*
 * Lobby: hero selection (also for late joiners while playing), ready flag and kicking players.
 */

const KICKED_REASON = 'El DM te ha expulsado de la partida.';

function isPendingTrade(status: LiveState['trades'][number]['status']): boolean {
  return status === 'pending_target' || status === 'pending_dm';
}

/**
 * Remove a hero sheet (and its tokens) that no player uses any more. The pending write-back is
 * flushed first so no progress is lost.
 */
export function releaseHeroIfUnused(manager: SessionManager, session: LiveSession, state: LiveState, heroId: string): void {
  if (Object.values(state.players).some((p) => p.heroId === heroId)) return;
  if (!state.heroes[heroId]) return;
  manager.flushHeroWriteBack(session, heroId);
  delete state.heroes[heroId];
  const removedTokens = new Set<string>();
  for (const [id, token] of Object.entries(state.tokens)) {
    if (token.kind === 'hero' && token.heroId === heroId) {
      delete state.tokens[id];
      removedTokens.add(id);
    }
  }
  removeTurnEntries(state, (e) => (e.type === 'player' && e.heroId === heroId) || (e.tokenId !== null && removedTokens.has(e.tokenId)));
  for (const trade of state.trades) {
    if (isPendingTrade(trade.status) && (trade.fromHeroId === heroId || trade.toHeroId === heroId)) trade.status = 'cancelled';
  }
}

async function loadHeroSheet(ctx: HandlerCtx, heroId: string): Promise<{ sheet: HeroSheet; adapted: boolean }> {
  const live = ctx.session.state.heroes[heroId];
  if (live) {
    if (live.ownerId !== ctx.userId) throw new HandlerError('Ese héroe no es tuyo');
    return { sheet: live, adapted: false };
  }
  const row = await prisma.libraryEntry.findUnique({ where: { id: heroId } });
  if (!row || row.kind !== 'hero') throw new HandlerError('Ese héroe no existe');
  if (row.ownerId !== ctx.userId) throw new HandlerError('Ese héroe no es tuyo');
  const entry = entryToDTO(row);
  const sheet = heroSheetFromEntry(entry, ctx.session.campaign.rules);
  return { sheet, adapted: JSON.stringify(sheet.data) !== JSON.stringify(entry.data) };
}

async function selectHero(manager: SessionManager, ctx: HandlerCtx, heroIdRaw: unknown): Promise<null> {
  if (ctx.isDm) throw new HandlerError('El DM no elige héroe');
  const { session, userId } = ctx;
  if (heroIdRaw !== null && (typeof heroIdRaw !== 'string' || heroIdRaw === '' || heroIdRaw.length > 200)) {
    throw new HandlerError('Héroe no válido');
  }
  const playerName = session.state.players[userId]?.name ?? ctx.userName;

  if (heroIdRaw === null) {
    if (!session.state.players[userId]?.heroId) return null;
    manager.mutate(session, (state) => {
      const player = state.players[userId];
      if (!player?.heroId) return;
      const previous = player.heroId;
      player.heroId = null;
      player.ready = false;
      removeTurnEntries(state, (e) => e.type === 'player' && e.userId === userId);
      releaseHeroIfUnused(manager, session, state, previous);
    });
    manager.broadcastSessionsList();
    return null;
  }

  const heroId = heroIdRaw;
  if (session.state.players[userId]?.heroId === heroId) return null;
  const takenBy = (state: LiveState): boolean => Object.values(state.players).some((p) => p.userId !== userId && p.heroId === heroId);
  if (takenBy(session.state)) throw new HandlerError('Otro jugador ya ha elegido ese héroe');

  const { sheet, adapted } = await loadHeroSheet(ctx, heroId);

  // The state may have changed while the hero was loading.
  if (!session.state.players[userId]) throw new HandlerError('Ya no formas parte de esta partida');
  if (takenBy(session.state)) throw new HandlerError('Otro jugador ya ha elegido ese héroe');

  manager.mutate(
    session,
    (state) => {
      const player = state.players[userId];
      if (!player) throw new HandlerError('Ya no formas parte de esta partida');
      const previous = player.heroId;
      if (!state.heroes[heroId]) state.heroes[heroId] = sheet;
      const hero = state.heroes[heroId]!;
      player.heroId = heroId;
      player.ready = false;

      for (const entry of state.turn.order) {
        if (entry.type === 'player' && entry.userId === userId) {
          entry.heroId = heroId;
          entry.name = hero.name;
          entry.imageUrl = hero.imageUrl;
          entry.tokenId = null;
        }
      }

      // A hero switch during the game keeps the place of the previous hero on the map.
      let near: SpawnPoint | null = null;
      if (previous && previous !== heroId) {
        const oldToken = Object.values(state.tokens).find((t) => t.kind === 'hero' && t.heroId === previous);
        if (oldToken) near = { zoneId: oldToken.zoneId, levelId: oldToken.levelId, x: oldToken.x, y: oldToken.y };
        releaseHeroIfUnused(manager, session, state, previous);
      }
      if (state.status === 'playing') manager.placeHeroToken(session, state, userId, near);
    },
    {
      log: { type: 'system', text: `«${playerName}» ha elegido a «${sheet.name}»` },
      heroes: adapted ? [heroId] : [],
      zones: true,
    },
  );
  manager.broadcastSessionsList();
  return null;
}

function setReady(manager: SessionManager, ctx: HandlerCtx, readyRaw: unknown): null {
  if (ctx.isDm) throw new HandlerError('El DM no necesita marcarse como listo');
  if (typeof readyRaw !== 'boolean') throw new HandlerError('Valor no válido para «listo»');
  const player = ctx.session.state.players[ctx.userId];
  if (!player) throw new HandlerError('No formas parte de esta partida');
  if (readyRaw && !player.heroId) throw new HandlerError('Elige un héroe antes de marcarte como listo');
  if (player.ready === readyRaw) return null;
  manager.mutate(ctx.session, (state) => {
    const p = state.players[ctx.userId];
    if (!p) return;
    if (readyRaw && !p.heroId) throw new HandlerError('Elige un héroe antes de marcarte como listo');
    p.ready = readyRaw;
  });
  return null;
}

function kick(manager: SessionManager, ctx: HandlerCtx, targetRaw: unknown): null {
  const session = ctx.session;
  if (typeof targetRaw !== 'string' || targetRaw === '') throw new HandlerError('Jugador no válido');
  const target = targetRaw;
  if (target === session.state.hostUserId) throw new HandlerError('No puedes expulsarte a ti mismo');
  const player = session.state.players[target];
  if (!player) throw new HandlerError('Ese jugador no está en la partida');

  manager.mutate(
    session,
    (state) => {
      const p = state.players[target];
      if (!p) return;
      delete state.players[target];
      if (p.heroId) releaseHeroIfUnused(manager, session, state, p.heroId);
      for (const [id, token] of Object.entries(state.tokens)) {
        if (token.kind === 'hero' && token.ownerUserId === target) {
          const stillPlayed = token.heroId !== null && Object.values(state.players).some((other) => other.heroId === token.heroId);
          if (!stillPlayed) delete state.tokens[id];
        }
      }
      removeTurnEntries(state, (e) => e.userId === target);
      state.rollRequests = state.rollRequests.filter((r) => r.targetUserId !== target);
      if (state.turnOffer?.userId === target) state.turnOffer = null;
      for (const trade of state.trades) {
        if (isPendingTrade(trade.status) && (trade.fromUserId === target || trade.toUserId === target)) trade.status = 'cancelled';
      }
      delete state.visibility.perPlayer[target];
      delete state.explored[target];
      if (state.projection && Array.isArray(state.projection.targets)) {
        const targets = state.projection.targets.filter((id) => id !== target);
        state.projection = targets.length > 0 ? { ...state.projection, targets } : null;
      }
    },
    { log: { type: 'system', text: `«${player.name}» ha sido expulsado de la partida` }, persistNow: true },
  );
  manager.emitEvent(session, { type: 'kicked', reason: KICKED_REASON }, { kind: 'users', userIds: [target] });
  manager.removeSockets(session, (userId) => userId === target);
  manager.broadcastSessionsList();
  return null;
}

export function registerLobbyHandlers(socket: AppSocket, manager: SessionManager): void {
  manager.register(socket, 'lobby:selectHero', (ctx, payload) => selectHero(manager, ctx, payload.heroId));
  manager.register(socket, 'lobby:setReady', (ctx, payload) => setReady(manager, ctx, payload.ready));
  manager.register(socket, 'lobby:kick', (ctx, payload) => kick(manager, ctx, payload.userId), { dmOnly: true });
}
