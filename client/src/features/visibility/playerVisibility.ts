import {
  effectiveVisibility,
  isOwnHeroToken,
  visionCellsFor,
  visionConeFor,
  zoneVisionFor,
  type LiveState,
  type Token,
  type VisibilitySettings,
  type VisionMode,
} from '@wailers/shared';
import { useSessionStore } from '../../stores/session';
import { send } from '../game/map/actions';
import { isLimitedMode, VISION_KEYS, visionPhrase, type VisionChoice } from './visionText';

export type VisibilityKey = keyof VisibilitySettings;

const PLAYER_ERROR = 'No se pudo cambiar lo que ve el jugador';
const EVERYONE_ERROR = 'No se pudo cambiar para todos los jugadores';

/** Latest live state (actions read it when they run, so delayed commits never use a stale copy). */
function fresh(): LiveState | null {
  return useSessionStore.getState().view?.state ?? null;
}

/** True when the player has a personal value for `key` (sceneImageUrl: null is a real value, black screen). */
export function hasOverride(overrides: Partial<VisibilitySettings> | undefined, key: VisibilityKey): boolean {
  if (!overrides || !(key in overrides)) return false;
  const v = overrides[key];
  if (v === undefined) return false;
  return v !== null || key === 'sceneImageUrl';
}

export function overrideCount(overrides: Partial<VisibilitySettings> | undefined): number {
  if (!overrides) return 0;
  return (Object.keys(overrides) as VisibilityKey[]).filter((k) => hasOverride(overrides, k)).length;
}

export function personalChoice(state: LiveState, userId: string): VisionChoice {
  const mode = state.visibility.perPlayer[userId]?.visionMode;
  return mode ?? 'follow';
}

export function playerIds(state: LiveState): string[] {
  return Object.values(state.players)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((p) => p.userId);
}

/**
 * Stores `set` as the player's personal values and drops the overrides listed in `remove`.
 * The server removes an override when it receives null; sceneImageUrl is the exception (null = black
 * screen), so dropping it rebuilds the whole set of overrides.
 */
export async function updatePlayer(userId: string, set: Partial<VisibilitySettings>, remove: readonly VisibilityKey[] = []): Promise<boolean> {
  const state = fresh();
  if (!state) return false;
  const current = state.visibility.perPlayer[userId] ?? {};
  const wire: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(set)) if (v !== undefined) wire[k] = v;
  const dropScene = remove.includes('sceneImageUrl') && hasOverride(current, 'sceneImageUrl') && !('sceneImageUrl' in wire);
  for (const k of remove) {
    if (k !== 'sceneImageUrl' && hasOverride(current, k) && !(k in wire)) wire[k] = null;
  }
  if (dropScene) {
    const rest: Record<string, unknown> = {};
    for (const k of Object.keys(current) as VisibilityKey[]) if (k !== 'sceneImageUrl' && hasOverride(current, k)) rest[k] = current[k];
    for (const [k, v] of Object.entries(wire)) {
      if (v === null) delete rest[k];
      else rest[k] = v;
    }
    const cleared = await send('vis:setPlayer', { userId, patch: null }, PLAYER_ERROR);
    if (!cleared || Object.keys(rest).length === 0) return cleared;
    return send('vis:setPlayer', { userId, patch: rest as Partial<VisibilitySettings> }, PLAYER_ERROR);
  }
  if (Object.keys(wire).length === 0) return true;
  // Null values are part of the wire protocol (remove an override) even though the TS type has no null.
  return send('vis:setPlayer', { userId, patch: wire as Partial<VisibilitySettings> }, PLAYER_ERROR);
}

/** One setting for one player; the value everyone has drops the personal override instead. */
export function setPlayerSetting<K extends VisibilityKey>(userId: string, key: K, value: VisibilitySettings[K]): Promise<boolean> {
  const state = fresh();
  if (!state) return Promise.resolve(false);
  if (state.visibility.global[key] === value) return updatePlayer(userId, {}, [key]);
  return updatePlayer(userId, { [key]: value } as Partial<VisibilitySettings>);
}

export function setPlayerVision(userId: string, choice: VisionChoice): Promise<boolean> {
  if (choice === 'follow') return updatePlayer(userId, {}, VISION_KEYS);
  return updatePlayer(userId, { visionMode: choice });
}

/** Clears every personal setting of the player. */
export function resetPlayer(userId: string): Promise<boolean> {
  return send('vis:setPlayer', { userId, patch: null }, 'No se pudieron quitar sus ajustes personales');
}

