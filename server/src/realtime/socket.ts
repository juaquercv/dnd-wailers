import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@wailers/shared';
import { claims } from '../auth/claims';
import { registerLiveSocket } from '../live/index';
import type { AppSocket, IO, SessionManagerApi } from '../live/types';

/*
 * Socket.IO server: token authentication, presence (claims) and public broadcasts.
 * Anonymous sockets (no/unknown token) only receive `users:status` and `sessions:list`.
 */

const REVOKED_UNKNOWN_TOKEN = 'Tu sesión de usuario caducó. Vuelve a elegir tu usuario.';
/** Revoked sockets that did not reconnect anonymously by themselves are closed after this delay. */
const FORCE_DISCONNECT_MS = 1500;

let ioRef: IO | null = null;
let managerRef: SessionManagerApi | null = null;
/** Sockets that presented a token the server does not know (expired claim or server restart). */
const staleTokenSockets = new WeakSet<AppSocket>();

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

function onConnection(socket: AppSocket): void {
  socket.emit('users:status', claims.statuses());
  void sendSessionsList(socket);

  const { userId, token } = socket.data;
  const valid = userId !== null && token !== null && claims.userIdForToken(token) === userId;
  if (!valid) {
    if (userId !== null || staleTokenSockets.has(socket)) {
      socket.data = anonymousData();
      socket.emit('auth:revoked', REVOKED_UNKNOWN_TOKEN);
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
    const timer = setTimeout(() => {
      if (socket.connected) socket.conn.close();
    }, FORCE_DISCONNECT_MS);
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
      if (token) staleTokenSockets.add(socket);
    }
    next();
  });

  io.on('connection', onConnection);

  claims.onChange(() => {
    io.emit('users:status', claims.statuses());
  });
  claims.onReleased((userId, reason) => revokeUser(io, userId, reason));

  ioRef = io;
  return io;
}
