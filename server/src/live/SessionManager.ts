import {
  adaptHeroToRules,
  allowedZoneIds,
  buildPlayerView,
  decodeExplored,
  effectiveVisibility,
  emptyZoneLiveState,
  encodeExplored,
  filterZoneForPlayer,
  markExplored,
  newId,
  visibleAreas,
  visionCellsFor,
  visionConeFor,
  visionTokensFor,
  type AckResult,
  type C2SEvent,
  type C2SPayloads,
  type C2SResult,
  type Campaign,
  type LibraryEntry,
  type LiveState,
  type LogEntry,
  type OverviewMap,
  type Roller,
  type RuleSystem,
  type SessionEvent,
  type SessionSummary,
  type SessionView,
  type SessionZone,
  type SessionZonesPayload,
  type SpawnPoint,
  type Token,
  type VisibilitySettings,
  type Zone,
  type ZoneLevel,
} from '@wailers/shared';
import { claims } from '../auth/claims';
import { bus } from '../bus';
import { prisma } from '../db';
import { refreshSearchText } from '../services/library';
import { entryInclude, entryToDTO, isPlainObject, logToDTO, sessionInclude, sessionSummaryToDTO, toJson, toNullableJson, type SessionRow } from '../services/serializers';
import { anonymizedTurnEntry, playerKnowsTurnEntry, zoneVisionMap } from './helpers';
import { SessionPersistence, isMissingRecordError, parseLiveState } from './persistence';
import {
  defaultLevel,
  findLevel,
  freeTokenPositions,
  heroSheetFromEntry,
  heroTokenFor,
  loadCampaignRuntime,
  loadEntries,
  loadSounds,
  loadZones,
  resolveSpawn,
  soundRefFromEntry,
  storedHeroSheet,
  tokenElementEntryIds,
  tokenFromElement,
  toSessionZone,
} from './runtime';
import {
  HandlerError,
  type AckFn,
  type AppSocket,
  type Audience,
  type CampaignRuntime,
  type Handler,
  type HandlerCtx,
  type IO,
  type LiveSession,
  type LogInput,
  type MutateOptions,
  type SessionManagerApi,
  type SoundRef,
} from './types';

/*
 * The live session engine: sessions in memory, coalesced filtered broadcasts, persistence,
 * hero write-back, explored memory, socket handler wrapper and domain bus listeners.
 */

const BROADCAST_DELAY_MS = 30;
const PERSIST_DELAY_MS = 2000;
const HERO_WRITE_BACK_MS = 1500;
const SESSIONS_LIST_DELAY_MS = 120;
const ZONE_RELOAD_DELAY_MS = 150;
const IDLE_UNLOAD_MS = 60_000;
/** A player who comes back after this long gets a "ha vuelto" log line (short reconnects stay silent). */
const RETURN_LOG_AFTER_MS = 20_000;
const MAX_LOG_TEXT = 4000;

const INTERNAL_ERROR = 'Error interno del servidor';

type LooseListener = (payload?: unknown, ack?: unknown) => void;
interface LooseSocket {
  on(event: string, listener: LooseListener): unknown;
}

interface ZoneCacheEntry {
  key: string;
  full: SessionZone;
  filtered: SessionZone | null;
}

interface HeroTimer {
  timer: NodeJS.Timeout;
  session: RunningSession;
  heroId: string;
}

/** A loaded session with the engine's internal bookkeeping. */
export class RunningSession implements LiveSession {
  readonly id: string;
  state: LiveState;
  campaign: CampaignRuntime;
  /** socket id -> signature of the last session:zones payload sent to it. */
  readonly zonesSignature = new Map<string, string>();
  /** Library entries referenced by zone TokenElements (needed synchronously to instantiate zones). */
  readonly entries: Map<string, LibraryEntry>;
  /** Bumped when campaign data or sounds embedded in the zones payload change. */
  zonesEpoch = 0;
  /** levelId -> zone and level documents. */
  readonly levelIndex = new Map<string, { zone: Zone; level: ZoneLevel }>();
  readonly zoneCache = new Map<string, ZoneCacheEntry>();
  /** userId -> vision signature of the last explored-memory update. */
  readonly visionSignatures = new Map<string, string>();
  /** userId -> time the user's last socket left the session. */
  readonly lastSeen = new Map<string, number>();
  broadcastTimer: NodeJS.Timeout | null = null;
  pendingZonesRefresh = false;
  persistTimer: NodeJS.Timeout | null = null;
  unloadTimer: NodeJS.Timeout | null = null;
  unloaded = false;
  /** Nesting level of mutate() on this session and the options collected from nested calls. */
  mutateDepth = 0;
  readonly nestedOptions: MutateOptions[] = [];
  /** Log lines are written and emitted one after another, in call order. */
  logChain: Promise<void> = Promise.resolve();

  constructor(id: string, state: LiveState, campaign: CampaignRuntime, entries: Map<string, LibraryEntry>) {
    this.id = id;
    this.state = state;
    this.campaign = campaign;
    this.entries = entries;
    this.reindex();
  }

  /** Rebuild the level lookup after the zones changed. */
  reindex(): void {
    this.levelIndex.clear();
    for (const zone of this.campaign.zones) {
      for (const level of zone.levels) this.levelIndex.set(level.id, { zone, level });
    }
  }

  get hostUserId(): string {
    return this.state.hostUserId;
  }
}

/** Roll log data of a roll the DM asked for (RollResult.requestId set). */
export function isRequestedRollData(data: unknown): boolean {
  return isPlainObject(data) && typeof data.requestId === 'string' && data.requestId !== '';
}

/**
 * A player's private copy of a line the DM already has in full (e.g. turn news when not every player
 * may see the initiative or knows every creature): the DM does not receive it a second time.
 */
function isPlayerCopy(data: unknown): boolean {
  return isPlainObject(data) && data.playerCopy === true;
}

/** Whether `userId` may receive a log line of this session (same rules for live emission and REST). */
export function canSeeLog(
  state: LiveState,
  entry: Pick<LogEntry, 'type' | 'visibility' | 'actorUserId' | 'targetUserId'> & { data?: unknown },
  userId: string,
): boolean {
  if (userId === state.hostUserId) return !(entry.visibility === 'user' && isPlayerCopy(entry.data));
  if (!state.players[userId]) return false;
  if (entry.visibility === 'dm') return false;
  if (entry.visibility === 'user') return entry.targetUserId === userId || entry.actorUserId === userId;
  if (entry.type === 'roll' && entry.actorUserId && entry.actorUserId !== userId && entry.actorUserId !== state.hostUserId) {
    // A public roll the DM asked for is for everyone, like the DM's own public rolls.
    if (isRequestedRollData(entry.data)) return true;
    return effectiveVisibility(state, userId).canSeeOthersRolls;
  }
  return true;
}

/** Overview map for players: secret links («Paso secreto») are the DM's. */
function overviewForPlayers(overview: OverviewMap): OverviewMap {
  return { ...overview, links: overview.links.filter((link) => link.style !== 'secret') };
}

/** Game data of a hero sheet the DM manages during a game (everything except the player's notes). */
function heroGameData(data: LiveState['heroes'][string]['data']): Omit<LiveState['heroes'][string]['data'], 'notes'> {
  const { notes: _notes, ...rest } = data;
  return rest;
}

/** JSON with object keys sorted: documents read back from the database may list keys in another order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isPlainObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

/** 'session:leave' from a socket that is not in a session any more: nothing to do, answered as success. */
class AlreadyOutside extends Error {}

