import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createLiveState, effectiveVisibility, newId, type LiveState, type LogEntry, type LogType, type SessionSummary } from '@wailers/shared';
import { prisma } from '../../db';
import { getManager, type RunningSession, type SessionManager } from '../../live/index';
import { canSeeLog } from '../../live/SessionManager';
import { parseLiveState } from '../../live/persistence';
import { HandlerError } from '../../live/types';
import { campaignInclude, campaignToDTO, logToDTO, sessionInclude, toJson } from '../../services/serializers';
import { requireUser } from '../auth';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../errors';

/*
 * Live sessions REST API: active list, creation, resume, deletion and the visible log.
 */

const LOG_TYPES: readonly LogType[] = ['chat', 'roll', 'system', 'hp', 'item', 'turn', 'move', 'loot', 'trade', 'fx', 'audio'];
const LOG_LIMIT_DEFAULT = 200;
const LOG_LIMIT_MAX = 1000;
/** Rows read per query while collecting visible log lines (post-filtered requests only). */
const LOG_SCAN_BATCH_MIN = 100;
const LOG_SCAN_BATCH_MAX = 2000;
const NAME_MAX = 120;

const createBody = z.object({
  campaignId: z.string().trim().min(1, 'Elige una campaña').max(200),
  name: z.string().trim().max(NAME_MAX, `El nombre es demasiado largo (máximo ${NAME_MAX} caracteres)`).nullish(),
});

const idParams = z.object({ id: z.string().trim().min(1).max(200) });

const logQuery = z.object({
  type: z.string().trim().optional(),
  limit: z.string().trim().optional(),
});

function engine(): SessionManager {
  try {
    return getManager();
  } catch {
    throw new HttpError(503, 'El motor de partidas todavía no está listo. Inténtalo en unos segundos.');
  }
}

