import { barrel, crate, shingleTexture } from './brushes';
import type { BuildingSpec, ShipSpec, StallSpec } from './layoutsSteam';
import type { RectSpec, WallSpec } from './layouts';
import type { Prng } from './rng';
import { BRASS, COPPER, IRON, gearD, gearWithHoleD, metalLinear, metalRadial, polar, rivetLine, rivetRing, spokeWindowsD, tubeGradient } from './steamKit';
import {
  blobPoints,
  circle,
  ellipse,
  g,
  line,
  linearGradient,
  n,
  path,
  pattern,
  polyPath,
  radialGradient,
  rect,
  regularPolygon,
  sampleSpline,
  shade,
  smoothPath,
  softShadow,
  tag,
  text,
  vary,
  type Pt,
  type SvgDoc,
} from './svg';

/** Top-down steampunk props for the "Los Cielos de Latón" battle maps (70 px grid). */

export interface Metal {
  light: string;
  base: string;
  dark: string;
}

const SOOT = '#14110e';
const SERIF = "Georgia, 'Times New Roman', serif";

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Evenly spaced samples along a polyline (or a spline when smooth), with unit tangents. */
export function resample(points: Pt[], step: number, smooth = true): { p: Pt; t: Pt }[] {
  const dense = smooth && points.length > 2 ? sampleSpline(points, 24) : points;
  const out: { p: Pt; t: Pt }[] = [];
  let carry = 0;
  for (let i = 0; i < dense.length - 1; i++) {
    const a = dense[i]!;
    const b = dense[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    let d = carry;
    while (d <= len) {
      out.push({ p: { x: a.x + t.x * d, y: a.y + t.y * d }, t });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

/** Polyline offset sideways by `dist` (positive = left of the travel direction in screen space). */
export function offsetLine(points: Pt[], dist: number, smooth = true): Pt[] {
  return resample(points, 8, smooth).map(({ p, t }) => ({ x: p.x + t.y * dist, y: p.y - t.x * dist }));
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

/** Running-bond bricks (35 x 17.5 px, four per grid cell). */
export function brickTexture(doc: SvgDoc, rng: Prng, id: string, base: string, mortar: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const size = 140;
  const bw = 35;
  const bh = 17.5;
  const parts: string[] = [rect(0, 0, size, size, { fill: mortar })];
  for (let row = 0; row < 8; row++) {
    const y = row * bh;
    for (let x = row % 2 === 0 ? 0 : -bw / 2; x < size; x += bw) {
      parts.push(rect(x + 1.2, y + 1.2, bw - 2.4, bh - 2.4, { fill: vary(rng, base, 0.14), rx: 1.5 }));
      if (rng.chance(0.18)) parts.push(rect(x + 1.2, y + 1.2, bw - 2.4, bh - 2.4, { fill: SOOT, opacity: rng.range(0.12, 0.3), rx: 1.5 }));
    }
    parts.push(line(0, y + 1.6, size, y + 1.6, { stroke: '#ffffff', strokeWidth: 0.8, opacity: 0.06 }));
  }
  return doc.def(id, pattern(id, size, size, parts.join('')));
}

/** Riveted metal floor plates aligned to the grid (70 px plates). */
export function plateTexture(doc: SvgDoc, rng: Prng, id: string, base: string, rust?: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const size = 140;
  const parts: string[] = [rect(0, 0, size, size, { fill: shade(base, -0.5) })];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const x = i * 70;
      const y = j * 70;
      const c = vary(rng, base, 0.08);
      parts.push(rect(x + 1.5, y + 1.5, 67, 67, { fill: c, rx: 2 }));
      parts.push(line(x + 2, y + 2.5, x + 68, y + 2.5, { stroke: shade(c, 0.35), strokeWidth: 1.2, opacity: 0.6 }), line(x + 2.5, y + 2, x + 2.5, y + 68, { stroke: shade(c, 0.25), strokeWidth: 1, opacity: 0.5 }));
      parts.push(line(x + 2, y + 67.5, x + 68, y + 67.5, { stroke: shade(c, -0.45), strokeWidth: 1.2, opacity: 0.7 }), line(x + 67.5, y + 2, x + 67.5, y + 68, { stroke: shade(c, -0.45), strokeWidth: 1.2, opacity: 0.7 }));
      for (const [rx, ry] of [
        [7, 7],
        [63, 7],
        [7, 63],
        [63, 63],
        [35, 7],
        [35, 63],
      ] as [number, number][]) {
        parts.push(circle(x + rx, y + ry, 2.1, { fill: shade(c, 0.3), stroke: shade(c, -0.55), strokeWidth: 0.8 }));
      }
      for (let k = 0; k < 3; k++) {
        const sx = x + rng.range(8, 60);
        const sy = y + rng.range(8, 60);
        parts.push(line(sx, sy, sx + rng.jitter(18), sy + rng.jitter(6), { stroke: shade(c, 0.4), strokeWidth: 0.7, opacity: 0.35 }));
      }
      if (rust && rng.chance(0.45)) parts.push(ellipse(x + rng.range(12, 58), y + rng.range(12, 58), rng.range(6, 16), rng.range(4, 10), { fill: rust, opacity: rng.range(0.18, 0.4) }));
    }
  }
  return doc.def(id, pattern(id, size, size, parts.join('')));
}

/** Diamond tread plate (engine rooms, catwalk landings). */
export function treadTexture(doc: SvgDoc, id: string, base: string): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const parts: string[] = [rect(0, 0, 28, 28, { fill: base })];
  for (const [x, y, rot] of [
    [7, 7, 45],
    [21, 7, -45],
    [7, 21, -45],
    [21, 21, 45],
  ] as [number, number, number][]) {
    parts.push(ellipse(x, y, 5, 1.6, { fill: shade(base, 0.28), transform: `rotate(${rot} ${x} ${y})` }), ellipse(x + 0.6, y + 0.8, 5, 1.6, { fill: shade(base, -0.35), opacity: 0.6, transform: `rotate(${rot} ${x + 0.6} ${y + 0.8})` }));
  }
  return doc.def(id, pattern(id, 28, 28, parts.join('')));
}

/** Open steel grating (catwalks, vents). */
export function gratingTexture(doc: SvgDoc, id: string, bar: string, hole = '#0a0908'): string {
  if (doc.hasDef(id)) return `url(#${id})`;
  const parts = [
    rect(0, 0, 14, 14, { fill: hole }),
    rect(0, 0, 14, 3, { fill: bar }),
    rect(0, 0, 3, 14, { fill: shade(bar, -0.2) }),
    line(0, 0.8, 14, 0.8, { stroke: shade(bar, 0.35), strokeWidth: 0.8 }),
  ];
  return doc.def(id, pattern(id, 14, 14, parts.join('')));
}

/** Yellow and black hazard stripes. */
export function hazardTexture(doc: SvgDoc): string {
  const id = 'hazardStripes';
  if (doc.hasDef(id)) return `url(#${id})`;
  return doc.def(id, pattern(id, 24, 24, [rect(0, 0, 24, 24, { fill: '#d8a62a' }), path('M0 24L24 0H12L0 12ZM12 24L24 12V24Z', { fill: '#1a1612' })].join('')));
}

// ---------------------------------------------------------------------------
// Smoke, steam and light
// ---------------------------------------------------------------------------

function puffGradient(doc: SvgDoc, id: string, color: string): string {
  return doc.def(id, radialGradient(id, [[0, color, 0.85], [0.55, color, 0.45], [1, color, 0]]));
}

/** Drifting puffs (steam when white, smoke when gray). */
export function plume(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, color = '#f2f4f6', opacity = 0.6, drift: Pt = { x: 0.8, y: -0.6 }): string {
  const fill = puffGradient(doc, `puff${color.replace('#', '')}`, color);
  const parts: string[] = [];
  const count = rng.int(4, 6);
  for (let i = 0; i < count; i++) {
    const k = i / count;
    const pr = r * (0.7 + k * 1.1);
    parts.push(circle(x + drift.x * r * 2.2 * k + rng.jitter(r * 0.4), y + drift.y * r * 2.2 * k + rng.jitter(r * 0.4), pr, { fill, opacity: opacity * (1 - k * 0.7) }));
  }
  return parts.join('');
}

/** Floor vent with a steam plume. */
export function steamVent(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const slots: string[] = [];
  for (let i = -2; i <= 2; i++) slots.push(rect(x - r * 0.7, y + i * r * 0.28 - r * 0.07, r * 1.4, r * 0.14, { fill: '#050404', rx: 1 }));
  return [
    circle(x, y, r * 1.15, { fill: '#1a1714' }),
    circle(x, y, r, { fill: metalRadial(doc, 'ventIron', IRON), stroke: '#0e0c0a', strokeWidth: 2 }),
    ...slots,
    rivetRing(x, y, r * 0.88, 8, 1.6, '#8a909a'),
    plume(doc, rng, x, y - r * 0.2, r * 0.9, '#f2f4f6', 0.55),
  ].join('');
}

/** Street gas lamp seen from above. */
export function gasLamp(doc: SvgDoc, x: number, y: number, s = 1): string {
  const glowFill = doc.def('gasLampGlow', radialGradient('gasLampGlow', [[0, '#ffd890', 0.55], [0.4, '#ffc060', 0.2], [1, '#ffb040', 0]]));
  const hex = regularPolygon(x, y, 9 * s, 6, Math.PI / 6);
  return [
    circle(x, y, 95 * s, { fill: glowFill }),
    softShadow(doc, x + 8 * s, y + 10 * s, 14 * s, 12 * s, 0.5),
    path(polyPath(hex), { fill: '#fff0b8', stroke: '#1a140c', strokeWidth: 2.5 * s }),
    circle(x, y, 4.5 * s, { fill: '#ffffff', opacity: 0.9 }),
    path(polyPath(regularPolygon(x, y, 5 * s, 6, Math.PI / 6)), { fill: 'none', stroke: '#3a2a12', strokeWidth: 1.2 * s }),
  ].join('');
}

/** Lamp bolted to a wall or bulkhead. */
export function wallLamp(doc: SvgDoc, x: number, y: number, color = '#ffd890'): string {
  const id = `wallLampGlow${color.replace('#', '')}`;
  return [
    circle(x, y, 70, { fill: doc.def(id, radialGradient(id, [[0, color, 0.5], [1, color, 0]])) }),
    circle(x, y, 8, { fill: metalRadial(doc, 'lampBrass', BRASS), stroke: '#2a1a0a', strokeWidth: 1.5 }),
    circle(x, y, 4.5, { fill: '#fff4cc' }),
  ].join('');
}

export function lightPool(doc: SvgDoc, id: string, color: string, x: number, y: number, r: number, opacity = 0.5): string {
  return circle(x, y, r, { fill: doc.def(id, radialGradient(id, [[0, color, 0.75], [0.5, color, 0.25], [1, color, 0]])), opacity });
}

// ---------------------------------------------------------------------------
// Pipes, gauges, gears
// ---------------------------------------------------------------------------

/** Pipe run along a polyline: tube shading, elbows and flanges. */
export function pipeRun(pts: Pt[], width: number, metal: Metal = COPPER, flangeEvery = 140): string {
  const d = polyPath(pts, false);
  const parts: string[] = [
    path(d, { fill: 'none', stroke: '#000000', strokeWidth: width + 8, opacity: 0.3, strokeLinejoin: 'round', transform: 'translate(5 7)' }),
    path(d, { fill: 'none', stroke: '#0e0a06', strokeWidth: width + 4, strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: metal.dark, strokeWidth: width, strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: metal.base, strokeWidth: width * 0.62, strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: metal.light, strokeWidth: width * 0.2, strokeLinejoin: 'round', opacity: 0.75, transform: `translate(${n(-width * 0.12)} ${n(-width * 0.12)})` }),
  ];
  for (let i = 1; i < pts.length - 1; i++) parts.push(circle(pts[i]!.x, pts[i]!.y, width * 0.72, { fill: metal.base, stroke: '#0e0a06', strokeWidth: 2 }), circle(pts[i]!.x - width * 0.15, pts[i]!.y - width * 0.15, width * 0.25, { fill: metal.light, opacity: 0.6 }));
  for (const { p, t } of resample(pts, flangeEvery, false).slice(1)) {
    const deg = (Math.atan2(t.y, t.x) * 180) / Math.PI;
    parts.push(rect(-width * 0.22, -width * 0.8, width * 0.44, width * 1.6, { fill: metal.base, stroke: '#0e0a06', strokeWidth: 1.5, rx: 1.5, transform: `translate(${n(p.x)} ${n(p.y)}) rotate(${n(deg)})` }));
  }
  return parts.join('');
}

export function valveWheel(x: number, y: number, r: number, color = '#a8322a'): string {
  const spokes: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + Math.PI / 8;
    spokes.push(line(x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r, { stroke: shade(color, -0.3), strokeWidth: r * 0.18 }));
  }
  return [circle(x + 2, y + 3, r * 1.05, { fill: '#000000', opacity: 0.35 }), ...spokes, circle(x, y, r, { fill: 'none', stroke: color, strokeWidth: r * 0.28 }), circle(x, y, r, { fill: 'none', stroke: '#1a0a06', strokeWidth: 0.8 }), circle(x, y, r * 0.25, { fill: BRASS.base, stroke: '#1a0a06', strokeWidth: 1 })].join('');
}

export function pressureGauge(x: number, y: number, r: number, angle = -0.6): string {
  const ticks: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
    const p1 = polar(x, y, r * 0.78, a);
    const p2 = polar(x, y, r * 0.62, a);
    ticks.push(line(p1.x, p1.y, p2.x, p2.y, { stroke: i >= 7 ? '#c0392b' : '#2a2018', strokeWidth: 1.1 }));
  }
  const tip = polar(x, y, r * 0.7, angle);
  return [circle(x, y, r, { fill: BRASS.base, stroke: '#2a1a0a', strokeWidth: 1.5 }), circle(x, y, r * 0.84, { fill: '#f3ead6', stroke: BRASS.dark, strokeWidth: 1 }), ...ticks, line(x, y, tip.x, tip.y, { stroke: '#c0392b', strokeWidth: 1.6, strokeLinecap: 'round' }), circle(x, y, r * 0.12, { fill: '#2a2018' })].join('');
}

