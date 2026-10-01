import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  blockingSegments,
  bytesToBase64,
  cellsToPx,
  computeVisibilityPolygon,
  countExplored,
  createExploredGrid,
  decodeExplored,
  encodeExplored,
  exploredCellSize,
  exploredRects,
  isCellExplored,
  isPointExplored,
  markExplored,
  pointInAnyPolygon,
  pointInPolygon,
  type Segment,
} from '../vision';
import { grid, level, seededRng, wall } from './helpers';

const BOUNDS = { width: 1000, height: 1000 };

function seg(ax: number, ay: number, bx: number, by: number): Segment {
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

function vertices(poly: number[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < poly.length; i += 2) out.push({ x: poly[i]!, y: poly[i + 1]! });
  return out;
}

function segmentsIntersect(p1: { x: number; y: number }, p2: { x: number; y: number }, s: Segment): boolean {
  const d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = d(s.a.x, s.a.y, s.b.x, s.b.y, p1.x, p1.y);
  const d2 = d(s.a.x, s.a.y, s.b.x, s.b.y, p2.x, p2.y);
  const d3 = d(p1.x, p1.y, p2.x, p2.y, s.a.x, s.a.y);
  const d4 = d(p1.x, p1.y, p2.x, p2.y, s.b.x, s.b.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function distToSegment(p: { x: number; y: number }, s: Segment): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const len2 = ex * ex + ey * ey;
  const u = Math.max(0, Math.min(1, ((p.x - s.a.x) * ex + (p.y - s.a.y) * ey) / len2));
  return Math.hypot(s.a.x + u * ex - p.x, s.a.y + u * ey - p.y);
}

describe('blockingSegments', () => {
  it('splits wall polylines into segments', () => {
    const segs = blockingSegments([wall('w1', [0, 0, 100, 0, 100, 100])]);
    expect(segs).toEqual([seg(0, 0, 100, 0), seg(100, 0, 100, 100)]);
  });

  it('never blocks with windows', () => {
    expect(blockingSegments([wall('win', [0, 0, 10, 10], 'window')])).toEqual([]);
  });

  it('blocks with closed doors only, doorStates overriding the default', () => {
    const closed = wall('d1', [0, 0, 10, 0], 'door', false);
    const open = wall('d2', [0, 5, 10, 5], 'door', true);
    expect(blockingSegments([closed, open])).toEqual([seg(0, 0, 10, 0)]);
    expect(blockingSegments([closed, open], { d1: true, d2: false })).toEqual([seg(0, 5, 10, 5)]);
    expect(blockingSegments([closed, open], {})).toEqual([seg(0, 0, 10, 0)]);
  });

  it('skips degenerate and odd-length data', () => {
    expect(blockingSegments([wall('w', [5, 5, 5, 5, 20, 5, 30])])).toEqual([seg(5, 5, 20, 5)]);
    expect(blockingSegments([wall('w', [1, 2])])).toEqual([]);
  });
});

describe('pointInPolygon', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  it('detects inside / outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
    expect(pointInPolygon({ x: 1, y: 1 }, [0, 0, 10, 0, 0, 10])).toBe(true);
    expect(pointInPolygon({ x: 9, y: 9 }, [0, 0, 10, 0, 0, 10])).toBe(false);
  });

  it('handles concave polygons and degenerate input', () => {
    const u = [0, 0, 30, 0, 30, 30, 20, 30, 20, 10, 10, 10, 10, 30, 0, 30];
    expect(pointInPolygon({ x: 15, y: 20 }, u)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 20 }, u)).toBe(true);
    expect(pointInPolygon({ x: 1, y: 1 }, [0, 0, 10, 0])).toBe(false);
    expect(pointInPolygon({ x: 1, y: 1 }, [])).toBe(false);
    expect(pointInAnyPolygon({ x: 5, y: 5 }, [[], square])).toBe(true);
    expect(pointInAnyPolygon({ x: 50, y: 5 }, [square])).toBe(false);
  });
});

