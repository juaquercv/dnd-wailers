import type { Server, Socket } from 'socket.io';
import type {
  AckResult,
  C2SEvent,
  C2SPayloads,
  C2SResult,
  ClientToServerEvents,
  LiveState,
  LogEntry,
  LogType,
  OverviewMap,
  Roller,
  RuleSystem,
  ServerToClientEvents,
  SessionEvent,
  SessionSummary,
  SocketData,
  SpawnPoint,
  VisibilitySettings,
  Zone,
} from '@wailers/shared';

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Sound info resolved for zone music/ambience and DM playback. */
export interface SoundRef {
  id: string;
  name: string;
  url: string;
  soundType: 'music' | 'ambience' | 'effect';
  loop: boolean;
  volume: number;
}

/** Campaign data cached by a running session (refreshed on bus events). */
export interface CampaignRuntime {
  id: string;
  name: string;
  rules: RuleSystem;
  overview: OverviewMap;
  spawn: SpawnPoint | null;
  defaultVisibility: VisibilitySettings;
  /** Ordered like the editor. */
  zones: Zone[];
  rollers: Roller[];
  sounds: Map<string, SoundRef>;
}

export interface LiveSession {
  id: string;
  state: LiveState;
  campaign: CampaignRuntime;
  /** userId -> signature of the last zones payload sent (to avoid resending unchanged zones). */
  zonesSignature: Map<string, string>;
}

export type Audience =
  | { kind: 'all' }
  | { kind: 'dm' }
  | { kind: 'users'; userIds: string[] }
  /** DM + the given users. */
  | { kind: 'dmAnd'; userIds: string[] };

export interface LogInput {
  type: LogType;
  text: string;
  actorUserId?: string | null;
  visibility?: LogEntry['visibility'];
  targetUserId?: string | null;
  data?: unknown;
}

export interface MutateOptions {
  /** Append a log line (persisted + emitted to allowed users). */
  log?: LogInput | LogInput[];
  /** Zones / allowed zones may have changed: recompute and resend session:zones where needed. */
  zones?: boolean;
  /** Persist immediately instead of debounced. */
  persistNow?: boolean;
  /** Hero ids whose sheet changed: written back to the library (debounced). */
  heroes?: string[];
}

/** Context passed to every gameplay handler. */
export interface HandlerCtx {
  io: IO;
  socket: AppSocket;
  manager: SessionManagerApi;
  session: LiveSession;
  userId: string;
  userName: string;
  isDm: boolean;
}

export type Handler<E extends C2SEvent> = (
  ctx: HandlerCtx,
  payload: C2SPayloads[E],
) => Promise<C2SResult<E>> | C2SResult<E>;

/**
 * Thrown inside handlers to answer { ok: false, error: message } (Spanish message).
 */
export class HandlerError extends Error {}

/** The live session engine API used by handler modules (implemented in SessionManager.ts). */
export interface SessionManagerApi {
  readonly io: IO;
  get(sessionId: string): LiveSession | undefined;
  /** Load from memory or DB (throws HandlerError if missing). */
  load(sessionId: string): Promise<LiveSession>;
  /** Apply a mutation: bumps version, coalesces broadcast of session:state (~30 ms), schedules persistence (debounced ~2 s). */
  mutate(session: LiveSession, fn: (state: LiveState) => void, opts?: MutateOptions): void;
  /** Send a transient event to an audience of the session. */
  emitEvent(session: LiveSession, event: SessionEvent, audience?: Audience): void;
  /** Persist + emit a log line to the users allowed to see it. */
  log(session: LiveSession, input: LogInput): Promise<LogEntry>;
  /** Force re-broadcast of session:state (and session:zones if `zones`). */
  broadcast(session: LiveSession, opts?: { zones?: boolean }): void;
  /** Persist state to DB now. */
  persist(session: LiveSession): Promise<void>;
  /** Persist every loaded session (graceful shutdown). */
  persistAll(): Promise<void>;
  /** Public sessions list (also broadcast as sessions:list). */
  listActive(): Promise<SessionSummary[]>;
  broadcastSessionsList(): void;
  /** True if the user has at least one socket connected to this session. */
  isUserConnected(session: LiveSession, userId: string): boolean;
  /** Write a hero sheet back to the library (debounced internally). */
  scheduleHeroWriteBack(session: LiveSession, heroId: string): void;
  /** Instantiate design-time TokenElements of a zone as live tokens (once per zone). Called inside mutate. */
  ensureZoneInstantiated(session: LiveSession, state: LiveState, zoneId: string): void;
  /** Utility for handlers. */
  zone(session: LiveSession, zoneId: string): Zone | undefined;
  /** Wrap a handler with auth/session/DM checks and ack handling. */
  register<E extends C2SEvent>(socket: AppSocket, event: E, handler: Handler<E>, opts?: { dmOnly?: boolean }): void;
}

/** Each gameplay module exports `registerXxxHandlers(socket, manager)`. */
export type HandlerModule = (socket: AppSocket, manager: SessionManagerApi) => void;

export type AckFn<E extends C2SEvent> = (res: AckResult<C2SResult<E>>) => void;
