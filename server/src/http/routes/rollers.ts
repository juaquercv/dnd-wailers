import type { FastifyInstance } from 'fastify';
import type { Roller } from '@wailers/shared';
import { createRoller, deleteRoller, importRoller, listRollers, searchRollers, updateRoller } from '../../services/rollers';
import { requireUser } from '../auth';

interface IdParams {
  Params: { id: string };
}

/** Campaign dice and roulettes, cross-campaign import and the roulette library search. */
export async function registerRollerRoutes(app: FastifyInstance): Promise<void> {
  app.get<IdParams>('/campaigns/:id/rollers', async (request): Promise<Roller[]> => {
    requireUser(request);
    return listRollers(request.params.id);
  });

  app.post<IdParams>('/campaigns/:id/rollers', async (request, reply): Promise<Roller> => {
    requireUser(request);
    const roller = await createRoller(request.params.id, request.body);
    reply.code(201);
    return roller;
  });

  app.post<IdParams>('/campaigns/:id/rollers/import', async (request, reply): Promise<Roller> => {
    requireUser(request);
    const roller = await importRoller(request.params.id, request.body);
    reply.code(201);
    return roller;
  });

  app.get('/rollers', async (request): Promise<Roller[]> => {
    requireUser(request);
    return searchRollers(request.query);
  });

  app.put<IdParams>('/rollers/:id', async (request): Promise<Roller> => {
    requireUser(request);
    return updateRoller(request.params.id, request.body);
  });

  app.delete<IdParams>('/rollers/:id', async (request) => {
    requireUser(request);
    await deleteRoller(request.params.id);
    return { ok: true as const };
  });
}
