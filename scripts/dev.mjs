// Dev launcher: API server (tsx watch) + Vite client, without npm .cmd shims
// (they break on Windows when the project path contains "&", e.g. "D&D Wailers").
// Usage: node scripts/dev.mjs [--db <postgres-url>] [--api-port 3000] [--web-port 5173]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (rel) => path.join(root, 'node_modules', rel);

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const fileEnv = readEnvFile(path.join(root, '.env'));
const dbUrl =
  arg('db') ||
  process.env.DEV_DATABASE_URL ||
  fileEnv.DEV_DATABASE_URL ||
  `postgresql://${fileEnv.POSTGRES_USER || 'wailers'}:${fileEnv.POSTGRES_PASSWORD || 'wailers'}@localhost:${fileEnv.DEV_DB_PORT || 5433}/${fileEnv.POSTGRES_DB || 'wailers'}`;
// PORT may be injected by preview tools for the web client, so the API uses its own variable.
const apiPort = arg('api-port', process.env.DEV_API_PORT || '3000');
const webPort = arg('web-port', process.env.PORT || '5173');

const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  PORT: apiPort,
  HOST: '0.0.0.0',
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.join(root, 'server', 'data', 'uploads'),
  VITE_API_PORT: apiPort,
  FORCE_COLOR: '1',
};

const schema = path.join(root, 'server', 'prisma', 'schema.prisma');
console.log('[dev] Aplicando migraciones…');
const migrate = spawnSync(process.execPath, [bin('prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema], {
  cwd: path.join(root, 'server'),
  env,
  stdio: 'inherit',
});
if (migrate.status !== 0) {
  console.error('[dev] No se pudieron aplicar las migraciones. ¿Está PostgreSQL en marcha?');
  console.error(`[dev] Base de datos: ${dbUrl.replace(/:[^:@/]+@/, ':***@')}`);
  process.exit(1);
}
if (!fs.existsSync(bin('.prisma/client/index.js'))) {
  spawnSync(process.execPath, [bin('prisma/build/index.js'), 'generate', '--schema', schema], { cwd: path.join(root, 'server'), env, stdio: 'inherit' });
}

const children = [];
function run(name, color, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, target) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) target.write(prefix + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}terminó con código ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('server', '33', [bin('tsx/dist/cli.mjs'), 'watch', '--clear-screen=false', 'src/index.ts'], path.join(root, 'server'));
run('client', '36', [bin('vite/bin/vite.js'), '--port', webPort, '--strictPort'], path.join(root, 'client'));
console.log(`[dev] API en http://localhost:${apiPort} · Cliente en http://localhost:${webPort}`);