/** Spoked gear plate (decoration, machinery). */
export function gearPlate(doc: SvgDoc, x: number, y: number, r: number, teeth: number, metal: Metal, id: string, opts: { rot?: number; opacity?: number; spokes?: number; hub?: boolean } = {}): string {
  const rot = opts.rot ?? 0;
  const hole = r * 0.16;
  const spokes = opts.spokes ?? 5;
  const depth = Math.max(4, r * 0.13);
  const d = `${gearWithHoleD(x, y, r, depth, teeth, hole, rot)}${spokes > 0 ? spokeWindowsD(x, y, r * 0.3, r * 0.68, spokes, rot) : ''}`;
  const fill = metalRadial(doc, id, metal);
  return g({ opacity: opts.opacity ?? 1 }, [
    path(d, { fill: '#000000', opacity: 0.35, fillRule: 'evenodd', transform: 'translate(6 8)' }),
    path(d, { fill, fillRule: 'evenodd', stroke: shade(metal.dark, -0.4), strokeWidth: Math.max(1.5, r * 0.02) }),
    circle(x, y, r - depth - r * 0.06, { fill: 'none', stroke: shade(metal.dark, -0.2), strokeWidth: Math.max(1, r * 0.015), opacity: 0.7 }),
    opts.hub === false ? '' : circle(x, y, hole * 1.35, { fill: 'none', stroke: metal.light, strokeWidth: Math.max(1.2, r * 0.03) }),
  ]);
}

// ---------------------------------------------------------------------------
// Streets and rails
// ---------------------------------------------------------------------------

/** Railway with sleepers and two steel rails. */
export function railway(pts: Pt[], gauge = 34, smooth = true, ballast = true): string {
  const parts: string[] = [];
  const d = smooth ? smoothPath(pts, false) : polyPath(pts, false);
  if (ballast) parts.push(path(d, { fill: 'none', stroke: '#2e2924', strokeWidth: gauge + 42, strokeLinecap: 'butt', strokeLinejoin: 'round', opacity: 0.75 }), path(d, { fill: 'none', stroke: '#4a433b', strokeWidth: gauge + 30, strokeLinecap: 'butt', strokeLinejoin: 'round', strokeDasharray: '3 5', opacity: 0.6 }));
  for (const { p, t } of resample(pts, 24, smooth)) {
    const deg = (Math.atan2(t.y, t.x) * 180) / Math.PI;
    parts.push(rect(-4.5, -(gauge + 22) / 2, 9, gauge + 22, { fill: '#4a3424', stroke: '#1e140c', strokeWidth: 1, transform: `translate(${n(p.x)} ${n(p.y)}) rotate(${n(deg)})` }));
  }
  for (const side of [gauge / 2, -gauge / 2]) {
    const rail = polyPath(offsetLine(pts, side, smooth), false);
    parts.push(path(rail, { fill: 'none', stroke: '#1a1714', strokeWidth: 6.5, strokeLinejoin: 'round' }), path(rail, { fill: 'none', stroke: '#b8bec8', strokeWidth: 2.4, strokeLinejoin: 'round' }));
  }
  return parts.join('');
}

/** Tram car seen from above. */
export function tramCar(doc: SvgDoc, x: number, y: number, rot: number, color = '#2f6f6a'): string {
  const body = doc.def(`tram${color.replace('#', '')}`, linearGradient(`tram${color.replace('#', '')}`, [[0, shade(color, -0.35)], [0.35, shade(color, 0.25)], [0.65, color], [1, shade(color, -0.45)]]));
  const parts: string[] = [
    rect(-110 + 10, -36 + 14, 220, 72, { fill: '#000000', opacity: 0.4, rx: 22 }),
    rect(-110, -36, 220, 72, { fill: body, stroke: '#0e0a06', strokeWidth: 3, rx: 22 }),
    rect(-96, -26, 192, 52, { fill: shade(color, 0.12), stroke: shade(color, -0.5), strokeWidth: 1.5, rx: 14 }),
    rect(-60, -8, 120, 16, { fill: metalLinear(doc, 'tramBrass', BRASS), stroke: '#2a1a0a', strokeWidth: 1.2, rx: 4 }),
    line(-20, 0, 70, 0, { stroke: '#1a1a1a', strokeWidth: 3 }),
    line(70, 0, 150, -10, { stroke: '#1a1a1a', strokeWidth: 2 }),
    circle(150, -10, 4, { fill: BRASS.base, stroke: '#1a1a1a', strokeWidth: 1 }),
    circle(106, -20, 5, { fill: '#fff4c0' }),
    circle(106, 20, 5, { fill: '#fff4c0' }),
    rivetLine(-90, -31, 90, -31, 12, 1.5, BRASS.light),
    rivetLine(-90, 31, 90, 31, 12, 1.5, BRASS.light),
  ];
  for (const vx of [-80, -50, 40, 70]) parts.push(rect(vx, -4, 14, 8, { fill: '#1a1a1a', rx: 2 }));
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, parts);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** Round brick chimney stack with soot and smoke. */
export function chimneyStack(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, smoke = true): string {
  const bricks = brickTexture(doc, rng, 'chimneyBricks', '#8a3e2a', '#3a1e14');
  const soot = doc.def('chimneySoot', radialGradient('chimneySoot', [[0, '#000000', 1], [0.6, '#0a0806', 0.9], [1, '#2a1a10', 0.3]]));
  return [
    circle(x + r * 0.5, y + r * 0.65, r * 1.05, { fill: '#000000', opacity: 0.35 }),
    circle(x, y, r, { fill: bricks, stroke: '#1a0e08', strokeWidth: 2.5 }),
    circle(x, y, r * 0.92, { fill: 'none', stroke: shade('#8a3e2a', 0.25), strokeWidth: r * 0.12, opacity: 0.6 }),
    circle(x, y, r * 0.62, { fill: soot }),
    smoke ? plume(doc, rng, x, y, r * 0.9, '#7a7670', 0.55, { x: 0.9, y: -0.5 }) : '',
  ].join('');
}

function ridgeRoof(doc: SvgDoc, rng: Prng, x0: number, y0: number, w: number, h: number, color: string): string {
  const shingles = shingleTexture(doc, `steamShingles${color.replace('#', '')}`, shade(color, -0.5));
  const alongX = w >= h;
  const parts: string[] = [];
  if (alongX) parts.push(rect(x0, y0, w, h / 2, { fill: shade(color, 0.16) }), rect(x0, y0 + h / 2, w, h / 2, { fill: shade(color, -0.2) }));
  else parts.push(rect(x0, y0, w / 2, h, { fill: shade(color, 0.16) }), rect(x0 + w / 2, y0, w / 2, h, { fill: shade(color, -0.2) }));
  parts.push(rect(x0, y0, w, h, { fill: shingles }));
  parts.push(alongX ? line(x0, y0 + h / 2, x0 + w, y0 + h / 2, { stroke: shade(color, -0.6), strokeWidth: 6 }) : line(x0 + w / 2, y0, x0 + w / 2, y0 + h, { stroke: shade(color, -0.6), strokeWidth: 6 }));
  // Dormer windows on the lit side.
  const dormers = Math.max(1, Math.floor((alongX ? w : h) / 110));
  for (let i = 0; i < dormers; i++) {
    const t = (i + 0.5) / dormers;
    const dx = alongX ? x0 + w * t : x0 + w * 0.22;
    const dy = alongX ? y0 + h * 0.22 : y0 + h * t;
    parts.push(rect(dx - 13, dy - 10, 26, 20, { fill: shade(color, -0.35), stroke: '#0e0a06', strokeWidth: 1.5 }), rect(dx - 8, dy - 6, 16, 10, { fill: rng.chance(0.6) ? '#ffcf6a' : '#3a4a5a', opacity: 0.9 }));
  }
  return parts.join('');
}

function copperRoof(doc: SvgDoc, rng: Prng, x0: number, y0: number, w: number, h: number, color: string): string {
  const alongX = w >= h;
  const grad = doc.def(`copperRoof${color.replace('#', '')}${alongX ? 'h' : 'v'}`, linearGradient(`copperRoof${color.replace('#', '')}${alongX ? 'h' : 'v'}`, [[0, shade(color, 0.3)], [0.5, color], [0.5, shade(color, -0.25)], [1, shade(color, -0.45)]], 0, 0, alongX ? 0 : 1, alongX ? 1 : 0));
  const parts: string[] = [rect(x0, y0, w, h, { fill: grad })];
  const seams = Math.floor((alongX ? w : h) / 18);
  for (let i = 1; i < seams; i++) {
    const t = i / seams;
    parts.push(alongX ? line(x0 + w * t, y0, x0 + w * t, y0 + h, { stroke: shade(color, -0.45), strokeWidth: 1.6, opacity: 0.7 }) : line(x0, y0 + h * t, x0 + w, y0 + h * t, { stroke: shade(color, -0.45), strokeWidth: 1.6, opacity: 0.7 }));
  }
  for (let i = 0; i < 10; i++) parts.push(ellipse(x0 + rng.range(10, w - 10), y0 + rng.range(10, h - 10), rng.range(8, 26), rng.range(5, 14), { fill: rng.chance(0.5) ? '#9fd8c4' : '#b8673a', opacity: rng.range(0.15, 0.35) }));
  parts.push(alongX ? rect(x0, y0 + h / 2 - 4, w, 8, { fill: metalLinear(doc, 'ridgeBrass', BRASS) }) : rect(x0 + w / 2 - 4, y0, 8, h, { fill: metalLinear(doc, 'ridgeBrassH', BRASS, true) }));
  // Small copper cupola.
  const cx = x0 + w * rng.range(0.3, 0.7);
  const cy = y0 + h * rng.range(0.3, 0.7);
  parts.push(circle(cx + 6, cy + 8, 20, { fill: '#000000', opacity: 0.35 }), path(polyPath(regularPolygon(cx, cy, 20, 8, Math.PI / 8)), { fill: metalRadial(doc, 'cupola', { light: '#c8f0e0', base: '#4f9a84', dark: '#1e4a3e' }), stroke: '#0e1a16', strokeWidth: 2 }), circle(cx, cy, 5, { fill: BRASS.light, stroke: '#2a1a0a', strokeWidth: 1 }));
  return parts.join('');
}

