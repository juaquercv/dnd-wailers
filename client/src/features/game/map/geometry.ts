import { cellCenter, hexRowSpacing, snapTokenCenter, type GridConfig, type Point, type Token, type TransitionElement, type ZoneLevel } from '@wailers/shared';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function levelSize(level: Pick<ZoneLevel, 'background'>): { width: number; height: number } {
  return { width: Math.max(1, level.background.width), height: Math.max(1, level.background.height) };
}

/** Keeps a point inside the level (with an optional margin in px). */
export function clampToLevel(p: Point, level: Pick<ZoneLevel, 'background'>, margin = 0): Point {
  const { width, height } = levelSize(level);
  const mx = Math.min(margin, width / 2);
  const my = Math.min(margin, height / 2);
  return { x: clamp(p.x, mx, width - mx), y: clamp(p.y, my, height - my) };
}

/** Final drop position of a token: clamped to the level and snapped when the grid asks for it. */
export function placeToken(p: Point, cells: number, level: Pick<ZoneLevel, 'background' | 'grid'>): Point {
  const clamped = clampToLevel(p, level);
  if (!level.grid.snap || !(level.grid.size > 0)) return clamped;
  return clampToLevel(snapTokenCenter(clamped, cells, level.grid), level);
}

/** Normalized facing in [0, 360). */
export function normalizeFacing(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Direction from a to b in degrees (0 = east, clockwise), rounded to 45°. */
export function facingTowards(a: Point, b: Point): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return normalizeFacing(Math.round(deg / 45) * 45);
}

/** True when p lies inside the (possibly rotated) rectangle of a transition element. */
export function pointInTransition(p: Point, el: Pick<TransitionElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>): boolean {
  const rad = (-(el.rotation || 0) * Math.PI) / 180;
  const dx = p.x - el.x;
  const dy = p.y - el.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  const hw = Math.max(8, el.width) / 2;
  const hh = Math.max(8, el.height) / 2;
  return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
}

/** Radius of a token in px. */
export function tokenRadius(token: Pick<Token, 'cells'>, grid: GridConfig): number {
  return (Math.max(0.25, token.cells || 1) * Math.max(8, grid.size)) / 2;
}

/** Topmost token whose disc contains p (tokens later in the list are drawn above). */
export function tokenAtPoint<T extends Token>(tokens: T[], p: Point, grid: GridConfig, filter?: (t: T) => boolean): T | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (filter && !filter(t)) continue;
    const r = tokenRadius(t, grid);
    if (Math.hypot(p.x - t.x, p.y - t.y) <= r) return t;
  }
  return null;
}

function key(p: Point): string {
  return `${Math.round(p.x)}:${Math.round(p.y)}`;
}

/**
 * Up to `count` free cell centers around `center` (spiral, nearest first), avoiding `occupied` points.
 * Used to drop several tokens at once without stacking them.
 */
export function findFreeSpots(center: Point, count: number, level: Pick<ZoneLevel, 'background' | 'grid'>, occupied: Point[] = []): Point[] {
  const out: Point[] = [];
  if (count <= 0) return out;
  const grid = level.grid;
  const { width, height } = levelSize(level);
  const start = clampToLevel(center, level);
  if (!(grid.size > 0)) {
    for (let i = 0; i < count; i++) out.push(clampToLevel({ x: start.x + i * 24, y: start.y }, level));
    return out;
  }
  const size = grid.size;
  const stepY = grid.type === 'hex' ? hexRowSpacing(grid) : size;
  const minGap = size * 0.6;
  const taken: Point[] = [...occupied];
  const seen = new Set<string>();
  const isFree = (p: Point) => taken.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= minGap);
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;
  const maxRing = Math.max(12, Math.ceil(Math.sqrt(count)) + 6);
  for (let ring = 0; ring <= maxRing && out.length < count; ring++) {
    const candidates: Point[] = [];
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const raw = { x: start.x + dx * size, y: start.y + dy * stepY };
        const c = cellCenter(raw, grid);
        if (!inside(c)) continue;
        const k = key(c);
        if (seen.has(k)) continue;
        seen.add(k);
        candidates.push(c);
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
    for (const c of candidates) {
      if (out.length >= count) break;
      if (!isFree(c)) continue;
      out.push(c);
      taken.push(c);
    }
  }
  while (out.length < count) out.push(cellCenter(start, grid));
  return out;
}

export type EdgeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Where a token leaving through `dir` appears in the neighbor level: one cell inside the opposite edge,
 * the other coordinate scaled proportionally.
 */
export function mirroredEdgePoint(
  p: Point,
  dir: EdgeDirection,
  from: Pick<ZoneLevel, 'background'>,
  to: Pick<ZoneLevel, 'background' | 'grid'>,
): Point {
  const a = levelSize(from);
  const b = levelSize(to);
  const cell = to.grid.size > 0 ? to.grid.size : 70;
  const rx = clamp(p.x / a.width, 0, 1);
  const ry = clamp(p.y / a.height, 0, 1);
  switch (dir) {
    case 'right':
      return { x: Math.min(cell, b.width / 2), y: ry * b.height };
    case 'left':
      return { x: Math.max(b.width - cell, b.width / 2), y: ry * b.height };
    case 'down':
      return { x: rx * b.width, y: Math.min(cell, b.height / 2) };
    case 'up':
      return { x: rx * b.width, y: Math.max(b.height - cell, b.height / 2) };
  }
}

/** Distance in px from p to the given level edge. */
export function distanceToEdge(p: Point, dir: EdgeDirection, level: Pick<ZoneLevel, 'background'>): number {
  const { width, height } = levelSize(level);
  switch (dir) {
    case 'left':
      return p.x;
    case 'right':
      return width - p.x;
    case 'up':
      return p.y;
    case 'down':
      return height - p.y;
  }
}

/** Shortest distance in px from p to a polyline given as flat [x0, y0, x1, y1, ...] points. */
export function distanceToPolyline(p: Point, points: number[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i]!;
    const ay = points[i + 1]!;
    const dx = points[i + 2]! - ax;
    const dy = points[i + 3]! - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((p.x - ax) * dx + (p.y - ay) * dy) / len2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
  }
  return best;
}
