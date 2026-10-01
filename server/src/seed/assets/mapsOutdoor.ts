import {
  ASH_ROCK,
  AUTUMN,
  DIRT_ROAD,
  GRAY_ROCK,
  OAK,
  PINE,
  barrel,
  bones,
  bush,
  campfire,
  candle,
  cobbleTexture,
  crate,
  deadTree,
  flagstoneTexture,
  fogPatches,
  grassTexture,
  gravestone,
  houseRoof,
  lavaCrack,
  lavaPool,
  pine,
  road,
  rock,
  speckleTexture,
  stream,
  terrain,
  tree,
  type RoadStyle,
} from './brushes';
import { CEMETERY, CROSSROADS, FOREST, MOUNTAINS, VILLAGE, type RectSpec } from './layouts';
import { createRng, type Prng } from './rng';
import {
  SvgDoc,
  blobPoints,
  circle,
  distanceToPolyline,
  ellipse,
  g,
  glow,
  line,
  linearGradient,
  n,
  path,
  polyPath,
  radialGradient,
  rect,
  sampleSpline,
  shade,
  smoothPath,
  softShadow,
  vary,
  vignette,
  type Pt,
} from './svg';

function inRect(p: Pt, r: RectSpec, margin: number): boolean {
  return p.x > r.x - margin && p.x < r.x + r.w + margin && p.y > r.y - margin && p.y < r.y + r.h + margin;
}

function edgeDistance(p: Pt, w: number, h: number): number {
  return Math.min(p.x, w - p.x, p.y, h - p.y);
}

interface Placed {
  x: number;
  y: number;
  r: number;
}

/** Poisson-ish scatter: random candidates, rejected by predicate and by overlap with previously placed ones. */
function scatter(rng: Prng, w: number, h: number, attempts: number, radius: [number, number], accept: (p: Pt, r: number) => boolean, spacing = 0.75): Placed[] {
  const placed: Placed[] = [];
  for (let i = 0; i < attempts; i++) {
    const p = { x: rng.range(-30, w + 30), y: rng.range(-30, h + 30) };
    const r = rng.range(radius[0], radius[1]);
    if (!accept(p, r)) continue;
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (q.r + r) * spacing)) continue;
    placed.push({ x: p.x, y: p.y, r });
  }
  return placed.sort((a, b) => a.y - b.y);
}

function flowers(rng: Prng, x: number, y: number, spread: number, count: number, colors: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(circle(x + rng.jitter(spread), y + rng.jitter(spread), rng.range(1.8, 3.2), { fill: rng.pick(colors), opacity: 0.9 }));
  return parts.join('');
}

function fern(rng: Prng, x: number, y: number, r: number, color: string): string {
  const parts: string[] = [];
  const fronds = rng.int(5, 7);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng.jitter(0.3);
    parts.push(path(`M${n(x)} ${n(y)}Q${n(x + Math.cos(a + 0.3) * r * 0.6)} ${n(y + Math.sin(a + 0.3) * r * 0.6)} ${n(x + Math.cos(a) * r)} ${n(y + Math.sin(a) * r)}`, { stroke: color, strokeWidth: 4, fill: 'none', strokeLinecap: 'round' }));
  }
  return parts.join('');
}

function fenceLine(pts: Pt[], color = '#5a3e22'): string {
  const parts: string[] = [path(polyPath(pts, false), { stroke: color, strokeWidth: 4, fill: 'none' })];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const posts = Math.max(1, Math.round(len / 40));
    for (let k = 0; k <= posts; k++) {
      const t = k / posts;
      parts.push(rect(a.x + (b.x - a.x) * t - 4, a.y + (b.y - a.y) * t - 4, 8, 8, { fill: shade(color, -0.2), stroke: '#2a1a0e', strokeWidth: 1 }));
    }
  }
  return parts.join('');
}

function cart(doc: SvgDoc, x: number, y: number, rot: number, load: string): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-50 + 10, -30 + 12, 100, 60, { fill: '#000000', opacity: 0.35 }),
    rect(-58, -36, 14, 14, { fill: '#3a2a1a' }),
    rect(-58, 22, 14, 14, { fill: '#3a2a1a' }),
    rect(30, -36, 14, 14, { fill: '#3a2a1a' }),
    rect(30, 22, 14, 14, { fill: '#3a2a1a' }),
    rect(-50, -30, 100, 60, { fill: '#8a6236', stroke: '#3d2a14', strokeWidth: 3, rx: 3 }),
    rect(-42, -22, 84, 44, { fill: load, rx: 6 }),
    line(50, -10, 95, -6, { stroke: '#5a3e22', strokeWidth: 5 }),
    line(50, 10, 95, 6, { stroke: '#5a3e22', strokeWidth: 5 }),
    softShadow(doc, -10, 0, 30, 18, 0.15),
  ]);
}

// ---------------------------------------------------------------------------
// Aldea de Brezoscuro
// ---------------------------------------------------------------------------

