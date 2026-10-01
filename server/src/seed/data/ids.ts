import type { EntryKind } from '@wailers/shared';

/**
 * Deterministic ids for seeded rows. Stable ids make the seed resumable (createMany + skipDuplicates)
 * and let content reference each other (loot -> items, tokens -> creatures, music -> sounds).
 */

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function entryId(kind: EntryKind, key: string): string {
  return `seed_${kind}_${key}`;
}

export function categoryId(kind: EntryKind, path: readonly string[]): string {
  return `seed_cat_${kind}_${path.map(slugify).join('__')}`;
}

/** Campaign A (seed v2): "Los Cielos de Latón" — steampunk, airships, Vapor as the mana resource. */
export const CAMPAIGN_A_ID = 'seed_campaign_cielos_laton';
/** Campaign B: "Las Criptas de Valdris" — gothic horror, spell slots. */
export const CAMPAIGN_B_ID = 'seed_campaign_criptas_valdris';

/** Campaign A of seed v1 (fantasy). Removed when a v1 database is upgraded to v2. */
export const LEGACY_CAMPAIGN_A = { id: 'seed_campaign_dragon_carmesi', name: 'La Sombra del Dragón Carmesí', ownerId: 'juan' } as const;

/** Id segment per seeded campaign. Campaign A uses a new segment so v2 ids never collide with v1 rows. */
const CAMPAIGN_SEGMENT = { a: 'cielos', b: 'b' } as const;
export type SeedCampaignCode = keyof typeof CAMPAIGN_SEGMENT;

export function zoneId(campaign: SeedCampaignCode, key: string): string {
  return `seed_zone_${CAMPAIGN_SEGMENT[campaign]}_${key}`;
}

export function levelId(campaign: SeedCampaignCode, key: string): string {
  return `lvl_seed_${CAMPAIGN_SEGMENT[campaign]}_${key}`;
}

export function rollerId(campaign: SeedCampaignCode, key: string): string {
  return `seed_roller_${CAMPAIGN_SEGMENT[campaign]}_${key}`;
}
