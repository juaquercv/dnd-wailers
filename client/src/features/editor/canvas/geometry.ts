import {
  cellCenter,
  hexAt,
  hexCorners,
  hexToOffset,
  snapTokenCenter,
  squareCellAt,
  type GridConfig,
  type Point,
  type SceneElement,
} from '@wailers/shared';
import { elementBounds } from '../../../map';

/** Axis-aligned rectangle in world (level) pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How a position snaps to the grid:
 *  - 'cell': center of the cell (markers, transitions, lights, spawn)
 *  - 'point': nearest grid intersection (shapes, images, text, walls, fog...)
 *  - 'token': token center according to its diameter (even sizes on intersections)
 */
export type SnapKind = 'cell' | 'point' | 'token';

export function hasUsableGrid(grid: GridConfig): boolean {
  return Number.isFinite(grid.size) && grid.size > 0;
}

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Nearest grid intersection (square) or nearest hex corner/center (hex). */
export function gridPoint(p: Point, grid: GridConfig): Point {
  if (!hasUsableGrid(grid)) return { x: p.x, y: p.y };
  if (grid.type === 'hex') {
    const center = cellCenter(p, grid);
    let best = center;
    let bestDist = distance(p, center);
    for (const corner of hexCorners(center, grid)) {
      const d = distance(p, corner);
      if (d < bestDist) {
        best = corner;
        bestDist = d;
      }
    }
    return { x: best.x, y: best.y };
  }
  const ox = finite(grid.offsetX);
  const oy = finite(grid.offsetY);
  return {
    x: ox + Math.round((p.x - ox) / grid.size) * grid.size,
    y: oy + Math.round((p.y - oy) / grid.size) * grid.size,
  };
}

export function snapPoint(p: Point, grid: GridConfig, kind: SnapKind, cells = 1): Point {
  if (!hasUsableGrid(grid)) return { x: p.x, y: p.y };
  if (kind === 'cell') return cellCenter(p, grid);
  if (kind === 'token') return snapTokenCenter(p, cells, grid);
  return gridPoint(p, grid);
}

/** Snapping rule for an element's (x, y) when it is moved or placed. */
export function snapKindForElement(el: SceneElement): SnapKind {
  if (el.type === 'token') return 'token';
  if (el.type === 'marker' || el.type === 'transition') return 'cell';
  return 'point';
}

export function snapElementPosition(el: SceneElement, p: Point, grid: GridConfig): Point {
  return snapPoint(p, grid, snapKindForElement(el), el.type === 'token' ? el.cells : 1);
}

/** Human cell label for the status bar: 1-based column · row. */
export function cellLabel(p: Point, grid: GridConfig): string | null {
  if (!hasUsableGrid(grid)) return null;
  if (grid.type === 'hex') {
    const { col, row } = hexToOffset(hexAt(p, grid));
    return `${col + 1} · ${row + 1}`;
  }
  const { col, row } = squareCellAt(p, grid);
  return `${col + 1} · ${row + 1}`;
}

/** Normalized rectangle from two corners. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;
}

/** True when every vertex of the flat point list lies inside r. */
export function rectContainsPoints(r: Rect, points: number[]): boolean {
  if (points.length < 2) return false;
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (!rectContainsPoint(r, { x: points[i] ?? 0, y: points[i + 1] ?? 0 })) return false;
  }
  return true;
}

/** World axis-aligned bounds of an element (its local bounds rotated around its origin). */
export function elementWorldRect(el: SceneElement, gridSize: number): Rect {
  const b = elementBounds(el, gridSize);
  const rad = ((el.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: Point[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const x = el.x + c.x * cos - c.y * sin;
    const y = el.y + c.x * sin + c.y * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function perpendicularDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker simplification of a flat [x, y, ...] polyline. */
export function simplifyPoints(points: number[], epsilon: number): number[] {
  const n = Math.floor(points.length / 2);
  if (n <= 2 || epsilon <= 0) return points.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const ax = points[start * 2] ?? 0;
    const ay = points[start * 2 + 1] ?? 0;
    const bx = points[end * 2] ?? 0;
    const by = points[end * 2 + 1] ?? 0;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0, ax, ay, bx, by);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index >= 0 && maxDist > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0);
  }
  return out;
}

/** Total length of a flat polyline. */
export function polylineLength(points: number[]): number {
  let total = 0;
  for (let i = 2; i + 1 < points.length; i += 2) {
    total += Math.hypot((points[i] ?? 0) - (points[i - 2] ?? 0), (points[i + 1] ?? 0) - (points[i - 1] ?? 0));
  }
  return total;
}

/** Converts absolute points into an origin (first point) and points relative to it, rounded to 0.1 px. */
export function toRelativePoints(points: number[]): { x: number; y: number; points: number[] } {
  const x = round1(points[0] ?? 0);
  const y = round1(points[1] ?? 0);
  const rel: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    rel.push(round1((points[i] ?? 0) - x), round1((points[i + 1] ?? 0) - y));
  }
  return { x, y, points: rel };
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function roundPoint(p: Point): Point {
  return { x: round1(p.x), y: round1(p.y) };
}

/** Rounds every coordinate of a flat point list to 0.1 px. */
export function roundPoints(points: number[]): number[] {
  return points.map(round1);
}

/** Last point of a flat list (or null). */
export function lastPoint(points: number[]): Point | null {
  if (points.length < 2) return null;
  return { x: points[points.length - 2] ?? 0, y: points[points.length - 1] ?? 0 };
}

export function firstPoint(points: number[]): Point | null {
  if (points.length < 2) return null;
  return { x: points[0] ?? 0, y: points[1] ?? 0 };
}

/** Distance expressed in grid cells (for measurements). */
export function toCells(px: number, grid: GridConfig): number {
  return hasUsableGrid(grid) ? px / grid.size : 0;
}

const CELL_FORMAT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function formatCells(cells: number): string {
  const v = CELL_FORMAT.format(cells);
  return `${v} ${Math.abs(cells - 1) < 0.05 ? 'casilla' : 'casillas'}`;
}

export function formatNumber(v: number, digits = 0): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(v);
}
