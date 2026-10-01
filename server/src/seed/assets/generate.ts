import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ITEM_DEFS } from '../data/items';
import { AUDIO_SPECS } from './audio';
import { GADGET_ICON_SPECS, ITEM_SYMBOLS, SOUND_ICON_SPECS, SPELL_ICON_SPECS, buildGadgetIcon, buildItemIcon, buildSoundIcon, buildSpellIcon } from './icons';
import { MAP_SPECS } from './maps';
import { ASSETS_VERSION, SEED_DIR, itemIconFile, portraitFile, soundIconFile, spellIconFile } from './paths';
import { PORTRAIT_SPECS, buildPortrait } from './portraits';
import { SAMPLE_RATE } from './synth';
import { encodeWav } from './wav';

/** Every generated seed file: maps, portraits, icons and audio. Built lazily, only when missing. */

export interface AssetFile {
  /** Relative to <uploadsDir>/seed. */
  file: string;
  build: () => string | Buffer;
}

export function listAssetFiles(): AssetFile[] {
  const files: AssetFile[] = [];
  for (const spec of Object.values(MAP_SPECS)) files.push({ file: spec.file, build: spec.build });
  for (const [key, spec] of Object.entries(PORTRAIT_SPECS)) files.push({ file: portraitFile(key), build: () => buildPortrait(spec, key) });
  for (const def of ITEM_DEFS) files.push({ file: itemIconFile(def.key), build: () => buildItemIcon(ITEM_SYMBOLS[def.symbol], def.rarity, def.name) });
  for (const [key, spec] of Object.entries(SPELL_ICON_SPECS)) files.push({ file: spellIconFile(key), build: () => buildSpellIcon(spec, key) });
  for (const [key, spec] of Object.entries(GADGET_ICON_SPECS)) files.push({ file: spellIconFile(key), build: () => buildGadgetIcon(spec, key) });
  for (const [key, spec] of Object.entries(SOUND_ICON_SPECS)) files.push({ file: soundIconFile(key), build: () => buildSoundIcon(spec, key) });
  for (const spec of Object.values(AUDIO_SPECS)) files.push({ file: spec.file, build: () => encodeWav(spec.build(), SAMPLE_RATE) });
  return files;
}

async function exists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

async function writeAtomic(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

export interface EnsureAssetsResult {
  total: number;
  generated: number;
  ms: number;
}

/**
 * Makes sure every seed asset exists under <uploadsDir>/seed. Missing files are generated;
 * with `force` (or when the assets version changed) everything is regenerated.
 */
export async function ensureAssets(uploadsDir: string, opts: { force?: boolean; log?: (msg: string) => void } = {}): Promise<EnsureAssetsResult> {
  const started = Date.now();
  const root = join(uploadsDir, SEED_DIR);
  const versionFile = join(root, '.assets-version');
  let force = opts.force ?? false;
  if (!force) {
    try {
      force = (await readFile(versionFile, 'utf8')).trim() !== ASSETS_VERSION;
    } catch {
      force = false;
    }
  }
  const files = listAssetFiles();
  let generated = 0;
  for (const asset of files) {
    const target = join(root, asset.file);
    if (!force && (await exists(target))) continue;
    await writeAtomic(target, asset.build());
    generated++;
  }
  await writeAtomic(versionFile, `${ASSETS_VERSION}\n`);
  const ms = Date.now() - started;
  if (generated > 0) opts.log?.(`Recursos generados: ${generated} de ${files.length} archivos en ${ms} ms.`);
  return { total: files.length, generated, ms };
}
