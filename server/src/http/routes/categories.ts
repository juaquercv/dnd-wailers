import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ENTRY_KINDS, normalizeText, type CategoryDTO, type EntryKind } from '@wailers/shared';
import { prisma } from '../../db';
import { descendantIds, entryIdsForCategories, loadCategoryIndex, refreshSearchText, type CategoryIndex } from '../../services/library';
import { categoryToDTO } from '../../services/serializers';
import { requireUser } from '../auth';
import { badRequest, conflict, notFound } from '../errors';

const MESSAGES = {
  notFound: 'Categoría no encontrada',
  parentNotFound: 'La categoría padre no existe',
  parentWrongKind: 'La categoría padre debe ser del mismo tipo de elemento',
  cycle: 'Una categoría no puede ser hija de sí misma',
  kindChange: 'No se puede cambiar el tipo de elemento de una categoría',
  duplicateName: 'Ya existe una categoría con ese nombre en el mismo nivel',
} as const;

const idParams = z.object({ id: z.string().trim().min(1).max(100) });

const listQuery = z.object({ kind: z.enum(ENTRY_KINDS).optional() });

const nameSchema = z
  .string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser un texto' })
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(80, 'El nombre admite como máximo 80 caracteres');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

const categoryInput = z.object({
  kind: z.enum(ENTRY_KINDS, { required_error: 'Indica el tipo de elemento', invalid_type_error: 'Tipo de elemento no válido' }),
  name: nameSchema,
  parentId: z.string().trim().max(100).nullish(),
  color: optionalText(40),
  icon: optionalText(60),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
});

const categoryPatch = categoryInput.partial();

/** Fails when a sibling (same kind and parent) already uses the name (accent/case-insensitive). */
async function assertUniqueSiblingName(kind: EntryKind, parentId: string | null, name: string, exceptId?: string): Promise<void> {
  const siblings = await prisma.category.findMany({
    where: { kind, parentId, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name: true },
  });
  const wanted = normalizeText(name);
  if (siblings.some((s) => normalizeText(s.name) === wanted)) throw conflict(MESSAGES.duplicateName);
}

function assertValidParent(index: CategoryIndex, kind: string, parentId: string): void {
  const parent = index.byId.get(parentId);
  if (!parent) throw badRequest(MESSAGES.parentNotFound);
  if (parent.kind !== kind) throw badRequest(MESSAGES.parentWrongKind);
}

/** Recomputes searchText of entries linked to the category or any descendant. */
async function refreshEntriesUnder(categoryId: string): Promise<void> {
  const index = await loadCategoryIndex();
  const affected = await entryIdsForCategories(descendantIds(index, categoryId, true));
  await refreshSearchText(affected, index);
}

/** Category trees per entry kind. Roots are facets; children are values and may nest. */
export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/categories', async (request): Promise<CategoryDTO[]> => {
    requireUser(request);
    const { kind } = listQuery.parse(request.query ?? {});
    const rows = await prisma.category.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(categoryToDTO);
  });

  app.post('/categories', async (request, reply): Promise<CategoryDTO> => {
    requireUser(request);
    const input = categoryInput.parse(request.body ?? {});
    const parentId = input.parentId || null;
    if (parentId) assertValidParent(await loadCategoryIndex(), input.kind, parentId);
    await assertUniqueSiblingName(input.kind, parentId, input.name);

    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const last = await prisma.category.aggregate({ where: { kind: input.kind, parentId }, _max: { sortOrder: true } });
      sortOrder = (last._max.sortOrder ?? -1) + 1;
    }

    const row = await prisma.category.create({
      data: {
        kind: input.kind,
        name: input.name,
        parentId,
        color: input.color ?? null,
        icon: input.icon ?? null,
        sortOrder,
      },
    });
    reply.code(201);
    return categoryToDTO(row);
  });

  app.put('/categories/:id', async (request): Promise<CategoryDTO> => {
    requireUser(request);
    const { id } = idParams.parse(request.params);
    const patch = categoryPatch.parse(request.body ?? {});
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw notFound(MESSAGES.notFound);
    if (patch.kind !== undefined && patch.kind !== existing.kind) throw badRequest(MESSAGES.kindChange);

    const parentId = patch.parentId === undefined ? existing.parentId : patch.parentId || null;
    const parentChanged = parentId !== existing.parentId;
    if (parentChanged && parentId) {
      const index = await loadCategoryIndex();
      if (descendantIds(index, id, true).includes(parentId)) throw badRequest(MESSAGES.cycle);
      assertValidParent(index, existing.kind, parentId);
    }

    const name = patch.name ?? existing.name;
    const nameChanged = name !== existing.name;
    if (nameChanged || parentChanged) await assertUniqueSiblingName(existing.kind as EntryKind, parentId, name, id);

    const row = await prisma.category.update({
      where: { id },
      data: {
        name,
        parentId,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      },
    });

    if (nameChanged || parentChanged) await refreshEntriesUnder(id);
    return categoryToDTO(row);
  });

  /** Deletes the category and (by FK cascade) its sub-categories and entry links. */
  app.delete('/categories/:id', async (request) => {
    requireUser(request);
    const { id } = idParams.parse(request.params);
    const index = await loadCategoryIndex();
    if (!index.byId.has(id)) throw notFound(MESSAGES.notFound);

    const affected = await entryIdsForCategories(descendantIds(index, id, true));
    await prisma.category.delete({ where: { id } });
    await refreshSearchText(affected);
    return { ok: true as const };
  });
}
