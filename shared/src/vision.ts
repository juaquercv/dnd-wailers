import type { Point } from './grid';
import type { GridConfig, Wall, ZoneLevel } from './types/campaign';

export interface Segment {
  a: Point;
  b: Point;
}

/** Segments that block vision: kind 'wall' always; 'door' when closed (doorStates overrides Wall.open); never 'window'. */
export function blockingSegments(walls: Wall[], doorStates?: Record<string, boolean>): Segment[] {
  const out: Segment[] = [];
  for (const wall of walls) {
    if (wall.kind === 'door') {
      const override = doorStates ? doorStates[wall.id] : undefined;
      const open = typeof override === 'boolean' ? override : wall.open;
      if (open) continue;
    } else if (wall.kind !== 'wall') {
      continue;
    }
    const pts = wall.points;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i]!;
      const ay = pts[i + 1]!;
      const bx = pts[i + 2]!;
      const by = pts[i + 3]!;
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;
      if (ax === bx && ay === by) continue;
      out.push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
    }
  }
  return out;
}

export interface VisionSource {
  x: number;
  y: number;
  /** px */
  radius: number;
  /** degrees; 360 = full circle */
  cone: number;
  /** degrees, 0 = +x (east), clockwise in screen coordinates (y down) */
  facing: number;
}

const TWO_PI = Math.PI * 2;
const ENDPOINT_EPS = 0.0001;
const HIT_EPS = 1e-9;
const MIN_CIRCLE_SAMPLES = 64;
const MAX_CIRCLE_SAMPLES = 256;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function modTwoPi(a: number): number {
  const r = a % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
}

function distanceToSegmentSq(px: number, py: number, s: Segment): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const len2 = ex * ex + ey * ey;
  let u = len2 > 0 ? ((px - s.a.x) * ex + (py - s.a.y) * ey) / len2 : 0;
  u = clamp(u, 0, 1);
  const cx = s.a.x + u * ex - px;
  const cy = s.a.y + u * ey - py;
  return cx * cx + cy * cy;
}

/** Distance along the ray (ox,oy)+(dx,dy)*t to the segment, or Infinity. */
function rayHit(ox: number, oy: number, dx: number, dy: number, s: Segment): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return Infinity;
  const wx = s.a.x - ox;
  const wy = s.a.y - oy;
  const t = (wx * ey - wy * ex) / denom;
  const u = (wx * dy - wy * dx) / denom;
  if (t <= HIT_EPS || u < -HIT_EPS || u > 1 + HIT_EPS) return Infinity;
  return t;
}

/** Proper intersection point of two segments (shared endpoints and parallel overlaps ignored). */
function segmentIntersection(s: Segment, t: Segment): Point | null {
  const rx = s.b.x - s.a.x;
  const ry = s.b.y - s.a.y;
  const qx = t.b.x - t.a.x;
  const qy = t.b.y - t.a.y;
  const denom = rx * qy - ry * qx;
  if (Math.abs(denom) < 1e-12) return null;
  const wx = t.a.x - s.a.x;
  const wy = t.a.y - s.a.y;
  const u = (wx * qy - wy * qx) / denom;
  const v = (wx * ry - wy * rx) / denom;
  if (u <= 1e-9 || u >= 1 - 1e-9 || v <= 1e-9 || v >= 1 - 1e-9) return null;
  return { x: s.a.x + u * rx, y: s.a.y + u * ry };
}

/** Angles (radians) where the segment crosses the circle of `radius` around (ox, oy). */
function circleCrossAngles(ox: number, oy: number, radius: number, s: Segment): number[] {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const fx = s.a.x - ox;
  const fy = s.a.y - oy;
  const a = ex * ex + ey * ey;
  const b = 2 * (fx * ex + fy * ey);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return [];
  const sq = Math.sqrt(disc);
  const out: number[] = [];
  for (const u of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (u >= 0 && u <= 1) out.push(Math.atan2(fy + u * ey, fx + u * ex));
  }
  return out;
}

