import {
  normalizeText,
  type C2SEvent,
  type C2SPayloads,
  type C2SResult,
  type FxEvent,
  type LiveState,
  type Point,
  type RollMode,
  type RollVisibility,
  type SessionZone,
  type SpellAnimation,
  type Token,
  type TurnEntry,
} from '@wailers/shared';
import { emitAck } from '../../../api/socket';
import { askConfirm } from '../../../components/ui/ConfirmDialog';
import { toast } from '../../../components/ui/toast';
import { formatCr } from '../../../lib/format';
import { useSessionStore } from '../../../stores/session';
import { searchSounds } from '../../audio/soundLibrary';
import { gameCamera } from './camera';
import { findFreeSpots, normalizeFacing } from './geometry';
import { useGameUi } from './gameUi';
import { findLevel, levelLabel } from './zoneTree';

const DEFAULT_ERROR = 'No se pudo completar la acción';

/** Emit with ack; errors become a toast. Resolves true on success. */
export async function send<E extends C2SEvent>(event: E, payload: C2SPayloads[E], fallback = DEFAULT_ERROR): Promise<boolean> {
  try {
    await emitAck(event, payload);
    return true;
  } catch (err) {
    toast.fromError(err, fallback);
    return false;
  }
}

/** Emit with ack returning its data; errors become a toast and resolve undefined. */
export async function request<E extends C2SEvent>(
  event: E,
  payload: C2SPayloads[E],
  fallback = DEFAULT_ERROR,
): Promise<C2SResult<E> | undefined> {
  try {
    return await emitAck(event, payload);
  } catch (err) {
    toast.fromError(err, fallback);
    return undefined;
  }
}

/** Same event for several payloads (in parallel). One toast for all failures. Resolves the success count. */
export async function sendMany<E extends C2SEvent>(event: E, payloads: C2SPayloads[E][], fallback = DEFAULT_ERROR): Promise<number> {
  if (payloads.length === 0) return 0;
  const results = await Promise.allSettled(payloads.map((p) => emitAck(event, p)));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    const first = failures[0]!.reason;
    toast.fromError(first, fallback, failures.length > 1 ? { description: `${failures.length} acciones fallaron` } : undefined);
  }
  return results.length - failures.length;
}

// ---------------------------------------------------------------------------
// Store access (non-React)
// ---------------------------------------------------------------------------

export function liveState(): LiveState | null {
  return useSessionStore.getState().view?.state ?? null;
}

export function isDmNow(): boolean {
  return useSessionStore.getState().view?.role === 'dm';
}

export function zoneById(zoneId: string): SessionZone | null {
  return useSessionStore.getState().zonesById[zoneId] ?? null;
}

/** Tokens (from the full view) for the given ids, keeping the given order. */
export function tokensByIds(ids: string[]): Token[] {
  const state = liveState();
  if (!state) return [];
  return ids.map((id) => state.tokens[id]).filter((t): t is Token => !!t);
}

/** Selected tokens that still exist. */
export function selectedTokens(): Token[] {
  return tokensByIds(useSessionStore.getState().selectedTokenIds);
}

/** Point where "spawn at the center of the view" lands: the camera center, else the viewed level center. */
export function viewCenterPoint(): (Point & { zoneId: string; levelId: string }) | null {
  const cam = gameCamera.center();
  if (cam) return cam;
  const s = useSessionStore.getState();
  const vz = s.viewZone;
  const zone = vz ? s.zonesById[vz.zoneId] : null;
  const level = findLevel(zone, vz?.levelId);
  if (!zone || !level) return null;
  return { zoneId: zone.id, levelId: level.id, x: level.background.width / 2, y: level.background.height / 2 };
}