function heroDataChanged(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export class SessionManager implements SessionManagerApi {
  readonly io: IO;
  private readonly sessions = new Map<string, RunningSession>();
  private readonly loading = new Map<string, Promise<RunningSession>>();
  private readonly persistence = new SessionPersistence();
  private sounds: Map<string, SoundRef> | null = null;
  private soundsLoading: Promise<Map<string, SoundRef>> | null = null;
  private readonly heroTimers = new Map<string, HeroTimer>();
  private readonly heroWrites = new Set<Promise<void>>();
  /** Set while our own write-back is announced on the bus, so that session ignores the echo. */
  private writeBackEcho: { heroId: string; sessionId: string } | null = null;
  private listTimer: NodeJS.Timeout | null = null;
  private readonly zoneReloadTimers = new Map<string, NodeJS.Timeout>();
  private readonly zoneReloadChains = new Map<string, Promise<void>>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(io: IO) {
    this.io = io;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Subscribe to the domain bus. */
  start(): void {
    const guard = <T>(label: string, fn: (payload: T) => void | Promise<void>) => (payload: T): void => {
      try {
        const result = fn(payload);
        if (result instanceof Promise) result.catch((err: unknown) => console.error(`[live] Error al procesar «${label}»:`, err));
      } catch (err) {
        console.error(`[live] Error al procesar «${label}»:`, err);
      }
    };
    this.unsubscribers.push(
      bus.on('zone:changed', guard('zone:changed', ({ campaignId }) => this.scheduleZoneReload(campaignId))),
      bus.on('zone:deleted', guard('zone:deleted', ({ campaignId }) => this.scheduleZoneReload(campaignId))),
      bus.on('zones:reordered', guard('zones:reordered', ({ campaignId }) => this.scheduleZoneReload(campaignId))),
      bus.on('campaign:changed', guard('campaign:changed', ({ campaign }) => this.onCampaignChanged(campaign))),
      bus.on('campaign:deleted', guard('campaign:deleted', ({ campaignId }) => this.onCampaignDeleted(campaignId))),
      bus.on('rollers:changed', guard('rollers:changed', ({ campaignId, rollers }) => this.onRollersChanged(campaignId, rollers))),
      bus.on('hero:changed', guard('hero:changed', ({ hero }) => this.onHeroChanged(hero))),
      bus.on('library:changed', guard('library:changed', ({ entry }) => this.onLibraryChanged(entry))),
      bus.on('library:deleted', guard('library:deleted', ({ entryId, kind }) => this.onLibraryDeleted(entryId, kind))),
    );
  }

  dispose(): void {
    for (const off of this.unsubscribers.splice(0)) off();
    for (const timer of this.zoneReloadTimers.values()) clearTimeout(timer);
    this.zoneReloadTimers.clear();
    if (this.listTimer) clearTimeout(this.listTimer);
    this.listTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Sessions in memory
  // ---------------------------------------------------------------------------

  get(sessionId: string): RunningSession | undefined {
    return this.sessions.get(sessionId);
  }

  getRunning(sessionId: string): RunningSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Every loaded session. */
  running(): RunningSession[] {
    return [...this.sessions.values()];
  }

  load(sessionId: string): Promise<LiveSession> {
    return this.loadRunning(sessionId);
  }

  loadRunning(sessionId: string): Promise<RunningSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) return Promise.resolve(existing);
    const pending = this.loading.get(sessionId);
    if (pending) return pending;
    const promise = this.loadFromDb(sessionId).finally(() => this.loading.delete(sessionId));
    this.loading.set(sessionId, promise);
    return promise;
  }

  private async loadFromDb(sessionId: string): Promise<RunningSession> {
    const row = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!row) throw new HandlerError('La partida no existe o ha sido eliminada');
    const sounds = await this.getSounds();
    const { campaign, entries } = await loadCampaignRuntime(row.campaignId, sounds);
    const state = parseLiveState(row);
    await this.refreshHeroesFromLibrary(state, row.updatedAt);
    state.zoneVision = zoneVisionMap(campaign.zones);
    const session = new RunningSession(row.id, state, campaign, entries);
    this.syncHeroMirrors(session.state);
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * The hero sheets of a stored snapshot may be older than the library (the hero kept playing in other
   * sessions or campaigns, or was edited, after this snapshot was saved): then the library copy wins.
   * A snapshot saved after the library row keeps its sheet (e.g. the server stopped before a debounced
   * write-back landed). Sheets are taken as stored: rules were applied when the hero joined the game,
   * and values the DM set by hand (e.g. mana 0) must not change on a reload.
   */
  private async refreshHeroesFromLibrary(state: LiveState, snapshotAt: Date): Promise<void> {
    const ids = Object.keys(state.heroes);
    if (ids.length === 0) return;
    // Write-backs still in flight (e.g. of this very session, just unloaded) land first.
    await Promise.all([...this.heroWrites]);
    const rows = await prisma.libraryEntry.findMany({ where: { id: { in: ids }, kind: 'hero' }, include: entryInclude(null) });
    for (const row of rows) {
      const stored = state.heroes[row.id];
      if (!stored) continue;
      const entry = entryToDTO(row);
      if (row.updatedAt.getTime() > snapshotAt.getTime()) {
        const fresh = storedHeroSheet(entry);
        state.heroes[row.id] = { ...fresh, ownerId: fresh.ownerId || stored.ownerId };
      } else {
        // Categories are never written back: the library is their only source.
        stored.categoryIds = [...entry.categoryIds];
      }
    }
  }

  private async getSounds(): Promise<Map<string, SoundRef>> {
    if (this.sounds) return this.sounds;
    if (!this.soundsLoading) {
      this.soundsLoading = loadSounds()
        .then((map) => {
          this.sounds = map;
          return map;
        })
        .finally(() => {
          this.soundsLoading = null;
        });
    }
    return this.soundsLoading;
  }

  private asRunning(session: LiveSession): RunningSession {
    if (session instanceof RunningSession) return session;
    const found = this.sessions.get(session.id);
    if (!found) throw new HandlerError('La partida ya no está activa');
    return found;
  }

  private sessionsOfCampaign(campaignId: string): RunningSession[] {
    return [...this.sessions.values()].filter((s) => s.campaign.id === campaignId);
  }

  zone(session: LiveSession, zoneId: string): Zone | undefined {
    return session.campaign.zones.find((z) => z.id === zoneId);
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Runs `fn` on the state atomically (rolled back if it throws), then bumps the version, mirrors hero
   * sheets on hero tokens, updates explored memory and schedules logs, hero write-back, broadcast and
   * persistence. `opts` is read after `fn` runs, so `fn` may fill it (e.g. a log text computed inside).
   */
  mutate(session: LiveSession, fn: (state: LiveState) => void, opts: MutateOptions = {}): void {
    const running = this.asRunning(session);
    if (running.unloaded) throw new HandlerError('La partida ya no está activa');
    if (running.mutateDepth > 0) {
      // Nested call (e.g. a helper that mutates, invoked from another mutation): the outer call finishes the job.
      fn(running.state);
      running.nestedOptions.push(opts);
      return;
    }
    const backup = structuredClone(running.state);
    running.mutateDepth++;
    try {
      fn(running.state);
    } catch (err) {
      running.state = backup;
      running.nestedOptions.length = 0;
      throw err;
    } finally {
      running.mutateDepth--;
    }
    const all = [opts, ...running.nestedOptions.splice(0)];
    const state = running.state;
    state.version += 1;
    this.syncHeroMirrors(state);
    this.updateExplored(running);

    let zones = false;
    let persistNow = false;
    for (const o of all) {
      const logs = o.log ? (Array.isArray(o.log) ? o.log : [o.log]) : [];
      for (const input of logs) void this.log(running, input);
      for (const heroId of o.heroes ?? []) this.scheduleHeroWriteBack(running, heroId);
      zones ||= o.zones === true;
      persistNow ||= o.persistNow === true;
    }
    this.scheduleBroadcast(running, zones);
    this.schedulePersist(running, persistNow);
  }

  /** Hero tokens and player turn entries mirror the live hero sheets. */
  private syncHeroMirrors(state: LiveState): void {
    for (const token of Object.values(state.tokens)) {
      if (token.kind !== 'hero' || !token.heroId) continue;
      const hero = state.heroes[token.heroId];
      if (!hero) continue;
      token.hp = hero.data.hp.current;
      token.maxHp = hero.data.hp.max;
      token.tempHp = hero.data.hp.temp || 0;
      token.name = hero.name;
      token.imageUrl = hero.imageUrl;
      token.ac = hero.data.ac;
      const statuses = hero.data.statuses;
      if (token.statuses.length !== statuses.length || token.statuses.some((s, i) => s !== statuses[i])) {
        token.statuses = [...statuses];
      }
    }
    for (const entry of state.turn.order) {
      if (entry.type !== 'player' || !entry.heroId) continue;
      const hero = state.heroes[entry.heroId];
      if (!hero) continue;
      entry.name = hero.name;
      entry.imageUrl = hero.imageUrl;
    }
  }

  private visionSignature(session: RunningSession, userId: string, eff: VisibilitySettings): string {
    const state = session.state;
    const parts: string[] = [eff.visionMode, String(eff.visionRadius), String(eff.visionCone), eff.sharedVision ? 'shared' : 'own'];
    const zoneIds = new Set<string>();
    for (const t of visionTokensFor(state, userId)) {
      zoneIds.add(t.zoneId);
      parts.push(
        `${t.id}:${t.zoneId}:${t.levelId}:${Math.round(t.x)}:${Math.round(t.y)}:${Math.round(t.facing)}:${visionCellsFor(state, t, eff, userId)}:${visionConeFor(state, t, eff, userId)}`,
      );
    }
    for (const zoneId of zoneIds) {
      const zone = session.campaign.zones.find((z) => z.id === zoneId);
      parts.push(`${zoneId}@${zone?.updatedAt ?? ''}=${JSON.stringify(state.zoneStates[zoneId]?.doors ?? {})}`);
    }
    parts.push(Object.keys(state.explored[userId] ?? {}).sort().join(','));
    return parts.join('|');
  }

  /** Marks what each player currently sees as explored (players in 'explored' or 'vision' mode). */
  private updateExplored(session: RunningSession): void {
    const state = session.state;
    const zones = session.campaign.zones;
    for (const userId of Object.keys(state.players)) {
      const eff = effectiveVisibility(state, userId);
      if (eff.visionMode !== 'explored' && eff.visionMode !== 'vision') {
        session.visionSignatures.delete(userId);
        continue;
      }
      if (session.visionSignatures.get(userId) === this.visionSignature(session, userId, eff)) continue;
      const areas = visibleAreas(state, zones, userId);
      for (const [levelId, polygons] of Object.entries(areas)) {
        const found = session.levelIndex.get(levelId);
        if (!found || polygons.length === 0) continue;
        const memory = state.explored[userId] ?? {};
        const grid = decodeExplored(memory[levelId], found.level);
        if (!markExplored(grid, polygons)) continue;
        memory[levelId] = encodeExplored(grid);
        state.explored[userId] = memory;
      }
      // Taken after marking: the explored levels are part of the signature.
      session.visionSignatures.set(userId, this.visionSignature(session, userId, eff));
    }
  }

  // ---------------------------------------------------------------------------
  // Broadcast
  // ---------------------------------------------------------------------------

  private scheduleBroadcast(session: RunningSession, zones: boolean): void {
    if (zones) session.pendingZonesRefresh = true;
    if (session.broadcastTimer) return;
    session.broadcastTimer = setTimeout(() => this.flushBroadcast(session), BROADCAST_DELAY_MS);
  }

  broadcast(session: LiveSession, opts: { zones?: boolean } = {}): void {
    const running = this.asRunning(session);
    if (opts.zones) running.pendingZonesRefresh = true;
    this.flushBroadcast(running);
  }

  private flushBroadcast(session: RunningSession): void {
    if (session.broadcastTimer) clearTimeout(session.broadcastTimer);
    session.broadcastTimer = null;
    if (session.unloaded) return;
    if (session.pendingZonesRefresh) {
      // Rebuild every zone payload from the current documents.
      session.zoneCache.clear();
      session.pendingZonesRefresh = false;
    }
    const views = new Map<string, SessionView | null>();
    for (const socket of this.socketsOf(session)) {
      const userId = socket.data.userId;
      if (!userId) continue;
      if (!views.has(userId)) views.set(userId, this.buildView(session, userId));
      const view = views.get(userId);
      if (!view) continue;
      // Zones first: a client never renders a state whose zones it has not received yet.
      this.sendZones(session, socket, false);
      socket.emit('session:state', view);
    }
  }

  /** Session view for a user (null when the user is neither the host nor a player). */
  buildView(session: LiveSession, userId: string): SessionView | null {
    const state = session.state;
    if (userId === state.hostUserId) {
      return { role: 'dm', meUserId: userId, state, effective: state.visibility.global };
    }
    if (!state.players[userId]) return null;
    const playerState = buildPlayerView(state, session.campaign.zones, userId);
    // Creatures the player does not see on the map (out of sight, another zone, under fog) stay anonymous.
    playerState.turn.order = playerState.turn.order.map((entry) =>
      playerKnowsTurnEntry(session, userId, entry) ? entry : anonymizedTurnEntry(entry),
    );
    return {
      role: 'player',
      meUserId: userId,
      state: playerState,
      effective: effectiveVisibility(state, userId),
    };
  }

  private cachedZone(session: RunningSession, zone: Zone): ZoneCacheEntry {
    const key = `${session.zonesEpoch}|${zone.updatedAt}`;
    let entry = session.zoneCache.get(zone.id);
    if (!entry || entry.key !== key) {
      entry = { key, full: toSessionZone(zone, session.campaign.sounds), filtered: null };
      session.zoneCache.set(zone.id, entry);
    }
    return entry;
  }

  private filteredZone(session: RunningSession, zone: Zone): SessionZone {
    const entry = this.cachedZone(session, zone);
    entry.filtered ??= filterZoneForPlayer(entry.full);
    return entry.filtered;
  }

  private zonesPayloadFor(session: RunningSession, userId: string): { signature: string; build: () => SessionZonesPayload } | null {
    const state = session.state;
    const campaign = session.campaign;
    const zones = campaign.zones;
    if (userId === state.hostUserId) {
      return {
        signature: `dm|${session.zonesEpoch}|${zones.map((z) => `${z.id}@${z.updatedAt}`).join(',')}`,
        build: () => ({
          campaign: { id: campaign.id, name: campaign.name, rules: campaign.rules, spawn: campaign.spawn },
          zones: zones.map((z) => this.cachedZone(session, z).full),
          overview: campaign.overview,
        }),
      };
    }
    if (!state.players[userId]) return null;
    if (state.status === 'lobby') {
      return {
        signature: `player|${session.zonesEpoch}|lobby`,
        build: () => ({ campaign: { id: campaign.id, name: campaign.name, rules: campaign.rules, spawn: null }, zones: [], overview: null }),
      };
    }
    const eff = effectiveVisibility(state, userId);
    const allowed = new Set(allowedZoneIds(state, zones, userId));
    const visible = zones.filter((z) => allowed.has(z.id));
    return {
      signature: `player|${session.zonesEpoch}|open|${visible.map((z) => `${z.id}@${z.updatedAt}`).join(',')}|${eff.canSeeOverview ? 1 : 0}`,
      build: () => ({
        campaign: { id: campaign.id, name: campaign.name, rules: campaign.rules, spawn: campaign.spawn },
        zones: visible.map((z) => this.filteredZone(session, z)),
        overview: eff.canSeeOverview ? overviewForPlayers(campaign.overview) : null,
      }),
    };
  }

  /** Send session:zones to one socket when its payload changed (always when `force`). */
  sendZones(session: LiveSession, socket: AppSocket, force: boolean): void {
    const running = this.asRunning(session);
    const userId = socket.data.userId;
    if (!userId) return;
    const payload = this.zonesPayloadFor(running, userId);
    if (!payload) return;
    if (!force && running.zonesSignature.get(socket.id) === payload.signature) return;
    running.zonesSignature.set(socket.id, payload.signature);
    socket.emit('session:zones', payload.build());
  }

  // ---------------------------------------------------------------------------
  // Sockets & presence
  // ---------------------------------------------------------------------------

  /** Sockets currently in the session room. */
  socketsOf(session: LiveSession): AppSocket[] {
    const ids = this.io.sockets.adapter.rooms.get(`session:${session.id}`);
    if (!ids) return [];
    const out: AppSocket[] = [];
    for (const id of ids) {
      const socket = this.io.sockets.sockets.get(id);
      if (socket) out.push(socket);
    }
    return out;
  }

  isUserConnected(session: LiveSession, userId: string): boolean {
    return this.socketsOf(session).some((s) => s.data.userId === userId);
  }

  /** User ids with at least one socket in the session. */
  connectedUserIds(session: LiveSession): string[] {
    const ids = new Set<string>();
    for (const socket of this.socketsOf(session)) if (socket.data.userId) ids.add(socket.data.userId);
    return [...ids];
  }

  /** True when a user's arrival deserves a log line: first time, or back after a while (reloads stay silent). */
  announceReturn(session: LiveSession, userId: string): boolean {
    const last = this.sessions.get(session.id)?.lastSeen.get(userId);
    return last === undefined || Date.now() - last > RETURN_LOG_AFTER_MS;
  }

  /** Join the session rooms (DM room for the host). */
  attachSocket(socket: AppSocket, session: LiveSession, isDm: boolean): void {
    const running = this.asRunning(session);
    void socket.join(`session:${running.id}`);
    if (isDm) void socket.join(`session:${running.id}:dm`);
    else void socket.leave(`session:${running.id}:dm`);
    socket.data.sessionId = running.id;
    this.cancelUnload(running);
  }

  /**
   * Leave the socket's current session (rooms + presence). `explicit` = the user chose to leave
   * (logged); otherwise (disconnect) presence changes silently.
   */
  detachSocket(socket: AppSocket, opts: { explicit?: boolean } = {}): void {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;
    socket.data.sessionId = null;
    void socket.leave(`session:${sessionId}`);
    void socket.leave(`session:${sessionId}:dm`);
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.zonesSignature.delete(socket.id);
    this.afterSocketLeft(session, socket.data.userId, opts.explicit === true);
  }

  /** Socket 'disconnect' (rooms were already left by Socket.IO). */
  handleDisconnect(socket: AppSocket): void {
    this.detachSocket(socket, { explicit: false });
  }

  private afterSocketLeft(session: RunningSession, userId: string | null, explicit: boolean): void {
    if (userId && !this.isUserConnected(session, userId)) {
      session.lastSeen.set(userId, Date.now());
      const player = session.state.players[userId];
      if (player && player.connected && !session.unloaded) {
        const log: LogInput | undefined = explicit ? { type: 'system', text: `«${player.name}» ha salido de la partida` } : undefined;
        this.mutate(
          session,
          (state) => {
            const p = state.players[userId];
            if (p) p.connected = false;
          },
          { log },
        );
      } else if (explicit && userId === session.state.hostUserId && !session.unloaded) {
        const name = claims.getUser(userId)?.name ?? userId;
        void this.log(session, { type: 'system', text: `«${name}» (DM) ha salido de la partida` });
      }
    }
    this.broadcastSessionsList();
    this.scheduleIdleUnload(session);
  }

  /** Remove sockets of matching users from the session rooms (kick, pause, end). */
  removeSockets(session: LiveSession, predicate: (userId: string) => boolean): void {
    const running = this.asRunning(session);
    for (const socket of this.socketsOf(running)) {
      const userId = socket.data.userId;
      if (!userId || !predicate(userId)) continue;
      void socket.leave(`session:${running.id}`);
      void socket.leave(`session:${running.id}:dm`);
      if (socket.data.sessionId === running.id) socket.data.sessionId = null;
      running.zonesSignature.delete(socket.id);
    }
  }

  /** Send sessionEnded to every connected player and take them out of the session rooms. */
  evictPlayers(session: LiveSession, reason: string): void {
    const host = session.state.hostUserId;
    const players = this.connectedUserIds(session).filter((id) => id !== host);
    if (players.length > 0) this.emitEvent(session, { type: 'sessionEnded', reason }, { kind: 'users', userIds: players });
    this.removeSockets(session, (userId) => userId !== host);
  }

  // ---------------------------------------------------------------------------
  // Unloading
  // ---------------------------------------------------------------------------

  cancelUnload(session: RunningSession): void {
    if (session.unloadTimer) clearTimeout(session.unloadTimer);
    session.unloadTimer = null;
  }

  /** Unload after `delayMs` (replaces any pending unload). */
  scheduleUnload(session: LiveSession, delayMs: number): void {
    const running = this.asRunning(session);
    this.cancelUnload(running);
    running.unloadTimer = setTimeout(() => {
      running.unloadTimer = null;
      this.unload(running, { persist: true });
    }, delayMs);
  }

  /** Paused/ended sessions nobody is in are dropped from memory after a while. */
  scheduleIdleUnload(session: LiveSession): void {
    const running = this.sessions.get(session.id);
    if (!running || running.unloadTimer) return;
    if (running.state.status !== 'paused' && running.state.status !== 'ended') return;
    if (this.socketsOf(running).length > 0) return;
    running.unloadTimer = setTimeout(() => {
      running.unloadTimer = null;
      const idle = this.socketsOf(running).length === 0;
      if (idle && (running.state.status === 'paused' || running.state.status === 'ended')) this.unload(running, { persist: true });
    }, IDLE_UNLOAD_MS);
  }

  /** Drop a session from memory: timers cleared, pending hero sheets written, sockets released. */
  unload(session: LiveSession, opts: { persist: boolean }): void {
    const running = this.sessions.get(session.id);
    if (!running || running.unloaded) return;
    this.cancelUnload(running);
    if (running.broadcastTimer) clearTimeout(running.broadcastTimer);
    running.broadcastTimer = null;
    if (running.persistTimer) clearTimeout(running.persistTimer);
    running.persistTimer = null;
    this.flushSessionHeroWriteBacks(running);
    this.removeSockets(running, () => true);
    running.unloaded = true;
    this.sessions.delete(running.id);
    if (opts.persist) {
      this.persistence.save(running).catch((err: unknown) => console.error(`[live] No se pudo guardar la partida ${running.id}:`, err));
    }
    this.broadcastSessionsList();
  }

  // ---------------------------------------------------------------------------
  // Events & logs
  // ---------------------------------------------------------------------------

  private socketIdsWhere(session: LiveSession, accept: (userId: string) => boolean): string[] {
    const ids: string[] = [];
    for (const socket of this.socketsOf(session)) {
      const userId = socket.data.userId;
      if (userId && accept(userId)) ids.push(socket.id);
    }
    return ids;
  }

  emitEvent(session: LiveSession, event: SessionEvent, audience: Audience = { kind: 'all' }): void {
    const room = `session:${session.id}`;
    if (audience.kind === 'all') {
      this.io.to(room).emit('session:event', event);
      return;
    }
    if (audience.kind === 'dm') {
      this.io.to(`${room}:dm`).emit('session:event', event);
      return;
    }
    const host = session.state.hostUserId;
    const users = new Set(audience.userIds);
    const ids = this.socketIdsWhere(session, (userId) => users.has(userId) || (audience.kind === 'dmAnd' && userId === host));
    // An empty target list would broadcast to every socket of the server.
    if (ids.length > 0) this.io.to(ids).emit('session:event', event);
  }

  log(session: LiveSession, input: LogInput): Promise<LogEntry> {
    const state = session.state;
    // Resolved now: the actor may leave the session before the line is written.
    const actorUserId = input.actorUserId ?? null;
    const actorName = actorUserId ? (state.players[actorUserId]?.name ?? claims.getUser(actorUserId)?.name ?? actorUserId) : null;
    const line: Omit<LogEntry, 'id' | 'at'> = {
      sessionId: session.id,
      type: input.type,
      actorUserId,
      actorName,
      text: String(input.text ?? '').slice(0, MAX_LOG_TEXT),
      visibility: input.visibility ?? 'all',
      targetUserId: input.targetUserId ?? null,
      data: input.data === undefined ? null : input.data,
    };
    const running = this.sessions.get(session.id);
    if (!running) return this.writeLog(session, line);
    // Chained per session so lines are stored (createdAt) and delivered in the order they were produced.
    const result = running.logChain.then(() => this.writeLog(running, line));
    running.logChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Stores a log line and emits it to the sockets allowed to see it. Never rejects. */
  private async writeLog(session: LiveSession, line: Omit<LogEntry, 'id' | 'at'>): Promise<LogEntry> {
    let entry: LogEntry;
    try {
      const row = await prisma.sessionLog.create({
        data: {
          sessionId: line.sessionId,
          type: line.type,
          actorUserId: line.actorUserId,
          actorName: line.actorName,
          visibility: line.visibility,
          targetUserId: line.targetUserId,
          text: line.text,
          data: toNullableJson(line.data),
        },
      });
      entry = logToDTO(row);
    } catch (err) {
      if (!isMissingRecordError(err)) console.error('[live] No se pudo guardar el registro de la partida:', err);
      entry = { ...line, id: newId('log'), at: new Date().toISOString() };
    }
    const ids = this.socketIdsWhere(session, (userId) => canSeeLog(session.state, entry, userId));
    if (ids.length > 0) this.io.to(ids).emit('session:log', entry);
    return entry;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private schedulePersist(session: RunningSession, now: boolean): void {
    if (now) {
      if (session.persistTimer) clearTimeout(session.persistTimer);
      session.persistTimer = null;
      this.persistence.save(session).catch((err: unknown) => console.error(`[live] No se pudo guardar la partida ${session.id}:`, err));
      return;
    }
    if (session.persistTimer) return;
    session.persistTimer = setTimeout(() => {
      session.persistTimer = null;
      this.persistence.save(session).catch((err: unknown) => console.error(`[live] No se pudo guardar la partida ${session.id}:`, err));
    }, PERSIST_DELAY_MS);
  }

  /**
   * Persist now («Guardar», pause, end, resume). Pending hero write-backs of the session are written too
   * and awaited, so once this resolves both the session and the library hold what the DM saved.
   */
  async persist(session: LiveSession): Promise<void> {
    const running = this.asRunning(session);
    if (running.persistTimer) clearTimeout(running.persistTimer);
    running.persistTimer = null;
    this.flushSessionHeroWriteBacks(running);
    const heroWrites = [...this.heroWrites];
    await this.persistence.save(running);
    await Promise.all(heroWrites);
  }

  async persistAll(): Promise<void> {
    for (const [key, pending] of [...this.heroTimers]) {
      clearTimeout(pending.timer);
      this.heroTimers.delete(key);
      this.writeHeroNow(pending.session, pending.heroId);
    }
    const saves = [...this.sessions.values()].map((session) => {
      if (session.persistTimer) clearTimeout(session.persistTimer);
      session.persistTimer = null;
      return this.persistence.save(session).catch((err: unknown) => console.error(`[live] No se pudo guardar la partida ${session.id}:`, err));
    });
    await Promise.all([...saves, ...this.heroWrites]);
    await this.persistence.flush();
  }

  // ---------------------------------------------------------------------------
  // Session list
  // ---------------------------------------------------------------------------

  /** Public summary of a session row (live state and presence when loaded). */
  summarize(row: SessionRow): SessionSummary {
    const live = this.sessions.get(row.id);
    return sessionSummaryToDTO(row, live ? { state: live.state, isUserConnected: (userId) => this.isUserConnected(live, userId) } : {});
  }

  async listActive(): Promise<SessionSummary[]> {
    const rows = await prisma.gameSession.findMany({
      where: { status: { in: ['lobby', 'playing'] } },
      include: sessionInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.summarize(row)).filter((s) => s.status === 'lobby' || s.status === 'playing');
  }

  broadcastSessionsList(): void {
    if (this.listTimer) return;
    this.listTimer = setTimeout(() => {
      this.listTimer = null;
      this.listActive()
        .then((list) => this.io.emit('sessions:list', list))
        .catch((err: unknown) => console.error('[live] No se pudo difundir la lista de partidas:', err));
    }, SESSIONS_LIST_DELAY_MS);
  }

  // ---------------------------------------------------------------------------
  // Heroes
  // ---------------------------------------------------------------------------

  scheduleHeroWriteBack(session: LiveSession, heroId: string): void {
    const running = this.asRunning(session);
    const key = `${running.id}:${heroId}`;
    const previous = this.heroTimers.get(key);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => {
      this.heroTimers.delete(key);
      this.writeHeroNow(running, heroId);
    }, HERO_WRITE_BACK_MS);
    this.heroTimers.set(key, { timer, session: running, heroId });
  }

  /** Write every pending hero sheet of a session now (the writes are tracked in heroWrites). */
  private flushSessionHeroWriteBacks(session: RunningSession): void {
    for (const [key, pending] of [...this.heroTimers]) {
      if (pending.session !== session) continue;
      clearTimeout(pending.timer);
      this.heroTimers.delete(key);
      this.writeHeroNow(session, pending.heroId);
    }
  }

  /** Write a pending hero sheet now (call before removing a hero from the state). */
  flushHeroWriteBack(session: LiveSession, heroId: string): void {
    const running = this.asRunning(session);
    const key = `${running.id}:${heroId}`;
    const pending = this.heroTimers.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.heroTimers.delete(key);
    this.writeHeroNow(running, heroId);
  }

  private writeHeroNow(session: RunningSession, heroId: string): void {
    const sheet = session.state.heroes[heroId];
    if (!sheet) return;
    const snapshot = structuredClone(sheet);
    const write: Promise<void> = this.writeHero(session.id, snapshot).finally(() => this.heroWrites.delete(write));
    this.heroWrites.add(write);
  }

  private async writeHero(sessionId: string, sheet: LiveState['heroes'][string]): Promise<void> {
    try {
      const before = await prisma.libraryEntry.findUnique({ where: { id: sheet.id }, select: { kind: true, name: true } });
      if (!before || before.kind !== 'hero') return;
      const name = sheet.name.trim() || before.name;
      const row = await prisma.libraryEntry.update({
        where: { id: sheet.id },
        data: {
          name,
          imageUrl: sheet.imageUrl,
          level: Math.max(1, Math.round(Number.isFinite(sheet.level) ? sheet.level : 1)),
          hp: Math.max(0, Math.round(Number.isFinite(sheet.data.hp.max) ? sheet.data.hp.max : 0)),
          data: toJson(sheet.data),
        },
        include: entryInclude(null),
      });
      if (before.name !== row.name) {
        await refreshSearchText([row.id]).catch((err: unknown) => console.error('[live] No se pudo actualizar el texto de búsqueda del héroe:', err));
      }
      const hero = entryToDTO<'hero'>(row);
      this.writeBackEcho = { heroId: hero.id, sessionId };
      try {
        bus.emit('hero:changed', { hero });
      } finally {
        this.writeBackEcho = null;
      }
    } catch (err) {
      if (isMissingRecordError(err)) return;
      console.error(`[live] No se pudo guardar el héroe ${sheet.id} en la biblioteca:`, err);
    }
  }

  /** Free position near `target` on its level (other tokens and walls considered). */
  findFreeSpot(session: LiveSession, state: LiveState, target: SpawnPoint, excludeTokenId?: string): SpawnPoint {
    const running = this.asRunning(session);
    const found = running.levelIndex.get(target.levelId);
    if (!found || found.zone.id !== target.zoneId) return { ...target };
    const occupied = Object.values(state.tokens).filter(
      (t) => t.id !== excludeTokenId && t.zoneId === target.zoneId && t.levelId === target.levelId,
    );
    const [spot] = freeTokenPositions(found.level, state.zoneStates[target.zoneId]?.doors, target, occupied, 1);
    return { zoneId: target.zoneId, levelId: target.levelId, x: spot?.x ?? target.x, y: spot?.y ?? target.y };
  }

  /**
   * Make sure the player's selected hero has a token (inside mutate). New tokens appear near `near`
   * (default: campaign spawn), on the first free grid cell of a spiral around it.
   */
  placeHeroToken(session: LiveSession, state: LiveState, userId: string, near?: SpawnPoint | null): Token | null {
    const running = this.asRunning(session);
    const player = state.players[userId];
    if (!player?.heroId) return null;
    const hero = state.heroes[player.heroId];
    if (!hero) return null;
    const existing = Object.values(state.tokens).find((t) => t.kind === 'hero' && t.heroId === hero.id);
    if (existing) {
      existing.ownerUserId = userId;
      existing.color = player.color;
      return existing;
    }
    const valid = near && findLevel(running.campaign.zones, near.zoneId, near.levelId) ? near : null;
    const target = valid ?? resolveSpawn(running.campaign);
    if (!target) return null;
    this.ensureZoneInstantiated(running, state, target.zoneId);
    const spot = this.findFreeSpot(running, state, target);
    const token = heroTokenFor(hero, player, spot);
    state.tokens[token.id] = token;
    for (const entry of state.turn.order) {
      if (entry.type === 'player' && entry.heroId === hero.id) entry.tokenId = token.id;
    }
    return token;
  }

  // ---------------------------------------------------------------------------
  // Zones
  // ---------------------------------------------------------------------------

  ensureZoneInstantiated(session: LiveSession, state: LiveState, zoneId: string): void {
    if (state.instantiatedZones.includes(zoneId)) return;
    const running = this.asRunning(session);
    const zone = running.campaign.zones.find((z) => z.id === zoneId);
    if (!zone) return;
    for (const level of zone.levels) {
      for (const el of level.elements) {
        if (el.type !== 'token') continue;
        const token = tokenFromElement(el, zone.id, level.id, running.entries.get(el.entryId));
        state.tokens[token.id] = token;
      }
    }
    state.instantiatedZones.push(zoneId);
    state.zoneStates[zoneId] ??= emptyZoneLiveState();
  }

  private scheduleZoneReload(campaignId: string): void {
    if (this.sessionsOfCampaign(campaignId).length === 0 || this.zoneReloadTimers.has(campaignId)) return;
    const timer = setTimeout(() => {
      this.zoneReloadTimers.delete(campaignId);
      const previous = this.zoneReloadChains.get(campaignId) ?? Promise.resolve();
      const next = previous
        .then(() => this.reloadZones(campaignId))
        .catch((err: unknown) => console.error('[live] No se pudieron recargar las zonas:', err));
      this.zoneReloadChains.set(campaignId, next);
      void next.then(() => {
        if (this.zoneReloadChains.get(campaignId) === next) this.zoneReloadChains.delete(campaignId);
      });
    }, ZONE_RELOAD_DELAY_MS);
    this.zoneReloadTimers.set(campaignId, timer);
  }

  private async reloadZones(campaignId: string): Promise<void> {
    if (this.sessionsOfCampaign(campaignId).length === 0) return;
    const zones = await loadZones(campaignId);
    const neededIds = tokenElementEntryIds(zones);
    const missing = neededIds.filter((id) => this.sessionsOfCampaign(campaignId).some((s) => !s.entries.has(id)));
    const loaded = missing.length > 0 ? await loadEntries(missing) : new Map<string, LibraryEntry>();
    for (const session of this.sessionsOfCampaign(campaignId)) {
      session.campaign.zones = [...zones];
      for (const [id, entry] of loaded) session.entries.set(id, entry);
      session.reindex();
      session.visionSignatures.clear();
      this.cleanupAfterZoneReload(session);
      this.syncZoneVision(session);
      this.broadcast(session, { zones: true });
    }
  }

  /** Inside mutate: copy the default vision of every campaign zone into the state (state.zoneVision). */
  applyZoneVision(session: LiveSession, state: LiveState): void {
    state.zoneVision = zoneVisionMap(session.campaign.zones);
  }

  /** After the zones changed: the state follows the zones' default visions (one mutation when they differ). */
  private syncZoneVision(session: RunningSession): void {
    const next = zoneVisionMap(session.campaign.zones);
    if (stableJson(next) === stableJson(session.state.zoneVision ?? {})) return;
    this.mutate(
      session,
      (state) => {
        state.zoneVision = next;
      },
      { zones: true },
    );
  }

  /** Tokens/states that point to deleted zones or levels after the campaign was edited. */
  private cleanupAfterZoneReload(session: RunningSession): void {
    const zones = session.campaign.zones;
    const zoneIds = new Set(zones.map((z) => z.id));
    const state = session.state;
    const orphanIds = Object.values(state.tokens)
      .filter((t) => session.levelIndex.get(t.levelId)?.zone.id !== t.zoneId)
      .map((t) => t.id);
    const staleZoneStates = Object.keys(state.zoneStates).some((id) => !zoneIds.has(id));
    const staleInstantiated = state.instantiatedZones.some((id) => !zoneIds.has(id));
    const staleDmView = state.dmView !== null && !findLevel(zones, state.dmView.zoneId, state.dmView.levelId);
    const staleProjection = state.projection?.zoneId ? !zoneIds.has(state.projection.zoneId) : false;
    if (orphanIds.length === 0 && !staleZoneStates && !staleInstantiated && !staleDmView && !staleProjection) return;

    let removedTokens = 0;
    this.mutate(
      session,
      (s) => {
        const removed = new Set<string>();
        for (const id of orphanIds) {
          const token = s.tokens[id];
          if (!token) continue;
          const zone = zones.find((z) => z.id === token.zoneId);
          const level = zone ? defaultLevel(zone) : undefined;
          if (zone && level) {
            const clampedX = Math.min(Math.max(token.x, 0), level.background.width);
            const clampedY = Math.min(Math.max(token.y, 0), level.background.height);
            const spot = this.findFreeSpot(session, s, { zoneId: zone.id, levelId: level.id, x: clampedX, y: clampedY }, token.id);
            Object.assign(token, { zoneId: spot.zoneId, levelId: spot.levelId, x: spot.x, y: spot.y });
            continue;
          }
          const spawn = token.kind === 'hero' ? resolveSpawn(session.campaign) : null;
          if (spawn) {
            this.ensureZoneInstantiated(session, s, spawn.zoneId);
            const spot = this.findFreeSpot(session, s, spawn, token.id);
            Object.assign(token, { zoneId: spot.zoneId, levelId: spot.levelId, x: spot.x, y: spot.y });
            continue;
          }
          delete s.tokens[id];
          removed.add(id);
        }
        removedTokens = removed.size;
        if (removed.size > 0) {
          const currentId = s.turn.order[s.turn.currentIndex]?.id ?? null;
          s.turn.order = s.turn.order.filter((e) => e.type === 'player' || !e.tokenId || !removed.has(e.tokenId));
          const idx = currentId ? s.turn.order.findIndex((e) => e.id === currentId) : -1;
          s.turn.currentIndex = idx >= 0 ? idx : Math.min(s.turn.currentIndex, Math.max(0, s.turn.order.length - 1));
        }
        for (const id of Object.keys(s.zoneStates)) if (!zoneIds.has(id)) delete s.zoneStates[id];
        s.instantiatedZones = s.instantiatedZones.filter((id) => zoneIds.has(id));
        if (s.dmView && !findLevel(zones, s.dmView.zoneId, s.dmView.levelId)) s.dmView = null;
        if (s.projection?.zoneId && !zoneIds.has(s.projection.zoneId)) s.projection = null;
      },
      { zones: true },
    );
    if (removedTokens > 0) {
      void this.log(session, {
        type: 'system',
        visibility: 'dm',
        text: `Se eliminó una zona de la campaña: se han retirado ${removedTokens} ficha(s) que estaban en ella`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Bus listeners
  // ---------------------------------------------------------------------------

  private onCampaignChanged(campaign: Campaign): void {
    for (const session of this.sessionsOfCampaign(campaign.id)) {
      const runtime = session.campaign;
      runtime.name = campaign.name;
      runtime.rules = campaign.rules;
      runtime.overview = campaign.overview;
      runtime.spawn = campaign.spawn;
      runtime.defaultVisibility = campaign.defaultVisibility;
      session.zonesEpoch++;
      const adapted = new Map<string, LiveState['heroes'][string]['data']>();
      for (const hero of Object.values(session.state.heroes)) {
        const next = adaptHeroToRules(hero.data, campaign.rules, hero.level);
        if (heroDataChanged(next, hero.data)) adapted.set(hero.id, next);
      }
      if (adapted.size > 0) {
        this.mutate(
          session,
          (state) => {
            for (const [id, data] of adapted) {
              const hero = state.heroes[id];
              if (hero) hero.data = data;
            }
          },
          { zones: true, heroes: [...adapted.keys()] },
        );
      } else {
        this.broadcast(session, { zones: true });
      }
    }
  }

  private onCampaignDeleted(campaignId: string): void {
    for (const session of this.sessionsOfCampaign(campaignId)) {
      this.emitEvent(session, { type: 'sessionEnded', reason: 'La campaña de esta partida ha sido eliminada.' });
      this.unload(session, { persist: false });
    }
    this.broadcastSessionsList();
  }

  private onRollersChanged(campaignId: string, rollers: Roller[]): void {
    const existing = new Set(rollers.map((r) => r.id));
    const offerable = new Set(rollers.filter((r) => r.active && r.isTurnRoll).map((r) => r.id));
    for (const session of this.sessionsOfCampaign(campaignId)) {
      session.campaign.rollers = [...rollers];
      this.io.to(`session:${session.id}:dm`).emit('session:rollers', session.campaign.rollers);
      // A pending turn offer keeps only rollers that still exist and are still active turn rollers.
      const offer = session.state.turnOffer;
      const staleOffer = offer !== null && offer.rollerIds.some((id) => !offerable.has(id));
      // Requests for a roller that no longer exists could never be rolled: they are withdrawn.
      const withdrawn = session.state.rollRequests.filter((r) => r.rollerId !== null && !existing.has(r.rollerId));
      if (!staleOffer && withdrawn.length === 0) continue;
      const withdrawnIds = new Set(withdrawn.map((r) => r.id));
      this.mutate(session, (state) => {
        const current = state.turnOffer;
        if (current) {
          const rollerIds = current.rollerIds.filter((id) => offerable.has(id));
          state.turnOffer = rollerIds.length > 0 ? { ...current, rollerIds } : null;
        }
        if (withdrawnIds.size > 0) state.rollRequests = state.rollRequests.filter((r) => !withdrawnIds.has(r.id));
      });
      for (const request of withdrawn) {
        if (!session.state.players[request.targetUserId]) continue;
        this.emitEvent(
          session,
          { type: 'toast', level: 'info', text: `El DM retira la petición: ${request.label}` },
          { kind: 'users', userIds: [request.targetUserId] },
        );
      }
    }
  }

  private onHeroChanged(hero: LibraryEntry<'hero'>): void {
    const echo = this.writeBackEcho;
    // A write-back of another live session carries that game's progress; anything else is a library edit.
    const fromLiveSession = echo !== null && echo.heroId === hero.id;
    for (const session of [...this.sessions.values()]) {
      if (fromLiveSession && echo.sessionId === session.id) continue;
      if (!session.state.heroes[hero.id]) continue;
      const status = session.state.status;
      if (!fromLiveSession && (status === 'playing' || status === 'paused')) {
        this.applyLibraryEditInGame(session, hero);
        continue;
      }
      // The library edit supersedes unsaved live changes of this hero.
      const key = `${session.id}:${hero.id}`;
      const pending = this.heroTimers.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        this.heroTimers.delete(key);
      }
      const next = heroSheetFromEntry(hero, session.campaign.rules);
      this.mutate(session, (state) => {
        const sheet = state.heroes[hero.id];
        if (!sheet) return;
        sheet.name = next.name;
        sheet.imageUrl = next.imageUrl;
        sheet.level = next.level;
        sheet.categoryIds = next.categoryIds;
        sheet.ownerId = next.ownerId || sheet.ownerId;
        sheet.data = next.data;
      });
    }
  }

  /**
   * A library edit of a hero who is in a game: only the descriptive fields are taken (name, portrait,
   * categories, notes). HP, gold, XP, level, inventory, stats and resources stay as the DM left them in
   * the game, and that live sheet is written back so the library matches it again (a player cannot
   * give themselves gold, and an editor opened before the game cannot wipe its progress).
   */
  private applyLibraryEditInGame(session: RunningSession, hero: LibraryEntry<'hero'>): void {
    const live = session.state.heroes[hero.id];
    if (!live) return;
    const next = heroSheetFromEntry(hero, session.campaign.rules);
    const kept = next.level !== live.level || stableJson(heroGameData(next.data)) !== stableJson(heroGameData(live.data));
    this.mutate(
      session,
      (state) => {
        const sheet = state.heroes[hero.id];
        if (!sheet) return;
        sheet.name = next.name;
        sheet.imageUrl = next.imageUrl;
        sheet.categoryIds = next.categoryIds;
        sheet.ownerId = next.ownerId || sheet.ownerId;
        sheet.data.notes = next.data.notes;
      },
      { heroes: kept ? [hero.id] : [] },
    );
    if (!kept) return;
    const playerId =
      Object.values(session.state.players).find((p) => p.heroId === hero.id)?.userId ??
      (session.state.players[live.ownerId] ? live.ownerId : null);
    if (playerId) {
      this.emitEvent(
        session,
        {
          type: 'toast',
          level: 'warning',
          text: `«${next.name}» está en una partida: el DM gestiona sus PV, XP, monedas, inventario y estadísticas. Solo se han aplicado el nombre, el retrato y las notas.`,
        },
        { kind: 'users', userIds: [playerId] },
      );
    }
  }

  private onLibraryChanged(entry: LibraryEntry): void {
    if (entry.kind === 'sound') {
      const ref = soundRefFromEntry(entry);
      if (this.sounds) {
        if (ref) this.sounds.set(ref.id, ref);
        else this.sounds.delete(entry.id);
      }
      this.refreshSoundUsers(entry.id, ref);
      return;
    }
    if (entry.kind === 'creature' || entry.kind === 'item') {
      for (const session of this.sessions.values()) {
        if (session.entries.has(entry.id)) session.entries.set(entry.id, entry);
      }
    }
  }

  private onLibraryDeleted(entryId: string, kind: string): void {
    if (kind === 'sound') {
      this.sounds?.delete(entryId);
      this.refreshSoundUsers(entryId, null);
      return;
    }
    for (const session of this.sessions.values()) session.entries.delete(entryId);
  }

  /** Zones payloads and audio state that reference a sound whose file/name changed. */
  private refreshSoundUsers(soundId: string, ref: SoundRef | null): void {
    for (const session of [...this.sessions.values()]) {
      const usedByZone = session.campaign.zones.some((z) => z.musicSoundId === soundId || z.ambienceSoundId === soundId);
      const audio = session.state.audio;
      const usedByAudio = audio.music?.soundId === soundId || audio.ambience?.soundId === soundId;
      if (usedByZone) session.zonesEpoch++;
      if (usedByAudio && ref) {
        this.mutate(
          session,
          (state) => {
            for (const channel of ['music', 'ambience'] as const) {
              const current = state.audio[channel];
              if (current?.soundId === soundId) state.audio[channel] = { soundId, url: ref.url, name: ref.name };
            }
          },
          { zones: usedByZone },
        );
      } else if (usedByZone) {
        this.broadcast(session, { zones: true });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Socket handler wrapper
  // ---------------------------------------------------------------------------

  register<E extends C2SEvent>(socket: AppSocket, event: E, handler: Handler<E>, opts: { dmOnly?: boolean } = {}): void {
    const listener: LooseListener = (payload, ack) => {
      // Tolerate `emit(event, ack)` without a payload.
      let body: unknown = payload;
      let reply: unknown = ack;
      if (typeof body === 'function' && reply === undefined) {
        reply = body;
        body = {};
      }
      void this.dispatch(socket, event, handler, opts, body, typeof reply === 'function' ? (reply as AckFn<E>) : null);
    };
    (socket as unknown as LooseSocket).on(event, listener);
  }

  private async dispatch<E extends C2SEvent>(
    socket: AppSocket,
    event: E,
    handler: Handler<E>,
    opts: { dmOnly?: boolean },
    payload: unknown,
    ack: AckFn<E> | null,
  ): Promise<void> {
    const reply = (res: AckResult<C2SResult<E>>): void => {
      if (!ack) return;
      try {
        ack(res);
      } catch (err) {
        console.error(`[live] Error al responder a «${event}»:`, err);
      }
    };
    try {
      const ctx = await this.contextFor(socket, event, payload, opts);
      const result = await handler(ctx, payload as C2SPayloads[E]);
      reply({ ok: true, data: (result ?? null) as C2SResult<E> });
    } catch (err) {
      if (err instanceof AlreadyOutside) {
        reply({ ok: true, data: null as C2SResult<E> });
        return;
      }
      if (err instanceof HandlerError) {
        reply({ ok: false, error: err.message });
        return;
      }
      console.error(`[live] Error inesperado en «${event}»:`, err);
      reply({ ok: false, error: INTERNAL_ERROR });
    }
  }

  private async contextFor(socket: AppSocket, event: C2SEvent, payload: unknown, opts: { dmOnly?: boolean }): Promise<HandlerCtx> {
    const { userId, token } = socket.data;
    if (!userId || !token || claims.userIdForToken(token) !== userId) throw new HandlerError('Debes elegir un usuario');
    if (!isPlainObject(payload)) throw new HandlerError('Datos inválidos');

    let session: RunningSession | undefined;
    if (event === 'session:join') {
      const sessionId = payload.sessionId;
      if (typeof sessionId !== 'string' || sessionId.trim() === '' || sessionId.length > 200) throw new HandlerError('Partida no válida');
      session = await this.loadRunning(sessionId);
    } else {
      const sessionId = socket.data.sessionId;
      const leaving = event === 'session:leave';
      if (!sessionId) {
        if (leaving) throw new AlreadyOutside();
        throw new HandlerError('No estás en ninguna partida');
      }
      session = this.sessions.get(sessionId);
      if (!session) {
        socket.data.sessionId = null;
        if (leaving) throw new AlreadyOutside();
        throw new HandlerError('La partida ya no está activa. Vuelve a unirte.');
      }
    }

    const isDm = session.state.hostUserId === userId;
    if (opts.dmOnly && !isDm) throw new HandlerError('Solo el DM puede hacer esto');
    if (event !== 'session:join' && event !== 'session:leave' && !isDm && !session.state.players[userId]) {
      throw new HandlerError('No formas parte de esta partida');
    }
    return {
      io: this.io,
      socket,
      manager: this,
      session,
      userId,
      userName: socket.data.userName ?? claims.getUser(userId)?.name ?? userId,
      isDm,
    };
  }

  /** Answer events nobody handles (e.g. a module that is not available) instead of letting the client time out. */
  answerUnhandled(socket: AppSocket): void {
    socket.onAny((event: string, ...args: unknown[]) => {
      if (socket.listeners(event as C2SEvent).length > 0) return;
      const ack = args[args.length - 1];
      if (typeof ack === 'function') (ack as (res: AckResult<null>) => void)({ ok: false, error: 'Acción no disponible' });
    });
  }

  // ---------------------------------------------------------------------------
  // REST helpers
  // ---------------------------------------------------------------------------

  /** Host resumed a paused/ended session (loaded first, so memory and database cannot diverge). */
  async resumeLoaded(session: RunningSession): Promise<void> {
    this.cancelUnload(session);
    this.mutate(
      session,
      (state) => {
        state.status = 'lobby';
        for (const player of Object.values(state.players)) {
          player.connected = this.isUserConnected(session, player.userId);
          player.ready = false;
        }
      },
      { log: { type: 'system', text: 'El DM ha reanudado la partida' } },
    );
    await this.persist(session);
  }

  /** Delete a session: everyone inside is notified and the row (with its log) removed. */
  async deleteSession(sessionId: string): Promise<void> {
    // A load in flight would otherwise bring the session back into memory after the row is gone.
    const pending = this.loading.get(sessionId);
    if (pending) await pending.catch(() => undefined);
    const live = this.sessions.get(sessionId);
    if (live) {
      this.emitEvent(live, { type: 'sessionEnded', reason: 'El DM ha eliminado la partida.' });
      this.unload(live, { persist: false });
    }
    await this.persistence.flush();
    await prisma.gameSession.deleteMany({ where: { id: sessionId } });
    this.broadcastSessionsList();
  }
}
