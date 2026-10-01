import type { Prng } from './rng';

/** Small string-based SVG toolkit used by the procedural maps, portraits and icons. */

export interface Pt {
  x: number;
  y: number;
}

export type AttrValue = string | number | null | undefined | false;
export type Attrs = Record<string, AttrValue>;

/** Compact number formatting (1 decimal) to keep files light. */
export function n(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attrName(key: string): string {
  // camelCase keys become kebab-case SVG attributes (strokeWidth -> stroke-width), except viewBox & co.
  if (key === 'viewBox' || key === 'gradientUnits' || key === 'patternUnits' || key === 'gradientTransform' || key === 'patternTransform' || key === 'stdDeviation' || key === 'preserveAspectRatio' || key === 'clipPathUnits' || key === 'textLength' || key === 'lengthAdjust' || key === 'markerWidth' || key === 'markerHeight') return key;
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function attrs(a: Attrs): string {
  let out = '';
  for (const [key, value] of Object.entries(a)) {
    if (value === null || value === undefined || value === false) continue;
    const text = typeof value === 'number' ? n(value) : esc(value);
    out += ` ${attrName(key)}="${text}"`;
  }
  return out;
}

export function tag(name: string, a: Attrs = {}, children?: string | string[]): string {
  const inner = Array.isArray(children) ? children.join('') : children;
  if (inner === undefined || inner === '') return `<${name}${attrs(a)}/>`;
  return `<${name}${attrs(a)}>${inner}</${name}>`;
}

export function g(a: Attrs, children: string | string[]): string {
  return tag('g', a, children);
}

export function rect(x: number, y: number, w: number, h: number, a: Attrs = {}): string {
  return tag('rect', { x, y, width: w, height: h, ...a });
}

export function circle(cx: number, cy: number, r: number, a: Attrs = {}): string {
  return tag('circle', { cx, cy, r, ...a });
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, a: Attrs = {}): string {
  return tag('ellipse', { cx, cy, rx, ry, ...a });
}

export function path(d: string, a: Attrs = {}): string {
  return tag('path', { d, ...a });
}

export function line(x1: number, y1: number, x2: number, y2: number, a: Attrs = {}): string {
  return tag('line', { x1, y1, x2, y2, ...a });
}

export function text(x: number, y: number, content: string, a: Attrs = {}): string {
  return `<text${attrs({ x, y, ...a })}>${esc(content)}</text>`;
}

/** Straight polygon/polyline path. */
export function polyPath(points: Pt[], closed = true): string {
  if (points.length === 0) return '';
  let d = `M${n(points[0]!.x)} ${n(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) d += `L${n(points[i]!.x)} ${n(points[i]!.y)}`;
  return closed ? `${d}Z` : d;
}

/** Smooth Catmull-Rom spline through the points, converted to cubic Béziers. */
export function smoothPath(points: Pt[], closed = true, tension = 1): string {
  const count = points.length;
  if (count < 3) return polyPath(points, closed);
  const at = (i: number): Pt => {
    if (closed) return points[((i % count) + count) % count]!;
    return points[Math.max(0, Math.min(count - 1, i))]!;
  };
  let d = `M${n(points[0]!.x)} ${n(points[0]!.y)}`;
  const segments = closed ? count : count - 1;
  const k = tension / 6;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Irregular closed outline around (cx, cy). */
export function blobPoints(rng: Prng, cx: number, cy: number, rx: number, ry: number, count: number, jitter: number, rotation = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = rotation + (i / count) * Math.PI * 2;
    const k = 1 + rng.jitter(jitter);
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

/** Subdivide a polyline and displace intermediate points perpendicular to each segment (rough edges). */
export function roughen(rng: Prng, points: Pt[], closed: boolean, step: number, amount: number): Pt[] {
  const out: Pt[] = [];
  const segs = closed ? points.length : points.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const parts = Math.max(1, Math.round(len / step));
    const nx = -(b.y - a.y) / (len || 1);
    const ny = (b.x - a.x) / (len || 1);
    out.push(a);
    for (let k = 1; k < parts; k++) {
      const t = k / parts;
      const d = rng.jitter(amount);
      out.push({ x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d });
    }
  }
  if (!closed) out.push(points[points.length - 1]!);
  return out;
}

/** Flattened coordinate list [x1, y1, x2, y2, ...] for walls / fog regions. */
export function flatten(points: Pt[], close = false): number[] {
  const out: number[] = [];
  for (const p of points) out.push(Math.round(p.x), Math.round(p.y));
  if (close && points.length > 0) out.push(Math.round(points[0]!.x), Math.round(points[0]!.y));
  return out;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from point to a polyline. */
export function distanceToPolyline(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/** Sample points along a Catmull-Rom spline (for placing things along roads and rivers). */
export function sampleSpline(points: Pt[], perSegment = 12): Pt[] {
  const out: Pt[] = [];
  const at = (i: number): Pt => points[Math.max(0, Math.min(points.length - 1, i))]!;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = Number.parseInt(h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g2: number, b: number): string {
  return `#${[r, g2, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

/** amount > 0 lightens towards white, < 0 darkens towards black. */
export function shade(color: string, amount: number): string {
  return amount >= 0 ? mix(color, '#ffffff', amount) : mix(color, '#000000', -amount);
}

/** Random small variation of a color. */
export function vary(rng: Prng, color: string, amount: number): string {
  return shade(color, rng.jitter(amount));
}

// ---------------------------------------------------------------------------
// Documents, gradients, patterns
// ---------------------------------------------------------------------------

export type Stop = [offset: number, color: string, opacity?: number];

function stops(list: Stop[]): string {
  return list
    .map(([offset, color, opacity]) => tag('stop', { offset, stopColor: color, stopOpacity: opacity === undefined ? null : opacity }))
    .join('');
}

export function linearGradient(id: string, list: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra: Attrs = {}): string {
  return tag('linearGradient', { id, x1, y1, x2, y2, ...extra }, stops(list));
}

export function radialGradient(id: string, list: Stop[], opts: { cx?: number; cy?: number; r?: number; fx?: number; fy?: number } = {}, extra: Attrs = {}): string {
  return tag('radialGradient', { id, cx: opts.cx ?? 0.5, cy: opts.cy ?? 0.5, r: opts.r ?? 0.5, fx: opts.fx, fy: opts.fy, ...extra }, stops(list));
}

export function pattern(id: string, w: number, h: number, content: string, extra: Attrs = {}): string {
  return tag('pattern', { id, width: w, height: h, patternUnits: 'userSpaceOnUse', ...extra }, content);
}

/** Collects unique defs and body layers, then renders a standalone SVG document. */
export class SvgDoc {
  private readonly defMap = new Map<string, string>();
  private readonly body: string[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly title = '',
  ) {}

  def(id: string, markup: string): string {
    if (!this.defMap.has(id)) this.defMap.set(id, markup);
    return `url(#${id})`;
  }

  hasDef(id: string): boolean {
    return this.defMap.has(id);
  }

  add(...parts: string[]): void {
    for (const p of parts) if (p) this.body.push(p);
  }

  render(): string {
    const defs = this.defMap.size > 0 ? `<defs>${[...this.defMap.values()].join('')}</defs>` : '';
    const title = this.title ? `<title>${esc(this.title)}</title>` : '';
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">` +
      title +
      defs +
      this.body.join('') +
      `</svg>\n`
    );
  }
}

/** Soft elliptical shadow using a shared radial gradient. */
export function softShadow(doc: SvgDoc, cx: number, cy: number, rx: number, ry: number, opacity = 0.5): string {
  const fill = doc.def('softShadow', radialGradient('softShadow', [[0, '#000000', 0.75], [0.55, '#000000', 0.35], [1, '#000000', 0]]));
  return ellipse(cx, cy, rx, ry, { fill, opacity });
}

/** Additive-looking glow (radial gradient from color to transparent). */
export function glow(doc: SvgDoc, id: string, color: string, cx: number, cy: number, r: number, opacity = 0.8): string {
  const fill = doc.def(id, radialGradient(id, [[0, color, 0.9], [0.35, color, 0.45], [1, color, 0]]));
  return circle(cx, cy, r, { fill, opacity });
}

/** Edge darkening overlay. */
export function vignette(doc: SvgDoc, w: number, h: number, strength = 0.55, color = '#000000'): string {
  const fill = doc.def(`vignette${color.replace('#', '')}`, radialGradient(`vignette${color.replace('#', '')}`, [[0.55, color, 0], [1, color, 1]], { r: 0.75 }));
  return rect(0, 0, w, h, { fill, opacity: strength });
}

/** Scatter of translucent blotches for organic texture. */
export function blotches(rng: Prng, x: number, y: number, w: number, h: number, count: number, colors: string[], rMin: number, rMax: number, opacity: [number, number]): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const rx = rng.range(rMin, rMax);
    out.push(
      ellipse(x + rng.next() * w, y + rng.next() * h, rx, rx * rng.range(0.5, 1), {
        fill: rng.pick(colors),
        opacity: rng.range(opacity[0], opacity[1]),
      }),
    );
  }
  return out.join('');
}

/** Regular star polygon points. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, count: number, rotation = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i / (count * 2)) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function regularPolygon(cx: number, cy: number, r: number, count: number, rotation = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = rotation + (i / count) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