/** Resolves with the tokens once they appear in the live state (or whatever arrived before the timeout). */
export function waitForTokens(ids: string[], timeoutMs = 2500): Promise<Token[]> {
  return new Promise((resolve) => {
    let done = false;
    const lookup = (): Token[] => {
      const st = liveState();
      return st ? ids.map((id) => st.tokens[id]).filter((t): t is Token => !!t) : [];
    };
    const finish = (tokens: Token[]) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(tokens);
    };
    const unsubscribe = useSessionStore.subscribe(() => {
      const found = lookup();
      if (found.length === ids.length) finish(found);
    });
    const timer = setTimeout(() => finish(lookup()), timeoutMs);
    const initial = lookup();
    if (initial.length === ids.length) finish(initial);
  });
}

// ---------------------------------------------------------------------------
// Token actions
// ---------------------------------------------------------------------------

export function tokenLabel(tokens: Token[]): string {
  if (tokens.length === 1) return tokens[0]!.name;
  return `${tokens.length} fichas`;
}

export function adjustHp(tokens: Token[], delta: number): Promise<number> {
  const withHp = tokens.filter((t) => t.kind !== 'item');
  return sendMany('token:hp', withHp.map((t) => ({ tokenId: t.id, delta })), 'No se pudieron cambiar los PV');
}

export function setHp(tokens: Token[], value: number): Promise<number> {
  const withHp = tokens.filter((t) => t.kind !== 'item');
  return sendMany('token:hp', withHp.map((t) => ({ tokenId: t.id, set: Math.max(0, Math.round(value)) })), 'No se pudieron fijar los PV');
}

export function setStatus(tokens: Token[], status: string, on: boolean): Promise<number> {
  return sendMany('token:status', tokens.map((t) => ({ tokenId: t.id, status, on })), 'No se pudo cambiar el estado');
}

export function setHidden(tokens: Token[], hidden: boolean): Promise<number> {
  return sendMany('token:update', tokens.map((t) => ({ tokenId: t.id, patch: { hidden } })), 'No se pudo cambiar la visibilidad');
}

