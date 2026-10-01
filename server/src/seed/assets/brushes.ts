import type { Prng } from './rng';
import {
  blobPoints,
  circle,
  ellipse,
  g,
  line,
  n,
  path,
  pattern,
  polyPath,
  radialGradient,
  rect,
  sampleSpline,
  shade,
  smoothPath,
  softShadow,
  starPoints,
  vary,
  type Pt,
  type SvgDoc,
} from './svg';

/** Reusable top-down "painting" helpers for battle maps. */

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

/** Tiny grass strokes; returns the pattern fill. */
export function grassTexture(doc: SvgDoc, rng: Prng, id: string, light: string, dark: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const strokes: string[] = [];
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, 140);
    const y = rng.range(0, 140);
    const a = -Math.PI / 2 + rng.jitter(0.7);
    const len = rng.range(4, 10);
    strokes.push(
      line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, {
        stroke: rng.chance(0.5) ? light : dark,
        strokeWidth: rng.range(1, 2.2),
        strokeLinecap: 'round',
        opacity: rng.range(0.25, 0.6),
      }),
    );
  }
  return doc.def(id, pattern(id, 140, 140, strokes.join('')));
}

/** Speckled ground (dirt, ash, stone dust). */
export function speckleTexture(doc: SvgDoc, rng: Prng, id: string, colors: string[], size = 160, count = 90): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.range(0.8, 3.2);
    dots.push(circle(rng.range(0, size), rng.range(0, size), r, { fill: rng.pick(colors), opacity: rng.range(0.2, 0.6) }));
  }
  return doc.def(id, pattern(id, size, size, dots.join('')));
}

/** Wooden planks running horizontally; plank height = 35px (two per grid cell). */
export function plankTexture(doc: SvgDoc, rng: Prng, id: string, base: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const w = 420;
  const h = 140;
  const parts: string[] = [rect(0, 0, w, h, { fill: base })];
  for (let row = 0; row < 4; row++) {
    const y = row * 35;
    let x = -rng.range(0, 120);
    while (x < w) {
      const len = rng.range(140, 260);
      parts.push(rect(x, y, len, 35, { fill: vary(rng, base, 0.12) }));
      // Grain lines.
      for (let k = 0; k < 3; k++) {
        const gy = y + rng.range(6, 29);
        parts.push(line(x + 6, gy, x + len - 6, gy + rng.jitter(2), { stroke: shade(base, -0.25), strokeWidth: 0.8, opacity: 0.35 }));
      }
      if (rng.chance(0.35)) parts.push(ellipse(x + rng.range(20, len - 20), y + rng.range(10, 25), rng.range(3, 6), rng.range(2, 3.5), { fill: shade(base, -0.35), opacity: 0.5 }));
      parts.push(line(x, y, x, y + 35, { stroke: shade(base, -0.5), strokeWidth: 1.6 }));
      parts.push(circle(x + 5, y + 8, 1.4, { fill: shade(base, -0.55) }), circle(x + 5, y + 27, 1.4, { fill: shade(base, -0.55) }));
      x += len;
    }
    parts.push(line(0, y, w, y, { stroke: shade(base, -0.55), strokeWidth: 1.8 }));
  }
  return doc.def(id, pattern(id, w, h, parts.join('')));
}

/** Stone flagstones aligned to the 70px grid (each cell split in irregular slabs). */
export function flagstoneTexture(doc: SvgDoc, rng: Prng, id: string, base: string, mortar: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const size = 140;
  const parts: string[] = [rect(0, 0, size, size, { fill: mortar })];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const x = i * 70;
      const y = j * 70;
      if (rng.chance(0.5)) {
        parts.push(rect(x + 2, y + 2, 66, 32, { rx: 3, fill: vary(rng, base, 0.12) }), rect(x + 2, y + 36, 66, 32, { rx: 3, fill: vary(rng, base, 0.12) }));
      } else {
        parts.push(rect(x + 2, y + 2, 66, 66, { rx: 4, fill: vary(rng, base, 0.12) }));
      }
      // Cracks and wear.
      if (rng.chance(0.4)) {
        const cx = x + rng.range(10, 60);
        const cy = y + rng.range(10, 60);
        parts.push(path(`M${n(cx)} ${n(cy)}l${n(rng.jitter(12))} ${n(rng.jitter(12))}l${n(rng.jitter(10))} ${n(rng.jitter(10))}`, { stroke: shade(base, -0.45), strokeWidth: 1, fill: 'none', opacity: 0.7 }));
      }
      parts.push(rect(x + 2, y + 2, 66, 4, { fill: '#ffffff', opacity: 0.06 }));
    }
  }
  return doc.def(id, pattern(id, size, size, parts.join('')));
}