function glassRoof(doc: SvgDoc, rng: Prng, x0: number, y0: number, w: number, h: number): string {
  const glass = doc.def('glassPane', linearGradient('glassPane', [[0, '#cfe8f0', 0.85], [0.5, '#7fb0c4', 0.75], [1, '#3a6a7a', 0.8]], 0, 0, 1, 1));
  const parts: string[] = [rect(x0, y0, w, h, { fill: '#1e2a2e' })];
  const cols = Math.max(2, Math.round(w / 35));
  const rows = Math.max(2, Math.round(h / 35));
  const pw = w / cols;
  const ph = h / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const broken = rng.chance(0.06);
      parts.push(rect(x0 + i * pw + 2, y0 + j * ph + 2, pw - 4, ph - 4, { fill: broken ? '#0e1416' : glass, opacity: broken ? 0.9 : rng.range(0.7, 0.95) }));
    }
  }
  for (let i = 0; i < 4; i++) {
    const sx = x0 + rng.range(0, w * 0.7);
    parts.push(line(sx, y0 + 4, sx + w * 0.25, y0 + h - 4, { stroke: '#ffffff', strokeWidth: rng.range(3, 8), opacity: 0.12 }));
  }
  parts.push(rect(x0, y0, w, h, { fill: 'none', stroke: '#2a2a2a', strokeWidth: 5 }), w >= h ? line(x0, y0 + h / 2, x0 + w, y0 + h / 2, { stroke: '#2a2a2a', strokeWidth: 5 }) : line(x0 + w / 2, y0, x0 + w / 2, y0 + h, { stroke: '#2a2a2a', strokeWidth: 5 }));
  // Warm light from inside.
  parts.push(ellipse(x0 + w / 2, y0 + h / 2, w * 0.4, h * 0.35, { fill: '#ffd28a', opacity: 0.12 }));
  return parts.join('');
}

function flatRoof(doc: SvgDoc, rng: Prng, x0: number, y0: number, w: number, h: number, color: string): string {
  const bricks = brickTexture(doc, rng, `roofBricks${color.replace('#', '')}`, color, '#2a1a12');
  const tar = doc.def('roofTar', pattern('roofTar', 60, 60, [rect(0, 0, 60, 60, { fill: '#34302c' }), ...Array.from({ length: 30 }, (_, i) => circle((i * 37) % 60, (i * 23) % 60, 1.2 + (i % 3) * 0.5, { fill: i % 2 ? '#4a4540' : '#24201c' }))].join('')));
  const parts: string[] = [rect(x0, y0, w, h, { fill: bricks }), rect(x0 + 14, y0 + 14, w - 28, h - 28, { fill: tar }), rect(x0 + 14, y0 + 14, w - 28, h - 28, { fill: 'none', stroke: '#000000', strokeWidth: 3, opacity: 0.4 })];
  // Skylight and water tank.
  const sx = x0 + w * rng.range(0.2, 0.45);
  const sy = y0 + h * rng.range(0.25, 0.55);
  parts.push(rect(sx, sy, 56, 40, { fill: '#1e2a2e', stroke: '#2a2a2a', strokeWidth: 3 }), rect(sx + 4, sy + 4, 22, 32, { fill: '#7fb0c4', opacity: 0.7 }), rect(sx + 30, sy + 4, 22, 32, { fill: '#7fb0c4', opacity: 0.55 }));
  const tx = x0 + w * rng.range(0.62, 0.8);
  const ty = y0 + h * rng.range(0.3, 0.7);
  parts.push(circle(tx + 6, ty + 8, 26, { fill: '#000000', opacity: 0.35 }), circle(tx, ty, 26, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2.5 }), circle(tx, ty, 20, { fill: 'none', stroke: '#3a3a3a', strokeWidth: 3 }), circle(tx, ty, 12, { fill: '#7d5230' }));
  return parts.join('');
}

function sawtoothRoof(doc: SvgDoc, x0: number, y0: number, w: number, h: number, color: string): string {
  const parts: string[] = [];
  const strips = Math.max(3, Math.round(h / 44));
  const sh = h / strips;
  const grad = doc.def(`saw${color.replace('#', '')}`, linearGradient(`saw${color.replace('#', '')}`, [[0, shade(color, -0.45)], [0.25, shade(color, 0.2)], [1, shade(color, -0.1)]]));
  for (let i = 0; i < strips; i++) {
    const y = y0 + i * sh;
    parts.push(rect(x0, y, w, sh, { fill: grad }), rect(x0, y, w, sh * 0.24, { fill: '#5f8a9a', opacity: 0.75 }), line(x0, y + sh * 0.24, x0 + w, y + sh * 0.24, { stroke: '#1a1a1a', strokeWidth: 2 }));
    for (let x = x0 + 30; x < x0 + w; x += 30) parts.push(line(x, y + 1, x, y + sh * 0.24, { stroke: '#1a1a1a', strokeWidth: 1.2, opacity: 0.8 }));
  }
  parts.push(rect(x0, y0, w, h, { fill: 'none', stroke: shade(color, -0.6), strokeWidth: 4 }));
  return parts.join('');
}

/** Building seen from above with a themed roof, chimneys and rooftop pipes. */
export function steamBuilding(doc: SvgDoc, rng: Prng, b: BuildingSpec, opts: { chimneys?: number; smoke?: boolean } = {}): string {
  const x0 = b.cx - b.w / 2;
  const y0 = b.cy - b.h / 2;
  const parts: string[] = [rect(x0 + 16, y0 + 20, b.w, b.h, { fill: '#000000', opacity: 0.42 }), rect(x0 - 6, y0 - 6, b.w + 12, b.h + 12, { fill: shade(b.color, -0.65), rx: 2 })];
  switch (b.roof) {
    case 'slate':
      parts.push(ridgeRoof(doc, rng, x0, y0, b.w, b.h, b.color));
      break;
    case 'copper':
      parts.push(copperRoof(doc, rng, x0, y0, b.w, b.h, b.color));
      break;
    case 'glass':
      parts.push(glassRoof(doc, rng, x0, y0, b.w, b.h));
      break;
    case 'brick':
      parts.push(flatRoof(doc, rng, x0, y0, b.w, b.h, b.color));
      break;
    case 'sawtooth':
      parts.push(sawtoothRoof(doc, x0, y0, b.w, b.h, b.color));
      break;
  }
  parts.push(rect(x0, y0, b.w, b.h, { fill: 'none', stroke: '#0e0a06', strokeWidth: 3 }));
  const chimneys = opts.chimneys ?? (b.roof === 'glass' ? 0 : Math.max(1, Math.min(3, Math.floor((b.w * b.h) / 30000))));
  for (let i = 0; i < chimneys; i++) {
    const cx = x0 + b.w * ((i + 0.5) / chimneys) + rng.jitter(b.w * 0.08);
    const cy = y0 + b.h * (rng.chance(0.5) ? 0.2 : 0.78);
    parts.push(chimneyStack(doc, rng, cx, cy, rng.range(13, 18), opts.smoke ?? true));
  }
  if (b.roof !== 'glass' && b.w > 150) {
    const px = x0 + b.w * 0.12;
    const py = y0 + b.h * 0.5;
    parts.push(pipeRun([{ x: px, y: py - b.h * 0.25 }, { x: px, y: py + b.h * 0.15 }, { x: px + b.w * 0.18, y: py + b.h * 0.15 }], 10, rng.chance(0.5) ? COPPER : IRON, 90));
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

/** Clock tower: stone base, brass octagonal dome and a large clock face on the south facade. */
export function clockTower(doc: SvgDoc, rng: Prng, x: number, y: number, size: number): string {
  const hs = size / 2;
  const stone = doc.def('towerStone', pattern('towerStone', 70, 35, [rect(0, 0, 70, 35, { fill: '#3a3530' }), rect(1, 1, 33, 15.5, { fill: '#8b857a' }), rect(36, 1, 33, 15.5, { fill: '#7d776c' }), rect(-16, 18.5, 33, 15.5, { fill: '#7d776c' }), rect(19, 18.5, 33, 15.5, { fill: '#8b857a' }), rect(54, 18.5, 33, 15.5, { fill: '#857f74' })].join('')));
  const parts: string[] = [rect(x - hs + 26, y - hs + 32, size, size, { fill: '#000000', opacity: 0.45 })];
  parts.push(rect(x - hs - 14, y - hs - 14, size + 28, size + 28, { fill: '#2a2622' }), rect(x - hs, y - hs, size, size, { fill: stone, stroke: '#1a1714', strokeWidth: 4 }));
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as [number, number][]) {
    parts.push(rect(x + dx * hs - 16, y + dy * hs - 16, 32, 32, { fill: '#6d675e', stroke: '#1a1714', strokeWidth: 3 }), gearPlate(doc, x + dx * hs, y + dy * hs, 12, 10, BRASS, 'towerCornerGear', { spokes: 0 }));
  }
  const oct = regularPolygon(x, y, hs * 0.92, 8, Math.PI / 8);
  const dome = metalRadial(doc, 'towerDome', { light: '#ffe9a8', base: '#c9a24a', dark: '#5a3e10' });
  parts.push(path(polyPath(oct), { fill: dome, stroke: '#2a1a0a', strokeWidth: 3 }));
  for (const p of oct) parts.push(line(x, y, p.x, p.y, { stroke: '#5a3e10', strokeWidth: 3, opacity: 0.8 }));
  parts.push(path(polyPath(regularPolygon(x, y, hs * 0.55, 8, Math.PI / 8)), { fill: 'none', stroke: '#fff3c0', strokeWidth: 1.5, opacity: 0.5 }));
  parts.push(rivetRing(x, y, hs * 0.8, 24, 2.2, '#fff0b0'));
  parts.push(circle(x, y, hs * 0.16, { fill: metalRadial(doc, 'spireCap', COPPER), stroke: '#2a1a0a', strokeWidth: 2 }), circle(x - 3, y - 3, hs * 0.05, { fill: '#ffffff', opacity: 0.6 }));
  // Clock face projecting south.
  const fy = y + hs + 6;
  const fr = size * 0.3;
  const ticks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const p1 = polar(x, fy, fr * 0.82, a);
    const p2 = polar(x, fy, fr * (i % 3 === 0 ? 0.62 : 0.7), a);
    ticks.push(line(p1.x, p1.y, p2.x, p2.y, { stroke: '#1a140c', strokeWidth: i % 3 === 0 ? 4 : 2 }));
  }
  const hour = polar(x, fy, fr * 0.45, -Math.PI / 2 - Math.PI / 3);
  const minute = polar(x, fy, fr * 0.7, -Math.PI / 2 + Math.PI / 3);
  parts.push(
    softShadow(doc, x + 10, fy + 14, fr * 1.2, fr * 1.05, 0.55),
    circle(x, fy, fr + 10, { fill: metalLinear(doc, 'clockRim', BRASS), stroke: '#2a1a0a', strokeWidth: 3 }),
    rivetRing(x, fy, fr + 5, 20, 2, '#fff3c0'),
    circle(x, fy, fr, { fill: '#f6efd8', stroke: '#5a3e10', strokeWidth: 2 }),
    circle(x, fy, fr * 0.9, { fill: 'none', stroke: '#1a140c', strokeWidth: 1.2 }),
    ...ticks,
    line(x, fy, hour.x, hour.y, { stroke: '#1a140c', strokeWidth: 6, strokeLinecap: 'round' }),
    line(x, fy, minute.x, minute.y, { stroke: '#1a140c', strokeWidth: 3.5, strokeLinecap: 'round' }),
    circle(x, fy, 6, { fill: BRASS.base, stroke: '#1a140c', strokeWidth: 1.5 }),
  );
  parts.push(plume(doc, rng, x + hs * 0.6, y - hs * 0.6, 14, '#f2f4f6', 0.4));
  return parts.join('');
}

