import { useMemo } from 'react';
import { create } from 'zustand';
import {
  buildPlayerView,
  effectiveVisibility,
  type HeroSheet,
  type LiveState,
  type LogEntry,
  type OverviewMap,
  type Roller,
  type SessionView,
  type SessionZone,
  type SessionZonesPayload,
  type Token,
  type VisibilitySettings,
} from '@wailers/shared';
import { api } from '../api/http';
import { emitAck, getSocket, getSocketToken } from '../api/socket';
import { sessionBus } from '../lib/eventBus';

const LOG_LIMIT = 500;
/** Legacy browser-wide key; the last session is now remembered per user (`<key>.<userId>`). */
const LAST_SESSION_KEY = 'wailers.lastSessionId';

export interface ViewZone {
  zoneId: string;
  levelId: string;
}

interface SessionStoreState {
  sessionId: string | null;
  status: 'idle' | 'joining' | 'joined' | 'error';
  error: string | null;
  /** Latest view from the server (complete for the DM, filtered for players). */
  view: SessionView | null;
  zones: SessionZone[];
  zonesById: Record<string, SessionZone>;
  overview: OverviewMap | null;
  campaign: SessionZonesPayload['campaign'] | null;
  /** Campaign rollers (DM only; players receive roller snapshots inside events). */
  rollers: Roller[];
  log: LogEntry[];
  socketConnected: boolean;

  /** Zone/level currently displayed on this client. */
  viewZone: ViewZone | null;
  /** DM preview "Ver como jugador X" (null = own view). */
  viewAsUserId: string | null;
  selectedTokenIds: string[];

  join: (sessionId: string) => Promise<void>;
  leave: () => Promise<void>;
  /** Forget the session locally without telling the server (e.g. the user claim was lost). */
  reset: () => void;
  /** Show a zone (level defaults to the zone default). The DM also reports it with view:dm. */
  setViewZone: (zoneId: string, levelId?: string) => void;
  setViewAs: (userId: string | null) => void;
  selectTokens: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  /** Replace the DM roller list (after REST edits). */
  setRollers: (rollers: Roller[]) => void;
}

let listenersBound = false;
/** Every join/rejoin gets a number; results of older attempts (stale socket, superseded join) are ignored. */
let joinAttempt = 0;
/** A first join was cut short by `auth:revoked`: it is retried on the next authenticated 'connect'. */
let joinInterruptedByAuth = false;

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessionId: null,
  status: 'idle',
  error: null,
  view: null,
  zones: [],
  zonesById: {},
  overview: null,
  campaign: null,
  rollers: [],
  log: [],
  socketConnected: false,
  viewZone: null,
  viewAsUserId: null,
  selectedTokenIds: [],

  join: async (sessionId) => {
    bindSocketListeners();
    const attempt = ++joinAttempt;
    set({ sessionId, status: 'joining', error: null });
    try {
      const view = await emitAck('session:join', { sessionId });
      if (attempt !== joinAttempt) return;
      rememberLastSession(view.meUserId, sessionId);
      set({ view, status: 'joined' });
      applyAutoViewZone();
      await loadSessionExtras(sessionId, view, attempt);
    } catch (err) {
      if (attempt !== joinAttempt) return;
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  leave: async () => {
    const { sessionId, view } = get();
    joinAttempt++;
    if (sessionId) await emitAck('session:leave', {}).catch(() => undefined);
    if (view && sessionId) forgetLastSession(view.meUserId, sessionId);
    get().reset();
  },

  reset: () => {
    joinAttempt++;
    set({
      sessionId: null,
      status: 'idle',
      error: null,
      view: null,
      zones: [],
      zonesById: {},
      overview: null,
      campaign: null,
      rollers: [],
      log: [],
      viewZone: null,
      viewAsUserId: null,
      selectedTokenIds: [],
    });
  },

  setViewZone: (zoneId, levelId) => {
    const zone = get().zonesById[zoneId];
    if (!zone) return;
    const lvl = levelId && zone.levels.some((l) => l.id === levelId) ? levelId : zone.defaultLevelId;
    set({ viewZone: { zoneId, levelId: lvl }, selectedTokenIds: [] });
    if (get().view?.role === 'dm') {
      emitAck('view:dm', { zoneId, levelId: lvl }).catch(() => undefined);
    }
  },

  setViewAs: (userId) => set({ viewAsUserId: userId }),
  selectTokens: (ids, additive) =>
    set((s) => ({ selectedTokenIds: additive ? Array.from(new Set([...s.selectedTokenIds, ...ids])) : ids })),
  clearSelection: () => set({ selectedTokenIds: [] }),
  setRollers: (rollers) => set({ rollers }),
}));

function lastSessionKey(userId: string): string {
  return `${LAST_SESSION_KEY}.${userId}`;
}