export function buildVillage(): string {
  const L = VILLAGE;
  const rng = createRng('map-aldea');
  const doc = new SvgDoc(L.width, L.height, 'Aldea de Brezoscuro');
  const grass = grassTexture(doc, rng, 'grassVillage', '#9cc26a', '#3f6b2a');
  doc.add(terrain(rng, L.width, L.height, { base: '#5f8a3c', blotches: ['#4d7330', '#729c48', '#86a656', '#456a2b', '#6b8a3a'], count: 140, texture: grass }));

  // Fields with crop rows and fences.
  for (const f of L.fields) {
    const rows: string[] = [rect(0, 0, f.w, f.h, { fill: shade(f.crop, -0.25), rx: 6 })];
    for (let y = 8; y < f.h - 4; y += 16) rows.push(rect(6, y, f.w - 12, 8, { fill: vary(rng, f.crop, 0.1), rx: 4 }));
    rows.push(rect(0, 0, f.w, f.h, { fill: 'none', stroke: '#4a3a1e', strokeWidth: 3, rx: 6, opacity: 0.6 }));
    for (let i = 0; i < 4; i++) {
      const hx = rng.range(40, f.w - 40);
      const hy = rng.range(30, f.h - 30);
      rows.push(softShadow(doc, hx + 8, hy + 10, 26, 22, 0.5), circle(hx, hy, 20, { fill: '#d9b85a', stroke: '#8a6a2a', strokeWidth: 2 }), circle(hx, hy, 12, { fill: 'none', stroke: '#b8943a', strokeWidth: 2 }));
    }
    doc.add(g({ transform: `translate(${n(f.x)} ${n(f.y)}) rotate(${n(f.rot)})` }, rows));
    doc.add(g({ transform: `translate(${n(f.x)} ${n(f.y)}) rotate(${n(f.rot)})` }, fenceLine([{ x: -14, y: -14 }, { x: f.w + 14, y: -14 }, { x: f.w + 14, y: f.h + 14 }, { x: -14, y: f.h + 14 }, { x: -14, y: -10 }])));
  }

  // Pond.
  const pondFill = doc.def('pondGrad', radialGradient('pondGrad', [[0, '#3f87a8'], [0.7, '#2a5f7d'], [1, '#1d4157']]));
  doc.add(path(smoothPath(blobPoints(rng, L.pond.x, L.pond.y, L.pond.rx + 18, L.pond.ry + 16, 10, 0.12)), { fill: '#6b5a3a' }));
  doc.add(path(smoothPath(blobPoints(rng, L.pond.x, L.pond.y, L.pond.rx, L.pond.ry, 10, 0.12)), { fill: pondFill }));
  doc.add(ellipse(L.pond.x - 30, L.pond.y - 18, 40, 10, { fill: '#cfeaf5', opacity: 0.25 }));
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, Math.PI * 2);
    doc.add(fern(rng, L.pond.x + Math.cos(a) * (L.pond.rx + 10), L.pond.y + Math.sin(a) * (L.pond.ry + 10), 14, '#4a7a3a'));
  }
  for (let i = 0; i < 3; i++) doc.add(ellipse(L.pond.x + rng.jitter(60), L.pond.y + rng.jitter(30), 12, 9, { fill: '#4f8f3f', stroke: '#2f5f2a', strokeWidth: 1 }));

  // Roads and plaza.
  doc.add(road(rng, L.mainRoad, 74, DIRT_ROAD, 120));
  doc.add(road(rng, L.northRoad, 58, DIRT_ROAD, 50));
  doc.add(road(rng, L.southRoad, 58, DIRT_ROAD, 50));
  const cobble = cobbleTexture(doc, rng, 'cobbleVillage', '#8f8a80', '#4e4a44');
  doc.add(circle(L.plaza.x, L.plaza.y, L.plaza.r + 14, { fill: '#5a4a38', opacity: 0.7 }));
  doc.add(circle(L.plaza.x, L.plaza.y, L.plaza.r, { fill: cobble, stroke: '#3d3a35', strokeWidth: 6 }));
  doc.add(circle(L.plaza.x, L.plaza.y, L.plaza.r * 0.55, { fill: 'none', stroke: '#6e6a62', strokeWidth: 10, opacity: 0.6 }));
  // Paths from road to house doors.
  for (const h of L.houses) {
    const target = { x: h.cx, y: h.cy + h.h / 2 + 10 };
    const samples = sampleSpline(L.mainRoad, 10);
    let best = samples[0]!;
    for (const s of samples) if (Math.hypot(s.x - target.x, s.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y)) best = s;
    if (Math.hypot(best.x - target.x, best.y - target.y) < 420) doc.add(path(`M${n(target.x)} ${n(target.y)}L${n(best.x)} ${n(best.y)}`, { stroke: '#8a6d45', strokeWidth: 22, strokeLinecap: 'round', opacity: 0.7 }));
  }

  // Well.
  const w = L.well;
  doc.add(softShadow(doc, w.x + 14, w.y + 16, w.r * 1.6, w.r * 1.4, 0.6));
  doc.add(circle(w.x, w.y, w.r + 10, { fill: '#7a766c', stroke: '#2f2c27', strokeWidth: 3 }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    doc.add(line(w.x + Math.cos(a) * (w.r - 2), w.y + Math.sin(a) * (w.r - 2), w.x + Math.cos(a) * (w.r + 10), w.y + Math.sin(a) * (w.r + 10), { stroke: '#2f2c27', strokeWidth: 2 }));
  }
  doc.add(circle(w.x, w.y, w.r - 4, { fill: doc.def('wellWater', radialGradient('wellWater', [[0, '#0d1d2a'], [1, '#1f3f55']])) }));
  doc.add(rect(w.x - w.r - 16, w.y - 6, w.r * 2 + 32, 12, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2 }));
  doc.add(rect(w.x - 10, w.y - 14, 20, 28, { fill: '#8a6236', stroke: '#3d2a14', strokeWidth: 2, rx: 3 }));

  // Market stalls.
  for (const s of L.stalls) {
    const stripes: string[] = [rect(-45 + 10, -32 + 12, 90, 64, { fill: '#000000', opacity: 0.35 })];
    for (let i = 0; i < 6; i++) stripes.push(rect(-45 + i * 15, -32, 15, 64, { fill: i % 2 === 0 ? s.color : '#efe6cf' }));
    stripes.push(rect(-45, -32, 90, 64, { fill: 'none', stroke: '#3a2a1a', strokeWidth: 2 }), line(-45, 0, 45, 0, { stroke: shade(s.color, -0.4), strokeWidth: 2 }));
    doc.add(g({ transform: `translate(${n(s.x)} ${n(s.y)}) rotate(${n(s.rot)})` }, stripes));
    for (let i = 0; i < 3; i++) {
      const cx = s.x + rng.jitter(40);
      const cy = s.y + rng.jitter(40);
      doc.add(crate(cx, cy, 22, rng.range(-20, 20)), flowers(rng, cx, cy, 6, 6, ['#d9452f', '#e9c063', '#8fbf4a', '#e07a2a']));
    }
  }

  // Smithy with open forge.
  doc.add(houseRoof(doc, rng, L.smithy.cx, L.smithy.cy, L.smithy.w, L.smithy.h, L.smithy.rot, L.smithy.roof));
  doc.add(rect(L.smithy.cx - 120, L.smithy.cy + 85, 240, 110, { fill: '#5a5248', stroke: '#2f2a24', strokeWidth: 3, opacity: 0.9 }));
  doc.add(glow(doc, 'forgeGlow', '#ff7a2a', L.forge.x, L.forge.y, 120, 0.7));
  doc.add(rect(L.forge.x - 34, L.forge.y - 28, 68, 56, { fill: '#5d5a54', stroke: '#2a2622', strokeWidth: 3, rx: 6 }), rect(L.forge.x - 22, L.forge.y - 16, 44, 32, { fill: doc.def('coals', radialGradient('coals', [[0, '#fff0a0'], [0.4, '#ff8a20'], [1, '#7a1a05']])) }));
  doc.add(softShadow(doc, L.anvil.x + 8, L.anvil.y + 10, 40, 24, 0.5), path(`M${L.anvil.x - 36} ${L.anvil.y - 12}h60l14 -8v20l-14 -4h-12v16h-36v-16h-12z`, { fill: '#3e3e44', stroke: '#141418', strokeWidth: 2 }), line(L.anvil.x - 30, L.anvil.y - 10, L.anvil.x + 20, L.anvil.y - 10, { stroke: '#8a8a94', strokeWidth: 2 }));
  doc.add(barrel(doc, L.forge.x + 70, L.forge.y + 10, 20));
  for (let i = 0; i < 4; i++) doc.add(line(L.smithy.cx - 100 + i * 18, L.smithy.cy + 100, L.smithy.cx - 96 + i * 18, L.smithy.cy + 150, { stroke: '#a8a8b0', strokeWidth: 4, strokeLinecap: 'round' }));

  // Houses and the tavern.
  for (const h of L.houses) doc.add(houseRoof(doc, rng, h.cx, h.cy, h.w, h.h, h.rot, h.roof));
  doc.add(houseRoof(doc, rng, L.tavern.cx, L.tavern.cy, L.tavern.w, L.tavern.h, 0, L.tavern.roof));
  doc.add(rect(L.tavernDoor.x - 30, L.tavernDoor.y, 60, 22, { fill: '#7a766c', stroke: '#2f2c27', strokeWidth: 2 }));
  // Golden boar sign.
  doc.add(circle(L.tavernDoor.x + 70, L.tavernDoor.y + 18, 20, { fill: '#e9c063', stroke: '#7d5d1d', strokeWidth: 3 }), ellipse(L.tavernDoor.x + 70, L.tavernDoor.y + 20, 11, 7, { fill: '#5a3a1a' }), path(`M${L.tavernDoor.x + 59} ${L.tavernDoor.y + 16}l-6 -6M${L.tavernDoor.x + 81} ${L.tavernDoor.y + 16}l6 -6`, { stroke: '#5a3a1a', strokeWidth: 3 }));
  doc.add(barrel(doc, 1620, 470, 22), barrel(doc, 1640, 520, 20), crate(1600, 540, 30, 12), crate(1285, 520, 26, -8));

  // Carts and village life.
  doc.add(cart(doc, 1700, 645, -8, '#c9a94a'), cart(doc, 380, 735, 2, '#7a5a3a'));
  for (let i = 0; i < 6; i++) doc.add(flowers(rng, rng.range(200, 1900), rng.range(150, 1300), 26, 14, ['#e9c063', '#f3ead6', '#d96a8a', '#a98bff']));

  // Trees and bushes, denser near the map edges (forest to the east).
  const mainS = sampleSpline(L.mainRoad, 10);
  const northS = sampleSpline(L.northRoad, 10);
  const southS = sampleSpline(L.southRoad, 10);
  const blocked = (p: Pt, r: number): boolean => {
    if (distanceToPolyline(p, mainS) < 60 + r * 0.6) return true;
    if (distanceToPolyline(p, northS) < 50 + r * 0.6) return true;
    if (distanceToPolyline(p, southS) < 50 + r * 0.6) return true;
    if (Math.hypot(p.x - L.plaza.x, p.y - L.plaza.y) < L.plaza.r + r + 20) return true;
    for (const h of [...L.houses, L.tavern, L.smithy]) if (inRect(p, { x: h.cx - h.w / 2, y: h.cy - h.h / 2, w: h.w, h: h.h }, r + 30)) return true;
    for (const f of L.fields) if (inRect(p, f, r + 20)) return true;
    if (Math.hypot(p.x - L.pond.x, p.y - L.pond.y) < L.pond.rx + r + 20) return true;
    if (inRect(p, { x: L.smithy.cx - 140, y: L.smithy.cy + 60, w: 280, h: 160 }, r)) return true;
    return false;
  };
  const trees = scatter(rng, L.width, L.height, 900, [34, 72], (p, r) => {
    if (blocked(p, r)) return false;
    const e = edgeDistance(p, L.width, L.height);
    const east = p.x > 1820 ? 0.5 : 0;
    const prob = (e < 160 ? 0.85 : e < 360 ? 0.3 : 0.08) + east;
    return rng.chance(prob);
  });
  for (const t of trees) {
    if (rng.chance(0.18)) doc.add(pine(doc, rng, t.x, t.y, t.r * 0.9));
    else doc.add(tree(doc, rng, t.x, t.y, t.r, rng.chance(0.12) ? AUTUMN : OAK));
  }
  const bushes = scatter(rng, L.width, L.height, 220, [14, 26], (p, r) => !blocked(p, r) && rng.chance(0.5));
  for (const b of bushes) doc.add(bush(doc, rng, b.x, b.y, b.r, OAK, rng.chance(0.3) ? '#c43d33' : undefined));
  doc.add(vignette(doc, L.width, L.height, 0.35));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Bosque de los Susurros (also "Claro del bosque" template)
