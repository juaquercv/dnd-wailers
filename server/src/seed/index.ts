import { Prisma, type PrismaClient } from '@prisma/client';
import { ENTRY_KIND_LABELS, SEED_USERS, buildSearchText, normalizeTag, type CreatureData, type EntryKind, type HeroData, type SceneElement, type ZoneLevel } from '@wailers/shared';
import { ensureAssets } from './assets/generate';
import { buildCampaigns, type SeedCampaign } from './data/campaigns';
import { CATEGORY_ROWS, categoryNames } from './data/categories';
import { CREATURE_ENTRIES } from './data/creatures';
import { HERO_ENTRIES } from './data/heroes';
import { CAMPAIGN_A_ID, CAMPAIGN_B_ID, LEGACY_CAMPAIGN_A } from './data/ids';
import { ITEM_ENTRIES } from './data/items';
import { SEED_ROLLERS, type SeedRoller } from './data/rollers';
import { SOUND_ENTRIES } from './data/sounds';
import { SPELL_ENTRIES } from './data/spells';
import { TEMPLATE_ENTRIES } from './data/templates';
import type { SeedEntry } from './data/types';
import type { SeedZone } from './data/zoneKit';

/**
 * Seeding entry point (called on every server boot).
 *  - Users are always upserted.
 *  - Generated asset files are (re)created when missing.
 *  - Content is versioned with AppMeta `seedVersion`:
 *      · fresh database → everything is created at the current version;
 *      · older version  → only content introduced after it is added (entries matched by id, or by kind + name
 *        so nothing is duplicated), the v1 fantasy campaign A is replaced by "Los Cielos de Latón", and
 *        everything else (campaign B, existing library entries, user content) is left untouched.
 *  Inserts use deterministic ids + skipDuplicates, so an interrupted seed can safely run again.
 */

export const SEED_VERSION = '2';
const SEED_VERSION_KEY = 'seedVersion';

/** Version that introduced each seeded campaign. */
const CAMPAIGN_SINCE: Record<string, number> = { [CAMPAIGN_A_ID]: 2, [CAMPAIGN_B_ID]: 1 };

