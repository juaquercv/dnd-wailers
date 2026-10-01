import { describe, expect, it } from 'vitest';
import {
  cellCenter,
  gridDistance,
  hexAt,
  hexCorners,
  hexDistance,
  hexRadius,
  hexRowSpacing,
  hexToOffset,
  hexToPixel,
  offsetToHex,
  snapTokenCenter,
  snapToGrid,
  type Point,
} from '../grid';
import { grid, seededRng } from './helpers';

const square = grid({ type: 'square', size: 70 });
const hex = grid({ type: 'hex', size: 60 });
const R = 60 / Math.sqrt(3);

function expectPoint(actual: Point, expected: Point, digits = 9): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

/** Center of hex at offset (col,row) following the documented layout. */
function documentedHexCenter(col: number, row: number, size = 60, ox = 0, oy = 0): Point {
  const r = size / Math.sqrt(3);
  return { x: ox + size / 2 + col * size + (Math.abs(row) % 2 === 1 ? size / 2 : 0), y: oy + r + row * ((size * Math.sqrt(3)) / 2) };
}

describe('square grid', () => {
  it('snaps to the center of the containing cell', () => {
    expectPoint(snapToGrid({ x: 10, y: 10 }, square), { x: 35, y: 35 });
    expectPoint(snapToGrid({ x: 75, y: 140 }, square), { x: 105, y: 175 });
    expectPoint(snapToGrid({ x: 69.99, y: 0 }, square), { x: 35, y: 35 });
    expectPoint(snapToGrid({ x: -1, y: -71 }, square), { x: -35, y: -105 });
  });

  it('honours the grid offset', () => {
    const g = grid({ size: 50, offsetX: 10, offsetY: 20 });
    expectPoint(snapToGrid({ x: 12, y: 25 }, g), { x: 35, y: 45 });
    expectPoint(snapToGrid({ x: 9, y: 19 }, g), { x: -15, y: -5 });
  });

  it('cellCenter equals snapToGrid', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const p = { x: rng() * 2000 - 500, y: rng() * 2000 - 500 };
      expect(cellCenter(p, square)).toEqual(snapToGrid(p, square));
      expect(cellCenter(p, hex)).toEqual(snapToGrid(p, hex));
    }
  });

  it('measures Chebyshev distance in cells', () => {
    expect(gridDistance({ x: 35, y: 35 }, { x: 35 + 3 * 70, y: 35 + 70 }, square)).toBe(3);
    expect(gridDistance({ x: 0, y: 0 }, { x: 4 * 70 + 1, y: 4 * 70 + 1 }, square)).toBe(4);
    expect(gridDistance({ x: 10, y: 10 }, { x: 60, y: 60 }, square)).toBe(0);
    expect(gridDistance({ x: 10, y: 10 }, { x: -10, y: 10 }, square)).toBe(1);
  });

  it('returns square corners for square grids', () => {
    expect(hexCorners({ x: 35, y: 35 }, square)).toEqual([
      { x: 0, y: 0 },
      { x: 70, y: 0 },
      { x: 70, y: 70 },
      { x: 0, y: 70 },
    ]);
  });

  it('snaps even-sized tokens to intersections', () => {
    expectPoint(snapTokenCenter({ x: 80, y: 130 }, 2, square), { x: 70, y: 140 });
    expectPoint(snapTokenCenter({ x: 80, y: 130 }, 1, square), { x: 105, y: 105 });
    expectPoint(snapTokenCenter({ x: 80, y: 130 }, 3, square), { x: 105, y: 105 });
    expectPoint(snapTokenCenter({ x: 80, y: 130 }, 2, hex), cellCenter({ x: 80, y: 130 }, hex));
  });

  it('leaves points alone with an invalid size', () => {
    expect(snapToGrid({ x: 13, y: 17 }, grid({ size: 0 }))).toEqual({ x: 13, y: 17 });
    expect(gridDistance({ x: 0, y: 0 }, { x: 100, y: 0 }, grid({ size: -5 }))).toBe(0);
  });
});

