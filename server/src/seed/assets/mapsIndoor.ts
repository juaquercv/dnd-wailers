import {
  CAVE_ROCK,
  GRAY_ROCK,
  arcaneCircle,
  barrel,
  bed,
  bones,
  bookshelf,
  candle,
  chest,
  coins,
  cobbleTexture,
  crate,
  flagstoneTexture,
  gemstone,
  grassTexture,
  gravestone,
  lavaPool,
  plankTexture,
  rock,
  roundTable,
  rug,
  speckleTexture,
  terrain,
  wallTorch,
} from './brushes';
import { CAVE, CELL, CHAPEL, CRYPT_UPPER, OSSUARY, SMALL_CAVE, TAVERN, TOWER, cellRectPx, type GridDungeon, type RectSpec, type WallSpec } from './layouts';
import { createRng, type Prng } from './rng';
import {
  SvgDoc,
  blobPoints,
  circle,
  ellipse,
  g,
  glow,
  line,
  linearGradient,
  n,
  path,
  pointInPolygon,
  polyPath,
  radialGradient,
  rect,
  regularPolygon,
  shade,
  smoothPath,
  softShadow,
  tag,
  vary,
  vignette,
  type Pt,
} from './svg';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface WallStyle {
  outer: string;
  inner: string;
  light: string;
  width: number;
}

const WOOD_WALL: WallStyle = { outer: '#1a120b', inner: '#5e442c', light: '#8a6a4a', width: 20 };
const STONE_WALL: WallStyle = { outer: '#050404', inner: '#4f4a43', light: '#79726a', width: 22 };