export interface EnsureSeededOptions {
  uploadsDir: string;
  log?: (msg: string) => void;
  /** Regenerate every asset file even if it exists (CLI --force). */
  forceAssets?: boolean;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function tagsOf(raw: string[]): string[] {
  return [...new Set(raw.map((t) => normalizeTag(t)).filter((t) => t.length > 0))];
}

function allEntries(): SeedEntry[] {
  return [...ITEM_ENTRIES, ...CREATURE_ENTRIES, ...SPELL_ENTRIES, ...SOUND_ENTRIES, ...TEMPLATE_ENTRIES, ...HERO_ENTRIES];
}

// ---------------------------------------------------------------------------
// Validation (fails loudly on inconsistent seed data)
// ---------------------------------------------------------------------------

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

function validate(entries: SeedEntry[], campaigns: SeedCampaign[], rollers: SeedRoller[]): void {
  const errors: string[] = [];
  const entryIds = new Set<string>();
  for (const e of entries) {
    if (entryIds.has(e.id)) errors.push(`Id de entrada duplicado: ${e.id}`);
    entryIds.add(e.id);
  }
  const names = new Set<string>();
  for (const e of entries) {
    const key = `${e.kind}:${e.name.toLowerCase()}`;
    if (names.has(key)) errors.push(`Nombre repetido dentro del mismo tipo: ${e.name}`);
    names.add(key);
  }
  const byId = new Map(entries.map((e) => [e.id, e] as [string, SeedEntry]));
  const kindOf = (id: string): EntryKind | undefined => byId.get(id)?.kind;
  const catIds = new Set(CATEGORY_ROWS.map((c) => c.id));
  const catRow = new Map(CATEGORY_ROWS.map((c) => [c.id, c]));
  for (const e of entries) {
    for (const c of e.categoryIds) {
      const row = catRow.get(c);
      if (!catIds.has(c) || !row) errors.push(`${e.name}: categoría inexistente ${c}`);
      else if (row.kind !== e.kind) errors.push(`${e.name}: la categoría ${c} es de otro tipo`);
      else if (row.since > e.since) errors.push(`${e.name}: usa una categoría más nueva que la propia entrada (${c})`);
    }
    if (e.kind === 'creature') {
      for (const l of (e as SeedEntry<'creature'>).data.suggestedLoot) {
        if (l.entryId && kindOf(l.entryId) !== 'item') errors.push(`${e.name}: botín sugerido apunta a un objeto inexistente (${l.entryId})`);
      }
    }
    if (e.kind === 'hero') {
      const hero = e as SeedEntry<'hero'>;
      for (const it of hero.data.inventory) if (it.entryId && kindOf(it.entryId) !== 'item') errors.push(`${e.name}: objeto de inventario inexistente (${it.entryId})`);
      for (const sp of hero.data.spells) if (sp.entryId && kindOf(sp.entryId) !== 'spell') errors.push(`${e.name}: hechizo inexistente (${sp.entryId})`);
      if (!SEED_USERS.some((u) => u.id === hero.ownerId)) errors.push(`${e.name}: dueño inexistente (${hero.ownerId ?? 'ninguno'})`);
    }
  }
  for (const c of campaigns) {
    if (!(c.id in CAMPAIGN_SINCE)) errors.push(`${c.name}: campaña sin versión de semilla`);
    const zoneById = new Map(c.zones.map((z) => [z.id, z]));
    const levelExists = (zoneId: string, levelId: string): boolean => zoneById.get(zoneId)?.levels.some((l) => l.id === levelId) ?? false;
    if (!levelExists(c.spawn.zoneId, c.spawn.levelId)) errors.push(`${c.name}: punto de aparición inválido`);
    for (const pin of c.overview.pins) if (!zoneById.has(pin.zoneId)) errors.push(`${c.name}: chincheta hacia zona inexistente`);
    const pinIds = new Set(c.overview.pins.map((p) => p.id));
    for (const link of c.overview.links) if (!pinIds.has(link.fromPinId) || !pinIds.has(link.toPinId)) errors.push(`${c.name}: enlace del mapa general con chinchetas inexistentes`);
    const levelIds = new Set<string>();
    for (const z of c.zones) {
      if (z.parentZoneId && !zoneById.has(z.parentZoneId)) errors.push(`${z.name}: zona padre inexistente`);
      if (!z.levels.some((l) => l.id === z.defaultLevelId)) errors.push(`${z.name}: nivel por defecto inexistente`);
      for (const soundRef of [z.musicSoundId, z.ambienceSoundId]) if (soundRef && kindOf(soundRef) !== 'sound') errors.push(`${z.name}: sonido inexistente ${soundRef}`);
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const other = z.neighbors[dir];
        if (!other) continue;
        const target = zoneById.get(other);
        if (!target) {
          errors.push(`${z.name}: vecino inexistente (${dir})`);
          continue;
        }
        if (target.neighbors[OPPOSITE[dir]] !== z.id) errors.push(`${z.name}: vecino ${dir} no recíproco con ${target.name}`);
        if (z.gridPos && target.gridPos && (target.gridPos.x !== z.gridPos.x + STEP[dir][0] || target.gridPos.y !== z.gridPos.y + STEP[dir][1])) errors.push(`${z.name}: el vecino ${dir} (${target.name}) no está en la casilla contigua de la cuadrícula`);
      }
      for (const level of z.levels) {
        if (levelIds.has(level.id)) errors.push(`${z.name}: id de nivel repetido (${level.id})`);
        levelIds.add(level.id);
        for (const el of level.elements) {
          if (el.type === 'token' && kindOf(el.entryId) !== el.entryKind) errors.push(`${z.name}: ficha con entrada inexistente (${el.entryId})`);
          if (el.type === 'token' && (el.x < 0 || el.y < 0 || el.x > level.background.width || el.y > level.background.height)) errors.push(`${z.name}: ficha «${el.label}» fuera del mapa`);
          if (el.type === 'transition' && el.target) {
            const t = el.target;
            if (!levelExists(t.zoneId, t.levelId)) errors.push(`${z.name}: transición «${el.label}» con destino inválido`);
            const tl = zoneById.get(t.zoneId)?.levels.find((l) => l.id === t.levelId);
            if (tl && (t.x < 0 || t.y < 0 || t.x > tl.background.width || t.y > tl.background.height)) errors.push(`${z.name}: transición «${el.label}» fuera del mapa destino`);
          }
        }
      }
    }
  }
  for (const r of rollers) {
    if (!campaigns.some((c) => c.id === r.campaignId)) errors.push(`${r.name}: campaña inexistente`);
    if (r.kind === 'roulette' && r.segments.length < 2) errors.push(`${r.name}: la ruleta necesita al menos 2 segmentos`);
    if (r.kind === 'dice' && !r.formula && !(r.faces && r.faces.length > 1)) errors.push(`${r.name}: el dado necesita fórmula o caras`);
  }
  if (errors.length > 0) throw new Error(`Datos de semilla inconsistentes:\n - ${errors.join('\n - ')}`);
}

