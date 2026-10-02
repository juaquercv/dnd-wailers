import { gridDistance, sessionOptionsOf, type GridConfig, type LiveState, type Point, type SessionZone, type Token, type Wall } from '@wailers/shared';

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

function finiteCells(t: Token): number {
  return Number.isFinite(t.cells) ? t.cells : 1;
}

/** Grid cells between two token centres minus the extent of big tokens (1 = adjacent). */
function cellsBetween(a: Token, b: Token, grid: GridConfig): number {
  const size = grid.size > 0 ? grid.size : 70;
  const raw = grid.size > 0 ? gridDistance(a, b, grid) : Math.floor(Math.hypot(a.x - b.x, a.y - b.y) / size);
  const extent = (t: Token) => Math.max(0, Math.ceil((finiteCells(t) - 1) / 2));
  return Math.max(0, raw - extent(a) - extent(b));
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
  // Same reach rules as the server: items one cell away (big tokens count their size), doors 1.5 cells.
  if (options.playersCanPickUp) {
    for (const t of Object.values(state.tokens)) {
      if (t.kind !== 'item' || t.hidden || t.zoneId !== hero.zoneId || t.levelId !== hero.levelId) continue;
      if (cellsBetween(hero, t, level.grid) <= 1) out.push({ kind: 'item', key: `item:${t.id}`, token: t });
    }
  }
  if (options.playersCanUseDoors) {
    const cell = level.grid.size > 0 ? level.grid.size : 70;
    const reach = (1.5 + Math.max(0, (finiteCells(hero) - 1) / 2)) * cell;
    const doors = state.zoneStates[zone.id]?.doors ?? {};
    for (const wall of level.walls) {
      if (wall.kind !== 'door' || wall.points.length < 4) continue;
      if (distanceToPolyline(hero, wall.points) > reach) continue;
      out.push({ kind: 'door', key: `door:${wall.id}`, zoneId: zone.id, wall, open: doors[wall.id] ?? wall.open });
    }
  }
  return out;
}
