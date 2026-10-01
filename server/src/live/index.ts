import { newId, type AckResult, type LogEntry } from '@wailers/shared';
import { HandlerError, type AppSocket, type IO, type LiveSession, type LogInput, type SessionManagerApi } from './types';

/*
 * Placeholder for the live session engine (replaced by the live-core module).
 * It lets the server boot and serve REST/presence before the engine exists:
 * no sessions are listed and every live event is answered with an error.
 */

const UNAVAILABLE = 'El motor de partidas todavía no está disponible';

type LooseSocket = {
  on(event: string, listener: (payload: unknown, ack?: (res: AckResult<null>) => void) => void): void;
};

export function initLive(io: IO): SessionManagerApi {
  const manager: SessionManagerApi = {
    io,
    get: () => undefined,
    load: async () => {
      throw new HandlerError(UNAVAILABLE);
    },
    mutate: () => undefined,
    emitEvent: () => undefined,
    log: async (session: LiveSession, input: LogInput): Promise<LogEntry> => ({
      id: newId('log'),
      sessionId: session.id,
      at: new Date().toISOString(),
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      actorName: null,
      text: input.text,
      visibility: input.visibility ?? 'all',
      targetUserId: input.targetUserId ?? null,
      data: input.data ?? null,
    }),
    broadcast: () => undefined,
    persist: async () => undefined,
    persistAll: async () => undefined,
    listActive: async () => [],
    broadcastSessionsList: () => {
      io.emit('sessions:list', []);
    },
    isUserConnected: () => false,
    scheduleHeroWriteBack: () => undefined,
    ensureZoneInstantiated: () => undefined,
    zone: (session, zoneId) => session.campaign.zones.find((z) => z.id === zoneId),
    register: (socket, event) => {
      (socket as unknown as LooseSocket).on(event, (_payload, ack) => {
        if (typeof ack === 'function') ack({ ok: false, error: UNAVAILABLE });
      });
    },
  };
  return manager;
}

/** Called by realtime/socket.ts for every authenticated socket. */
export function registerLiveSocket(socket: AppSocket): void {
  void socket;
}
