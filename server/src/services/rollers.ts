import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROULETTE_PALETTE,
  buildSearchText,
  isValidFormula,
  newId,
  normalizeTag,
  normalizeTags,
  normalizeText,
  parseFormula,
  type Roller,
  type RollerKind,
  type RouletteSegment,
} from '@wailers/shared';
import { prisma } from '../db';
import { badRequest, notFound } from '../http/errors';
import { emitSafe, nameTaken, parseInput } from './campaigns';
import { rollerInclude, rollerToDTO, toJson, toNullableJson, type RollerRow } from './serializers';

/*
 * Campaign dice and roulettes: validation, CRUD, cross-campaign import (independent copies) and the
 * roulette library search. Results of rolling them are never applied automatically (see live/rolls).
 */

export const ROLLER_MESSAGES = {
  campaignNotFound: 'Campaña no encontrada',
  rollerNotFound: 'No se encontró la ruleta o el dado',
  invalidRoller: 'Datos de ruleta o dado inválidos',
  invalidSearch: 'Búsqueda de ruletas inválida',
  rouletteName: 'La ruleta necesita un nombre',
  diceName: 'El dado necesita un nombre',
  nameTooLong: 'El nombre admite como máximo 80 caracteres',
  minSegments: 'La ruleta necesita al menos 2 segmentos',
  segmentLabel: 'Todos los segmentos de la ruleta necesitan un nombre',
  segmentWeight: 'Cada segmento necesita un peso mayor que 0',
  faceText: 'Todas las caras del dado necesitan un texto',
  minFaces: 'Un dado personalizado necesita al menos 2 caras',
  diceNeedsFormula: 'El dado necesita una fórmula válida (por ejemplo 2d6+3) o al menos 2 caras',
  importMissing: 'Indica qué ruleta o dado quieres importar',
} as const;

const NAME_MAX = 80;
const MAX_SEGMENTS = 100;
const MAX_FACES = 100;
const SEARCH_LIMIT = 200;
/** Minimum pg_trgm word_similarity(word, searchText) for a typo-tolerant match. */
const WORD_SIMILARITY_THRESHOLD = 0.4;
const IMPORTED_SUFFIX = ' (importada)';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const finite = z.number().finite();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? '');

const segmentInputSchema = z.object({
  id: z.string().max(200).nullish(),
  label: optionalText(200),
  color: z.string().max(64).nullish(),
  weight: finite.default(1),
  icon: z.string().max(32).nullish(),
  description: optionalText(2000),
});

const faceSchema = z.union([z.string().max(200), finite.transform((n) => String(n))]);

export const rollerInputSchema = z
  .object({
    name: z.string().max(500),
    kind: z.enum(['roulette', 'dice']),
    description: optionalText(5000),
    tags: z.array(z.string().max(80)).max(50),
    active: z.boolean(),
    isTurnRoll: z.boolean(),
    segments: z.array(segmentInputSchema).max(MAX_SEGMENTS, `Una ruleta admite como máximo ${MAX_SEGMENTS} segmentos`),
    formula: z.string().max(200).nullable(),
    faces: z.array(faceSchema).max(MAX_FACES, `Un dado admite como máximo ${MAX_FACES} caras`).nullable(),
    sortOrder: finite.int().min(0).max(1_000_000),
  })
  .partial();

type RollerInputParsed = z.output<typeof rollerInputSchema>;
type SegmentInput = z.output<typeof segmentInputSchema>;

const importSchema = z.object({
  rollerId: z
    .string()
    .max(200)
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, ROLLER_MESSAGES.importMissing),
});

const queryText = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => (Array.isArray(value) ? value[0] : value)?.trim() ?? '');

export const rollerSearchSchema = z.object({
  q: queryText.refine((value) => value.length <= 200, 'La búsqueda es demasiado larga'),
  tag: queryText,
  campaignId: queryText,
  kind: queryText.refine((value) => value === '' || value === 'roulette' || value === 'dice', 'Tipo no válido: usa «roulette» o «dice»'),
});