function pointsToPath(points: number[]): string {
  let d = '';
  for (let i = 0; i + 1 < points.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${n(points[i]!)} ${n(points[i + 1]!)}`;
  return d;
}

function drawWalls(walls: WallSpec[], style: WallStyle): string {
  const parts: string[] = [];
  const solid = walls.filter((w) => w.kind === 'wall');
  for (const w of solid) parts.push(path(pointsToPath(w.points), { fill: 'none', stroke: style.outer, strokeWidth: style.width + 8, strokeLinecap: 'square', strokeLinejoin: 'round' }));
  for (const w of solid) parts.push(path(pointsToPath(w.points), { fill: 'none', stroke: style.inner, strokeWidth: style.width, strokeLinecap: 'square', strokeLinejoin: 'round' }));
  for (const w of solid) parts.push(path(pointsToPath(w.points), { fill: 'none', stroke: style.light, strokeWidth: style.width * 0.22, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.45 }));
  for (const w of walls) {
    const d = pointsToPath(w.points);
    if (w.kind === 'door') {
      parts.push(
        path(d, { fill: 'none', stroke: style.outer, strokeWidth: style.width * 0.75, strokeLinecap: 'butt' }),
        path(d, { fill: 'none', stroke: '#8a5a2a', strokeWidth: style.width * 0.5, strokeLinecap: 'butt' }),
        path(d, { fill: 'none', stroke: '#3a2412', strokeWidth: style.width * 0.5, strokeDasharray: '2 14', strokeLinecap: 'butt' }),
      );
      const [x1, y1] = [w.points[0]!, w.points[1]!];
      const [x2, y2] = [w.points[w.points.length - 2]!, w.points[w.points.length - 1]!];
      parts.push(circle(x1, y1, 5, { fill: '#9a9a9a', stroke: '#2a2a2a', strokeWidth: 1.5 }), circle(x2, y2, 5, { fill: '#9a9a9a', stroke: '#2a2a2a', strokeWidth: 1.5 }));
    } else if (w.kind === 'window') {
      parts.push(path(d, { fill: 'none', stroke: style.outer, strokeWidth: style.width * 0.7, strokeLinecap: 'butt' }), path(d, { fill: 'none', stroke: '#a8d0e6', strokeWidth: style.width * 0.3, strokeLinecap: 'butt', opacity: 0.9 }));
    }
  }
  return parts.join('');
}

function cobweb(x: number, y: number, r: number, start: number, span: number): string {
  const spokes = 6;
  const parts: string[] = [];
  for (let i = 0; i <= spokes; i++) {
    const a = start + (i / spokes) * span;
    parts.push(line(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, { stroke: '#d8d8d8', strokeWidth: 0.9, opacity: 0.5 }));
  }
  for (let k = 1; k <= 4; k++) {
    const rr = (k / 4) * r;
    let d = '';
    for (let i = 0; i <= spokes; i++) {
      const a = start + (i / spokes) * span;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      d += `${i === 0 ? 'M' : 'L'}${n(px)} ${n(py)}`;
    }
    parts.push(path(d, { fill: 'none', stroke: '#d8d8d8', strokeWidth: 0.8, opacity: 0.45 }));
  }
  return parts.join('');
}

function skullPile(rng: Prng, x: number, y: number, count: number, spread: number): string {
  const parts: string[] = [];
  const items = Array.from({ length: count }, () => ({ x: x + rng.jitter(spread), y: y + rng.jitter(spread * 0.6), r: rng.range(6, 9) })).sort((a, b) => a.y - b.y);
  for (const s of items) {
    const c = vary(rng, '#d8ccb0', 0.08);
    parts.push(circle(s.x + 2, s.y + 3, s.r, { fill: '#000', opacity: 0.35 }), circle(s.x, s.y, s.r, { fill: c, stroke: '#6a604c', strokeWidth: 1 }), circle(s.x - s.r * 0.35, s.y - s.r * 0.1, s.r * 0.25, { fill: '#1a1612' }), circle(s.x + s.r * 0.35, s.y - s.r * 0.1, s.r * 0.25, { fill: '#1a1612' }));
  }
  return parts.join('');
}

function brazier(doc: SvgDoc, x: number, y: number, color: string, core: string): string {
  return [
    softShadow(doc, x + 8, y + 10, 30, 26, 0.5),
    circle(x, y, 22, { fill: '#3a3630', stroke: '#141210', strokeWidth: 3 }),
    glow(doc, `brazier${color.replace('#', '')}`, color, x, y, 70, 0.85),
    circle(x, y, 13, { fill: color }),
    circle(x, y - 2, 6, { fill: core }),
  ].join('');
}

function stairs(doc: SvgDoc, r: RectSpec, direction: 'up' | 'down', axis: 'vertical' | 'horizontal' = 'vertical'): string {
  const id = `stairs-${direction}-${axis}`;
  const light = '#8b857a';
  const dark = '#080706';
  const grad = doc.def(id, linearGradient(id, direction === 'up' ? [[0, light], [1, '#4a453e']] : [[0, '#4a453e'], [1, dark]], 0, 0, axis === 'vertical' ? 0 : 1, axis === 'vertical' ? 1 : 0));
  const parts: string[] = [rect(r.x, r.y, r.w, r.h, { fill: grad, stroke: '#141210', strokeWidth: 3 })];
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    if (axis === 'vertical') parts.push(line(r.x, r.y + (i / steps) * r.h, r.x + r.w, r.y + (i / steps) * r.h, { stroke: '#141210', strokeWidth: 2, opacity: 0.65 }));
    else parts.push(line(r.x + (i / steps) * r.w, r.y, r.x + (i / steps) * r.w, r.y + r.h, { stroke: '#141210', strokeWidth: 2, opacity: 0.65 }));
  }
  return parts.join('');
}

function annularSector(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
  const p = (r: number, a: number): string => `${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M${p(r2, a1)}A${n(r2)} ${n(r2)} 0 ${large} 1 ${p(r2, a2)}L${p(r1, a2)}A${n(r1)} ${n(r1)} 0 ${large} 0 ${p(r1, a1)}Z`;
}

function randomInPolygon(rng: Prng, poly: Pt[], box: RectSpec): Pt {
  for (let i = 0; i < 200; i++) {
    const p = { x: box.x + rng.next() * box.w, y: box.y + rng.next() * box.h };
    if (pointInPolygon(p, poly)) return p;
  }
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

// ---------------------------------------------------------------------------
// Taberna El Jabalí Dorado
// ---------------------------------------------------------------------------

export function buildTavern(): string {
  const L = TAVERN;
  const rng = createRng('map-taberna');
  const doc = new SvgDoc(L.width, L.height, 'Taberna El Jabalí Dorado');
  doc.add(terrain(doc, rng, L.width, L.height, { base: '#3d3a33', blotches: ['#2e2b26', '#4a463e'], count: 30, texture: cobbleTexture(doc, rng, 'cobbleStreet', '#6d6a63', '#2e2b26') }));
  doc.add(rect(L.shell.x - 14, L.shell.y - 14, L.shell.w + 28, L.shell.h + 28, { fill: '#000000', opacity: 0.5 }));

  // Floors.
  doc.add(rect(L.hall.x, L.hall.y, L.hall.w, L.hall.h, { fill: plankTexture(doc, rng, 'planksHall', '#7a5634') }));
  doc.add(rect(L.kitchen.x, L.kitchen.y, L.kitchen.w, L.kitchen.h, { fill: flagstoneTexture(doc, rng, 'kitchenStone', '#7d776c', '#3a362f') }));
  doc.add(rect(L.room1.x, L.room1.y, L.room1.w, L.room1.h, { fill: plankTexture(doc, rng, 'planksRoom', '#6b4a2c') }));
  doc.add(rect(L.room2.x, L.room2.y, L.room2.w, L.room2.h, { fill: 'url(#planksRoom)' }));
  for (let i = 0; i < 40; i++) doc.add(ellipse(L.hall.x + rng.range(0, L.hall.w), L.hall.y + rng.range(0, L.hall.h), rng.range(8, 30), rng.range(5, 18), { fill: '#2a1a0e', opacity: rng.range(0.08, 0.2) }));
  doc.add(rug(doc, L.rug, '#7a1f1f', '#d4a63f'));
  doc.add(rug(doc, { x: 1250, y: 860, w: 150, h: 150 }, '#1f3f7a', '#cdb98f'));

  // Fireplace on the west wall.
  const fp = L.fireplace;
  doc.add(rect(fp.x, fp.y - 20, fp.w + 26, fp.h + 40, { fill: '#5d5a54', stroke: '#2a2622', strokeWidth: 3 }));
  for (let i = 0; i < 6; i++) doc.add(rect(fp.x + 2, fp.y - 18 + i * 30, fp.w + 22, 28, { fill: vary(rng, '#6d6a63', 0.12), stroke: '#2a2622', strokeWidth: 1.5 }));
  doc.add(rect(fp.x + 8, fp.y + 14, fp.w - 4, fp.h - 28, { fill: '#1a120c' }));
  doc.add(glow(doc, 'hearthGlow', '#ff8a2a', fp.x + 60, fp.y + fp.h / 2, 190, 0.6));
  doc.add(path(smoothPath(blobPoints(rng, fp.x + 34, fp.y + fp.h / 2, 22, 46, 9, 0.3)), { fill: doc.def('hearthFire', radialGradient('hearthFire', [[0, '#fff3c0'], [0.4, '#ffb030'], [1, '#d23a0a']])) }));
  for (let i = 0; i < 3; i++) doc.add(line(fp.x + 20, fp.y + 40 + i * 30, fp.x + 50, fp.y + 50 + i * 28, { stroke: '#3a2412', strokeWidth: 8, strokeLinecap: 'round' }));

  // Bar counter, back shelf with bottles, kegs.
  const bs = L.backShelf;
  doc.add(rect(bs.x, bs.y, bs.w, bs.h, { fill: '#3e2614', stroke: '#1e120a', strokeWidth: 2 }));
  for (let x = bs.x + 10; x < bs.x + bs.w - 6; x += 16) doc.add(circle(x, bs.y + bs.h / 2, 6, { fill: rng.pick(['#3f7a3a', '#7a2a1f', '#2a4a7a', '#c9a94a', '#5a2a6a']), stroke: '#111', strokeWidth: 1 }), circle(x - 2, bs.y + bs.h / 2 - 2, 1.6, { fill: '#ffffff', opacity: 0.6 }));
  const bar = L.bar;
  const barWood = doc.def('barWood', linearGradient('barWood', [[0, '#a4723f'], [1, '#6a4220']]));
  doc.add(rect(bar.x + 8, bar.y + 12, bar.w, bar.h, { fill: '#000', opacity: 0.4 }), rect(bar.x, bar.y, bar.w, bar.h, { fill: barWood, stroke: '#2a1a0e', strokeWidth: 3, rx: 4 }), rect(bar.x + 4, bar.y + 4, bar.w - 8, 8, { fill: '#ffffff', opacity: 0.12 }));
  for (let i = 0; i < 7; i++) {
    const mx = bar.x + 30 + i * 58 + rng.jitter(8);
    doc.add(circle(mx, bar.y + bar.h / 2, 9, { fill: '#c9c2b0', stroke: '#6f6a5c', strokeWidth: 1.5 }), circle(mx, bar.y + bar.h / 2, 6, { fill: '#d9a441' }));
  }
  for (const [x, y] of [
    [700, 150],
    [760, 150],
    [990, 150],
  ] as [number, number][])
    doc.add(barrel(doc, x, y, 24));
  doc.add(barrel(doc, 1075, 280, 22), barrel(doc, 1075, 330, 22), crate(doc, 1070, 390, 34, 6));

  for (const t of L.tables) doc.add(roundTable(doc, rng, t.x, t.y, 52));
  // Long table near the bar.
  doc.add(rect(360 + 8, 140 + 10, 160, 70, { fill: '#000', opacity: 0.35 }), rect(360, 140, 160, 70, { fill: barWood, stroke: '#2a1a0e', strokeWidth: 3, rx: 4 }));
  for (const sx of [380, 440, 500]) doc.add(circle(sx, 125, 13, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2 }), circle(sx, 225, 13, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2 }));
  doc.add(circle(420, 170, 9, { fill: '#c9c2b0' }), circle(470, 180, 9, { fill: '#c9c2b0' }), ellipse(440, 175, 16, 10, { fill: '#b8743a' }));

  // Kitchen.
  const kt = L.kitchenTable;
  doc.add(rect(kt.x + 8, kt.y + 10, kt.w, kt.h, { fill: '#000', opacity: 0.35 }), rect(kt.x, kt.y, kt.w, kt.h, { fill: '#8a6236', stroke: '#2a1a0e', strokeWidth: 3 }));
  doc.add(ellipse(kt.x + 50, kt.y + 45, 26, 16, { fill: '#c98a4a', stroke: '#6a3a1a', strokeWidth: 2 }), circle(kt.x + 110, kt.y + 40, 14, { fill: '#e8dcc0' }), circle(kt.x + 160, kt.y + 50, 10, { fill: '#c43d33' }), circle(kt.x + 175, kt.y + 35, 9, { fill: '#8fbf4a' }));
  const ov = L.oven;
  doc.add(rect(ov.x, ov.y, ov.w, ov.h, { fill: '#6d6a63', stroke: '#2a2622', strokeWidth: 3, rx: 8 }), rect(ov.x + 20, ov.y + 20, ov.w - 40, ov.h - 34, { fill: '#1a120c', rx: 6 }), glow(doc, 'ovenGlow', '#ff8a2a', ov.x + ov.w / 2, ov.y + ov.h / 2 + 6, 70, 0.8));
  doc.add(circle(1250, 150, 26, { fill: '#2a2a2a', stroke: '#111', strokeWidth: 3 }), circle(1250, 150, 18, { fill: '#7a5a2a' }), circle(1320, 150, 20, { fill: '#2a2a2a', stroke: '#111', strokeWidth: 3 }));
  for (let i = 0; i < 4; i++) doc.add(ellipse(1180 + i * 40, 440, 22, 28, { fill: '#cdb98f', stroke: '#7a6a4a', strokeWidth: 2 }));
  doc.add(barrel(doc, 1560, 260, 22), barrel(doc, 1560, 320, 22), barrel(doc, 1560, 380, 22));

  // Bedrooms.
  const blankets = ['#7a1f1f', '#2f5f3a', '#3a3a7a'];
  L.beds.forEach((b, i) => doc.add(bed(doc, b.x, b.y, b.w, b.h, blankets[i % blankets.length]!)));
  doc.add(chest(doc, 1190, 720, 60, 38), chest(doc, 1190, 1000, 60, 38, 4));
  doc.add(rect(1350, 540, 50, 40, { fill: '#6b4426', stroke: '#2a1a0e', strokeWidth: 2 }), candle(doc, 1375, 560));
  doc.add(rect(1300, 990, 120, 44, { fill: '#4a2e18', stroke: '#1e120a', strokeWidth: 2 }));

  doc.add(drawWalls(L.walls, WOOD_WALL));
  for (const l of L.lights) {
    if (l.radius >= 400 || (l.x > 1460 && l.y < 200)) continue;
    doc.add(wallTorch(doc, l.x, l.y));
  }
  // Doorstep and lantern outside.
  doc.add(rect(L.frontDoor.x - 45, L.frontDoor.y + 14, 90, 30, { fill: '#7a766c', stroke: '#2f2c27', strokeWidth: 2 }), wallTorch(doc, L.frontDoor.x + 80, L.frontDoor.y + 30));
  doc.add(vignette(doc, L.width, L.height, 0.4));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Caves
// ---------------------------------------------------------------------------

function caveBase(doc: SvgDoc, rng: Prng, w: number, h: number, outline: Pt[], floorBase: string): string {
  const parts: string[] = [];
  parts.push(terrain(doc, rng, w, h, { base: '#110e0c', blotches: ['#1c1714', '#0a0807', '#241d18'], count: 80, texture: speckleTexture(doc, rng, 'rockSpeckle', ['#2a231e', '#050404'], 150, 70) }));
  const clipId = 'caveFloorClip';
  doc.def(clipId, tag('clipPath', { id: clipId }, path(polyPath(outline))));
  const floor: string[] = [];
  floor.push(rect(0, 0, w, h, { fill: floorBase }));
  for (let i = 0; i < 120; i++) floor.push(ellipse(rng.range(0, w), rng.range(0, h), rng.range(30, 140), rng.range(20, 90), { fill: rng.pick(['#4a3f36', '#2e2620', '#56483c', '#3a2a20']), opacity: rng.range(0.2, 0.5) }));
  floor.push(rect(0, 0, w, h, { fill: speckleTexture(doc, rng, 'caveFloorSpeckle', ['#6a5a4a', '#1a1410', '#4a3a2a'], 140, 120) }));
  floor.push(path(polyPath(outline, false), { fill: 'none', stroke: '#000000', strokeWidth: 150, opacity: 0.4, strokeLinejoin: 'round' }));
  floor.push(path(polyPath(outline, false), { fill: 'none', stroke: '#000000', strokeWidth: 70, opacity: 0.35, strokeLinejoin: 'round' }));
  parts.push(g({ clipPath: `url(#${clipId})` }, floor));
  parts.push(path(polyPath(outline, false), { fill: 'none', stroke: '#070505', strokeWidth: 40, strokeLinejoin: 'round', strokeLinecap: 'round' }));
  parts.push(path(polyPath(outline, false), { fill: 'none', stroke: '#5a4c40', strokeWidth: 6, strokeLinejoin: 'round', opacity: 0.55 }));
  return parts.join('');
}

function caveEdgeRocks(doc: SvgDoc, rng: Prng, outline: Pt[], count: number, inward: number): string {
  const parts: string[] = [];
  let cx = 0;
  let cy = 0;
  for (const p of outline) {
    cx += p.x;
    cy += p.y;
  }
  cx /= outline.length;
  cy /= outline.length;
  for (let i = 0; i < count; i++) {
    const p = rng.pick(outline);
    if (p.x < 30) continue;
    const dx = cx - p.x;
    const dy = cy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = rng.range(inward * 0.6, inward * 1.4);
    const q = { x: p.x + (dx / d) * k, y: p.y + (dy / d) * k };
    if (!pointInPolygon(q, outline)) continue;
    parts.push(rock(doc, rng, q.x, q.y, rng.range(10, 26), CAVE_ROCK));
  }
  return parts.join('');
}

export function buildDragonCave(): string {
  const L = CAVE;
  const rng = createRng('map-cueva-dragon');
  const doc = new SvgDoc(L.width, L.height, 'Cueva del Dragón');
  const closed = [...L.outline];
  doc.add(caveBase(doc, rng, L.width, L.height, closed, '#3d342d'));
  // Daylight from the entrance.
  doc.add(ellipse(0, 720, 360, 220, { fill: doc.def('daylight', radialGradient('daylight', [[0, '#cfd8ff', 0.35], [1, '#cfd8ff', 0]])) }));
  // Dragon nest: scorched floor and claw marks.
  doc.add(ellipse(L.dragon.x, L.dragon.y, 260, 190, { fill: doc.def('scorch', radialGradient('scorch', [[0, '#0a0605', 0.85], [0.7, '#1a0f0a', 0.5], [1, '#1a0f0a', 0]])) }));
  for (let i = 0; i < 4; i++) {
    const x = L.dragon.x - 200 + rng.range(0, 400);
    const y = L.dragon.y - 140 + rng.range(0, 280);
    const a = rng.range(0, Math.PI);
    for (let k = -1; k <= 1; k++) {
      const ox = Math.cos(a + Math.PI / 2) * k * 10;
      const oy = Math.sin(a + Math.PI / 2) * k * 10;
      doc.add(line(x + ox, y + oy, x + ox + Math.cos(a) * 60, y + oy + Math.sin(a) * 60, { stroke: '#0a0605', strokeWidth: 4, strokeLinecap: 'round', opacity: 0.8 }));
    }
  }
  doc.add(lavaPool(doc, rng, L.lavaPool.x, L.lavaPool.y, L.lavaPool.rx, L.lavaPool.ry));
  doc.add(lavaPool(doc, rng, L.innerLava.x, L.innerLava.y, L.innerLava.rx, L.innerLava.ry));

  // Treasure hoard.
  const h = L.hoard;
  doc.add(ellipse(h.x, h.y, h.rx * 1.4, h.ry * 1.4, { fill: doc.def('hoardGlow', radialGradient('hoardGlow', [[0, '#ffd27a', 0.45], [1, '#ffd27a', 0]])) }));
  doc.add(ellipse(h.x, h.y, h.rx, h.ry, { fill: '#8a6a1a', opacity: 0.6 }));
  doc.add(coins(doc, rng, h.x, h.y, h.rx, h.ry, 520));
  doc.add(chest(doc, h.x - 150, h.y - 40, 70, 44, -12), chest(doc, h.x + 140, h.y + 30, 64, 40, 18), chest(doc, h.x + 20, h.y - 110, 60, 38, 4));
  for (let i = 0; i < 14; i++) doc.add(gemstone(h.x + rng.jitter(h.rx * 0.8), h.y + rng.jitter(h.ry * 0.8), rng.range(5, 9), rng.pick(['#e8473f', '#3d8bff', '#4fc24f', '#a35cff', '#ffffff'])));
  for (let i = 0; i < 5; i++) {
    const gx = h.x + rng.jitter(h.rx * 0.7);
    const gy = h.y + rng.jitter(h.ry * 0.7);
    doc.add(circle(gx, gy, 10, { fill: '#e9c063', stroke: '#7d5d1d', strokeWidth: 2 }), circle(gx, gy, 5, { fill: '#7d5d1d' }));
  }
  doc.add(g({ transform: `translate(${h.x - 60} ${h.y + 70}) rotate(-30)` }, [rect(-4, -60, 8, 90, { fill: '#c8c8d0', stroke: '#555', strokeWidth: 1.5 }), rect(-16, 26, 32, 6, { fill: '#e9c063' }), rect(-3, 32, 6, 18, { fill: '#5a3a1a' })]));
  doc.add(circle(h.x + 80, h.y - 50, 26, { fill: '#7a1f1f', stroke: '#e9c063', strokeWidth: 4 }), circle(h.x + 80, h.y - 50, 8, { fill: '#e9c063' }));

  // Pillars, edge rocks and bones.
  for (const p of L.pillars) {
    const c = p.reduce((acc, q) => ({ x: acc.x + q.x / p.length, y: acc.y + q.y / p.length }), { x: 0, y: 0 });
    doc.add(softShadow(doc, c.x + 18, c.y + 20, 70, 60, 0.6), path(smoothPath(p), { fill: '#2a2420', stroke: '#070505', strokeWidth: 8 }), path(smoothPath(p.map((q) => ({ x: c.x + (q.x - c.x) * 0.6 - 6, y: c.y + (q.y - c.y) * 0.6 - 6 })) ), { fill: '#4a3f36', opacity: 0.8 }));
  }
  doc.add(caveEdgeRocks(doc, rng, L.outline, 90, 50));
  doc.add(bones(rng, 1100, 700, 14, 70), bones(rng, 1450, 1000, 8, 60), bones(rng, 300, 950, 6, 50));
  doc.add(g({ transform: 'translate(1150 760) rotate(25)' }, [circle(0, 0, 24, { fill: '#7a6a4a', stroke: '#3a2a1a', strokeWidth: 3 }), circle(0, 0, 6, { fill: '#9a9a9a' })]));
  doc.add(vignette(doc, L.width, L.height, 0.6));
  return doc.render();
}

export function buildSmallCave(): string {
  const L = SMALL_CAVE;
  const rng = createRng('map-cueva-pequena');
  const doc = new SvgDoc(L.width, L.height, 'Cueva pequeña');
  doc.add(caveBase(doc, rng, L.width, L.height, L.outline, '#3a3430'));
  doc.add(ellipse(0, 490, 300, 180, { fill: doc.def('daylightSmall', radialGradient('daylightSmall', [[0, '#cfd8ff', 0.3], [1, '#cfd8ff', 0]])) }));
  const pool = L.pool;
  doc.add(path(smoothPath(blobPoints(rng, pool.x, pool.y, pool.rx + 14, pool.ry + 12, 10, 0.12)), { fill: '#2a2420' }));
  doc.add(path(smoothPath(blobPoints(rng, pool.x, pool.y, pool.rx, pool.ry, 10, 0.12)), { fill: doc.def('poolWater', radialGradient('poolWater', [[0, '#5fc8e8'], [0.6, '#2a6f8f'], [1, '#143a4f']])) }));
  doc.add(glow(doc, 'poolGlow', '#6fd0ff', pool.x, pool.y, 200, 0.35));
  for (let i = 0; i < 16; i++) {
    const mx = L.mushrooms.x + rng.jitter(70);
    const my = L.mushrooms.y + rng.jitter(50);
    doc.add(circle(mx, my, rng.range(5, 10), { fill: '#7fffb0', opacity: 0.85 }), circle(mx, my, 2.5, { fill: '#e8fff0' }));
  }
  doc.add(glow(doc, 'mushGlow', '#7fffb0', L.mushrooms.x, L.mushrooms.y, 140, 0.4));
  const c = L.pillar.reduce((acc, q) => ({ x: acc.x + q.x / L.pillar.length, y: acc.y + q.y / L.pillar.length }), { x: 0, y: 0 });
  doc.add(softShadow(doc, c.x + 16, c.y + 18, 64, 56, 0.6), path(smoothPath(L.pillar), { fill: '#2a2420', stroke: '#070505', strokeWidth: 8 }));
  doc.add(caveEdgeRocks(doc, rng, L.outline, 60, 45));
  doc.add(bones(rng, 760, 300, 6, 40));
  doc.add(vignette(doc, L.width, L.height, 0.55));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Torre del Hechicero
// ---------------------------------------------------------------------------

function towerFloor(doc: SvgDoc, rng: Prng, cx: number, cy: number, r: number, base: string): string {
  const parts: string[] = [circle(cx, cy, r, { fill: base })];
  const clipId = `towerFloor${r}`;
  doc.def(clipId, tag('clipPath', { id: clipId }, circle(cx, cy, r)));
  const inner: string[] = [];
  for (let i = 0; i < 50; i++) inner.push(ellipse(cx + rng.jitter(r), cy + rng.jitter(r), rng.range(20, 80), rng.range(14, 50), { fill: rng.pick(['#5a564e', '#8a857a', '#4a463f']), opacity: rng.range(0.15, 0.35) }));
  for (let rr = 140; rr <= r; rr += 70) inner.push(circle(cx, cy, rr, { fill: 'none', stroke: '#2f2c27', strokeWidth: 3 }));
  for (let rr = 140; rr <= r + 70; rr += 70) {
    const count = Math.max(8, Math.round((2 * Math.PI * rr) / 85));
    const offset = rng.range(0, Math.PI);
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      inner.push(line(cx + Math.cos(a) * (rr - 70), cy + Math.sin(a) * (rr - 70), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, { stroke: '#2f2c27', strokeWidth: 2.5 }));
    }
  }
  inner.push(circle(cx, cy, r, { fill: 'none', stroke: '#000', strokeWidth: 90, opacity: 0.35 }));
  parts.push(g({ clipPath: `url(#${clipId})` }, inner));
  return parts.join('');
}

function spiralStairs(x: number, y: number, r: number, direction: 'up' | 'down'): string {
  const parts: string[] = [circle(x, y, r + 8, { fill: '#1a1714', stroke: '#050404', strokeWidth: 4 })];
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const a1 = (i / steps) * Math.PI * 2;
    const a2 = ((i + 1) / steps) * Math.PI * 2;
    const t = i / (steps - 1);
    const shadeAmount = direction === 'up' ? -0.5 + t * 0.7 : 0.2 - t * 0.75;
    parts.push(path(annularSector(x, y, r * 0.22, r, a1, a2), { fill: shade('#7a756b', shadeAmount), stroke: '#141210', strokeWidth: 1.5 }));
  }
  parts.push(circle(x, y, r * 0.22, { fill: '#5d5a54', stroke: '#141210', strokeWidth: 3 }), circle(x, y, r, { fill: 'none', stroke: '#3a2412', strokeWidth: 5 }));
  return parts.join('');
}

export function buildTowerGround(): string {
  const L = TOWER;
  const rng = createRng('map-torre-baja');
  const doc = new SvgDoc(L.width, L.height, 'Torre del Hechicero — Planta baja');
  const grass = grassTexture(doc, rng, 'grassTower', '#6f8f45', '#1f3a1a');
  doc.add(terrain(doc, rng, L.width, L.height, { base: '#3a5228', blotches: ['#2f4a24', '#4a5f2c', '#26401d'], count: 60, texture: grass }));
  doc.add(path(`M${L.cx} ${L.cy + L.outerR - 10}L${L.cx + 10} ${L.height + 20}`, { stroke: '#7a6040', strokeWidth: 80, strokeLinecap: 'round' }));
  for (let i = 0; i < 24; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = L.outerR + rng.range(30, 120);
    const x = L.cx + Math.cos(a) * d;
    const y = L.cy + Math.sin(a) * d;
    if (y > L.cy + L.outerR - 40 && Math.abs(x - L.cx) < 80) continue;
    doc.add(rock(doc, rng, x, y, rng.range(10, 24), GRAY_ROCK));
  }
  // Outer wall ring.
  doc.add(circle(L.cx + 24, L.cy + 30, L.outerR + 6, { fill: '#000', opacity: 0.45 }));
  doc.add(circle(L.cx, L.cy, L.outerR, { fill: '#5d5a54', stroke: '#1a1816', strokeWidth: 6 }));
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    doc.add(line(L.cx + Math.cos(a) * L.innerR, L.cy + Math.sin(a) * L.innerR, L.cx + Math.cos(a) * L.wallR, L.cy + Math.sin(a) * L.wallR, { stroke: '#2a2724', strokeWidth: 2 }));
    const b = a + Math.PI / 64;
    doc.add(line(L.cx + Math.cos(b) * L.wallR, L.cy + Math.sin(b) * L.wallR, L.cx + Math.cos(b) * L.outerR, L.cy + Math.sin(b) * L.outerR, { stroke: '#2a2724', strokeWidth: 2 }));
  }
  doc.add(circle(L.cx, L.cy, L.wallR, { fill: 'none', stroke: '#2a2724', strokeWidth: 2 }));
  doc.add(towerFloor(doc, rng, L.cx, L.cy, L.innerR, '#77726a'));
  doc.add(arcaneCircle(doc, L.cx, L.cy, 130, '#8ab4ff', 5));

  // Door gap at the bottom.
  const da = ((L.doorFrom + L.doorTo) / 2) * (Math.PI / 180);
  const dx = L.cx + Math.cos(da) * L.wallR;
  const dy = L.cy + Math.sin(da) * L.wallR;
  doc.add(rect(dx - 62, dy - 34, 124, 68, { fill: '#5d4a38' }));
  doc.add(rect(dx - 58, dy - 8, 116, 16, { fill: '#8a5a2a', stroke: '#2a1a0e', strokeWidth: 3 }));

  // Spiral stairs (up).
  doc.add(spiralStairs(L.stairs.x, L.stairs.y, L.stairs.r, 'up'));
  // Curved bookshelves along the west arc.
  for (let deg = 128; deg <= 232; deg += 8.5) {
    const a = (deg * Math.PI) / 180;
    const x = L.cx + Math.cos(a) * (L.innerR - 22);
    const y = L.cy + Math.sin(a) * (L.innerR - 22);
    doc.add(g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(deg + 90)})` }, bookshelf(rng, -38, -14, 76, 28)));
  }
  for (let deg = 300; deg <= 340; deg += 8.5) {
    const a = (deg * Math.PI) / 180;
    const x = L.cx + Math.cos(a) * (L.innerR - 22);
    const y = L.cy + Math.sin(a) * (L.innerR - 22);
    doc.add(g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(deg + 90)})` }, bookshelf(rng, -38, -14, 76, 28)));
  }
  // Desk with books and candles.
  const dk = L.desk;
  doc.add(rug(doc, { x: dk.x - 50, y: dk.y - 50, w: dk.w + 100, h: dk.h + 120 }, '#3a1f5a', '#d4a63f'));
  doc.add(rect(dk.x + 8, dk.y + 10, dk.w, dk.h, { fill: '#000', opacity: 0.4 }), rect(dk.x, dk.y, dk.w, dk.h, { fill: '#5a3618', stroke: '#1e120a', strokeWidth: 3, rx: 4 }));
  doc.add(rect(dk.x + 30, dk.y + 18, 40, 50, { fill: '#efe6cf', stroke: '#8a7a5a', strokeWidth: 1 }), rect(dk.x + 70, dk.y + 18, 40, 50, { fill: '#e6d8b8', stroke: '#8a7a5a', strokeWidth: 1 }), candle(doc, dk.x + 140, dk.y + 22), circle(dk.x + 140, dk.y + 60, 10, { fill: '#2a4a7a', stroke: '#111', strokeWidth: 1 }));
  doc.add(circle(dk.x + dk.w / 2, dk.y + dk.h + 36, 22, { fill: '#4a2e18', stroke: '#1e120a', strokeWidth: 2 }));
  // Alchemy table and cauldron.
  const al = L.alchemy;
  doc.add(rect(al.x + 8, al.y + 10, al.w, al.h, { fill: '#000', opacity: 0.4 }), rect(al.x, al.y, al.w, al.h, { fill: '#5a3618', stroke: '#1e120a', strokeWidth: 3, rx: 4 }));
  for (let i = 0; i < 6; i++) {
    const px = al.x + 20 + i * 28;
    const py = al.y + 22 + (i % 2) * 30;
    doc.add(circle(px, py, 9, { fill: rng.pick(['#c43d33', '#3d8bff', '#4fc24f', '#a35cff', '#e9c063']), stroke: '#111', strokeWidth: 1.5 }), circle(px - 3, py - 3, 2, { fill: '#fff', opacity: 0.7 }));
  }
  doc.add(circle(1080, 760, 46, { fill: '#1a1a1a', stroke: '#050505', strokeWidth: 4 }), circle(1080, 760, 36, { fill: '#5fd07a' }), glow(doc, 'cauldronGlow', '#7fffb0', 1080, 760, 110, 0.6));
  for (let i = 0; i < 5; i++) doc.add(circle(1080 + rng.jitter(24), 760 + rng.jitter(24), rng.range(3, 7), { fill: '#c8ffd8', opacity: 0.8 }));
  doc.add(brazier(doc, 430, 470, '#ff9a3c', '#fff0b0'), brazier(doc, 990, 980, '#ff9a3c', '#fff0b0'));
  for (let i = 0; i < 6; i++) doc.add(rect(560 + rng.range(0, 300), 900 + rng.range(0, 200), 26, 34, { fill: '#efe6cf', opacity: 0.8, transform: `rotate(${n(rng.jitter(40))} ${700} ${1000})` }));
  doc.add(vignette(doc, L.width, L.height, 0.5));
  return doc.render();
}

