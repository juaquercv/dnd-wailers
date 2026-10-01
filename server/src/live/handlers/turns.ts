import {
  effectiveVisibility,
  newId,
  secureRandomInt,
  type HeroSheet,
  type InitiativeDraw,
  type LiveState,
  type Roller,
  type SessionPlayer,
  type TurnEntry,
} from '@wailers/shared';
import { isPlainObject } from '../../services/serializers';
import type { SessionManager } from '../SessionManager';
import { HandlerError, type AppSocket, type HandlerCtx, type LiveSession, type LogInput, type MutateOptions } from '../types';

/*
 * Turn order (DM): manual/random modes, secure initiative draw, navigation with turn start
 * announcements (turn rollers offered only to the player whose turn it is) and entry editing.
 */

const TURN_TYPES: readonly TurnEntry['type'][] = ['player', 'creature', 'npc', 'custom'];
const NAME_MAX = 80;
const URL_MAX = 2000;
const EMPTY_ORDER = 'No hay nadie en el orden de turnos';
const UNKNOWN_ENTRY = 'Esa entrada no está en el orden de turnos';

// ---------------------------------------------------------------------------
// Shared helpers (also used by the session and lobby handlers)
// ---------------------------------------------------------------------------

/** Hero of a turn entry (entry hero, else the hero selected by the entry's player). */
export function heroForEntry(state: LiveState, entry: TurnEntry): HeroSheet | null {
  const heroId = entry.heroId ?? (entry.userId ? (state.players[entry.userId]?.heroId ?? null) : null);
  return heroId ? (state.heroes[heroId] ?? null) : null;
}

function heroTokenId(state: LiveState, heroId: string): string | null {
  return Object.values(state.tokens).find((t) => t.kind === 'hero' && t.heroId === heroId)?.id ?? null;
}

function playerEntry(state: LiveState, player: SessionPlayer, hero: HeroSheet): TurnEntry {
  return {
    id: newId('turn'),
    type: 'player',
    userId: player.userId,
    heroId: hero.id,
    tokenId: heroTokenId(state, hero.id),
    name: hero.name,
    imageUrl: hero.imageUrl,
    initiative: null,
  };
}

/** Keep the current entry current after the order array was replaced. */
function restoreCurrent(state: LiveState, previous: TurnEntry[], next: TurnEntry[]): void {
  const current = previous[state.turn.currentIndex];
  state.turn.order = next;
  if (next.length === 0) {
    state.turn.currentIndex = 0;
    return;
  }
  const kept = current ? next.findIndex((e) => e.id === current.id) : -1;
  if (kept >= 0) {
    state.turn.currentIndex = kept;
    return;
  }
  // The current entry disappeared: the next surviving entry after it becomes current.
  const survivorIds = new Set(next.map((e) => e.id));
  const before = previous.slice(0, state.turn.currentIndex).filter((e) => survivorIds.has(e.id)).length;
  state.turn.currentIndex = before % next.length;
}

/** Remove entries matching `predicate` keeping the turn pointer coherent. Returns how many were removed. */
export function removeTurnEntries(state: LiveState, predicate: (entry: TurnEntry) => boolean): number {
  const previous = state.turn.order;
  const current = previous[state.turn.currentIndex];
  const next = previous.filter((e) => !predicate(e));
  const removed = previous.length - next.length;
  if (removed === 0) return 0;
  restoreCurrent(state, previous, next);
  if (current && !next.includes(current)) state.turnOffer = null;
  return removed;
}

/**
 * One 'player' entry per player with a hero: existing entries keep their place and initiative,
 * entries of players that left (or have no hero) are removed, new players are appended.
 */
