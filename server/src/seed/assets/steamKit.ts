import { circle, linearGradient, n, polyPath, radialGradient, type Pt, type SvgDoc } from './svg';

/** Shared steampunk drawing primitives (gears, rivets, metal gradients) used by symbols, icons and maps. */

export const BRASS = { light: '#f6dc8e', base: '#c9a24a', dark: '#6e4e14' } as const;
export const COPPER = { light: '#f2b48a', base: '#b8673a', dark: '#5e2c12' } as const;
export const IRON = { light: '#a8aeb8', base: '#5c616a', dark: '#24272c' } as const;
export const VERDIGRIS = { light: '#9fd8c4', base: '#4f9a84', dark: '#1e4a3e' } as const;

export function polar(cx: number, cy: number, r: number, a: number): Pt {
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

/** Closed gear outline (trapezoid teeth). */
export function gearD(cx: number, cy: number, r: number, depth: number, teeth: number, rot = 0): string {
  const step = (Math.PI * 2) / teeth;
  const inner = r - depth;
  const pts: Pt[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    pts.push(polar(cx, cy, inner, a - step * 0.32), polar(cx, cy, r, a - step * 0.17), polar(cx, cy, r, a + step * 0.17), polar(cx, cy, inner, a + step * 0.32));
  }
  return polyPath(pts);
}

/** Gear outline with a round hole (fill-rule evenodd). */
export function gearWithHoleD(cx: number, cy: number, r: number, depth: number, teeth: number, hole: number, rot = 0): string {
  return `${gearD(cx, cy, r, depth, teeth, rot)}M${n(cx + hole)} ${n(cy)}A${n(hole)} ${n(hole)} 0 1 0 ${n(cx - hole)} ${n(cy)}A${n(hole)} ${n(hole)} 0 1 0 ${n(cx + hole)} ${n(cy)}Z`;
}

/** Spoked wheel cut-outs for a gear (returns a path of spoke windows, evenodd with the gear body). */
export function spokeWindowsD(cx: number, cy: number, rIn: number, rOut: number, count: number, rot = 0): string {
  let d = '';
  const step = (Math.PI * 2) / count;
  for (let i = 0; i < count; i++) {
    const a0 = rot + i * step + step * 0.16;
    const a1 = rot + (i + 1) * step - step * 0.16;
    const p0 = polar(cx, cy, rIn, a0);
    const p1 = polar(cx, cy, rOut, a0);
    const p2 = polar(cx, cy, rOut, a1);
    const p3 = polar(cx, cy, rIn, a1);
    d += `M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}A${n(rOut)} ${n(rOut)} 0 0 1 ${n(p2.x)} ${n(p2.y)}L${n(p3.x)} ${n(p3.y)}A${n(rIn)} ${n(rIn)} 0 0 0 ${n(p0.x)} ${n(p0.y)}Z`;
  }
  return d;
}

/** Ring of rivets. */
export function rivetRing(cx: number, cy: number, r: number, count: number, size: number, fill: string, rot = 0): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = polar(cx, cy, r, rot + (i / count) * Math.PI * 2);
    out.push(circle(p.x, p.y, size, { fill, stroke: '#1a120c', strokeWidth: Math.max(0.6, size * 0.35) }));
  }
  return out.join('');
}

/** Rivets along a straight line. */
export function rivetLine(x1: number, y1: number, x2: number, y2: number, count: number, size: number, fill: string): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push(circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, size, { fill, stroke: '#1a120c', strokeWidth: Math.max(0.5, size * 0.3), opacity: 0.9 }));
  }
  return out.join('');
}

/** Metallic linear gradient (light → base → dark) registered on the document. */
export function metalLinear(doc: SvgDoc, id: string, metal: { light: string; base: string; dark: string }, horizontal = false): string {
  return doc.def(id, linearGradient(id, [[0, metal.light], [0.45, metal.base], [1, metal.dark]], 0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1));
}

/** Cylindrical shading across a tube (dark edges, bright stripe). */
export function tubeGradient(doc: SvgDoc, id: string, metal: { light: string; base: string; dark: string }, horizontal = false): string {
  return doc.def(
    id,
    linearGradient(id, [[0, metal.dark], [0.3, metal.base], [0.45, metal.light], [0.62, metal.base], [1, metal.dark]], 0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1),
  );
}

/** Metallic radial gradient (dome / sphere). */
export function metalRadial(doc: SvgDoc, id: string, metal: { light: string; base: string; dark: string }): string {
  return doc.def(id, radialGradient(id, [[0, metal.light], [0.55, metal.base], [1, metal.dark]], { cx: 0.38, cy: 0.34, r: 0.72 }));
}
