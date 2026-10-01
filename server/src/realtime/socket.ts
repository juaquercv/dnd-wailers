import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AckResult, ClientToServerEvents, ServerToClientEvents, SocketData } from '@wailers/shared';
import { claims } from '../auth/claims';
import { registerLiveSocket } from '../live/index';
import type { AppSocket, IO, SessionManagerApi } from '../live/types';

/*
 * Socket.IO server: token authentication, presence (claims) and public broadcasts.
 * Anonymous sockets (no/unknown token) only receive `users:status` and `sessions:list`; every event
 * they send is answered at once with an error instead of letting the client wait for its timeout.
 */

const REVOKED_UNKNOWN_TOKEN = 'Tu sesión de usuario caducó. Vuelve a elegir tu usuario.';
const NOT_CLAIMED = 'Debes elegir un usuario';
const RECLAIMING = 'Tu usuario se está reconectando. Inténtalo de nuevo en un momento.';
/** Revoked sockets that did not reconnect anonymously by themselves are closed after this delay. */
const FORCE_DISCONNECT_MS = 1500;

let ioRef: IO | null = null;
let managerRef: SessionManagerApi | null = null;
/** Token presented by sockets the server does not know (expired claim or server restart). */
const staleTokens = new WeakMap<AppSocket, string>();
/**
 * Stale-token sockets by token. A client usually claims its user again with that same token; its
 * socket is then reconnected so it authenticates (the client does not reconnect for an unchanged token).
 */
const awaitingClaim = new Map<string, Set<AppSocket>>();

function anonymousData(): SocketData {
  return { userId: null, userName: null, token: null, sessionId: null };
}

export function getIO(): IO {
  if (!ioRef) throw new Error('Socket.IO todavía no está inicializado');
  return ioRef;
}

/** Live engine used for `sessions:list` on connection. */
export function setSessionManager(manager: SessionManagerApi): void {
  managerRef = manager;
}

export function getSessionManager(): SessionManagerApi | null {
  return managerRef;
}

async function sendSessionsList(socket: AppSocket): Promise<void> {
  if (!managerRef) {
    socket.emit('sessions:list', []);
    return;
  }
  try {
    socket.emit('sessions:list', await managerRef.listActive());
  } catch (err) {
    console.error('[socket] No se pudo obtener la lista de partidas:', err);
    socket.emit('sessions:list', []);
  }
}

/** Anonymous sockets run no handlers: answer every event so the client gets an error right away. */
function answerAnonymous(socket: AppSocket, error: string): void {
  socket.onAny((event: string, ...args: unknown[]) => {
    const ack = args[args.length - 1];
    if (typeof ack !== 'function') return;
    // Like the live engine, leaving is always fine: an anonymous socket is in no session.
    const res: AckResult<null> = event === 'session:leave' ? { ok: true, data: null } : { ok: false, error };
    (ack as (res: AckResult<null>) => void)(res);
  });
}

/** Closing the transport (not a namespace disconnect) makes the client reconnect with its credentials. */
function reconnectTransport(socket: AppSocket): void {
  if (socket.connected) socket.conn.close();
}

function awaitClaim(socket: AppSocket, token: string): void {
  if (claims.userIdForToken(token)) {
    reconnectTransport(socket);
    return;
  }
  const waiting = awaitingClaim.get(token) ?? new Set<AppSocket>();
  waiting.add(socket);
  awaitingClaim.set(token, waiting);
  socket.on('disconnect', () => {
    const current = awaitingClaim.get(token);
    if (!current) return;
    current.delete(socket);
    if (current.size === 0) awaitingClaim.delete(token);
  });
}

/** Stale tokens that were claimed again: reconnect their sockets so they authenticate. */
function reconnectReclaimed(): void {
  for (const [token, sockets] of [...awaitingClaim]) {
    if (!claims.userIdForToken(token)) continue;
    awaitingClaim.delete(token);
    for (const socket of sockets) reconnectTransport(socket);
  }
}

function onConnection(socket: AppSocket): void {
  socket.emit('users:status', claims.statuses());
  void sendSessionsList(socket);

  const { userId, token } = socket.data;
  const valid = userId !== null && token !== null && claims.userIdForToken(token) === userId;
  if (!valid) {
    // A token known by the middleware but released since then is stale as well.
    const staleToken = staleTokens.get(socket) ?? (userId !== null ? token : null);
    socket.data = anonymousData();
    answerAnonymous(socket, staleToken ? RECLAIMING : NOT_CLAIMED);
    if (staleToken) {
      socket.emit('auth:revoked', REVOKED_UNKNOWN_TOKEN);
      awaitClaim(socket, staleToken);
    }
    return;
  }

  void socket.join(`user:${userId}`);
  claims.attachSocket(userId, socket.id);
  socket.on('disconnect', () => {
    claims.detachSocket(userId, socket.id);
  });
  registerLiveSocket(socket);
}

/** Tell every socket of a released user to return to the login screen. */
function revokeUser(io: IO, userId: string, reason: string): void {
  const room = `user:${userId}`;
  io.to(room).emit('auth:revoked', reason);
  const ids = io.sockets.adapter.rooms.get(room);
  if (!ids) return;
  for (const id of [...ids]) {
    const socket = io.sockets.sockets.get(id);
    if (!socket) continue;
    void socket.leave(room);
    // Closing the transport (instead of a namespace disconnect) lets the client reconnect on its own.
    const timer = setTimeout(() => reconnectTransport(socket), FORCE_DISCONNECT_MS);
    timer.unref();
  }
}

export function createSocketServer(httpServer: HttpServer): IO {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: true },
    maxHttpBufferSize: 5e6,
    pingInterval: 10000,
    pingTimeout: 8000,
    serveClient: false,
  });

  io.use((socket, next) => {
    const raw: unknown = socket.handshake.auth?.token;
    const token = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    const userId = claims.userIdForToken(token);
    const user = userId ? claims.getUser(userId) : null;
    if (user && token) {
      socket.data = { userId: user.id, userName: user.name, token, sessionId: null };
    } else {
      socket.data = anonymousData();
      if (token) staleTokens.set(socket, token);
    }
    next();
  });

  io.on('connection', onConnection);

  claims.onChange(() => {
    io.emit('users:status', claims.statuses());
    reconnectReclaimed();
  });
  claims.onReleased((userId, reason) => revokeUser(io, userId, reason));

  ioRef = io;
  return io;
}