/** Rounded cobblestones. */
export function cobbleTexture(doc: SvgDoc, rng: Prng, id: string, base: string, mortar: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const size = 120;
  const parts: string[] = [rect(0, 0, size, size, { fill: mortar })];
  for (let j = 0; j < 6; j++) {
    for (let i = 0; i < 6; i++) {
      const x = i * 20 + (j % 2) * 10 + rng.jitter(2);
      const y = j * 20 + rng.jitter(2);
      const c = vary(rng, base, 0.15);
      parts.push(ellipse(x + 10, y + 10, rng.range(7.5, 9.5), rng.range(7, 9), { fill: c }));
      parts.push(ellipse(x + 8, y + 7, 4, 3, { fill: '#ffffff', opacity: 0.08 }));
    }
  }
  return doc.def(id, pattern(id, size, size, parts.join('')));
}

/** Roof shingles. */
export function shingleTexture(doc: SvgDoc, id: string, color: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const parts = [
    line(0, 0, 24, 0, { stroke: color, strokeWidth: 1.4, opacity: 0.55 }),
    line(0, 12, 24, 12, { stroke: color, strokeWidth: 1.4, opacity: 0.55 }),
    line(6, 0, 6, 12, { stroke: color, strokeWidth: 1, opacity: 0.4 }),
    line(18, 12, 18, 24, { stroke: color, strokeWidth: 1, opacity: 0.4 }),
  ];
  return doc.def(id, pattern(id, 24, 24, parts.join('')));
}

