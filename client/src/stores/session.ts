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
import { emitAck, getSocket } from '../api/socket';
import { sessionBus } from '../lib/eventBus';

const LOG_LIMIT = 500;
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
  /** Show a zone (level defaults to the zone default). The DM also reports it with view:dm. */
  setViewZone: (zoneId: string, levelId?: string) => void;
  setViewAs: (userId: string | null) => void;
  selectTokens: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  /** Replace the DM roller list (after REST edits). */
  setRollers: (rollers: Roller[]) => void;
}

let listenersBound = false;

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
    set({ sessionId, status: 'joining', error: null });
    try {
      const view = await emitAck('session:join', { sessionId });
      try {
        localStorage.setItem(LAST_SESSION_KEY, sessionId);
      } catch {
        /* ignore */
      }
      set({ view, status: 'joined' });
      applyAutoViewZone();
      const log = await api.sessions.log(sessionId, { limit: 200 }).catch(() => [] as LogEntry[]);
      set((s) => ({ log: mergeLog(log, s.log) }));
      if (view.role === 'dm') {
        const rollers = await api.campaigns.rollers(view.state.campaignId).catch(() => [] as Roller[]);
        set({ rollers });
      }
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  leave: async () => {
    const { sessionId } = get();
    if (sessionId) await emitAck('session:leave', {}).catch(() => undefined);
    try {
      localStorage.removeItem(LAST_SESSION_KEY);
    } catch {
      /* ignore */
    }
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

export function getLastSessionId(): string | null {
  try {
    return localStorage.getItem(LAST_SESSION_KEY);
  } catch {
    return null;
  }
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
    if (tokenMoved && (ownChanged || !view.effective.canSeeOtherZones || !current || !s.zonesById[current.zoneId])) {
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

  socket.on('connect', () => {
    useSessionStore.setState({ socketConnected: true });
    const { sessionId, status } = useSessionStore.getState();
    // Rejoin after a reconnection (server restart, network hiccup, reload handled by SessionPage).
    if (sessionId && status === 'joined') {
      emitAck('session:join', { sessionId })
        .then((view) => {
          useSessionStore.setState({ view });
          applyAutoViewZone();
        })
        .catch((err: Error) => useSessionStore.setState({ status: 'error', error: err.message }));
    }
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
      try {
        localStorage.removeItem(LAST_SESSION_KEY);
      } catch {
        /* ignore */
      }
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