// ---------------------------------------------------------------------------
// Reference resolution (entries reused by kind + name, references to entries that do not exist)
// ---------------------------------------------------------------------------

class EntryRefs {
  constructor(
    /** Seed id -> id of an equivalent entry already in the database (matched by kind + name). */
    private readonly alias: Map<string, string>,
    /** Entry ids that exist (or will exist) once this seed run finishes. */
    private readonly available: Set<string>,
  ) {}

  resolve(id: string): string | null {
    const real = this.alias.get(id) ?? id;
    return this.available.has(real) ? real : null;
  }

  creature(data: CreatureData): CreatureData {
    return { ...data, suggestedLoot: data.suggestedLoot.map((l) => (l.entryId ? { ...l, entryId: this.resolve(l.entryId) } : l)) };
  }

  hero(data: HeroData): HeroData {
    return {
      ...data,
      inventory: data.inventory.map((it) => (it.entryId ? { ...it, entryId: this.resolve(it.entryId) } : it)),
      spells: data.spells.map((sp) => (sp.entryId ? { ...sp, entryId: this.resolve(sp.entryId) } : sp)),
    };
  }

  levels(levels: ZoneLevel[]): ZoneLevel[] {
    return levels.map((level) => ({
      ...level,
      elements: level.elements.flatMap((el): SceneElement[] => {
        if (el.type === 'token') {
          const id = this.resolve(el.entryId);
          return id ? [{ ...el, entryId: id }] : [];
        }
        if (el.type === 'image' && el.entryId) return [{ ...el, entryId: this.resolve(el.entryId) }];
        return [el];
      }),
    }));
  }
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function originCampaignId(origin: SeedEntry['origin'], campaigns: Set<string>): string | null {
  const id = origin === 'A' ? CAMPAIGN_A_ID : origin === 'B' ? CAMPAIGN_B_ID : null;
  return id && campaigns.has(id) ? id : null;
}

function entryData(e: SeedEntry, refs: EntryRefs): unknown {
  if (e.kind === 'creature') return refs.creature((e as SeedEntry<'creature'>).data);
  if (e.kind === 'hero') return refs.hero((e as SeedEntry<'hero'>).data);
  return e.data;
}

function entryRow(e: SeedEntry, refs: EntryRefs, campaigns: Set<string>): Prisma.LibraryEntryCreateManyInput {
  const tags = tagsOf(e.tags);
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    description: e.description,
    imageUrl: e.imageUrl,
    tags,
    data: json(entryData(e, refs)),
    level: e.level,
    cr: e.cr,
    hp: e.hp,
    value: e.value,
    weight: e.weight,
    rarity: e.rarity,
    size: e.size,
    ownerId: e.ownerId,
    originCampaignId: originCampaignId(e.origin, campaigns),
    searchText: buildSearchText({ name: e.name, description: e.description, tags, extra: categoryNames(e.categoryIds) }),
  };
}

function campaignRow(c: SeedCampaign): Prisma.CampaignCreateManyInput {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    coverUrl: c.coverUrl,
    ownerId: c.ownerId,
    rules: json(c.rules),
    overview: json(c.overview),
    spawn: json(c.spawn),
    defaultVisibility: json(c.defaultVisibility),
    tags: tagsOf(c.tags),
  };
}

function zoneRow(z: SeedZone, refs: EntryRefs): Prisma.ZoneCreateManyInput {
  return {
    id: z.id,
    campaignId: z.campaignId,
    name: z.name,
    order: z.order,
    parentZoneId: z.parentZoneId,
    zoneType: z.zoneType,
    biome: z.biome,
    gridPos: z.gridPos ? json(z.gridPos) : Prisma.DbNull,
    neighbors: json(z.neighbors),
    musicSoundId: z.musicSoundId ? refs.resolve(z.musicSoundId) : null,
    ambienceSoundId: z.ambienceSoundId ? refs.resolve(z.ambienceSoundId) : null,
    weather: z.weather,
    lighting: z.lighting,
    levels: json(refs.levels(z.levels)),
    defaultLevelId: z.defaultLevelId,
    notes: z.notes,
    tags: tagsOf(z.tags),
  };
}

function rollerRow(r: SeedRoller): Prisma.RollerCreateManyInput {
  const tags = tagsOf(r.tags);
  return {
    id: r.id,
    campaignId: r.campaignId,
    name: r.name,
    kind: r.kind,
    description: r.description,
    tags,
    active: r.active,
    isTurnRoll: r.isTurnRoll,
    segments: json(r.segments),
    formula: r.formula,
    faces: r.faces ? json(r.faces) : Prisma.DbNull,
    copiedFromId: null,
    sortOrder: r.sortOrder,
    searchText: buildSearchText({ name: r.name, description: r.description, tags }),
  };
}

