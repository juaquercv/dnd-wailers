import { io, type Socket } from 'socket.io-client';
import type {
  C2SEvent,
  C2SPayloads,
  C2SResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@wailers/shared';

export type AppClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppClientSocket | null = null;
let currentToken: string | null = null;

/** Called by the auth store whenever the claim token changes. Reconnects with the new credentials. */
export function setSocketToken(token: string | null): void {
  if (token === currentToken) return;
  currentToken = token;
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}

/** Singleton socket. Anonymous sockets (no token) still receive users:status and sessions:list. */
export function getSocket(): AppClientSocket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      auth: (cb) => cb({ token: currentToken }),
    });
  }
  return socket;
}

/**
 * Emit with acknowledgement. Resolves with the ack data, rejects with an Error carrying the
 * server's Spanish message (or a timeout message).
 */
export function emitAck<E extends C2SEvent>(event: E, payload: C2SPayloads[E], timeoutMs = 10000): Promise<C2SResult<E>> {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('El servidor no respondió a tiempo'));
    }, timeoutMs);
    const emit = s.emit.bind(s) as unknown as (
      ev: string,
      p: unknown,
      ack: (res: { ok: boolean; data?: unknown; error?: string }) => void,
    ) => void;
    emit(event, payload, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (res && res.ok) resolve(res.data as C2SResult<E>);
      else reject(new Error(res?.error ?? 'Error desconocido'));
    });
  });
}

/** Fire-and-forget emit (errors are ignored). Used for high-frequency transient events like token:drag. */
export function emitQuiet<E extends C2SEvent>(event: E, payload: C2SPayloads[E]): void {
  const s = getSocket();
  const emit = s.emit.bind(s) as unknown as (ev: string, p: unknown, ack: () => void) => void;
  emit(event, payload, () => undefined);
}
