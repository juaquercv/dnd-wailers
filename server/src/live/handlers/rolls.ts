import {
  effectiveVisibility,
  newId,
  parseFormula,
  pickWeighted,
  rollFormula,
  secureRandom,
  secureRandomInt,
  supportsAdvantage,
  type DiceRollOutcome,
  type LiveState,
  type RollMode,
  type RollRequest,
  type RollResult,
  type RollVisibility,
  type Roller,
} from '@wailers/shared';
import { isPlayer, optId, optOneOf, playerHero, playerName, reqId, reqText, toast } from '../helpers';
import { HandlerError, type Audience, type HandlerCtx, type HandlerModule, type LogInput, type SessionManagerApi } from '../types';

/*
 * Dice and roulettes. Results are generated on the server with a secure RNG and are purely
 * visual: nothing in the state changes as a consequence of a roll (only the consumed
 * request / turn offer is removed).
 */

const ROLL_MODES: readonly RollMode[] = ['normal', 'advantage', 'disadvantage'];
const VISIBILITIES: readonly RollVisibility[] = ['public', 'player', 'secret'];

interface RollMeta {
  label: string;
  mode: RollMode;
  visibility: RollVisibility;
  targetUserId: string | null;
  requestId: string | null;
}

/** Name shown on roll animations: the hero for players, "DM" for the host. */
function rollerDisplayName(ctx: HandlerCtx): string {
  if (ctx.isDm) return 'DM';
  return playerHero(ctx.session.state, ctx.userId)?.name ?? playerName(ctx.session, ctx.userId);
}

function parseMode(value: unknown): RollMode {
  return optOneOf(ROLL_MODES, value, 'modo de tirada') ?? 'normal';
}

/** Advantage/disadvantage only where it changes the roll (a single d20 term); 'normal' everywhere else. */
function modeFor(mode: RollMode, formula: string | null): RollMode {
  return mode !== 'normal' && formula !== null && supportsAdvantage(formula) ? mode : 'normal';
}

/** Formula a roller rolls (null for roulettes and dice with custom faces). */
function rollerFormula(roller: Roller): string | null {
  if (roller.kind === 'roulette') return null;
  if ((roller.faces ?? []).some((f) => typeof f === 'string' && f.trim() !== '')) return null;
  return roller.formula && roller.formula.trim() !== '' ? roller.formula : null;
}

function rollDiceOutcome(formula: string, mode: RollMode): DiceRollOutcome {
  try {
    return rollFormula(formula, mode, secureRandom);
  } catch (err) {
    throw new HandlerError(err instanceof Error ? err.message : 'Fórmula inválida');
  }
}

function normalizedFormula(formula: string): string {
  try {
    return parseFormula(formula).normalized;
  } catch (err) {
    throw new HandlerError(err instanceof Error ? err.message : 'Fórmula inválida');
  }
}

function baseResult(ctx: HandlerCtx, meta: RollMeta): Omit<RollResult, 'kind' | 'formula' | 'dice' | 'modifier' | 'total' | 'rollerId' | 'segments' | 'segment' | 'faces' | 'face' | 'crit'> {
  return {
    id: newId('roll'),
    sessionId: ctx.session.id,
    at: new Date().toISOString(),
    rollerUserId: ctx.userId,
    rollerName: rollerDisplayName(ctx),
    byDm: ctx.isDm,
    label: meta.label,
    mode: meta.mode,
    visibility: meta.visibility,
    targetUserId: meta.visibility === 'player' ? meta.targetUserId : null,
    requestId: meta.requestId,
  };
}

function diceResult(ctx: HandlerCtx, formula: string, rawMeta: RollMeta, rollerId: string | null): RollResult {
  const meta: RollMeta = { ...rawMeta, mode: modeFor(rawMeta.mode, formula) };
  const outcome = rollDiceOutcome(formula, meta.mode);
  return {
    ...baseResult(ctx, meta),
    kind: 'dice',
    formula: outcome.formula,
    dice: outcome.dice,
    modifier: outcome.modifier,
    total: outcome.total,
    rollerId,
    segments: null,
    segment: null,
    faces: null,
    face: null,
    crit: outcome.crit,
  };
}

