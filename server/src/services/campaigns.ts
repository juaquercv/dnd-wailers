import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  LAYER_IDS,
  LIGHTING_PRESETS,
  WEATHER_TYPES,
  ZONE_TYPES,
  buildSearchText,
  cloneZoneContent,
  createRuleSystem,
  createZoneContent,
  createZoneLevel,
  defaultGrid,
  defaultVisibility,
  emptyNeighbors,
  emptyOverview,
  newId,
  normalizeTags,
  normalizeText,
  type Campaign,
  type CampaignSummary,
  type LayerId,
  type LibraryEntry,
  type MagicMode,
  type OverviewMap,
  type SpawnPoint,
  type Zone,
  type ZoneContent,
  type ZoneLevel,
  type ZoneNeighbors,
} from '@wailers/shared';
import { bus, type DomainEvents } from '../bus';
import { prisma } from '../db';
import { badRequest, forbidden, notFound } from '../http/errors';
import { createEntry } from './library';
import {
  campaignInclude,
  campaignSummaryToDTO,
  campaignToDTO,
  isPlainObject,
  parseLevels,
  parseNeighbors,
  parseOverview,
  parseRules,
  parseSpawn,
  parseVisibility,
  toJson,
  toNullableJson,
  zoneToDTO,
} from './serializers';

/*
 * Campaigns and zones: validation, CRUD, duplication with id remapping, neighbor reciprocity,
 * reference cleanup and library usage markers. Every successful write emits domain bus events
 * so running sessions refresh their cached campaign data.
 */

// ---------------------------------------------------------------------------
// Messages & limits
// ---------------------------------------------------------------------------

export const CAMPAIGN_MESSAGES = {
  campaignNotFound: 'Campaña no encontrada',
  zoneNotFound: 'Zona no encontrada',
  templateNotFound: 'Plantilla de zona no encontrada',
  ownerOnlyDelete: 'Solo el dueño puede eliminar la campaña',
  invalidCampaign: 'Datos de campaña inválidos',
  invalidZone: 'Datos de zona inválidos',
  invalidTemplate: 'Datos de plantilla inválidos',
  campaignName: 'La campaña necesita un nombre',
  zoneName: 'La zona necesita un nombre',
  templateName: 'La plantilla necesita un nombre',
  nameTooLong: `El nombre admite como máximo 120 caracteres`,
  parentMissing: 'La zona padre no existe en esta campaña',
  parentSelf: 'Una zona no puede ser sub-zona de sí misma',
  parentCycle: 'Una zona no puede estar dentro de una de sus propias sub-zonas',
  neighborSelf: 'Una zona no puede ser vecina de sí misma',
  neighborForeign: 'Las zonas vecinas deben pertenecer a la misma campaña',
  defaultLevelMissing: 'El nivel por defecto no existe en esta zona',
  duplicateLevelId: 'Hay dos niveles con el mismo identificador',
  spawnInvalid: 'El punto de aparición debe estar en una zona y un nivel de esta campaña',
  attributeKeys: 'Hay atributos repetidos (misma clave)',
  orderMismatch: 'La lista de zonas no coincide con las zonas de la campaña',
} as const;

const NAME_MAX = 120;
const COPY_SUFFIX = ' (copia)';
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const MAGIC_MODES = ['mana', 'slots', 'uses', 'none'] as const satisfies readonly MagicMode[];
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

type Db = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Validation helpers (Spanish messages, also used by the rollers service)
// ---------------------------------------------------------------------------

export interface IssueDetail {
  path: string;
  message: string;
}

const TYPE_NAMES: Record<string, string> = {
  string: 'un texto',
  number: 'un número',
  integer: 'un número entero',
  boolean: 'verdadero o falso',
  array: 'una lista',
  object: 'un objeto',
  null: 'un valor nulo',
};

/** zod error map with Spanish messages (explicit messages given in the schemas take precedence). */
export const spanishErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') return { message: 'Campo obligatorio' };
      return { message: `Se esperaba ${TYPE_NAMES[issue.expected] ?? issue.expected}` };
    case z.ZodIssueCode.invalid_literal:
      return { message: 'Valor no permitido' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor no permitido (opciones: ${issue.options.join(', ')})` };
    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: `Tipo desconocido (opciones: ${issue.options.map(String).join(', ')})` };
    case z.ZodIssueCode.invalid_union:
      return { message: 'Formato no válido' };
    case z.ZodIssueCode.invalid_string:
      return { message: 'Texto no válido' };
    case z.ZodIssueCode.not_finite:
      return { message: 'Debe ser un número válido' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: Number(issue.minimum) <= 1 ? 'No puede estar vacío' : `Debe tener al menos ${issue.minimum} caracteres` };
      if (issue.type === 'array') return { message: `Debe tener al menos ${issue.minimum} elemento(s)` };
      if (issue.type === 'number') return { message: `Debe ser ${issue.inclusive ? 'mayor o igual que' : 'mayor que'} ${issue.minimum}` };
      return { message: 'Valor demasiado pequeño' };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Admite como máximo ${issue.maximum} caracteres` };
      if (issue.type === 'array') return { message: `Admite como máximo ${issue.maximum} elementos` };
      if (issue.type === 'number') return { message: `Debe ser ${issue.inclusive ? 'menor o igual que' : 'menor que'} ${issue.maximum}` };
      return { message: 'Valor demasiado grande' };
    case z.ZodIssueCode.custom:
      return { message: issue.message ?? 'Valor no válido' };
    default:
      return { message: ctx.defaultError };
  }
};

export function issuesToDetails(issues: readonly z.ZodIssue[]): IssueDetail[] {
  return issues.slice(0, 25).map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/**
 * Validates `data` against `schema`. On failure throws a 400 HttpError whose message is the first
 * custom (refine) message when there is one, otherwise `message`; issues go to `details`.
 */
export function parseInput<S extends z.ZodTypeAny>(schema: S, data: unknown, message: string): z.output<S> {
  const result = schema.safeParse(data ?? {}, { errorMap: spanishErrorMap });
  if (result.success) return result.data as z.output<S>;
  const issues = result.error.issues;
  const first = issues[0];
  const error = first && first.code === z.ZodIssueCode.custom ? first.message : message;
  throw badRequest(error, issuesToDetails(issues));
}

/** Trimmed, non-empty name with explicit (custom) messages. */
export function nameSchema(emptyMessage: string, max = NAME_MAX) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, emptyMessage)
    .refine((value) => value.length <= max, `El nombre admite como máximo ${max} caracteres`);
}

/** "<name> (copia)" without exceeding the name limit. */
export function copyName(name: string, suffix = COPY_SUFFIX, max = NAME_MAX): string {
  const base = name.length + suffix.length > max ? name.slice(0, Math.max(1, max - suffix.length)).trimEnd() : name;
  return `${base}${suffix}`;
}

/** Calls bus listeners without letting a faulty listener break an already committed request. */
export function emitSafe<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
  try {
    bus.emit(event, payload);
  } catch (err) {
    console.error(`[bus] Error en un oyente de «${event}»:`, err);
  }
}

// ---------------------------------------------------------------------------
// Zone document schemas (tolerant: unknown keys kept, cosmetic fields defaulted)
// ---------------------------------------------------------------------------

const finite = z.number().finite();
const unit = finite.transform((value) => Math.min(1, Math.max(0, value)));
const docId = z.string().trim().min(1).max(200);
const color = z.string().max(64);
const url = z.string().max(4000);
/** Optional reference id: '' and whitespace become null. */
const refId = z
  .string()
  .max(200)
  .nullable()
  .transform((value) => (value && value.trim() ? value.trim() : null));
const points = z.array(finite).max(200_000);

