import type { FastifyRequest } from 'fastify';
import { claims } from '../auth/claims';
import { unauthorized } from './errors';

export const USER_TOKEN_HEADER = 'x-user-token';

/** Raw token sent by the client in the `x-user-token` header (null when absent). */
export function getToken(request: FastifyRequest): string | null {
  const raw = request.headers[USER_TOKEN_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** User id of the current claim, or null for anonymous / expired tokens. */
export function getUserId(request: FastifyRequest): string | null {
  return claims.userIdForToken(getToken(request));
}

/** User id of the current claim; throws 401 otherwise. */
export function requireUser(request: FastifyRequest): string {
  const userId = getUserId(request);
  if (!userId) throw unauthorized('Debes elegir un usuario para continuar');
  return userId;
}