// ---------------------------------------------------------------------------

function tent(x: number, y: number, rot: number, color: string): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-55 + 12, -40 + 14, 110, 80, { fill: '#000000', opacity: 0.35 }),
    rect(-55, -40, 110, 40, { fill: shade(color, 0.12) }),
    rect(-55, 0, 110, 40, { fill: shade(color, -0.2) }),
    line(-55, 0, 55, 0, { stroke: shade(color, -0.5), strokeWidth: 4 }),
    rect(-55, -40, 110, 80, { fill: 'none', stroke: shade(color, -0.55), strokeWidth: 2.5 }),
    path('M55 -40L70 -48M55 40L70 48M-55 -40L-70 -48M-55 40L-70 48', { stroke: '#3a2a1a', strokeWidth: 1.5 }),
    path('M-55 -6L-70 0L-55 6', { fill: '#1a140e' }),
  ]);
}

export function buildForest(): string {
  const L = FOREST;
  const rng = createRng('map-bosque');
  const doc = new SvgDoc(L.width, L.height, 'Bosque de los Susurros');
  const grass = grassTexture(doc, rng, 'grassForest', '#6f8f45', '#1f3a1a');
  doc.add(terrain(rng, L.width, L.height, { base: '#2f4a24', blotches: ['#3a5a2a', '#26401d', '#4a5f2c', '#5a4a2a', '#203a1c'], count: 170, texture: grass }));
  doc.add(rect(0, 0, L.width, L.height, { fill: speckleTexture(doc, rng, 'leafLitter', ['#7a5a2a', '#9a6a2a', '#4a3a1a', '#6a7a2a'], 180, 110) }));

  // Clearing.
  const clearing = doc.def('clearingGrad', radialGradient('clearingGrad', [[0, '#7a9a4a', 0.95], [0.7, '#5f7f3a', 0.8], [1, '#4a6a30', 0]]));
  doc.add(ellipse(L.clearing.x, L.clearing.y, L.clearing.rx * 1.25, L.clearing.ry * 1.25, { fill: clearing }));
  doc.add(road(rng, L.mainPath, 60, DIRT_ROAD, 100));
  doc.add(road(rng, L.southPath, 50, DIRT_ROAD, 50));
  doc.add(stream(rng, L.stream, 40));

  // Bridge over the stream.
  const b = L.bridge;
  const planks: string[] = [rect(-b.w / 2 + 10, -b.h / 2 + 12, b.w, b.h, { fill: '#000000', opacity: 0.4 })];
  for (let x = -b.w / 2; x < b.w / 2; x += 15) planks.push(rect(x, -b.h / 2 + 6, 14, b.h - 12, { fill: vary(rng, '#8a6236', 0.12), stroke: '#3d2a14', strokeWidth: 1.2 }));
  planks.push(rect(-b.w / 2 - 6, -b.h / 2, b.w + 12, 8, { fill: '#5a3e22', stroke: '#2a1a0e', strokeWidth: 1.5 }), rect(-b.w / 2 - 6, b.h / 2 - 8, b.w + 12, 8, { fill: '#5a3e22', stroke: '#2a1a0e', strokeWidth: 1.5 }));
  doc.add(g({ transform: `translate(${b.x} ${b.y}) rotate(-6)` }, planks));

  // Goblin camp.
  doc.add(tent(L.tents[0]!.x, L.tents[0]!.y, L.tents[0]!.rot, '#6b5a3a'));
  doc.add(tent(L.tents[1]!.x, L.tents[1]!.y, L.tents[1]!.rot, '#5a4a32'));
  doc.add(tent(L.tents[2]!.x, L.tents[2]!.y, L.tents[2]!.rot, '#7a5a2a'));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const lx = L.campfire.x + Math.cos(a) * 95;
    const ly = L.campfire.y + Math.sin(a) * 95;
    doc.add(g({ transform: `translate(${n(lx)} ${n(ly)}) rotate(${n((a * 180) / Math.PI + 90)})` }, [rect(-45 + 6, -12 + 8, 90, 24, { fill: '#000', opacity: 0.35, rx: 12 }), rect(-45, -12, 90, 24, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2, rx: 12 }), ellipse(-45, 0, 6, 12, { fill: '#a07a4a' })]));
  }
  doc.add(campfire(doc, rng, L.campfire.x, L.campfire.y, 30));
  doc.add(crate(1300, 620, 34, 18), crate(1320, 660, 28, -10), barrel(doc, 960, 700, 20), bones(rng, 1180, 760, 6, 30));

  // Fairy ring and the fallen log.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const mx = L.fairyRing.x + Math.cos(a) * L.fairyRing.r;
    const my = L.fairyRing.y + Math.sin(a) * L.fairyRing.r;
    doc.add(circle(mx, my, 9, { fill: '#c43d33', stroke: '#5a1a14', strokeWidth: 1.5 }), circle(mx - 2, my - 2, 2, { fill: '#fbf6ea' }), circle(mx + 3, my + 1, 1.5, { fill: '#fbf6ea' }));
  }
  doc.add(glow(doc, 'fairyGlow', '#b8ff9a', L.fairyRing.x, L.fairyRing.y, 120, 0.35));
  const log = L.fallenLog;
  doc.add(
    g({ transform: `translate(${log.x} ${log.y}) rotate(${log.rot})` }, [
      rect(-log.len / 2 + 12, -24 + 16, log.len, 48, { fill: '#000', opacity: 0.4, rx: 24 }),
      rect(-log.len / 2, -24, log.len, 48, { fill: '#5a3e22', stroke: '#2a1a0e', strokeWidth: 3, rx: 22 }),
      line(-log.len / 2 + 20, -8, log.len / 2 - 30, -10, { stroke: '#3a2614', strokeWidth: 3 }),
      line(-log.len / 2 + 30, 10, log.len / 2 - 20, 8, { stroke: '#3a2614', strokeWidth: 3 }),
      ellipse(log.len / 2 - 4, 0, 12, 23, { fill: '#a07a4a', stroke: '#5a3e22', strokeWidth: 2 }),
      ellipse(log.len / 2 - 4, 0, 6, 12, { fill: 'none', stroke: '#6b4a2a', strokeWidth: 1.5 }),
      circle(-30, -18, 8, { fill: '#4a7a3a' }),
      circle(40, 16, 10, { fill: '#4a7a3a' }),
    ]),
  );

  const mainS = sampleSpline(L.mainPath, 10);
  const southS = sampleSpline(L.southPath, 10);
  const streamS = sampleSpline(L.stream, 10);
  const blocked = (p: Pt, r: number): boolean => {
    if (distanceToPolyline(p, mainS) < 46 + r * 0.55) return true;
    if (distanceToPolyline(p, southS) < 40 + r * 0.55) return true;
    if (distanceToPolyline(p, streamS) < 34 + r * 0.6) return true;
    const dx = (p.x - L.clearing.x) / (L.clearing.rx + r * 0.8);
    const dy = (p.y - L.clearing.y) / (L.clearing.ry + r * 0.8);
    if (dx * dx + dy * dy < 1) return true;
    if (Math.hypot(p.x - L.fairyRing.x, p.y - L.fairyRing.y) < L.fairyRing.r + r + 10) return true;
    if (Math.hypot(p.x - log.x, p.y - log.y) < log.len / 2 + r * 0.5) return true;
    return false;
  };
  // Undergrowth.
  for (let i = 0; i < 160; i++) {
    const p = { x: rng.range(0, L.width), y: rng.range(0, L.height) };
    if (blocked(p, 10)) continue;
    doc.add(fern(rng, p.x, p.y, rng.range(10, 20), rng.pick(['#4f7a3a', '#3f6a2e', '#6a8a3a'])));
  }
  const rocks = scatter(rng, L.width, L.height, 80, [14, 34], (p, r) => !blocked(p, r) && rng.chance(0.4));
  for (const r of rocks) doc.add(rock(doc, rng, r.x, r.y, r.r, GRAY_ROCK));
  const bushes = scatter(rng, L.width, L.height, 260, [16, 30], (p, r) => !blocked(p, r));
  for (const bsh of bushes) doc.add(bush(doc, rng, bsh.x, bsh.y, bsh.r, rng.chance(0.3) ? PINE : OAK, rng.chance(0.15) ? '#3d5bd9' : undefined));
  const trees = scatter(rng, L.width, L.height, 2600, [42, 96], (p, r) => !blocked(p, r), 0.62);
  for (const t of trees) {
    const roll = rng.next();
    if (roll < 0.35) doc.add(pine(doc, rng, t.x, t.y, t.r * 0.95));
    else doc.add(tree(doc, rng, t.x, t.y, t.r, roll > 0.92 ? AUTUMN : OAK));
  }
  // Fireflies.
  for (let i = 0; i < 40; i++) {
    const p = rng.pick(streamS);
    doc.add(circle(p.x + rng.jitter(120), p.y + rng.jitter(120), rng.range(1.5, 3), { fill: '#e8ff9a', opacity: rng.range(0.4, 0.9) }));
  }
  doc.add(vignette(doc, L.width, L.height, 0.6));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Montañas Cenicientas
