import type { FastifyInstance } from 'fastify';
import type { Campaign, CampaignSummary, Zone } from '@wailers/shared';
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  listCampaigns,
  listZones,
  reorderZones,
  updateCampaign,
} from '../../services/campaigns';
import { requireUser } from '../auth';

interface IdParams {
  Params: { id: string };
}

/**
 * Campaign CRUD, duplication and the campaign's zone list / slide order.
 * Any claimed user may view and edit any campaign; only the owner may delete it.
 * (Zone mutations live in zones.ts; saved sessions of a campaign in sessions.ts.)
 */
export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/campaigns', async (request): Promise<CampaignSummary[]> => {
    requireUser(request);
    return listCampaigns();
  });

  app.post('/campaigns', async (request, reply): Promise<Campaign> => {
    const userId = requireUser(request);
    const campaign = await createCampaign(userId, request.body);
    reply.code(201);
    return campaign;
  });

  app.get<IdParams>('/campaigns/:id', async (request): Promise<Campaign> => {
    requireUser(request);
    return getCampaign(request.params.id);
  });

  app.put<IdParams>('/campaigns/:id', async (request): Promise<Campaign> => {
    requireUser(request);
    return updateCampaign(request.params.id, request.body);
  });

  app.delete<IdParams>('/campaigns/:id', async (request) => {
    const userId = requireUser(request);
    await deleteCampaign(request.params.id, userId);
    return { ok: true as const };
  });

  app.post<IdParams>('/campaigns/:id/duplicate', async (request, reply): Promise<Campaign> => {
    const userId = requireUser(request);
    const campaign = await duplicateCampaign(request.params.id, userId);
    reply.code(201);
    return campaign;
  });

  app.get<IdParams>('/campaigns/:id/zones', async (request): Promise<Zone[]> => {
    requireUser(request);
    return listZones(request.params.id);
  });

  app.put<IdParams>('/campaigns/:id/zones/order', async (request) => {
    requireUser(request);
    await reorderZones(request.params.id, request.body);
    return { ok: true as const };
  });
}
