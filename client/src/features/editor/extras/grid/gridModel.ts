import { emptyNeighbors, type Zone, type ZoneNeighbors } from '@wailers/shared';

export type GridPos = { x: number; y: number };

export interface GridUpdate {
  id: string;
  gridPos: Zone['gridPos'];
  neighbors: ZoneNeighbors;
}

export type Direction = keyof ZoneNeighbors;

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

export const DIRECTION_LABELS: Record<Direction, string> = {
  up: 'Arriba',
  down: 'Abajo',
  left: 'Izquierda',
  right: 'Derecha',
};

export const DIRECTION_OFFSETS: Record<Direction, GridPos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DEFAULT_COLS = 10;
export const DEFAULT_ROWS = 8;

export function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

function validPos(pos: Zone['gridPos']): pos is GridPos {
  return !!pos && Number.isInteger(pos.x) && Number.isInteger(pos.y) && pos.x >= 0 && pos.y >= 0;
}

export interface GridLayout {
  /** Top-level zones (sub-zones never take part in the grid), in slide order. */
  topZones: Zone[];
  /** posKey -> zone shown in that cell. */
  cells: Map<string, Zone>;
  /** Zones in the side tray (no position, invalid position or a cell already taken). */
  tray: Zone[];
  /** Zones whose stored position collides with another zone (shown in the tray). */
  conflicts: Set<string>;
  maxX: number;
  maxY: number;
}

export function buildLayout(zones: Zone[]): GridLayout {
  const ids = new Set(zones.map((z) => z.id));
  const topZones = zones
    .filter((z) => !z.parentZoneId || !ids.has(z.parentZoneId))
    .sort((a, b) => a.order - b.order);
  const cells = new Map<string, Zone>();
  const tray: Zone[] = [];
  const conflicts = new Set<string>();
  let maxX = -1;
  let maxY = -1;
  for (const z of topZones) {
    if (!validPos(z.gridPos)) {
      tray.push(z);
      continue;
    }
    const key = posKey(z.gridPos.x, z.gridPos.y);
    if (cells.has(key)) {
      conflicts.add(z.id);
      tray.push(z);
      continue;
    }
    cells.set(key, z);
    maxX = Math.max(maxX, z.gridPos.x);
    maxY = Math.max(maxY, z.gridPos.y);
  }
  return { topZones, cells, tray, conflicts, maxX, maxY };
}

/** Zone id -> grid position, for the zones actually shown on the board. */
export function placedPositions(layout: GridLayout): Map<string, GridPos> {
  const out = new Map<string, GridPos>();
  for (const [key, zone] of layout.cells) {
    const [x, y] = key.split(',').map(Number);
    out.set(zone.id, { x: x!, y: y! });
  }
  return out;
}

/**
 * Neighbors derived from grid adjacency for every top-level zone:
 * placed zones link to the zones in the 4 adjacent cells; zones in the tray get no neighbors
 * (colliding ones also lose their position).
 */
export function computeAutoNeighbors(layout: GridLayout): GridUpdate[] {
  const positions = placedPositions(layout);
  return layout.topZones.map((zone) => {
    const pos = positions.get(zone.id);
    if (!pos) {
      return { id: zone.id, gridPos: null, neighbors: emptyNeighbors() };
    }
    const neighbors = emptyNeighbors();
    for (const dir of DIRECTIONS) {
      const off = DIRECTION_OFFSETS[dir];
      neighbors[dir] = layout.cells.get(posKey(pos.x + off.x, pos.y + off.y))?.id ?? null;
    }
    return { id: zone.id, gridPos: { x: pos.x, y: pos.y }, neighbors };
  });
}

export function sameNeighbors(a: ZoneNeighbors, b: ZoneNeighbors): boolean {
  return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right;
}

function samePos(a: Zone['gridPos'], b: Zone['gridPos']): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

/** Updates that actually change something compared with the current zones. */
export function changedUpdates(zones: Zone[], updates: GridUpdate[]): GridUpdate[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return updates.filter((u) => {
    const z = byId.get(u.id);
    return !z || !sameNeighbors(z.neighbors, u.neighbors) || !samePos(z.gridPos, u.gridPos);
  });
}

export type PairState = 'linked' | 'oneway' | 'pending';

export interface GridPair {
  key: string;
  a: Zone;
  b: Zone;
  /** b is to the right of a ('h') or below a ('v'). */
  orientation: 'h' | 'v';
  state: PairState;
  /** For 'oneway': true when only a -> b is set. */
  forward: boolean;
  ax: number;
  ay: number;
}

/** Every pair of horizontally / vertically adjacent zones on the board and how they are linked. */
export function adjacentPairs(layout: GridLayout): GridPair[] {
  const pairs: GridPair[] = [];
  for (const [key, a] of layout.cells) {
    const [ax, ay] = key.split(',').map(Number) as [number, number];
    const right = layout.cells.get(posKey(ax + 1, ay));
    const below = layout.cells.get(posKey(ax, ay + 1));
    if (right) {
      const ab = a.neighbors.right === right.id;
      const ba = right.neighbors.left === a.id;
      pairs.push({ key: `h:${key}`, a, b: right, orientation: 'h', state: ab && ba ? 'linked' : ab || ba ? 'oneway' : 'pending', forward: ab, ax, ay });
    }
    if (below) {
      const ab = a.neighbors.down === below.id;
      const ba = below.neighbors.up === a.id;
      pairs.push({ key: `v:${key}`, a, b: below, orientation: 'v', state: ab && ba ? 'linked' : ab || ba ? 'oneway' : 'pending', forward: ab, ax, ay });
    }
  }
  return pairs;
}

/** Neighbor direction status of a placed zone: matches the grid, differs from it, or empty. */
export function directionStatus(
  zone: Zone,
  dir: Direction,
  pos: GridPos | undefined,
  layout: GridLayout,
): 'match' | 'mismatch' | 'none' {
  const target = zone.neighbors[dir];
  if (!target) return 'none';
  if (!pos) return 'mismatch';
  const off = DIRECTION_OFFSETS[dir];
  const adjacent = layout.cells.get(posKey(pos.x + off.x, pos.y + off.y));
  return adjacent?.id === target ? 'match' : 'mismatch';
}