export function syncPlayerEntries(state: LiveState): void {
  const players = Object.values(state.players)
    .filter((p) => p.heroId && state.heroes[p.heroId])
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const byUser = new Map(players.map((p) => [p.userId, p]));
  const seen = new Set<string>();
  const next: TurnEntry[] = [];
  for (const entry of state.turn.order) {
    if (entry.type !== 'player') {
      next.push(entry);
      continue;
    }
    const player = entry.userId ? byUser.get(entry.userId) : undefined;
    if (!player || seen.has(player.userId)) continue;
    seen.add(player.userId);
    const hero = state.heroes[player.heroId!]!;
    next.push({ ...entry, heroId: hero.id, tokenId: heroTokenId(state, hero.id) ?? entry.tokenId, name: hero.name, imageUrl: hero.imageUrl });
  }
  for (const player of players) {
    if (!seen.has(player.userId)) next.push(playerEntry(state, player, state.heroes[player.heroId!]!));
  }
  const previous = state.turn.order;
  restoreCurrent(state, previous, next);
  if (state.turnOffer && !next.some((e) => e.type === 'player' && e.userId === state.turnOffer?.userId)) state.turnOffer = null;
}

function appendLog(opts: MutateOptions, log: LogInput): void {
  const current = opts.log ? (Array.isArray(opts.log) ? opts.log : [opts.log]) : [];
  opts.log = [...current, log];
}

function isHiddenEntry(state: LiveState, entry: TurnEntry): boolean {
  return entry.tokenId ? state.tokens[entry.tokenId]?.hidden === true : false;
}

interface Landing {
  entry: TurnEntry;
  round: number;
  turnUserId: string | null;
  offered: Roller[];
  hidden: boolean;
}

/**
 * Inside mutate: the current entry starts its turn. Sets the turn offer (active turn rollers for a
 * player entry) and, when the campaign enables it, regenerates that hero's mana. Only while playing.
 */
function applyLanding(manager: SessionManager, session: LiveSession, state: LiveState, opts: MutateOptions): Landing | null {
  const entry = state.turn.order[state.turn.currentIndex];
  if (!entry || state.status !== 'playing') {
    state.turnOffer = null;
    return null;
  }
  const turnUserId = entry.type === 'player' && entry.userId && state.players[entry.userId] ? entry.userId : null;
  const offered = turnUserId ? manager.turnRollers(session) : [];
  state.turnOffer = turnUserId && offered.length > 0 ? { userId: turnUserId, rollerIds: offered.map((r) => r.id) } : null;

  let regenText = '';
  const magic = session.campaign.rules.magic;
  if (magic.mode === 'mana' && magic.manaAutoRegen) {
    const hero = heroForEntry(state, entry);
    if (hero) {
      const mana = hero.data.resources.mana;
      const regen = Number.isFinite(magic.manaRegenPerTurn) ? Math.max(0, magic.manaRegenPerTurn) : 0;
      const next = Math.min(mana.max, mana.current + regen);
      if (next > mana.current) {
        regenText = ` · +${next - mana.current} ${magic.manaName || 'recurso'}`;
        mana.current = next;
        opts.heroes = [...(opts.heroes ?? []), hero.id];
      }
    }
  }

  const hidden = isHiddenEntry(state, entry);
  appendLog(opts, {
    type: 'turn',
    text: `Turno de ${entry.name} (ronda ${state.turn.round})${regenText}`,
    visibility: hidden ? 'dm' : 'all',
    data: { entryId: entry.id, round: state.turn.round },
  });
  return { entry: structuredClone(entry), round: state.turn.round, turnUserId, offered, hidden };
}

/** turnStart for everyone; only the player whose turn it is receives the offered rollers. */
function announceLanding(manager: SessionManager, session: LiveSession, landing: Landing): void {
  const state = session.state;
  const base = { type: 'turnStart' as const, entry: landing.entry, round: landing.round, offeredRollers: [] as Roller[] };
  const others: string[] = [];
  if (!landing.hidden) {
    for (const player of Object.values(state.players)) {
      if (player.userId === landing.turnUserId) continue;
      if (effectiveVisibility(state, player.userId).canSeeInitiative) others.push(player.userId);
    }
  }
  manager.emitEvent(session, base, { kind: 'dmAnd', userIds: others });
  if (landing.turnUserId) {
    manager.emitEvent(session, { ...base, offeredRollers: landing.offered }, { kind: 'users', userIds: [landing.turnUserId] });
  }
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function entryIdOf(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.length > 200) throw new HandlerError(UNKNOWN_ENTRY);
  return value;
}