/** Circular plaza with a brass gear inlay and a fountain crowned by a gear sculpture. */
export function gearPlaza(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const paving = doc.def('plazaPaving', pattern('plazaPaving', 70, 70, [rect(0, 0, 70, 70, { fill: '#3a352e' }), rect(1.5, 1.5, 32, 32, { fill: '#9a9284', rx: 2 }), rect(36.5, 1.5, 32, 32, { fill: '#8d8578', rx: 2 }), rect(1.5, 36.5, 32, 32, { fill: '#857e71', rx: 2 }), rect(36.5, 36.5, 32, 32, { fill: '#958d80', rx: 2 })].join('')));
  const water = doc.def('fountainWater', radialGradient('fountainWater', [[0, '#9fd8e8'], [0.6, '#3f8aa8'], [1, '#1e4a5e']]));
  const parts: string[] = [circle(x, y, r + 18, { fill: '#2a2622' }), circle(x, y, r, { fill: paving })];
  // Radial pavers rings.
  for (let k = 1; k <= 3; k++) parts.push(circle(x, y, r * (0.35 + k * 0.18), { fill: 'none', stroke: '#2a2622', strokeWidth: 3, opacity: 0.55 }));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const p1 = polar(x, y, r * 0.53, a);
    const p2 = polar(x, y, r * 0.99, a);
    parts.push(line(p1.x, p1.y, p2.x, p2.y, { stroke: '#2a2622', strokeWidth: 2, opacity: 0.45 }));
  }
  // Brass gear inlay.
  parts.push(path(gearD(x, y, r * 0.9, r * 0.07, 36), { fill: 'none', stroke: '#1a120a', strokeWidth: 10, opacity: 0.6 }), path(gearD(x, y, r * 0.9, r * 0.07, 36), { fill: 'none', stroke: BRASS.base, strokeWidth: 6 }), path(gearD(x, y, r * 0.9, r * 0.07, 36), { fill: 'none', stroke: BRASS.light, strokeWidth: 1.5, opacity: 0.8 }));
  parts.push(circle(x, y, r * 0.5, { fill: 'none', stroke: BRASS.base, strokeWidth: 5 }), rivetRing(x, y, r * 0.5, 32, 2.2, BRASS.light));
  // Fountain.
  parts.push(softShadow(doc, x + 10, y + 14, r * 0.36, r * 0.32, 0.5), circle(x, y, r * 0.33, { fill: '#6d675e', stroke: '#1a1714', strokeWidth: 4 }), circle(x, y, r * 0.28, { fill: water }));
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(r * 0.14, r * 0.26);
    parts.push(circle(x + Math.cos(a) * d, y + Math.sin(a) * d, rng.range(3, 7), { fill: 'none', stroke: '#d8f2ff', strokeWidth: 1.2, opacity: 0.5 }));
  }
  parts.push(gearPlate(doc, x, y, r * 0.15, 12, BRASS, 'fountainGear', { rot: 0.2 }), gearPlate(doc, x + r * 0.13, y - r * 0.09, r * 0.08, 9, COPPER, 'fountainGearSmall', { rot: 0.1, spokes: 0 }));
  parts.push(plume(doc, rng, x, y, r * 0.09, '#f2f4f6', 0.5, { x: 0.3, y: -1 }));
  return parts.join('');
}

/** Market stall with a striped canopy. */
export function marketStall(doc: SvgDoc, rng: Prng, s: StallSpec): string {
  const w = 120;
  const h = 76;
  const stripes: string[] = [];
  for (let i = 0; i < 6; i++) stripes.push(rect(-w / 2 + (i * w) / 6, -h / 2, w / 6, h, { fill: i % 2 === 0 ? s.color : '#efe2c0' }));
  const scallops: string[] = [];
  for (let i = 0; i < 8; i++) scallops.push(circle(-w / 2 + (i + 0.5) * (w / 8), h / 2, w / 16, { fill: i % 2 === 0 ? s.color : '#efe2c0', stroke: '#1a120a', strokeWidth: 1 }));
  return g({ transform: `translate(${n(s.x)} ${n(s.y)}) rotate(${n(s.rot)})` }, [
    rect(-w / 2 + 12, -h / 2 + 16, w, h, { fill: '#000000', opacity: 0.4 }),
    ...scallops,
    ...stripes,
    line(-w / 2, 0, w / 2, 0, { stroke: '#000000', strokeWidth: 2, opacity: 0.35 }),
    rect(-w / 2, -h / 2, w, h, { fill: 'none', stroke: '#1a120a', strokeWidth: 2.5 }),
    crate(-w / 2 - 22, -10, 30, rng.range(-10, 10)),
    barrel(doc, w / 2 + 20, 4, 15),
    circle(-w / 2 - 22, 24, 8, { fill: '#c9a24a', stroke: '#2a1a0a', strokeWidth: 1.5 }),
  ]);
}

// ---------------------------------------------------------------------------
// Airships and docks
// ---------------------------------------------------------------------------

/** Envelope half-width profile (0..1) at a normalized position u in [-1 (stern), 1 (bow)]. */
function envelopeProfile(u: number): number {
  const base = Math.sqrt(Math.max(0, 1 - u * u));
  const taper = u < 0 ? 0.72 + 0.28 * (1 + u) : 1;
  return base * taper;
}

function envelopePoints(cx: number, cy: number, a: number, b: number, count = 64): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= count; i++) {
    const u = 1 - (2 * i) / count;
    pts.push({ x: cx + u * a, y: cy - b * envelopeProfile(u) });
  }
  for (let i = 1; i < count; i++) {
    const u = -1 + (2 * i) / count;
    pts.push({ x: cx + u * a, y: cy + b * envelopeProfile(u) });
  }
  return pts;
}

function propellerDisc(doc: SvgDoc, x: number, y: number, r: number, rot = 0): string {
  const disc = doc.def('propDisc', radialGradient('propDisc', [[0, '#e8eef2', 0.15], [0.8, '#e8eef2', 0.3], [1, '#e8eef2', 0.05]]));
  const blades: string[] = [];
  for (let i = 0; i < 3; i++) {
    const a = rot + (i / 3) * Math.PI * 2;
    const tip = polar(x, y, r * 0.95, a);
    const side = polar(x, y, r * 0.5, a + 0.35);
    blades.push(path(`M${n(x)} ${n(y)}Q${n(side.x)} ${n(side.y)} ${n(tip.x)} ${n(tip.y)}`, { fill: 'none', stroke: '#6a4a2a', strokeWidth: r * 0.22, strokeLinecap: 'round', opacity: 0.7 }));
  }
  return [circle(x, y, r, { fill: disc, stroke: '#ffffff', strokeWidth: 1, opacity: 0.9 }), ...blades, circle(x, y, r * 0.18, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 1.5 })].join('');
}

/** Airship seen from above: envelope with gores, ribs, rigging net, fins, side engines and painted name. */
export function airshipTop(doc: SvgDoc, rng: Prng, ship: ShipSpec, id: string, opts: { shadowOffset?: Pt; mooringTo?: Pt | null } = {}): string {
  const a = ship.len / 2;
  const b = ship.wid / 2;
  const { cx, cy } = ship;
  const outline = envelopePoints(cx, cy, a, b);
  const d = smoothPath(outline, true, 0.6);
  const clipId = `${id}Clip`;
  doc.def(clipId, tag('clipPath', { id: clipId }, path(d)));
  const fill = doc.def(`${id}Env`, linearGradient(`${id}Env`, [[0, shade(ship.envelope, -0.55)], [0.18, shade(ship.envelope, 0.05)], [0.34, shade(ship.envelope, 0.32)], [0.6, ship.envelope], [0.86, shade(ship.envelope, -0.35)], [1, shade(ship.envelope, -0.6)]]));
  const so = opts.shadowOffset ?? { x: 50, y: 90 };
  const parts: string[] = [];
  // Shadow cast on the clouds or dock below.
  parts.push(path(smoothPath(envelopePoints(cx + so.x, cy + so.y, a * 1.02, b * 0.95), true, 0.6), { fill: '#000000', opacity: 0.28 }));
  // Side engine nacelles and pylons (under the envelope edge).
  const nacelleX = cx - a * 0.18;
  for (const side of [-1, 1]) {
    const ny = cy + side * (b * envelopeProfile(-0.18) + 26);
    parts.push(
      line(nacelleX - 30, cy + side * b * 0.6, nacelleX - 30, ny, { stroke: '#2a1a0a', strokeWidth: 7 }),
      line(nacelleX + 30, cy + side * b * 0.6, nacelleX + 30, ny, { stroke: '#2a1a0a', strokeWidth: 7 }),
      ellipse(nacelleX, ny, 62, 20, { fill: metalLinear(doc, `${id}Nacelle`, COPPER), stroke: '#1a0e06', strokeWidth: 2.5 }),
      rivetLine(nacelleX - 46, ny, nacelleX + 46, ny, 8, 1.6, COPPER.light),
      propellerDisc(doc, nacelleX - 72, ny, 30, rng.range(0, Math.PI)),
    );
  }
  // Tail fins.
  for (const side of [-1, 1]) {
    const fx = cx - a * 0.78;
    parts.push(path(`M${n(fx + 60)} ${n(cy + side * b * 0.52)}L${n(cx - a * 1.02)} ${n(cy + side * b * 1.12)}L${n(cx - a * 1.06)} ${n(cy + side * b * 0.95)}L${n(cx - a * 0.98)} ${n(cy + side * b * 0.36)}Z`, { fill: ship.trim, stroke: '#140a06', strokeWidth: 2.5, strokeLinejoin: 'round' }));
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      parts.push(line(fx + 60 - t * (a * 0.24 + 60), cy + side * (b * 0.52 + t * b * 0.5), cx - a * 0.98 - t * a * 0.06, cy + side * (b * 0.36 + t * b * 0.6), { stroke: shade(ship.trim, -0.45), strokeWidth: 1.5, opacity: 0.8 }));
    }
  }
  // Envelope body.
  parts.push(path(d, { fill, stroke: '#140a06', strokeWidth: 3 }));
  const inner: string[] = [];
  // Gores (longitudinal seams).
  for (const k of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = -0.98 + (1.96 * i) / 40;
      pts.push({ x: cx + u * a, y: cy + k * b * envelopeProfile(u) });
    }
    inner.push(path(smoothPath(pts, false), { fill: 'none', stroke: shade(ship.envelope, -0.4), strokeWidth: 1.6, opacity: 0.55 }));
  }
  // Ribs.
  for (let u = -0.88; u <= 0.9; u += 140 / ship.len) {
    const hw = b * envelopeProfile(u);
    const x = cx + u * a;
    inner.push(path(`M${n(x)} ${n(cy - hw)}Q${n(x + 14)} ${n(cy)} ${n(x)} ${n(cy + hw)}`, { fill: 'none', stroke: shade(ship.envelope, -0.3), strokeWidth: 1.4, opacity: 0.45 }));
  }
  // Rigging net.
  let net = '';
  for (let k = -ship.len; k < ship.len + ship.wid; k += 52) net += `M${n(cx - a + k)} ${n(cy - b)}l${n(ship.wid)} ${n(ship.wid)}M${n(cx - a + k)} ${n(cy + b)}l${n(ship.wid)} ${n(-ship.wid)}`;
  inner.push(path(net, { fill: 'none', stroke: '#2a1a0a', strokeWidth: 1, opacity: 0.3 }));
  // Trim bands.
  for (const u of [0.62, -0.58]) {
    const x = cx + u * a;
    inner.push(rect(x - 14, cy - b, 28, ship.wid, { fill: ship.trim, opacity: 0.92 }), rect(x - 14, cy - b, 4, ship.wid, { fill: '#000000', opacity: 0.25 }));
  }
  // Highlight and painted name.
  inner.push(ellipse(cx + a * 0.05, cy - b * 0.4, a * 0.72, b * 0.13, { fill: '#ffffff', opacity: 0.2 }));
  inner.push(
    text(cx + a * 0.02, cy + b * 0.1, ship.name, {
      fontFamily: SERIF,
      fontSize: Math.min(ship.wid * 0.17, (ship.len * 0.9) / Math.max(6, ship.name.length * 0.62)),
      fontWeight: 'bold',
      fill: shade(ship.trim, 0.1),
      stroke: '#140a06',
      strokeWidth: 1.2,
      textAnchor: 'middle',
      letterSpacing: 6,
      opacity: 0.9,
    }),
  );
  parts.push(g({ clipPath: `url(#${clipId})` }, inner));
  // Nose cap and stern propeller.
  parts.push(circle(cx + a - 8, cy, 15, { fill: metalRadial(doc, `${id}Nose`, BRASS), stroke: '#1a120a', strokeWidth: 2 }), rivetRing(cx + a - 8, cy, 10, 8, 1.3, BRASS.light));
  parts.push(rect(cx - a - 40, cy - 6, 50, 12, { fill: '#2a1a0a', rx: 3 }), propellerDisc(doc, cx - a - 44, cy, 40, rng.range(0, Math.PI)));
  if (opts.mooringTo) parts.push(path(`M${n(cx + a - 4)} ${n(cy)}Q${n((cx + a + opts.mooringTo.x) / 2)} ${n((cy + opts.mooringTo.y) / 2 + 22)} ${n(opts.mooringTo.x)} ${n(opts.mooringTo.y)}`, { fill: 'none', stroke: '#c8b48a', strokeWidth: 4, strokeLinecap: 'round' }), path(`M${n(cx + a - 4)} ${n(cy)}Q${n((cx + a + opts.mooringTo.x) / 2)} ${n((cy + opts.mooringTo.y) / 2 + 22)} ${n(opts.mooringTo.x)} ${n(opts.mooringTo.y)}`, { fill: 'none', stroke: '#5a4020', strokeWidth: 1.4, strokeDasharray: '4 4' }));
  return parts.join('');
}

