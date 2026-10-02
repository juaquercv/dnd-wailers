import {
  checkPlayerAction,
  customInventoryItem,
  economyApplies,
  emptyZoneLiveState,
  gridDistance,
  inventoryItemFromEntry,
  newId,
  sessionOptionsOf,
  usageOf,
  type HeroSheet,
  type InventoryItem,
  type LibraryEntry,
  type LiveState,
  type LogEntry,
  type Token,
  type ZoneLevel,
} from '@wailers/shared';
import { prisma } from '../../db';
import { entryInclude, entryToDTO } from '../../services/serializers';
import {
  addItemTo,
  addUsage,
  distanceToWall,
  getLevel,
  gridSize,
  heroPlayerId,
  heroTokenOf,
  inventoriesArePublic,
  isHeroOwner,
  itemLabel,
  joinNames,
  playerHero,
  playerSeesToken,
  reqBool,
  reqId,
  reqInt,
  reqText,
  requireHero,
  requirePlaying,
  requireToken,
  requireZone,
  stackableEntryIds,
  visibilityForPlayers,
} from '../helpers';
import { HandlerError, type HandlerCtx, type HandlerModule, type LiveSession, type LogInput, type MutateOptions, type SessionManagerApi } from '../types';
import { announceTurnStart, landAfterRemoval, removeTurnEntries, turnPointer, type TurnLanding } from './turns';

/*
 * Turn economy actions: DM usage adjustments, combat actions (attacks, using items) that spend one
 * action of the hero's turn in combat, and free interactions of the players' heroes on the map
 * (picking up item tokens next to them, opening/closing doors next to them). Nothing here applies
 * game effects: using an item or an action is logged, and the DM adjusts HP or anything else by hand.
 */

const NOT_YOUR_HERO = 'Ese héroe no es tuyo';
const ITEM_GONE = 'Ese objeto ya no está en el inventario';
const USAGE_DELTA_MAX = 1000;
/** A door is within reach when its nearest point is at most this many cells from the hero's centre. */
const DOOR_REACH_CELLS = 1.5;

type LogVisibility = Pick<LogInput, 'visibility' | 'targetUserId'>;

/** News about a hero: public unless their token is hidden (then the DM and their player). */
function heroNewsVisibility(state: LiveState, hero: HeroSheet): LogVisibility {
  const hidden = Object.values(state.tokens).some((t) => t.kind === 'hero' && t.heroId === hero.id && t.hidden);
  if (!hidden) return { visibility: 'all' };
  const playerId = heroPlayerId(state, hero);
  return playerId ? { visibility: 'user', targetUserId: playerId } : { visibility: 'dm' };
}

/** Inventory news: public only when every other player may see other inventories. */
function inventoryNewsVisibility(state: LiveState, hero: HeroSheet): LogVisibility {
  const playerId = heroPlayerId(state, hero);
  if (inventoriesArePublic(state, [playerId])) return { visibility: 'all' };
  return playerId ? { visibility: 'user', targetUserId: playerId } : { visibility: 'dm' };
}

function requireOwnHero(ctx: HandlerCtx, heroIdRaw: unknown): HeroSheet {
  const hero = requireHero(ctx.session.state, heroIdRaw);
  if (!ctx.isDm) {
    requirePlaying(ctx);
    if (!isHeroOwner(ctx.session.state, hero, ctx.userId)) throw new HandlerError(NOT_YOUR_HERO);
  }
  return hero;
}

/**
 * Inside mutate: a combat action of `heroId`. A player is checked against the turn economy (own turn,
 * actions left); the DM spends without checks, and only while the turn economy applies.
 */
function spendAction(ctx: HandlerCtx, state: LiveState, heroId: string, dmSpends: boolean): void {
  if (ctx.isDm) {
    if (dmSpends && economyApplies(state)) addUsage(state, heroId, { actions: 1 });
    return;
  }
  const check = checkPlayerAction(state, heroId);
  if (!check.ok) throw new HandlerError(check.reason);
  if (check.cost > 0) addUsage(state, heroId, { actions: check.cost });
}