function nameOf(value: unknown): string {
  if (typeof value !== 'string') throw new HandlerError('El nombre no es válido');
  const name = value.trim();
  if (!name) throw new HandlerError('El nombre no puede estar vacío');
  if (name.length > NAME_MAX) throw new HandlerError(`El nombre es demasiado largo (máximo ${NAME_MAX} caracteres)`);
  return name;
}

function optionalId(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 200) throw new HandlerError(`${label} no válido`);
  return value;
}

function imageOf(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > URL_MAX) throw new HandlerError('La imagen no es válida');
  return value;
}

function initiativeOf(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1000) throw new HandlerError('La iniciativa no es válida');
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function moveTurn(manager: SessionManager, ctx: HandlerCtx, step: 1 | -1): null {
  if (ctx.session.state.turn.order.length === 0) throw new HandlerError(EMPTY_ORDER);
  const opts: MutateOptions = {};
  const out: { landing: Landing | null } = { landing: null };
  manager.mutate(
    ctx.session,
    (state) => {
      const length = state.turn.order.length;
      if (length === 0) throw new HandlerError(EMPTY_ORDER);
      const current = Math.min(Math.max(state.turn.currentIndex, 0), length - 1);
      let index = current + step;
      if (index >= length) {
        index = 0;
        state.turn.round += 1;
      } else if (index < 0) {
        index = length - 1;
        state.turn.round = Math.max(1, state.turn.round - 1);
      }
      state.turn.currentIndex = index;
      out.landing = applyLanding(manager, ctx.session, state, opts);
    },
    opts,
  );
  if (out.landing) announceLanding(manager, ctx.session, out.landing);
  return null;
}

function randomize(manager: SessionManager, ctx: HandlerCtx): null {
  const session = ctx.session;
  if (session.state.turn.order.length === 0) throw new HandlerError(EMPTY_ORDER);
  const opts: MutateOptions = {};
  const out: { draws: InitiativeDraw[]; order: string[]; hiddenIds: Set<string>; landing: Landing | null } = {
    draws: [],
    order: [],
    hiddenIds: new Set(),
    landing: null,
  };
  manager.mutate(
    session,
    (state) => {
      const rolled = state.turn.order.map((entry) => {
        const natural = secureRandomInt(20) + 1;
        const bonusRaw = entry.type === 'player' ? (heroForEntry(state, entry)?.data.initiativeBonus ?? 0) : 0;
        const bonus = Number.isFinite(bonusRaw) ? Math.round(bonusRaw) : 0;
        return { entry, total: natural + bonus, tiebreak: secureRandomInt(1_000_000) };
      });
      rolled.sort((a, b) => b.total - a.total || b.tiebreak - a.tiebreak);
      for (const r of rolled) r.entry.initiative = r.total;
      state.turn.order = rolled.map((r) => r.entry);
      state.turn.mode = 'random';
      state.turn.currentIndex = 0;
      state.turn.round = 1;

      for (const entry of state.turn.order) if (isHiddenEntry(state, entry)) out.hiddenIds.add(entry.id);
      out.draws = rolled.map((r) => ({ entryId: r.entry.id, name: r.entry.name, imageUrl: r.entry.imageUrl, roll: r.total }));
      out.order = state.turn.order.map((e) => e.id);

      const describe = (draws: InitiativeDraw[]): string => draws.map((d) => `${d.name} (${d.roll})`).join(', ');
      const publicDraws = out.draws.filter((d) => !out.hiddenIds.has(d.entryId));
      if (out.hiddenIds.size > 0) {
        appendLog(opts, { type: 'turn', visibility: 'dm', text: `Iniciativa sorteada: ${describe(out.draws)}`, data: { draws: out.draws } });
      }
      if (publicDraws.length > 0) {
        appendLog(opts, { type: 'turn', text: `Iniciativa sorteada: ${describe(publicDraws)}`, data: { draws: publicDraws } });
      }
      out.landing = applyLanding(manager, session, state, opts);
    },
    opts,
  );

  if (out.hiddenIds.size === 0) {
    manager.emitEvent(session, { type: 'initiativeDraw', draws: out.draws, order: out.order });
  } else {
    manager.emitEvent(session, { type: 'initiativeDraw', draws: out.draws, order: out.order }, { kind: 'dm' });
    const players = Object.keys(session.state.players);
    if (players.length > 0) {
      manager.emitEvent(
        session,
        {
          type: 'initiativeDraw',
          draws: out.draws.filter((d) => !out.hiddenIds.has(d.entryId)),
          order: out.order.filter((id) => !out.hiddenIds.has(id)),
        },
        { kind: 'users', userIds: players },
      );
    }
  }
  if (out.landing) announceLanding(manager, session, out.landing);
  return null;
}