/** "1 oct 21:30" style label for default session names. */
function shortDate(date: Date): string {
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date).replace(/\./g, '');
  const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${day} ${time}`;
}

function defaultSessionName(campaignName: string): string {
  const suffix = ` · ${shortDate(new Date())}`;
  return `${campaignName.slice(0, NAME_MAX - suffix.length).trimEnd()}${suffix}`;
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return LOG_LIMIT_DEFAULT;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) throw badRequest('El límite debe ser un número positivo');
  return Math.min(value, LOG_LIMIT_MAX);
}

async function summaryById(manager: SessionManager, id: string): Promise<SessionSummary> {
  const row = await prisma.gameSession.findUnique({ where: { id }, include: sessionInclude });
  if (!row) throw notFound('La partida no existe');
  return manager.summarize(row);
}

/** Live state if loaded, otherwise the persisted snapshot. */
async function stateOf(manager: SessionManager, id: string): Promise<LiveState> {
  const live = manager.getRunning(id);
  if (live) return live.state;
  const row = await prisma.gameSession.findUnique({ where: { id } });
  if (!row) throw notFound('La partida no existe');
  return parseLiveState(row);
}

/** Same visibility rules as the live `session:log` emission (see canSeeLog). */
function logVisibilityFilter(state: LiveState, userId: string): Prisma.SessionLogWhereInput[] {
  if (userId === state.hostUserId) return [];
  const filters: Prisma.SessionLogWhereInput[] = [
    { OR: [{ visibility: 'all' }, { visibility: 'user', OR: [{ targetUserId: userId }, { actorUserId: userId }] }] },
  ];
  // Public rolls of other players (when canSeeOthersRolls is off) are post-filtered with canSeeLog,
  // because rolls the DM requested stay visible and that depends on the JSON data.
  return filters;
}

/**
 * Newest `limit` lines that pass canSeeLog, newest first. Reads older rows in keyset batches
 * (createdAt, id) until enough visible lines are collected or the log is exhausted, so lines the
 * post-filter hides never shorten the page.
 */
async function visibleLogLines(
  where: Prisma.SessionLogWhereInput,
  state: LiveState,
  userId: string,
  limit: number,
  batchSize: number,
): Promise<LogEntry[]> {
  const visible: LogEntry[] = [];
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const page: Prisma.SessionLogWhereInput = cursor
      ? {
          AND: [
            where,
            { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] },
          ],
        }
      : where;
    const rows = await prisma.sessionLog.findMany({
      where: page,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: batchSize,
    });
    for (const row of rows) {
      const entry = logToDTO(row);
      if (!canSeeLog(state, entry, userId)) continue;
      visible.push(entry);
      if (visible.length >= limit) return visible;
    }
    const last = rows[rows.length - 1];
    if (!last || rows.length < batchSize) return visible;
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  /** Active sessions (lobby / playing) for the join screen. */
  app.get('/sessions', async (): Promise<SessionSummary[]> => engine().listActive());

  /** Create a session of a campaign hosted by the current user. */
  app.post('/sessions', async (request): Promise<SessionSummary> => {
    const userId = requireUser(request);
    const manager = engine();
    const body = createBody.parse(request.body ?? {});
    const row = await prisma.campaign.findUnique({ where: { id: body.campaignId }, include: campaignInclude });
    if (!row) throw notFound('La campaña no existe');
    const campaign = campaignToDTO(row);
    const id = newId('ses');
    const name = body.name ? body.name : defaultSessionName(campaign.name);
    const state = createLiveState({ sessionId: id, campaignId: campaign.id, name, hostUserId: userId, visibility: campaign.defaultVisibility });
    const created = await prisma.gameSession.create({
      data: { id, campaignId: campaign.id, hostUserId: userId, name, status: 'lobby', state: toJson(state) },
      include: sessionInclude,
    });
    manager.broadcastSessionsList();
    return manager.summarize(created);
  });

  /** Host only: a paused/ended session goes back to the lobby keeping heroes, tokens and turn order. */
  app.post('/sessions/:id/resume', async (request): Promise<SessionSummary> => {
    const userId = requireUser(request);
    const manager = engine();
    const { id } = idParams.parse(request.params);
    const row = await prisma.gameSession.findUnique({ where: { id }, select: { hostUserId: true } });
    if (!row) throw notFound('La partida no existe');
    if (row.hostUserId !== userId) throw forbidden('Solo el DM puede reanudar la partida');

    // Resumed through the engine (loaded if needed) so a copy in memory can never overwrite the change.
    let live: RunningSession;
    try {
      live = await manager.loadRunning(id);
    } catch (err) {
      if (err instanceof HandlerError) throw conflict(err.message);
      throw err;
    }
    const status = live.state.status;
    if (status === 'lobby' || status === 'playing') throw conflict('La partida ya está activa');
    await manager.resumeLoaded(live);
    manager.broadcastSessionsList();
    return summaryById(manager, id);
  });

  /** Host only: delete a session (players inside are sent back to the menu). */
  app.delete('/sessions/:id', async (request): Promise<{ ok: true }> => {
    const userId = requireUser(request);
    const manager = engine();
    const { id } = idParams.parse(request.params);
    const row = await prisma.gameSession.findUnique({ where: { id }, select: { hostUserId: true } });
    if (!row) throw notFound('La partida no existe');
    if (row.hostUserId !== userId) throw forbidden('Solo el DM puede eliminar la partida');
    await manager.deleteSession(id);
    return { ok: true };
  });

  /** Log lines visible to the caller (host or player of the session), newest last. */
  app.get('/sessions/:id/log', async (request): Promise<LogEntry[]> => {
    const userId = requireUser(request);
    const manager = engine();
    const { id } = idParams.parse(request.params);
    const query = logQuery.parse(request.query ?? {});
    const limit = parseLimit(query.limit);
    let type: LogType | null = null;
    if (query.type) {
      if (!(LOG_TYPES as readonly string[]).includes(query.type)) throw badRequest('Tipo de registro no válido');
      type = query.type as LogType;
    }

    const state = await stateOf(manager, id);
    if (userId !== state.hostUserId && !state.players[userId]) throw forbidden('No formas parte de esta partida');

    const and: Prisma.SessionLogWhereInput[] = [...logVisibilityFilter(state, userId)];
    if (type) and.push({ type });
    // Without the post-filter every row the query returns is visible, so one batch of `limit` suffices.
    const postFilter = userId !== state.hostUserId && !effectiveVisibility(state, userId).canSeeOthersRolls;
    const batchSize = postFilter ? Math.min(Math.max(limit * 2, LOG_SCAN_BATCH_MIN), LOG_SCAN_BATCH_MAX) : limit;
    const visible = await visibleLogLines({ sessionId: id, AND: and }, state, userId, limit, batchSize);
    return visible.reverse();
  });

  /** Every session of a campaign (saved/resumable included), newest first. */
  app.get('/campaigns/:id/sessions', async (request): Promise<SessionSummary[]> => {
    const manager = engine();
    const { id } = idParams.parse(request.params);
    const rows = await prisma.gameSession.findMany({
      where: { campaignId: id },
      include: sessionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (rows.length === 0) {
      const exists = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw notFound('La campaña no existe');
    }
    return rows.map((row) => manager.summarize(row));
  });
}
