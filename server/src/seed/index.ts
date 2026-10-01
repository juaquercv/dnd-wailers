import { Prisma, type PrismaClient } from '@prisma/client';
import { ENTRY_KIND_LABELS, SEED_USERS, buildSearchText, normalizeTag, type EntryKind } from '@wailers/shared';
import { ensureAssets } from './assets/generate';
import { buildCampaigns, type SeedCampaign } from './data/campaigns';
import { CATEGORY_ROWS, categoryNames } from './data/categories';
import { CREATURE_ENTRIES } from './data/creatures';
import { HERO_ENTRIES } from './data/heroes';
import { CAMPAIGN_A_ID, CAMPAIGN_B_ID } from './data/ids';
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
 *  - Content (categories, library, heroes, campaigns, zones, rollers) is inserted once,
 *    guarded by AppMeta `seedVersion`. Inserts use deterministic ids + skipDuplicates, so an
 *    interrupted seed can safely run again.
 */

export const SEED_VERSION = '1';
const SEED_VERSION_KEY = 'seedVersion';

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

function validate(entries: SeedEntry[], campaigns: SeedCampaign[], rollers: SeedRoller[]): void {
  const errors: string[] = [];
  const entryIds = new Set<string>();
  for (const e of entries) {
    if (entryIds.has(e.id)) errors.push(`Id de entrada duplicado: ${e.id}`);
    entryIds.add(e.id);
  }
  const kindOf = new Map(entries.map((e) => [e.id, e.kind] as [string, EntryKind]));
  const catIds = new Set(CATEGORY_ROWS.map((c) => c.id));
  const catKind = new Map(CATEGORY_ROWS.map((c) => [c.id, c.kind]));
  for (const e of entries) {
    for (const c of e.categoryIds) {
      if (!catIds.has(c)) errors.push(`${e.name}: categoría inexistente ${c}`);
      else if (catKind.get(c) !== e.kind) errors.push(`${e.name}: la categoría ${c} es de otro tipo`);
    }
    if (e.kind === 'creature') {
      for (const l of (e as SeedEntry<'creature'>).data.suggestedLoot) {
        if (l.entryId && kindOf.get(l.entryId) !== 'item') errors.push(`${e.name}: botín sugerido apunta a un objeto inexistente (${l.entryId})`);
      }
    }
    if (e.kind === 'hero') {
      const hero = e as SeedEntry<'hero'>;
      for (const it of hero.data.inventory) if (it.entryId && kindOf.get(it.entryId) !== 'item') errors.push(`${e.name}: objeto de inventario inexistente (${it.entryId})`);
      for (const sp of hero.data.spells) if (sp.entryId && kindOf.get(sp.entryId) !== 'spell') errors.push(`${e.name}: hechizo inexistente (${sp.entryId})`);
      if (!SEED_USERS.some((u) => u.id === hero.ownerId)) errors.push(`${e.name}: dueño inexistente (${hero.ownerId ?? 'ninguno'})`);
    }
  }
  for (const c of campaigns) {
    const zoneById = new Map(c.zones.map((z) => [z.id, z]));
    const levelExists = (zoneId: string, levelId: string): boolean => zoneById.get(zoneId)?.levels.some((l) => l.id === levelId) ?? false;
    if (!levelExists(c.spawn.zoneId, c.spawn.levelId)) errors.push(`${c.name}: punto de aparición inválido`);
    for (const pin of c.overview.pins) if (!zoneById.has(pin.zoneId)) errors.push(`${c.name}: chincheta hacia zona inexistente`);
    for (const z of c.zones) {
      if (z.parentZoneId && !zoneById.has(z.parentZoneId)) errors.push(`${z.name}: zona padre inexistente`);
      if (!z.levels.some((l) => l.id === z.defaultLevelId)) errors.push(`${z.name}: nivel por defecto inexistente`);
      for (const soundRef of [z.musicSoundId, z.ambienceSoundId]) if (soundRef && kindOf.get(soundRef) !== 'sound') errors.push(`${z.name}: sonido inexistente ${soundRef}`);
      const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const other = z.neighbors[dir];
        if (!other) continue;
        const target = zoneById.get(other);
        if (!target) errors.push(`${z.name}: vecino inexistente (${dir})`);
        else if (target.neighbors[opposite[dir]] !== z.id) errors.push(`${z.name}: vecino ${dir} no recíproco con ${target.name}`);
      }
      for (const level of z.levels) {
        for (const el of level.elements) {
          if (el.type === 'token' && kindOf.get(el.entryId) !== el.entryKind) errors.push(`${z.name}: ficha con entrada inexistente (${el.entryId})`);
          if (el.type === 'transition' && el.target) {
            const t = el.target;
            if (!levelExists(t.zoneId, t.levelId)) errors.push(`${z.name}: transición «${el.label}» con destino inválido`);
            const tz = zoneById.get(t.zoneId);
            const tl = tz?.levels.find((l) => l.id === t.levelId);
            if (tl && (t.x < 0 || t.y < 0 || t.x > tl.background.width || t.y > tl.background.height)) errors.push(`${z.name}: transición «${el.label}» fuera del mapa destino`);
          }
        }
      }
    }
  }
  for (const r of rollers) {
    if (r.kind === 'roulette' && r.segments.length < 2) errors.push(`${r.name}: la ruleta necesita al menos 2 segmentos`);
    if (r.kind === 'dice' && !r.formula && !(r.faces && r.faces.length > 1)) errors.push(`${r.name}: el dado necesita fórmula o caras`);
  }
  if (errors.length > 0) throw new Error(`Datos de semilla inconsistentes:\n - ${errors.join('\n - ')}`);
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function originCampaignId(origin: SeedEntry['origin']): string | null {
  if (origin === 'A') return CAMPAIGN_A_ID;
  if (origin === 'B') return CAMPAIGN_B_ID;
  return null;
}