/** Base terrain: solid color + large soft blotches + fine texture. */
export function terrain(rng: Prng, w: number, h: number, opts: { base: string; blotches: string[]; count: number; texture?: string; rMin?: number; rMax?: number }): string {
  const parts: string[] = [rect(0, 0, w, h, { fill: opts.base })];
  for (let i = 0; i < opts.count; i++) {
    const r = rng.range(opts.rMin ?? 60, opts.rMax ?? 220);
    parts.push(ellipse(rng.range(-50, w + 50), rng.range(-50, h + 50), r, r * rng.range(0.5, 1), { fill: rng.pick(opts.blotches), opacity: rng.range(0.12, 0.35) }));
  }
  if (opts.texture) parts.push(rect(0, 0, w, h, { fill: opts.texture }));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Paths and water
// ---------------------------------------------------------------------------

export interface RoadStyle {
  edge: string;
  fill: string;
  light: string;
  pebble: string;
}

export const DIRT_ROAD: RoadStyle = { edge: '#5a4128', fill: '#9b7a50', light: '#c4a273', pebble: '#6f5638' };

export function road(rng: Prng, pts: Pt[], width: number, style: RoadStyle, pebbles = 60): string {
  const d = smoothPath(pts, false);
  const parts = [
    path(d, { fill: 'none', stroke: style.edge, strokeWidth: width + 14, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.55 }),
    path(d, { fill: 'none', stroke: style.fill, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: style.light, strokeWidth: width * 0.45, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.35 }),
  ];
  // Wheel ruts.
  parts.push(path(d, { fill: 'none', stroke: style.edge, strokeWidth: width * 0.62, strokeLinecap: 'round', opacity: 0.18, strokeDasharray: '40 18' }));
  const samples = sampleSpline(pts, 16);
  for (let i = 0; i < pebbles; i++) {
    const p = rng.pick(samples);
    const r = rng.range(1.5, 4.5);
    parts.push(ellipse(p.x + rng.jitter(width * 0.5), p.y + rng.jitter(width * 0.5), r, r * 0.75, { fill: style.pebble, opacity: rng.range(0.4, 0.8) }));
  }
  return parts.join('');
}

export function stream(rng: Prng, pts: Pt[], width: number): string {
  const d = smoothPath(pts, false);
  const parts = [
    path(d, { fill: 'none', stroke: '#3c4a2a', strokeWidth: width + 26, strokeLinecap: 'round', opacity: 0.6 }),
    path(d, { fill: 'none', stroke: '#6b5a3a', strokeWidth: width + 12, strokeLinecap: 'round' }),
    path(d, { fill: 'none', stroke: '#21506b', strokeWidth: width, strokeLinecap: 'round' }),
    path(d, { fill: 'none', stroke: '#2f6f8f', strokeWidth: width * 0.65, strokeLinecap: 'round' }),
    path(d, { fill: 'none', stroke: '#5fa8c8', strokeWidth: width * 0.25, strokeLinecap: 'round', opacity: 0.45 }),
    path(d, { fill: 'none', stroke: '#d8f2ff', strokeWidth: 2.5, strokeLinecap: 'round', opacity: 0.5, strokeDasharray: '14 46' }),
  ];
  const samples = sampleSpline(pts, 14);
  for (let i = 0; i < 40; i++) {
    const p = rng.pick(samples);
    parts.push(ellipse(p.x + rng.jitter(width * 0.7), p.y + rng.jitter(width * 0.7), rng.range(3, 8), rng.range(2, 5), { fill: rng.pick(['#7a7a72', '#8d8a80', '#5f5e58']), opacity: 0.85 }));
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Vegetation and rocks
// ---------------------------------------------------------------------------

export interface TreePalette {
  id: string;
  dark: string;
  mid: string;
  light: string;
}

export const OAK: TreePalette = { id: 'oak', dark: '#1f3d1c', mid: '#3d6b2c', light: '#7aa84a' };
export const PINE: TreePalette = { id: 'pine', dark: '#132a1f', mid: '#24503a', light: '#4f8a5e' };
export const AUTUMN: TreePalette = { id: 'autumn', dark: '#4a2a12', mid: '#8a4f1e', light: '#d08a3a' };
export const DEAD: TreePalette = { id: 'dead', dark: '#1b1a17', mid: '#3a352d', light: '#5c554a' };

function canopyGradient(doc: SvgDoc, p: TreePalette): string {
  const id = `canopy-${p.id}`;
  return doc.def(id, radialGradient(id, [[0, p.light], [0.55, p.mid], [1, p.dark]], { cx: 0.38, cy: 0.35, r: 0.7, fx: 0.32, fy: 0.28 }));
}

/** Round deciduous canopy made of overlapping shaded lobes. */
export function tree(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, p: TreePalette = OAK): string {
  const fill = canopyGradient(doc, p);
  const parts: string[] = [softShadow(doc, x + r * 0.35, y + r * 0.45, r * 1.15, r * 1.0, 0.55)];
  const lobes = rng.int(5, 8);
  parts.push(circle(x, y, r * 0.8, { fill: p.dark }));
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rng.jitter(0.4);
    const d = r * rng.range(0.32, 0.5);
    parts.push(circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rng.range(0.42, 0.6), { fill }));
  }
  parts.push(circle(x - r * 0.12, y - r * 0.12, r * 0.45, { fill, opacity: 0.9 }));
  for (let i = 0; i < 3; i++) parts.push(circle(x + rng.jitter(r * 0.5), y + rng.jitter(r * 0.5), r * rng.range(0.06, 0.12), { fill: p.dark, opacity: 0.35 }));
  return parts.join('');
}

/** Star-shaped conifer seen from above. */
export function pine(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, p: TreePalette = PINE): string {
  const fill = canopyGradient(doc, p);
  const spikes = rng.int(8, 11);
  const rot = rng.range(0, Math.PI);
  return [
    softShadow(doc, x + r * 0.35, y + r * 0.45, r * 1.1, r * 0.95, 0.55),
    path(polyPath(starPoints(x, y, r, r * 0.6, spikes, rot)), { fill: p.dark }),
    path(polyPath(starPoints(x - r * 0.06, y - r * 0.06, r * 0.75, r * 0.45, spikes, rot + 0.3)), { fill }),
    path(polyPath(starPoints(x - r * 0.1, y - r * 0.1, r * 0.42, r * 0.25, spikes, rot + 0.6)), { fill: p.light, opacity: 0.55 }),
    circle(x - r * 0.08, y - r * 0.08, r * 0.08, { fill: '#4a3420' }),
  ].join('');
}

export function bush(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, p: TreePalette = OAK, berries?: string): string {
  const fill = canopyGradient(doc, p);
  const parts = [softShadow(doc, x + r * 0.3, y + r * 0.35, r * 1.2, r * 0.9, 0.45)];
  for (let i = 0; i < 4; i++) parts.push(circle(x + rng.jitter(r * 0.5), y + rng.jitter(r * 0.4), r * rng.range(0.45, 0.7), { fill }));
  if (berries) for (let i = 0; i < 5; i++) parts.push(circle(x + rng.jitter(r * 0.6), y + rng.jitter(r * 0.6), 2.2, { fill: berries }));
  return parts.join('');
}

/** Bare, twisted tree seen from above (cemetery, ash lands). */
export function deadTree(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, color = '#1d1915'): string {
  const parts: string[] = [softShadow(doc, x + r * 0.3, y + r * 0.35, r * 0.9, r * 0.8, 0.4)];
  const branch = (bx: number, by: number, a: number, len: number, width: number, depth: number): void => {
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    const mx = (bx + ex) / 2 + rng.jitter(len * 0.2);
    const my = (by + ey) / 2 + rng.jitter(len * 0.2);
    parts.push(path(`M${n(bx)} ${n(by)}Q${n(mx)} ${n(my)} ${n(ex)} ${n(ey)}`, { stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round' }));
    if (depth > 0) {
      const kids = rng.int(2, 3);
      for (let i = 0; i < kids; i++) branch(ex, ey, a + rng.jitter(0.9), len * rng.range(0.55, 0.75), width * 0.62, depth - 1);
    }
  };
  const trunks = rng.int(4, 6);
  for (let i = 0; i < trunks; i++) branch(x, y, (i / trunks) * Math.PI * 2 + rng.jitter(0.4), r * rng.range(0.35, 0.5), r * 0.1, 2);
  parts.push(circle(x, y, r * 0.13, { fill: shade(color, 0.15) }));
  return parts.join('');
}

export interface RockStyle {
  base: string;
  light: string;
  dark: string;
}

export const GRAY_ROCK: RockStyle = { base: '#6d6a63', light: '#9d9a90', dark: '#3b3934' };
export const ASH_ROCK: RockStyle = { base: '#4a4440', light: '#6f6660', dark: '#221e1c' };
export const CAVE_ROCK: RockStyle = { base: '#4b4038', light: '#6e6052', dark: '#231d19' };

export function rock(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, style: RockStyle = GRAY_ROCK): string {
  const pts = blobPoints(rng, x, y, r, r * rng.range(0.7, 1), rng.int(6, 9), 0.28, rng.range(0, Math.PI));
  const top = blobPoints(rng, x - r * 0.15, y - r * 0.18, r * 0.6, r * 0.5, 6, 0.25, rng.range(0, Math.PI));
  return [
    softShadow(doc, x + r * 0.3, y + r * 0.35, r * 1.2, r * 1.0, 0.55),
    path(polyPath(pts), { fill: style.base, stroke: style.dark, strokeWidth: Math.max(1.5, r * 0.06), strokeLinejoin: 'round' }),
    path(polyPath(top), { fill: style.light, opacity: 0.55 }),
    path(`M${n(x - r * 0.2)} ${n(y + r * 0.1)}l${n(r * 0.3)} ${n(r * 0.25)}`, { stroke: style.dark, strokeWidth: 1.5, opacity: 0.6, fill: 'none' }),
  ].join('');
}

// ---------------------------------------------------------------------------
// Buildings and props
// ---------------------------------------------------------------------------

export function houseRoof(doc: SvgDoc, rng: Prng, cx: number, cy: number, w: number, h: number, rot: number, roof: string, chimney = true): string {
  const shingles = shingleTexture(doc, 'shingles', shade(roof, -0.5));
  const hw = w / 2;
  const hh = h / 2;
  const ridgeAlongX = w >= h;
  const parts: string[] = [];
  // Drop shadow (sun from the top-left).
  parts.push(rect(-hw + 14, -hh + 18, w, h, { fill: '#000000', opacity: 0.35, rx: 4 }));
  parts.push(rect(-hw - 6, -hh - 6, w + 12, h + 12, { fill: shade(roof, -0.55), rx: 3 }));
  if (ridgeAlongX) {
    parts.push(rect(-hw, -hh, w, hh, { fill: shade(roof, 0.12) }), rect(-hw, 0, w, hh, { fill: shade(roof, -0.18) }));
  } else {
    parts.push(rect(-hw, -hh, hw, h, { fill: shade(roof, 0.12) }), rect(0, -hh, hw, h, { fill: shade(roof, -0.18) }));
  }
  parts.push(rect(-hw, -hh, w, h, { fill: shingles }));
  parts.push(
    ridgeAlongX
      ? line(-hw, 0, hw, 0, { stroke: shade(roof, -0.6), strokeWidth: 5 })
      : line(0, -hh, 0, hh, { stroke: shade(roof, -0.6), strokeWidth: 5 }),
  );
  parts.push(rect(-hw, -hh, w, h, { fill: 'none', stroke: shade(roof, -0.65), strokeWidth: 3 }));
  if (chimney) {
    const chx = rng.range(-hw * 0.6, hw * 0.4);
    const chy = ridgeAlongX ? rng.range(-hh * 0.8, -hh * 0.35) : rng.range(-hh * 0.6, hh * 0.4);
    parts.push(rect(chx + 5, chy + 6, 22, 22, { fill: '#000000', opacity: 0.3 }), rect(chx, chy, 22, 22, { fill: '#7b726a', stroke: '#3a3530', strokeWidth: 2 }), rect(chx + 5, chy + 5, 12, 12, { fill: '#1b1816' }));
  }
  return g({ transform: `translate(${n(cx)} ${n(cy)}) rotate(${n(rot)})` }, parts);
}

export function campfire(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const flame = doc.def('flameGrad', radialGradient('flameGrad', [[0, '#fff6c8'], [0.35, '#ffc23a'], [0.75, '#ff6a1a'], [1, '#c2300f', 0]], { cy: 0.6 }));
  const parts: string[] = [];
  parts.push(circle(x, y, r * 3.2, { fill: doc.def('fireGlow', radialGradient('fireGlow', [[0, '#ff9a3c', 0.45], [1, '#ff9a3c', 0]])) }));
  parts.push(circle(x, y, r * 1.05, { fill: '#2a1f18' }));
  const stones = 10;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    parts.push(ellipse(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15, r * 0.28, r * 0.22, { fill: vary(rng, '#77706a', 0.15), stroke: '#2e2a26', strokeWidth: 1.5 }));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + rng.jitter(0.3);
    parts.push(line(x - Math.cos(a) * r * 0.8, y - Math.sin(a) * r * 0.8, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, { stroke: '#4a2e18', strokeWidth: r * 0.25, strokeLinecap: 'round' }));
  }
  parts.push(path(polyPath(blobPoints(rng, x, y, r * 0.75, r * 0.75, 9, 0.35)), { fill: flame }));
  parts.push(circle(x, y, r * 0.3, { fill: '#fff3c0', opacity: 0.9 }));
  return parts.join('');
}

export function barrel(doc: SvgDoc, x: number, y: number, r: number): string {
  return [
    softShadow(doc, x + r * 0.3, y + r * 0.35, r * 1.2, r * 1.1, 0.5),
    circle(x, y, r, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2 }),
    circle(x, y, r * 0.78, { fill: 'none', stroke: '#3a3a3a', strokeWidth: 2.5 }),
    circle(x, y, r * 0.5, { fill: '#7d5230', stroke: '#4a2e18', strokeWidth: 1 }),
    circle(x - r * 0.3, y - r * 0.3, r * 0.2, { fill: '#ffffff', opacity: 0.1 }),
  ].join('');
}

export function crate(x: number, y: number, s: number, rot = 0): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-s / 2 + 6, -s / 2 + 8, s, s, { fill: '#000000', opacity: 0.35 }),
    rect(-s / 2, -s / 2, s, s, { fill: '#8a6236', stroke: '#3d2a14', strokeWidth: 2.5 }),
    rect(-s / 2 + 5, -s / 2 + 5, s - 10, s - 10, { fill: 'none', stroke: '#5c3f20', strokeWidth: 2 }),
    line(-s / 2 + 5, -s / 2 + 5, s / 2 - 5, s / 2 - 5, { stroke: '#5c3f20', strokeWidth: 3 }),
  ]);
}