/** Lattice mooring mast seen from above, with a red beacon. */
export function mooringTower(doc: SvgDoc, x: number, y: number, r: number): string {
  const oct = regularPolygon(x, y, r, 8, Math.PI / 8);
  const lattice: string[] = [];
  for (let i = 0; i < 8; i++) {
    const p = oct[i]!;
    const q = oct[(i + 3) % 8]!;
    lattice.push(line(p.x, p.y, q.x, q.y, { stroke: '#3a3f46', strokeWidth: 2.5, opacity: 0.85 }));
  }
  return [
    softShadow(doc, x + r * 0.5, y + r * 0.7, r * 1.4, r * 1.2, 0.55),
    path(polyPath(oct), { fill: '#1e2226', stroke: '#0a0c0e', strokeWidth: 4 }),
    ...lattice,
    path(polyPath(regularPolygon(x, y, r * 0.86, 8, Math.PI / 8)), { fill: 'none', stroke: IRON.light, strokeWidth: 3 }),
    circle(x, y, r * 0.42, { fill: metalRadial(doc, 'mastCap', IRON), stroke: '#0a0c0e', strokeWidth: 3 }),
    rivetRing(x, y, r * 0.34, 10, 1.8, '#c8ccd2'),
    circle(x, y, r * 0.16, { fill: '#ff4a3a', stroke: '#3a0a06', strokeWidth: 2 }),
    circle(x, y, r * 0.9, { fill: doc.def('beaconGlow', radialGradient('beaconGlow', [[0, '#ff4a3a', 0.45], [1, '#ff4a3a', 0]])) }),
  ].join('');
}

/** Dockside crane with a lattice boom and a hanging cargo net. */
export function dockCrane(doc: SvgDoc, rng: Prng, x: number, y: number, rot: number, boom: number): string {
  const zig: string[] = [];
  for (let k = 50; k < boom - 10; k += 24) zig.push(`M${k} -14L${k + 12} 14L${k + 24} -14`);
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-46 + 14, -46 + 18, 92, 92, { fill: '#000000', opacity: 0.4 }),
    rect(-46, -46, 92, 92, { fill: '#2a2e33', stroke: '#0e1012', strokeWidth: 3 }),
    rect(-46, -46, 92, 92, { fill: hazardTexture(doc), opacity: 0.25 }),
    rivetRing(0, 0, 40, 16, 1.8, '#8a909a'),
    rect(-62, -26, 40, 52, { fill: '#4a4f56', stroke: '#0e1012', strokeWidth: 2.5 }),
    rect(-18, -30, 56, 60, { fill: metalLinear(doc, 'craneCab', { light: '#e0b860', base: '#b8862a', dark: '#5a3e10' }), stroke: '#1a120a', strokeWidth: 2.5, rx: 4 }),
    rect(10, -20, 22, 16, { fill: '#7fb0c4', opacity: 0.8, stroke: '#1a120a', strokeWidth: 1 }),
    line(38, -14, boom, -6, { stroke: '#1a120a', strokeWidth: 7 }),
    line(38, 14, boom, 6, { stroke: '#1a120a', strokeWidth: 7 }),
    line(38, -14, boom, -6, { stroke: '#c9a24a', strokeWidth: 3.5 }),
    line(38, 14, boom, 6, { stroke: '#c9a24a', strokeWidth: 3.5 }),
    path(zig.join(''), { fill: 'none', stroke: '#8a6a2a', strokeWidth: 2 }),
    circle(boom, 0, 10, { fill: IRON.base, stroke: '#0e1012', strokeWidth: 2 }),
    line(boom, 0, boom + 12, 26, { stroke: '#1a1a1a', strokeWidth: 2 }),
    g({ transform: `translate(${boom + 14} 44) rotate(${n(-rot)})` }, [crate(0, 0, 34, rng.range(-15, 15)), crate(20, 14, 26, rng.range(-15, 15)), path('M-24 -22L34 -22L30 34L-20 34Z', { fill: 'none', stroke: '#c8b48a', strokeWidth: 1.5, strokeDasharray: '5 4' })]),
  ]);
}

/** Boarding gangway (runs vertically from y0 to y1). */
export function gangway(doc: SvgDoc, x: number, y0: number, y1: number, w: number): string {
  const planks: string[] = [];
  for (let y = y0; y < y1; y += 14) planks.push(rect(x - w / 2, y, w, 12, { fill: (y / 14) % 2 < 1 ? '#8a6236' : '#7a5530', stroke: '#3a2412', strokeWidth: 1 }));
  return [
    rect(x - w / 2 + 10, y0 + 14, w, y1 - y0, { fill: '#000000', opacity: 0.4 }),
    rect(x - w / 2 - 6, y0, w + 12, y1 - y0, { fill: '#2a1a0e' }),
    ...planks,
    line(x - w / 2 - 3, y0, x - w / 2 - 3, y1, { stroke: '#c8b48a', strokeWidth: 3 }),
    line(x + w / 2 + 3, y0, x + w / 2 + 3, y1, { stroke: '#c8b48a', strokeWidth: 3 }),
    rivetLine(x - w / 2 - 3, y0 + 8, x - w / 2 - 3, y1 - 8, Math.max(2, Math.round((y1 - y0) / 40)), 3, BRASS.base),
    rivetLine(x + w / 2 + 3, y0 + 8, x + w / 2 + 3, y1 - 8, Math.max(2, Math.round((y1 - y0) / 40)), 3, BRASS.base),
    softShadow(doc, x, (y0 + y1) / 2, w * 0.3, (y1 - y0) * 0.4, 0.08),
  ].join('');
}

/** Wooden pier over the clouds: planks, iron edge beams, bollards and rope coils. */
export function skyPier(doc: SvgDoc, rng: Prng, x0: number, x1: number, yc: number, h: number, planks: string): string {
  const y0 = yc - h / 2;
  const parts: string[] = [
    rect(x0 + 24, y0 + 40, x1 - x0, h, { fill: '#000000', opacity: 0.32 }),
    rect(x0, y0 - 8, x1 - x0, h + 16, { fill: '#1e2226' }),
  ];
  // Truss under the deck (visible at the edges).
  for (let x = x0; x < x1; x += 70) parts.push(path(`M${x} ${y0 - 8}L${x + 35} ${y0 + h + 8}L${x + 70} ${y0 - 8}`, { fill: 'none', stroke: '#3a3f46', strokeWidth: 3 }));
  parts.push(rect(x0, y0, x1 - x0, h, { fill: planks, stroke: '#2a1a0e', strokeWidth: 2 }));
  parts.push(rect(x0, y0 - 6, x1 - x0, 8, { fill: metalLinear(doc, 'pierBeam', IRON) }), rect(x0, y0 + h - 2, x1 - x0, 8, { fill: metalLinear(doc, 'pierBeam', IRON) }));
  parts.push(rivetLine(x0 + 10, y0 - 2, x1 - 10, y0 - 2, Math.round((x1 - x0) / 35), 1.6, '#a8aeb8'), rivetLine(x0 + 10, y0 + h + 2, x1 - 10, y0 + h + 2, Math.round((x1 - x0) / 35), 1.6, '#a8aeb8'));
  for (let x = x0 + 60; x < x1 - 30; x += 140) {
    for (const by of [y0 + 10, y0 + h - 10]) parts.push(circle(x + 3, by + 4, 9, { fill: '#000000', opacity: 0.35 }), circle(x, by, 9, { fill: IRON.base, stroke: '#0e1012', strokeWidth: 2 }), circle(x - 2, by - 2, 3, { fill: IRON.light, opacity: 0.7 }));
    if (rng.chance(0.4)) {
      const ry = rng.chance(0.5) ? y0 + 30 : y0 + h - 30;
      parts.push(circle(x + 40, ry, 14, { fill: 'none', stroke: '#c8b48a', strokeWidth: 4 }), circle(x + 40, ry, 8, { fill: 'none', stroke: '#a8946b', strokeWidth: 3 }));
    }
  }
  return parts.join('');
}

/** Sea of clouds seen from above. */
export function cloudSea(doc: SvgDoc, rng: Prng, x: number, y: number, w: number, h: number, count: number): string {
  const sky = doc.def('cloudSky', linearGradient('cloudSky', [[0, '#9fc2d8'], [0.5, '#b8d4e4'], [1, '#8fb4cc']], 0, 0, 1, 1));
  const puff = doc.def('cloudPuff', radialGradient('cloudPuff', [[0, '#ffffff', 0.95], [0.6, '#f4f8fb', 0.75], [1, '#e8f0f6', 0]]));
  const shadowPuff = doc.def('cloudShadow', radialGradient('cloudShadow', [[0, '#5a7a94', 0.45], [1, '#5a7a94', 0]]));
  const parts: string[] = [rect(x, y, w, h, { fill: sky })];
  for (let i = 0; i < count; i++) {
    const cx = x + rng.range(-60, w + 60);
    const cy = y + rng.range(-60, h + 60);
    const r = rng.range(60, 170);
    parts.push(ellipse(cx + r * 0.25, cy + r * 0.35, r * 1.2, r * 0.8, { fill: shadowPuff }));
    const lobes = rng.int(3, 6);
    for (let k = 0; k < lobes; k++) parts.push(ellipse(cx + rng.jitter(r * 0.8), cy + rng.jitter(r * 0.4), r * rng.range(0.45, 0.8), r * rng.range(0.35, 0.6), { fill: puff, opacity: rng.range(0.6, 0.95) }));
  }
  return parts.join('');
}