/** Same value for everyone: the starting value changes and every personal value of that key is dropped. */
export async function setForEveryone<K extends VisibilityKey>(key: K, value: VisibilitySettings[K]): Promise<boolean> {
  const state = fresh();
  if (!state) return false;
  const tasks: Promise<boolean>[] = [];
  if (state.visibility.global[key] !== value) {
    tasks.push(send('vis:setGlobal', { patch: { [key]: value } as Partial<VisibilitySettings> }, EVERYONE_ERROR));
  }
  for (const id of playerIds(state)) {
    if (hasOverride(state.visibility.perPlayer[id], key)) tasks.push(updatePlayer(id, {}, [key]));
  }
  const results = await Promise.all(tasks);
  return results.every(Boolean);
}

/** Same personal vision for every player in the session ("follow" drops every personal vision). */
export async function setVisionForEveryone(choice: VisionChoice): Promise<boolean> {
  const state = fresh();
  if (!state) return false;
  const results = await Promise.all(playerIds(state).map((id) => setPlayerVision(id, choice)));
  return results.every(Boolean);
}

/** Personal values for every player in the session. */
export async function setPersonalForEveryone(patch: Partial<VisibilitySettings>): Promise<boolean> {
  const state = fresh();
  if (!state) return false;
  const results = await Promise.all(playerIds(state).map((id) => updatePlayer(id, patch)));
  return results.every(Boolean);
}

/** Clears every personal setting of every player. */
export async function resetEveryone(): Promise<boolean> {
  const state = fresh();
  if (!state) return false;
  const ids = playerIds(state).filter((id) => overrideCount(state.visibility.perPlayer[id]) > 0);
  const results = await Promise.all(ids.map((id) => resetPlayer(id)));
  return results.every(Boolean);
}

export function heroTokenOf(state: LiveState, userId: string): Token | null {
  for (const t of Object.values(state.tokens)) if (isOwnHeroToken(state, t, userId)) return t;
  return null;
}

export interface PlayerVisionInfo {
  eff: VisibilitySettings;
  mode: VisionMode;
  radius: number;
  cone: number;
  /** What the player sees, e.g. "poca visión (4 casillas)". */
  phrase: string;
  source: 'personal' | 'zone' | 'start' | 'offmap';
  /** Why, e.g. "por la zona «Fábrica abandonada»". */
  reason: string;
  /** Extra detail about the radius ("radio personal", "radio propio del héroe"), or null. */
  radiusNote: string | null;
  zoneId: string | null;
  zoneName: string | null;
}

/** What a player sees right now and why (personal vision > zone vision > starting values). */
export function playerVisionInfo(state: LiveState, userId: string, zoneName: (zoneId: string) => string | null): PlayerVisionInfo {
  const eff = effectiveVisibility(state, userId);
  const own = state.visibility.perPlayer[userId];
  const token = heroTokenOf(state, userId);
  const zoneId = token?.zoneId ?? null;
  const name = zoneId ? zoneName(zoneId) : null;
  const zone = zoneId ? zoneVisionFor(state, zoneId) : null;
  const radius = token ? visionCellsFor(state, token, eff, userId) : eff.visionRadius;
  const cone = token ? visionConeFor(state, token, eff, userId) : eff.visionCone;
  const mode = eff.visionMode;

  let source: PlayerVisionInfo['source'];
  let reason: string;
  if (hasOverride(own, 'visionMode')) {
    source = 'personal';
    reason = 'Por su visión personal';
  } else if (zone && zoneId) {
    source = 'zone';
    reason = `Por la zona «${name ?? 'actual'}»`;
  } else if (zoneId) {
    source = 'start';
    reason = `Valor inicial: «${name ?? 'su zona'}» no tiene visión propia`;
  } else {
    source = 'offmap';
    reason = 'Su héroe no está en el mapa';
  }

  let radiusNote: string | null = null;
  if (isLimitedMode(mode)) {
    const hero = token?.heroId ? state.heroes[token.heroId] : undefined;
    if (hasOverride(own, 'visionRadius')) radiusNote = 'radio personal';
    else if (typeof hero?.data.visionCells === 'number') radiusNote = 'radio propio del héroe';
  }

  return {
    eff,
    mode,
    radius,
    cone,
    phrase: visionPhrase(mode, radius, cone, eff.sceneImageUrl),
    source,
    reason,
    radiusNote,
    zoneId,
    zoneName: name,
  };
}
