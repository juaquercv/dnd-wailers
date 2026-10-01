import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ensureSeeded } from './index';

/**
 * CLI: `tsx src/seed/run.ts [--force]` (or `node dist/seed/run.js`).
 *  - DATABASE_URL (required) and UPLOADS_DIR (default: server/data/uploads).
 *  - --force regenerates every seed asset file (content seeding stays idempotent).
 */

function isServerPackage(dir: string): boolean {
  const file = resolve(dir, 'package.json');
  if (!existsSync(file)) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && 'name' in parsed && parsed.name === '@wailers/server';
  } catch {
    return false;
  }
}

/** Walks up from this file (works from src/ with tsx and from dist/ with tsup). */
function serverDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (isServerPackage(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const candidate of [process.cwd(), resolve(process.cwd(), 'server')]) if (isServerPackage(candidate)) return candidate;
  return process.cwd();
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[semillas] Falta la variable de entorno DATABASE_URL.');
    process.exitCode = 1;
    return;
  }
  const uploadsDir = resolve(process.env.UPLOADS_DIR?.trim() || resolve(serverDir(), 'data/uploads'));
  const force = process.argv.includes('--force');
  const prisma = new PrismaClient();
  const started = Date.now();
  try {
    console.log(`[semillas] Directorio de archivos: ${uploadsDir}${force ? ' (regenerando recursos)' : ''}`);
    await ensureSeeded(prisma, { uploadsDir, forceAssets: force, log: (msg) => console.log(`[semillas] ${msg}`) });
    console.log(`[semillas] Listo en ${Date.now() - started} ms.`);
  } catch (err) {
    console.error('[semillas] Error al sembrar la base de datos:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