/** Rocky rim of a floating island along an edge polyline, with hanging rocks on the outer side. */
export function islandRim(doc: SvgDoc, rng: Prng, edge: Pt[], outward: Pt): string {
  const d = polyPath(edge, false);
  const parts: string[] = [
    path(d, { fill: 'none', stroke: '#000000', strokeWidth: 90, opacity: 0.18, strokeLinejoin: 'round', transform: `translate(${n(outward.x * 40)} ${n(outward.y * 40)})` }),
    path(d, { fill: 'none', stroke: '#3a332c', strokeWidth: 34, strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: '#6a6058', strokeWidth: 18, strokeLinejoin: 'round' }),
    path(d, { fill: 'none', stroke: '#8f857a', strokeWidth: 5, strokeLinejoin: 'round', opacity: 0.8, transform: `translate(${n(-outward.x * 6)} ${n(-outward.y * 6)})` }),
  ];
  for (let i = 0; i < edge.length; i += 2) {
    const p = edge[i]!;
    const k = rng.range(20, 60);
    const q = { x: p.x + outward.x * k, y: p.y + outward.y * k };
    parts.push(path(polyPath(blobPoints(rng, q.x, q.y, rng.range(10, 22), rng.range(8, 16), 7, 0.3)), { fill: rng.pick(['#4a4038', '#5a5048', '#3a322c']), stroke: '#1e1a16', strokeWidth: 1.5 }));
    if (rng.chance(0.3)) parts.push(path(`M${n(p.x)} ${n(p.y)}q${n(outward.x * 30 + rng.jitter(10))} ${n(outward.y * 30 + 10)} ${n(outward.x * 50)} ${n(outward.y * 50 + 30)}`, { fill: 'none', stroke: '#3a4a24', strokeWidth: 2.5, opacity: 0.8 }));
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Machinery
// ---------------------------------------------------------------------------

/** Horizontal boiler seen from above, with riveted bands and a glowing firebox at one end. */
export function boiler(doc: SvgDoc, x: number, y: number, w: number, h: number, fireAt: 'left' | 'right', id = 'boilerBody'): string {
  const body = tubeGradient(doc, id, { light: '#e8a070', base: '#a85a2a', dark: '#3a1808' });
  const parts: string[] = [rect(x + 14, y + 18, w, h, { fill: '#000000', opacity: 0.45, rx: h / 2 }), rect(x, y, w, h, { fill: body, stroke: '#140a04', strokeWidth: 3, rx: h / 2 })];
  for (let bx = x + h * 0.6; bx < x + w - h * 0.4; bx += 56) parts.push(rect(bx, y + 2, 8, h - 4, { fill: metalLinear(doc, `${id}Band`, BRASS), stroke: '#2a1a0a', strokeWidth: 1 }), rivetLine(bx + 4, y + 10, bx + 4, y + h - 10, 5, 1.6, BRASS.light));
  const domeX = x + w * 0.5;
  parts.push(circle(domeX + 6, y + h * 0.5 + 8, h * 0.24, { fill: '#000000', opacity: 0.35 }), circle(domeX, y + h * 0.5, h * 0.24, { fill: metalRadial(doc, `${id}Dome`, BRASS), stroke: '#2a1a0a', strokeWidth: 2 }), rivetRing(domeX, y + h * 0.5, h * 0.18, 10, 1.4, BRASS.light));
  const fx = fireAt === 'left' ? x + 6 : x + w - 6;
  const dir = fireAt === 'left' ? -1 : 1;
  parts.push(
    circle(fx + dir * 18, y + h / 2, h * 0.9, { fill: doc.def('fireboxGlow', radialGradient('fireboxGlow', [[0, '#ffb040', 0.6], [0.5, '#ff6a1a', 0.25], [1, '#ff4a0a', 0]])) }),
    rect(fx - 16, y + h * 0.28, 32, h * 0.44, { fill: '#2a1a10', stroke: '#0a0604', strokeWidth: 2, rx: 4 }),
    rect(fx - 11, y + h * 0.34, 22, h * 0.32, { fill: doc.def('fireboxFire', radialGradient('fireboxFire', [[0, '#fff3c0'], [0.4, '#ffb030'], [1, '#d23a0a']])), rx: 3 }),
    pressureGauge(fx - dir * 46, y + 18, 11, -0.3),
  );
  return parts.join('');
}

/** Row of vertical piston cylinders with a crankshaft. */
export function pistonBank(doc: SvgDoc, x: number, y: number, count: number, spacing: number, r: number, axis: 'x' | 'y' = 'x'): string {
  const cyl = metalRadial(doc, 'pistonCyl', IRON);
  const parts: string[] = [];
  const x2 = axis === 'x' ? x + (count - 1) * spacing : x;
  const y2 = axis === 'y' ? y + (count - 1) * spacing : y;
  const ox = axis === 'x' ? 0 : r * 1.4;
  const oy = axis === 'x' ? r * 1.4 : 0;
  parts.push(line(x - (axis === 'x' ? r : 0) + ox, y - (axis === 'y' ? r : 0) + oy, x2 + (axis === 'x' ? r : 0) + ox, y2 + (axis === 'y' ? r : 0) + oy, { stroke: '#0e0c0a', strokeWidth: 16, strokeLinecap: 'round' }), line(x - (axis === 'x' ? r : 0) + ox, y - (axis === 'y' ? r : 0) + oy, x2 + (axis === 'x' ? r : 0) + ox, y2 + (axis === 'y' ? r : 0) + oy, { stroke: '#8a909a', strokeWidth: 8, strokeLinecap: 'round' }));
  for (let i = 0; i < count; i++) {
    const px = axis === 'x' ? x + i * spacing : x;
    const py = axis === 'y' ? y + i * spacing : y;
    parts.push(
      line(px, py, px + ox, py + oy, { stroke: '#c8ccd2', strokeWidth: 7 }),
      circle(px + ox, py + oy, 9, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 2 }),
      circle(px + 6, py + 8, r, { fill: '#000000', opacity: 0.4 }),
      circle(px, py, r, { fill: cyl, stroke: '#0e0c0a', strokeWidth: 3 }),
      rivetRing(px, py, r * 0.82, 10, 1.8, '#c8ccd2'),
      circle(px, py, r * 0.45, { fill: metalRadial(doc, 'pistonHead', BRASS), stroke: '#2a1a0a', strokeWidth: 2 }),
    );
  }
  return parts.join('');
}

/** Bunker filled with coal (rect), iron rim and a shovel. */
export function coalBunker(doc: SvgDoc, rng: Prng, r: RectSpec): string {
  const parts: string[] = [rect(r.x + 8, r.y + 10, r.w, r.h, { fill: '#000000', opacity: 0.4 }), rect(r.x, r.y, r.w, r.h, { fill: '#0e0c0b', stroke: '#2a2e33', strokeWidth: 6 })];
  parts.push(coalScatter(rng, r.x + 10, r.y + 10, r.w - 20, r.h - 20, Math.round((r.w * r.h) / 260)));
  parts.push(rivetLine(r.x + 6, r.y + 3, r.x + r.w - 6, r.y + 3, Math.max(2, Math.round(r.w / 28)), 1.8, '#8a909a'), rivetLine(r.x + 6, r.y + r.h - 3, r.x + r.w - 6, r.y + r.h - 3, Math.max(2, Math.round(r.w / 28)), 1.8, '#8a909a'));
  const sx = r.x + r.w * 0.7;
  const sy = r.y + r.h * 0.4;
  parts.push(line(sx, sy, sx + 60, sy + 34, { stroke: '#6a4a2a', strokeWidth: 5, strokeLinecap: 'round' }), path(`M${n(sx - 8)} ${n(sy - 14)}L${n(sx + 12)} ${n(sy - 2)}L${n(sx + 2)} ${n(sy + 14)}L${n(sx - 16)} ${n(sy + 2)}Z`, { fill: IRON.base, stroke: '#0e0c0a', strokeWidth: 1.5 }));
  return parts.join('');
}

export function coalScatter(rng: Prng, x: number, y: number, w: number, h: number, count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const cx = x + rng.range(0, w);
    const cy = y + rng.range(0, h);
    const r = rng.range(4, 10);
    parts.push(path(polyPath(blobPoints(rng, cx, cy, r, r * 0.8, 5, 0.35)), { fill: rng.pick(['#1a1816', '#24211e', '#121110', '#2e2a26']), stroke: '#060505', strokeWidth: 0.8 }));
    if (rng.chance(0.3)) parts.push(circle(cx - r * 0.3, cy - r * 0.3, r * 0.25, { fill: '#6a6a72', opacity: 0.5 }));
  }
  return parts.join('');
}

/** Catwalk: steel grating with brass handrails on the long sides. */
export function catwalk(doc: SvgDoc, r: RectSpec, opts: { rails?: boolean; broken?: [number, number] | null } = {}): string {
  const horizontal = r.w >= r.h;
  const grate = gratingTexture(doc, 'catwalkGrate', '#5c616a');
  const parts: string[] = [rect(r.x + 12, r.y + 16, r.w, r.h, { fill: '#000000', opacity: 0.4 }), rect(r.x, r.y, r.w, r.h, { fill: grate, stroke: '#0e0c0a', strokeWidth: 3 })];
  if (opts.rails !== false) {
    if (horizontal) parts.push(line(r.x, r.y + 3, r.x + r.w, r.y + 3, { stroke: BRASS.base, strokeWidth: 4 }), line(r.x, r.y + r.h - 3, r.x + r.w, r.y + r.h - 3, { stroke: BRASS.base, strokeWidth: 4 }), rivetLine(r.x + 6, r.y + 3, r.x + r.w - 6, r.y + 3, Math.max(2, Math.round(r.w / 35)), 2.6, BRASS.dark), rivetLine(r.x + 6, r.y + r.h - 3, r.x + r.w - 6, r.y + r.h - 3, Math.max(2, Math.round(r.w / 35)), 2.6, BRASS.dark));
    else parts.push(line(r.x + 3, r.y, r.x + 3, r.y + r.h, { stroke: BRASS.base, strokeWidth: 4 }), line(r.x + r.w - 3, r.y, r.x + r.w - 3, r.y + r.h, { stroke: BRASS.base, strokeWidth: 4 }), rivetLine(r.x + 3, r.y + 6, r.x + 3, r.y + r.h - 6, Math.max(2, Math.round(r.h / 35)), 2.6, BRASS.dark), rivetLine(r.x + r.w - 3, r.y + 6, r.x + r.w - 3, r.y + r.h - 6, Math.max(2, Math.round(r.h / 35)), 2.6, BRASS.dark));
  }
  if (opts.broken) {
    const [a, b] = opts.broken;
    parts.push(horizontal ? rect(r.x + a, r.y - 2, b - a, r.h + 4, { fill: '#050404' }) : rect(r.x - 2, r.y + a, r.w + 4, b - a, { fill: '#050404' }));
  }
  return parts.join('');
}

/** Conveyor belt (horizontal) with rollers, cargo and an optional broken section. */
export function conveyor(doc: SvgDoc, rng: Prng, x: number, y: number, len: number, w: number, gap: [number, number] | null): string {
  const parts: string[] = [rect(x + 10, y - w / 2 + 14, len, w, { fill: '#000000', opacity: 0.4 }), rect(x - 8, y - w / 2 - 8, len + 16, w + 16, { fill: '#2a2e33', stroke: '#0e1012', strokeWidth: 2.5, rx: 6 })];
  parts.push(rect(x, y - w / 2, len, w, { fill: '#1c1a18' }));
  for (let k = x + 8; k < x + len - 4; k += 16) parts.push(line(k, y - w / 2 + 2, k, y + w / 2 - 2, { stroke: '#3a3632', strokeWidth: 3 }));
  parts.push(rect(x, y - w / 2, len, 5, { fill: hazardTexture(doc) }), rect(x, y + w / 2 - 5, len, 5, { fill: hazardTexture(doc) }));
  for (const ex of [x, x + len]) parts.push(circle(ex, y, w * 0.5, { fill: metalRadial(doc, 'convDrum', IRON), stroke: '#0e1012', strokeWidth: 2.5 }), circle(ex, y, w * 0.14, { fill: BRASS.base }));
  for (let k = x + 60; k < x + len - 50; k += rng.range(110, 190)) {
    if (gap && k > x + gap[0] - 50 && k < x + gap[1] + 20) continue;
    parts.push(crate(k, y + rng.jitter(4), w * 0.62, rng.range(-12, 12)));
  }
  if (gap) {
    const gx0 = x + gap[0];
    const gx1 = x + gap[1];
    parts.push(rect(gx0, y - w / 2 - 9, gx1 - gx0, w + 18, { fill: '#060505' }), path(`M${n(gx0)} ${n(y - w / 2)}l12 18l-8 14l14 12`, { fill: 'none', stroke: '#1c1a18', strokeWidth: 6 }), path(`M${n(gx1)} ${n(y + w / 2)}l-14 -16l10 -12l-12 -14`, { fill: 'none', stroke: '#1c1a18', strokeWidth: 6 }));
  }
  return parts.join('');
}

/** Heavy hydraulic press (top view). */
export function hydraulicPress(doc: SvgDoc, r: RectSpec): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [
    rect(r.x + 14, r.y + 18, r.w, r.h, { fill: '#000000', opacity: 0.45 }),
    rect(r.x, r.y, r.w, r.h, { fill: '#3a3f46', stroke: '#0e1012', strokeWidth: 3, rx: 4 }),
    rect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, { fill: hazardTexture(doc), opacity: 0.55 }),
    rect(r.x + 16, r.y + 16, r.w - 32, r.h - 32, { fill: metalLinear(doc, 'pressPlate', IRON), stroke: '#0e1012', strokeWidth: 2 }),
    circle(cx, cy, Math.min(r.w, r.h) * 0.28, { fill: metalRadial(doc, 'pressRam', { light: '#e8eef2', base: '#8a909a', dark: '#2a2e33' }), stroke: '#0e1012', strokeWidth: 3 }),
    rivetRing(cx, cy, Math.min(r.w, r.h) * 0.22, 8, 2, '#c8ccd2'),
    ...[
      [r.x + 10, r.y + 10],
      [r.x + r.w - 10, r.y + 10],
      [r.x + 10, r.y + r.h - 10],
      [r.x + r.w - 10, r.y + r.h - 10],
    ].map(([px, py]) => circle(px!, py!, 9, { fill: IRON.dark, stroke: '#000000', strokeWidth: 2 })),
  ].join('');
}

/** Glowing toxic puddle. */
export function toxicPuddle(doc: SvgDoc, rng: Prng, x: number, y: number, rx: number, ry: number): string {
  const goo = doc.def('toxicGoo', radialGradient('toxicGoo', [[0, '#d8ff7a'], [0.45, '#7dff3a'], [0.85, '#2a8a1a'], [1, '#1a4a0e']]));
  const parts: string[] = [ellipse(x, y, rx * 1.8, ry * 1.8, { fill: doc.def('toxicGlow', radialGradient('toxicGlow', [[0, '#7dff6a', 0.4], [1, '#7dff6a', 0]])) })];
  parts.push(path(smoothPath(blobPoints(rng, x, y, rx * 1.1, ry * 1.1, 11, 0.16)), { fill: '#1e2a10', opacity: 0.85 }));
  parts.push(path(smoothPath(blobPoints(rng, x, y, rx, ry, 11, 0.18)), { fill: goo, opacity: 0.92 }));
  for (let i = 0; i < 7; i++) parts.push(circle(x + rng.jitter(rx * 0.6), y + rng.jitter(ry * 0.6), rng.range(2.5, 7), { fill: 'none', stroke: '#eaffb0', strokeWidth: 1.4, opacity: 0.75 }));
  return parts.join('');
}