const GRID = defaultGrid();
const LEVEL = createZoneLevel();

function elementBase(defaultLayer: LayerId) {
  return {
    id: docId,
    layer: z.enum(LAYER_IDS).default(defaultLayer),
    x: finite,
    y: finite,
    rotation: finite.default(0),
    hidden: z.boolean().default(false),
    locked: z.boolean().default(false),
    name: z.string().max(500).default(''),
  };
}

const spawnPointSchema = z.object({
  zoneId: docId,
  levelId: z.string().max(200),
  x: finite,
  y: finite,
});

const imageElementSchema = z
  .object({
    ...elementBase('objects'),
    type: z.literal('image'),
    url,
    width: finite.default(100),
    height: finite.default(100),
    opacity: unit.default(1),
    entryId: refId.default(null),
  })
  .passthrough();

const shapeElementSchema = z
  .object({
    ...elementBase('objects'),
    type: z.literal('shape'),
    shape: z.enum(['rect', 'ellipse']).default('rect'),
    width: finite.default(100),
    height: finite.default(100),
    fill: color.default('#7a5c3a'),
    stroke: color.default('#000000'),
    strokeWidth: finite.min(0).default(2),
    opacity: unit.default(1),
  })
  .passthrough();

const pathElementSchema = z
  .object({
    ...elementBase('terrain'),
    type: z.literal('path'),
    points,
    stroke: color.default('#f5e6c4'),
    strokeWidth: finite.min(0).default(4),
    closed: z.boolean().default(false),
    fill: color.nullable().default(null),
    opacity: unit.default(1),
  })
  .passthrough();

const textElementSchema = z
  .object({
    ...elementBase('objects'),
    type: z.literal('text'),
    text: z.string().max(20_000).default(''),
    fontSize: finite.positive().default(28),
    color: color.default('#f5e6c4'),
  })
  .passthrough();

const markerElementSchema = z
  .object({
    ...elementBase('objects'),
    type: z.literal('marker'),
    icon: z.string().max(64).default('📍'),
    label: z.string().max(500).default(''),
    color: color.default('#e2b04a'),
  })
  .passthrough();

const tokenElementSchema = z
  .object({
    ...elementBase('tokens'),
    type: z.literal('token'),
    entryId: docId,
    entryKind: z.enum(['creature', 'item']).default('creature'),
    label: z.string().max(500).default(''),
    cells: finite.positive().max(100).default(1),
    imageUrl: url.nullable().default(null),
    startHidden: z.boolean().default(false),
  })
  .passthrough();

const transitionElementSchema = z
  .object({
    ...elementBase('objects'),
    type: z.literal('transition'),
    transitionType: z.enum(['door', 'entrance', 'stairs_up', 'stairs_down', 'portal']).default('door'),
    width: finite.default(70),
    height: finite.default(70),
    label: z.string().max(500).default(''),
    target: spawnPointSchema.nullable().default(null),
  })
  .passthrough();

const noteElementSchema = z
  .object({
    ...elementBase('notes'),
    type: z.literal('note'),
    text: z.string().max(20_000).default(''),
    color: color.default('#f3d58a'),
  })
  .passthrough();

const sceneElementSchema = z.discriminatedUnion('type', [
  imageElementSchema,
  shapeElementSchema,
  pathElementSchema,
  textElementSchema,
  markerElementSchema,
  tokenElementSchema,
  transitionElementSchema,
  noteElementSchema,
]);

const wallSchema = z
  .object({
    id: docId,
    points,
    kind: z.enum(['wall', 'door', 'window']).default('wall'),
    open: z.boolean().default(false),
  })
  .passthrough();

const lightSchema = z
  .object({
    id: docId,
    x: finite,
    y: finite,
    radius: finite.min(0).default(280),
    color: color.default('#ffb347'),
    intensity: unit.default(0.8),
    flicker: z.boolean().default(false),
  })
  .passthrough();

const fogRegionSchema = z
  .object({
    id: docId,
    name: z.string().max(500).default(''),
    points,
  })
  .passthrough();

const gridSchema = z
  .object({
    type: z.enum(['square', 'hex']).default(GRID.type),
    size: finite.min(4).max(2000).default(GRID.size),
    show: z.boolean().default(GRID.show),
    color: color.default(GRID.color),
    opacity: unit.default(GRID.opacity),
    offsetX: finite.default(GRID.offsetX),
    offsetY: finite.default(GRID.offsetY),
    snap: z.boolean().default(GRID.snap),
  })
  .passthrough();

const backgroundSchema = z
  .object({
    url: url.nullable().default(null),
    width: finite.min(1).max(20_000).default(LEVEL.background.width),
    height: finite.min(1).max(20_000).default(LEVEL.background.height),
    color: color.default(LEVEL.background.color),
  })
  .passthrough();

const levelSchema = z
  .object({
    id: docId,
    name: z.string().max(200).default('Nivel'),
    elevation: finite.default(0),
    background: backgroundSchema.default({}),
    grid: gridSchema.default({}),
    elements: z.array(sceneElementSchema).max(20_000).default([]),
    walls: z.array(wallSchema).max(20_000).default([]),
    lights: z.array(lightSchema).max(5_000).default([]),
    fogRegions: z.array(fogRegionSchema).max(5_000).default([]),
  })
  .passthrough();

const levelsSchema = z.array(levelSchema).min(1, 'La zona necesita al menos un nivel').max(50, 'Admite como máximo 50 niveles');

const neighborsSchema = z
  .object({ up: refId, down: refId, left: refId, right: refId })
  .partial();

const gridPosSchema = z.object({ x: finite, y: finite }).nullable();

/** ZoneInput (all optional). `order` is accepted but ignored: use PUT /campaigns/:id/zones/order. */
export const zoneInputSchema = z
  .object({
    name: nameSchema(CAMPAIGN_MESSAGES.zoneName),
    order: z.number().optional(),
    parentZoneId: refId,
    gridPos: gridPosSchema,
    neighbors: neighborsSchema,
    musicSoundId: refId,
    ambienceSoundId: refId,
    tags: z.array(z.string().max(80)).max(50),
    zoneType: z.enum(ZONE_TYPES),
    biome: z.string().max(200),
    weather: z.enum(WEATHER_TYPES),
    lighting: z.enum(LIGHTING_PRESETS),
    levels: levelsSchema,
    defaultLevelId: z.string().max(200),
    notes: z.string().max(100_000),
  })
  .partial();

export const createZoneSchema = zoneInputSchema.extend({
  name: nameSchema(CAMPAIGN_MESSAGES.zoneName),
  templateEntryId: z.string().max(200).nullish(),
});

export const saveTemplateSchema = z.object({
  name: nameSchema(CAMPAIGN_MESSAGES.templateName),
  description: z.string().max(20_000).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  categoryIds: z.array(z.string().max(200)).max(200).optional(),
});

export const reorderZonesSchema = z.object({
  zoneIds: z.array(z.string().max(200)).max(5_000),
});

type LevelOutput = z.output<typeof levelSchema>;

function evenPoints(values: number[]): number[] {
  return values.length % 2 === 0 ? values : values.slice(0, -1);
}

/** Post-validation cleanup: unique level ids, even point lists, degenerate walls/fog dropped. */
function sanitizeLevels(levels: LevelOutput[]): ZoneLevel[] {
  const seen = new Set<string>();
  for (const [index, level] of levels.entries()) {
    if (seen.has(level.id)) {
      throw badRequest(CAMPAIGN_MESSAGES.invalidZone, [{ path: `levels.${index}.id`, message: CAMPAIGN_MESSAGES.duplicateLevelId }]);
    }
    seen.add(level.id);
  }
  const cleaned = levels.map((level) => ({
    ...level,
    elements: level.elements.map((el) => (el.type === 'path' ? { ...el, points: evenPoints(el.points) } : el)),
    walls: level.walls.map((w) => ({ ...w, points: evenPoints(w.points) })).filter((w) => w.points.length >= 4),
    fogRegions: level.fogRegions.map((f) => ({ ...f, points: evenPoints(f.points) })).filter((f) => f.points.length >= 6),
  }));
  return cleaned as unknown as ZoneLevel[];
}

