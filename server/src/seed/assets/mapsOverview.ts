import { OVERVIEW_B } from './layouts';
import { createRng, type Prng } from './rng';
import {
  SvgDoc,
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
  smoothPath,
  starPoints,
  tag,
  text,
  vignette,
  type Attrs,
  type Pt,
} from './svg';

/** Hand-drawn parchment world maps (campaign overview + cover). */

export const INK = '#3b2a17';
export const PAPER = '#ead9a8';
export const SERIF = "Georgia, 'Times New Roman', serif";

export function parchment(doc: SvgDoc, rng: Prng, w: number, h: number, base: string, stain: string): string {
  const parts: string[] = [rect(0, 0, w, h, { fill: base })];
  for (let i = 0; i < 70; i++) {
    const r = rng.range(40, 260);
    parts.push(ellipse(rng.range(0, w), rng.range(0, h), r, r * rng.range(0.4, 1), { fill: stain, opacity: rng.range(0.05, 0.18) }));
  }
  const dots: string[] = [];
  for (let i = 0; i < 120; i++) dots.push(circle(rng.range(0, 200), rng.range(0, 200), rng.range(0.6, 1.8), { fill: '#7a5a2a', opacity: rng.range(0.15, 0.4) }));
  parts.push(rect(0, 0, w, h, { fill: doc.def('paperFiber', pattern('paperFiber', 200, 200, dots.join(''))) }));
  // Coffee rings.
  for (let i = 0; i < 2; i++) parts.push(circle(rng.range(200, w - 200), rng.range(200, h - 200), rng.range(60, 110), { fill: 'none', stroke: '#8a6a3a', strokeWidth: rng.range(3, 7), opacity: 0.12 }));
  return parts.join('');
}

export function frame(w: number, h: number): string {
  const parts: string[] = [
    rect(18, 18, w - 36, h - 36, { fill: 'none', stroke: INK, strokeWidth: 5 }),
    rect(30, 30, w - 60, h - 60, { fill: 'none', stroke: INK, strokeWidth: 1.6 }),
  ];
  for (const [x, y] of [
    [30, 30],
    [w - 30, 30],
    [30, h - 30],
    [w - 30, h - 30],
  ] as [number, number][]) {
    parts.push(path(polyPath(starPoints(x, y, 20, 7, 4, 0)), { fill: INK }), circle(x, y, 5, { fill: PAPER }));
  }
  return parts.join('');
}

export function label(x: number, y: number, content: string, size: number, extra: Attrs = {}): string {
  return text(x, y, content, {
    fontFamily: SERIF,
    fontSize: size,
    fill: INK,
    textAnchor: 'middle',
    stroke: '#f3e6c0',
    strokeWidth: size * 0.18,
    paintOrder: 'stroke',
    strokeLinejoin: 'round',
    letterSpacing: size * 0.04,
    ...extra,
  });
}