export function buildTowerTop(): string {
  const L = TOWER;
  const rng = createRng('map-torre-cima');
  const doc = new SvgDoc(L.width, L.height, 'Torre del Hechicero — Cima');
  // The world far below: tiny canopy, a river, haze and clouds.
  doc.add(rect(0, 0, L.width, L.height, { fill: '#1d2b1c' }));
  for (let i = 0; i < 900; i++) doc.add(circle(rng.range(0, L.width), rng.range(0, L.height), rng.range(4, 11), { fill: rng.pick(['#243a22', '#2f4a2a', '#1a2a18', '#3a5230']), opacity: 0.9 }));
  doc.add(path(smoothPath([{ x: -20, y: 300 }, { x: 300, y: 380 }, { x: 600, y: 250 }, { x: 1000, y: 160 }, { x: 1420, y: 220 }], false), { fill: 'none', stroke: '#2a5a6a', strokeWidth: 14 }));
  doc.add(rect(0, 0, L.width, L.height, { fill: '#2a3550', opacity: 0.5 }));
  const cloud = doc.def('cloudGrad', radialGradient('cloudGrad', [[0, '#e8eef8', 0.55], [1, '#e8eef8', 0]]));
  for (let i = 0; i < 14; i++) doc.add(ellipse(rng.range(0, L.width), rng.range(0, L.height), rng.range(120, 260), rng.range(50, 110), { fill: cloud }));
  // Platform with battlements.
  doc.add(circle(L.cx + 40, L.cy + 50, L.outerR + 10, { fill: '#000', opacity: 0.5 }));
  doc.add(circle(L.cx, L.cy, L.outerR, { fill: '#5d5a54', stroke: '#141210', strokeWidth: 6 }));
  doc.add(towerFloor(doc, rng, L.cx, L.cy, 560, '#827d73'));
  const merlons = 24;
  for (let i = 0; i < merlons; i++) {
    const a1 = (i / merlons) * Math.PI * 2;
    const a2 = a1 + (Math.PI * 2) / merlons;
    if (i % 2 === 0) {
      doc.add(path(annularSector(L.cx + 6, L.cy + 8, 560, L.outerR, a1, a2), { fill: '#000', opacity: 0.35 }));
      doc.add(path(annularSector(L.cx, L.cy, 556, L.outerR + 4, a1, a2), { fill: '#8f8a80', stroke: '#2a2724', strokeWidth: 2.5 }));
    } else {
      doc.add(path(annularSector(L.cx, L.cy, 560, L.outerR, a1, a2), { fill: '#4a4640', stroke: '#2a2724', strokeWidth: 1.5 }));
    }
  }
  doc.add(arcaneCircle(doc, L.cx, L.cy, 270, '#a98bff', 7));
  doc.add(arcaneCircle(doc, L.cx, L.cy, 95, '#7fd6ff', 5));
  for (const c of L.crystals) {
    doc.add(softShadow(doc, c.x + 10, c.y + 12, 46, 40, 0.5), path(polyPath(regularPolygon(c.x, c.y, 40, 8, Math.PI / 8)), { fill: '#5d5a54', stroke: '#141210', strokeWidth: 3 }));
    doc.add(glow(doc, 'crystalGlow', '#7fd6ff', c.x, c.y, 90, 0.75));
    doc.add(path(polyPath(regularPolygon(c.x, c.y, 22, 6, Math.PI / 6)), { fill: doc.def('crystalFill', radialGradient('crystalFill', [[0, '#e8fbff'], [0.6, '#7fd6ff'], [1, '#2a6f9f']], { cx: 0.35, cy: 0.35 })), stroke: '#d8f6ff', strokeWidth: 2 }));
  }
  doc.add(spiralStairs(L.stairs.x, L.stairs.y, L.stairs.r, 'down'));
  // Telescope.
  doc.add(g({ transform: 'translate(1040 1010) rotate(-35)' }, [line(0, 0, -30, 40, { stroke: '#3a2412', strokeWidth: 5 }), line(0, 0, 30, 40, { stroke: '#3a2412', strokeWidth: 5 }), line(0, 0, 0, -40, { stroke: '#3a2412', strokeWidth: 5 }), rect(-60, -12, 120, 24, { fill: '#c9a94a', stroke: '#5a3e10', strokeWidth: 3, rx: 8 }), rect(50, -16, 18, 32, { fill: '#e9c063', stroke: '#5a3e10', strokeWidth: 2 })]));
  for (let i = 0; i < 8; i++) doc.add(rock(doc, rng, L.cx + rng.jitter(420), L.cy + rng.jitter(420), rng.range(6, 14), GRAY_ROCK));
  doc.add(vignette(doc, L.width, L.height, 0.45, '#0a0f1f'));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Grid dungeons
// ---------------------------------------------------------------------------

function dungeonBase(doc: SvgDoc, rng: Prng, d: GridDungeon & { width: number; height: number; pillars: [number, number][] }, stone: string, mortar: string, clipId: string): string {
  const parts: string[] = [];
  parts.push(terrain(doc, rng, d.width, d.height, { base: '#0d0b0a', blotches: ['#16130f', '#050404', '#1d1915'], count: 60, texture: speckleTexture(doc, rng, 'dungeonRock', ['#221d18', '#000000'], 150, 70) }));
  const rects = Object.values(d.rooms).map((r) => cellRectPx(r));
  doc.def(clipId, tag('clipPath', { id: clipId }, rects.map((r) => rect(r.x, r.y, r.w, r.h)).join('')));
  const floorFill = flagstoneTexture(doc, rng, `${clipId}Stone`, stone, mortar);
  const floor: string[] = [rect(0, 0, d.width, d.height, { fill: floorFill })];
  for (let i = 0; i < 90; i++) floor.push(ellipse(rng.range(0, d.width), rng.range(0, d.height), rng.range(20, 90), rng.range(14, 60), { fill: rng.pick(['#1a1612', '#3a3228', '#2a2a1e']), opacity: rng.range(0.15, 0.4) }));
  for (const w of d.walls) if (w.kind === 'wall') floor.push(path(pointsToPath(w.points), { fill: 'none', stroke: '#000', strokeWidth: 60, opacity: 0.28, strokeLinecap: 'square' }));
  parts.push(g({ clipPath: `url(#${clipId})` }, floor));
  return parts.join('');
}

function pillarsArt(doc: SvgDoc, pillars: [number, number][]): string {
  return pillars
    .map(([i, j]) => {
      const x = i * CELL + CELL / 2;
      const y = j * CELL + CELL / 2;
      return [softShadow(doc, x + 10, y + 12, 44, 40, 0.6), circle(x, y, 32, { fill: '#5d5850', stroke: '#141210', strokeWidth: 4 }), circle(x, y, 24, { fill: 'none', stroke: '#3a3630', strokeWidth: 3 }), circle(x - 8, y - 8, 9, { fill: '#ffffff', opacity: 0.12 })].join('');
    })
    .join('');
}

function sarcophagus(doc: SvgDoc, x: number, y: number, w: number, h: number, rot = 0, effigy = false): string {
  const parts: string[] = [
    rect(-w / 2 + 8, -h / 2 + 10, w, h, { fill: '#000', opacity: 0.45 }),
    rect(-w / 2, -h / 2, w, h, { fill: '#6d6a63', stroke: '#1a1816', strokeWidth: 3, rx: 6 }),
    rect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, { fill: '#7d786e', stroke: '#3a3630', strokeWidth: 1.5, rx: 4 }),
  ];
  if (effigy) {
    parts.push(circle(0, -h / 2 + 26, 12, { fill: '#8f8a80', stroke: '#3a3630', strokeWidth: 1.5 }), rect(-16, -h / 2 + 40, 32, h - 70, { fill: '#8f8a80', stroke: '#3a3630', strokeWidth: 1.5, rx: 8 }), line(0, -h / 2 + 44, 0, h / 2 - 16, { stroke: '#5a5650', strokeWidth: 4 }), line(-12, -h / 2 + 60, 12, -h / 2 + 60, { stroke: '#5a5650', strokeWidth: 4 }));
  } else {
    parts.push(line(0, -h / 2 + 18, 0, h / 2 - 18, { stroke: '#4a4640', strokeWidth: 5 }), line(-w / 2 + 18, -h / 2 + 40, w / 2 - 18, -h / 2 + 40, { stroke: '#4a4640', strokeWidth: 5 }));
  }
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, parts);
}