// ---------------------------------------------------------------------------
// usage:adjust (DM)
// ---------------------------------------------------------------------------

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function usageDelta(value: unknown, label: string): number {
  if (value === undefined || value === null) return 0;
  return reqInt(value, label, -USAGE_DELTA_MAX, USAGE_DELTA_MAX);
}

function adjustUsage(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { heroId: string; reset?: boolean; movedDelta?: number; actionsDelta?: number; bonusMoveDelta?: number; bonusActionsDelta?: number },
): null {
  const state = ctx.session.state;
  const hero = requireHero(state, payload.heroId);
  const reset = payload.reset === undefined || payload.reset === null ? false : reqBool(payload.reset, 'reiniciar');
  const moved = usageDelta(payload.movedDelta, 'movimiento gastado');
  const actions = usageDelta(payload.actionsDelta, 'acciones gastadas');
  const bonusMove = usageDelta(payload.bonusMoveDelta, 'movimiento extra');
  const bonusActions = usageDelta(payload.bonusActionsDelta, 'acciones extra');
  if (!reset && moved === 0 && actions === 0 && bonusMove === 0 && bonusActions === 0) return null;

  const parts: string[] = [];
  if (reset) parts.push('movimiento y acciones recuperados');
  if (bonusMove !== 0) parts.push(`${signed(bonusMove)} ${Math.abs(bonusMove) === 1 ? 'casilla' : 'casillas'} de movimiento extra`);
  if (bonusActions !== 0) parts.push(`${signed(bonusActions)} ${Math.abs(bonusActions) === 1 ? 'acción extra' : 'acciones extra'}`);
  if (moved !== 0) parts.push(`movimiento gastado ${signed(moved)}`);
  if (actions !== 0) parts.push(`acciones gastadas ${signed(actions)}`);
  const playerId = heroPlayerId(state, hero);

  manager.mutate(
    ctx.session,
    (s) => {
      if (!s.heroes[hero.id]) throw new HandlerError('Ese héroe no está en la partida');
      if (reset) {
        const current = usageOf(s, hero.id);
        addUsage(s, hero.id, { moved: -current.moved, actions: -current.actions });
      }
      addUsage(s, hero.id, { moved, actions, bonusMove, bonusActions });
    },
    {
      log: {
        type: 'turn',
        text: `⏳ El DM ajusta el turno de ${hero.name}: ${parts.join(', ')}`,
        actorUserId: ctx.userId,
        ...(playerId ? { visibility: 'user' as const, targetUserId: playerId } : { visibility: 'dm' as const }),
      },
    },
  );
  return null;
}

// ---------------------------------------------------------------------------
// action:use / item:use
// ---------------------------------------------------------------------------

function useAction(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; label: string }): null {
  const hero = requireOwnHero(ctx, payload.heroId);
  const label = reqText(payload.label, 'acción', 120, 1);
  manager.mutate(
    ctx.session,
    (s) => {
      if (!s.heroes[hero.id]) throw new HandlerError('Ese héroe no está en la partida');
      spendAction(ctx, s, hero.id, true);
    },
    {
      log: {
        type: 'system',
        text: `⚔️ ${hero.name} usa una acción: ${label}`,
        actorUserId: ctx.userId,
        ...heroNewsVisibility(ctx.session.state, hero),
      },
    },
  );
  return null;
}

function useItem(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; itemId: string; consume?: boolean }): null {
  const hero = requireOwnHero(ctx, payload.heroId);
  const itemId = reqId(payload.itemId, 'objeto');
  const consume = payload.consume === undefined || payload.consume === null ? false : reqBool(payload.consume, 'gastar');
  const item = hero.data.inventory.find((it) => it.id === itemId);
  if (!item) throw new HandlerError(ITEM_GONE);
  const left = item.quantity - 1;
  const tail = !consume ? '' : left > 0 ? ` (quedan ${left})` : ' (era el último)';
  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      const it = h?.data.inventory.find((x) => x.id === itemId);
      if (!h || !it) throw new HandlerError(ITEM_GONE);
      spendAction(ctx, s, h.id, false);
      if (!consume) return;
      if (it.quantity > 1) it.quantity -= 1;
      else h.data.inventory = h.data.inventory.filter((x) => x.id !== itemId);
    },
    {
      heroes: consume ? [hero.id] : undefined,
      log: {
        type: 'item',
        text: `🧪 ${hero.name} usa ${item.name}${tail}`,
        actorUserId: ctx.userId,
        ...inventoryNewsVisibility(ctx.session.state, hero),
      },
    },
  );
  return null;
}

