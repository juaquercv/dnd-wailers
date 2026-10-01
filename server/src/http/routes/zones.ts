import type { FastifyInstance } from 'fastify';
import type { LibraryEntry, Zone } from '@wailers/shared';
import { createZone, deleteZone, duplicateZone, saveZoneAsTemplate, updateZone } from '../../services/campaigns';
import { requireUser } from '../auth';

interface IdParams {
  Params: { id: string };
}

/**
 * Zone ("slide") creation, autosave, duplication, deletion and "save as template".
 * Neighbors are made reciprocal and references are cleaned by the campaigns service.
 */
export async function registerZoneRoutes(app: FastifyInstance): Promise<void> {
  app.post<IdParams>('/campaigns/:id/zones', async (request, reply): Promise<Zone> => {
    const userId = requireUser(request);
    const zone = await createZone(request.params.id, userId, request.body);
    reply.code(201);
    return zone;
  });

  app.put<IdParams>('/zones/:id', async (request): Promise<Zone> => {
    requireUser(request);
    return updateZone(request.params.id, request.body);
  });

  app.delete<IdParams>('/zones/:id', async (request) => {
    requireUser(request);
    await deleteZone(request.params.id);
    return { ok: true as const };
  });

  app.post<IdParams>('/zones/:id/duplicate', async (request, reply): Promise<Zone> => {
    requireUser(request);
    const zone = await duplicateZone(request.params.id);
    reply.code(201);
    return zone;
  });

  app.post<IdParams>('/zones/:id/template', async (request, reply): Promise<LibraryEntry<'zone'>> => {
    const userId = requireUser(request);
    const entry = await saveZoneAsTemplate(request.params.id, userId, request.body);
    reply.code(201);
    return entry;
  });
}
