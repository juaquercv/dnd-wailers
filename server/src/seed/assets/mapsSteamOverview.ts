import { SKY_OVERVIEW } from './layoutsSteam';
import { INK, cartouche, frame, label, mountainGlyph, parchment, scaleBar } from './mapsOverview';
import { createRng, type Prng } from './rng';
import { gearPlate } from './steamBrushes';
import { BRASS, COPPER, gearD, polar } from './steamKit';
import { SvgDoc, blobPoints, circle, ellipse, g, line, n, path, polyPath, rect, smoothPath, starPoints, vignette, type Pt } from './svg';

/** "Archipiélago de los Cielos": hand-inked sky chart of floating islands for "Los Cielos de Latón". */

const LAND = '#e6d3a0';
const LAND_DARK = '#c9b07a';
const SKY_WASH = '#8fb0c0';

interface Island {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Floating island: hanging rock cone, cloud skirt and an inked landmass. */
function floatingIsland(rng: Prng, isl: Island, grass: string): string {
  const { x, y, rx, ry } = isl;
  const parts: string[] = [];
  const tipX = x + rx * rng.range(-0.15, 0.15);
  const tipY = y + ry * rng.range(1.9, 2.4);
  const under = `M${n(x - rx * 0.92)} ${n(y + ry * 0.2)}Q${n(x - rx * 0.6)} ${n(y + ry * 1.3)} ${n(tipX)} ${n(tipY)}Q${n(x + rx * 0.6)} ${n(y + ry * 1.3)} ${n(x + rx * 0.92)} ${n(y + ry * 0.2)}Z`;
  parts.push(path(under, { fill: '#b8a27a', stroke: INK, strokeWidth: 2.2, strokeLinejoin: 'round' }));
  // Hatching on the rock underside.
  for (let i = 0; i < Math.round(rx / 10); i++) {
    const t = rng.range(0.1, 0.9);
    const sx = x - rx * 0.85 + rx * 1.7 * t;
    const sy = y + ry * 0.4 + rng.range(0, ry * 0.5);
    parts.push(line(sx, sy, sx + (tipX - sx) * 0.35, sy + (tipY - sy) * 0.35, { stroke: INK, strokeWidth: 1.1, opacity: 0.45 }));
  }
  // Hanging roots / chains.
  for (let i = 0; i < 3; i++) {
    const sx = x - rx * 0.5 + i * rx * 0.5 + rng.jitter(rx * 0.1);
    parts.push(path(`M${n(sx)} ${n(y + ry * 0.9)}q${n(rng.jitter(10))} ${n(ry * 0.5)} ${n(rng.jitter(14))} ${n(ry * 0.9)}`, { fill: 'none', stroke: INK, strokeWidth: 1.2, opacity: 0.6 }));
  }
  // Cloud skirt around the rim.
  parts.push(cloudScallops(rng, x, y + ry * 0.75, rx * 1.15, ry * 0.45, 14));
  // Landmass.
  const top = blobPoints(rng, x, y, rx, ry, 22, 0.08, rng.range(0, 1));
  parts.push(path(smoothPath(top), { fill: LAND, stroke: INK, strokeWidth: 3 }));
  parts.push(path(smoothPath(blobPoints(rng, x, y, rx * 0.86, ry * 0.84, 18, 0.07)), { fill: 'none', stroke: INK, strokeWidth: 1, opacity: 0.45, strokeDasharray: '5 5' }));
  for (let i = 0; i < 5; i++) parts.push(ellipse(x + rng.jitter(rx * 0.55), y + rng.jitter(ry * 0.5), rx * rng.range(0.12, 0.25), ry * rng.range(0.1, 0.2), { fill: grass, opacity: 0.45 }));
  return parts.join('');
}

/** Hand-inked cloud bank made of overlapping arcs. */
function cloudScallops(rng: Prng, cx: number, cy: number, rx: number, ry: number, count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = rng.range(ry * 0.45, ry * 0.75);
    const px = cx + Math.cos(a) * rx * 0.85;
    const py = cy + Math.sin(a) * ry * 0.7;
    parts.push(circle(px, py, r, { fill: '#f7f1e2', stroke: INK, strokeWidth: 1.4 }));
  }
  parts.push(ellipse(cx, cy, rx * 0.85, ry * 0.75, { fill: '#f7f1e2' }));
  return parts.join('');
}