/** Fields stored for a roller (the editable part of Roller). */
export interface RollerDraft {
  name: string;
  kind: RollerKind;
  description: string;
  tags: string[];
  active: boolean;
  isTurnRoll: boolean;
  segments: RouletteSegment[];
  formula: string | null;
  faces: string[] | null;
  sortOrder: number;
}

/** searchText column for rollers: normalized name, description and tags (accent/case-insensitive). */
export function rollerSearchText(roller: { name: string; description: string; tags: readonly string[] }): string {
  return buildSearchText({ name: roller.name, description: roller.description, tags: [...roller.tags] });
}

function sanitizeSegments(segments: readonly (SegmentInput | RouletteSegment)[]): RouletteSegment[] {
  const used = new Set<string>();
  return segments.map((seg, index) => {
    let id = typeof seg.id === 'string' ? seg.id.trim() : '';
    if (!id || used.has(id)) id = newId('seg');
    used.add(id);
    const colorValue = typeof seg.color === 'string' ? seg.color.trim() : '';
    const icon = typeof seg.icon === 'string' ? seg.icon.trim() : '';
    return {
      id,
      label: (seg.label ?? '').trim(),
      color: colorValue || ROULETTE_PALETTE[index % ROULETTE_PALETTE.length]!,
      weight: seg.weight,
      icon: icon || null,
      description: (seg.description ?? '').trim(),
    };
  });
}

function sanitizeFaces(faces: readonly string[] | null): string[] | null {
  if (faces === null) return null;
  const trimmed = faces.map((f) => f.trim());
  return trimmed.length === 0 ? null : trimmed;
}

/** Merges a parsed input over a base draft and normalizes it (does not validate semantics). */
function mergeDraft(base: RollerDraft, input: RollerInputParsed): RollerDraft {
  return {
    name: input.name !== undefined ? input.name.trim() : base.name,
    kind: input.kind ?? base.kind,
    description: input.description !== undefined ? input.description.trim() : base.description,
    tags: input.tags !== undefined ? normalizeTags(input.tags) : base.tags,
    active: input.active ?? base.active,
    isTurnRoll: input.isTurnRoll ?? base.isTurnRoll,
    segments: input.segments !== undefined ? sanitizeSegments(input.segments) : base.segments,
    formula: input.formula !== undefined ? (input.formula?.trim() ? input.formula.trim() : null) : base.formula,
    faces: input.faces !== undefined ? sanitizeFaces(input.faces) : base.faces,
    sortOrder: input.sortOrder ?? base.sortOrder,
  };
}

/** Semantic rules: roulettes need >= 2 named segments with weight > 0; dice need a valid formula or >= 2 faces. */
export function assertValidRoller(draft: RollerDraft): void {
  if (!draft.name) throw badRequest(draft.kind === 'dice' ? ROLLER_MESSAGES.diceName : ROLLER_MESSAGES.rouletteName);
  if (draft.name.length > NAME_MAX) throw badRequest(ROLLER_MESSAGES.nameTooLong);

  if (draft.kind === 'roulette') {
    if (draft.segments.length < 2) throw badRequest(ROLLER_MESSAGES.minSegments);
    if (draft.segments.some((s) => !s.label)) throw badRequest(ROLLER_MESSAGES.segmentLabel);
    if (draft.segments.some((s) => !(s.weight > 0))) throw badRequest(ROLLER_MESSAGES.segmentWeight);
    return;
  }

  if (draft.faces) {
    if (draft.faces.some((f) => !f)) throw badRequest(ROLLER_MESSAGES.faceText);
    if (draft.faces.length < 2) throw badRequest(ROLLER_MESSAGES.minFaces);
    return;
  }
  if (!draft.formula) throw badRequest(ROLLER_MESSAGES.diceNeedsFormula);
  if (!isValidFormula(draft.formula)) {
    let reason: string = ROLLER_MESSAGES.diceNeedsFormula;
    try {
      parseFormula(draft.formula);
    } catch (err) {
      if (err instanceof Error && err.message) reason = err.message;
    }
    throw badRequest(reason);
  }
}

