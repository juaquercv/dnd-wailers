import {
  currentTurnEntry,
  effectiveVisibility,
  heroIdOfEntry,
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
import { playerKnowsTurnEntry, resetUsage } from '../helpers';
import type { SessionManager } from '../SessionManager';
import {
  HandlerError,
  type AppSocket,
  type HandlerCtx,
  type LiveSession,
  type LogInput,
  type MutateOptions,
  type SessionManagerApi,
} from '../types';

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

/** Whether a player may learn who an entry is: never for hidden tokens, creatures only while in sight. */
function knownTo(session: LiveSession, entry: TurnEntry, userId: string): boolean {
  return !isHiddenEntry(session.state, entry) && playerKnowsTurnEntry(session, userId, entry);
}

/** Players allowed to follow the turn order (canSeeInitiative). */
function initiativeViewers(state: LiveState): string[] {
  return Object.keys(state.players).filter((uid) => uid !== state.hostUserId && effectiveVisibility(state, uid).canSeeInitiative);
}

interface TurnNews {
  text: string;
  data: Record<string, unknown>;
}

/**
 * Log lines about the turn order. `forPlayer` is what a player may read (null: nothing). When every
 * player may see the initiative and reads the same line, it is one public line (plus the DM's full
 * line when it differs). Otherwise the DM gets the full line and each allowed player a private copy
 * (marked `playerCopy`, which the DM does not receive twice); players without canSeeInitiative get nothing.
 */
function appendTurnNews(opts: MutateOptions, state: LiveState, full: TurnNews, forPlayer: (userId: string) => TurnNews | null): void {
  const players = Object.keys(state.players).filter((uid) => uid !== state.hostUserId);
  const reads = new Map<string, TurnNews>();
  for (const uid of initiativeViewers(state)) {
    const news = forPlayer(uid);
    if (news) reads.set(uid, news);
  }
  const texts = new Set([...reads.values()].map((n) => n.text));
  const [common] = reads.values();
  if (common && players.length > 0 && reads.size === players.length && texts.size === 1) {
    if (common.text !== full.text) appendLog(opts, { type: 'turn', visibility: 'dm', text: full.text, data: full.data });
    appendLog(opts, { type: 'turn', text: common.text, data: common.data });
    return;
  }
  appendLog(opts, { type: 'turn', visibility: 'dm', text: full.text, data: full.data });
  for (const [uid, news] of reads) {
    appendLog(opts, { type: 'turn', visibility: 'user', targetUserId: uid, text: news.text, data: { ...news.data, playerCopy: true } });
  }
}

/** Active turn rollers of the campaign (offered to a player at the start of their turn). */
function turnRollersOf(session: LiveSession): Roller[] {
  return session.campaign.rollers.filter((r) => r.active && r.isTurnRoll);
}

/** Player whose turn an entry is (null for creatures, NPCs, custom entries and players who left). */
function turnUserOf(state: LiveState, entry: TurnEntry): string | null {
  return entry.type === 'player' && entry.userId && state.players[entry.userId] ? entry.userId : null;
}

/** A turn that just started, to be announced with announceTurnStart once the mutation is applied. */
export interface TurnLanding {
  entry: TurnEntry;
  round: number;
  turnUserId: string | null;
  offered: Roller[];
  hidden: boolean;
}

/** Position of the turn pointer, taken before entries are removed (see landAfterRemoval). */
export interface TurnPointer {
  ids: string[];
  index: number;
}

export function turnPointer(state: LiveState): TurnPointer {
  return { ids: state.turn.order.map((e) => e.id), index: state.turn.currentIndex };
}

/**
 * Inside mutate: the current entry starts its turn. Sets the turn offer (active turn rollers for a
 * player entry) and, when the campaign enables it, regenerates that hero's mana. Only while playing.
 */
export function landCurrentTurn(session: LiveSession, state: LiveState, opts: MutateOptions): TurnLanding | null {
  const entry = state.turn.order[state.turn.currentIndex];
  // A new turn: the movement and combat actions of that hero are available again.
  const startingHeroId = heroIdOfEntry(state, entry ?? null);
  if (startingHeroId) resetUsage(state, startingHeroId);
  if (!entry || state.status !== 'playing') {
    state.turnOffer = null;
    return null;
  }
  const turnUserId = turnUserOf(state, entry);
  const offered = turnUserId ? turnRollersOf(session) : [];
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
  // Creatures are only named to the players who see them on the map.
  const news: TurnNews = { text: `Turno de ${entry.name} (ronda ${state.turn.round})${regenText}`, data: { entryId: entry.id, round: state.turn.round } };
  appendTurnNews(opts, state, news, (uid) => (knownTo(session, entry, uid) ? news : null));
  return { entry: structuredClone(entry), round: state.turn.round, turnUserId, offered, hidden };
}

/**
 * Inside mutate, after turn entries were removed: when the entry that had the turn is gone, the
 * entry now current starts its turn (a new round when the pointer wrapped to the top).
 */
export function landAfterRemoval(session: LiveSession, state: LiveState, opts: MutateOptions, before: TurnPointer): TurnLanding | null {
  const previousId = before.ids[before.index];
  const order = state.turn.order;
  if (!previousId || state.status !== 'playing' || order.length === 0) return null;
  const survivors = new Set(order.map((e) => e.id));
  if (survivors.has(previousId)) return null;
  const survivorsBefore = before.ids.slice(0, before.index).filter((id) => survivors.has(id)).length;
  if (survivorsBefore >= order.length) state.turn.round += 1;
  return landCurrentTurn(session, state, opts);
}

/**
 * Inside mutate, when an empty turn order got its first entries (a new combat after clearing the last
 * one): it starts at the top of round 1 and that entry starts its turn (only while playing).
 */
function landFreshOrder(session: LiveSession, state: LiveState, opts: MutateOptions): TurnLanding | null {
  state.turn.currentIndex = 0;
  state.turn.round = 1;
  return landCurrentTurn(session, state, opts);
}

/**
 * The same turn announced again (a resumed game): no second mana regeneration or log line, and the
 * player keeps only the turn rollers still pending from before the pause.
 */
function reannounceCurrentTurn(session: LiveSession, state: LiveState): TurnLanding | null {
  const entry = state.turn.order[state.turn.currentIndex];
  if (!entry || state.status !== 'playing') {
    state.turnOffer = null;
    return null;
  }
  const turnUserId = turnUserOf(state, entry);
  const pending = turnUserId && state.turnOffer?.userId === turnUserId ? state.turnOffer.rollerIds : [];
  const offered = turnRollersOf(session).filter((r) => pending.includes(r.id));
  state.turnOffer = turnUserId && offered.length > 0 ? { userId: turnUserId, rollerIds: offered.map((r) => r.id) } : null;
  return { entry: structuredClone(entry), round: state.turn.round, turnUserId, offered, hidden: isHiddenEntry(state, entry) };
}

/**
 * Inside the session:start mutation (status already 'playing', hero tokens placed): every player
 * with a hero gets an entry (players who picked a hero after a sync are appended). A first start
 * begins at the top of the order in round 1; a resumed game keeps its turn. The current entry is
 * returned to be announced with announceTurnStart.
 */
export function startTurns(session: LiveSession, state: LiveState, opts: MutateOptions, firstStart: boolean): TurnLanding | null {
  const previousId = state.turn.order[state.turn.currentIndex]?.id ?? null;
  syncPlayerEntries(state);
  if (firstStart) {
    state.turn.currentIndex = 0;
    state.turn.round = 1;
    return landCurrentTurn(session, state, opts);
  }
  const current = state.turn.order[state.turn.currentIndex];
  if (!current || current.id !== previousId) return landCurrentTurn(session, state, opts);
  return reannounceCurrentTurn(session, state);
}

/**
 * turnStart for the DM and the players who may follow the turn order and know who the entry is (a
 * creature only for the players who see it); only the player whose turn it is receives the offered rollers.
 */
export function announceTurnStart(manager: SessionManagerApi, session: LiveSession, landing: TurnLanding): void {
  const base = { type: 'turnStart' as const, entry: landing.entry, round: landing.round, offeredRollers: [] as Roller[] };
  const others: string[] = [];
  if (!landing.hidden) {
    for (const uid of initiativeViewers(session.state)) {
      if (uid !== landing.turnUserId && knownTo(session, landing.entry, uid)) others.push(uid);
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

function moveTurn(manager: SessionManager, ctx: HandlerCtx, step: 1 | -1, before?: (state: LiveState, opts: MutateOptions) => void): null {
  if (ctx.session.state.turn.order.length === 0) throw new HandlerError(EMPTY_ORDER);
  const opts: MutateOptions = {};
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    ctx.session,
    (state) => {
      before?.(state, opts);
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
      out.landing = landCurrentTurn(ctx.session, state, opts);
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, ctx.session, out.landing);
  return null;
}

function randomize(manager: SessionManager, ctx: HandlerCtx): null {
  const session = ctx.session;
  if (session.state.turn.order.length === 0) throw new HandlerError(EMPTY_ORDER);
  const opts: MutateOptions = {};
  const out: { draws: InitiativeDraw[]; order: string[]; landing: TurnLanding | null } = { draws: [], order: [], landing: null };
  manager.mutate(
    session,
    (state) => {
      const rolled = state.turn.order.map((entry) => {
        const natural = secureRandomInt(20) + 1;
        const bonusRaw = entry.type === 'player' ? (heroForEntry(state, entry)?.data.initiativeBonus ?? 0) : 0;
        const bonus = Number.isFinite(bonusRaw) ? Math.round(bonusRaw) : 0;
        return { entry, natural, bonus, total: natural + bonus, tiebreak: secureRandomInt(1_000_000) };
      });
      // Cards are dealt in the previous order and sorted on screen afterwards: the draw keeps its suspense.
      out.draws = rolled.map((r) => ({ entryId: r.entry.id, name: r.entry.name, imageUrl: r.entry.imageUrl, roll: r.total, natural: r.natural, bonus: r.bonus }));
      rolled.sort((a, b) => b.total - a.total || b.tiebreak - a.tiebreak);
      for (const r of rolled) r.entry.initiative = r.total;
      state.turn.order = rolled.map((r) => r.entry);
      state.turn.mode = 'random';
      state.turn.currentIndex = 0;
      state.turn.round = 1;
      out.order = state.turn.order.map((e) => e.id);

      const ranked = out.order.map((id) => out.draws.find((d) => d.entryId === id)).filter((d): d is InitiativeDraw => d !== undefined);
      const news = (draws: InitiativeDraw[]): TurnNews => ({
        text: `Iniciativa sorteada: ${draws.map((d) => `${d.name} (${d.roll})`).join(', ')}`,
        data: { draws },
      });
      appendTurnNews(opts, state, news(ranked), (uid) => {
        const known = ranked.filter((d) => drawKnownTo(session, d, uid));
        return known.length > 0 ? news(known) : null;
      });
      out.landing = landCurrentTurn(session, state, opts);
    },
    opts,
  );

  // The DM sees the whole draw; each player who may see the order only the entries they know about.
  manager.emitEvent(session, { type: 'initiativeDraw', draws: out.draws, order: out.order }, { kind: 'dm' });
  const byShown = new Map<string, { draws: InitiativeDraw[]; userIds: string[] }>();
  for (const uid of initiativeViewers(session.state)) {
    const draws = out.draws.filter((d) => drawKnownTo(session, d, uid));
    if (draws.length === 0) continue;
    const key = draws.map((d) => d.entryId).join('|');
    const group = byShown.get(key);
    if (group) group.userIds.push(uid);
    else byShown.set(key, { draws, userIds: [uid] });
  }
  for (const { draws, userIds } of byShown.values()) {
    const shown = new Set(draws.map((d) => d.entryId));
    manager.emitEvent(session, { type: 'initiativeDraw', draws, order: out.order.filter((id) => shown.has(id)) }, { kind: 'users', userIds });
  }
  if (out.landing) announceTurnStart(manager, session, out.landing);
  return null;
}

/** Whether a player may see a card of the initiative draw (see knownTo). */
function drawKnownTo(session: LiveSession, draw: InitiativeDraw, userId: string): boolean {
  const entry = session.state.turn.order.find((e) => e.id === draw.entryId);
  return entry !== undefined && knownTo(session, entry, userId);
}

function setCurrent(manager: SessionManager, ctx: HandlerCtx, entryIdRaw: unknown): null {
  const entryId = entryIdOf(entryIdRaw);
  if (!ctx.session.state.turn.order.some((e) => e.id === entryId)) throw new HandlerError(UNKNOWN_ENTRY);
  const opts: MutateOptions = {};
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    ctx.session,
    (state) => {
      const index = state.turn.order.findIndex((e) => e.id === entryId);
      if (index < 0) throw new HandlerError(UNKNOWN_ENTRY);
      state.turn.currentIndex = index;
      out.landing = landCurrentTurn(ctx.session, state, opts);
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, ctx.session, out.landing);
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

  const opts: MutateOptions = {};
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    ctx.session,
    (s) => {
      const entry: TurnEntry = { id: newId('turn'), type, userId, heroId: hero ? hero.id : heroId, tokenId, name, imageUrl, initiative };
      const order = s.turn.order;
      const at = index === null ? order.length : Math.min(Math.max(index, 0), order.length);
      const hadEntries = order.length > 0;
      order.splice(at, 0, entry);
      if (hadEntries && at <= s.turn.currentIndex) s.turn.currentIndex += 1;
      if (!hadEntries) out.landing = landFreshOrder(ctx.session, s, opts);
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, ctx.session, out.landing);
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

/** Whether a turn entry is the player's own turn (their hero's entry or their player entry). */
function isOwnTurnEntry(state: LiveState, entry: TurnEntry, userId: string): boolean {
  const heroId = state.players[userId]?.heroId ?? null;
  return (heroId !== null && heroIdOfEntry(state, entry) === heroId) || entry.userId === userId;
}

/** Player: end their own turn (same as turn:next). The DM may use it too. */
function endMyTurn(manager: SessionManager, ctx: HandlerCtx): null {
  if (ctx.isDm) return moveTurn(manager, ctx, 1);
  if (ctx.session.state.status !== 'playing') throw new HandlerError('La partida todavía no ha empezado');
  const check = (state: LiveState): TurnEntry => {
    const entry = currentTurnEntry(state);
    if (!entry) throw new HandlerError(EMPTY_ORDER);
    if (!isOwnTurnEntry(state, entry, ctx.userId)) throw new HandlerError('No es tu turno');
    return entry;
  };
  check(ctx.session.state);
  return moveTurn(manager, ctx, 1, (state, opts) => {
    const entry = check(state);
    const news: TurnNews = { text: `⏭️ ${entry.name} termina su turno`, data: { entryId: entry.id, round: state.turn.round } };
    appendTurnNews(opts, state, news, () => news);
  });
}

/**
 * DM: start/stop combat. Starting zeroes every hero's usage and announces the current turn like any
 * turn landing (an empty order is filled with the players first). Stopping returns to free exploration.
 */
function setCombat(manager: SessionManager, ctx: HandlerCtx, activeRaw: unknown): null {
  if (typeof activeRaw !== 'boolean') throw new HandlerError('Valor no válido para «combate»');
  const active = activeRaw;
  const session = ctx.session;
  if (session.state.status !== 'playing') throw new HandlerError('La partida todavía no ha empezado');
  if ((session.state.turn.combat === true) === active) return null;
  const opts: MutateOptions = {};
  const out: { landing: TurnLanding | null } = { landing: null };
  manager.mutate(
    session,
    (state) => {
      state.turn.usage = {};
      state.turn.combat = active;
      if (!active) {
        appendLog(opts, { type: 'turn', text: '🕊️ Fin del combate', visibility: 'all' });
        return;
      }
      appendLog(opts, { type: 'turn', text: '⚔️ ¡Comienza el combate!', visibility: 'all' });
      if (state.turn.order.length === 0) {
        syncPlayerEntries(state);
        if (state.turn.order.length > 0) out.landing = landFreshOrder(session, state, opts);
      } else {
        out.landing = landCurrentTurn(session, state, opts);
      }
    },
    opts,
  );
  if (out.landing) announceTurnStart(manager, session, out.landing);
  if (active && session.state.turn.order.length === 0) {
    manager.emitEvent(
      session,
      { type: 'toast', level: 'warning', text: 'Combate iniciado, pero no hay nadie en el orden de turnos: añade participantes.' },
      { kind: 'dm' },
    );
  }
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
      const opts: MutateOptions = {};
      const out: { landing: TurnLanding | null } = { landing: null };
      manager.mutate(
        ctx.session,
        (state) => {
          const before = turnPointer(state);
          if (removeTurnEntries(state, (e) => e.id === entryId) === 0) throw new HandlerError(UNKNOWN_ENTRY);
          // Removing the entry that had the turn (e.g. a defeated creature) passes it to the next one.
          out.landing = landAfterRemoval(ctx.session, state, opts, before);
        },
        opts,
      );
      if (out.landing) announceTurnStart(manager, ctx.session, out.landing);
      return null;
    },
    dmOnly,
  );

  manager.register(socket, 'turn:update', (ctx, payload) => updateEntry(manager, ctx, payload), dmOnly);
  manager.register(socket, 'turn:endMine', (ctx) => endMyTurn(manager, ctx));
  manager.register(socket, 'combat:set', (ctx, payload) => setCombat(manager, ctx, payload.active), dmOnly);

  manager.register(
    socket,
    'turn:syncPlayers',
    (ctx) => {
      const opts: MutateOptions = {};
      const out: { landing: TurnLanding | null } = { landing: null };
      manager.mutate(
        ctx.session,
        (state) => {
          const before = turnPointer(state);
          syncPlayerEntries(state);
          out.landing =
            before.ids.length === 0 && state.turn.order.length > 0
              ? landFreshOrder(ctx.session, state, opts)
              : landAfterRemoval(ctx.session, state, opts, before);
        },
        opts,
      );
      if (out.landing) announceTurnStart(manager, ctx.session, out.landing);
      return null;
    },
    dmOnly,
  );
}