function rollerResult(ctx: HandlerCtx, roller: Roller, meta: RollMeta): RollResult {
  if (roller.kind === 'roulette') {
    const segments = roller.segments.filter((s) => Number.isFinite(s.weight) && s.weight > 0).map((s) => ({ ...s }));
    if (segments.length === 0) throw new HandlerError('La ruleta no tiene ningún segmento con peso mayor que 0');
    const segment = pickWeighted(segments, secureRandom);
    return {
      ...baseResult(ctx, { ...meta, mode: 'normal' }),
      kind: 'roulette',
      formula: null,
      dice: [],
      modifier: 0,
      total: null,
      rollerId: roller.id,
      segments,
      segment: { ...segment },
      faces: null,
      face: null,
      crit: null,
    };
  }
  const faces = (roller.faces ?? []).filter((f) => typeof f === 'string' && f.trim() !== '');
  if (faces.length > 0) {
    const face = faces[secureRandomInt(faces.length)]!;
    return {
      ...baseResult(ctx, { ...meta, mode: 'normal' }),
      kind: 'custom_die',
      formula: null,
      dice: [],
      modifier: 0,
      total: null,
      rollerId: roller.id,
      segments: null,
      segment: null,
      faces: [...faces],
      face,
      crit: null,
    };
  }
  if (roller.formula && roller.formula.trim() !== '') return diceResult(ctx, roller.formula, meta, roller.id);
  throw new HandlerError('Este dado no tiene caras ni fórmula');
}

/** Who receives the animated roll event. */
function rollAudience(state: LiveState, result: RollResult): Audience {
  switch (result.visibility) {
    case 'public': {
      // DM rolls and public rolls the DM asked for are for everyone («Todos verán el resultado»).
      if (result.byDm || result.requestId) return { kind: 'all' };
      const userIds = Object.keys(state.players).filter(
        (uid) => uid !== state.hostUserId && (uid === result.rollerUserId || effectiveVisibility(state, uid).canSeeOthersRolls),
      );
      return { kind: 'dmAnd', userIds };
    }
    case 'player': {
      const ids = new Set<string>();
      if (result.targetUserId) ids.add(result.targetUserId);
      if (!result.byDm) ids.add(result.rollerUserId);
      return { kind: 'dmAnd', userIds: [...ids] };
    }
    case 'secret':
      return { kind: 'dm' };
  }
}

function rollText(result: RollResult): string {
  const who = result.byDm ? 'El DM' : result.rollerName;
  const crit = result.crit === 'success' ? ' ¡Crítico!' : result.crit === 'fail' ? ' ¡Pifia!' : '';
  if (result.kind === 'roulette') return `${who} gira ${result.label}: ${result.segment?.icon ? `${result.segment.icon} ` : ''}${result.segment?.label ?? '—'}`;
  if (result.kind === 'custom_die') return `${who} lanza ${result.label}: ${result.face ?? '—'}`;
  const mode = result.mode === 'advantage' ? ' con ventaja' : result.mode === 'disadvantage' ? ' con desventaja' : '';
  const formula = result.formula ?? '';
  const what = result.label && result.label !== `Tirada de ${formula}` ? `${result.label} (${formula})` : formula;
  return `${who} tira ${what}${mode}: ${result.total ?? '—'}${crit}`;
}

function rollLog(result: RollResult): LogInput {
  const base = { type: 'roll' as const, text: rollText(result), actorUserId: result.rollerUserId, data: result };
  if (result.visibility === 'public') return { ...base, visibility: 'all' };
  if (result.visibility === 'player' && result.targetUserId) return { ...base, visibility: 'user', targetUserId: result.targetUserId };
  return { ...base, visibility: 'dm' };
}

/** Send the roll animation to its audience and record it in the log. */
async function deliver(manager: SessionManagerApi, ctx: HandlerCtx, result: RollResult): Promise<void> {
  manager.emitEvent(ctx.session, { type: 'roll', roll: result }, rollAudience(ctx.session.state, result));
  try {
    await manager.log(ctx.session, rollLog(result));
  } catch (err) {
    console.error('[live] No se pudo registrar la tirada', err);
  }
}

/** Version of a secret roll returned to the player who rolled it (the DM sees the real one). */
function redacted(result: RollResult): RollResult {
  return { ...result, dice: [], modifier: 0, total: null, segment: null, face: null, crit: null };
}

function parseVisibilityForDm(ctx: HandlerCtx, visibility: unknown, targetUserId: unknown): { visibility: RollVisibility; targetUserId: string | null } {
  const vis = optOneOf(VISIBILITIES, visibility, 'visibilidad') ?? 'public';
  if (vis !== 'player') return { visibility: vis, targetUserId: null };
  const target = optId(targetUserId, 'jugador');
  if (!target || !isPlayer(ctx.session.state, target)) throw new HandlerError('Elige a qué jugador va dirigida la tirada');
  return { visibility: vis, targetUserId: target };
}