// ---------------------------------------------------------------------------

export function buildMountains(): string {
  const L = MOUNTAINS;
  const rng = createRng('map-montanas');
  const doc = new SvgDoc(L.width, L.height, 'Montañas Cenicientas');
  const ash = speckleTexture(doc, rng, 'ashSpeckle', ['#2a2522', '#6a605a', '#8a7a6a', '#1a1614'], 170, 140);
  doc.add(terrain(rng, L.width, L.height, { base: '#4a423c', blotches: ['#3a3430', '#5a504a', '#2e2826', '#6a5a4a', '#3a2a22'], count: 170, texture: ash }));
  // Scorched patches.
  for (let i = 0; i < 26; i++) doc.add(ellipse(rng.range(0, L.width), rng.range(0, L.height), rng.range(40, 140), rng.range(30, 90), { fill: '#16110e', opacity: rng.range(0.15, 0.35) }));
  for (const c of L.cracks) doc.add(lavaCrack(c, rng.range(4, 7)));
  // Cliff around the cave mouth (the path climbs over it into the cave).
  const m = L.caveMouth;
  const cliff = blobPoints(rng, m.x, m.y - 50, m.rx * 2.1, m.ry * 2.0, 16, 0.16);
  doc.add(path(smoothPath(cliff), { fill: '#2e2826', stroke: '#141110', strokeWidth: 6 }));
  doc.add(road(rng, L.path, 62, { edge: '#2a2420', fill: '#6d6055', light: '#8f8070', pebble: '#3a3430' } satisfies RoadStyle, 140));
  doc.add(lavaPool(doc, rng, L.lavaPool.x, L.lavaPool.y, L.lavaPool.rx, L.lavaPool.ry));

  // Cave mouth.
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i / 9) * Math.PI;
    doc.add(rock(doc, rng, m.x + Math.cos(a) * m.rx * 1.45, m.y + Math.sin(a) * m.ry * 1.55, rng.range(34, 56), ASH_ROCK));
  }
  doc.add(ellipse(m.x, m.y, m.rx, m.ry, { fill: doc.def('caveMouthGrad', radialGradient('caveMouthGrad', [[0, '#000000'], [0.7, '#0d0908'], [1, '#2a201a']])) }));
  for (let i = 0; i < 9; i++) {
    const x = m.x - m.rx * 0.8 + (i / 8) * m.rx * 1.6;
    const top = m.y - Math.sqrt(Math.max(0, 1 - ((x - m.x) / m.rx) ** 2)) * m.ry;
    doc.add(path(`M${n(x - 9)} ${n(top + 2)}L${n(x)} ${n(top + rng.range(20, 34))}L${n(x + 9)} ${n(top + 2)}Z`, { fill: '#3a322c' }));
  }
  doc.add(glow(doc, 'caveEmber', '#ff5a1f', m.x, m.y + 10, 80, 0.35));
  doc.add(bones(rng, m.x - 60, m.y + 120, 12, 70), bones(rng, m.x + 80, m.y + 90, 6, 40));

  // Cliffs and rocks along the edges; charred trees.
  const pathS = sampleSpline(L.path, 10);
  const blocked = (p: Pt, r: number): boolean => {
    if (distanceToPolyline(p, pathS) < 50 + r) return true;
    const dx = (p.x - L.lavaPool.x) / (L.lavaPool.rx * 1.3 + r);
    const dy = (p.y - L.lavaPool.y) / (L.lavaPool.ry * 1.3 + r);
    if (dx * dx + dy * dy < 1) return true;
    if (Math.hypot(p.x - m.x, p.y - m.y) < m.rx * 1.9 + r) return true;
    return false;
  };
  const big = scatter(rng, L.width, L.height, 700, [60, 140], (p, r) => !blocked(p, r) && edgeDistance(p, L.width, L.height) < 220 && rng.chance(0.7), 0.7);
  for (const r of big) doc.add(rock(doc, rng, r.x, r.y, r.r, ASH_ROCK));
  const small = scatter(rng, L.width, L.height, 300, [14, 40], (p, r) => !blocked(p, r) && rng.chance(0.5));
  for (const r of small) doc.add(rock(doc, rng, r.x, r.y, r.r, rng.chance(0.3) ? GRAY_ROCK : ASH_ROCK));
  const charred = scatter(rng, L.width, L.height, 80, [40, 70], (p, r) => !blocked(p, r) && rng.chance(0.35));
  for (const t of charred.slice(0, 12)) doc.add(deadTree(doc, rng, t.x, t.y, t.r, '#120f0d'));
  for (let i = 0; i < 120; i++) doc.add(circle(rng.range(0, L.width), rng.range(0, L.height), rng.range(1.2, 2.8), { fill: rng.pick(['#ff9a3c', '#ffcf5a', '#ff5a1f']), opacity: rng.range(0.4, 0.9) }));
  doc.add(vignette(doc, L.width, L.height, 0.55, '#120806'));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Cruce de caminos (template)