function cloudSwirl(rng: Prng, x: number, y: number, s: number): string {
  const d = `M${n(x - s)} ${n(y)}q${n(s * 0.3)} ${n(-s * 0.5)} ${n(s * 0.6)} 0q${n(s * 0.15)} ${n(-s * 0.7)} ${n(s * 0.8)} ${n(-s * 0.2)}q${n(s * 0.45)} ${n(-s * 0.1)} ${n(s * 0.6)} ${n(s * 0.2)}`;
  return [path(d, { fill: 'none', stroke: INK, strokeWidth: 1.6, opacity: 0.55, strokeLinecap: 'round' }), path(`M${n(x - s * 0.6)} ${n(y + s * 0.18)}h${n(s * rng.range(1.2, 1.8))}`, { stroke: INK, strokeWidth: 1.1, opacity: 0.4, strokeLinecap: 'round' })].join('');
}

function cityGlyph(doc: SvgDoc, x: number, y: number): string {
  const parts: string[] = [circle(x, y, 74, { fill: '#e8d9ae', stroke: INK, strokeWidth: 1.6, strokeDasharray: '4 4' })];
  const blocks: [number, number, number, number][] = [
    [-58, -16, 26, 20],
    [-30, -34, 22, 18],
    [24, -30, 26, 20],
    [40, 4, 22, 24],
    [-52, 14, 28, 18],
    [-18, 30, 24, 16],
    [16, 30, 28, 18],
  ];
  for (const [dx, dy, w, h] of blocks) parts.push(rect(x + dx, y + dy, w, h, { fill: '#c46a4a', stroke: INK, strokeWidth: 1.5 }), line(x + dx + 3, y + dy + h / 2, x + dx + w - 3, y + dy + h / 2, { stroke: INK, strokeWidth: 0.8, opacity: 0.6 }));
  parts.push(rect(x - 9, y - 24, 18, 40, { fill: '#e6d3a0', stroke: INK, strokeWidth: 2 }), path(`M${x - 12} ${y - 24}L${x} ${y - 40}L${x + 12} ${y - 24}Z`, { fill: BRASS.base, stroke: INK, strokeWidth: 1.6 }), circle(x, y - 10, 6, { fill: '#fbf6ea', stroke: INK, strokeWidth: 1.2 }), line(x, y - 10, x + 3, y - 14, { stroke: INK, strokeWidth: 1 }));
  parts.push(gearPlate(doc, x + 2, y + 6, 13, 10, BRASS, 'ovCityGear', { spokes: 0, hub: false }));
  for (const [dx, dy] of [
    [-44, -22],
    [36, -36],
    [52, 0],
  ] as [number, number][])
    parts.push(rect(x + dx, y + dy, 4, 10, { fill: INK }), circle(x + dx + 2, y + dy - 6, 4, { fill: '#bdb6a6', opacity: 0.8 }), circle(x + dx + 6, y + dy - 13, 5, { fill: '#bdb6a6', opacity: 0.6 }));
  return parts.join('');
}

function portGlyph(x: number, y: number): string {
  const parts: string[] = [];
  for (const dy of [-26, 26]) parts.push(rect(x - 6, y + dy - 5, 92, 10, { fill: '#a8794a', stroke: INK, strokeWidth: 1.6 }), circle(x + 92, y + dy, 6, { fill: '#c43d33', stroke: INK, strokeWidth: 1.4 }));
  parts.push(ellipse(x + 46, y, 34, 10, { fill: '#f3e6c0', stroke: INK, strokeWidth: 1.6 }), line(x + 18, y, x + 74, y, { stroke: INK, strokeWidth: 0.8 }), path(`M${x + 12} ${y - 2}l-10 -8v20z`, { fill: '#8a2a2a', stroke: INK, strokeWidth: 1 }));
  parts.push(rect(x - 46, y - 18, 30, 36, { fill: '#c46a4a', stroke: INK, strokeWidth: 1.6 }), path(`M${x - 50} ${y - 18}L${x - 31} ${y - 30}L${x - 12} ${y - 18}Z`, { fill: '#7a8a8a', stroke: INK, strokeWidth: 1.4 }));
  return parts.join('');
}