function pickDefaultLevel(levels: readonly ZoneLevel[], ...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate && levels.some((l) => l.id === candidate)) return candidate;
  }
  return levels[0]!.id;
}

// ---------------------------------------------------------------------------
// Campaign document schemas
// ---------------------------------------------------------------------------

const restRuleSchema = z
  .object({
    enabled: z.boolean(),
    label: z.string().max(80),
    restoreHpPct: finite.min(0).max(100),
    restoreMana: z.enum(['none', 'half', 'full']),
    restoreSlots: z.boolean(),
    resetUses: z.boolean(),
  })
  .partial()
  .passthrough();

const ruleSystemSchema = z
  .object({
    magic: z
      .object({
        mode: z.enum(MAGIC_MODES),
        manaName: z.string().max(40),
        manaRegenPerTurn: finite.min(0).max(100_000),
        manaAutoRegen: z.boolean(),
        manaPerLevel: finite.min(0).max(100_000),
        slotsTable: z.array(z.array(finite.int().min(0).max(99)).max(9)).max(20),
      })
      .partial()
      .passthrough(),
    attributes: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(32),
            label: z.string().max(60).default(''),
            short: z.string().max(12).default(''),
            enabled: z.boolean().default(true),
          })
          .passthrough(),
      )
      .max(30)
      .refine((attrs) => new Set(attrs.map((a) => a.key)).size === attrs.length, CAMPAIGN_MESSAGES.attributeKeys),
    showAc: z.boolean(),
    showSpeed: z.boolean(),
    showInitiative: z.boolean(),
    xpEnabled: z.boolean(),
    inventory: z
      .object({ mode: z.enum(['none', 'weight', 'slots']), maxWeight: finite.min(0), maxSlots: finite.int().min(0) })
      .partial()
      .passthrough(),
    currency: z.object({ enabled: z.boolean(), name: z.string().max(40), short: z.string().max(12) }).partial().passthrough(),
    rest: z.object({ short: restRuleSchema, long: restRuleSchema }).partial().passthrough(),
    heroCreation: z
      .object({
        allowNew: z.boolean(),
        startingLevel: finite.int().min(1).max(20),
        maxLevel: finite.int().min(1).max(20),
        startingGold: finite.min(0),
        abilityMethod: z.enum(['free', 'standard_array', 'point_buy']),
        allowedRaceIds: z.array(z.string().max(200)).max(500),
        allowedClassIds: z.array(z.string().max(200)).max(500),
      })
      .partial()
      .passthrough(),
    playersCanRollFreely: z.boolean(),
    playersCanEditOwnResources: z.boolean(),
  })
  .partial()
  .passthrough();

const visibilitySchema = z
  .object({
    visionMode: z.enum(['all', 'explored', 'vision', 'none']),
    visionRadius: finite.min(0).max(1000),
    visionCone: finite.min(1).max(360),
    sharedVision: z.boolean(),
    sceneImageUrl: url.nullable(),
    canSeeOverview: z.boolean(),
    canSeeOtherZones: z.boolean(),
    canSeeEnemyDetails: z.boolean(),
    enemyHp: z.enum(['exact', 'bar', 'hidden']),
    canSeeInitiative: z.boolean(),
    canSeeOthersRolls: z.boolean(),
    canSeeOthersInventory: z.boolean(),
    canMoveOwnToken: z.boolean(),
  })
  .partial()
  .passthrough();

const overviewSchema = z
  .object({
    imageUrl: url.nullable(),
    width: finite.min(1).max(20_000),
    height: finite.min(1).max(20_000),
    pins: z
      .array(
        z
          .object({
            id: docId,
            zoneId: docId,
            x: finite,
            y: finite,
            label: z.string().max(500).nullable().default(null),
            icon: z.string().max(64).nullable().default(null),
          })
          .passthrough(),
      )
      .max(1_000),
    links: z
      .array(
        z
          .object({
            id: docId,
            fromPinId: docId,
            toPinId: docId,
            style: z.enum(['road', 'path', 'sea', 'secret']).default('road'),
          })
          .passthrough(),
      )
      .max(5_000),
  })
  .partial()
  .passthrough();

export const createCampaignSchema = z.object({
  name: nameSchema(CAMPAIGN_MESSAGES.campaignName),
  description: z.string().max(20_000).optional(),
  magicMode: z.enum(MAGIC_MODES).optional(),
});

export const updateCampaignSchema = z
  .object({
    name: nameSchema(CAMPAIGN_MESSAGES.campaignName),
    description: z.string().max(20_000),
    coverUrl: url.nullable(),
    tags: z.array(z.string().max(80)).max(50),
    rules: ruleSystemSchema,
    overview: overviewSchema,
    spawn: spawnPointSchema.extend({ levelId: docId }).nullable(),
    defaultVisibility: visibilitySchema,
  })
  .partial();

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Deep merge: plain objects are merged recursively, anything else in `patch` (arrays, null) replaces. */
function mergeDeep(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) out[key] = mergeDeep(base[key], value);
    return out;
  }
  return patch;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function contentOf(zone: Zone): ZoneContent {
  return {
    zoneType: zone.zoneType,
    biome: zone.biome,
    weather: zone.weather,
    lighting: zone.lighting,
    levels: zone.levels,
    defaultLevelId: zone.defaultLevelId,
    notes: zone.notes,
  };
}

/** Normalized ZoneContent from a zone template entry's `data`. */
function templateContent(data: unknown): ZoneContent {
  const raw = isPlainObject(data) && isPlainObject(data.content) ? data.content : {};
  const base = createZoneContent();
  const storedDefault = typeof raw.defaultLevelId === 'string' ? raw.defaultLevelId : '';
  const levels = parseLevels(raw.levels, newId('tpl'), storedDefault);
  return {
    zoneType: oneOf(ZONE_TYPES, raw.zoneType, base.zoneType),
    biome: typeof raw.biome === 'string' ? raw.biome : base.biome,
    weather: oneOf(WEATHER_TYPES, raw.weather, base.weather),
    lighting: oneOf(LIGHTING_PRESETS, raw.lighting, base.lighting),
    levels,
    defaultLevelId: pickDefaultLevel(levels, storedDefault),
    notes: typeof raw.notes === 'string' ? raw.notes : base.notes,
  };
}

/** Level id map (old -> new) between a content and its cloneZoneContent() copy (same level order). */
function levelIdMap(original: readonly ZoneLevel[], cloned: readonly ZoneLevel[]): Map<string, string> {
  const map = new Map<string, string>();
  original.forEach((level, i) => {
    const copy = cloned[i];
    if (copy) map.set(level.id, copy.id);
  });
  return map;
}

function sameTarget(a: SpawnPoint | null, b: SpawnPoint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.zoneId === b.zoneId && a.levelId === b.levelId && a.x === b.x && a.y === b.y;
}

/** Rewrites every transition target of the levels (null removes the link). Returns copies only when something changed. */
function rewriteTransitionTargets(
  levels: ZoneLevel[],
  rewrite: (target: SpawnPoint) => SpawnPoint | null,
): { levels: ZoneLevel[]; changed: boolean } {
  let changed = false;
  const next = levels.map((level) => {
    let levelChanged = false;
    const elements = level.elements.map((el) => {
      if (el.type !== 'transition' || !el.target) return el;
      const target = parseSpawn(el.target);
      const rewritten = target ? rewrite(target) : null;
      if (sameTarget(el.target, rewritten)) return el;
      levelChanged = true;
      return { ...el, target: rewritten };
    });
    if (!levelChanged) return level;
    changed = true;
    return { ...level, elements };
  });
  return { levels: changed ? next : levels, changed };
}