function entryRow(e: SeedEntry): Prisma.LibraryEntryCreateManyInput {
  const tags = tagsOf(e.tags);
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    description: e.description,
    imageUrl: e.imageUrl,
    tags,
    data: json(e.data),
    level: e.level,
    cr: e.cr,
    hp: e.hp,
    value: e.value,
    weight: e.weight,
    rarity: e.rarity,
    size: e.size,
    ownerId: e.ownerId,
    originCampaignId: originCampaignId(e.origin),
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

function zoneRow(z: SeedZone): Prisma.ZoneCreateManyInput {
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
    musicSoundId: z.musicSoundId,
    ambienceSoundId: z.ambienceSoundId,
    weather: z.weather,
    lighting: z.lighting,
    levels: json(z.levels),
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

async function seedContent(prisma: PrismaClient, log: (msg: string) => void): Promise<void> {
  const started = Date.now();
  const entries = allEntries();
  const campaigns = buildCampaigns();
  validate(entries, campaigns, SEED_ROLLERS);

  // Categories, parents before children.
  const maxDepth = Math.max(...CATEGORY_ROWS.map((c) => c.depth));
  for (let depth = 0; depth <= maxDepth; depth++) {
    const rows = CATEGORY_ROWS.filter((c) => c.depth === depth).map((c) => ({ id: c.id, kind: c.kind, name: c.name, parentId: c.parentId, color: c.color, icon: c.icon, sortOrder: c.sortOrder }));
    if (rows.length > 0) await prisma.category.createMany({ data: rows, skipDuplicates: true });
  }

  // Campaign rows first (library entries reference them as origin).
  await prisma.campaign.createMany({ data: campaigns.map(campaignRow), skipDuplicates: true });

  // Library: items, creatures, spells, sounds, zone templates, heroes.
  await prisma.libraryEntry.createMany({ data: entries.map(entryRow), skipDuplicates: true });
  await prisma.entryCategory.createMany({ data: entries.flatMap((e) => e.categoryIds.map((categoryId) => ({ entryId: e.id, categoryId }))), skipDuplicates: true });

  // Zones and rollers.
  for (const c of campaigns) {
    // Parents first so sub-zones always find them.
    const ordered = [...c.zones].sort((a, b) => Number(a.parentZoneId !== null) - Number(b.parentZoneId !== null));
    await prisma.zone.createMany({ data: ordered.map(zoneRow), skipDuplicates: true });
  }
  await prisma.roller.createMany({ data: SEED_ROLLERS.map(rollerRow), skipDuplicates: true });

  // Usage markers for everything placed in campaign zones.
  const usages = campaigns.flatMap((c) => [...usedEntryIds(c)].map((entryId) => ({ entryId, campaignId: c.id })));
  await prisma.entryUsage.createMany({ data: usages, skipDuplicates: true });

  const counts = new Map<EntryKind, number>();
  for (const e of entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  log(
    `Contenido inicial creado en ${Date.now() - started} ms: ${CATEGORY_ROWS.length} categorías, ` +
      `${[...counts]
        .map(([k, v]) => `${v} ${ENTRY_KIND_LABELS[k].plural.toLowerCase()}`)
        .join(', ')}, ${campaigns.length} campañas, ${campaigns.reduce((s, c) => s + c.zones.length, 0)} zonas, ${SEED_ROLLERS.length} dados/ruletas.`,
  );
}

export async function ensureSeeded(prisma: PrismaClient, opts: EnsureSeededOptions): Promise<void> {
  const log = opts.log ?? (() => undefined);
  await upsertUsers(prisma);
  await ensureAssets(opts.uploadsDir, { force: opts.forceAssets ?? false, log });
  const meta = await prisma.appMeta.findUnique({ where: { key: SEED_VERSION_KEY } });
  if (meta) return;
  await seedContent(prisma, log);
  await prisma.appMeta.upsert({ where: { key: SEED_VERSION_KEY }, create: { key: SEED_VERSION_KEY, value: SEED_VERSION }, update: { value: SEED_VERSION } });
}
