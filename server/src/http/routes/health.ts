import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db';
import { HttpError } from '../errors';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpError(503, 'La base de datos no está disponible');
    }
    return { ok: true as const };
  });
}