function levelCenter(level: ZoneLevel): { x: number; y: number } {
  return { x: Math.round(level.background.width / 2), y: Math.round(level.background.height / 2) };
}

function spawnAtDefault(zoneId: string, content: Pick<ZoneContent, 'levels' | 'defaultLevelId'>): SpawnPoint {
  const level = content.levels.find((l) => l.id === content.defaultLevelId) ?? content.levels[0]!;
  return { zoneId, levelId: level.id, ...levelCenter(level) };
}

type TransitionDestination = Pick<ZoneContent, 'levels' | 'defaultLevelId'>;

/**
 * Transitions must lead somewhere. Links to zones outside the campaign (e.g. a deleted zone brought back
 * by a stale editor copy) are removed, and links to a missing level go to the zone's default level center.
 * `self` is the zone being written, checked against its new levels (it may not be stored yet).
 */
async function sanitizeTransitionTargets(
  tx: Db,
  campaignId: string,
  levels: ZoneLevel[],
  self: { id: string } & TransitionDestination,
): Promise<ZoneLevel[]> {
  const otherIds = new Set<string>();
  for (const level of levels) {
    for (const el of level.elements) {
      if (el.type === 'transition' && el.target && el.target.zoneId !== self.id) otherIds.add(el.target.zoneId);
    }
  }
  const destinations = new Map<string, TransitionDestination>([[self.id, self]]);
  if (otherIds.size > 0) {
    const rows = await tx.zone.findMany({ where: { campaignId, id: { in: [...otherIds] } } });
    for (const row of rows) destinations.set(row.id, zoneToDTO(row));
  }
  return rewriteTransitionTargets(levels, (target) => {
    const zone = destinations.get(target.zoneId);
    if (!zone) return null;
    return zone.levels.some((l) => l.id === target.levelId) ? target : spawnAtDefault(target.zoneId, zone);
  }).levels;
}

/** Pins of zones outside the campaign are dropped, links need both pins. */
function cleanOverview(overview: OverviewMap, zoneIds: ReadonlySet<string>): OverviewMap {
  const pins = overview.pins.filter((p) => typeof p.zoneId === 'string' && zoneIds.has(p.zoneId));
  const pinIds = new Set(pins.map((p) => p.id));
  const links = overview.links.filter((l) => pinIds.has(l.fromPinId) && pinIds.has(l.toPinId) && l.fromPinId !== l.toPinId);
  return { ...overview, pins, links };
}

interface ZoneDraft {
  id: string;
  name: string;
  order: number;
  parentZoneId: string | null;
  gridPos: { x: number; y: number } | null;
  neighbors: ZoneNeighbors;
  musicSoundId: string | null;
  ambienceSoundId: string | null;
  tags: string[];
  content: ZoneContent;
}

function zoneRowData(draft: ZoneDraft): Prisma.ZoneCreateManyCampaignInput {
  const { content } = draft;
  return {
    id: draft.id,
    name: draft.name,
    order: draft.order,
    parentZoneId: draft.parentZoneId,
    zoneType: content.zoneType,
    biome: content.biome,
    gridPos: toNullableJson(draft.gridPos),
    neighbors: toJson(draft.neighbors),
    musicSoundId: draft.musicSoundId,
    ambienceSoundId: draft.ambienceSoundId,
    weather: content.weather,
    lighting: content.lighting,
    levels: toJson(content.levels),
    defaultLevelId: content.defaultLevelId,
    notes: content.notes,
    tags: draft.tags,
  };
}

async function touchCampaign(db: Db, campaignId: string, extra: Prisma.CampaignUpdateInput = {}): Promise<void> {
  await db.campaign.update({ where: { id: campaignId }, data: { ...extra, updatedAt: new Date() } });
}

async function requireCampaignRow(db: Db, campaignId: string) {
  const row = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!row) throw notFound(CAMPAIGN_MESSAGES.campaignNotFound);
  return row;
}

/**
 * Row-locks the campaign until the transaction ends, so writes that read and rewrite several zones
 * (neighbor reciprocity, reference cleanup, order) never interleave inside the same campaign.
 */
async function lockCampaign(tx: Db, campaignId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Campaign" WHERE "id" = ${campaignId} FOR UPDATE`;
  if (rows.length === 0) throw notFound(CAMPAIGN_MESSAGES.campaignNotFound);
}

/** Locks the campaign of a zone and returns the zone row read after the lock. */
async function lockZone(tx: Db, zoneId: string) {
  const ref = await tx.zone.findUnique({ where: { id: zoneId }, select: { campaignId: true } });
  if (!ref) throw notFound(CAMPAIGN_MESSAGES.zoneNotFound);
  await lockCampaign(tx, ref.campaignId);
  const row = await tx.zone.findUnique({ where: { id: zoneId } });
  if (!row) throw notFound(CAMPAIGN_MESSAGES.zoneNotFound);
  return row;
}

// ---------------------------------------------------------------------------
// Library usage markers
// ---------------------------------------------------------------------------

/** Library entries referenced by a zone: design-time tokens, library images, music and ambience. */
export function referencedEntryIds(zone: Pick<Zone, 'levels' | 'musicSoundId' | 'ambienceSoundId'>): string[] {
  const ids = new Set<string>();
  if (zone.musicSoundId) ids.add(zone.musicSoundId);
  if (zone.ambienceSoundId) ids.add(zone.ambienceSoundId);
  for (const level of zone.levels) {
    for (const el of level.elements) {
      if (el.type === 'token' && el.entryId) ids.add(el.entryId);
      if (el.type === 'image' && el.entryId) ids.add(el.entryId);
    }
  }
  return [...ids];
}

/**
 * Upserts EntryUsage(campaign) for existing library entries (ids that no longer exist are skipped).
 * Best effort: a failure here never fails the write that triggered it.
 */
export async function recordCampaignUsage(campaignId: string, entryIds: Iterable<string>): Promise<void> {
  const unique = [...new Set(entryIds)].filter((id) => id.length > 0);
  if (unique.length === 0) return;
  try {
    const existing = await prisma.libraryEntry.findMany({ where: { id: { in: unique } }, select: { id: true } });
    if (existing.length === 0) return;
    const ids = existing.map((e) => e.id);
    const now = new Date();
    await prisma.$transaction([
      prisma.entryUsage.createMany({ data: ids.map((entryId) => ({ entryId, campaignId, lastUsedAt: now })), skipDuplicates: true }),
      prisma.entryUsage.updateMany({ where: { campaignId, entryId: { in: ids } }, data: { lastUsedAt: now } }),
    ]);
  } catch (err) {
    console.warn('[campañas] No se pudo registrar el uso de elementos de la biblioteca:', err);
  }
}

// ---------------------------------------------------------------------------
// Bus helpers
// ---------------------------------------------------------------------------

async function emitZonesChanged(campaignId: string, zoneIds: Iterable<string>, known: readonly Zone[] = []): Promise<void> {
  const ids = [...new Set(zoneIds)];
  if (ids.length === 0) return;
  const byId = new Map(known.map((z) => [z.id, z]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    const rows = await prisma.zone.findMany({ where: { id: { in: missing } } });
    for (const row of rows) byId.set(row.id, zoneToDTO(row));
  }
  for (const id of ids) {
    const zone = byId.get(id);
    if (zone) emitSafe('zone:changed', { campaignId, zone });
  }
}

async function emitCampaignChanged(campaignId: string): Promise<Campaign | null> {
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, include: campaignInclude });
  if (!row) return null;
  const campaign = campaignToDTO(row);
  emitSafe('campaign:changed', { campaign });
  return campaign;
}

