import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_USER_RELEASE_SECONDS } from '@wailers/shared';

/**
 * Runtime configuration from environment variables.
 * Works from `src/` (tsx) and from bundled `dist/*.js` (tsup): paths are resolved
 * by locating the server package directory instead of assuming a fixed depth.
 */

const here = dirname(fileURLToPath(import.meta.url));

function readPackageName(dir: string): string | null {
  const file = resolve(dir, 'package.json');
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && 'name' in parsed && typeof parsed.name === 'string') return parsed.name;
  } catch {
    // Unreadable package.json: keep searching.
  }
  return null;
}

/** Walk up from this file until the `@wailers/server` package.json is found. */
function findServerDir(): string {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (readPackageName(dir) === '@wailers/server') return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fromCwd = [process.cwd(), resolve(process.cwd(), 'server')];
  for (const candidate of fromCwd) {
    if (readPackageName(candidate) === '@wailers/server') return candidate;
  }
  return resolve(here, '..');
}

function firstExisting(candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function envString(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value.trim() : undefined;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = envString(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

export const serverDir = findServerDir();

const databaseUrl = envString('DATABASE_URL');
if (!databaseUrl) {
  throw new Error(
    'Falta la variable de entorno DATABASE_URL (por ejemplo postgresql://wailers:wailers@localhost:5432/wailers).',
  );
}

const clientDistCandidates = [
  resolve(serverDir, '../client/dist'),
  resolve(here, '../../client/dist'),
  resolve(here, '../../../client/dist'),
  resolve(process.cwd(), 'client/dist'),
  resolve(process.cwd(), '../client/dist'),
];

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  uploadsDir: string;
  clientDist: string;
  userReleaseSeconds: number;
  nodeEnv: string;
  isProduction: boolean;
  /** Host port published by Docker Compose (only used for startup hints). */
  publicPort: number | null;
}

const nodeEnv = envString('NODE_ENV') ?? 'development';
const appPort = envString('APP_PORT');

export const config: AppConfig = {
  port: envInt('PORT', 3000, 1, 65535),
  host: envString('HOST') ?? '0.0.0.0',
  databaseUrl,
  uploadsDir: resolve(envString('UPLOADS_DIR') ?? resolve(serverDir, 'data/uploads')),
  clientDist: resolve(envString('CLIENT_DIST') ?? firstExisting(clientDistCandidates)),
  userReleaseSeconds: envInt('USER_RELEASE_SECONDS', DEFAULT_USER_RELEASE_SECONDS, 1, 24 * 60 * 60),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  publicPort: appPort && /^\d+$/.test(appPort) ? Number(appPort) : null,
};
