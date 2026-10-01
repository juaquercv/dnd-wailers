import { Prisma } from '@prisma/client';
import {
  createLiveState,
  emptyHeroData,
  emptyZoneLiveState,
  type HeroSheet,
  type LiveState,
  type SessionPlayer,
  type SessionStatus,
  type Token,
  type TurnEntry,
  type ZoneLiveState,
} from '@wailers/shared';
import { prisma } from '../db';
import { isPlainObject, parseVisibility, toJson, withDefaults } from '../services/serializers';

/*
 * Persistence of live sessions: parsing of stored LiveState snapshots and serialized
 * (per-session chained) writes of the state JSON, status and name.
 */

export const SESSION_STATUSES: readonly SessionStatus[] = ['lobby', 'playing', 'paused', 'ended'];

export function parseStatus(value: unknown, fallback: SessionStatus = 'lobby'): SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value) ? (value as SessionStatus) : fallback;
}

/** Prisma "record not found" / "foreign key missing" (the session row was deleted meanwhile). */
export function isMissingRecordError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2025' || err.code === 'P2003');
}

export interface PersistedSessionRow {
  id: string;
  campaignId: string;
  hostUserId: string;
  name: string;
  status: string;
  state: unknown;
}

const TOKEN_TEMPLATE: Token = {
  id: '',
  kind: 'creature',
  entryId: null,
  heroId: null,
  ownerUserId: null,
  name: '',
  imageUrl: null,
  zoneId: '',
  levelId: '',
  x: 0,
  y: 0,
  cells: 1,
  facing: 0,
  hp: null,
  maxHp: null,
  tempHp: 0,
  hpRatio: null,
  ac: null,
  statuses: [],
  hidden: false,
  light: null,
  color: '#c43d33',
  loot: [],
  stats: null,
  notes: '',
  sourceElementId: null,
};

const TURN_ENTRY_TEMPLATE: TurnEntry = {
  id: '',
  type: 'custom',
  userId: null,
  heroId: null,
  tokenId: null,
  name: '',
  imageUrl: null,
  initiative: null,
};

function recordOf<T>(value: unknown, parse: (key: string, raw: Record<string, unknown>) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isPlainObject(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    if (!isPlainObject(raw)) continue;
    const parsed = parse(key, raw);
    if (parsed !== null) out[key] = parsed;
  }
  return out;
}

/** Stored snapshot -> complete LiveState (row columns are authoritative for ids, host and status). */
export function parseLiveState(row: PersistedSessionRow): LiveState {
  const base = createLiveState({ sessionId: row.id, campaignId: row.campaignId, name: row.name, hostUserId: row.hostUserId });
  const state = withDefaults(base, row.state);
  state.sessionId = row.id;
  state.campaignId = row.campaignId;
  state.hostUserId = row.hostUserId;
  state.status = parseStatus(row.status, parseStatus(state.status));
  if (typeof state.name !== 'string' || state.name.trim() === '') state.name = row.name;
  if (!Number.isFinite(state.version) || state.version < 0) state.version = 0;

  state.players = recordOf<SessionPlayer>(state.players, (key, raw) => {
    if (typeof raw.userId !== 'string' || raw.userId !== key) return null;
    return withDefaults<SessionPlayer>(
      { userId: key, name: key, color: '#e9c063', heroId: null, ready: false, connected: false, joinedAt: new Date(0).toISOString() },
      raw,
    );
  });
  // Nobody is connected right after loading: presence is rebuilt from the sockets that join.
  for (const player of Object.values(state.players)) player.connected = false;

  state.heroes = recordOf<HeroSheet>(state.heroes, (key, raw) => {
    if (typeof raw.id !== 'string' || raw.id !== key) return null;
    const hero = withDefaults<HeroSheet>({ id: key, ownerId: '', name: 'Héroe', imageUrl: null, level: 1, categoryIds: [], data: emptyHeroData() }, raw);
    return hero;
  });

  state.tokens = recordOf<Token>(state.tokens, (key, raw) => {
    if (typeof raw.id !== 'string' || raw.id !== key || typeof raw.zoneId !== 'string' || typeof raw.levelId !== 'string') return null;
    return withDefaults<Token>({ ...TOKEN_TEMPLATE, id: key }, raw);
  });

  state.zoneStates = recordOf<ZoneLiveState>(state.zoneStates, (_key, raw) => withDefaults(emptyZoneLiveState(), raw));
  state.instantiatedZones = state.instantiatedZones.filter((z): z is string => typeof z === 'string');

  state.turn.order = state.turn.order
    .filter(isPlainObject)
    .map((raw) => withDefaults<TurnEntry>({ ...TURN_ENTRY_TEMPLATE }, raw))
    .filter((e) => typeof e.id === 'string' && e.id !== '');
  const maxIndex = Math.max(0, state.turn.order.length - 1);
  state.turn.currentIndex = Number.isInteger(state.turn.currentIndex) ? Math.min(Math.max(state.turn.currentIndex, 0), maxIndex) : 0;
  state.turn.round = Number.isInteger(state.turn.round) && state.turn.round >= 1 ? state.turn.round : 1;
  if (state.turn.mode !== 'manual' && state.turn.mode !== 'random') state.turn.mode = 'manual';

  state.visibility.global = parseVisibility(state.visibility.global);
  state.visibility.perPlayer = isPlainObject(state.visibility.perPlayer)
    ? (Object.fromEntries(Object.entries(state.visibility.perPlayer).filter(([, v]) => isPlainObject(v))) as LiveState['visibility']['perPlayer'])
    : {};
  state.explored = isPlainObject(state.explored)
    ? (Object.fromEntries(Object.entries(state.explored).filter(([, v]) => isPlainObject(v))) as LiveState['explored'])
    : {};
  state.rollRequests = state.rollRequests.filter(isPlainObject) as unknown as LiveState['rollRequests'];
  state.trades = state.trades.filter(isPlainObject) as unknown as LiveState['trades'];
  return state;
}

export interface PersistableSession {
  readonly id: string;
  readonly state: LiveState;
}

/** Serialized writes per session: a save never overtakes an older one. */
export class SessionPersistence {
  private readonly chains = new Map<string, Promise<void>>();

  /** Snapshot taken when the write starts (latest state); rejects on database errors. */
  save(session: PersistableSession): Promise<void> {
    const previous = this.chains.get(session.id) ?? Promise.resolve();
    const run = previous.then(() => this.write(session));
    const tail = run.catch(() => undefined);
    this.chains.set(session.id, tail);
    void tail.then(() => {
      if (this.chains.get(session.id) === tail) this.chains.delete(session.id);
    });
    return run;
  }

  /** Waits for every queued write. */
  async flush(): Promise<void> {
    await Promise.all([...this.chains.values()]);
  }

  private async write(session: PersistableSession): Promise<void> {
    const state = session.state;
    state.savedAt = new Date().toISOString();
    const snapshot = structuredClone(state);
    try {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { state: toJson(snapshot), status: snapshot.status, name: snapshot.name },
      });
    } catch (err) {
      // The session was deleted while a save was queued: nothing left to persist.
      if (isMissingRecordError(err)) return;
      throw err;
    }
  }
}