function draftFromRoller(roller: Roller): RollerDraft {
  return {
    name: roller.name,
    kind: roller.kind,
    description: roller.description,
    tags: [...roller.tags],
    active: roller.active,
    isTurnRoll: roller.isTurnRoll,
    segments: roller.segments.map((s) => ({ ...s })),
    formula: roller.formula,
    faces: roller.faces ? [...roller.faces] : null,
    sortOrder: roller.sortOrder,
  };
}

function draftColumns(draft: RollerDraft) {
  return {
    name: draft.name,
    kind: draft.kind,
    description: draft.description,
    tags: draft.tags,
    active: draft.active,
    isTurnRoll: draft.isTurnRoll,
    segments: toJson(draft.segments),
    formula: draft.formula,
    faces: toNullableJson(draft.faces),
    sortOrder: draft.sortOrder,
    searchText: rollerSearchText(draft),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function assertCampaign(campaignId: string): Promise<void> {
  const exists = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!exists) throw notFound(ROLLER_MESSAGES.campaignNotFound);
}

async function nextSortOrder(campaignId: string): Promise<number> {
  const agg = await prisma.roller.aggregate({ where: { campaignId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function loadRoller(id: string): Promise<RollerRow> {
  const row = await prisma.roller.findUnique({ where: { id }, include: rollerInclude });
  if (!row) throw notFound(ROLLER_MESSAGES.rollerNotFound);
  return row;
}

/** Campaign rollers ordered like the editor (sortOrder, then name). */
export async function listRollers(campaignId: string): Promise<Roller[]> {
  await assertCampaign(campaignId);
  return listRollersUnchecked(campaignId);
}

async function listRollersUnchecked(campaignId: string): Promise<Roller[]> {
  const rows = await prisma.roller.findMany({
    where: { campaignId },
    include: rollerInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(rollerToDTO);
}

/** Emits 'rollers:changed' with the full, ordered list of the campaign. */
async function broadcastRollers(campaignId: string): Promise<void> {
  const rollers = await listRollersUnchecked(campaignId);
  emitSafe('rollers:changed', { campaignId, rollers });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createRoller(campaignId: string, raw: unknown): Promise<Roller> {
  const input = parseInput(rollerInputSchema, raw, ROLLER_MESSAGES.invalidRoller);
  await assertCampaign(campaignId);
  const base: RollerDraft = {
    name: '',
    kind: input.kind ?? 'roulette',
    description: '',
    tags: [],
    active: true,
    isTurnRoll: false,
    segments: [],
    formula: null,
    faces: null,
    sortOrder: input.sortOrder ?? (await nextSortOrder(campaignId)),
  };
  const draft = mergeDraft(base, input);
  assertValidRoller(draft);
  const row = await prisma.roller.create({ data: { ...draftColumns(draft), campaignId }, include: rollerInclude });
  await broadcastRollers(campaignId);
  return rollerToDTO(row);
}

export async function updateRoller(rollerId: string, raw: unknown): Promise<Roller> {
  const input = parseInput(rollerInputSchema, raw, ROLLER_MESSAGES.invalidRoller);
  const existing = await loadRoller(rollerId);
  const draft = mergeDraft(draftFromRoller(rollerToDTO(existing)), input);
  assertValidRoller(draft);
  const row = await prisma.roller.update({ where: { id: rollerId }, data: draftColumns(draft), include: rollerInclude });
  await broadcastRollers(row.campaignId);
  return rollerToDTO(row);
}

export async function deleteRoller(rollerId: string): Promise<void> {
  const existing = await prisma.roller.findUnique({ where: { id: rollerId }, select: { id: true, campaignId: true } });
  if (!existing) throw notFound(ROLLER_MESSAGES.rollerNotFound);
  await prisma.roller.delete({ where: { id: rollerId } });
  await broadcastRollers(existing.campaignId);
}

/** Name for a copy that does not clash with the campaign's rollers ("X", "X (importada)", "X (importada 2)"…). */
function importedName(name: string, existing: readonly string[]): string {
  if (!nameTaken(name, existing)) return name;
  const fit = (suffix: string): string => {
    const base = name.length + suffix.length > NAME_MAX ? name.slice(0, NAME_MAX - suffix.length).trimEnd() : name;
    return `${base}${suffix}`;
  };
  let candidate = fit(IMPORTED_SUFFIX);
  for (let n = 2; nameTaken(candidate, existing) && n < 1000; n++) candidate = fit(` (importada ${n})`);
  return candidate;
}

/** Independent copy of any roller (from any campaign) into `campaignId`. */
export async function importRoller(campaignId: string, raw: unknown): Promise<Roller> {
  const { rollerId } = parseInput(importSchema, raw, ROLLER_MESSAGES.invalidRoller);
  await assertCampaign(campaignId);
  const source = rollerToDTO(await loadRoller(rollerId));
  const siblings = await prisma.roller.findMany({ where: { campaignId }, select: { name: true } });
  const draft: RollerDraft = {
    ...draftFromRoller(source),
    name: importedName(source.name, siblings.map((s) => s.name)),
    sortOrder: await nextSortOrder(campaignId),
  };
  const row = await prisma.roller.create({
    data: { ...draftColumns(draft), campaignId, copiedFromId: source.id },
    include: rollerInclude,
  });
  await broadcastRollers(campaignId);
  return rollerToDTO(row);
}

// ---------------------------------------------------------------------------
// Roulette library search (across campaigns)
// ---------------------------------------------------------------------------

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * GET /api/rollers: fuzzy, accent/case-insensitive search over searchText (every query word must match
 * by substring or trigram word similarity), optional tag / campaign / kind filters. Includes campaignName.
 */
export async function searchRollers(rawQuery: unknown): Promise<Roller[]> {
  const query = parseInput(rollerSearchSchema, rawQuery, ROLLER_MESSAGES.invalidSearch);
  const q = normalizeText(query.q);
  const words = q ? [...new Set(q.split(' ').filter((w) => w.length > 0))].slice(0, 8) : [];
  const tag = query.tag ? normalizeTag(query.tag) : '';

  const conditions: Prisma.Sql[] = [];
  if (query.campaignId) conditions.push(Prisma.sql`r."campaignId" = ${query.campaignId}::text`);
  if (query.kind) conditions.push(Prisma.sql`r."kind" = ${query.kind}::text`);
  if (tag) conditions.push(Prisma.sql`${tag}::text = ANY(r."tags")`);
  for (const word of words) {
    conditions.push(
      Prisma.sql`(r."searchText" ILIKE ${`%${escapeLike(word)}%`}::text OR word_similarity(${word}::text, r."searchText") >= ${WORD_SIMILARITY_THRESHOLD}::real)`,
    );
  }
  const where = conditions.length > 0 ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;

  const relevance =
    words.length > 0
      ? Prisma.sql`(
          3 * (r."searchText" LIKE ${`${escapeLike(q)}%`}::text)::int
          + 2 * (r."searchText" LIKE ${`%${escapeLike(q)}%`}::text)::int
          + ${Prisma.join(words.map((w) => Prisma.sql`word_similarity(${w}::text, r."searchText")`), ' + ')}
        ) DESC,`
      : Prisma.empty;

  const hits = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r."id" AS id
    FROM "Roller" r
    JOIN "Campaign" c ON c."id" = r."campaignId"
    WHERE ${where}
    ORDER BY ${relevance} c."name" ASC, r."sortOrder" ASC, r."name" ASC, r."id" ASC
    LIMIT ${SEARCH_LIMIT}::int
  `);
  if (hits.length === 0) return [];

  const rows = await prisma.roller.findMany({ where: { id: { in: hits.map((h) => h.id) } }, include: rollerInclude });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return hits.flatMap((h) => {
    const row = byId.get(h.id);
    return row ? [rollerToDTO(row)] : [];
  });
}