export function buildCryptUpper(): string {
  const L = CRYPT_UPPER;
  const rng = createRng('map-cripta-superior');
  const doc = new SvgDoc(L.width, L.height, 'Cripta superior');
  doc.add(dungeonBase(doc, rng, L, '#6a655c', '#2a2622', 'cryptUpperFloor'));
  // Entry: stairs up and guardian statues.
  doc.add(stairs(doc, { x: 980, y: 70, w: 140, h: 70 }, 'up'));
  for (const sx of [900, 1200]) doc.add(softShadow(doc, sx + 8, 230, 40, 34, 0.5), circle(sx, 220, 30, { fill: '#5d5850', stroke: '#141210', strokeWidth: 3 }), circle(sx, 212, 13, { fill: '#8f8a80' }), rect(sx - 4, 180, 8, 60, { fill: '#9a958a', stroke: '#3a3630', strokeWidth: 1.5 }));
  // Hall: carpet runner, honoured tomb, braziers.
  doc.add(rect(1015, 700, 70, 420, { fill: '#5a1414', opacity: 0.85 }), rect(1023, 700, 54, 420, { fill: 'none', stroke: '#c9a94a', strokeWidth: 2, opacity: 0.7 }));
  doc.add(sarcophagus(doc, 1050, 930, 100, 180, 0, true));
  doc.add(brazier(doc, 700, 770, '#ff9a3c', '#fff0b0'), brazier(doc, 1400, 770, '#ff9a3c', '#fff0b0'));
  // West: sarcophagi.
  for (const s of L.sarcophagi) doc.add(sarcophagus(doc, s.x, s.y, 90, 140, rng.jitter(3)));
  // North-west: library of the dead.
  doc.add(bookshelf(rng, 80, 78, 270, 30), g({ transform: 'translate(78 120) rotate(90)' }, bookshelf(rng, 0, -30, 200, 30)));
  doc.add(rect(170, 230, 100, 60, { fill: '#4a2e18', stroke: '#1e120a', strokeWidth: 2 }), candle(doc, 190, 250), rect(215, 245, 30, 36, { fill: '#e6d8b8', opacity: 0.9 }));
  // North-east shrine.
  doc.add(rect(1680, 90, 140, 60, { fill: '#7d786e', stroke: '#1a1816', strokeWidth: 3 }), rect(1690, 98, 120, 12, { fill: '#5a1f6a' }), candle(doc, 1700, 130), candle(doc, 1800, 130), candle(doc, 1750, 125, 6));
  doc.add(glow(doc, 'shrineGhost', '#6fffd2', 1750, 200, 120, 0.4));
  for (const kx of [1700, 1800]) doc.add(circle(kx, 260, 18, { fill: '#5a1f1f', stroke: '#2a0a0a', strokeWidth: 2 }));
  // East: stairs down.
  doc.add(stairs(doc, { x: 1820, y: 980, w: 140, h: 140 }, 'down'));
  doc.add(bones(rng, 1800, 700, 6, 40), bones(rng, 400, 900, 4, 30), bones(rng, 1300, 280, 4, 30));
  // Cobwebs in room corners.
  for (const r of Object.values(L.rooms)) {
    const px = cellRectPx(r);
    if (px.w < 200 || px.h < 200) continue;
    doc.add(cobweb(px.x + 2, px.y + 2, 60, 0, Math.PI / 2), cobweb(px.x + px.w - 2, px.y + 2, 50, Math.PI / 2, Math.PI / 2));
  }
  for (let i = 0; i < 12; i++) {
    const r = cellRectPx(rng.pick(Object.values(L.rooms)));
    doc.add(rock(doc, rng, r.x + rng.range(20, r.w - 20), r.y + rng.range(20, r.h - 20), rng.range(5, 11), GRAY_ROCK));
  }
  doc.add(pillarsArt(doc, L.pillars));
  doc.add(drawWalls(L.walls, STONE_WALL));
  doc.add(vignette(doc, L.width, L.height, 0.55));
  return doc.render();
}