// ---------------------------------------------------------------------------
// token:pickup (free action)
// ---------------------------------------------------------------------------

/** Library item behind an item token (null when the entry is gone or is not an item). */
async function itemEntryOf(entryId: string | null): Promise<LibraryEntry<'item'> | null> {
  if (!entryId) return null;
  const row = await prisma.libraryEntry.findUnique({ where: { id: entryId }, include: entryInclude(null) });
  if (!row || row.kind !== 'item') return null;
  return entryToDTO<'item'>(row);
}

/** Hero token of the player and the level it stands on (throws a Spanish reason). */
function playerHeroOnMap(ctx: HandlerCtx, state: LiveState, what: string): { hero: HeroSheet; token: Token; level: ZoneLevel } {
  const hero = playerHero(state, ctx.userId);
  if (!hero) throw new HandlerError(`Necesitas un héroe para ${what}`);
  const token = heroTokenOf(state, ctx.userId);
  if (!token) throw new HandlerError('Tu héroe no está en el mapa');
  const loc = getLevel(ctx.session, token.zoneId, token.levelId);
  if (!loc) throw new HandlerError('Tu héroe no está en el mapa');
  return { hero, token, level: loc.level };
}

/** Grid cells between two token centres, counting the size of big tokens (at least 1 cell apart = adjacent). */
function cellsBetween(a: Token, b: Token, level: ZoneLevel): number {
  const size = gridSize(level);
  const raw = level.grid.size > 0 ? gridDistance(a, b, level.grid) : Math.floor(Math.hypot(a.x - b.x, a.y - b.y) / size);
  const extent = (t: Token): number => Math.max(0, Math.ceil(((Number.isFinite(t.cells) ? t.cells : 1) - 1) / 2));
  return Math.max(0, raw - extent(a) - extent(b));
}

/** Validates that the player's hero can pick up `tokenId` now (same zone and level, next to it, visible). */
function pickupTarget(ctx: HandlerCtx, session: LiveSession, state: LiveState, tokenId: string): { hero: HeroSheet; item: Token } {
  const item = state.tokens[tokenId];
  if (!item || item.hidden) throw new HandlerError('Ese objeto ya no está en el mapa');
  if (item.kind !== 'item') throw new HandlerError('Solo se pueden recoger objetos');
  const { hero, token, level } = playerHeroOnMap(ctx, state, 'recoger objetos');
  if (item.zoneId !== token.zoneId || item.levelId !== token.levelId) throw new HandlerError('Ese objeto no está donde está tu héroe');
  if (!playerSeesToken(session, ctx.userId, item)) throw new HandlerError('Tu héroe no ve ese objeto');
  if (cellsBetween(token, item, level) > 1) throw new HandlerError('Acércate más: el objeto tiene que estar en una casilla junto a tu héroe');
  return { hero, item };
}