export function mountainGlyph(rng: Prng, x: number, y: number, s: number, fill: string, snow = false): string {
  const peak = { x: x + rng.jitter(s * 0.2), y: y - s * rng.range(1.2, 1.6) };
  const parts: string[] = [
    path(`M${n(x - s)} ${n(y)}L${n(peak.x)} ${n(peak.y)}L${n(x + s)} ${n(y)}Z`, { fill }),
    path(`M${n(peak.x)} ${n(peak.y)}L${n(x + s)} ${n(y)}L${n(peak.x + s * 0.12)} ${n(y)}Z`, { fill: INK, opacity: 0.18 }),
  ];
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const px = peak.x + (x + s - peak.x) * t;
    const py = peak.y + (y - peak.y) * t;
    parts.push(line(px - s * 0.05, py + s * 0.04, px - s * 0.22, py + s * 0.2, { stroke: INK, strokeWidth: 1.4, opacity: 0.7 }));
  }
  if (snow) parts.push(path(`M${n(peak.x - s * 0.22)} ${n(peak.y + s * 0.32)}L${n(peak.x)} ${n(peak.y)}L${n(peak.x + s * 0.24)} ${n(peak.y + s * 0.34)}L${n(peak.x + s * 0.08)} ${n(peak.y + s * 0.26)}L${n(peak.x - s * 0.06)} ${n(peak.y + s * 0.38)}Z`, { fill: '#fbf6ea' }));
  parts.push(path(`M${n(x - s)} ${n(y)}L${n(peak.x)} ${n(peak.y)}L${n(x + s)} ${n(y)}`, { fill: 'none', stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' }));
  return parts.join('');
}

function treeGlyph(rng: Prng, x: number, y: number, s: number, kind: 'round' | 'pine' | 'dead', fill: string): string {
  if (kind === 'pine') {
    return path(`M${n(x)} ${n(y - s * 1.6)}L${n(x - s * 0.7)} ${n(y)}L${n(x + s * 0.7)} ${n(y)}Z`, { fill, stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' }) + line(x, y, x, y + s * 0.3, { stroke: INK, strokeWidth: 2 });
  }
  if (kind === 'dead') {
    return path(`M${n(x)} ${n(y + s * 0.3)}V${n(y - s)}M${n(x)} ${n(y - s * 0.4)}L${n(x - s * 0.5)} ${n(y - s * 1.1)}M${n(x)} ${n(y - s * 0.6)}L${n(x + s * 0.5)} ${n(y - s * 1.2)}M${n(x - s * 0.25)} ${n(y - s * 0.75)}L${n(x - s * 0.55)} ${n(y - s * 0.7)}`, { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round' });
  }
  return line(x, y, x, y + s * 0.4, { stroke: INK, strokeWidth: 2 }) + circle(x, y - s * 0.35, s * 0.62 * rng.range(0.9, 1.1), { fill, stroke: INK, strokeWidth: 1.6 });
}

function forestGlyphs(rng: Prng, cx: number, cy: number, rx: number, ry: number, count: number, kinds: ('round' | 'pine' | 'dead')[], fill: string): string {
  const pts: Pt[] = [];
  for (let i = 0; i < count * 3 && pts.length < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next());
    const p = { x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d };
    if (pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 22)) continue;
    pts.push(p);
  }
  pts.sort((a, b) => a.y - b.y);
  return pts.map((p) => treeGlyph(rng, p.x, p.y, rng.range(14, 20), rng.pick(kinds), fill)).join('');
}

export function hillGlyph(x: number, y: number, s: number): string {
  return path(`M${n(x - s)} ${n(y)}Q${n(x)} ${n(y - s * 0.9)} ${n(x + s)} ${n(y)}`, { fill: 'none', stroke: INK, strokeWidth: 2.2 }) + line(x + s * 0.2, y - s * 0.3, x + s * 0.45, y - s * 0.05, { stroke: INK, strokeWidth: 1.4, opacity: 0.7 });
}

function compass(x: number, y: number, r: number): string {
  const parts: string[] = [circle(x, y, r * 1.05, { fill: 'none', stroke: INK, strokeWidth: 2 }), circle(x, y, r * 0.92, { fill: 'none', stroke: INK, strokeWidth: 1, strokeDasharray: '3 5' })];
  const big = starPoints(x, y, r, r * 0.18, 4, -Math.PI / 2);
  const small = starPoints(x, y, r * 0.62, r * 0.12, 4, -Math.PI / 4);
  parts.push(path(polyPath(small), { fill: '#cdb98f', stroke: INK, strokeWidth: 1.5 }));
  parts.push(path(polyPath(big), { fill: '#f3e6c0', stroke: INK, strokeWidth: 2 }));
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    const tip = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
    const side = { x: x + Math.cos(a + Math.PI / 4) * r * 0.18, y: y + Math.sin(a + Math.PI / 4) * r * 0.18 };
    parts.push(path(`M${n(x)} ${n(y)}L${n(tip.x)} ${n(tip.y)}L${n(side.x)} ${n(side.y)}Z`, { fill: INK }));
  }
  parts.push(circle(x, y, r * 0.08, { fill: '#c43d33', stroke: INK, strokeWidth: 1.5 }));
  parts.push(label(x, y - r * 1.18, 'N', r * 0.36, { fontWeight: 'bold' }), label(x, y + r * 1.42, 'S', r * 0.26), label(x + r * 1.3, y + r * 0.1, 'E', r * 0.26), label(x - r * 1.3, y + r * 0.1, 'O', r * 0.26));
  return parts.join('');
}

export function cartouche(x: number, y: number, w: number, title: string, subtitle: string): string {
  const h = 92;
  return [
    path(`M${n(x - w / 2 - 50)} ${n(y + 10)}l40 -26v${h - 10}l-40 26l18 -36z`, { fill: '#c9a86a', stroke: INK, strokeWidth: 2 }),
    path(`M${n(x + w / 2 + 50)} ${n(y + 10)}l-40 -26v${h - 10}l40 26l-18 -36z`, { fill: '#c9a86a', stroke: INK, strokeWidth: 2 }),
    rect(x - w / 2, y - 26, w, h, { fill: '#f3e6c0', stroke: INK, strokeWidth: 2.5 }),
    rect(x - w / 2 + 8, y - 18, w - 16, h - 16, { fill: 'none', stroke: INK, strokeWidth: 1 }),
    label(x, y + 22, title, 42, { fontWeight: 'bold' }),
    label(x, y + 52, subtitle, 18, { fontStyle: 'italic' }),
  ].join('');
}

export function scaleBar(x: number, y: number, unit = 'Leguas', max = '20'): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) parts.push(rect(x + i * 50, y, 50, 10, { fill: i % 2 === 0 ? INK : '#f3e6c0', stroke: INK, strokeWidth: 1.5 }));
  parts.push(label(x + 100, y - 10, unit, 18, { fontStyle: 'italic' }), label(x, y + 32, '0', 14), label(x + 200, y + 32, max, 14));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Campaign B: Valle de Valdris
// ---------------------------------------------------------------------------

function cemeteryGlyph(x: number, y: number): string {
  const parts: string[] = [rect(x - 62, y - 40, 124, 80, { fill: '#d8c79a', stroke: INK, strokeWidth: 2, strokeDasharray: '6 4' })];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = x - 38 + i * 38;
      const cy = y - 12 + j * 30;
      parts.push(path(`M${cx} ${cy - 14}v26M${cx - 8} ${cy - 6}h16`, { stroke: INK, strokeWidth: 3, strokeLinecap: 'round' }));
    }
  }
  return parts.join('');
}