function setCurrent(manager: SessionManager, ctx: HandlerCtx, entryIdRaw: unknown): null {
  const entryId = entryIdOf(entryIdRaw);
  if (!ctx.session.state.turn.order.some((e) => e.id === entryId)) throw new HandlerError(UNKNOWN_ENTRY);
  const opts: MutateOptions = {};
  const out: { landing: Landing | null } = { landing: null };
  manager.mutate(
    ctx.session,
    (state) => {
      const index = state.turn.order.findIndex((e) => e.id === entryId);
      if (index < 0) throw new HandlerError(UNKNOWN_ENTRY);
      state.turn.currentIndex = index;
      out.landing = applyLanding(manager, ctx.session, state, opts);
    },
    opts,
  );
  if (out.landing) announceLanding(manager, ctx.session, out.landing);
  return null;
}

function addEntry(manager: SessionManager, ctx: HandlerCtx, payload: { entry: unknown; index?: unknown }): null {
  const raw = payload.entry;
  if (!isPlainObject(raw)) throw new HandlerError('Datos inválidos');
  const state = ctx.session.state;
  const type = typeof raw.type === 'string' && (TURN_TYPES as readonly string[]).includes(raw.type) ? (raw.type as TurnEntry['type']) : 'custom';
  const tokenId = optionalId(raw.tokenId, 'Ficha');
  const token = tokenId ? state.tokens[tokenId] : undefined;
  if (tokenId && !token) throw new HandlerError('Esa ficha no existe');
  if (tokenId && state.turn.order.some((e) => e.tokenId === tokenId)) throw new HandlerError('Esa ficha ya está en el orden de turnos');

  let userId = optionalId(raw.userId, 'Jugador');
  let heroId = optionalId(raw.heroId, 'Héroe');
  if (type === 'player') {
    userId ??= token?.ownerUserId ?? null;
    const player = userId ? state.players[userId] : undefined;
    if (!player) throw new HandlerError('Ese jugador no está en la partida');
    if (state.turn.order.some((e) => e.type === 'player' && e.userId === player.userId)) {
      throw new HandlerError('Ese jugador ya está en el orden de turnos');
    }
    heroId ??= player.heroId;
  }
  const hero = heroId ? state.heroes[heroId] : undefined;
  const nameSource = raw.name === undefined || raw.name === null || raw.name === '' ? (hero?.name ?? token?.name ?? '') : raw.name;
  const name = nameOf(nameSource);
  const imageUrl = raw.imageUrl === undefined ? (hero?.imageUrl ?? token?.imageUrl ?? null) : imageOf(raw.imageUrl);
  const initiative = initiativeOf(raw.initiative);

  let index: number | null = null;
  if (payload.index !== undefined && payload.index !== null) {
    if (typeof payload.index !== 'number' || !Number.isInteger(payload.index)) throw new HandlerError('Posición no válida');
    index = payload.index;
  }

  manager.mutate(ctx.session, (s) => {
    const entry: TurnEntry = { id: newId('turn'), type, userId, heroId: hero ? hero.id : heroId, tokenId, name, imageUrl, initiative };
    const order = s.turn.order;
    const at = index === null ? order.length : Math.min(Math.max(index, 0), order.length);
    const hadEntries = order.length > 0;
    order.splice(at, 0, entry);
    if (hadEntries && at <= s.turn.currentIndex) s.turn.currentIndex += 1;
  });
  return null;
}