async function pickUp(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string }): Promise<null> {
  if (ctx.isDm) throw new HandlerError('Solo los héroes de los jugadores recogen objetos del mapa (usa el botín o el inventario)');
  requirePlaying(ctx);
  const session = ctx.session;
  if (!sessionOptionsOf(session.state).playersCanPickUp) throw new HandlerError('El DM no permite recoger objetos ahora mismo');
  const tokenId = requireToken(session.state, payload.tokenId).id;
  const first = pickupTarget(ctx, session, session.state, tokenId);
  const entry = await itemEntryOf(first.item.entryId);
  const stackable = await stackableEntryIds([entry?.id, ...first.item.loot.map((it) => it.entryId)]);

  const picked: InventoryItem[] = [];
  const opts: MutateOptions = {};
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    session,
    (s) => {
      // The game may have changed while the library entry was loading (someone else picked it up).
      if (!sessionOptionsOf(s).playersCanPickUp) throw new HandlerError('El DM no permite recoger objetos ahora mismo');
      const { hero, item } = pickupTarget(ctx, session, s, tokenId);
      const h = s.heroes[hero.id]!;
      opts.heroes = [hero.id];
      const base = entry && entry.id === item.entryId ? inventoryItemFromEntry(entry, 1) : customInventoryItem({ name: item.name, imageUrl: item.imageUrl });
      const items = [base, ...item.loot.map((it) => ({ ...structuredClone(it), id: newId('inv'), equipped: false }))];
      for (const it of items) {
        picked.push({ ...it });
        addItemTo(h.data.inventory, it, stackable);
      }
      const before = turnPointer(s);
      delete s.tokens[item.id];
      removeTurnEntries(s, (e) => e.tokenId === item.id && e.type !== 'player');
      out.landing = landAfterRemoval(session, s, opts, before);

      const names = joinNames(picked.map((it) => itemLabel(it.name, it.quantity)));
      const receiver = ctx.userId;
      const publicNews =
        inventoriesArePublic(s, [receiver]) && visibilityForPlayers(s, (uid) => uid === receiver || playerSeesToken(session, uid, item)) === 'all';
      const visibility: LogEntry['visibility'] = publicNews ? 'all' : 'user';
      opts.log = {
        type: 'loot',
        text: `🎒 ${hero.name} recoge ${names}`,
        actorUserId: ctx.userId,
        visibility,
        targetUserId: publicNews ? null : receiver,
      };
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, session, out.landing);
  return null;
}

// ---------------------------------------------------------------------------
// door:use (free action)
// ---------------------------------------------------------------------------

function useDoor(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; wallId: string }): null {
  const session = ctx.session;
  const state = session.state;
  const zone = requireZone(manager, session, payload.zoneId);
  const wallId = reqId(payload.wallId, 'puerta');
  const level = zone.levels.find((l) => l.walls.some((w) => w.id === wallId));
  const wall = level?.walls.find((w) => w.id === wallId);
  if (!level || !wall) throw new HandlerError('Esa puerta no existe');
  if (wall.kind !== 'door') throw new HandlerError('Esa pared no es una puerta');

  let actor: HeroSheet | null = null;
  if (!ctx.isDm) {
    requirePlaying(ctx);
    if (!sessionOptionsOf(state).playersCanUseDoors) throw new HandlerError('El DM no permite usar las puertas ahora mismo');
    const { hero, token } = playerHeroOnMap(ctx, state, 'abrir puertas');
    if (token.zoneId !== zone.id || token.levelId !== level.id) throw new HandlerError('Tu héroe no está junto a esa puerta');
    const size = gridSize(level);
    const reach = (DOOR_REACH_CELLS + Math.max(0, ((Number.isFinite(token.cells) ? token.cells : 1) - 1) / 2)) * size;
    if (distanceToWall(token, wall) > reach) throw new HandlerError('Acércate más: tu héroe tiene que estar junto a la puerta');
    actor = hero;
  }

  const current = state.zoneStates[zone.id]?.doors[wallId];
  const open = !(typeof current === 'boolean' ? current : wall.open);
  const who = actor?.name ?? 'El DM';
  const log: LogInput = {
    type: 'system',
    text: `🚪 ${who} ${open ? 'abre' : 'cierra'} una puerta`,
    actorUserId: ctx.userId,
    ...(actor ? heroNewsVisibility(state, actor) : { visibility: 'dm' as const }),
  };
  manager.mutate(
    session,
    (s) => {
      const zs = (s.zoneStates[zone.id] ??= emptyZoneLiveState());
      zs.doors[wallId] = open;
    },
    { log },
  );
  return null;
}

// ---------------------------------------------------------------------------

export const registerActionHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'usage:adjust', (ctx, payload) => adjustUsage(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'action:use', (ctx, payload) => useAction(manager, ctx, payload));
  manager.register(socket, 'item:use', (ctx, payload) => useItem(manager, ctx, payload));
  manager.register(socket, 'token:pickup', (ctx, payload) => pickUp(manager, ctx, payload));
  manager.register(socket, 'door:use', (ctx, payload) => useDoor(manager, ctx, payload));
};