export function roundTable(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const wood = doc.def('tableWood', radialGradient('tableWood', [[0, '#a4723f'], [0.8, '#7a4f28'], [1, '#5a3618']], { cx: 0.4, cy: 0.4 }));
  const parts: string[] = [];
  const stools = 4;
  const rot = rng.range(0, Math.PI / 2);
  for (let i = 0; i < stools; i++) {
    const a = rot + (i / stools) * Math.PI * 2;
    const sx = x + Math.cos(a) * r * 1.45;
    const sy = y + Math.sin(a) * r * 1.45;
    parts.push(softShadow(doc, sx + 5, sy + 6, 18, 16, 0.45), circle(sx, sy, 14, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2 }));
  }
  parts.push(softShadow(doc, x + r * 0.25, y + r * 0.3, r * 1.25, r * 1.15, 0.55));
  parts.push(circle(x, y, r, { fill: wood, stroke: '#3a2412', strokeWidth: 3 }));
  parts.push(circle(x, y, r * 0.7, { fill: 'none', stroke: '#5a3618', strokeWidth: 1, opacity: 0.6 }));
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    const mx = x + Math.cos(a) * r * 0.5;
    const my = y + Math.sin(a) * r * 0.5;
    parts.push(circle(mx, my, 7, { fill: '#c9c2b0', stroke: '#6f6a5c', strokeWidth: 1.5 }), circle(mx, my, 4.5, { fill: '#d9a441' }));
  }
  if (rng.chance(0.6)) parts.push(ellipse(x + rng.jitter(10), y + rng.jitter(10), 14, 9, { fill: '#e8dcc0', stroke: '#8a7a5a', strokeWidth: 1 }));
  return parts.join('');
}