function cryptGlyph(x: number, y: number): string {
  return [
    rect(x - 40, y - 30, 80, 46, { fill: '#c8b48a', stroke: INK, strokeWidth: 2.4 }),
    path(`M${x - 48} ${y - 30}L${x} ${y - 62}L${x + 48} ${y - 30}Z`, { fill: '#8a7a6a', stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' }),
    rect(x - 12, y - 14, 24, 30, { fill: '#1e140a', rx: 12 }),
    circle(x, y - 42, 7, { fill: '#e2cf9a', stroke: INK, strokeWidth: 1.5 }),
    circle(x - 2.5, y - 43, 1.4, { fill: INK }),
    circle(x + 2.5, y - 43, 1.4, { fill: INK }),
  ].join('');
}

function chapelGlyph(x: number, y: number): string {
  return [
    rect(x - 22, y - 20, 44, 34, { fill: '#e2cf9a', stroke: INK, strokeWidth: 2 }),
    path(`M${x - 26} ${y - 20}L${x - 8} ${y - 40}L${x + 4} ${y - 30}`, { fill: 'none', stroke: INK, strokeWidth: 2 }),
    path(`M${x + 10} ${y - 20}l6 -10l6 10`, { fill: 'none', stroke: INK, strokeWidth: 2 }),
    path(`M${x} ${y - 14}v14M${x - 6} ${y - 8}h12`, { stroke: INK, strokeWidth: 2.4 }),
  ].join('');
}

function ruinsGlyph(rng: Prng, x: number, y: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const bx = x - 40 + i * 20;
    const h = rng.range(10, 30);
    parts.push(rect(bx, y - h, 14, h, { fill: '#d8c79a', stroke: INK, strokeWidth: 1.6 }));
  }
  parts.push(line(x - 50, y, x + 60, y, { stroke: INK, strokeWidth: 2 }));
  return parts.join('');
}

export function buildOverviewValdris(): string {
  const L = OVERVIEW_B;
  const rng = createRng('overview-valdris');
  const doc = new SvgDoc(L.width, L.height, 'Valle de Valdris');
  doc.add(parchment(doc, rng, L.width, L.height, '#ddd0a8', '#9a8a60'));
  // Swamp.
  const sw = L.swamp;
  doc.add(ellipse(sw.x, sw.y, sw.rx, sw.ry, { fill: '#9aa88a', opacity: 0.45, stroke: INK, strokeWidth: 1.5, strokeDasharray: '3 6' }));
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next());
    const x = sw.x + Math.cos(a) * sw.rx * d * 0.9;
    const y = sw.y + Math.sin(a) * sw.ry * d * 0.9;
    if (rng.chance(0.5)) doc.add(path(`M${n(x - 10)} ${n(y)}h20M${n(x - 6)} ${n(y + 5)}h12`, { stroke: '#4f6a5a', strokeWidth: 1.6 }));
    else doc.add(path(`M${n(x)} ${n(y)}v-14M${n(x - 4)} ${n(y)}l-4 -10M${n(x + 4)} ${n(y)}l4 -10`, { stroke: INK, strokeWidth: 1.4 }));
  }
  // Hills and dead forest.
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next());
    doc.add(hillGlyph(L.hills.x + Math.cos(a) * L.hills.rx * d, L.hills.y + Math.sin(a) * L.hills.ry * d, rng.range(22, 40)));
  }
  for (let i = 0; i < 6; i++) doc.add(mountainGlyph(rng, 1650 + i * 50, 300 + (i % 2) * 40, rng.range(36, 52), '#b8a88a', false));
  doc.add(forestGlyphs(rng, L.deadForest.x, L.deadForest.y, L.deadForest.rx, L.deadForest.ry, 70, ['dead', 'dead', 'pine'], '#8a9a78'));
  doc.add(forestGlyphs(rng, 1500, 700, 140, 90, 26, ['dead', 'pine'], '#8a9a78'));
  // River from the hills into the swamp.
  const river = smoothPath([{ x: 1100, y: 330 }, { x: 1320, y: 520 }, { x: 1300, y: 760 }, { x: 1450, y: 900 }], false);
  doc.add(path(river, { fill: 'none', stroke: '#4f6a7a', strokeWidth: 7, strokeLinecap: 'round' }), path(river, { fill: 'none', stroke: '#9fb7b0', strokeWidth: 2.5, strokeLinecap: 'round' }));
  // Pilgrim's road.
  doc.add(path(smoothPath(L.road, false), { fill: 'none', stroke: '#6a4a26', strokeWidth: 4.5, strokeDasharray: '16 9', strokeLinecap: 'round' }));
  // Places.
  doc.add(g({ transform: `translate(${L.places.cementerio.x} ${L.places.cementerio.y}) scale(1.4) translate(${-L.places.cementerio.x} ${-L.places.cementerio.y})` }, cemeteryGlyph(L.places.cementerio.x, L.places.cementerio.y)));
  doc.add(g({ transform: `translate(${L.places.cripta.x} ${L.places.cripta.y}) scale(1.5) translate(${-L.places.cripta.x} ${-L.places.cripta.y})` }, cryptGlyph(L.places.cripta.x, L.places.cripta.y)));
  doc.add(chapelGlyph(L.places.capilla.x, L.places.capilla.y));
  doc.add(ruinsGlyph(rng, L.places.ruinas.x, L.places.ruinas.y));
  // Skull warning near the crypt.
  doc.add(circle(1290, 470, 14, { fill: '#efe2bf', stroke: INK, strokeWidth: 2 }), circle(1285, 468, 3, { fill: INK }), circle(1295, 468, 3, { fill: INK }));
  // Labels.
  doc.add(label(L.places.cementerio.x, L.places.cementerio.y + 96, 'Cementerio de Valdris', 32, { fontWeight: 'bold' }));
  doc.add(label(L.places.cripta.x, L.places.cripta.y + 70, 'Cripta de Valdris', 32, { fontWeight: 'bold' }));
  doc.add(label(L.places.capilla.x - 40, L.places.capilla.y + 48, 'Capilla en ruinas', 22, { fontStyle: 'italic' }));
  doc.add(label(L.places.ruinas.x, L.places.ruinas.y + 40, 'Ruinas de Valdris', 24, { fontStyle: 'italic' }));
  doc.add(label(L.swamp.x, L.swamp.y + 8, 'Pantano Sombrío', 34, { fontStyle: 'italic' }));
  doc.add(label(L.deadForest.x, L.deadForest.y + L.deadForest.ry + 50, 'Bosque Muerto', 32, { fontStyle: 'italic' }));
  doc.add(label(960, 280, 'Colinas Grises', 30, { fontStyle: 'italic' }));
  doc.add(label(320, 1180, 'Camino del Peregrino', 22, { fontStyle: 'italic', transform: 'rotate(-20 320 1180)' }));
  doc.add(cartouche(L.width / 2, 92, 560, 'Valle de Valdris', 'Las Criptas de Valdris'));
  doc.add(compass(1800, 1120, 72));
  doc.add(scaleBar(1420, 1232));
  doc.add(frame(L.width, L.height));
  doc.add(vignette(doc, L.width, L.height, 0.85, '#2a1a08'));
  // Pale moonlit haze over the valley.
  doc.add(rect(0, 0, L.width, L.height, { fill: doc.def('valdrisHaze', radialGradient('valdrisHaze', [[0, '#ffffff', 0.12], [1, '#ffffff', 0]])) }));
  return doc.render();
}