describe('hex grid (pointy-top, odd rows shifted right)', () => {
  it('exposes the documented geometry', () => {
    expect(hexRadius(hex)).toBeCloseTo(R, 12);
    expect(hexRowSpacing(hex)).toBeCloseTo((60 * Math.sqrt(3)) / 2, 12);
    expect(hexRowSpacing(hex)).toBeCloseTo(1.5 * R, 12);
  });

  it('places the first hex center at (offsetX + size/2, offsetY + radius)', () => {
    expectPoint(snapToGrid({ x: 30, y: R }, hex), { x: 30, y: R });
    expectPoint(snapToGrid({ x: 31, y: R + 2 }, hex), { x: 30, y: R });
    const off = grid({ type: 'hex', size: 60, offsetX: 7, offsetY: 11 });
    expectPoint(snapToGrid({ x: 7 + 30, y: 11 + R }, off), { x: 37, y: 11 + R });
  });

  it('shifts odd rows right by size/2', () => {
    const c10 = documentedHexCenter(0, 1);
    expectPoint(c10, { x: 60, y: R + 1.5 * R });
    expectPoint(snapToGrid({ x: c10.x + 3, y: c10.y - 4 }, hex), c10);
    const c21 = documentedHexCenter(1, 2);
    expectPoint(snapToGrid({ x: c21.x - 5, y: c21.y + 5 }, hex), c21);
  });

  it('converts between axial, offset and pixel coordinates', () => {
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        const h = offsetToHex(col, row);
        expect(hexToOffset(h)).toEqual({ col, row });
        expectPoint(hexToPixel(h, hex), documentedHexCenter(col, row));
        expect(hexAt(documentedHexCenter(col, row), hex)).toEqual(h);
      }
    }
  });

  it('snaps every point to the nearest hex center', () => {
    const rng = seededRng(2);
    const centers: Point[] = [];
    for (let row = -2; row <= 14; row++) for (let col = -2; col <= 14; col++) centers.push(documentedHexCenter(col, row));
    for (let i = 0; i < 1000; i++) {
      const p = { x: rng() * 600, y: rng() * 600 };
      const snapped = snapToGrid(p, hex);
      let best = Infinity;
      for (const c of centers) best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y));
      expect(Math.hypot(snapped.x - p.x, snapped.y - p.y)).toBeCloseTo(best, 6);
      // Every point inside a hex is at most one radius away from its center.
      expect(Math.hypot(snapped.x - p.x, snapped.y - p.y)).toBeLessThanOrEqual(R + 1e-9);
    }
  });

  it('returns 6 pointy-top corners at the hex radius', () => {
    const c = { x: 100, y: 200 };
    const corners = hexCorners(c, hex);
    expect(corners).toHaveLength(6);
    expectPoint(corners[0]!, { x: 100, y: 200 - R });
    expectPoint(corners[3]!, { x: 100, y: 200 + R });
    for (const p of corners) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(R, 9);
    // Width between the vertical sides equals the size.
    const xs = corners.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(60, 9);
  });

  it('measures hex distance', () => {
    const origin = documentedHexCenter(4, 4);
    expect(gridDistance(origin, origin, hex)).toBe(0);
    // Six neighbours of an even row hex in odd-r layout.
    const neighbours: [number, number][] = [
      [3, 4],
      [5, 4],
      [3, 3],
      [4, 3],
      [3, 5],
      [4, 5],
    ];
    for (const [col, row] of neighbours) expect(gridDistance(origin, documentedHexCenter(col, row), hex)).toBe(1);
    expect(gridDistance(origin, documentedHexCenter(6, 4), hex)).toBe(2);
    expect(gridDistance(origin, documentedHexCenter(4, 6), hex)).toBe(2);
    expect(gridDistance(origin, documentedHexCenter(4, 7), hex)).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });
});
