import { pointInAnyPolygon, type LiveState, type SessionZone, type Token, type TurnEntry, type ZoneLevel } from '@wailers/shared';

/** Polygons of the level's fog regions the DM has not revealed yet. */
export function unrevealedFogPolygons(level: Pick<ZoneLevel, 'fogRegions'>, revealed: readonly string[]): number[][] {
  if (level.fogRegions.length === 0) return [];
  const shown = new Set(revealed);
  return level.fogRegions.filter((r) => !shown.has(r.id) && r.points.length >= 6).map((r) => r.points);
}

/**
 * True when a non-hero token stands inside an unrevealed fog region of its level. The server still
 * sends those tokens to players (fog is masked on the client), so every player-facing view hides them.
 */
export function isHiddenByFog(state: LiveState, token: Token, zonesById: Record<string, SessionZone>): boolean {
  if (token.kind === 'hero') return false;
  const level = zonesById[token.zoneId]?.levels.find((l) => l.id === token.levelId);
  if (!level) return false;
  const polygons = unrevealedFogPolygons(level, state.zoneStates[token.zoneId]?.revealedFog ?? []);
  return polygons.length > 0 && pointInAnyPolygon({ x: token.x, y: token.y }, polygons);
}

/**
 * Player view of a turn entry: a creature whose token they cannot see (filtered out by the server
 * or under unrevealed fog) is shown as an unknown creature.
 */
export function isTurnEntryMasked(state: LiveState, entry: TurnEntry, zonesById: Record<string, SessionZone>): boolean {
  if (entry.type === 'player' || entry.heroId || !entry.tokenId) return false;
  const token = state.tokens[entry.tokenId];
  return !token || isHiddenByFog(state, token, zonesById);
}
