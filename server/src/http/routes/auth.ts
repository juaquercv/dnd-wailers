import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ClaimResponse, UserDTO } from '@wailers/shared';
import { CLAIM_REASONS, claims } from '../../auth/claims';
import { getToken, requireUser } from '../auth';
import { conflict, notFound, unauthorized } from '../errors';

const claimBody = z.object({
  userId: z.string().trim().min(1, 'Elige un usuario').max(100),
  token: z.string().trim().max(200).nullish(),
  resumeOnly: z.boolean().optional(),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /** Public: lock a user for this browser and get its token. */
  app.post('/auth/claim', async (request): Promise<ClaimResponse> => {
    const body = claimBody.parse(request.body ?? {});
    if (!claims.hasUser(body.userId)) await claims.refreshUsers();
    const result = claims.claim(body.userId, body.token ?? null, body.resumeOnly ?? false);
    if (!result.ok) {
      if (result.code === 'unknown_user') throw notFound(result.reason);
      throw conflict(result.reason);
    }
    const user = claims.getUser(body.userId);
    if (!user) throw notFound(CLAIM_REASONS.unknownUser);
    return { user, token: result.token };
  });

  /** Free the current user immediately (logout). Idempotent for already-expired tokens. */
  app.post('/auth/release', async (request) => {
    const token = getToken(request);
    if (!token) throw unauthorized('Debes elegir un usuario para continuar');
    const userId = claims.userIdForToken(token);
    if (userId) claims.release(userId, CLAIM_REASONS.logout);
    return { ok: true as const };
  });

  /** Current user for the token. */
  app.get('/auth/me', async (request): Promise<UserDTO> => {
    const userId = requireUser(request);
    const user = claims.getUser(userId);
    if (!user) throw unauthorized('Debes elegir un usuario para continuar');
    return user;
  });
}