describe('computeVisibilityPolygon', () => {
  const src = { x: 500, y: 500, radius: 200, cone: 360, facing: 0 };

  it('is a sampled circle without walls', () => {
    const poly = computeVisibilityPolygon(src, [], BOUNDS);
    const pts = vertices(poly);
    expect(pts.length).toBeGreaterThanOrEqual(64);
    for (const p of pts) {
      const d = Math.hypot(p.x - 500, p.y - 500);
      expect(d).toBeLessThanOrEqual(200 + 1e-6);
      expect(d).toBeGreaterThan(199.99);
    }
    expect(pointInPolygon({ x: 500, y: 500 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500 + 190, y: 500 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 500 - 190 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500 + 210, y: 500 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 650, y: 650 }, poly)).toBe(false);
  });

  it('returns vertices sorted by angle', () => {
    const poly = computeVisibilityPolygon(src, [seg(550, 400, 550, 600), seg(300, 300, 450, 320)], BOUNDS);
    const angles = vertices(poly).map((p) => {
      const a = Math.atan2(p.y - 500, p.x - 500);
      return a < 0 ? a + 2 * Math.PI : a;
    });
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThanOrEqual(angles[i - 1]! - 1e-9);
  });

  it('is blocked by a wall', () => {
    const poly = computeVisibilityPolygon(src, [seg(550, 400, 550, 600)], BOUNDS);
    expect(pointInPolygon({ x: 450, y: 500 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 540, y: 500 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 500 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 560, y: 450 }, poly)).toBe(false);
    // Visible around the end of the wall.
    expect(pointInPolygon({ x: 570, y: 340 }, poly)).toBe(true);
    // Some vertices lie on the wall itself.
    expect(vertices(poly).some((p) => Math.abs(p.x - 550) < 1e-6 && p.y > 400 && p.y < 600)).toBe(true);
  });

  it('closed doors block, open doors and windows do not', () => {
    const walls = [wall('door', [550, 400, 550, 600], 'door', false), wall('win', [450, 400, 450, 600], 'window')];
    const closed = computeVisibilityPolygon(src, blockingSegments(walls), BOUNDS);
    expect(pointInPolygon({ x: 600, y: 500 }, closed)).toBe(false);
    expect(pointInPolygon({ x: 400, y: 500 }, closed)).toBe(true);
    const opened = computeVisibilityPolygon(src, blockingSegments(walls, { door: true }), BOUNDS);
    expect(pointInPolygon({ x: 600, y: 500 }, opened)).toBe(true);
  });

  it('limits vision to the cone around the facing', () => {
    const east = computeVisibilityPolygon({ ...src, cone: 90, facing: 0 }, [], BOUNDS);
    expect(east[0]).toBe(500);
    expect(east[1]).toBe(500);
    expect(pointInPolygon({ x: 600, y: 500 }, east)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 560 }, east)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 440 }, east)).toBe(true);
    expect(pointInPolygon({ x: 400, y: 500 }, east)).toBe(false);
    expect(pointInPolygon({ x: 500, y: 600 }, east)).toBe(false);
    expect(pointInPolygon({ x: 600, y: 650 }, east)).toBe(false);
    for (const p of vertices(east).slice(1)) {
      const a = (Math.atan2(p.y - 500, p.x - 500) * 180) / Math.PI;
      expect(Math.abs(a)).toBeLessThanOrEqual(45 + 1e-6);
    }

    // Facing 90 = south (clockwise, y down).
    const south = computeVisibilityPolygon({ ...src, cone: 60, facing: 90 }, [], BOUNDS);
    expect(pointInPolygon({ x: 500, y: 650 }, south)).toBe(true);
    expect(pointInPolygon({ x: 650, y: 500 }, south)).toBe(false);
    expect(pointInPolygon({ x: 500, y: 350 }, south)).toBe(false);
  });

  it('handles cones wrapping around angle 0 and cones blocked by walls', () => {
    const west = computeVisibilityPolygon({ ...src, cone: 120, facing: 180 }, [], BOUNDS);
    expect(pointInPolygon({ x: 350, y: 500 }, west)).toBe(true);
    expect(pointInPolygon({ x: 650, y: 500 }, west)).toBe(false);
    const blocked = computeVisibilityPolygon({ ...src, cone: 90, facing: 0 }, [seg(550, 300, 550, 700)], BOUNDS);
    expect(pointInPolygon({ x: 540, y: 500 }, blocked)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 500 }, blocked)).toBe(false);
  });

  it('clamps to the level bounds', () => {
    const poly = computeVisibilityPolygon({ x: 20, y: 30, radius: 300, cone: 360, facing: 0 }, [], BOUNDS);
    for (const p of vertices(poly)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeLessThanOrEqual(1000);
    }
    expect(pointInPolygon({ x: 5, y: 5 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 200, y: 200 }, poly)).toBe(true);
  });

  it('covers the whole level with an infinite radius', () => {
    const poly = computeVisibilityPolygon({ x: 500, y: 500, radius: Infinity, cone: 360, facing: 0 }, [], BOUNDS);
    expect(pointInPolygon({ x: 2, y: 2 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 998, y: 998 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 2, y: 998 }, poly)).toBe(true);
  });

  it('returns [] for degenerate input', () => {
    expect(computeVisibilityPolygon({ ...src, radius: 0 }, [], BOUNDS)).toEqual([]);
    expect(computeVisibilityPolygon({ ...src, cone: 0 }, [], BOUNDS)).toEqual([]);
    expect(computeVisibilityPolygon(src, [], { width: 0, height: 100 })).toEqual([]);
    expect(computeVisibilityPolygon({ ...src, x: Number.NaN }, [], BOUNDS)).toEqual([]);
  });

  it('is consistent with line-of-sight for random walls (robustness)', () => {
    const rng = seededRng(4242);
    let checked = 0;
    for (let iter = 0; iter < 40; iter++) {
      const walls: Segment[] = [];
      const wallCount = 1 + Math.floor(rng() * 12);
      for (let i = 0; i < wallCount; i++) {
        const ax = rng() * 1000;
        const ay = rng() * 1000;
        const len = 30 + rng() * 300;
        const ang = rng() * Math.PI * 2;
        walls.push(seg(ax, ay, ax + Math.cos(ang) * len, ay + Math.sin(ang) * len));
      }
      const origin = { x: 100 + rng() * 800, y: 100 + rng() * 800 };
      if (walls.some((w) => distToSegment(origin, w) < 2)) continue;
      const radius = 150 + rng() * 400;
      const poly = computeVisibilityPolygon({ ...origin, radius, cone: 360, facing: 0 }, walls, BOUNDS);
      expect(poly.length).toBeGreaterThanOrEqual(6);
      expect(poly.every((v) => Number.isFinite(v))).toBe(true);
      expect(pointInPolygon(origin, poly)).toBe(true);

      const endpointAngles = walls.flatMap((w) => [w.a, w.b]).map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));
      for (let k = 0; k < 150; k++) {
        const ang = rng() * Math.PI * 2;
        const dist = rng() * radius * 0.9;
        const p = { x: origin.x + Math.cos(ang) * dist, y: origin.y + Math.sin(ang) * dist };
        if (p.x < 1 || p.y < 1 || p.x > 999 || p.y > 999) continue;
        if (walls.some((w) => distToSegment(p, w) < 1)) continue;
        if (endpointAngles.some((a) => Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) < 0.002)) continue;
        const blocked = walls.some((w) => segmentsIntersect(origin, p, w));
        expect(pointInPolygon(p, poly)).toBe(!blocked);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('explored grid', () => {
  const lvl = level('l1', { background: { url: null, width: 2100, height: 1400, color: '#000' }, grid: grid({ size: 70 }) });

  it('derives the cell size and dimensions from the level', () => {
    const g = createExploredGrid(lvl);
    expect(g).toMatchObject({ cols: 30, rows: 20, cellSize: 70 });
    expect(g.bits.length).toBe(75);
    expect(exploredCellSize(grid({ size: 10 }))).toBe(20);
    const small = createExploredGrid(level('l2', { background: { url: null, width: 2110, height: 1400, color: '#000' }, grid: grid({ size: 10 }) }));
    expect(small).toMatchObject({ cols: 106, rows: 70, cellSize: 20 });
    expect(small.bits.length).toBe(Math.ceil((106 * 70) / 8));
  });

  it('marks cells whose centers are inside polygons', () => {
    const g = createExploredGrid(lvl);
    // Rectangle covering the centers of cols 1..3, rows 2..3.
    const rect = [70, 140, 280, 140, 280, 280, 70, 280];
    expect(markExplored(g, [rect])).toBe(true);
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const expected = col >= 1 && col <= 3 && row >= 2 && row <= 3;
        expect(isCellExplored(g, col, row)).toBe(expected);
      }
    }
    expect(countExplored(g)).toBe(6);
    expect(markExplored(g, [rect])).toBe(false);
    expect(markExplored(g, [[0, 0, 1, 1]])).toBe(false);
    expect(isPointExplored(g, { x: 100, y: 200 })).toBe(true);
    expect(isPointExplored(g, { x: 10, y: 10 })).toBe(false);
  });

  it('matches a brute-force centre test for visibility polygons', () => {
    const rng = seededRng(77);
    for (let iter = 0; iter < 20; iter++) {
      const g = createExploredGrid(lvl);
      const walls = [seg(rng() * 2100, rng() * 1400, rng() * 2100, rng() * 1400), seg(rng() * 2100, rng() * 1400, rng() * 2100, rng() * 1400)];
      const polys = [
        computeVisibilityPolygon({ x: rng() * 2100, y: rng() * 1400, radius: 200 + rng() * 500, cone: 360, facing: 0 }, walls, { width: 2100, height: 1400 }),
        computeVisibilityPolygon({ x: rng() * 2100, y: rng() * 1400, radius: 300, cone: 100, facing: rng() * 360 }, walls, { width: 2100, height: 1400 }),
      ];
      markExplored(g, polys);
      for (let row = 0; row < g.rows; row++) {
        for (let col = 0; col < g.cols; col++) {
          const center = { x: (col + 0.5) * 70, y: (row + 0.5) * 70 };
          expect(isCellExplored(g, col, row)).toBe(pointInAnyPolygon(center, polys));
        }
      }
    }
  });

  it('round-trips through base64', () => {
    const g = createExploredGrid(lvl);
    markExplored(g, [computeVisibilityPolygon({ x: 700, y: 700, radius: 420, cone: 360, facing: 0 }, [], { width: 2100, height: 1400 })]);
    const encoded = encodeExplored(g);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(encoded.length).toBe(Math.ceil(g.bits.length / 3) * 4);
    const decoded = decodeExplored(encoded, lvl);
    expect(decoded.cols).toBe(g.cols);
    expect(decoded.rows).toBe(g.rows);
    expect(Array.from(decoded.bits)).toEqual(Array.from(g.bits));
    expect(countExplored(decoded)).toBe(countExplored(g));
    expect(countExplored(decoded)).toBeGreaterThan(20);
  });

  it('returns an empty grid for missing, invalid or mismatched data', () => {
    const empty = (gr: ReturnType<typeof createExploredGrid>): boolean => gr.bits.every((b) => b === 0);
    expect(empty(decodeExplored(undefined, lvl))).toBe(true);
    expect(empty(decodeExplored('', lvl))).toBe(true);
    expect(empty(decodeExplored('@@@@', lvl))).toBe(true);
    expect(empty(decodeExplored('/w==', lvl))).toBe(true);
    const other = createExploredGrid(level('x', { background: { url: null, width: 700, height: 700, color: '#000' }, grid: grid({ size: 70 }) }));
    other.bits.fill(255);
    const mismatched = decodeExplored(encodeExplored(other), lvl);
    expect(empty(mismatched)).toBe(true);
    expect(mismatched.bits.length).toBe(75);
  });

  it('isCellExplored rejects out-of-range cells', () => {
    const g = createExploredGrid(lvl);
    g.bits.fill(255);
    expect(isCellExplored(g, 0, 0)).toBe(true);
    expect(isCellExplored(g, 29, 19)).toBe(true);
    expect(isCellExplored(g, -1, 0)).toBe(false);
    expect(isCellExplored(g, 30, 0)).toBe(false);
    expect(isCellExplored(g, 0, 20)).toBe(false);
    expect(isCellExplored(g, 0.5, 1)).toBe(false);
  });

  it('merges explored cells into rectangles', () => {
    const g = createExploredGrid(lvl);
    markExplored(g, [[70, 140, 280, 140, 280, 280, 70, 280]]);
    expect(exploredRects(g)).toEqual([
      { x: 70, y: 140, width: 210, height: 70 },
      { x: 70, y: 210, width: 210, height: 70 },
    ]);
  });
});