export function bed(x: number, y: number, w: number, h: number, blanket: string): string {
  return [
    rect(x + 8, y + 10, w, h, { fill: '#000000', opacity: 0.35 }),
    rect(x, y, w, h, { fill: '#5a3618', stroke: '#2a1a0e', strokeWidth: 2, rx: 4 }),
    rect(x + 6, y + 6, w - 12, h - 12, { fill: '#e8e0cc', rx: 3 }),
    rect(x + w * 0.32, y + 6, w * 0.68 - 6, h - 12, { fill: blanket, rx: 3 }),
    line(x + w * 0.32, y + h * 0.5, x + w - 6, y + h * 0.5, { stroke: shade(blanket, -0.3), strokeWidth: 2, opacity: 0.6 }),
    rect(x + 10, y + h * 0.2, w * 0.18, h * 0.6, { fill: '#fbf6ea', rx: 6 }),
  ].join('');
}

export function bookshelf(rng: Prng, x: number, y: number, w: number, h: number, rot = 0): string {
  const parts: string[] = [rect(6, 8, w, h, { fill: '#000000', opacity: 0.35 }), rect(0, 0, w, h, { fill: '#3e2614', stroke: '#1e120a', strokeWidth: 2 })];
  let bx = 4;
  const colors = ['#7a1f1f', '#1f3f7a', '#2f6a2f', '#7a5a1f', '#4a1f6a', '#8a7a5a', '#1f5a5a'];
  while (bx < w - 6) {
    const bw = rng.range(5, 11);
    parts.push(rect(bx, 4, bw - 1, h - 8, { fill: rng.pick(colors) }));
    if (rng.chance(0.4)) parts.push(rect(bx, 4 + (h - 8) * 0.3, bw - 1, 2, { fill: '#d4a63f', opacity: 0.8 }));
    bx += bw;
  }
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, parts);
}