function findRoller(ctx: HandlerCtx, rollerId: string): Roller {
  const roller = ctx.session.campaign.rollers.find((r) => r.id === rollerId);
  if (!roller) throw new HandlerError('Esa ruleta o dado ya no existe en la campaña');
  return roller;
}

// ---------------------------------------------------------------------------

async function rollDice(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { formula: string; label?: string; mode?: RollMode; visibility?: RollVisibility; targetUserId?: string | null },
): Promise<RollResult> {
  const formula = normalizedFormula(reqText(payload.formula, 'fórmula', 200, 1));
  const mode = parseMode(payload.mode);
  const label = (payload.label === undefined || payload.label === null ? '' : reqText(payload.label, 'etiqueta', 120)) || `Tirada de ${formula}`;
  let target: { visibility: RollVisibility; targetUserId: string | null };
  if (ctx.isDm) {
    target = parseVisibilityForDm(ctx, payload.visibility, payload.targetUserId);
  } else {
    if (!ctx.session.campaign.rules.playersCanRollFreely) throw new HandlerError('En esta campaña solo puedes tirar cuando el DM te lo pide');
    target = { visibility: 'public', targetUserId: null };
  }
  const result = diceResult(ctx, formula, { label, mode, ...target, requestId: null }, null);
  await deliver(manager, ctx, result);
  return result;
}

async function rollRoller(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { rollerId: string; visibility?: RollVisibility; targetUserId?: string | null },
): Promise<RollResult> {
  const rollerId = reqId(payload.rollerId, 'ruleta');
  const state = ctx.session.state;
  let target: { visibility: RollVisibility; targetUserId: string | null };
  if (ctx.isDm) {
    target = parseVisibilityForDm(ctx, payload.visibility, payload.targetUserId);
  } else {
    const offer = state.turnOffer;
    if (!offer || offer.userId !== ctx.userId || !offer.rollerIds.includes(rollerId)) {
      throw new HandlerError('Solo puedes usar las ruletas que te ofrece tu turno');
    }
    target = { visibility: 'public', targetUserId: null };
  }
  const roller = findRoller(ctx, rollerId);
  if (!ctx.isDm && (!roller.active || !roller.isTurnRoll)) {
    throw new HandlerError('El DM ha retirado esa ruleta de las tiradas de turno');
  }
  const result = rollerResult(ctx, roller, { label: roller.name, mode: 'normal', ...target, requestId: null });
  if (!ctx.isDm) {
    manager.mutate(ctx.session, (s) => {
      const offer = s.turnOffer;
      if (!offer || offer.userId !== ctx.userId) return;
      const remaining = offer.rollerIds.filter((id) => id !== rollerId);
      s.turnOffer = remaining.length > 0 ? { ...offer, rollerIds: remaining } : null;
    });
  }
  await deliver(manager, ctx, result);
  return result;
}

function rollRequest(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { targetUserId: string; label: string; formula?: string; rollerId?: string; mode?: RollMode; visibility?: RollVisibility },
): null {
  const state = ctx.session.state;
  const targetUserId = reqId(payload.targetUserId, 'jugador');
  if (!isPlayer(state, targetUserId)) throw new HandlerError('Ese jugador no está en la partida');
  const rollerId = optId(payload.rollerId, 'ruleta') ?? null;
  const rawFormula = payload.formula === undefined || payload.formula === null ? '' : reqText(payload.formula, 'fórmula', 200);
  let formula: string | null = null;
  let roller: Roller | null = null;
  if (rollerId) {
    roller = findRoller(ctx, rollerId);
  } else {
    if (!rawFormula) throw new HandlerError('Indica una fórmula o elige una ruleta');
    formula = normalizedFormula(rawFormula);
  }
  const mode = modeFor(parseMode(payload.mode), roller ? rollerFormula(roller) : formula);
  const visibility = optOneOf(VISIBILITIES, payload.visibility, 'visibilidad') ?? 'public';
  const label = (payload.label === undefined || payload.label === null ? '' : reqText(payload.label, 'etiqueta', 120)) || roller?.name || `Tirada de ${formula}`;

  const request: RollRequest = {
    id: newId('req'),
    sessionId: ctx.session.id,
    targetUserId,
    requestedBy: ctx.userId,
    label,
    formula,
    rollerId,
    mode,
    visibility,
    source: 'dm',
    createdAt: new Date().toISOString(),
  };
  const what = formula ? `${label} (${formula})` : label;
  manager.mutate(
    ctx.session,
    (s) => {
      s.rollRequests.push(request);
      if (s.rollRequests.length > 100) s.rollRequests.splice(0, s.rollRequests.length - 100);
    },
    {
      log: {
        type: 'system',
        text: `El DM pide a ${playerHero(state, targetUserId)?.name ?? playerName(ctx.session, targetUserId)} una tirada: ${what}`,
        actorUserId: ctx.userId,
        visibility: 'user',
        targetUserId,
      },
    },
  );
  manager.emitEvent(ctx.session, { type: 'rollRequest', request }, { kind: 'users', userIds: [targetUserId] });
  toast(manager, ctx.session, { kind: 'users', userIds: [targetUserId] }, 'info', `El DM te pide una tirada: ${label}`);
  return null;
}