/** Pile of scrap metal: plates, pipes, gears and bolts. */
export function scrapHeap(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const parts: string[] = [softShadow(doc, x + r * 0.2, y + r * 0.3, r * 1.25, r * 1.05, 0.55)];
  parts.push(path(smoothPath(blobPoints(rng, x, y, r, r * 0.8, 10, 0.2)), { fill: '#2a2622' }));
  for (let i = 0; i < Math.round(r / 4); i++) {
    const px = x + rng.jitter(r * 0.75);
    const py = y + rng.jitter(r * 0.6);
    const kind = rng.int(0, 3);
    const rot = rng.range(0, 180);
    if (kind === 0) parts.push(rect(px - 14, py - 8, 28, 16, { fill: rng.pick(['#5c616a', '#6a5040', '#4a4f56', '#7a4a2a']), stroke: '#0e0c0a', strokeWidth: 1.2, transform: `rotate(${n(rot)} ${n(px)} ${n(py)})` }));
    else if (kind === 1) parts.push(line(px - 18, py, px + 18, py, { stroke: rng.pick(['#8a909a', '#b8673a']), strokeWidth: 6, strokeLinecap: 'round', transform: `rotate(${n(rot)} ${n(px)} ${n(py)})` }));
    else if (kind === 2) parts.push(path(gearWithHoleD(px, py, rng.range(8, 14), 3, rng.int(8, 12), 3, rot), { fill: rng.pick([BRASS.base, COPPER.base, IRON.base]), fillRule: 'evenodd', stroke: '#0e0c0a', strokeWidth: 1 }));
    else parts.push(circle(px, py, rng.range(3, 5), { fill: '#8a909a', stroke: '#0e0c0a', strokeWidth: 1 }));
  }
  return parts.join('');
}

/** Blast furnace: brick ring, glowing core and radial tuyère pipes. */
export function blastFurnace(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const bricks = brickTexture(doc, rng, 'furnaceBricks', '#7a3424', '#2a120a');
  const core = doc.def('furnaceCore', radialGradient('furnaceCore', [[0, '#fff6c8'], [0.3, '#ffc23a'], [0.7, '#ff5a10'], [1, '#7a1a05']]));
  const parts: string[] = [circle(x, y, r * 2.4, { fill: doc.def('furnaceHalo', radialGradient('furnaceHalo', [[0, '#ff7a2a', 0.5], [1, '#ff5a10', 0]])) })];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const p1 = polar(x, y, r * 0.95, a);
    const p2 = polar(x, y, r * 1.45, a);
    parts.push(pipeRun([p1, p2], 16, COPPER, 999));
  }
  parts.push(softShadow(doc, x + r * 0.2, y + r * 0.25, r * 1.2, r * 1.1, 0.6), circle(x, y, r, { fill: bricks, stroke: '#1a0a04', strokeWidth: 5 }), circle(x, y, r * 0.86, { fill: 'none', stroke: metalLinear(doc, 'furnaceBand', IRON), strokeWidth: 10 }), rivetRing(x, y, r * 0.86, 24, 2.4, '#c8ccd2'));
  parts.push(circle(x, y, r * 0.62, { fill: '#1a0a04' }), circle(x, y, r * 0.55, { fill: core }));
  for (let i = 0; i < 8; i++) parts.push(circle(x + rng.jitter(r * 0.35), y + rng.jitter(r * 0.35), rng.range(4, 10), { fill: '#7a1a05', opacity: 0.6, stroke: '#ffb030', strokeWidth: 1 }));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Walls and railings
// ---------------------------------------------------------------------------

export interface WallLook {
  outer: string;
  inner: string;
  light: string;
  width: number;
  door: string;
  rivets: boolean;
}

export const IRON_WALL: WallLook = { outer: '#050505', inner: '#4a4f56', light: '#9aa0a8', width: 22, door: '#6a4a2a', rivets: true };
export const BRICK_WALL: WallLook = { outer: '#120806', inner: '#7a3424', light: '#b8674a', width: 22, door: '#6a4422', rivets: false };
export const PANEL_WALL: WallLook = { outer: '#140c06', inner: '#6a4422', light: '#c9a24a', width: 18, door: '#8a5a2a', rivets: true };

