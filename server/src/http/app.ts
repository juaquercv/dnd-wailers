import { existsSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Prisma } from '@prisma/client';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { APP_NAME, MAX_UPLOAD_BYTES, type ApiError } from '@wailers/shared';
import { config } from '../config';
import { HttpError } from './errors';
import { registerRoutes } from './routes/index';

const BODY_LIMIT = 25 * 1024 * 1024;
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

/** Spanish messages for well-known Fastify / plugin client errors. */
const KNOWN_CLIENT_ERRORS: Record<string, string> = {
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Tipo de contenido no soportado',
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: 'La longitud del contenido no es válida',
  FST_ERR_CTP_BODY_TOO_LARGE: 'La petición es demasiado grande',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'El cuerpo de la petición está vacío',
  FST_ERR_CTP_INVALID_JSON_BODY: 'El cuerpo de la petición no es JSON válido',
  FST_REQ_FILE_TOO_LARGE: `El archivo supera el límite de ${MAX_UPLOAD_MB} MB`,
  FST_FILES_LIMIT: 'Solo se puede subir un archivo a la vez',
  FST_PARTS_LIMIT: 'El formulario tiene demasiadas partes',
  FST_FIELDS_LIMIT: 'El formulario tiene demasiados campos',
  FST_PROTO_VIOLATION: 'Nombre de campo no permitido',
  FST_INVALID_MULTIPART_CONTENT_TYPE: 'La petición no es un formulario multipart',
};

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'Debes elegir un usuario para continuar',
  403: 'No tienes permiso para hacer esto',
  404: 'No encontrado',
  405: 'Método no permitido',
  406: 'Formato no aceptado',
  409: 'Conflicto con el estado actual',
  413: 'El contenido es demasiado grande',
  415: 'Tipo de contenido no soportado',
  429: 'Demasiadas peticiones, espera un momento',
};

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  statusCode?: unknown;
  validation?: unknown;
  issues?: unknown;
}

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : null;
}

/** Also recognises ZodErrors created by another copy/version of zod. */
function zodIssues(error: unknown): unknown[] | null {
  if (error instanceof ZodError) return error.issues;
  const e = asErrorLike(error);
  if (e && e.name === 'ZodError' && Array.isArray(e.issues)) return e.issues;
  return null;
}

function sendError(reply: FastifyReply, status: number, body: ApiError): FastifyReply {
  return reply.status(status).type('application/json; charset=utf-8').send(body);
}

function cleanPath(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function notBuiltPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_NAME}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0a08; color: #f3ead6;
         font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  main { max-width: 34rem; margin: 1.5rem; padding: 2rem 2.25rem; border: 1px solid #36302a; border-radius: 14px;
         background: linear-gradient(180deg, #1c1915, #13110e); box-shadow: 0 20px 60px rgba(0,0,0,.55); }
  h1 { margin: 0 0 .75rem; font-family: Cinzel, Georgia, serif; font-size: 1.6rem; letter-spacing: .04em;
       background: linear-gradient(180deg, #f3d58a, #b0852b); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p { line-height: 1.6; color: #cdb98f; margin: .5rem 0; }
  code { background: #27231d; color: #f3d58a; padding: .1rem .4rem; border-radius: 6px; }
</style>
</head>
<body>
<main>
  <h1>${APP_NAME}</h1>
  <p>El servidor está funcionando, pero la interfaz web todavía no está compilada.</p>
  <p>En desarrollo abre la interfaz desde el servidor de Vite (<code>npm run dev</code>).</p>
  <p>Para servirla desde aquí, compílala con <code>npm run build</code> y reinicia el servidor.</p>
</main>
</body>
</html>`;
}

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply | void {
  if (reply.sent) return;

  const issues = zodIssues(error);
  if (issues) return sendError(reply, 400, { error: 'Datos inválidos', details: issues });

  if (error instanceof HttpError) {
    if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
    const body: ApiError = { error: error.message };
    if (error.details !== undefined) body.details = error.details;
    return sendError(reply, error.statusCode, body);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return sendError(reply, 404, { error: 'No encontrado' });
    if (error.code === 'P2002') return sendError(reply, 409, { error: 'Ya existe un elemento con esos datos' });
    if (error.code === 'P2003') return sendError(reply, 409, { error: 'El elemento está relacionado con datos que no existen o siguen en uso' });
  }

  const e = asErrorLike(error);
  if (e && Array.isArray(e.validation)) {
    return sendError(reply, 400, { error: 'Datos inválidos', details: e.validation });
  }

  const status = e && typeof e.statusCode === 'number' ? e.statusCode : 500;
  if (status >= 400 && status < 500) {
    const code = typeof e?.code === 'string' ? e.code : '';
    const message = KNOWN_CLIENT_ERRORS[code] ?? STATUS_MESSAGES[status] ?? 'Solicitud inválida';
    const details = typeof e?.message === 'string' ? e.message : undefined;
    return sendError(reply, status, details ? { error: message, details } : { error: message });
  }

  request.log.error({ err: error }, 'Error no controlado');
  return sendError(reply, 500, { error: 'Error interno del servidor' });
}

/** Builds the Fastify app: plugins, static files, SPA fallback, JSON errors and every /api route. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // 'warn' by default: per-request info lines would flood the logs (healthchecks, polling).
    // Startup messages are printed separately; set LOG_LEVEL=info to see every request.
    logger: { level: process.env.LOG_LEVEL || 'warn' },
    bodyLimit: BODY_LIMIT,
  });

  app.setErrorHandler(handleError);

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, parts: 12 },
  });

  mkdirSync(config.uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    cacheControl: false,
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // User uploads have unique names and never change; seeded assets may be regenerated.
      const immutable = filePath.includes(`${sep}user${sep}`);
      res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      if (filePath.toLowerCase().endsWith('.svg')) res.setHeader('Content-Security-Policy', "script-src 'none'");
    },
  });

  const clientIndex = join(config.clientDist, 'index.html');
  const clientBuilt = existsSync(clientIndex);
  if (clientBuilt) {
    await app.register(fastifyStatic, {
      root: config.clientDist,
      prefix: '/',
      decorateReply: false,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        const hashedAsset = filePath.includes(`${sep}assets${sep}`);
        res.setHeader('Cache-Control', hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  } else {
    app.log.warn(`No se encontró el cliente compilado en ${config.clientDist}`);
  }

  app.setNotFoundHandler((request, reply) => {
    const path = cleanPath(request.url);
    if (isUnder(path, '/api')) return sendError(reply, 404, { error: 'Ruta no encontrada' });
    if (isUnder(path, '/uploads')) return sendError(reply, 404, { error: 'Archivo no encontrado' });
    if (isUnder(path, '/socket.io')) return sendError(reply, 404, { error: 'Ruta no encontrada' });
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendError(reply, 404, { error: 'Ruta no encontrada' });
    // Missing static files (e.g. an old hashed bundle) must not receive the HTML page.
    const lastSegment = path.slice(path.lastIndexOf('/') + 1);
    if (/\.[a-z0-9]{1,8}$/i.test(lastSegment)) return sendError(reply, 404, { error: 'Archivo no encontrado' });

    // SPA fallback: client-side routes (/menu, /sesion/:id, ...) get index.html.
    if (clientBuilt) {
      return reply.code(200).header('Cache-Control', 'no-cache').sendFile('index.html', config.clientDist);
    }
    return reply.code(200).header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(notBuiltPage());
  });

  await app.register(registerRoutes, { prefix: '/api' });

  return app;
}