function updateEntry(manager: SessionManager, ctx: HandlerCtx, payload: { entryId: unknown; patch: unknown }): null {
  const entryId = entryIdOf(payload.entryId);
  if (!isPlainObject(payload.patch)) throw new HandlerError('Datos inválidos');
  const patch = payload.patch;
  const changes: Partial<Pick<TurnEntry, 'name' | 'initiative' | 'imageUrl'>> = {};
  if ('name' in patch) changes.name = nameOf(patch.name);
  if ('initiative' in patch) changes.initiative = initiativeOf(patch.initiative);
  if ('imageUrl' in patch) changes.imageUrl = imageOf(patch.imageUrl);
  if (!ctx.session.state.turn.order.some((e) => e.id === entryId)) throw new HandlerError(UNKNOWN_ENTRY);
  manager.mutate(ctx.session, (state) => {
    const entry = state.turn.order.find((e) => e.id === entryId);
    if (!entry) throw new HandlerError(UNKNOWN_ENTRY);
    Object.assign(entry, changes);
  });
  return null;
}

function setOrder(manager: SessionManager, ctx: HandlerCtx, orderRaw: unknown): null {
  if (!Array.isArray(orderRaw) || !orderRaw.every((id): id is string => typeof id === 'string')) throw new HandlerError('Datos inválidos');
  const current = ctx.session.state.turn.order;
  const ids = new Set(orderRaw);
  const permutation =
    orderRaw.length === current.length && ids.size === orderRaw.length && current.every((e) => ids.has(e.id));
  if (!permutation) throw new HandlerError('El nuevo orden no coincide con las entradas actuales. Recarga e inténtalo de nuevo.');
  manager.mutate(ctx.session, (state) => {
    const byId = new Map(state.turn.order.map((e) => [e.id, e]));
    const next = orderRaw.map((id) => byId.get(id)).filter((e): e is TurnEntry => e !== undefined);
    if (next.length !== state.turn.order.length) throw new HandlerError('El nuevo orden no coincide con las entradas actuales');
    restoreCurrent(state, state.turn.order, next);
  });
  return null;
}

export function registerTurnHandlers(socket: AppSocket, manager: SessionManager): void {
  const dmOnly = { dmOnly: true };

  manager.register(
    socket,
    'turn:setMode',
    (ctx, payload) => {
      const mode = payload.mode;
      if (mode !== 'manual' && mode !== 'random') throw new HandlerError('Modo de turnos no válido');
      manager.mutate(ctx.session, (state) => {
        state.turn.mode = mode;
      });
      return null;
    },
    dmOnly,
  );

  manager.register(socket, 'turn:randomize', (ctx) => randomize(manager, ctx), dmOnly);
  manager.register(socket, 'turn:setOrder', (ctx, payload) => setOrder(manager, ctx, payload.order), dmOnly);
  manager.register(socket, 'turn:next', (ctx) => moveTurn(manager, ctx, 1), dmOnly);
  manager.register(socket, 'turn:prev', (ctx) => moveTurn(manager, ctx, -1), dmOnly);
  manager.register(socket, 'turn:setCurrent', (ctx, payload) => setCurrent(manager, ctx, payload.entryId), dmOnly);
  manager.register(socket, 'turn:add', (ctx, payload) => addEntry(manager, ctx, payload), dmOnly);

  manager.register(
    socket,
    'turn:remove',
    (ctx, payload) => {
      const entryId = entryIdOf(payload.entryId);
      if (!ctx.session.state.turn.order.some((e) => e.id === entryId)) throw new HandlerError(UNKNOWN_ENTRY);
      manager.mutate(ctx.session, (state) => {
        if (removeTurnEntries(state, (e) => e.id === entryId) === 0) throw new HandlerError(UNKNOWN_ENTRY);
      });
      return null;
    },
    dmOnly,
  );

  manager.register(socket, 'turn:update', (ctx, payload) => updateEntry(manager, ctx, payload), dmOnly);

  manager.register(
    socket,
    'turn:syncPlayers',
    (ctx) => {
      manager.mutate(ctx.session, (state) => syncPlayerEntries(state));
      return null;
    },
    dmOnly,
  );
}
