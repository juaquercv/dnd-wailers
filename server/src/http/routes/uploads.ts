import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES, newId, type UploadResponse } from '@wailers/shared';
import { config } from '../../config';
import { requireUser } from '../auth';
import { badRequest, HttpError } from '../errors';

/** Canonical extension for every accepted mime type. */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

/** Non-standard mime names some browsers/OSes send. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'audio/mpg': 'audio/mpeg',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-pn-wav': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-mp4': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/x-aac': 'audio/aac',
  'audio/aacp': 'audio/aac',
  'audio/x-hx-aac-adts': 'audio/aac',
  'audio/x-flac': 'audio/flac',
  'audio/opus': 'audio/ogg',
  'audio/x-ogg': 'audio/ogg',
  'audio/vorbis': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'video/ogg': 'audio/ogg',
  // MediaRecorder and some OSes label audio-only .webm files as video.
  'video/webm': 'audio/webm',
  'audio/x-webm': 'audio/webm',
};

/** Used when the browser sends application/octet-stream (or nothing). */
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  weba: 'audio/webm',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

const ALLOWED_MIME = new Set([...IMAGE_MIME_TYPES, ...AUDIO_MIME_TYPES]);
const NOT_ALLOWED = 'Tipo de archivo no permitido';
const TOO_LARGE = `El archivo supera el límite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;

function resolveType(rawMime: string, filename: string): { mime: string; ext: string } | null {
  const lowered = rawMime.split(';')[0]!.trim().toLowerCase();
  const mime = MIME_ALIASES[lowered] ?? lowered;
  const originalExt = extname(filename).slice(1).toLowerCase();

  if (ALLOWED_MIME.has(mime)) {
    // Keep the original extension when it agrees with the mime type (e.g. ".jpeg").
    const ext = EXT_TO_MIME[originalExt] === mime ? originalExt : MIME_TO_EXT[mime];
    return ext ? { mime, ext } : null;
  }
  const byExt = EXT_TO_MIME[originalExt];
  if (!byExt) return null;
  if (mime === '' || mime === 'application/octet-stream') return { mime: byExt, ext: originalExt };
  // Unusual audio/video labels for a known audio extension (e.g. "audio/x-mpeg3" for .mp3): trust the extension.
  if ((mime.startsWith('audio/') || mime.startsWith('video/')) && byExt.startsWith('audio/')) return { mime: byExt, ext: originalExt };
  return null;
}

function monthFolder(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  /** multipart "file" (images and audio) -> stored under UPLOADS_DIR/user/<yyyy-mm>/. */
  app.post('/uploads', async (request): Promise<UploadResponse> => {
    requireUser(request);
    if (!request.isMultipart()) throw badRequest('Envía el archivo como formulario multipart (campo "file")');

    const file = await request.file();
    if (!file) throw badRequest('No se recibió ningún archivo');

    const type = resolveType(file.mimetype ?? '', file.filename ?? '');
    if (!type) {
      file.file.resume();
      throw badRequest(NOT_ALLOWED, { mime: file.mimetype, filename: file.filename });
    }

    const folder = monthFolder();
    const dir = join(config.uploadsDir, 'user', folder);
    await mkdir(dir, { recursive: true });
    const name = `${newId()}.${type.ext}`;
    const target = join(dir, name);

    try {
      await pipeline(file.file, createWriteStream(target));
      if (file.file.truncated) throw new HttpError(413, TOO_LARGE);
    } catch (error) {
      await unlink(target).catch(() => undefined);
      if (error instanceof HttpError) throw error;
      if (hasCode(error, 'FST_REQ_FILE_TOO_LARGE')) {
        throw new HttpError(413, TOO_LARGE);
      }
      throw error;
    }

    const info = await stat(target);
    if (info.size === 0) {
      await unlink(target).catch(() => undefined);
      throw badRequest('El archivo está vacío');
    }

    return {
      url: `/uploads/user/${folder}/${name}`,
      mime: type.mime,
      size: info.size,
      originalName: file.filename || name,
    };
  });
}
