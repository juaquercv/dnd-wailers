import { registerChatHandlers } from './handlers/chat';
import { registerHeroHandlers } from './handlers/heroes';
import { registerLobbyHandlers } from './handlers/lobby';
import { registerMediaHandlers } from './handlers/media';
import { registerRollHandlers } from './handlers/rolls';
import { registerSessionHandlers } from './handlers/session';
import { registerTokenHandlers } from './handlers/tokens';
import { registerTradeHandlers } from './handlers/trades';
import { registerTurnHandlers } from './handlers/turns';
import { registerVisibilityHandlers } from './handlers/visibility';
import { SessionManager } from './SessionManager';
import type { AppSocket, HandlerModule, IO, SessionManagerApi } from './types';

/*
 * Entry point of the live session engine: one SessionManager per process, wired to Socket.IO
 * and to the domain bus. realtime/socket.ts calls registerLiveSocket for every authenticated socket.
 */

export { SessionManager, RunningSession, canSeeLog } from './SessionManager';

let manager: SessionManager | null = null;

type CoreModule = (socket: AppSocket, manager: SessionManager) => void;

const CORE_MODULES: ReadonlyArray<[string, CoreModule]> = [
  ['sesión', registerSessionHandlers],
  ['sala de espera', registerLobbyHandlers],
  ['chat', registerChatHandlers],
  ['turnos', registerTurnHandlers],
];

const GAMEPLAY_MODULES: ReadonlyArray<[string, HandlerModule]> = [
  ['fichas', registerTokenHandlers],
  ['héroes', registerHeroHandlers],
  ['trueques', registerTradeHandlers],
  ['visibilidad', registerVisibilityHandlers],
  ['tiradas', registerRollHandlers],
  ['audio y efectos', registerMediaHandlers],
];

/** Creates the engine (once) and subscribes it to the domain bus. */
export function initLive(io: IO): SessionManagerApi {
  if (manager && manager.io === io) return manager;
  manager?.dispose();
  manager = new SessionManager(io);
  manager.start();
  return manager;
}

/** The running engine (throws before initLive). */
export function getManager(): SessionManager {
  if (!manager) throw new Error('El motor de partidas todavía no está iniciado');
  return manager;
}

/** Called by realtime/socket.ts for every authenticated socket. */
export function registerLiveSocket(socket: AppSocket): void {
  const engine = manager;
  if (!engine) {
    console.error('[live] Socket conectado antes de iniciar el motor de partidas');
    return;
  }
  for (const [name, register] of [...CORE_MODULES, ...GAMEPLAY_MODULES]) {
    try {
      register(socket, engine);
    } catch (err) {
      console.error(`[live] No se pudo registrar el módulo de ${name}:`, err);
    }
  }
  engine.answerUnhandled(socket);
  socket.on('disconnect', () => engine.handleDisconnect(socket));
}