async function rollFulfill(manager: SessionManagerApi, ctx: HandlerCtx, payload: { requestId: string }): Promise<RollResult> {
  const requestId = reqId(payload.requestId, 'petición');
  const request = ctx.session.state.rollRequests.find((r) => r.id === requestId);
  if (!request) throw new HandlerError('Esa petición de tirada ya no existe');
  if (request.targetUserId !== ctx.userId) throw new HandlerError('Esa petición de tirada no es para ti');
  const meta: RollMeta = {
    label: request.label,
    mode: request.mode,
    visibility: request.visibility,
    targetUserId: request.visibility === 'player' ? request.targetUserId : null,
    requestId: request.id,
  };
  let result: RollResult;
  if (request.rollerId) result = rollerResult(ctx, findRoller(ctx, request.rollerId), meta);
  else if (request.formula) result = diceResult(ctx, request.formula, meta, null);
  else throw new HandlerError('La petición no tiene fórmula ni ruleta');

  manager.mutate(ctx.session, (s) => {
    s.rollRequests = s.rollRequests.filter((r) => r.id !== requestId);
  });
  await deliver(manager, ctx, result);
  return result.visibility === 'secret' && !ctx.isDm ? redacted(result) : result;
}

function rollCancel(manager: SessionManagerApi, ctx: HandlerCtx, payload: { requestId: string }): null {
  const requestId = reqId(payload.requestId, 'petición');
  const request = ctx.session.state.rollRequests.find((r) => r.id === requestId);
  if (!request) return null;
  if (!ctx.isDm && request.targetUserId !== ctx.userId) throw new HandlerError('Esa petición de tirada no es para ti');
  manager.mutate(ctx.session, (s) => {
    s.rollRequests = s.rollRequests.filter((r) => r.id !== requestId);
  });
  if (ctx.isDm) {
    toast(manager, ctx.session, { kind: 'users', userIds: [request.targetUserId] }, 'info', `El DM retira la petición: ${request.label}`);
  } else {
    const who = playerHero(ctx.session.state, ctx.userId)?.name ?? playerName(ctx.session, ctx.userId);
    toast(manager, ctx.session, { kind: 'dm' }, 'info', `${who} descarta la tirada: ${request.label}`);
  }
  return null;
}

function dismissOffer(manager: SessionManagerApi, ctx: HandlerCtx): null {
  const offer = ctx.session.state.turnOffer;
  if (!offer) return null;
  if (!ctx.isDm && offer.userId !== ctx.userId) return null;
  manager.mutate(ctx.session, (s) => {
    if (s.turnOffer && (ctx.isDm || s.turnOffer.userId === ctx.userId)) s.turnOffer = null;
  });
  return null;
}

export const registerRollHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'roll:dice', (ctx, payload) => rollDice(manager, ctx, payload));
  manager.register(socket, 'roll:roller', (ctx, payload) => rollRoller(manager, ctx, payload));
  manager.register(socket, 'roll:request', (ctx, payload) => rollRequest(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'roll:fulfill', (ctx, payload) => rollFulfill(manager, ctx, payload));
  manager.register(socket, 'roll:cancel', (ctx, payload) => rollCancel(manager, ctx, payload));
  manager.register(socket, 'roll:dismissOffer', (ctx) => dismissOffer(manager, ctx));
};