/** URL of the first library sound effect named like a roar ("rugido"), or null. */
async function roarSoundUrl(): Promise<string | null> {
  try {
    const needle = normalizeText('rugido');
    const sounds = await searchSounds('effect', 'rugido');
    return sounds.find((s) => s.data.url && normalizeText(s.name).includes(needle))?.data.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Shows a hidden creature to the players with the cinematic boss entrance (with a roar when the
 * library has one). Only the reveal and the visual effect: nothing else changes.
 */
export async function revealWithEntrance(token: Token): Promise<void> {
  const soundUrl = await roarSoundUrl();
  const shown = await setHidden([token], false);
  if (shown === 0) return;
  const cr = token.stats?.cr ?? null;
  const fx: FxEvent = {
    kind: 'boss',
    name: token.name,
    subtitle: cr !== null ? `Desafío ${formatCr(cr)}` : null,
    imageUrl: token.imageUrl,
    soundUrl,
  };
  await send('fx:trigger', { fx }, 'No se pudo lanzar la entrada dramática');
}

/** H: hide everything if something is visible, otherwise show everything. */
export async function toggleHidden(tokens: Token[]): Promise<void> {
  if (tokens.length === 0) return;
  const hide = tokens.some((t) => !t.hidden);
  const ok = await setHidden(tokens, hide);
  if (ok > 0) toast.info(hide ? `${tokenLabel(tokens)}: oculto a los jugadores` : `${tokenLabel(tokens)}: visible para los jugadores`);
}

export const TORCH_CELLS = 6;
export const TORCH_COLOR = '#ffb347';

export function setTorch(tokens: Token[], on: boolean, gridSize: number): Promise<number> {
  const radius = Math.round(TORCH_CELLS * (gridSize > 0 ? gridSize : 70));
  return sendMany(
    'token:update',
    tokens.map((t) => ({ tokenId: t.id, patch: { light: on ? { radius, color: TORCH_COLOR } : null } })),
    'No se pudo cambiar la antorcha',
  );
}

/** Player id controlling a hero token (owner or the player who selected that hero). */
export function playerForToken(state: LiveState, token: Token): string | null {
  if (token.kind !== 'hero') return null;
  const byHero = token.heroId ? Object.values(state.players).find((p) => p.heroId === token.heroId) : undefined;
  if (byHero) return byHero.userId;
  if (token.ownerUserId && state.players[token.ownerUserId]) return token.ownerUserId;
  return null;
}

export function isInInitiative(state: LiveState, token: Token): boolean {
  return state.turn.order.some((e) => e.tokenId === token.id || (token.heroId !== null && e.heroId === token.heroId));
}

export function turnEntryFor(state: LiveState, token: Token): Omit<TurnEntry, 'id'> {
  const type: TurnEntry['type'] = token.kind === 'hero' ? 'player' : token.kind === 'npc' ? 'npc' : token.kind === 'creature' ? 'creature' : 'custom';
  return {
    type,
    userId: token.kind === 'hero' ? playerForToken(state, token) ?? token.ownerUserId : null,
    heroId: token.heroId,
    tokenId: token.id,
    name: token.name,
    imageUrl: token.imageUrl,
    initiative: null,
  };
}

export async function addToInitiative(tokens: Token[]): Promise<void> {
  const state = liveState();
  if (!state) return;
  const pending = tokens.filter((t) => !isInInitiative(state, t));
  if (pending.length === 0) {
    toast.info(tokens.length === 1 ? `${tokens[0]!.name} ya está en la iniciativa` : 'Esas fichas ya están en la iniciativa');
    return;
  }
  const ok = await sendMany('turn:add', pending.map((t) => ({ entry: turnEntryFor(state, t) })), 'No se pudo añadir a la iniciativa');
  if (ok > 0) toast.success(ok === 1 ? `${pending[0]!.name} se une a la iniciativa` : `${ok} fichas añadidas a la iniciativa`);
}

export function duplicateTokens(tokens: Token[]): Promise<number> {
  return sendMany('token:duplicate', tokens.map((t) => ({ tokenId: t.id })), 'No se pudo duplicar la ficha');
}

/**
 * Confirmation texts for removing tokens. A hero token is only taken off the map (its sheet stays),
 * so heroes get "Retirar" wording; other tokens are deleted.
 */
function removalTexts(tokens: Token[]): { title: string; message: string; confirmLabel: string } {
  const heroes = tokens.filter((t) => t.kind === 'hero').length;
  const n = tokens.length;
  const single = n === 1 ? tokens[0]!.name : null;
  if (heroes === n) {
    return {
      title: single ? `¿Retirar a ${single} del mapa?` : `¿Retirar ${n} héroes del mapa?`,
      message: single
        ? 'La ficha del héroe desaparecerá del mapa (su hoja de personaje no se borra). Podrás volver a colocarla.'
        : 'Las fichas de los héroes desaparecerán del mapa (sus hojas de personaje no se borran). Podrás volver a colocarlas.',
      confirmLabel: 'Retirar',
    };
  }
  if (heroes === 0) {
    return {
      title: single ? `¿Eliminar a ${single}?` : `¿Eliminar ${n} fichas?`,
      message: single
        ? 'La ficha desaparecerá del mapa y de la iniciativa. Su botín registrado se perderá.'
        : 'Las fichas desaparecerán del mapa y de la iniciativa. Su botín registrado se perderá.',
      confirmLabel: 'Eliminar',
    };
  }
  return {
    title: `¿Quitar ${n} fichas del mapa?`,
    message:
      `${heroes === 1 ? 'El héroe se retira' : `Los ${heroes} héroes se retiran`} del mapa sin tocar su hoja de personaje. ` +
      'Las demás fichas se eliminan de la partida y de la iniciativa; su botín registrado se perderá.',
    confirmLabel: 'Quitar del mapa',
  };
}

/** Removes tokens; asks for confirmation when `confirm` is true (always for heroes). */
export async function removeTokens(tokens: Token[], confirm: boolean): Promise<void> {
  if (tokens.length === 0) return;
  const hasHero = tokens.some((t) => t.kind === 'hero');
  if (confirm || hasHero) {
    const ok = await askConfirm({ ...removalTexts(tokens), danger: true });
    if (!ok) return;
  }
  const ok = await sendMany('token:remove', tokens.map((t) => ({ tokenId: t.id })), 'No se pudo quitar la ficha del mapa');
  if (ok > 0) {
    const store = useSessionStore.getState();
    const removed = new Set(tokens.map((t) => t.id));
    store.selectTokens(store.selectedTokenIds.filter((id) => !removed.has(id)));
    const only = tokens.length === 1 ? tokens[0]! : null;
    toast.success(
      only ? (only.kind === 'hero' ? `${only.name} se retira del mapa` : `Ficha eliminada: ${only.name}`) : `${ok} ${ok === 1 ? 'ficha quitada' : 'fichas quitadas'} del mapa`,
    );
  }
}

/** Rotates tokens by `delta` degrees (token:move keeping the position). */
export function rotateTokens(tokens: Token[], delta: number): Promise<number> {
  return sendMany(
    'token:move',
    tokens.map((t) => ({ tokenId: t.id, x: t.x, y: t.y, facing: normalizeFacing((t.facing || 0) + delta) })),
    'No se pudo girar la ficha',
  );
}

export interface TransferTarget {
  zoneId: string;
  levelId: string;
  /** Arrival point (default: campaign spawn on that level, else the level center). */
  x?: number;
  y?: number;
}

/**
 * Moves tokens to another zone/level, spreading them on free cells around the arrival point.
 * When the target zone document is unknown (players), the server picks the position.
 */
export async function transferTokens(tokens: Token[], target: TransferTarget, opts: { quiet?: boolean } = {}): Promise<number> {
  if (tokens.length === 0) return 0;
  const s = useSessionStore.getState();
  const zone = s.zonesById[target.zoneId] ?? null;
  const level = zone ? zone.levels.find((l) => l.id === target.levelId) ?? null : null;
  let ok: number;
  if (!zone || !level) {
    ok = (await send('token:transfer', { tokenIds: tokens.map((t) => t.id), zoneId: target.zoneId, levelId: target.levelId }, 'No se pudo mover la ficha'))
      ? tokens.length
      : 0;
  } else {
    const spawn = s.campaign?.spawn;
    const center =
      target.x !== undefined && target.y !== undefined
        ? { x: target.x, y: target.y }
        : spawn && spawn.zoneId === zone.id && spawn.levelId === level.id
          ? { x: spawn.x, y: spawn.y }
          : { x: level.background.width / 2, y: level.background.height / 2 };
    const moving = new Set(tokens.map((t) => t.id));
    const state = s.view?.state;
    const occupied = state
      ? Object.values(state.tokens)
          .filter((t) => t.zoneId === zone.id && t.levelId === level.id && !moving.has(t.id))
          .map((t) => ({ x: t.x, y: t.y }))
      : [];
    const spots = findFreeSpots(center, tokens.length, level, occupied);
    ok = await sendMany(
      'token:transfer',
      tokens.map((t, i) => ({ tokenIds: [t.id], zoneId: zone.id, levelId: level.id, x: spots[i]!.x, y: spots[i]!.y })),
      'No se pudo mover la ficha',
    );
  }
  if (ok > 0 && !opts.quiet) {
    const where = zone ? `${zone.name}${zone.levels.length > 1 && level ? ` · ${levelLabel(level)}` : ''}` : 'la nueva zona';
    toast.success(`${tokens.length === 1 ? tokens[0]!.name : `${ok} fichas`} → ${where}`);
  }
  return ok;
}

/** Switches the DM camera to a zone/level and centers it on a point once shown. */
export function goToZone(zoneId: string, levelId: string, focus?: Point): void {
  const store = useSessionStore.getState();
  if (focus) useGameUi.getState().requestFocus({ zoneId, levelId, x: focus.x, y: focus.y });
  store.setViewZone(zoneId, levelId);
}

export function requestRoll(
  targetUserId: string,
  label: string,
  formula: string,
  mode: RollMode = 'normal',
  visibility: RollVisibility = 'public',
): Promise<boolean> {
  return send('roll:request', { targetUserId, label, formula, mode, visibility }, 'No se pudo pedir la tirada').then((ok) => {
    if (ok) toast.success(`Tirada pedida: ${label}`);
    return ok;
  });
}

/** DM spell animation at a point (fx only, nothing else changes). */
export function spellFxAt(animation: SpellAnimation, at: Point & { zoneId: string; levelId: string }, label: string | null, gridSize: number): Promise<boolean> {
  const fx: FxEvent = {
    kind: 'spell',
    animation,
    zoneId: at.zoneId,
    levelId: at.levelId,
    x: at.x,
    y: at.y,
    fromX: null,
    fromY: null,
    radius: Math.round(2 * (gridSize > 0 ? gridSize : 70)),
    label,
  };
  return send('fx:trigger', { fx }, 'No se pudo lanzar la animación');
}

/**
 * Moves tokens next to a point, spreading them on free cells around it: tokens already on that level use
 * one `token:moveMany`, the others travel there with `token:transfer`. Resolves the number of tokens moved.
 */
export async function moveTokensNear(tokens: Token[], target: Point & { zoneId: string; levelId: string }): Promise<number> {
  if (tokens.length === 0) return 0;
  const s = useSessionStore.getState();
  const zone = s.zonesById[target.zoneId] ?? null;
  const level = findLevel(zone, target.levelId);
  if (!zone || !level || level.id !== target.levelId) return 0;
  const moving = new Set(tokens.map((t) => t.id));
  const state = s.view?.state;
  const occupied = state
    ? Object.values(state.tokens)
        .filter((t) => t.zoneId === zone.id && t.levelId === level.id && !moving.has(t.id))
        .map((t) => ({ x: t.x, y: t.y }))
    : [];
  const spots = findFreeSpots(target, tokens.length, level, occupied);
  const here: { tokenId: string; x: number; y: number }[] = [];
  const away: { tokenIds: string[]; zoneId: string; levelId: string; x: number; y: number }[] = [];
  tokens.forEach((t, i) => {
    const p = spots[i] ?? target;
    if (t.zoneId === zone.id && t.levelId === level.id) here.push({ tokenId: t.id, x: p.x, y: p.y });
    else away.push({ tokenIds: [t.id], zoneId: zone.id, levelId: level.id, x: p.x, y: p.y });
  });
  let ok = 0;
  if (here.length > 0 && (await send('token:moveMany', { moves: here }, 'No se pudieron mover las fichas'))) ok += here.length;
  if (away.length > 0) ok += await sendMany('token:transfer', away, 'No se pudo traer la ficha');
  return ok;
}

/** DM: adjust what a hero has spent this turn (movement / combat actions). */
export function adjustUsage(
  heroId: string,
  patch: { reset?: boolean; bonusMoveDelta?: number; bonusActionsDelta?: number; movedDelta?: number; actionsDelta?: number },
  success?: string,
): Promise<boolean> {
  return send('usage:adjust', { heroId, ...patch }, 'No se pudo ajustar el turno').then((ok) => {
    if (ok && success) toast.success(success);
    return ok;
  });
}

/** Turn entry of a token (its own entry, or its hero's). */
export function turnEntryOf(state: LiveState, token: Token): TurnEntry | null {
  return state.turn.order.find((e) => e.tokenId === token.id || (token.heroId !== null && e.heroId === token.heroId)) ?? null;
}