/** Library entries referenced by a campaign's zones (tokens, images, music and ambience). */
function usedEntryIds(c: SeedCampaign): Set<string> {
  const ids = new Set<string>();
  for (const z of c.zones) {
    if (z.musicSoundId) ids.add(z.musicSoundId);
    if (z.ambienceSoundId) ids.add(z.ambienceSoundId);
    for (const level of z.levels) {
      for (const el of level.elements) {
        if (el.type === 'token') ids.add(el.entryId);
        if (el.type === 'image' && el.entryId) ids.add(el.entryId);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

async function upsertUsers(prisma: PrismaClient): Promise<void> {
  for (const u of SEED_USERS) {
    await prisma.user.upsert({ where: { id: u.id }, create: { id: u.id, name: u.name, color: u.color }, update: { name: u.name, color: u.color } });
  }
}

/** Categories newer than `from`, parents first; children of categories the user deleted are skipped. */
async function seedCategories(prisma: PrismaClient, from: number): Promise<number> {
  const existing = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  const rows = CATEGORY_ROWS.filter((c) => c.since > from);
  const maxDepth = Math.max(0, ...rows.map((c) => c.depth));
  let created = 0;
  for (let depth = 0; depth <= maxDepth; depth++) {
    const level = rows.filter((c) => c.depth === depth && !existing.has(c.id) && (c.parentId === null || existing.has(c.parentId)));
    if (level.length === 0) continue;
    const res = await prisma.category.createMany({ data: level.map((c) => ({ id: c.id, kind: c.kind, name: c.name, parentId: c.parentId, color: c.color, icon: c.icon, sortOrder: c.sortOrder })), skipDuplicates: true });
    created += res.count;
    for (const c of level) existing.add(c.id);
  }
  return created;
}

async function seedContent(prisma: PrismaClient, from: number, log: (msg: string) => void): Promise<void> {
  const started = Date.now();
  const entries = allEntries();
  const campaigns = buildCampaigns();
  validate(entries, campaigns, SEED_ROLLERS);

  const newCampaigns = campaigns.filter((c) => (CAMPAIGN_SINCE[c.id] ?? 1) > from);
  const newEntries = entries.filter((e) => e.since > from);
  const newCampaignIds = new Set(newCampaigns.map((c) => c.id));
  const newRollers = SEED_ROLLERS.filter((r) => newCampaignIds.has(r.campaignId));

  const categoriesCreated = await seedCategories(prisma, from);

  // The fantasy campaign A of seed v1 is replaced by "Los Cielos de Latón" (zones, rollers, sessions and usages cascade).
  let legacyRemoved = 0;
  if (from < 2) {
    const res = await prisma.campaign.deleteMany({ where: { OR: [{ id: LEGACY_CAMPAIGN_A.id }, { name: LEGACY_CAMPAIGN_A.name, ownerId: LEGACY_CAMPAIGN_A.ownerId }] } });
    legacyRemoved = res.count;
  }

  // Campaign rows first (library entries reference them as origin).
  await prisma.campaign.createMany({ data: newCampaigns.map(campaignRow), skipDuplicates: true });
  const campaignIds = new Set((await prisma.campaign.findMany({ where: { id: { in: campaigns.map((c) => c.id) } }, select: { id: true } })).map((c) => c.id));

  // Library: reuse rows that already exist by id (ours) or by kind + name (avoid duplicates), insert the rest.
  const byId = new Set((await prisma.libraryEntry.findMany({ where: { id: { in: newEntries.map((e) => e.id) } }, select: { id: true } })).map((e) => e.id));
  const missing = newEntries.filter((e) => !byId.has(e.id));
  const alias = new Map<string, string>();
  if (missing.length > 0) {
    const sameName = await prisma.libraryEntry.findMany({
      where: { OR: missing.map((e) => ({ kind: e.kind, name: { equals: e.name, mode: 'insensitive' as const } })) },
      select: { id: true, kind: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const e of missing) {
      const match = sameName.find((row) => row.kind === e.kind && row.name.toLowerCase() === e.name.toLowerCase());
      if (match) alias.set(e.id, match.id);
    }
  }
  const toInsert = missing.filter((e) => !alias.has(e.id));
  const referenced = new Set<string>();
  for (const e of newEntries) {
    if (e.kind === 'creature') for (const l of (e as SeedEntry<'creature'>).data.suggestedLoot) if (l.entryId) referenced.add(l.entryId);
    if (e.kind === 'hero') {
      const hero = (e as SeedEntry<'hero'>).data;
      for (const it of hero.inventory) if (it.entryId) referenced.add(it.entryId);
      for (const sp of hero.spells) if (sp.entryId) referenced.add(sp.entryId);
    }
  }
  for (const c of newCampaigns) for (const id of usedEntryIds(c)) referenced.add(id);
  const referencedReal = [...referenced].map((id) => alias.get(id) ?? id);
  const available = new Set<string>([...toInsert.map((e) => e.id), ...alias.values()]);
  for (const row of await prisma.libraryEntry.findMany({ where: { id: { in: referencedReal } }, select: { id: true } })) available.add(row.id);
  const refs = new EntryRefs(alias, available);

  const inserted = await prisma.libraryEntry.createMany({ data: toInsert.map((e) => entryRow(e, refs, campaignIds)), skipDuplicates: true });
  // Categories for our own entries only (never for user entries matched by name); skip categories the user deleted.
  const ownEntries = newEntries.filter((e) => !alias.has(e.id));
  const categoryIds = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  await prisma.entryCategory.createMany({
    data: ownEntries.flatMap((e) => e.categoryIds.filter((categoryId) => categoryIds.has(categoryId)).map((categoryId) => ({ entryId: e.id, categoryId }))),
    skipDuplicates: true,
  });

  // Zones (parents first so sub-zones always find them), rollers and usage markers of the new campaigns.
  let zonesCreated = 0;
  for (const c of newCampaigns) {
    if (!campaignIds.has(c.id)) continue;
    const ordered = [...c.zones].sort((a, b) => Number(a.parentZoneId !== null) - Number(b.parentZoneId !== null));
    zonesCreated += (await prisma.zone.createMany({ data: ordered.map((z) => zoneRow(z, refs)), skipDuplicates: true })).count;
  }
  const rollersCreated = (await prisma.roller.createMany({ data: newRollers.filter((r) => campaignIds.has(r.campaignId)).map(rollerRow), skipDuplicates: true })).count;
  const usages = newCampaigns
    .filter((c) => campaignIds.has(c.id))
    .flatMap((c) => [...usedEntryIds(c)].map((id) => refs.resolve(id)).filter((id): id is string => id !== null).map((entryId) => ({ entryId, campaignId: c.id })));
  await prisma.entryUsage.createMany({ data: usages, skipDuplicates: true });

  const counts = new Map<EntryKind, number>();
  for (const e of toInsert) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const kinds = [...counts].map(([k, v]) => count(v, ENTRY_KIND_LABELS[k].singular.toLowerCase(), ENTRY_KIND_LABELS[k].plural.toLowerCase())).join(', ') || 'ninguna nueva';
  const action = from === 0 ? 'Contenido inicial creado' : `Contenido actualizado de la versión ${from} a la ${SEED_VERSION}`;
  log(
    `${action} en ${Date.now() - started} ms: ${count(categoriesCreated, 'categoría', 'categorías')}, ${count(inserted.count, 'entrada', 'entradas')} de biblioteca (${kinds}), ` +
      `${count(newCampaigns.length, 'campaña', 'campañas')}, ${count(zonesCreated, 'zona', 'zonas')}, ${count(rollersCreated, 'dado o ruleta', 'dados y ruletas')}` +
      (alias.size > 0 ? `, ${count(alias.size, 'entrada reutilizada', 'entradas reutilizadas')} por nombre` : '') +
      (legacyRemoved > 0 ? `; campaña «${LEGACY_CAMPAIGN_A.name}» sustituida por «${campaigns.find((c) => c.id === CAMPAIGN_A_ID)?.name ?? ''}»` : '') +
      '.',
  );
}

export async function ensureSeeded(prisma: PrismaClient, opts: EnsureSeededOptions): Promise<void> {
  const log = opts.log ?? (() => undefined);
  await upsertUsers(prisma);
  await ensureAssets(opts.uploadsDir, { force: opts.forceAssets ?? false, log });
  const meta = await prisma.appMeta.findUnique({ where: { key: SEED_VERSION_KEY } });
  const parsed = meta ? Number.parseInt(meta.value, 10) : 0;
  const from = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  if (from >= Number(SEED_VERSION)) return;
  await seedContent(prisma, from, log);
  await prisma.appMeta.upsert({ where: { key: SEED_VERSION_KEY }, create: { key: SEED_VERSION_KEY, value: SEED_VERSION }, update: { value: SEED_VERSION } });
}
