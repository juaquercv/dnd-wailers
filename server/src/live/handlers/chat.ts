import type { LogEntry } from '@wailers/shared';
import { claims } from '../../auth/claims';
import type { SessionManager } from '../SessionManager';
import { HandlerError, type AppSocket, type HandlerCtx } from '../types';

/*
 * Chat: public messages and whispers (sender, target and DM see a whisper).
 * Messages are log lines of type 'chat' delivered through `session:log`.
 */

const MAX_MESSAGE = 1000;

async function send(manager: SessionManager, ctx: HandlerCtx, payload: { text: unknown; toUserId?: unknown }): Promise<LogEntry> {
  const { session, userId } = ctx;
  if (typeof payload.text !== 'string') throw new HandlerError('El mensaje no es válido');
  const text = payload.text.trim();
  if (text.length === 0) throw new HandlerError('El mensaje está vacío');
  if (text.length > MAX_MESSAGE) throw new HandlerError(`El mensaje es demasiado largo (máximo ${MAX_MESSAGE} caracteres)`);

  const to = payload.toUserId;
  if (to === undefined || to === null || to === '') {
    return manager.log(session, { type: 'chat', text, actorUserId: userId, visibility: 'all', data: { whisper: false } });
  }
  if (typeof to !== 'string') throw new HandlerError('Destinatario no válido');
  if (to === userId) throw new HandlerError('No puedes susurrarte a ti mismo');
  const state = session.state;
  if (to !== state.hostUserId && !state.players[to]) throw new HandlerError('Ese jugador no está en la partida');
  const toName = state.players[to]?.name ?? claims.getUser(to)?.name ?? to;
  return manager.log(session, {
    type: 'chat',
    text,
    actorUserId: userId,
    visibility: 'user',
    targetUserId: to,
    data: { whisper: true, toUserId: to, toName },
  });
}

export function registerChatHandlers(socket: AppSocket, manager: SessionManager): void {
  manager.register(socket, 'chat:send', (ctx, payload) => send(manager, ctx, payload));
}
