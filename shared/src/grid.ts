import type { GridConfig } from './types/campaign';

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/** Grid geometry helpers (shared by snapping, rendering and distances). */
export function hexRadius(grid: Pick<GridConfig, 'size'>): number {
  return grid.size / SQRT3;
}

/** Vertical distance between hex rows (pointy-top). */
export function hexRowSpacing(grid: Pick<GridConfig, 'size'>): number {
  return (grid.size * SQRT3) / 2;
}

function validSize(grid: GridConfig): boolean {
  return Number.isFinite(grid.size) && grid.size > 0;
}

function offX(grid: GridConfig): number {
  return Number.isFinite(grid.offsetX) ? grid.offsetX : 0;
}

function offY(grid: GridConfig): number {
  return Number.isFinite(grid.offsetY) ? grid.offsetY : 0;
}

/** Axial hex coordinates (pointy-top, axial q/r with r = row). */
export interface HexCoord {
  q: number;
  r: number;
}

/** Square cell coordinates (col/row) containing p. */
export function squareCellAt(p: Point, grid: GridConfig): { col: number; row: number } {
  return {
    col: Math.floor((p.x - offX(grid)) / grid.size),
    row: Math.floor((p.y - offY(grid)) / grid.size),
  };
}

function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Avoid -0 so results compare cleanly.
  return { q: rq + 0, r: rr + 0 };
}

/** Axial coordinate of the hex containing p. */
export function hexAt(p: Point, grid: GridConfig): HexCoord {
  const radius = hexRadius(grid);
  const px = p.x - (offX(grid) + grid.size / 2);
  const py = p.y - (offY(grid) + radius);
  const q = ((SQRT3 / 3) * px - py / 3) / radius;
  const r = ((2 / 3) * py) / radius;
  return hexRound(q, r);
}

/** Pixel center of an axial hex. */
export function hexToPixel(h: HexCoord, grid: GridConfig): Point {
  const radius = hexRadius(grid);
  return {
    x: offX(grid) + grid.size / 2 + grid.size * (h.q + h.r / 2),
    y: offY(grid) + radius + 1.5 * radius * h.r,
  };
}

/** Offset (odd-r) coordinates of an axial hex: row = r, odd rows shifted right by size/2. */
export function hexToOffset(h: HexCoord): { col: number; row: number } {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

/** Axial coordinates of an offset (odd-r) hex cell. */
export function offsetToHex(col: number, row: number): HexCoord {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

/**
 * Square grid: cells of `size` px starting at (offsetX, offsetY).
 * Hex grid (pointy-top, odd rows shifted right by size/2): horizontal center spacing = size,
 * vertical spacing = size * sqrt(3) / 2, hex radius (center to corner) = size / sqrt(3).
 * The first hex center (row 0, col 0) is at (offsetX + size/2, offsetY + radius).
 */
export function snapToGrid(p: Point, grid: GridConfig): Point {
  return cellCenter(p, grid);
}

/** Center of the cell containing p (same as snapToGrid for both grid types). */
export function cellCenter(p: Point, grid: GridConfig): Point {
  if (!validSize(grid)) return { x: p.x, y: p.y };
  if (grid.type === 'hex') return hexToPixel(hexAt(p, grid), grid);
  const { col, row } = squareCellAt(p, grid);
  return { x: offX(grid) + (col + 0.5) * grid.size, y: offY(grid) + (row + 0.5) * grid.size };
}

/**
 * Snap a token center according to its diameter in cells: on square grids tokens with an even
 * number of cells (2x2, 4x4) snap to grid intersections, odd ones to cell centers. Hex: cell center.
 */
export function snapTokenCenter(p: Point, cells: number, grid: GridConfig): Point {
  if (!validSize(grid)) return { x: p.x, y: p.y };
  if (grid.type === 'hex') return cellCenter(p, grid);
  const n = Math.max(1, Math.round(cells));
  if (n % 2 === 1) return cellCenter(p, grid);
  return {
    x: offX(grid) + Math.round((p.x - offX(grid)) / grid.size) * grid.size,
    y: offY(grid) + Math.round((p.y - offY(grid)) / grid.size) * grid.size,
  };
}

/**
 * Corner points of the hex centered at c (6 points, pointy-top, starting at the top corner and going
 * clockwise) for rendering. For square grids returns the 4 corners of the square cell centered at c.
 */
export function hexCorners(c: Point, grid: GridConfig): Point[] {
  if (grid.type === 'square') {
    const h = grid.size / 2;
    return [
      { x: c.x - h, y: c.y - h },
      { x: c.x + h, y: c.y - h },
      { x: c.x + h, y: c.y + h },
      { x: c.x - h, y: c.y + h },
    ];
  }
  const radius = hexRadius(grid);
  const out: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    out.push({ x: c.x + radius * Math.cos(a), y: c.y + radius * Math.sin(a) });
  }
  return out;
}

/** Distance in hex steps between two axial coordinates. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Distance in grid cells between two points (square: Chebyshev; hex: hex distance). */
export function gridDistance(a: Point, b: Point, grid: GridConfig): number {
  if (!validSize(grid)) return 0;
  if (grid.type === 'hex') return hexDistance(hexAt(a, grid), hexAt(b, grid));
  const ca = squareCellAt(a, grid);
  const cb = squareCellAt(b, grid);
  return Math.max(Math.abs(ca.col - cb.col), Math.abs(ca.row - cb.row));
}