// ---------------------------------------------------------------------------
// Neighbor reciprocity
// ---------------------------------------------------------------------------

interface NeighborRow {
  id: string;
  parentZoneId: string | null;
  neighbors: unknown;
}

/**
 * Applies `requested` as the neighbors of `zoneId`, keeping links reciprocal:
 *  - a direction pointing to B sets B's opposite direction to this zone; whatever B pointed to there
 *    before loses its reciprocal pointer to B;
 *  - a direction cleared/changed clears the old target's opposite pointer if it pointed to this zone.
 * Unknown ids (deleted zones) become null; zones of other campaigns are rejected.
 * Writes the other zones; returns the final neighbors for `zoneId` and the ids of the other zones changed.
 */
async function applyNeighbors(
  tx: Db,
  zoneId: string,
  current: ZoneNeighbors,
  requested: ZoneNeighbors,
  campaignZones: readonly NeighborRow[],
): Promise<{ neighbors: ZoneNeighbors; changed: string[] }> {
  const byId = new Map<string, ZoneNeighbors>(campaignZones.map((z) => [z.id, parseNeighbors(z.neighbors)]));
  const final: ZoneNeighbors = { ...requested };

  const unknown: string[] = [];
  for (const dir of DIRECTIONS) {
    const target = final[dir];
    if (!target) continue;
    if (target === zoneId) throw badRequest(CAMPAIGN_MESSAGES.neighborSelf);
    if (!byId.has(target)) unknown.push(target);
  }
  if (unknown.length > 0) {
    const foreign = await tx.zone.findMany({ where: { id: { in: unknown } }, select: { id: true } });
    if (foreign.length > 0) throw badRequest(CAMPAIGN_MESSAGES.neighborForeign);
    for (const dir of DIRECTIONS) if (final[dir] && unknown.includes(final[dir]!)) final[dir] = null;
  }

  const dirty = new Set<string>();
  for (const dir of DIRECTIONS) {
    const opp = OPPOSITE[dir];
    const before = current[dir];
    const after = final[dir];

    if (before && before !== after && before !== zoneId) {
      const old = byId.get(before);
      if (old && old[opp] === zoneId) {
        old[opp] = null;
        dirty.add(before);
      }
    }

    if (after) {
      const target = byId.get(after)!;
      if (target[opp] !== zoneId) {
        const previous = target[opp];
        if (previous && previous !== zoneId) {
          const previousNeighbors = byId.get(previous);
          if (previousNeighbors && previousNeighbors[dir] === after) {
            previousNeighbors[dir] = null;
            dirty.add(previous);
          }
        }
        target[opp] = zoneId;
        dirty.add(after);
      }
    }
  }
  dirty.delete(zoneId);

  for (const id of dirty) {
    await tx.zone.update({ where: { id }, data: { neighbors: toJson(byId.get(id)) } });
  }
  return { neighbors: final, changed: [...dirty] };
}

function assertValidParent(zoneId: string | null, parentZoneId: string, campaignZones: readonly NeighborRow[]): void {
  if (zoneId && parentZoneId === zoneId) throw badRequest(CAMPAIGN_MESSAGES.parentSelf);
  const byId = new Map(campaignZones.map((z) => [z.id, z]));
  if (!byId.has(parentZoneId)) throw badRequest(CAMPAIGN_MESSAGES.parentMissing);
  if (!zoneId) return;
  const seen = new Set<string>();
  let cursor: string | null = parentZoneId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === zoneId) throw badRequest(CAMPAIGN_MESSAGES.parentCycle);
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentZoneId ?? null;
  }
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const rows = await prisma.campaign.findMany({ include: campaignInclude, orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }] });
  return rows.map(campaignSummaryToDTO);
}

export async function getCampaign(campaignId: string): Promise<Campaign> {
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, include: campaignInclude });
  if (!row) throw notFound(CAMPAIGN_MESSAGES.campaignNotFound);
  return campaignToDTO(row);
}

/** New campaign with the rule preset, an empty overview, default visibility and a first zone "Zona 1" holding the spawn. */
export async function createCampaign(userId: string, raw: unknown): Promise<Campaign> {
  const input = parseInput(createCampaignSchema, raw, CAMPAIGN_MESSAGES.invalidCampaign);
  const content = createZoneContent();
  const zoneId = newId('zone');
  const firstZone = zoneRowData({
    id: zoneId,
    name: 'Zona 1',
    order: 0,
    parentZoneId: null,
    gridPos: { x: 0, y: 0 },
    neighbors: emptyNeighbors(),
    musicSoundId: null,
    ambienceSoundId: null,
    tags: [],
    content,
  });
  const row = await prisma.campaign.create({
    data: {
      name: input.name,
      description: input.description ?? '',
      ownerId: userId,
      rules: toJson(createRuleSystem(input.magicMode ?? 'mana')),
      overview: toJson(emptyOverview()),
      spawn: toJson(spawnAtDefault(zoneId, content)),
      defaultVisibility: toJson(defaultVisibility()),
      tags: [],
      zones: { createMany: { data: [firstZone] } },
    },
    include: campaignInclude,
  });
  const campaign = campaignToDTO(row);
  emitSafe('campaign:changed', { campaign });
  return campaign;
}

export async function updateCampaign(campaignId: string, raw: unknown): Promise<Campaign> {
  const input = parseInput(updateCampaignSchema, raw, CAMPAIGN_MESSAGES.invalidCampaign);
  const row = await prisma.$transaction(async (tx) => {
    await lockCampaign(tx, campaignId);
    const existing = await requireCampaignRow(tx, campaignId);
    const data: Prisma.CampaignUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl && input.coverUrl.trim() ? input.coverUrl.trim() : null;
    if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
    // Partial documents are merged over the stored ones (explicit nulls clear nullable fields).
    if (input.rules !== undefined) data.rules = toJson(parseRules(mergeDeep(parseRules(existing.rules), input.rules)));
    if (input.defaultVisibility !== undefined) {
      data.defaultVisibility = toJson(parseVisibility(mergeDeep(parseVisibility(existing.defaultVisibility), input.defaultVisibility)));
    }
    if (input.overview !== undefined) {
      const zoneIds = await tx.zone.findMany({ where: { campaignId }, select: { id: true } });
      const merged = parseOverview(mergeDeep(parseOverview(existing.overview), input.overview));
      data.overview = toJson(cleanOverview(merged, new Set(zoneIds.map((z) => z.id))));
    }
    if (input.spawn) {
      const spawn = input.spawn;
      const zone = await tx.zone.findFirst({ where: { id: spawn.zoneId, campaignId }, select: { id: true, levels: true, defaultLevelId: true } });
      const levels = zone ? parseLevels(zone.levels, zone.id, zone.defaultLevelId) : [];
      if (!levels.some((l) => l.id === spawn.levelId)) throw badRequest(CAMPAIGN_MESSAGES.spawnInvalid);
      data.spawn = toJson({ zoneId: spawn.zoneId, levelId: spawn.levelId, x: spawn.x, y: spawn.y } satisfies SpawnPoint);
    } else if (input.spawn === null) {
      data.spawn = Prisma.DbNull;
    }

    return tx.campaign.update({ where: { id: campaignId }, data, include: campaignInclude });
  }, TX_OPTIONS);
  const campaign = campaignToDTO(row);
  emitSafe('campaign:changed', { campaign });
  return campaign;
}