function rememberLastSession(userId: string, sessionId: string): void {
  try {
    localStorage.setItem(lastSessionKey(userId), sessionId);
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Drops the user's "last session" when it still points to `sessionId`. */
function forgetLastSession(userId: string, sessionId: string): void {
  try {
    if (localStorage.getItem(lastSessionKey(userId)) === sessionId) localStorage.removeItem(lastSessionKey(userId));
  } catch {
    /* ignore */
  }
}

/** Last session this user joined in this browser (shown as "Partida en curso" in the main menu). */
export function getLastSessionId(userId?: string | null): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(lastSessionKey(userId));
  } catch {
    return null;
  }
}

export function clearLastSessionId(userId: string): void {
  try {
    localStorage.removeItem(lastSessionKey(userId));
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Log (and the DM's rollers) fetched over REST after every (re)join: events sent while offline are not replayed. */
async function loadSessionExtras(sessionId: string, view: SessionView, attempt: number): Promise<void> {
  const current = () => attempt === joinAttempt && useSessionStore.getState().sessionId === sessionId;
  const log = await api.sessions.log(sessionId, { limit: 200 }).catch(() => null);
  if (!current()) return;
  if (log) useSessionStore.setState((s) => ({ log: mergeLog(log, s.log) }));
  if (view.role !== 'dm') return;
  const rollers = await api.campaigns.rollers(view.state.campaignId).catch(() => null);
  if (rollers && current()) useSessionStore.setState({ rollers });
}

function mergeLog(a: LogEntry[], b: LogEntry[]): LogEntry[] {
  const byId = new Map<string, LogEntry>();
  for (const e of [...a, ...b]) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-LOG_LIMIT);
}

/** Players follow their hero token's zone; the DM starts on dmView or the first zone. */
function applyAutoViewZone(): void {
  const s = useSessionStore.getState();
  const view = s.view;
  if (!view || s.zones.length === 0) return;
  const state = view.state;
  if (view.role === 'dm') {
    if (s.viewZone && s.zonesById[s.viewZone.zoneId]) return;
    const target = state.dmView ?? (s.zones[0] ? { zoneId: s.zones[0].id, levelId: s.zones[0].defaultLevelId } : null);
    if (target && s.zonesById[target.zoneId]) useSessionStore.setState({ viewZone: target });
    return;
  }
  const own = Object.values(state.tokens).find((t) => t.kind === 'hero' && t.ownerUserId === view.meUserId);
  if (own && s.zonesById[own.zoneId]) {
    const current = s.viewZone;
    const tokenMoved = !current || current.zoneId !== own.zoneId || current.levelId !== own.levelId;
    const prevOwn = lastOwnTokenPos;
    const ownChanged = !prevOwn || prevOwn.zoneId !== own.zoneId || prevOwn.levelId !== own.levelId;
    lastOwnTokenPos = { zoneId: own.zoneId, levelId: own.levelId };
    // With shared vision the player may look at a party member's zone/level (the server only sends allowed zones).
    const mayBrowse = view.effective.canSeeOtherZones || view.effective.sharedVision;
    if (tokenMoved && (ownChanged || !mayBrowse || !current || !s.zonesById[current.zoneId])) {
      useSessionStore.setState({ viewZone: { zoneId: own.zoneId, levelId: own.levelId } });
    }
    return;
  }
  if (!s.viewZone || !s.zonesById[s.viewZone.zoneId]) {
    const first = s.zones[0];
    if (first) useSessionStore.setState({ viewZone: { zoneId: first.id, levelId: first.defaultLevelId } });
  }
}
let lastOwnTokenPos: ViewZone | null = null;

function bindSocketListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  const socket = getSocket();

  // The server forgot this socket's user (restart, claim expired offline): the (re)join in flight fails.
  // The auth store re-claims the user and reconnects; the next 'connect' joins again.
  socket.on('auth:revoked', () => {
    const { sessionId, status } = useSessionStore.getState();
    if (!sessionId || (status !== 'joined' && status !== 'joining')) return;
    joinAttempt++;
    if (status === 'joining') joinInterruptedByAuth = true;
  });

  socket.on('connect', () => {
    useSessionStore.setState({ socketConnected: true });
    const { sessionId, status } = useSessionStore.getState();
    const interrupted = joinInterruptedByAuth;
    joinInterruptedByAuth = false;
    // Rejoin after a reconnection (server restart, network hiccup, reload handled by SessionPage).
    // Anonymous sockets cannot join; the auth store reconnects with credentials after re-claiming the user.
    if (!sessionId || !getSocketToken()) return;
    if (status === 'joining' && interrupted) {
      useSessionStore
        .getState()
        .join(sessionId)
        .catch(() => undefined);
      return;
    }
    if (status !== 'joined') return;
    const attempt = ++joinAttempt;
    const stillCurrent = () => {
      const s = useSessionStore.getState();
      return attempt === joinAttempt && s.sessionId === sessionId && s.status === 'joined';
    };
    emitAck('session:join', { sessionId })
      .then((view) => {
        if (!stillCurrent()) return;
        useSessionStore.setState({ view });
        applyAutoViewZone();
        void loadSessionExtras(sessionId, view, attempt);
      })
      .catch((err: Error) => {
        // A socket that dropped (or was replaced) meanwhile retries on its next 'connect'.
        if (!stillCurrent() || !socket.connected) return;
        useSessionStore.setState({ status: 'error', error: err.message });
      });
  });
  socket.on('disconnect', () => useSessionStore.setState({ socketConnected: false }));
  if (socket.connected) useSessionStore.setState({ socketConnected: true });

  socket.on('session:state', (view) => {
    const s = useSessionStore.getState();
    if (!s.sessionId || view.state.sessionId !== s.sessionId) return;
    if (s.view && view.state.version < s.view.state.version && view.role === s.view.role) return;
    useSessionStore.setState({ view });
    applyAutoViewZone();
  });

  socket.on('session:zones', (payload) => {
    const zonesById: Record<string, SessionZone> = {};
    for (const z of payload.zones) zonesById[z.id] = z;
    const s = useSessionStore.getState();
    let viewZone = s.viewZone;
    if (viewZone && !zonesById[viewZone.zoneId]) viewZone = null;
    if (viewZone) {
      const z = zonesById[viewZone.zoneId]!;
      if (!z.levels.some((l) => l.id === viewZone!.levelId)) viewZone = { zoneId: z.id, levelId: z.defaultLevelId };
    }
    useSessionStore.setState({ zones: payload.zones, zonesById, overview: payload.overview, campaign: payload.campaign, viewZone });
    applyAutoViewZone();
  });

  socket.on('session:event', (event) => {
    if (event.type === 'kicked' || event.type === 'sessionEnded') {
      const s = useSessionStore.getState();
      if (s.view && s.sessionId) forgetLastSession(s.view.meUserId, s.sessionId);
    }
    sessionBus.publish(event);
  });

  socket.on('session:log', (entry) => {
    useSessionStore.setState((s) => ({ log: mergeLog(s.log, [entry]) }));
  });

  socket.on('session:rollers', (rollers) => useSessionStore.setState({ rollers }));
}

// ---------------------------------------------------------------------------
// Selectors / hooks
// ---------------------------------------------------------------------------

export function useIsDm(): boolean {
  return useSessionStore((s) => s.view?.role === 'dm');
}

export function useMeUserId(): string | null {
  return useSessionStore((s) => s.view?.meUserId ?? null);
}

/**
 * State to render. For the DM with "Ver como jugador X" active, the full state is filtered with
 * the shared buildPlayerView so the DM sees exactly what that player sees.
 */
export function useDisplayState(): { state: LiveState | null; effective: VisibilitySettings | null; asUserId: string | null; isPreview: boolean } {
  const view = useSessionStore((s) => s.view);
  const viewAs = useSessionStore((s) => s.viewAsUserId);
  const zones = useSessionStore((s) => s.zones);
  return useMemo(() => {
    if (!view) return { state: null, effective: null, asUserId: null, isPreview: false };
    if (view.role === 'dm' && viewAs) {
      return {
        state: buildPlayerView(view.state, zones, viewAs),
        effective: effectiveVisibility(view.state, viewAs),
        asUserId: viewAs,
        isPreview: true,
      };
    }
    return { state: view.state, effective: view.effective, asUserId: view.role === 'player' ? view.meUserId : null, isPreview: false };
  }, [view, viewAs, zones]);
}

export function useMyHero(): HeroSheet | null {
  return useSessionStore((s) => {
    const v = s.view;
    if (!v || v.role !== 'player') return null;
    const heroId = v.state.players[v.meUserId]?.heroId;
    return heroId ? v.state.heroes[heroId] ?? null : null;
  });
}

export function useMyToken(): Token | null {
  return useSessionStore((s) => {
    const v = s.view;
    if (!v) return null;
    return Object.values(v.state.tokens).find((t) => t.kind === 'hero' && t.ownerUserId === v.meUserId) ?? null;
  });
}

export function useCurrentZone(): { zone: SessionZone | null; levelId: string | null } {
  const viewZone = useSessionStore((s) => s.viewZone);
  const zone = useSessionStore((s) => (s.viewZone ? s.zonesById[s.viewZone.zoneId] ?? null : null));
  return { zone, levelId: zone ? viewZone?.levelId ?? zone.defaultLevelId : null };
}
