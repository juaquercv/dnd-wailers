import { gridDistance, sessionOptionsOf, type LiveState, type Point, type SessionZone, type Token, type Wall } from '@wailers/shared';

/** Something next to the player's hero that can be used for free (no movement, no combat action). */
export type NearbyThing =
  | { kind: 'item'; key: string; token: Token }
  | { kind: 'door'; key: string; zoneId: string; wall: Wall; open: boolean };

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToPolyline(p: Point, points: number[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const d = distanceToSegment(p, { x: points[i]!, y: points[i + 1]! }, { x: points[i + 2]!, y: points[i + 3]! });
    if (d < best) best = d;
  }
  return best;
}

/**
 * Item tokens next to the hero (adjacent cell or the same one) and doors within reach, as allowed by the
 * session options (playersCanPickUp / playersCanUseDoors).
 */
export function nearbyThings(state: LiveState, zonesById: Record<string, SessionZone>, hero: Token): NearbyThing[] {
  const zone = zonesById[hero.zoneId];
  const level = zone?.levels.find((l) => l.id === hero.levelId);
  if (!zone || !level) return [];
  const options = sessionOptionsOf(state);
  const out: NearbyThing[] = [];
  if (options.playersCanPickUp) {
    for (const t of Object.values(state.tokens)) {
      if (t.kind !== 'item' || t.hidden || t.zoneId !== hero.zoneId || t.levelId !== hero.levelId) continue;
      const reach = Math.max(1, Math.ceil((hero.cells + t.cells) / 2));
      if (gridDistance(hero, t, level.grid) <= reach) out.push({ kind: 'item', key: `item:${t.id}`, token: t });
    }
  }
  if (options.playersCanUseDoors) {
    const cell = level.grid.size > 0 ? level.grid.size : 70;
    const reach = cell * (Math.max(1, hero.cells) / 2 + 1);
    const doors = state.zoneStates[zone.id]?.doors ?? {};
    for (const wall of level.walls) {
      if (wall.kind !== 'door' || wall.points.length < 4) continue;
      if (distanceToPolyline(hero, wall.points) > reach) continue;
      out.push({ kind: 'door', key: `door:${wall.id}`, zoneId: zone.id, wall, open: doors[wall.id] ?? wall.open });
    }
  }
  return out;
}