/** Owner only. Zones, rollers, sessions and usage markers cascade; library entries keep existing (origin cleared). */
export async function deleteCampaign(campaignId: string, userId: string): Promise<void> {
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, ownerId: true } });
  if (!row) throw notFound(CAMPAIGN_MESSAGES.campaignNotFound);
  if (row.ownerId !== userId) throw forbidden(CAMPAIGN_MESSAGES.ownerOnlyDelete);
  await prisma.campaign.delete({ where: { id: campaignId } });
  emitSafe('campaign:deleted', { campaignId });
}

/**
 * Deep copy owned by `userId`: zones get fresh ids (levels/elements/walls/lights/fog too) and every
 * internal reference is remapped (sub-zone parents, neighbors, transition targets, overview pins, spawn).
 * Rollers are copied with copiedFromId.
 */
export async function duplicateCampaign(campaignId: string, userId: string): Promise<Campaign> {
  const source = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { zones: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }, rollers: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
  });
  if (!source) throw notFound(CAMPAIGN_MESSAGES.campaignNotFound);

  const zones = source.zones.map(zoneToDTO);
  const zoneMap = new Map(zones.map((z) => [z.id, newId('zone')]));
  const levelMap = new Map<string, string>();
  const defaultLevelOf = new Map<string, ZoneLevel>();
  const levelKey = (zoneId: string, levelId: string): string => `${zoneId}\u0000${levelId}`;

  const clones = zones.map((zone) => {
    const content = cloneZoneContent(contentOf(zone));
    for (const [oldId, newLevelId] of levelIdMap(zone.levels, content.levels)) levelMap.set(levelKey(zone.id, oldId), newLevelId);
    const newZoneId = zoneMap.get(zone.id)!;
    defaultLevelOf.set(newZoneId, content.levels.find((l) => l.id === content.defaultLevelId) ?? content.levels[0]!);
    return { zone, content, newZoneId };
  });

  const remapPoint = (point: SpawnPoint): SpawnPoint | null => {
    const zoneId = zoneMap.get(point.zoneId);
    if (!zoneId) return null;
    const levelId = levelMap.get(levelKey(point.zoneId, point.levelId));
    if (levelId) return { zoneId, levelId, x: point.x, y: point.y };
    const fallback = defaultLevelOf.get(zoneId)!;
    return { zoneId, levelId: fallback.id, ...levelCenter(fallback) };
  };
  const remapZoneRef = (id: string | null): string | null => (id ? (zoneMap.get(id) ?? null) : null);

  const zoneRows = clones.map(({ zone, content, newZoneId }, index) =>
    zoneRowData({
      id: newZoneId,
      name: zone.name,
      order: index,
      parentZoneId: remapZoneRef(zone.parentZoneId),
      gridPos: zone.gridPos,
      neighbors: {
        up: remapZoneRef(zone.neighbors.up),
        down: remapZoneRef(zone.neighbors.down),
        left: remapZoneRef(zone.neighbors.left),
        right: remapZoneRef(zone.neighbors.right),
      },
      musicSoundId: zone.musicSoundId,
      ambienceSoundId: zone.ambienceSoundId,
      tags: [...zone.tags],
      content: { ...content, levels: rewriteTransitionTargets(content.levels, remapPoint).levels },
    }),
  );

  const overview = parseOverview(source.overview);
  const pinMap = new Map<string, string>();
  const pins = overview.pins.flatMap((pin) => {
    const zoneId = zoneMap.get(pin.zoneId);
    if (!zoneId) return [];
    const id = newId('pin');
    pinMap.set(pin.id, id);
    return [{ ...pin, id, zoneId }];
  });
  const links = overview.links.flatMap((link) => {
    const fromPinId = pinMap.get(link.fromPinId);
    const toPinId = pinMap.get(link.toPinId);
    return fromPinId && toPinId ? [{ ...link, id: newId('link'), fromPinId, toPinId }] : [];
  });
  const spawn = parseSpawn(source.spawn);

  const rollerRows: Prisma.RollerCreateManyCampaignInput[] = source.rollers.map((r) => ({
    name: r.name,
    kind: r.kind,
    description: r.description,
    tags: [...r.tags],
    active: r.active,
    isTurnRoll: r.isTurnRoll,
    segments: toJson(r.segments ?? []),
    formula: r.formula,
    faces: toNullableJson(r.faces),
    copiedFromId: r.id,
    sortOrder: r.sortOrder,
    // Same formula as rollers.ts rollerSearchText().
    searchText: buildSearchText({ name: r.name, description: r.description, tags: r.tags }),
  }));

  const row = await prisma.campaign.create({
    data: {
      name: copyName(source.name),
      description: source.description,
      coverUrl: source.coverUrl,
      ownerId: userId,
      rules: toJson(parseRules(source.rules)),
      overview: toJson({ ...overview, pins, links }),
      spawn: toNullableJson(spawn ? remapPoint(spawn) : null),
      defaultVisibility: toJson(parseVisibility(source.defaultVisibility)),
      tags: [...source.tags],
      zones: { createMany: { data: zoneRows } },
      rollers: { createMany: { data: rollerRows } },
    },
    include: campaignInclude,
  });

  await recordCampaignUsage(row.id, zones.flatMap(referencedEntryIds));
  const campaign = campaignToDTO(row);
  emitSafe('campaign:changed', { campaign });
  return campaign;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export async function listZones(campaignId: string): Promise<Zone[]> {
  const exists = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!exists) throw notFound(CAMPAIGN_MESSAGES.campaignNotFound);
  const rows = await prisma.zone.findMany({ where: { campaignId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(zoneToDTO);
}

export async function getZone(zoneId: string): Promise<Zone> {
  const row = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!row) throw notFound(CAMPAIGN_MESSAGES.zoneNotFound);
  return zoneToDTO(row);
}

/**
 * Creates a zone at the end of the slide order. With templateEntryId the content is a fresh-id copy of
 * the template (internal transitions remapped, foreign ones cleared). Sub-zones default to 'subzone'.
 */
export async function createZone(campaignId: string, userId: string, raw: unknown): Promise<Zone> {
  const input = parseInput(createZoneSchema, raw, CAMPAIGN_MESSAGES.invalidZone);
  const levelsInput = input.levels ? sanitizeLevels(input.levels) : null;

  let content: ZoneContent;
  let templateTags: string[] = [];
  let templateId: string | null = null;
  let templateLevelMap: Map<string, string> | null = null;
  if (input.templateEntryId) {
    const entry = await prisma.libraryEntry.findUnique({ where: { id: input.templateEntryId }, select: { id: true, kind: true, data: true, tags: true } });
    if (!entry || entry.kind !== 'zone') throw notFound(CAMPAIGN_MESSAGES.templateNotFound);
    const original = templateContent(entry.data);
    content = cloneZoneContent(original);
    templateLevelMap = levelIdMap(original.levels, content.levels);
    templateTags = [...entry.tags];
    templateId = entry.id;
  } else if (levelsInput) {
    const base = createZoneContent();
    content = { ...base, levels: levelsInput, defaultLevelId: pickDefaultLevel(levelsInput, input.defaultLevelId) };
  } else {
    content = createZoneContent();
  }

  const zoneId = newId('zone');
  const outcome = await prisma.$transaction(async (tx) => {
    await lockCampaign(tx, campaignId);
    const campaignZones = await tx.zone.findMany({ where: { campaignId }, select: { id: true, parentZoneId: true, neighbors: true, order: true } });
    const parentZoneId = input.parentZoneId ?? null;
    if (parentZoneId) assertValidParent(null, parentZoneId, campaignZones);

    if (templateLevelMap) {
      // Template transitions: links to its own levels now point to the new zone; others survive only inside this campaign.
      const map = templateLevelMap;
      const known = new Set(campaignZones.map((z) => z.id));
      content.levels = rewriteTransitionTargets(content.levels, (target) => {
        const ownLevel = map.get(target.levelId);
        if (ownLevel) return { ...target, zoneId, levelId: ownLevel };
        return known.has(target.zoneId) ? target : null;
      }).levels;
    }
    content.levels = await sanitizeTransitionTargets(tx, campaignId, content.levels, {
      id: zoneId,
      levels: content.levels,
      defaultLevelId: content.defaultLevelId,
    });

    const finalContent: ZoneContent = {
      ...content,
      zoneType: input.zoneType ?? (parentZoneId ? 'subzone' : content.zoneType),
      biome: input.biome ?? content.biome,
      weather: input.weather ?? content.weather,
      lighting: input.lighting ?? content.lighting,
      notes: input.notes ?? content.notes,
    };
    const order = campaignZones.reduce((max, z) => Math.max(max, z.order), -1) + 1;
    await tx.zone.create({
      data: {
        ...zoneRowData({
          id: zoneId,
          name: input.name,
          order,
          parentZoneId,
          gridPos: input.gridPos ?? null,
          neighbors: emptyNeighbors(),
          musicSoundId: input.musicSoundId ?? null,
          ambienceSoundId: input.ambienceSoundId ?? null,
          tags: normalizeTags(input.tags ?? templateTags),
          content: finalContent,
        }),
        campaignId,
      },
    });

    let changed: string[] = [];
    if (input.neighbors && DIRECTIONS.some((d) => input.neighbors?.[d])) {
      const requested: ZoneNeighbors = { ...emptyNeighbors(), ...input.neighbors };
      const rows: NeighborRow[] = [...campaignZones, { id: zoneId, parentZoneId, neighbors: emptyNeighbors() }];
      const result = await applyNeighbors(tx, zoneId, emptyNeighbors(), requested, rows);
      await tx.zone.update({ where: { id: zoneId }, data: { neighbors: toJson(result.neighbors) } });
      changed = result.changed;
    }
    await touchCampaign(tx, campaignId);
    const row = await tx.zone.findUniqueOrThrow({ where: { id: zoneId } });
    return { zone: zoneToDTO(row), changed };
  }, TX_OPTIONS);

  await recordCampaignUsage(campaignId, [...referencedEntryIds(outcome.zone), ...(templateId ? [templateId] : [])]);
  if (templateId) {
    const now = new Date();
    await prisma.recentUse
      .upsert({ where: { userId_entryId: { userId, entryId: templateId } }, create: { userId, entryId: templateId, usedAt: now }, update: { usedAt: now } })
      .catch((err: unknown) => console.warn('[campañas] No se pudo marcar la plantilla como usada recientemente:', err));
  }
  await emitZonesChanged(campaignId, [outcome.zone.id, ...outcome.changed], [outcome.zone]);
  return outcome.zone;
}

/**
 * Autosave of a zone (partial ZoneInput). Neighbors are kept reciprocal, removed levels are cleaned
 * from other zones' transitions and from the campaign spawn. `order` is ignored (see reorderZones).
 */
export async function updateZone(zoneId: string, raw: unknown): Promise<Zone> {
  const input = parseInput(zoneInputSchema, raw, CAMPAIGN_MESSAGES.invalidZone);
  const levelsInput = input.levels ? sanitizeLevels(input.levels) : null;

  const outcome = await prisma.$transaction(async (tx) => {
    const row = await lockZone(tx, zoneId);
    const current = zoneToDTO(row);
    const campaignId = row.campaignId;
    const campaignZones = await tx.zone.findMany({ where: { campaignId }, select: { id: true, parentZoneId: true, neighbors: true } });
    const data: Prisma.ZoneUpdateInput = {};
    const affected = new Set<string>();
    let campaignPatch: Prisma.CampaignUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.parentZoneId !== undefined && input.parentZoneId !== current.parentZoneId) {
      if (input.parentZoneId) assertValidParent(zoneId, input.parentZoneId, campaignZones);
      data.parentZoneId = input.parentZoneId;
    }
    if (input.gridPos !== undefined) data.gridPos = toNullableJson(input.gridPos);
    if (input.musicSoundId !== undefined) data.musicSoundId = input.musicSoundId;
    if (input.ambienceSoundId !== undefined) data.ambienceSoundId = input.ambienceSoundId;
    if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
    if (input.zoneType !== undefined) data.zoneType = input.zoneType;
    if (input.biome !== undefined) data.biome = input.biome;
    if (input.weather !== undefined) data.weather = input.weather;
    if (input.lighting !== undefined) data.lighting = input.lighting;
    if (input.notes !== undefined) data.notes = input.notes;

    let finalLevels = current.levels;
    let finalDefault = current.defaultLevelId;
    if (levelsInput) {
      finalDefault = pickDefaultLevel(levelsInput, input.defaultLevelId, current.defaultLevelId);
      finalLevels = await sanitizeTransitionTargets(tx, campaignId, levelsInput, {
        id: zoneId,
        levels: levelsInput,
        defaultLevelId: finalDefault,
      });
      data.levels = toJson(finalLevels);
      data.defaultLevelId = finalDefault;
    } else if (input.defaultLevelId !== undefined && input.defaultLevelId !== current.defaultLevelId) {
      if (!current.levels.some((l) => l.id === input.defaultLevelId)) throw badRequest(CAMPAIGN_MESSAGES.defaultLevelMissing);
      finalDefault = input.defaultLevelId;
      data.defaultLevelId = finalDefault;
    }

    if (input.neighbors) {
      const requested: ZoneNeighbors = { ...current.neighbors, ...input.neighbors };
      const result = await applyNeighbors(tx, zoneId, current.neighbors, requested, campaignZones);
      data.neighbors = toJson(result.neighbors);
      for (const id of result.changed) affected.add(id);
    }

    const updated = await tx.zone.update({ where: { id: zoneId }, data });

    // Levels removed from this zone: retarget links from other zones to this zone's default level, fix the spawn.
    const removed = new Set(current.levels.map((l) => l.id).filter((id) => !finalLevels.some((l) => l.id === id)));
    let campaignChanged = false;
    if (removed.size > 0) {
      const fallback = finalLevels.find((l) => l.id === finalDefault) ?? finalLevels[0]!;
      const retarget: SpawnPoint = { zoneId, levelId: fallback.id, ...levelCenter(fallback) };
      const others = await tx.zone.findMany({ where: { campaignId, id: { not: zoneId } } });
      for (const other of others) {
        const dto = zoneToDTO(other);
        const result = rewriteTransitionTargets(dto.levels, (t) => (t.zoneId === zoneId && removed.has(t.levelId) ? retarget : t));
        if (result.changed) {
          await tx.zone.update({ where: { id: other.id }, data: { levels: toJson(result.levels) } });
          affected.add(other.id);
        }
      }
      const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { spawn: true } });
      const spawn = parseSpawn(campaign?.spawn);
      if (spawn && spawn.zoneId === zoneId && removed.has(spawn.levelId)) {
        campaignPatch = { spawn: toJson(retarget) };
        campaignChanged = true;
      }
    }

    await touchCampaign(tx, campaignId, campaignPatch);
    return { zone: zoneToDTO(updated), affected: [...affected], campaignChanged };
  }, TX_OPTIONS);

  const { zone } = outcome;
  await recordCampaignUsage(zone.campaignId, referencedEntryIds(zone));
  await emitZonesChanged(zone.campaignId, [zone.id, ...outcome.affected], [zone]);
  if (outcome.campaignChanged) await emitCampaignChanged(zone.campaignId);
  return zone;
}

