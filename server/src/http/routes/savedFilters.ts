import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ENTRY_KINDS, normalizeText, type SavedFilterDTO } from '@wailers/shared';
import { prisma } from '../../db';
import { parseLibraryQuery } from '../../services/search';
import { savedFilterToDTO, toJson } from '../../services/serializers';
import { requireUser } from '../auth';
import { badRequest, conflict, forbidden, notFound } from '../errors';

const MAX_FILTERS_PER_USER = 100;

const MESSAGES = {
  notFound: 'Filtro no encontrado',
  notOwner: 'Solo puedes borrar tus propios filtros',
  duplicateName: 'Ya tienes un filtro guardado con ese nombre',
  tooMany: `Has alcanzado el máximo de ${MAX_FILTERS_PER_USER} filtros guardados`,
} as const;

const idParams = z.object({ id: z.string().trim().min(1).max(100) });

const createBody = z.object({
  name: z
    .string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser un texto' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(80, 'El nombre admite como máximo 80 caracteres'),
  kind: z.enum(ENTRY_KINDS).nullish(),
  query: z.record(z.unknown(), { required_error: 'Falta la búsqueda a guardar', invalid_type_error: 'La búsqueda no es válida' }),
});

/** Saved library filters of the current user. */
export async function registerSavedFilterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/saved-filters', async (request): Promise<SavedFilterDTO[]> => {
    const userId = requireUser(request);
    const rows = await prisma.savedFilter.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows
      .map(savedFilterToDTO)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.createdAt.localeCompare(b.createdAt));
  });

  app.post('/saved-filters', async (request, reply): Promise<SavedFilterDTO> => {
    const userId = requireUser(request);
    const body = createBody.parse(request.body ?? {});
    const query = parseLibraryQuery(body.query);
    // Paging is a view detail, not part of a saved filter.
    delete query.page;
    const kind = body.kind === undefined ? (query.kind ?? null) : body.kind;

    const existing = await prisma.savedFilter.findMany({ where: { userId }, select: { name: true } });
    if (existing.length >= MAX_FILTERS_PER_USER) throw badRequest(MESSAGES.tooMany);
    const wanted = normalizeText(body.name);
    if (existing.some((f) => normalizeText(f.name) === wanted)) throw conflict(MESSAGES.duplicateName);

    const row = await prisma.savedFilter.create({
      data: { userId, name: body.name, kind, query: toJson(query) },
    });
    reply.code(201);
    return savedFilterToDTO(row);
  });

  app.delete('/saved-filters/:id', async (request) => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    const row = await prisma.savedFilter.findUnique({ where: { id }, select: { userId: true } });
    if (!row) throw notFound(MESSAGES.notFound);
    if (row.userId !== userId) throw forbidden(MESSAGES.notOwner);
    await prisma.savedFilter.delete({ where: { id } });
    return { ok: true as const };
  });
}