export function chest(x: number, y: number, w: number, h: number, rot = 0): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-w / 2 + 6, -h / 2 + 8, w, h, { fill: '#000000', opacity: 0.4 }),
    rect(-w / 2, -h / 2, w, h, { fill: '#7a4a22', stroke: '#2a1a0e', strokeWidth: 2.5, rx: 3 }),
    rect(-w / 2, -h / 2 + h * 0.15, w, h * 0.12, { fill: '#8a8a8a' }),
    rect(-w / 2, h / 2 - h * 0.27, w, h * 0.12, { fill: '#8a8a8a' }),
    rect(-5, -h / 2 + h * 0.35, 10, h * 0.3, { fill: '#e9c063', stroke: '#7d5d1d', strokeWidth: 1 }),
  ]);
}

export function rug(r: { x: number; y: number; w: number; h: number }, base: string, border: string): string {
  return [
    rect(r.x, r.y, r.w, r.h, { fill: base, rx: 4 }),
    rect(r.x + 12, r.y + 12, r.w - 24, r.h - 24, { fill: 'none', stroke: border, strokeWidth: 8, rx: 3 }),
    rect(r.x + 30, r.y + 30, r.w - 60, r.h - 60, { fill: 'none', stroke: border, strokeWidth: 2, strokeDasharray: '10 8', opacity: 0.8 }),
    ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.18, r.h * 0.2, { fill: 'none', stroke: border, strokeWidth: 4 }),
    ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.08, r.h * 0.09, { fill: border, opacity: 0.8 }),
  ].join('');
}

export function wallTorch(doc: SvgDoc, x: number, y: number): string {
  return [
    circle(x, y, 60, { fill: doc.def('torchGlow', radialGradient('torchGlow', [[0, '#ffc860', 0.55], [1, '#ff9a3c', 0]])) }),
    circle(x, y, 7, { fill: '#4a2e18', stroke: '#1e120a', strokeWidth: 1.5 }),
    circle(x, y - 2, 5, { fill: '#ffcf5a' }),
    circle(x, y - 3, 2.5, { fill: '#fff6c8' }),
  ].join('');
}