describe('base64 codec', () => {
  it('matches known vectors', () => {
    expect(bytesToBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
    expect(bytesToBase64(new Uint8Array([77, 97]))).toBe('TWE=');
    expect(bytesToBase64(new Uint8Array([77]))).toBe('TQ==');
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
    expect(Array.from(base64ToBytes('TWFu')!)).toEqual([77, 97, 110]);
    expect(Array.from(base64ToBytes('TWE=')!)).toEqual([77, 97]);
    expect(Array.from(base64ToBytes('TQ')!)).toEqual([77]);
  });

  it('agrees with btoa/atob on random data', () => {
    const rng = seededRng(9);
    for (let n = 0; n < 64; n++) {
      const bytes = new Uint8Array(n * 7 + (n % 3));
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rng() * 256);
      const encoded = bytesToBase64(bytes);
      expect(encoded).toBe(btoa(String.fromCharCode(...bytes)));
      expect(Array.from(base64ToBytes(encoded)!)).toEqual(Array.from(bytes));
    }
  });

  it('rejects invalid text', () => {
    expect(base64ToBytes('abc$')).toBeNull();
    expect(base64ToBytes('A')).toBeNull();
    expect(base64ToBytes('AB=')).toBeNull();
    expect(base64ToBytes('A=BC')).toBeNull();
  });
});

describe('cellsToPx', () => {
  it('multiplies by the grid size', () => {
    expect(cellsToPx(6, grid({ size: 70 }))).toBe(420);
    expect(cellsToPx(1.5, grid({ type: 'hex', size: 60 }))).toBe(90);
  });
});