function wallPath(points: number[]): string {
  let d = '';
  for (let i = 0; i + 1 < points.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${n(points[i]!)} ${n(points[i + 1]!)}`;
  return d;
}

/** Paints walls (solid), doors (planks with hinges) and windows (glass) exactly where the wall data is. */
export function steamWalls(walls: WallSpec[], look: WallLook): string {
  const parts: string[] = [];
  const solid = walls.filter((w) => w.kind === 'wall');
  for (const w of solid) parts.push(path(wallPath(w.points), { fill: 'none', stroke: '#000000', strokeWidth: look.width + 14, opacity: 0.3, strokeLinejoin: 'round', transform: 'translate(6 8)' }));
  for (const w of solid) parts.push(path(wallPath(w.points), { fill: 'none', stroke: look.outer, strokeWidth: look.width + 8, strokeLinecap: 'square', strokeLinejoin: 'round' }));
  for (const w of solid) parts.push(path(wallPath(w.points), { fill: 'none', stroke: look.inner, strokeWidth: look.width, strokeLinecap: 'square', strokeLinejoin: 'round' }));
  for (const w of solid) parts.push(path(wallPath(w.points), { fill: 'none', stroke: look.light, strokeWidth: look.width * 0.18, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.5 }));
  if (look.rivets) {
    for (const w of solid) {
      for (let i = 0; i + 3 < w.points.length; i += 2) {
        const x1 = w.points[i]!;
        const y1 = w.points[i + 1]!;
        const x2 = w.points[i + 2]!;
        const y2 = w.points[i + 3]!;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 30) continue;
        parts.push(rivetLine(x1, y1, x2, y2, Math.max(2, Math.round(len / 35)), 2, look.light));
      }
    }
  }
  for (const w of walls) {
    const d = wallPath(w.points);
    if (w.kind === 'door') {
      parts.push(
        path(d, { fill: 'none', stroke: look.outer, strokeWidth: look.width * 0.8, strokeLinecap: 'butt' }),
        path(d, { fill: 'none', stroke: look.door, strokeWidth: look.width * 0.52, strokeLinecap: 'butt' }),
        path(d, { fill: 'none', stroke: shade(look.door, -0.5), strokeWidth: look.width * 0.52, strokeDasharray: '2 12', strokeLinecap: 'butt' }),
      );
      const [x1, y1] = [w.points[0]!, w.points[1]!];
      const [x2, y2] = [w.points[w.points.length - 2]!, w.points[w.points.length - 1]!];
      parts.push(circle(x1, y1, 5.5, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 1.5 }), circle(x2, y2, 5.5, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 1.5 }));
    } else if (w.kind === 'window') {
      parts.push(path(d, { fill: 'none', stroke: look.outer, strokeWidth: look.width * 0.7, strokeLinecap: 'butt' }), path(d, { fill: 'none', stroke: '#a8d0e6', strokeWidth: look.width * 0.3, strokeLinecap: 'butt', opacity: 0.9 }));
    }
  }
  return parts.join('');
}

/** Brass deck railing with posts. */
export function brassRailing(points: Pt[], postEvery = 35): string {
  const d = polyPath(points, false);
  const parts: string[] = [
    path(d, { fill: 'none', stroke: '#000000', strokeWidth: 10, opacity: 0.3, strokeLinejoin: 'round', transform: 'translate(4 6)' }),
    path(d, { fill: 'none', stroke: '#2a1a0a', strokeWidth: 9, strokeLinejoin: 'round', strokeLinecap: 'round' }),
    path(d, { fill: 'none', stroke: BRASS.base, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' }),
    path(d, { fill: 'none', stroke: BRASS.light, strokeWidth: 1.6, strokeLinejoin: 'round', opacity: 0.8 }),
  ];
  for (const { p } of resample(points, postEvery, false)) parts.push(circle(p.x, p.y, 4.2, { fill: BRASS.dark, stroke: '#1a120a', strokeWidth: 1.2 }));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Workshop furniture
// ---------------------------------------------------------------------------

/** Wooden workbench covered with tools, gears and springs. */
export function workbench(doc: SvgDoc, rng: Prng, r: RectSpec): string {
  const wood = doc.def('benchWood', linearGradient('benchWood', [[0, '#a4723f'], [1, '#6a4220']]));
  const parts: string[] = [rect(r.x + 10, r.y + 12, r.w, r.h, { fill: '#000000', opacity: 0.4 }), rect(r.x, r.y, r.w, r.h, { fill: wood, stroke: '#2a1a0e', strokeWidth: 3, rx: 3 })];
  for (let k = 1; k < 4; k++) parts.push(line(r.x + 4, r.y + (k * r.h) / 4, r.x + r.w - 4, r.y + (k * r.h) / 4, { stroke: '#4a2e18', strokeWidth: 1, opacity: 0.5 }));
  const items = Math.round(r.w / 45);
  for (let i = 0; i < items; i++) {
    const ix = r.x + 20 + rng.range(0, r.w - 40);
    const iy = r.y + 14 + rng.range(0, r.h - 28);
    const kind = i % 5;
    if (kind === 0) parts.push(gearPlate(doc, ix, iy, rng.range(9, 14), rng.int(8, 12), rng.chance(0.5) ? BRASS : COPPER, 'benchGear', { spokes: 0, rot: rng.range(0, 1) }));
    else if (kind === 1) parts.push(g({ transform: `translate(${n(ix)} ${n(iy)}) rotate(${n(rng.range(0, 180))})` }, [rect(-16, -3, 28, 6, { fill: '#8a909a', stroke: '#1a1a1a', strokeWidth: 1, rx: 2 }), path('M12 -7A7 7 0 1 1 12 7L16 3L16 -3Z', { fill: '#8a909a', stroke: '#1a1a1a', strokeWidth: 1 })]));
    else if (kind === 2) parts.push(path(`M${n(ix - 12)} ${n(iy)}${Array.from({ length: 6 }, (_, k) => `q2 ${k % 2 === 0 ? -6 : 6} 4 0`).join('')}`, { fill: 'none', stroke: '#c8ccd2', strokeWidth: 1.6 }));
    else if (kind === 3) parts.push(rect(ix - 10, iy - 7, 20, 14, { fill: '#e8dcc0', stroke: '#8a7a5a', strokeWidth: 1, transform: `rotate(${n(rng.range(-20, 20))} ${n(ix)} ${n(iy)})` }), line(ix - 6, iy - 2, ix + 6, iy - 2, { stroke: '#3a5a9a', strokeWidth: 1 }));
    else for (let k = 0; k < 5; k++) parts.push(circle(ix + rng.jitter(8), iy + rng.jitter(5), 1.6, { fill: '#c8ccd2' }));
  }
  // Bench vise.
  parts.push(rect(r.x + r.w - 46, r.y - 6, 30, 22, { fill: IRON.base, stroke: '#0e0c0a', strokeWidth: 2 }), line(r.x + r.w - 31, r.y - 14, r.x + r.w - 31, r.y - 4, { stroke: '#c8ccd2', strokeWidth: 3 }));
  return parts.join('');
}

/** Tesla coil with copper windings, toroid and crackling arcs. */
export function teslaCoil(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  const arcs: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    let d = `M${n(x + Math.cos(a) * r * 0.8)} ${n(y + Math.sin(a) * r * 0.8)}`;
    let px = x + Math.cos(a) * r * 0.8;
    let py = y + Math.sin(a) * r * 0.8;
    for (let k = 1; k <= 4; k++) {
      px += Math.cos(a) * r * 0.35 + rng.jitter(r * 0.25);
      py += Math.sin(a) * r * 0.35 + rng.jitter(r * 0.25);
      d += `L${n(px)} ${n(py)}`;
    }
    arcs.push(path(d, { fill: 'none', stroke: '#e0f6ff', strokeWidth: 2, strokeLinejoin: 'bevel', opacity: 0.9 }), path(d, { fill: 'none', stroke: '#6ac8ff', strokeWidth: 6, strokeLinejoin: 'bevel', opacity: 0.3 }));
  }
  return [
    circle(x, y, r * 3, { fill: doc.def('teslaGlow', radialGradient('teslaGlow', [[0, '#8ad8ff', 0.5], [1, '#8ad8ff', 0]])) }),
    softShadow(doc, x + 8, y + 10, r * 1.2, r * 1.1, 0.5),
    path(polyPath(regularPolygon(x, y, r * 1.05, 8, Math.PI / 8)), { fill: '#2a2622', stroke: '#0e0c0a', strokeWidth: 3 }),
    ...[0.9, 0.78, 0.66, 0.54].map((k, i) => circle(x, y, r * k, { fill: 'none', stroke: i % 2 === 0 ? COPPER.base : COPPER.light, strokeWidth: r * 0.08 })),
    circle(x, y, r * 0.42, { fill: metalRadial(doc, 'teslaTorus', { light: '#ffffff', base: '#b8bec8', dark: '#4a4f56' }), stroke: '#1a1a1a', strokeWidth: 2 }),
    circle(x, y, r * 0.16, { fill: '#e0f6ff' }),
    ...arcs,
  ].join('');
}

/** Workshop forge / furnace against a wall (rect), mouth facing +x. */
export function forgeHearth(doc: SvgDoc, rng: Prng, r: RectSpec): string {
  const bricks = brickTexture(doc, rng, 'forgeBricks', '#7a3424', '#2a120a');
  return [
    rect(r.x + 10, r.y + 12, r.w, r.h, { fill: '#000000', opacity: 0.45 }),
    rect(r.x, r.y, r.w, r.h, { fill: bricks, stroke: '#1a0a04', strokeWidth: 3 }),
    rect(r.x + r.w * 0.3, r.y + r.h * 0.22, r.w * 0.6, r.h * 0.56, { fill: '#140804', rx: 10 }),
    rect(r.x + r.w * 0.36, r.y + r.h * 0.3, r.w * 0.5, r.h * 0.4, { fill: doc.def('forgeFire', radialGradient('forgeFire', [[0, '#fff3c0'], [0.4, '#ffb030'], [1, '#c2300f']])), rx: 8 }),
    coalScatter(rng, r.x + r.w * 0.4, r.y + r.h * 0.35, r.w * 0.4, r.h * 0.3, 10),
    circle(r.x + r.w, r.y + r.h / 2, r.h * 0.9, { fill: doc.def('forgeHalo', radialGradient('forgeHalo', [[0, '#ff8a2a', 0.45], [1, '#ff8a2a', 0]])) }),
  ].join('');
}

export function anvil(x: number, y: number, rot = 0): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    path('M-40 -16H30Q52 -14 58 0Q52 14 30 16H-40Z', { fill: '#000000', opacity: 0.4, transform: 'translate(6 8)' }),
    rect(-30, -24, 44, 48, { fill: '#2a2e33', stroke: '#0e1012', strokeWidth: 2, rx: 4 }),
    path('M-40 -16H30Q52 -14 58 0Q52 14 30 16H-40Z', { fill: '#5c616a', stroke: '#0e1012', strokeWidth: 2.5 }),
    rect(-34, -10, 56, 8, { fill: '#a8aeb8', opacity: 0.6, rx: 2 }),
  ]);
}

/** Drafting table with blueprints (white line drawings on blue sheets). */
export function blueprintTable(doc: SvgDoc, r: RectSpec): string {
  const wood = doc.def('draftWood', linearGradient('draftWood', [[0, '#8a6236'], [1, '#5a3a1a']]));
  const sheets: string[] = [];
  const sheet = (sx: number, sy: number, w: number, h: number, rot: number, drawing: 'ship' | 'gear' | 'arm'): void => {
    const lines: string[] = [rect(-w / 2, -h / 2, w, h, { fill: '#24508a', stroke: '#e8f0ff', strokeWidth: 1, opacity: 0.97 }), rect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 0.8, opacity: 0.6 })];
    for (let gx = -w / 2 + 14; gx < w / 2 - 6; gx += 14) lines.push(line(gx, -h / 2 + 6, gx, h / 2 - 6, { stroke: '#e8f0ff', strokeWidth: 0.4, opacity: 0.25 }));
    if (drawing === 'ship') lines.push(ellipse(0, -h * 0.08, w * 0.36, h * 0.18, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 1.4 }), path(`M${n(-w * 0.2)} ${n(h * 0.1)}H${n(w * 0.2)}L${n(w * 0.14)} ${n(h * 0.24)}H${n(-w * 0.14)}Z`, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 1.4 }), line(-w * 0.36, -h * 0.08, w * 0.36, -h * 0.08, { stroke: '#e8f0ff', strokeWidth: 0.8, strokeDasharray: '4 3' }));
    else if (drawing === 'gear') lines.push(path(gearD(0, 0, Math.min(w, h) * 0.3, 5, 14), { fill: 'none', stroke: '#e8f0ff', strokeWidth: 1.4 }), circle(0, 0, Math.min(w, h) * 0.1, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 1.2 }), line(-w * 0.4, 0, w * 0.4, 0, { stroke: '#e8f0ff', strokeWidth: 0.8, strokeDasharray: '6 3' }));
    else lines.push(path(`M${n(-w * 0.3)} ${n(-h * 0.2)}L${n(-w * 0.05)} ${n(-h * 0.05)}L${n(w * 0.22)} ${n(-h * 0.18)}`, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 3 }), circle(-w * 0.05, -h * 0.05, 6, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 1.4 }), path(`M${n(w * 0.22)} ${n(-h * 0.18)}l8 -6M${n(w * 0.22)} ${n(-h * 0.18)}l10 2`, { fill: 'none', stroke: '#e8f0ff', strokeWidth: 1.4 }));
    sheets.push(g({ transform: `translate(${n(sx)} ${n(sy)}) rotate(${n(rot)})` }, lines));
  };
  sheet(r.x + r.w * 0.3, r.y + r.h * 0.45, r.w * 0.42, r.h * 0.66, -6, 'ship');
  sheet(r.x + r.w * 0.68, r.y + r.h * 0.4, r.w * 0.34, r.h * 0.56, 8, 'gear');
  sheet(r.x + r.w * 0.6, r.y + r.h * 0.7, r.w * 0.3, r.h * 0.42, -14, 'arm');
  return [
    rect(r.x + 12, r.y + 14, r.w, r.h, { fill: '#000000', opacity: 0.4 }),
    rect(r.x, r.y, r.w, r.h, { fill: wood, stroke: '#2a1a0e', strokeWidth: 3, rx: 4 }),
    ...sheets,
    circle(r.x + 18, r.y + 18, 7, { fill: BRASS.base, stroke: '#2a1a0a', strokeWidth: 1.5 }),
    circle(r.x + r.w - 18, r.y + r.h - 18, 7, { fill: BRASS.base, stroke: '#2a1a0a', strokeWidth: 1.5 }),
    line(r.x + r.w * 0.12, r.y + r.h * 0.85, r.x + r.w * 0.34, r.y + r.h * 0.72, { stroke: '#c8ccd2', strokeWidth: 2 }),
    line(r.x + r.w * 0.12, r.y + r.h * 0.85, r.x + r.w * 0.2, r.y + r.h * 0.6, { stroke: '#c8ccd2', strokeWidth: 2 }),
    wallLamp(doc, r.x + r.w - 26, r.y + 26),
  ].join('');
}

/** Half-built automaton lying on an assembly table. */
export function automatonOnTable(doc: SvgDoc, rng: Prng, r: RectSpec): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const brass = metalRadial(doc, 'autoTorso', BRASS);
  return [
    rect(r.x + 12, r.y + 14, r.w, r.h, { fill: '#000000', opacity: 0.4 }),
    rect(r.x, r.y, r.w, r.h, { fill: '#4a4f56', stroke: '#0e1012', strokeWidth: 3, rx: 4 }),
    rect(r.x + 8, r.y + 8, r.w - 16, r.h - 16, { fill: '#5c616a', stroke: '#2a2e33', strokeWidth: 1.5 }),
    // Torso, head and limbs.
    ellipse(cx - 10, cy, r.w * 0.2, r.h * 0.26, { fill: brass, stroke: '#2a1a0a', strokeWidth: 2.5 }),
    gearPlate(doc, cx - 10, cy, r.h * 0.11, 10, COPPER, 'autoChestGear', { spokes: 4 }),
    circle(cx + r.w * 0.24, cy, r.h * 0.13, { fill: brass, stroke: '#2a1a0a', strokeWidth: 2.5 }),
    circle(cx + r.w * 0.27, cy - r.h * 0.04, r.h * 0.04, { fill: '#8ad8ff', stroke: '#1a1a1a', strokeWidth: 1 }),
    line(cx - r.w * 0.05, cy - r.h * 0.24, cx - r.w * 0.05, cy - r.h * 0.42, { stroke: BRASS.base, strokeWidth: 9, strokeLinecap: 'round' }),
    circle(cx - r.w * 0.05, cy - r.h * 0.43, 7, { fill: COPPER.base, stroke: '#2a1a0a', strokeWidth: 1.5 }),
    line(cx - r.w * 0.28, cy - r.h * 0.12, cx - r.w * 0.4, cy - r.h * 0.18, { stroke: BRASS.base, strokeWidth: 10, strokeLinecap: 'round' }),
    line(cx - r.w * 0.28, cy + r.h * 0.12, cx - r.w * 0.4, cy + r.h * 0.2, { stroke: '#8a909a', strokeWidth: 10, strokeLinecap: 'round' }),
    // Detached arm and loose wiring.
    g({ transform: `translate(${n(cx + 6)} ${n(cy + r.h * 0.34)}) rotate(${n(rng.range(-10, 10))})` }, [line(-30, 0, 30, 0, { stroke: BRASS.base, strokeWidth: 10, strokeLinecap: 'round' }), circle(30, 0, 8, { fill: COPPER.base, stroke: '#2a1a0a', strokeWidth: 1.5 })]),
    path(`M${n(cx - 4)} ${n(cy + 8)}q20 30 50 22t40 18`, { fill: 'none', stroke: '#c0392b', strokeWidth: 2 }),
    path(`M${n(cx - 4)} ${n(cy + 2)}q24 36 58 30`, { fill: 'none', stroke: '#2a6ac0', strokeWidth: 2 }),
  ].join('');
}

/** Shelving unit with jars, coils and spare parts. */
export function partsShelf(rng: Prng, r: RectSpec): string {
  const vertical = r.h > r.w;
  const parts: string[] = [rect(r.x + 6, r.y + 8, r.w, r.h, { fill: '#000000', opacity: 0.4 }), rect(r.x, r.y, r.w, r.h, { fill: '#3e2614', stroke: '#1e120a', strokeWidth: 2 })];
  const len = vertical ? r.h : r.w;
  for (let k = 8; k < len - 10; k += rng.range(14, 24)) {
    const px = vertical ? r.x + r.w / 2 : r.x + k;
    const py = vertical ? r.y + k : r.y + r.h / 2;
    const kind = rng.int(0, 3);
    if (kind === 0) parts.push(circle(px, py, 6.5, { fill: rng.pick(['#5a9a3a', '#c0392b', '#e9c063', '#3a6ac0', '#8e44ad']), stroke: '#111111', strokeWidth: 1, opacity: 0.9 }), circle(px - 2, py - 2, 1.8, { fill: '#ffffff', opacity: 0.6 }));
    else if (kind === 1) parts.push(circle(px, py, 7, { fill: 'none', stroke: COPPER.base, strokeWidth: 3 }));
    else if (kind === 2) parts.push(path(gearWithHoleD(px, py, 7, 2.2, 9, 2), { fill: BRASS.base, fillRule: 'evenodd', stroke: '#1a120a', strokeWidth: 0.8 }));
    else parts.push(rect(px - 6, py - 5, 12, 10, { fill: '#7a5a3a', stroke: '#1e120a', strokeWidth: 1 }));
  }
  return parts.join('');
}

export function ironSafe(doc: SvgDoc, x: number, y: number): string {
  return [
    rect(x - 32 + 8, y - 32 + 10, 64, 64, { fill: '#000000', opacity: 0.45 }),
    rect(x - 32, y - 32, 64, 64, { fill: metalLinear(doc, 'safeIron', { light: '#6a707a', base: '#3a3f46', dark: '#14161a' }), stroke: '#050505', strokeWidth: 3, rx: 4 }),
    rect(x - 26, y - 26, 52, 52, { fill: 'none', stroke: '#8a909a', strokeWidth: 1.2, rx: 3 }),
    circle(x, y, 12, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 2 }),
    ...Array.from({ length: 8 }, (_, i) => {
      const p = polar(x, y, 9, (i / 8) * Math.PI * 2);
      return circle(p.x, p.y, 1, { fill: '#1a120a' });
    }),
    rect(x + 16, y - 4, 10, 8, { fill: BRASS.dark }),
  ].join('');
}