/**
 * Visibility polygon via ray casting against blocking segments, clipped to the radius (circle
 * approximated with >= 64 rays plus rays to every segment endpoint +-0.0001 rad), to the cone and
 * to the level bounds. Returns a flat [x1,y1,x2,y2,...] polygon in absolute px; for a cone < 360
 * the origin is included as a vertex.
 */
export function computeVisibilityPolygon(
  source: VisionSource,
  segments: Segment[],
  bounds: { width: number; height: number },
): number[] {
  const width = bounds.width;
  const height = bounds.height;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return [];
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || Number.isNaN(source.radius)) return [];

  // Keep the origin strictly inside the bounds so the bound edges always block outward rays.
  const inset = Math.min(1e-3, width / 4, height / 4);
  const ox = clamp(source.x, inset, width - inset);
  const oy = clamp(source.y, inset, height - inset);
  const diagonal = Math.hypot(width, height);
  const radius = Math.min(Number.isFinite(source.radius) ? source.radius : diagonal, diagonal);
  if (!(radius > 0)) return [];

  const coneDeg = Number.isFinite(source.cone) ? clamp(source.cone, 0, 360) : 360;
  if (coneDeg <= 0) return [];
  const full = coneDeg >= 360;
  const span = full ? TWO_PI : (coneDeg * Math.PI) / 180;
  const facing = Number.isFinite(source.facing) ? (source.facing * Math.PI) / 180 : 0;
  const start = full ? 0 : facing - span / 2;

  const boundSegments: Segment[] = [
    { a: { x: 0, y: 0 }, b: { x: width, y: 0 } },
    { a: { x: width, y: 0 }, b: { x: width, y: height } },
    { a: { x: width, y: height }, b: { x: 0, y: height } },
    { a: { x: 0, y: height }, b: { x: 0, y: 0 } },
  ];
  const reach = radius * radius + 1e-6;
  const relevant: Segment[] = [];
  for (const s of [...segments, ...boundSegments]) {
    if (!Number.isFinite(s.a.x) || !Number.isFinite(s.a.y) || !Number.isFinite(s.b.x) || !Number.isFinite(s.b.y)) continue;
    if (s.a.x === s.b.x && s.a.y === s.b.y) continue;
    if (distanceToSegmentSq(ox, oy, s) <= reach) relevant.push(s);
  }

  // Candidate ray angles, expressed relative to `start` in [0, 2pi).
  const rel: number[] = [];
  const addAngle = (a: number): void => {
    const r = modTwoPi(a - start);
    if (full || r <= span) rel.push(r);
  };
  const samples = clamp(Math.ceil((TWO_PI * radius) / 12), MIN_CIRCLE_SAMPLES, MAX_CIRCLE_SAMPLES);
  for (let i = 0; i < samples; i++) addAngle(start + (i / samples) * TWO_PI);
  for (const s of relevant) {
    for (const p of [s.a, s.b]) {
      const dx = p.x - ox;
      const dy = p.y - oy;
      if (dx * dx + dy * dy > reach) continue;
      const a = Math.atan2(dy, dx);
      addAngle(a - ENDPOINT_EPS);
      addAngle(a);
      addAngle(a + ENDPOINT_EPS);
    }
    for (const a of circleCrossAngles(ox, oy, radius, s)) {
      addAngle(a - ENDPOINT_EPS);
      addAngle(a);
      addAngle(a + ENDPOINT_EPS);
    }
  }
  // Crossing walls create corners in the visible boundary that no endpoint ray would hit.
  for (let i = 0; i < relevant.length; i++) {
    for (let j = i + 1; j < relevant.length; j++) {
      const p = segmentIntersection(relevant[i]!, relevant[j]!);
      if (!p) continue;
      const dx = p.x - ox;
      const dy = p.y - oy;
      if (dx * dx + dy * dy > reach) continue;
      const a = Math.atan2(dy, dx);
      addAngle(a - ENDPOINT_EPS);
      addAngle(a);
      addAngle(a + ENDPOINT_EPS);
    }
  }
  if (!full) {
    rel.push(0, span);
  }
  rel.sort((x, y) => x - y);

  const out: number[] = full ? [] : [ox, oy];
  let lastRel = -Infinity;
  let lastX = NaN;
  let lastY = NaN;
  for (const r of rel) {
    if (r - lastRel < 1e-12) continue;
    lastRel = r;
    const angle = start + r;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let t = radius;
    for (const s of relevant) {
      const hit = rayHit(ox, oy, dx, dy, s);
      if (hit < t) t = hit;
    }
    const x = clamp(ox + dx * t, 0, width);
    const y = clamp(oy + dy * t, 0, height);
    if (Math.abs(x - lastX) < 1e-9 && Math.abs(y - lastY) < 1e-9) continue;
    out.push(x, y);
    lastX = x;
    lastY = y;
  }
  // Drop a closing duplicate of the first ray point (full circle only).
  if (full && out.length >= 4) {
    const n = out.length;
    if (Math.abs(out[n - 2]! - out[0]!) < 1e-9 && Math.abs(out[n - 1]! - out[1]!) < 1e-9) out.length = n - 2;
  }
  return out.length >= 6 ? out : [];
}