/** All descendants (sub-zones, recursively) of `rootId`, including itself. */
function subtreeIds(rootId: string, zones: readonly { id: string; parentZoneId: string | null }[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const z of zones) {
    if (!z.parentZoneId) continue;
    const list = children.get(z.parentZoneId) ?? [];
    list.push(z.id);
    children.set(z.parentZoneId, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/**
 * Deletes a zone and its sub-zones. Other zones lose neighbor links and transition targets to them,
 * the overview loses their pins (and links), the spawn is cleared if it was inside, order is renumbered.
 */
export async function deleteZone(zoneId: string): Promise<void> {
  const outcome = await prisma.$transaction(async (tx) => {
    const row = await lockZone(tx, zoneId);
    const campaignId = row.campaignId;
    const all = (await tx.zone.findMany({ where: { campaignId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })).map(zoneToDTO);
    const deleted = subtreeIds(zoneId, all);
    await tx.zone.deleteMany({ where: { id: { in: [...deleted] } } });

    const remaining = all.filter((z) => !deleted.has(z.id));
    const changed: string[] = [];
    let reordered = false;
    for (const [index, zone] of remaining.entries()) {
      const data: Prisma.ZoneUpdateInput = {};
      const neighbors: ZoneNeighbors = { ...zone.neighbors };
      let neighborsChanged = false;
      for (const dir of DIRECTIONS) {
        const target = neighbors[dir];
        if (target && deleted.has(target)) {
          neighbors[dir] = null;
          neighborsChanged = true;
        }
      }
      if (neighborsChanged) data.neighbors = toJson(neighbors);
      const transitions = rewriteTransitionTargets(zone.levels, (t) => (deleted.has(t.zoneId) ? null : t));
      if (transitions.changed) data.levels = toJson(transitions.levels);
      if (zone.order !== index) {
        data.order = index;
        reordered = true;
      }
      if (Object.keys(data).length > 0) await tx.zone.update({ where: { id: zone.id }, data });
      if (neighborsChanged || transitions.changed) changed.push(zone.id);
    }

    const campaign = await requireCampaignRow(tx, campaignId);
    const overview = parseOverview(campaign.overview);
    const cleaned = cleanOverview(overview, new Set(remaining.map((z) => z.id)));
    const spawn = parseSpawn(campaign.spawn);
    const patch: Prisma.CampaignUpdateInput = {};
    if (cleaned.pins.length !== overview.pins.length || cleaned.links.length !== overview.links.length) patch.overview = toJson(cleaned);
    if (spawn && deleted.has(spawn.zoneId)) patch.spawn = Prisma.DbNull;
    const campaignChanged = Object.keys(patch).length > 0;
    await touchCampaign(tx, campaignId, patch);

    return { campaignId, deleted: [...deleted], changed, reordered, campaignChanged };
  }, TX_OPTIONS);

  for (const id of outcome.deleted) emitSafe('zone:deleted', { campaignId: outcome.campaignId, zoneId: id });
  await emitZonesChanged(outcome.campaignId, outcome.changed);
  if (outcome.reordered) emitSafe('zones:reordered', { campaignId: outcome.campaignId });
  if (outcome.campaignChanged) await emitCampaignChanged(outcome.campaignId);
}

/** Copy placed right after the original: "<name> (copia)", fresh ids, same parent, no neighbors, not in the grid. */
export async function duplicateZone(zoneId: string): Promise<Zone> {
  const outcome = await prisma.$transaction(async (tx) => {
    const row = await lockZone(tx, zoneId);
    const source = zoneToDTO(row);
    const copyId = newId('zone');
    const content = cloneZoneContent(contentOf(source));
    const levels = levelIdMap(source.levels, content.levels);
    // Internal links (stairs between levels of the same zone) follow the copy.
    content.levels = rewriteTransitionTargets(content.levels, (t) =>
      t.zoneId === source.id ? { ...t, zoneId: copyId, levelId: levels.get(t.levelId) ?? content.defaultLevelId } : t,
    ).levels;

    const shifted = await tx.zone.updateMany({
      where: { campaignId: source.campaignId, order: { gt: source.order } },
      data: { order: { increment: 1 } },
    });
    await tx.zone.create({
      data: {
        ...zoneRowData({
          id: copyId,
          name: copyName(source.name),
          order: source.order + 1,
          parentZoneId: source.parentZoneId,
          gridPos: null,
          neighbors: emptyNeighbors(),
          musicSoundId: source.musicSoundId,
          ambienceSoundId: source.ambienceSoundId,
          tags: [...source.tags],
          content,
        }),
        campaignId: source.campaignId,
      },
    });
    await touchCampaign(tx, source.campaignId);
    const created = await tx.zone.findUniqueOrThrow({ where: { id: copyId } });
    return { zone: zoneToDTO(created), reordered: shifted.count > 0 };
  }, TX_OPTIONS);

  const { zone } = outcome;
  await recordCampaignUsage(zone.campaignId, referencedEntryIds(zone));
  await emitZonesChanged(zone.campaignId, [zone.id], [zone]);
  if (outcome.reordered) emitSafe('zones:reordered', { campaignId: zone.campaignId });
  return zone;
}

/**
 * Saves the zone content as a library zone template (kind 'zone', data { content }). Links to other
 * zones are removed (templates are campaign-agnostic); links between its own levels are kept.
 */
export async function saveZoneAsTemplate(zoneId: string, userId: string, raw: unknown): Promise<LibraryEntry<'zone'>> {
  const input = parseInput(saveTemplateSchema, raw, CAMPAIGN_MESSAGES.invalidTemplate);
  const zone = await getZone(zoneId);
  const levels = rewriteTransitionTargets(zone.levels, (t) => (t.zoneId === zone.id ? t : null)).levels;
  const content: ZoneContent = { ...contentOf(zone), levels };
  const defaultLevel = levels.find((l) => l.id === zone.defaultLevelId) ?? levels[0]!;
  const entry = await createEntry(
    {
      kind: 'zone',
      name: input.name,
      description: input.description ?? '',
      imageUrl: defaultLevel.background.url,
      tags: input.tags ?? [],
      categoryIds: input.categoryIds ?? [],
      originCampaignId: zone.campaignId,
      level: levels.length,
      data: { content },
    },
    userId,
  );
  return entry as LibraryEntry<'zone'>;
}

/** Sets the slide order; `zoneIds` must contain exactly the campaign's zones. */
export async function reorderZones(campaignId: string, raw: unknown): Promise<void> {
  const { zoneIds } = parseInput(reorderZonesSchema, raw, CAMPAIGN_MESSAGES.orderMismatch);
  const changed = await prisma.$transaction(async (tx) => {
    await lockCampaign(tx, campaignId);
    const zones = await tx.zone.findMany({ where: { campaignId }, select: { id: true, order: true } });
    const known = new Set(zones.map((z) => z.id));
    const unique = new Set(zoneIds);
    if (unique.size !== zoneIds.length || unique.size !== known.size || zoneIds.some((id) => !known.has(id))) {
      throw badRequest(CAMPAIGN_MESSAGES.orderMismatch);
    }
    const currentOrder = new Map(zones.map((z) => [z.id, z.order]));
    let count = 0;
    for (const [index, id] of zoneIds.entries()) {
      if (currentOrder.get(id) === index) continue;
      await tx.zone.update({ where: { id }, data: { order: index } });
      count++;
    }
    await touchCampaign(tx, campaignId);
    return count > 0;
  }, TX_OPTIONS);
  if (changed) emitSafe('zones:reordered', { campaignId });
}

/** True when a normalized name already exists in the list (accent/case-insensitive). */
export function nameTaken(name: string, existing: readonly string[]): boolean {
  const target = normalizeText(name);
  return existing.some((n) => normalizeText(n) === target);
}