export function candle(doc: SvgDoc, x: number, y: number, r = 5): string {
  return [
    circle(x, y, r * 7, { fill: doc.def('candleGlow', radialGradient('candleGlow', [[0, '#ffe2a0', 0.5], [1, '#ffd28a', 0]])) }),
    circle(x, y, r, { fill: '#efe6cf', stroke: '#9a8f78', strokeWidth: 1 }),
    circle(x, y, r * 0.45, { fill: '#ffcf5a' }),
  ].join('');
}

export function bones(rng: Prng, x: number, y: number, count: number, spread: number, color = '#d8ccb0'): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const bx = x + rng.jitter(spread);
    const by = y + rng.jitter(spread);
    const a = rng.range(0, Math.PI);
    const len = rng.range(10, 22);
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    parts.push(
      line(bx - dx / 2, by - dy / 2, bx + dx / 2, by + dy / 2, { stroke: color, strokeWidth: 3.5, strokeLinecap: 'round' }),
      circle(bx - dx / 2, by - dy / 2, 3, { fill: color }),
      circle(bx + dx / 2, by + dy / 2, 3, { fill: color }),
    );
    if (rng.chance(0.25)) {
      const sx = bx + rng.jitter(10);
      const sy = by + rng.jitter(10);
      parts.push(circle(sx, sy, 7, { fill: color }), circle(sx - 2.5, sy - 1, 1.8, { fill: '#2a2620' }), circle(sx + 2.5, sy - 1, 1.8, { fill: '#2a2620' }));
    }
  }
  return parts.join('');
}

export function coins(doc: SvgDoc, rng: Prng, cx: number, cy: number, rx: number, ry: number, count: number): string {
  const gold = doc.def('coinGold', radialGradient('coinGold', [[0, '#fff3b0'], [0.5, '#f0c24a'], [1, '#a8741a']], { cx: 0.35, cy: 0.35 }));
  const parts: string[] = [];
  const items: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next());
    items.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r: rng.range(4, 8) });
  }
  items.sort((p, q) => p.y - q.y);
  for (const it of items) parts.push(circle(it.x, it.y, it.r, { fill: gold, stroke: '#7d5d1d', strokeWidth: 1 }));
  return parts.join('');
}

export function gemstone(x: number, y: number, r: number, color: string): string {
  const pts = starPoints(x, y, r, r * 0.8, 4, 0);
  return [path(polyPath(pts), { fill: color, stroke: shade(color, -0.5), strokeWidth: 1 }), circle(x - r * 0.25, y - r * 0.25, r * 0.25, { fill: '#ffffff', opacity: 0.7 })].join('');
}

export function gravestone(rng: Prng, x: number, y: number, rot: number, kind: 'stone' | 'cross' | 'open'): string {
  const parts: string[] = [];
  if (kind === 'open') {
    parts.push(rect(-24, -40, 48, 84, { fill: '#1a1612', stroke: '#3a2e22', strokeWidth: 3, rx: 3 }), rect(-30, 46, 60, 18, { fill: '#5a4632', rx: 8 }));
  } else {
    parts.push(rect(-26, -34, 52, 86, { fill: '#3e3428', rx: 14, opacity: 0.85 }), rect(-22, -30, 44, 78, { fill: '#4d4233', rx: 12, opacity: 0.6 }));
  }
  if (kind === 'stone') {
    const stone = vary(rng, '#8b877e', 0.12);
    parts.push(rect(-26 + 7, -58 + 9, 52, 18, { fill: '#000000', opacity: 0.4, rx: 5 }), rect(-26, -58, 52, 18, { fill: stone, stroke: '#2f2c27', strokeWidth: 2, rx: 6 }), rect(-22, -56, 44, 5, { fill: '#ffffff', opacity: 0.15 }));
    if (rng.chance(0.4)) parts.push(path(`M-10 -56l6 8l-4 6`, { stroke: '#2f2c27', strokeWidth: 1.2, fill: 'none' }));
  } else if (kind === 'cross') {
    parts.push(rect(-6 + 7, -70 + 9, 12, 40, { fill: '#000000', opacity: 0.4 }), rect(-6, -70, 12, 40, { fill: '#7d786e', stroke: '#2f2c27', strokeWidth: 2 }), rect(-18, -60, 36, 10, { fill: '#7d786e', stroke: '#2f2c27', strokeWidth: 2 }));
  }
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, parts);
}

export function fogPatches(doc: SvgDoc, rng: Prng, w: number, h: number, count: number, color = '#c8d0d8', opacity: [number, number] = [0.08, 0.2]): string {
  const fill = doc.def(`fog${color.replace('#', '')}`, radialGradient(`fog${color.replace('#', '')}`, [[0, color, 1], [1, color, 0]]));
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.range(120, 320);
    parts.push(ellipse(rng.range(0, w), rng.range(0, h), r, r * rng.range(0.4, 0.7), { fill, opacity: rng.range(opacity[0], opacity[1]) }));
  }
  return parts.join('');
}