function factoryGlyph(x: number, y: number): string {
  const parts: string[] = [rect(x - 46, y - 14, 92, 34, { fill: '#a89a86', stroke: INK, strokeWidth: 2 })];
  for (let i = 0; i < 4; i++) parts.push(path(`M${x - 46 + i * 23} ${y - 14}l12 -14v14`, { fill: '#8a7a66', stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' }));
  for (const dx of [-30, 26]) {
    parts.push(rect(x + dx, y - 54, 10, 40, { fill: '#c46a4a', stroke: INK, strokeWidth: 1.6 }));
    for (let k = 0; k < 4; k++) parts.push(circle(x + dx + 6 + k * 9, y - 62 - k * 9, 6 + k * 2.5, { fill: '#7a7468', opacity: 0.5 - k * 0.08, stroke: INK, strokeWidth: 0.8 }));
  }
  parts.push(path(`M${x - 8} ${y + 2}l6 -10l6 10z`, { fill: '#e0b030', stroke: INK, strokeWidth: 1.2 }), line(x - 2, y - 4, x - 2, y - 1, { stroke: INK, strokeWidth: 1.4 }));
  return parts.join('');
}

function lighthouseGlyph(x: number, y: number): string {
  const parts: string[] = [];
  for (const a of [-0.35, 0.35]) {
    const p = polar(x, y - 50, 120, Math.PI + a);
    const q = polar(x, y - 50, 120, a);
    parts.push(path(`M${x} ${y - 50}L${n(p.x)} ${n(p.y - 18)}L${n(p.x)} ${n(p.y + 18)}Z`, { fill: '#f0d070', opacity: 0.35 }), path(`M${x} ${y - 50}L${n(q.x)} ${n(q.y - 18)}L${n(q.x)} ${n(q.y + 18)}Z`, { fill: '#f0d070', opacity: 0.35 }));
  }
  parts.push(path(`M${x - 12} ${y}L${x - 7} ${y - 44}H${x + 7}L${x + 12} ${y}Z`, { fill: '#f3e6c0', stroke: INK, strokeWidth: 1.8 }), rect(x - 9, y - 30, 18, 7, { fill: '#c43d33' }), rect(x - 9, y - 14, 18, 7, { fill: '#c43d33' }), rect(x - 8, y - 56, 16, 12, { fill: '#f0d070', stroke: INK, strokeWidth: 1.6 }), path(`M${x - 10} ${y - 56}L${x} ${y - 66}L${x + 10} ${y - 56}Z`, { fill: INK }));
  return parts.join('');
}

function windmillGlyph(x: number, y: number, rot: number): string {
  const blades: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * Math.PI * 2;
    const tip = polar(x, y - 26, 26, a);
    blades.push(line(x, y - 26, tip.x, tip.y, { stroke: INK, strokeWidth: 2 }), path(`M${n(x + (tip.x - x) * 0.3)} ${n(y - 26 + (tip.y - y + 26) * 0.3)}L${n(tip.x)} ${n(tip.y)}`, { stroke: '#f3e6c0', strokeWidth: 6, opacity: 0.9 }));
  }
  return [path(`M${x - 10} ${y}L${x - 6} ${y - 26}H${x + 6}L${x + 10} ${y}Z`, { fill: '#c9b07a', stroke: INK, strokeWidth: 1.6 }), ...blades, circle(x, y - 26, 3, { fill: INK })].join('');
}

function copperDomes(x: number, y: number): string {
  const parts: string[] = [];
  for (const [dx, dy, r] of [
    [-30, 4, 16],
    [8, -10, 20],
    [36, 10, 13],
  ] as [number, number, number][])
    parts.push(path(`M${x + dx - r} ${y + dy}a${r} ${r} 0 0 1 ${r * 2} 0Z`, { fill: '#5fa890', stroke: INK, strokeWidth: 1.6 }), line(x + dx - r, y + dy, x + dx + r, y + dy, { stroke: INK, strokeWidth: 1.6 }));
  parts.push(path(`M${x - 50} ${y + 26}l10 -16l10 16z`, { fill: COPPER.base, stroke: INK, strokeWidth: 1.4 }), path(`M${x + 40} ${y + 30}l8 -12l8 12z`, { fill: COPPER.base, stroke: INK, strokeWidth: 1.4 }));
  return parts.join('');
}

function stormPeaks(rng: Prng, x: number, y: number): string {
  const parts: string[] = [];
  for (const [dx, s] of [
    [-40, 34],
    [6, 46],
    [44, 30],
  ] as [number, number][])
    parts.push(mountainGlyph(rng, x + dx, y + 24, s, '#b8b0a0', true));
  parts.push(path(`M${x - 90} ${y - 70}q30 -30 60 -10q20 -26 52 -8q34 -10 44 18q-70 10 -156 0z`, { fill: '#7a7a86', stroke: INK, strokeWidth: 1.6, opacity: 0.85 }));
  parts.push(path(`M${x + 10} ${y - 60}l-12 26h12l-10 26`, { fill: 'none', stroke: '#e0b030', strokeWidth: 3.5, strokeLinejoin: 'bevel' }), path(`M${x - 40} ${y - 62}l-8 18h8l-6 16`, { fill: 'none', stroke: '#e0b030', strokeWidth: 2.5 }));
  return parts.join('');
}

/** Small inked airship. */
function airshipGlyph(x: number, y: number, rot: number, s: number, trim: string, pirate = false): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n(s)})` }, [
    path('M-46 -8L-60 -22L-54 -6ZM-46 8L-60 22L-54 6Z', { fill: trim, stroke: INK, strokeWidth: 1.4 }),
    ellipse(0, 0, 50, 16, { fill: '#f3e6c0', stroke: INK, strokeWidth: 2 }),
    path('M-40 -6Q0 -12 40 -6M-40 6Q0 12 40 6M-44 0H44', { fill: 'none', stroke: INK, strokeWidth: 0.9, opacity: 0.7 }),
    rect(-14, 17, 28, 8, { fill: '#a8794a', stroke: INK, strokeWidth: 1.4 }),
    line(-10, 14, -12, 18, { stroke: INK, strokeWidth: 1 }),
    line(10, 14, 12, 18, { stroke: INK, strokeWidth: 1 }),
    rect(20, -4, 6, 8, { fill: trim }),
    circle(-62, 0, 6, { fill: 'none', stroke: INK, strokeWidth: 1.4 }),
    pirate ? circle(-26, 0, 6, { fill: INK }) + path('M-30 4l8 4M-22 4l-8 4', { stroke: INK, strokeWidth: 1.2 }) : '',
  ]);
}

/** Air route: dashed ink line with an arrowhead at the end. */
function route(points: Pt[], color = '#7a4a1e'): string {
  const d = smoothPath(points, false);
  const a = points[points.length - 2]!;
  const b = points[points.length - 1]!;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const l = polar(b.x, b.y, 16, ang + Math.PI - 0.45);
  const r = polar(b.x, b.y, 16, ang + Math.PI + 0.45);
  return [path(d, { fill: 'none', stroke: '#f3e6c0', strokeWidth: 9, strokeLinecap: 'round', opacity: 0.8 }), path(d, { fill: 'none', stroke: color, strokeWidth: 4, strokeDasharray: '3 11', strokeLinecap: 'round' }), path(`M${n(l.x)} ${n(l.y)}L${n(b.x)} ${n(b.y)}L${n(r.x)} ${n(r.y)}`, { fill: 'none', stroke: color, strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round' })].join('');
}

/** Compass rose built from two meshing gears. */
function gearCompass(doc: SvgDoc, x: number, y: number, r: number): string {
  const parts: string[] = [];
  parts.push(path(gearD(x, y, r * 1.08, r * 0.1, 32), { fill: '#e8d6a0', stroke: INK, strokeWidth: 2.5 }), circle(x, y, r * 0.9, { fill: '#f3e6c0', stroke: INK, strokeWidth: 1.5 }), circle(x, y, r * 0.8, { fill: 'none', stroke: INK, strokeWidth: 1, strokeDasharray: '3 5' }));
  parts.push(path(polyPath(starPoints(x, y, r * 0.66, r * 0.12, 4, -Math.PI / 4)), { fill: '#c9b07a', stroke: INK, strokeWidth: 1.4 }));
  parts.push(path(polyPath(starPoints(x, y, r * 0.88, r * 0.16, 4, -Math.PI / 2)), { fill: BRASS.base, stroke: INK, strokeWidth: 2 }));
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    const tip = polar(x, y, r * 0.88, a);
    const side = polar(x, y, r * 0.16, a + Math.PI / 4);
    parts.push(path(`M${n(x)} ${n(y)}L${n(tip.x)} ${n(tip.y)}L${n(side.x)} ${n(side.y)}Z`, { fill: INK }));
  }
  parts.push(gearPlate(doc, x, y, r * 0.2, 12, BRASS, 'compassHub', { spokes: 0 }));
  parts.push(gearPlate(doc, x + r * 1.02, y - r * 1.0, r * 0.36, 12, COPPER, 'compassGearSmall', { spokes: 4, rot: 0.12 }));
  parts.push(label(x, y - r * 1.22, 'N', r * 0.34, { fontWeight: 'bold' }), label(x, y + r * 1.42, 'S', r * 0.26), label(x + r * 1.32, y + r * 0.1, 'E', r * 0.26), label(x - r * 1.32, y + r * 0.1, 'O', r * 0.26));
  return parts.join('');
}

export function buildOverviewSky(): string {
  const L = SKY_OVERVIEW;
  const rng = createRng('overview-cielos-laton');
  const doc = new SvgDoc(L.width, L.height, 'Archipiélago de los Cielos');
  doc.add(parchment(doc, rng, L.width, L.height, '#ead9a8', '#a8885a'));
  doc.add(rect(0, 0, L.width, L.height, { fill: SKY_WASH, opacity: 0.22 }));

  // Rhumb lines radiating from the compass, portolan style.
  const c = L.compass;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const p = polar(c.x, c.y, 2600, a);
    doc.add(line(c.x, c.y, p.x, p.y, { stroke: i % 4 === 0 ? INK : '#7a5a2a', strokeWidth: i % 4 === 0 ? 1.2 : 0.7, opacity: i % 4 === 0 ? 0.28 : 0.18 }));
  }
  // Altitude grid.
  for (let x = 175; x < L.width; x += 175) doc.add(line(x, 30, x, L.height - 30, { stroke: INK, strokeWidth: 0.6, opacity: 0.12 }));
  for (let y = 175; y < L.height; y += 175) doc.add(line(30, y, L.width - 30, y, { stroke: INK, strokeWidth: 0.6, opacity: 0.12 }));

  // Drifting cloud swirls in the open sky.
  const isl = Object.values(L.islands);
  for (let i = 0; i < 70; i++) {
    const p = { x: rng.range(80, L.width - 80), y: rng.range(200, L.height - 80) };
    if (isl.some((s) => ((p.x - s.x) / (s.rx + 90)) ** 2 + ((p.y - s.y) / (s.ry * 2.6 + 60)) ** 2 < 1)) continue;
    if (Math.hypot(p.x - c.x, p.y - c.y) < c.r * 1.8) continue;
    doc.add(cloudSwirl(rng, p.x, p.y, rng.range(26, 46)));
  }

  // Islands (back to front).
  const ordered = Object.entries(L.islands).sort((a, b) => a[1].y - b[1].y);
  for (const [key, island] of ordered) doc.add(floatingIsland(rng, island, key === 'fabrica' ? '#9a9a7a' : key === 'tormentas' ? '#a8a8a0' : '#a8b878'));

  // Cableway between the city and the factory island.
  const cw = L.cableway;
  doc.add(line(cw[0]!.x, cw[0]!.y - 40, cw[1]!.x, cw[1]!.y + 20, { stroke: INK, strokeWidth: 2 }), line(cw[0]!.x + 8, cw[0]!.y - 40, cw[1]!.x + 8, cw[1]!.y + 20, { stroke: INK, strokeWidth: 1.2 }));
  doc.add(rect(cw[0]!.x - 6, cw[0]!.y + 10, 20, 14, { fill: COPPER.base, stroke: INK, strokeWidth: 1.4 }));
  for (const p of [cw[0]!, cw[1]!]) doc.add(path(`M${p.x - 10} ${p.y - 30}l14 -22l14 22`, { fill: 'none', stroke: INK, strokeWidth: 2 }));

  // Island details.
  doc.add(cityGlyph(doc, L.places.ciudad.x, L.places.ciudad.y));
  doc.add(portGlyph(L.places.puerto.x - 30, L.places.puerto.y));
  doc.add(factoryGlyph(L.places.fabrica.x, L.places.fabrica.y + 10));
  for (let i = 0; i < 6; i++) doc.add(path(`M${n(L.places.ciudad.x - 260 + i * 24)} ${n(L.places.ciudad.y + 130 + (i % 2) * 14)}l14 -24l14 24`, { fill: '#c9b07a', stroke: INK, strokeWidth: 1.4 }));
  doc.add(copperDomes(L.islands.cobre.x, L.islands.cobre.y));
  doc.add(stormPeaks(rng, L.islands.tormentas.x, L.islands.tormentas.y));
  doc.add(lighthouseGlyph(L.islands.faro.x, L.islands.faro.y + 20));
  doc.add(windmillGlyph(L.islands.vientos.x - 50, L.islands.vientos.y + 20, 0.3), windmillGlyph(L.islands.vientos.x + 10, L.islands.vientos.y + 4, 0.8), windmillGlyph(L.islands.vientos.x + 70, L.islands.vientos.y + 24, 0.1));

  // Air routes.
  for (const r of Object.values(L.routes)) doc.add(route(r));

  // Ships in the sky: the Albatros, a merchant and the pirates of La Urraca.
  doc.add(airshipGlyph(L.places.albatros.x, L.places.albatros.y, -24, 1.15, '#8a2a2a'));
  doc.add(airshipGlyph(560, 1240, 8, 0.7, '#2f6f6a'));
  doc.add(airshipGlyph(1520, 760, 30, 0.75, '#3a3236', true));

  // Wind current.
  doc.add(path('M1180 250q80 -40 160 0t160 0', { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round', opacity: 0.6 }), path('M1490 238l14 12l-18 6', { fill: 'none', stroke: INK, strokeWidth: 2, opacity: 0.6 }));

  // Labels.
  const p = L.places;
  doc.add(label(L.islands.laton.x + 60, L.islands.laton.y - L.islands.laton.ry + 52, 'Isla de Latón', 40, { fontWeight: 'bold', fontStyle: 'italic' }));
  doc.add(label(p.ciudad.x, p.ciudad.y + 108, 'Ciudad de Engranajes', 28, { fontWeight: 'bold' }));
  doc.add(label(p.puerto.x + 20, p.puerto.y + 66, 'Puerto de Dirigibles', 26, { fontWeight: 'bold' }));
  doc.add(label(p.albatros.x + 30, p.albatros.y - 52, 'El «Albatros»', 26, { fontStyle: 'italic', fontWeight: 'bold' }));
  doc.add(label(p.fabrica.x, p.fabrica.y + 62, 'Fábrica Abandonada', 26, { fontWeight: 'bold' }));
  doc.add(label(L.islands.cobre.x, L.islands.cobre.y + 70, 'Isla de Cobre', 26, { fontStyle: 'italic' }));
  doc.add(label(L.islands.tormentas.x, L.islands.tormentas.y + 76, 'Pico de las Tormentas', 24, { fontStyle: 'italic' }));
  doc.add(label(L.islands.faro.x, L.islands.faro.y + 58, 'Faro de Bruma', 22, { fontStyle: 'italic' }));
  doc.add(label(L.islands.vientos.x, L.islands.vientos.y + 70, 'Isla de los Vientos', 24, { fontStyle: 'italic' }));
  doc.add(label(1360, 1240, 'Mar de Nubes', 44, { fontStyle: 'italic', fill: '#3a5a6a', letterSpacing: 8 }));
  doc.add(label(1340, 228, 'Corriente del Norte', 20, { fontStyle: 'italic' }));
  doc.add(label(1470, 830, 'Aquí acechan piratas', 18, { fontStyle: 'italic', fill: '#7a1a12' }));
  doc.add(label(820, 940, 'Funicular', 16, { fontStyle: 'italic', transform: 'rotate(84 820 940)' }));

  doc.add(cartouche(L.width / 2, 92, 660, 'Archipiélago de los Cielos', 'Los Cielos de Latón'));
  doc.add(gearCompass(doc, c.x, c.y, c.r));
  doc.add(scaleBar(1080, 1330, 'Millas aéreas', '50'));
  doc.add(frame(L.width, L.height));
  for (const [x, y] of [
    [30, 30],
    [L.width - 30, 30],
    [30, L.height - 30],
    [L.width - 30, L.height - 30],
  ] as [number, number][])
    doc.add(gearPlate(doc, x, y, 26, 12, BRASS, 'ovCornerGear', { spokes: 4 }));
  doc.add(vignette(doc, L.width, L.height, 0.7, '#5a3a12'));
  return doc.render();
}
