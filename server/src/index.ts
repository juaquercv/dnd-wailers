import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { APP_NAME } from '@wailers/shared';
import { claims } from './auth/claims';
import { config } from './config';
import { prisma } from './db';
import { buildApp } from './http/app';
import { initLive } from './live/index';
import { createSocketServer, setSessionManager } from './realtime/socket';
import { ensureSeeded } from './seed/index';

function log(message: string): void {
  console.log(`[${APP_NAME}] ${message}`);
}

/** Non-internal IPv4 addresses of this machine (LAN URLs for the players). */
function lanAddresses(): string[] {
  const out = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      // Some Node 18 builds reported the family as a number.
      const family = String(entry.family);
      if ((family === 'IPv4' || family === '4') && !entry.internal) out.add(entry.address);
    }
  }
  return [...out];
}

function runningInDocker(): boolean {
  return existsSync('/.dockerenv');
}

function printBanner(port: number): void {
  const mode = config.isProduction ? 'producción' : 'desarrollo';
  log(`Servidor listo (modo ${mode}).`);
  log(`En este equipo: http://localhost:${port}`);
  const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
  if (loopbackOnly) {
    log(`Escuchando solo en ${config.host}: para jugar en red local usa HOST=0.0.0.0.`);
  } else if (runningInDocker()) {
    const published = config.publicPort ?? 8080;
    log(`Accede desde la red local: http://<IP de este equipo>:${published} (o el puerto definido en APP_PORT)`);
  } else {
    const ips = lanAddresses();
    if (ips.length === 0) log('No se detectó ninguna red local; solo se podrá acceder desde este equipo.');
    for (const ip of ips) log(`Accede desde la red local: http://${ip}:${port}`);
    log('Si lo ejecutas con Docker, usa la IP de tu equipo y el puerto publicado (o el puerto definido en APP_PORT).');
  }
  log(`Archivos subidos en: ${config.uploadsDir}`);
  if (!existsSync(config.clientDist)) {
    log('La interfaz no está compilada: en desarrollo usa el servidor de Vite (npm run dev).');
  }
}

async function main(): Promise<void> {
  log('Iniciando…');
  await mkdir(config.uploadsDir, { recursive: true });

  await prisma.$connect();
  await ensureSeeded(prisma, { uploadsDir: config.uploadsDir, log });
  await claims.refreshUsers();

  const app = await buildApp();
  const io = createSocketServer(app.server);
  const manager = initLive(io);
  setSessionManager(manager);

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    log(`Señal ${signal} recibida: guardando partidas y cerrando…`);
    const force = setTimeout(() => {
      console.error(`[${APP_NAME}] El cierre tardó demasiado; se fuerza la salida.`);
      process.exit(1);
    }, 10_000);
    force.unref();

    try {
      await manager.persistAll();
    } catch (err) {
      console.error(`[${APP_NAME}] Error al guardar las partidas:`, err);
    }
    claims.dispose();
    try {
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    } catch (err) {
      console.error(`[${APP_NAME}] Error al cerrar Socket.IO:`, err);
    }
    try {
      await app.close();
    } catch (err) {
      console.error(`[${APP_NAME}] Error al cerrar el servidor HTTP:`, err);
    }
    await prisma.$disconnect().catch(() => undefined);
    log('Servidor detenido. ¡Hasta la próxima aventura!');
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  const address = app.server.address();
  const port = address && typeof address === 'object' ? (address as AddressInfo).port : config.port;
  printBanner(port);
}

process.on('unhandledRejection', (reason) => {
  console.error(`[${APP_NAME}] Promesa rechazada sin controlar:`, reason);
});

main().catch(async (err: unknown) => {
  console.error(`[${APP_NAME}] No se pudo iniciar el servidor:`, err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
