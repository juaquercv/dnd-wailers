/** Seed assets live under <uploadsDir>/seed and are served at /uploads/seed. */
export const SEED_DIR = 'seed';
export const SEED_URL_PREFIX = '/uploads/seed';

/** Bump to force regeneration of every asset file on the next boot. */
export const ASSETS_VERSION = '1';

export function seedUrl(file: string): string {
  return `${SEED_URL_PREFIX}/${file}`;
}

export const portraitFile = (key: string): string => `portraits/${key}.svg`;
export const itemIconFile = (key: string): string => `icons/items/${key}.svg`;
export const spellIconFile = (key: string): string => `icons/spells/${key}.svg`;
export const soundIconFile = (key: string): string => `icons/sounds/${key}.svg`;
export const soundFile = (key: string): string => `audio/${key}.wav`;