export function pointInPolygon(p: Point, polygon: number[]): boolean {
  const n = polygon.length >> 1;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[2 * i]!;
    const yi = polygon[2 * i + 1]!;
    const xj = polygon[2 * j]!;
    const yj = polygon[2 * j + 1]!;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when p lies inside any of the polygons. */
export function pointInAnyPolygon(p: Point, polygons: number[][]): boolean {
  for (const poly of polygons) if (pointInPolygon(p, poly)) return true;
  return false;
}

/** Explored memory grid: one bit per cell of `cellSize` px (cellSize = level grid size, min 20). */
export interface ExploredGrid {
  cols: number;
  rows: number;
  cellSize: number;
  bits: Uint8Array;
}

/** Size in px of an explored-memory cell for a level grid. */
export function exploredCellSize(grid: Pick<GridConfig, 'size'>): number {
  return Math.max(20, Number.isFinite(grid.size) ? grid.size : 0);
}

function cellCount(length: number, cellSize: number): number {
  return Number.isFinite(length) && length > 0 ? Math.ceil(length / cellSize) : 0;
}

export function createExploredGrid(level: Pick<ZoneLevel, 'background' | 'grid'>): ExploredGrid {
  const cellSize = exploredCellSize(level.grid);
  const cols = cellCount(level.background.width, cellSize);
  const rows = cellCount(level.background.height, cellSize);
  return { cols, rows, cellSize, bits: new Uint8Array(Math.ceil((cols * rows) / 8)) };
}

function setBit(grid: ExploredGrid, col: number, row: number): boolean {
  const i = row * grid.cols + col;
  const byte = i >> 3;
  const mask = 1 << (i & 7);
  const prev = grid.bits[byte]!;
  if (prev & mask) return false;
  grid.bits[byte] = prev | mask;
  return true;
}

/** Mark every cell whose center lies inside any polygon. Returns true if any bit changed. */
export function markExplored(grid: ExploredGrid, polygons: number[][]): boolean {
  if (grid.cols <= 0 || grid.rows <= 0) return false;
  const cs = grid.cellSize;
  let changed = false;
  for (const poly of polygons) {
    const n = poly.length >> 1;
    if (n < 3) continue;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = poly[2 * i + 1]!;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const rowStart = Math.max(0, Math.ceil(minY / cs - 0.5));
    const rowEnd = Math.min(grid.rows - 1, Math.floor(maxY / cs - 0.5));
    const xs: number[] = [];
    for (let row = rowStart; row <= rowEnd; row++) {
      const cy = (row + 0.5) * cs;
      // Scanline crossings, same rule as pointInPolygon (even-odd).
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[2 * i]!;
        const yi = poly[2 * i + 1]!;
        const xj = poly[2 * j]!;
        const yj = poly[2 * j + 1]!;
        if (yi > cy !== yj > cy) xs.push(((xj - xi) * (cy - yi)) / (yj - yi) + xi);
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const colStart = Math.max(0, Math.ceil(xs[k]! / cs - 0.5));
        const colEnd = Math.min(grid.cols - 1, Math.ceil(xs[k + 1]! / cs - 0.5) - 1);
        for (let col = colStart; col <= colEnd; col++) {
          if (setBit(grid, col, row)) changed = true;
        }
      }
    }
  }
  return changed;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = Object.fromEntries([...B64_ALPHABET].map((ch, i) => [ch, i]));

/** Standard base64 (with padding). Works in browser and Node without Buffer/btoa. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    parts.push(B64_ALPHABET[(n >> 18) & 63]! + B64_ALPHABET[(n >> 12) & 63]! + B64_ALPHABET[(n >> 6) & 63]! + B64_ALPHABET[n & 63]!);
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    parts.push(B64_ALPHABET[(n >> 18) & 63]! + B64_ALPHABET[(n >> 12) & 63]! + '==');
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    parts.push(B64_ALPHABET[(n >> 18) & 63]! + B64_ALPHABET[(n >> 12) & 63]! + B64_ALPHABET[(n >> 6) & 63]! + '=');
  }
  return parts.join('');
}

/** Decodes standard base64 (padding optional). Null when the text is not valid base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  const body = clean.replace(/=+$/, '');
  if (clean.length % 4 !== 0 && clean.length !== body.length) return null;
  if (body.length % 4 === 1) return null;
  const outLen = Math.floor((body.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let buffer = 0;
  let bitsInBuffer = 0;
  let o = 0;
  for (const ch of body) {
    buffer = (buffer << 6) | B64_LOOKUP[ch]!;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      out[o++] = (buffer >> bitsInBuffer) & 0xff;
      buffer &= (1 << bitsInBuffer) - 1;
    }
  }
  return o === outLen ? out : null;
}

/** base64 of `bits` (cols/rows/cellSize are re-derived from the level). Works in browser and Node (no Buffer). */
export function encodeExplored(grid: ExploredGrid): string {
  return bytesToBase64(grid.bits);
}

/** Empty grid when encoded is undefined/invalid or its size does not match the level. */
export function decodeExplored(encoded: string | undefined, level: Pick<ZoneLevel, 'background' | 'grid'>): ExploredGrid {
  const grid = createExploredGrid(level);
  if (!encoded) return grid;
  const bytes = base64ToBytes(encoded);
  if (!bytes || bytes.length !== grid.bits.length) return grid;
  grid.bits.set(bytes);
  return grid;
}

export function isCellExplored(grid: ExploredGrid, col: number, row: number): boolean {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const i = row * grid.cols + col;
  return ((grid.bits[i >> 3]! >> (i & 7)) & 1) === 1;
}

/** Whether the explored cell under a level point is explored. */
export function isPointExplored(grid: ExploredGrid, p: Point): boolean {
  return isCellExplored(grid, Math.floor(p.x / grid.cellSize), Math.floor(p.y / grid.cellSize));
}

/** Number of explored cells. */
export function countExplored(grid: ExploredGrid): number {
  let count = 0;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) if (isCellExplored(grid, col, row)) count++;
  }
  return count;
}

/** Explored cells merged into horizontal runs, as px rectangles (handy for masks). */
export function exploredRects(grid: ExploredGrid): { x: number; y: number; width: number; height: number }[] {
  const out: { x: number; y: number; width: number; height: number }[] = [];
  const cs = grid.cellSize;
  for (let row = 0; row < grid.rows; row++) {
    let runStart = -1;
    for (let col = 0; col <= grid.cols; col++) {
      const on = col < grid.cols && isCellExplored(grid, col, row);
      if (on && runStart < 0) runStart = col;
      else if (!on && runStart >= 0) {
        out.push({ x: runStart * cs, y: row * cs, width: (col - runStart) * cs, height: cs });
        runStart = -1;
      }
    }
  }
  return out;
}

/** Cells -> px using the grid size. */
export function cellsToPx(cells: number, grid: GridConfig): number {
  return cells * grid.size;
}