// ---------------------------------------------------------------------------

export function buildCrossroads(): string {
  const L = CROSSROADS;
  const rng = createRng('map-cruce');
  const doc = new SvgDoc(L.width, L.height, 'Cruce de caminos');
  const grass = grassTexture(doc, rng, 'grassCross', '#a8c870', '#4a6b2a');
  doc.add(terrain(rng, L.width, L.height, { base: '#6a9142', blotches: ['#5a8238', '#7aa04e', '#8fae5a', '#4f7432'], count: 90, texture: grass }));
  doc.add(road(rng, L.roadA, 70, DIRT_ROAD, 90));
  doc.add(road(rng, L.roadB, 66, DIRT_ROAD, 90));
  // Signpost.
  const s = L.signpost;
  doc.add(softShadow(doc, s.x + 30, s.y + 20, 70, 20, 0.45));
  doc.add(g({ transform: `translate(${s.x} ${s.y})` }, [rect(-56, -9, 112, 18, { fill: '#8a6236', stroke: '#3d2a14', strokeWidth: 2.5, transform: 'rotate(18)' }), rect(-56, -9, 112, 18, { fill: '#9a7246', stroke: '#3d2a14', strokeWidth: 2.5, transform: 'rotate(-62)' }), circle(0, 0, 11, { fill: '#5a3e22', stroke: '#2a1a0e', strokeWidth: 2 })]));
  // Roadside shrine.
  const sh = L.shrine;
  doc.add(softShadow(doc, sh.x + 14, sh.y + 16, 60, 50, 0.5), rect(sh.x - 40, sh.y - 34, 80, 68, { fill: '#8b877e', stroke: '#2f2c27', strokeWidth: 3, rx: 6 }), rect(sh.x - 28, sh.y - 22, 56, 44, { fill: '#6d6a63', rx: 4 }), candle(doc, sh.x - 12, sh.y, 5), candle(doc, sh.x + 12, sh.y + 4, 4), flowers(rng, sh.x, sh.y + 52, 30, 20, ['#f3ead6', '#e9c063', '#d96a8a']));
  const aS = sampleSpline(L.roadA, 10);
  const bS = sampleSpline(L.roadB, 10);
  const blocked = (p: Pt, r: number): boolean => distanceToPolyline(p, aS) < 60 + r * 0.6 || distanceToPolyline(p, bS) < 60 + r * 0.6 || Math.hypot(p.x - sh.x, p.y - sh.y) < 80 + r || Math.hypot(p.x - s.x, p.y - s.y) < 60 + r;
  const rocks = scatter(rng, L.width, L.height, 50, [14, 30], (p, r) => !blocked(p, r) && rng.chance(0.5));
  for (const r of rocks) doc.add(rock(doc, rng, r.x, r.y, r.r));
  const bushes = scatter(rng, L.width, L.height, 120, [14, 26], (p, r) => !blocked(p, r) && rng.chance(0.6));
  for (const bsh of bushes) doc.add(bush(doc, rng, bsh.x, bsh.y, bsh.r, OAK, rng.chance(0.3) ? '#c43d33' : undefined));
  const trees = scatter(rng, L.width, L.height, 700, [40, 80], (p, r) => !blocked(p, r) && rng.chance(edgeDistance(p, L.width, L.height) < 250 ? 0.9 : 0.25));
  for (const t of trees) doc.add(rng.chance(0.25) ? pine(doc, rng, t.x, t.y, t.r * 0.9) : tree(doc, rng, t.x, t.y, t.r, OAK));
  for (let i = 0; i < 8; i++) doc.add(flowers(rng, rng.range(100, 1300), rng.range(100, 1300), 24, 12, ['#e9c063', '#f3ead6', '#a98bff', '#d96a8a']));
  doc.add(vignette(doc, L.width, L.height, 0.3));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Cementerio de Valdris
// ---------------------------------------------------------------------------

function mausoleum(r: RectSpec, stone: string, doorSide: 'bottom' | 'top' = 'bottom'): string {
  const parts: string[] = [
    rect(r.x + 16, r.y + 20, r.w, r.h, { fill: '#000000', opacity: 0.45 }),
    rect(r.x - 8, r.y - 8, r.w + 16, r.h + 16, { fill: shade(stone, -0.45), rx: 4 }),
    rect(r.x, r.y, r.w, r.h / 2, { fill: shade(stone, 0.1) }),
    rect(r.x, r.y + r.h / 2, r.w, r.h / 2, { fill: shade(stone, -0.15) }),
    line(r.x, r.y + r.h / 2, r.x + r.w, r.y + r.h / 2, { stroke: shade(stone, -0.55), strokeWidth: 5 }),
    rect(r.x, r.y, r.w, r.h, { fill: 'none', stroke: shade(stone, -0.6), strokeWidth: 3 }),
  ];
  for (let x = r.x + 20; x < r.x + r.w; x += 20) parts.push(line(x, r.y, x, r.y + r.h, { stroke: shade(stone, -0.4), strokeWidth: 1, opacity: 0.5 }));
  const dy = doorSide === 'bottom' ? r.y + r.h + 4 : r.y - 22;
  parts.push(rect(r.x + r.w / 2 - 26, dy, 52, 18, { fill: '#2a2622', stroke: '#141210', strokeWidth: 2 }));
  return parts.join('');
}

export function buildCemetery(): string {
  const L = CEMETERY;
  const rng = createRng('map-cementerio');
  const doc = new SvgDoc(L.width, L.height, 'Cementerio de Valdris');
  const grass = grassTexture(doc, rng, 'grassNight', '#5a7a5a', '#141f16');
  doc.add(terrain(rng, L.width, L.height, { base: '#2c3a2c', blotches: ['#243024', '#38463a', '#1f2a22', '#4a4a3a', '#2a2a22'], count: 150, texture: grass }));
  const gravel: RoadStyle = { edge: '#1f1c18', fill: '#5f5a50', light: '#7d776a', pebble: '#3a3630' };
  doc.add(road(rng, L.mainPath, 66, gravel, 120));
  doc.add(road(rng, L.branchPath, 52, gravel, 60));

  // Chapel ruin (exterior).
  const c = L.chapel;
  const floor = flagstoneTexture(doc, rng, 'chapelFloorOut', '#5d5a52', '#2a2824');
  doc.add(rect(c.x, c.y, c.w, c.h, { fill: floor }));
  for (let i = 0; i < 30; i++) doc.add(ellipse(c.x + rng.range(0, c.w), c.y + rng.range(0, c.h), rng.range(10, 40), rng.range(8, 24), { fill: '#3a4a32', opacity: 0.6 }));
  const wallStyle = { stroke: '#6d6a63', strokeWidth: 22, strokeLinecap: 'square' as const };
  const wallDark = { stroke: '#22201c', strokeWidth: 30, strokeLinecap: 'square' as const };
  const chapelWalls: [number, number, number, number][] = [
    [c.x, c.y, c.x + c.w * 0.45, c.y],
    [c.x + c.w * 0.62, c.y, c.x + c.w, c.y],
    [c.x + c.w, c.y, c.x + c.w, L.chapelDoor.y - 40],
    [c.x + c.w, L.chapelDoor.y + 40, c.x + c.w, c.y + c.h],
    [c.x + c.w, c.y + c.h, c.x + c.w * 0.3, c.y + c.h],
    [c.x, c.y + c.h, c.x, c.y + c.h * 0.55],
    [c.x, c.y + c.h * 0.35, c.x, c.y],
  ];
  for (const [x1, y1, x2, y2] of chapelWalls) doc.add(line(x1, y1, x2, y2, wallDark), line(x1, y1, x2, y2, wallStyle));
  for (const [x, y] of [
    [c.x + c.w * 0.53, c.y],
    [c.x + c.w * 0.15, c.y + c.h],
    [c.x, c.y + c.h * 0.45],
  ] as [number, number][]) {
    for (let i = 0; i < 6; i++) doc.add(rock(doc, rng, x + rng.jitter(40), y + rng.jitter(30), rng.range(10, 22), GRAY_ROCK));
  }
  for (let i = 0; i < 4; i++) doc.add(rect(c.x + 60, c.y + 120 + i * 70, 90, 24, { fill: '#4a3a28', stroke: '#1e160e', strokeWidth: 2, transform: `rotate(${n(rng.jitter(10))} ${c.x + 105} ${c.y + 132 + i * 70})` }));
  doc.add(rect(c.x + c.w / 2 - 50, c.y + 30, 100, 40, { fill: '#7d786e', stroke: '#2f2c27', strokeWidth: 2 }));
  doc.add(rect(c.x + c.w - 6, L.chapelDoor.y - 40, 12, 80, { fill: '#5a3e22', stroke: '#1e140a', strokeWidth: 2, transform: `rotate(-25 ${c.x + c.w} ${L.chapelDoor.y - 40})` }));

  // Crypt entrance (large mausoleum with stairs down).
  const k = L.crypt;
  doc.add(mausoleum(k, '#7a766e'));
  for (let i = 0; i < 4; i++) doc.add(circle(k.x + 30 + i * ((k.w - 60) / 3), k.y + k.h + 14, 14, { fill: '#8b877e', stroke: '#2f2c27', strokeWidth: 2 }));
  const stairsGrad = doc.def('cryptStairs', linearGradient('cryptStairs', [[0, '#050404'], [1, '#5f5a50']]));
  doc.add(rect(L.cryptTransition.x - 70, k.y + k.h + 2, 140, 70, { fill: stairsGrad, stroke: '#141210', strokeWidth: 3 }));
  for (let i = 1; i < 6; i++) doc.add(line(L.cryptTransition.x - 70, k.y + k.h + 2 + i * 12, L.cryptTransition.x + 70, k.y + k.h + 2 + i * 12, { stroke: '#141210', strokeWidth: 2, opacity: 0.7 }));
  doc.add(path(`M${k.x + k.w / 2 - 40} ${k.y + k.h / 2 - 30}h80M${k.x + k.w / 2} ${k.y + k.h / 2 - 60}v60`, { stroke: '#3a3630', strokeWidth: 8 }));
  for (const lx of [k.x + 60, k.x + k.w - 60]) doc.add(circle(lx, k.y + k.h + 50, 18, { fill: '#3a3630', stroke: '#141210', strokeWidth: 3 }), glow(doc, 'ghostFire', '#6fffd2', lx, k.y + k.h + 50, 50, 0.85), circle(lx, k.y + k.h + 48, 7, { fill: '#d8fff2' }));

  for (const mz of L.mausoleums) doc.add(mausoleum(mz, '#6d6a63'));

  // Graves in rows.
  const mainS = sampleSpline(L.mainPath, 10);
  const branchS = sampleSpline(L.branchPath, 10);
  const graveBlocked = (p: Pt): boolean =>
    distanceToPolyline(p, mainS) < 90 ||
    distanceToPolyline(p, branchS) < 80 ||
    inRect(p, c, 70) ||
    inRect(p, k, 90) ||
    L.mausoleums.some((mz) => inRect(p, mz, 60)) ||
    L.deadTrees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 90) ||
    p.x < 140 || p.x > L.width - 140 || p.y < 160 || p.y > L.height - 160;
  for (let y = 220; y < L.height - 120; y += 150) {
    for (let x = 170; x < L.width - 120; x += 105) {
      const p = { x: x + rng.jitter(12), y: y + rng.jitter(14) };
      if (graveBlocked(p) || rng.chance(0.12)) continue;
      const roll = rng.next();
      doc.add(gravestone(rng, p.x, p.y, rng.jitter(6), roll < 0.06 ? 'open' : roll < 0.3 ? 'cross' : 'stone'));
    }
  }
  for (const t of L.deadTrees) doc.add(deadTree(doc, rng, t.x, t.y, rng.range(70, 100)));
  doc.add(bones(rng, 1400, 900, 5, 40), bones(rng, 700, 520, 4, 30));

  // Iron fence with the gate.
  const f = L.fence;
  const fence: string[] = [];
  const fencePath = (x1: number, y1: number, x2: number, y2: number): void => {
    fence.push(line(x1, y1, x2, y2, { stroke: '#151515', strokeWidth: 5 }));
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d <= len; d += 36) {
      const t = d / len;
      fence.push(circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4, { fill: '#2a2a2a', stroke: '#050505', strokeWidth: 1 }));
    }
  };
  fencePath(f.x, f.y, f.x + f.w, f.y);
  fencePath(f.x + f.w, f.y, f.x + f.w, f.y + f.h);
  fencePath(f.x + f.w, f.y + f.h, L.gate.to, f.y + f.h);
  fencePath(L.gate.from, f.y + f.h, f.x, f.y + f.h);
  fencePath(f.x, f.y + f.h, f.x, f.y);
  fence.push(line(L.gate.from, f.y + f.h, L.gate.from + 30, f.y + f.h - 50, { stroke: '#1a1a1a', strokeWidth: 6 }), line(L.gate.to, f.y + f.h, L.gate.to - 30, f.y + f.h - 50, { stroke: '#1a1a1a', strokeWidth: 6 }));
  doc.add(fence.join(''));
  for (const lx of [L.gate.from - 5, L.gate.to + 5]) doc.add(rect(lx - 12, f.y + f.h - 12, 24, 24, { fill: '#3a3630', stroke: '#141210', strokeWidth: 2 }), glow(doc, 'lanternGlow', '#ffcc66', lx, f.y + f.h, 70, 0.8), circle(lx, f.y + f.h, 6, { fill: '#fff0b0' }));

  doc.add(fogPatches(doc, rng, L.width, L.height, 40, '#c8d4e0', [0.07, 0.2]));
  doc.add(vignette(doc, L.width, L.height, 0.7, '#05070d'));
  return doc.render();
}

// Shared tiny helpers for other modules.
export { fenceLine, flowers, scatter, fern, edgeDistance };
export type { Placed };
