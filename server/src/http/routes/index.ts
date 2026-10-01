import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth';
import { registerCampaignRoutes } from './campaigns';
import { registerCategoryRoutes } from './categories';
import { registerHealthRoutes } from './health';
import { registerLibraryRoutes } from './library';
import { registerRollerRoutes } from './rollers';
import { registerSavedFilterRoutes } from './savedFilters';
import { registerSessionRoutes } from './sessions';
import { registerUploadRoutes } from './uploads';
import { registerUserRoutes } from './users';
import { registerZoneRoutes } from './zones';

const routeModules: Array<(app: FastifyInstance) => Promise<void>> = [
  registerHealthRoutes,
  registerUserRoutes,
  registerAuthRoutes,
  registerUploadRoutes,
  registerLibraryRoutes,
  registerCategoryRoutes,
  registerSavedFilterRoutes,
  registerCampaignRoutes,
  registerZoneRoutes,
  registerRollerRoutes,
  registerSessionRoutes,
];

/** Registers every REST module. Mounted by the app under the `/api` prefix. */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  for (const mod of routeModules) {
    await app.register(mod);
  }
}
