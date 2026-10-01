import type { FastifyInstance } from 'fastify';
import type { UserStatusDTO } from '@wailers/shared';
import { claims } from '../../auth/claims';

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  /** Public: users ordered by name with their availability. */
  app.get('/users', async (): Promise<UserStatusDTO[]> => {
    await claims.refreshUsers();
    return claims.statuses();
  });
}