export function lavaPool(doc: SvgDoc, rng: Prng, x: number, y: number, rx: number, ry: number): string {
  const lava = doc.def('lavaGrad', radialGradient('lavaGrad', [[0, '#fff0a0'], [0.3, '#ffb020'], [0.7, '#ff5a10'], [1, '#a01a05']]));
  const parts: string[] = [];
  parts.push(ellipse(x, y, rx * 2.1, ry * 2.1, { fill: doc.def('lavaGlow', radialGradient('lavaGlow', [[0, '#ff6a1a', 0.55], [1, '#ff4a0a', 0]])) }));
  parts.push(path(smoothPath(blobPoints(rng, x, y, rx * 1.12, ry * 1.12, 12, 0.12)), { fill: '#2a1a14' }));
  parts.push(path(smoothPath(blobPoints(rng, x, y, rx, ry, 12, 0.14)), { fill: lava }));
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.25, 0.8);
    const cx2 = x + Math.cos(a) * rx * d;
    const cy2 = y + Math.sin(a) * ry * d;
    parts.push(path(smoothPath(blobPoints(rng, cx2, cy2, rng.range(10, 26), rng.range(7, 16), 7, 0.3)), { fill: '#5a1a08', opacity: 0.75, stroke: '#ff8a20', strokeWidth: 1.5 }));
  }
  for (let i = 0; i < 6; i++) parts.push(circle(x + rng.jitter(rx * 0.6), y + rng.jitter(ry * 0.6), rng.range(3, 7), { fill: '#fff6c8', opacity: 0.8 }));
  return parts.join('');
}

export function lavaCrack(pts: Pt[], width: number): string {
  const d = polyPath(pts, false);
  return [
    path(d, { fill: 'none', stroke: '#ff4a0a', strokeWidth: width * 5, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.18 }),
    path(d, { fill: 'none', stroke: '#1a100c', strokeWidth: width * 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: '#ff6a10', strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: '#ffd060', strokeWidth: width * 0.35, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  ].join('');
}

/** Arcane circle with rings, runes and a star. */
export function arcaneCircle(doc: SvgDoc, x: number, y: number, r: number, color: string, points = 7): string {
  const glowFill = doc.def(`arcane${color.replace('#', '')}`, radialGradient(`arcane${color.replace('#', '')}`, [[0, color, 0.5], [0.7, color, 0.15], [1, color, 0]]));
  const parts: string[] = [circle(x, y, r * 1.35, { fill: glowFill })];
  parts.push(circle(x, y, r, { fill: 'none', stroke: color, strokeWidth: 5, opacity: 0.9 }));
  parts.push(circle(x, y, r * 0.86, { fill: 'none', stroke: color, strokeWidth: 2, opacity: 0.8 }));
  parts.push(circle(x, y, r * 0.42, { fill: 'none', stroke: color, strokeWidth: 3, opacity: 0.85 }));
  // Runes between the outer rings.
  const runes = 28;
  for (let i = 0; i < runes; i++) {
    const a = (i / runes) * Math.PI * 2;
    const rx = x + Math.cos(a) * r * 0.93;
    const ry = y + Math.sin(a) * r * 0.93;
    const deg = (a * 180) / Math.PI + 90;
    const glyph = ['M-4 -5L4 5M-4 5L4 -5', 'M0 -6V6M-4 -2H4', 'M-4 -5H4L-4 5H4', 'M-4 5L0 -6L4 5', 'M-3 -6V6M3 -6V6M-3 0H3'][i % 5]!;
    parts.push(path(glyph, { transform: `translate(${n(rx)} ${n(ry)}) rotate(${n(deg)})`, stroke: color, strokeWidth: 1.6, fill: 'none', opacity: 0.9 }));
  }
  const star = starPoints(x, y, r * 0.84, r * 0.42, points);
  let d = '';
  for (let i = 0; i < points; i++) {
    const p = star[i * 2]!;
    const q = star[((i + 2) % points) * 2]!;
    d += `M${n(p.x)} ${n(p.y)}L${n(q.x)} ${n(q.y)}`;
  }
  parts.push(path(d, { stroke: color, strokeWidth: 2.5, fill: 'none', opacity: 0.85 }));
  parts.push(circle(x, y, r * 0.12, { fill: color, opacity: 0.8 }));
  return parts.join('');
}

