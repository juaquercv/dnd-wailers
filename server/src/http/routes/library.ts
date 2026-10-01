import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ENTRY_KINDS, type LibraryEntry, type LibraryPage, type TagCount } from '@wailers/shared';
import {
  createEntry,
  deleteEntry,
  duplicateEntry,
  getEntry,
  listHeroes,
  listTags,
  markEntryUsed,
  refreshAllSearchText,
  searchLibrary,
  setFavorite,
  updateEntry,
} from '../../services/library';
import { parseLibraryQuery } from '../../services/search';
import { requireUser } from '../auth';
import { badRequest } from '../errors';

const idParams = z.object({ id: z.string().trim().min(1).max(100) });

const tagsQuery = z.object({
  kind: z.enum(ENTRY_KINDS).optional(),
  q: z.string().max(80).optional(),
});

const heroesQuery = z.object({
  ownerId: z.string().trim().max(100).optional(),
});

const favoriteBody = z.object({
  favorite: z.boolean({ required_error: 'Indica si es favorito', invalid_type_error: 'El valor de favorito no es válido' }),
});

const usedBody = z.object({
  campaignId: z.string().trim().max(100).nullish(),
});

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('El cuerpo de la petición debe ser un objeto');
  return body as Record<string, unknown>;
}

/** Shared library (search, CRUD, favorites, recents, tags) and the hero list. */
export async function registerLibraryRoutes(app: FastifyInstance): Promise<void> {
  // Bring every row's searchText up to date once per boot (seed rows lack the searchable data strings).
  app.addHook('onReady', async () => {
    void refreshAllSearchText()
      .then((count) => {
        if (count > 0) app.log.info(`Índice de búsqueda de la biblioteca actualizado (${count} elementos)`);
      })
      .catch((err: unknown) => app.log.error({ err }, 'No se pudo actualizar el índice de búsqueda de la biblioteca'));
  });

  /** Faceted + fuzzy search (LibraryQuery -> LibraryPage). */
  app.post('/library/search', async (request): Promise<LibraryPage> => {
    const userId = requireUser(request);
    const query = parseLibraryQuery(request.body ?? {});
    return searchLibrary(query, userId);
  });

  /** Tag autocomplete with usage counts (top 40). */
  app.get('/library/tags', async (request): Promise<TagCount[]> => {
    requireUser(request);
    const query = tagsQuery.parse(request.query ?? {});
    return listTags({ kind: query.kind, q: query.q });
  });

  app.get('/library/:id', async (request): Promise<LibraryEntry> => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    return getEntry(id, userId);
  });

  app.post('/library', async (request, reply): Promise<LibraryEntry> => {
    const userId = requireUser(request);
    const entry = await createEntry(objectBody(request.body), userId);
    reply.code(201);
    return entry;
  });

  app.put('/library/:id', async (request): Promise<LibraryEntry> => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    return updateEntry(id, objectBody(request.body), userId);
  });

  app.delete('/library/:id', async (request) => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    await deleteEntry(id, userId);
    return { ok: true as const };
  });

  app.post('/library/:id/duplicate', async (request, reply): Promise<LibraryEntry> => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    const entry = await duplicateEntry(id, userId);
    reply.code(201);
    return entry;
  });

  app.put('/library/:id/favorite', async (request) => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    const { favorite } = favoriteBody.parse(request.body ?? {});
    await setFavorite(id, userId, favorite);
    return { ok: true as const };
  });

  app.post('/library/:id/used', async (request) => {
    const userId = requireUser(request);
    const { id } = idParams.parse(request.params);
    const { campaignId } = usedBody.parse(request.body ?? {});
    await markEntryUsed(id, userId, campaignId || null);
    return { ok: true as const };
  });

  /** Heroes of every player, or only those of `ownerId`. */
  app.get('/heroes', async (request): Promise<LibraryEntry<'hero'>[]> => {
    const userId = requireUser(request);
    const { ownerId } = heroesQuery.parse(request.query ?? {});
    return listHeroes(ownerId || undefined, userId);
  });
}