export function buildOssuary(): string {
  const L = OSSUARY;
  const rng = createRng('map-osario');
  const doc = new SvgDoc(L.width, L.height, 'Osario profundo');
  doc.add(dungeonBase(doc, rng, L, '#5a564c', '#1e1b17', 'ossuaryFloor'));
  // Throne dais.
  doc.add(rect(700, 210, 280, 150, { fill: '#4a463f', stroke: '#141210', strokeWidth: 3 }), rect(730, 210, 220, 110, { fill: '#5d5850', stroke: '#141210', strokeWidth: 2 }));
  doc.add(rect(800, 230, 80, 70, { fill: '#1a1020', stroke: '#050305', strokeWidth: 4, rx: 6 }), path('M800 236l10 -26l10 26M830 236l10 -30l10 30M860 236l10 -26l10 26', { fill: '#1a1020', stroke: '#050305', strokeWidth: 2 }), circle(840, 222, 6, { fill: '#7fffd4' }), rect(815, 250, 50, 40, { fill: '#3a1f4a' }));
  doc.add(rect(810, 360, 60, 520, { fill: '#2a1438', opacity: 0.85 }), rect(816, 360, 48, 520, { fill: 'none', stroke: '#7a5a9a', strokeWidth: 2, opacity: 0.6 }));
  doc.add(arcaneCircle(doc, 840, 640, 110, '#7fffd4', 5));
  doc.add(brazier(doc, 560, 300, '#7fffd4', '#e8fff8'), brazier(doc, 1120, 300, '#7fffd4', '#e8fff8'));
  // Bone piles and skull walls.
  doc.add(skullPile(rng, 480, 900, 22, 50), skullPile(rng, 1200, 900, 22, 50), skullPile(rng, 480, 260, 14, 40));
  for (const key of ['gallery', 'niche1', 'niche2'] as const) {
    const r = cellRectPx(L.rooms[key]!);
    for (let x = r.x + 14; x < r.x + r.w - 10; x += 20) doc.add(skullPile(rng, x, r.y + 14, 1, 2), skullPile(rng, x, r.y + r.h - 14, 1, 2));
    doc.add(bones(rng, r.x + r.w / 2, r.y + r.h / 2, 10, Math.min(r.w, r.h) / 3));
  }
  // Landing with stairs up; vault with treasure.
  doc.add(stairs(doc, { x: 1820, y: 980, w: 140, h: 140 }, 'up'));
  const v = cellRectPx(L.rooms.vault!);
  doc.add(coins(doc, rng, v.x + v.w / 2, v.y + v.h / 2, v.w * 0.35, v.h * 0.3, 160), chest(doc, v.x + 60, v.y + 60, 60, 38, -8), chest(doc, v.x + v.w - 60, v.y + 70, 56, 36, 10));
  for (let i = 0; i < 6; i++) doc.add(gemstone(v.x + rng.range(40, v.w - 40), v.y + rng.range(40, v.h - 40), rng.range(5, 8), rng.pick(['#e8473f', '#a35cff', '#3d8bff'])));
  for (const r of Object.values(L.rooms)) {
    const px = cellRectPx(r);
    if (px.w < 200 || px.h < 200) continue;
    doc.add(cobweb(px.x + 2, px.y + 2, 60, 0, Math.PI / 2), cobweb(px.x + px.w - 2, px.y + px.h - 2, 55, Math.PI, Math.PI / 2));
  }
  doc.add(bones(rng, 1500, 900, 8, 50), bones(rng, 1890, 870, 4, 30));
  doc.add(pillarsArt(doc, L.pillars));
  doc.add(drawWalls(L.walls, STONE_WALL));
  doc.add(vignette(doc, L.width, L.height, 0.65, '#020806'));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Capilla en ruinas
// ---------------------------------------------------------------------------

export function buildChapel(): string {
  const L = CHAPEL;
  const rng = createRng('map-capilla');
  const doc = new SvgDoc(L.width, L.height, 'Capilla en ruinas');
  const grass = grassTexture(doc, rng, 'grassChapel', '#5a7a5a', '#141f16');
  doc.add(terrain(doc, rng, L.width, L.height, { base: '#2c3a2c', blotches: ['#243024', '#38463a', '#1f2a22'], count: 60, texture: grass }));
  for (const [x, y] of [
    [150, 200],
    [1500, 260],
    [1520, 900],
    [180, 950],
  ] as [number, number][])
    doc.add(gravestone(doc, rng, x, y, rng.jitter(8), 'stone'));
  // Floor (nave + apse).
  const nave = L.nave;
  const apseD = `M${nave.x} ${nave.y}H${L.apse.x - L.apse.r}A${L.apse.r} ${L.apse.r} 0 0 1 ${L.apse.x + L.apse.r} ${nave.y}H${nave.x + nave.w}V${nave.y + nave.h}H${nave.x}Z`;
  doc.def('chapelClip', tag('clipPath', { id: 'chapelClip' }, path(apseD)));
  const floor: string[] = [rect(0, 0, L.width, L.height, { fill: flagstoneTexture(doc, rng, 'chapelStone', '#6a665e', '#2a2824') })];
  for (let i = 0; i < 50; i++) floor.push(ellipse(rng.range(nave.x, nave.x + nave.w), rng.range(80, nave.y + nave.h), rng.range(16, 70), rng.range(10, 40), { fill: rng.pick(['#3a4a32', '#2e3a28', '#1a1612']), opacity: rng.range(0.25, 0.55) }));
  // Stained glass light on the floor.
  const glassColors = ['#e8473f', '#3d8bff', '#e9c063', '#a35cff', '#4fc24f'];
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + rng.range(0.15, Math.PI - 0.15);
    const d = rng.range(60, L.apse.r - 30);
    floor.push(path(polyPath(blobPoints(rng, L.apse.x + Math.cos(a) * d, L.apse.y + Math.sin(a) * d + 60, rng.range(14, 30), rng.range(10, 22), 5, 0.3)), { fill: rng.pick(glassColors), opacity: 0.22 }));
  }
  floor.push(ellipse(700, 700, 300, 200, { fill: doc.def('moonbeam', radialGradient('moonbeam', [[0, '#cfd8ff', 0.35], [1, '#cfd8ff', 0]])) }));
  floor.push(path(apseD, { fill: 'none', stroke: '#000', strokeWidth: 80, opacity: 0.35 }));
  doc.add(g({ clipPath: 'url(#chapelClip)' }, floor));

  // Pews (some broken).
  for (let row = 0; row < 6; row++) {
    for (const x0 of [440, 960]) {
      const y = 430 + row * 95;
      if (rng.chance(0.15)) continue;
      const broken = rng.chance(0.3);
      const w = broken ? rng.range(120, 200) : 270;
      const rot = broken ? rng.jitter(18) : rng.jitter(2);
      doc.add(g({ transform: `translate(${n(x0 + 135)} ${n(y)}) rotate(${n(rot)})` }, [rect(-w / 2 + 6, -15 + 8, w, 30, { fill: '#000', opacity: 0.4 }), rect(-w / 2, -15, w, 30, { fill: '#5a3e22', stroke: '#1e140a', strokeWidth: 2.5 }), rect(-w / 2, -15, w, 9, { fill: '#6b4a2a' })]));
    }
  }
  // Altar and broken statue.
  const al = L.altar;
  doc.add(rect(al.x + 8, al.y + 10, al.w, al.h, { fill: '#000', opacity: 0.4 }), rect(al.x, al.y, al.w, al.h, { fill: '#8b877e', stroke: '#1a1816', strokeWidth: 3 }), rect(al.x + 10, al.y + 8, al.w - 20, 20, { fill: '#4a1f5a' }));
  for (const cx of [al.x + 25, al.x + 60, al.x + al.w - 60, al.x + al.w - 25]) doc.add(candle(doc, cx, al.y + 45, 5));
  doc.add(circle(840, 140, 28, { fill: '#8f8a80', stroke: '#3a3630', strokeWidth: 2 }), rect(890, 150, 40, 18, { fill: '#8f8a80', stroke: '#3a3630', strokeWidth: 2, transform: 'rotate(30 910 159)' }), circle(780, 170, 12, { fill: '#8f8a80', stroke: '#3a3630', strokeWidth: 2 }));
  // Rubble at the collapsed sections and fallen beams.
  for (const gp of [
    { x: nave.x, y: nave.y + nave.h - 480 },
    { x: nave.x + nave.w, y: nave.y + 520 },
  ]) {
    for (let i = 0; i < 12; i++) doc.add(rock(doc, rng, gp.x + rng.jitter(70), gp.y + rng.jitter(80), rng.range(10, 26), GRAY_ROCK));
  }
  for (let i = 0; i < 4; i++) {
    const bx = rng.range(nave.x + 100, nave.x + nave.w - 100);
    const by = rng.range(nave.y + 80, nave.y + nave.h - 120);
    doc.add(rect(bx - 90, by - 10, 180, 20, { fill: '#3a2614', stroke: '#140c06', strokeWidth: 2, transform: `rotate(${n(rng.range(0, 180))} ${n(bx)} ${n(by)})` }));
  }
  for (let i = 0; i < 30; i++) {
    const p = { x: rng.range(nave.x + 20, nave.x + nave.w - 20), y: rng.range(nave.y + 20, nave.y + nave.h - 20) };
    doc.add(path(`M${n(p.x)} ${n(p.y)}l-4 -10M${n(p.x)} ${n(p.y)}l2 -12M${n(p.x)} ${n(p.y)}l7 -9`, { stroke: '#5a7a4a', strokeWidth: 2, strokeLinecap: 'round' }));
  }
  doc.add(cobweb(L.apse.x - L.apse.r + 20, nave.y + 10, 80, -Math.PI / 2, Math.PI / 2), cobweb(L.apse.x + L.apse.r - 20, nave.y + 10, 80, Math.PI, Math.PI / 2));
  for (let i = 0; i < 4; i++) doc.add(cobweb(L.spider.x + rng.jitter(60), L.spider.y + rng.jitter(40), 50, rng.range(0, Math.PI * 2), Math.PI * 1.5));
  doc.add(drawWalls(L.walls, STONE_WALL));
  doc.add(rect(L.door.x - 60, L.door.y + 14, 120, 30, { fill: '#6d6a63', stroke: '#2f2c27', strokeWidth: 2 }));
  doc.add(vignette(doc, L.width, L.height, 0.6, '#05070d'));
  return doc.render();
}

export { randomInPolygon };
