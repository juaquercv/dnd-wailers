import { barrel, crate, plankTexture, rug } from './brushes';
import type { RectSpec } from './layouts';
import { AIRSHIP, spanAt } from './layoutsSteam';
import { createRng, type Prng } from './rng';
import {
  IRON_WALL,
  PANEL_WALL,
  boiler,
  brassRailing,
  catwalk,
  cloudSea,
  coalBunker,
  coalScatter,
  gearPlate,
  hazardTexture,
  lightPool,
  pipeRun,
  pistonBank,
  plume,
  pressureGauge,
  steamWalls,
  treadTexture,
  valveWheel,
  wallLamp,
  workbench,
} from './steamBrushes';
import { BRASS, COPPER, IRON, metalLinear, metalRadial, polar, rivetLine, rivetRing } from './steamKit';
import { SvgDoc, circle, ellipse, g, line, linearGradient, n, path, polyPath, radialGradient, rect, softShadow, tag, vignette, type Pt } from './svg';

/** "Los Cielos de Latón": El Dirigible «Albatros» — Cubierta superior and Sala de máquinas (2100 x 1400). */

const L = AIRSHIP;

function hullClip(doc: SvgDoc, id: string): string {
  doc.def(id, tag('clipPath', { id }, path(polyPath(L.hull))));
  return `url(#${id})`;
}

/** Hull points (closed loop) from the east jamb of the boarding gate, around the bow and stern, back to its west jamb. */
function railingAroundHull(): Pt[] {
  const hull = L.hull;
  const east = hull.findIndex((p) => p.y < 700 && p.x >= L.gate.to);
  let west = -1;
  for (let i = 0; i < east; i++) if (hull[i]!.y < 700 && hull[i]!.x <= L.gate.from) west = i;
  return [...hull.slice(east), ...hull.slice(0, west + 1)];
}

function insideRect(r: RectSpec, points: number[]): boolean {
  for (let i = 0; i + 1 < points.length; i += 2) if (points[i]! < r.x - 1 || points[i]! > r.x + r.w + 1 || points[i + 1]! < r.y - 1 || points[i + 1]! > r.y + r.h + 1) return false;
  return true;
}

function deckCannon(doc: SvgDoc, x: number, y: number, dir: 1 | -1): string {
  const barrelFill = metalLinear(doc, 'cannonBarrel', { light: '#9aa0a8', base: '#3a3f46', dark: '#101214' }, true);
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${dir === -1 ? -90 : 90})` }, [
    rect(-34 + 6, -26 + 8, 60, 52, { fill: '#000000', opacity: 0.4 }),
    rect(-34, -26, 52, 52, { fill: '#6a4422', stroke: '#1e120a', strokeWidth: 2.5, rx: 4 }),
    circle(-26, -26, 7, { fill: '#2a1a0e' }),
    circle(-26, 26, 7, { fill: '#2a1a0e' }),
    circle(10, -26, 7, { fill: '#2a1a0e' }),
    circle(10, 26, 7, { fill: '#2a1a0e' }),
    path('M-30 -13L52 -9L52 9L-30 13Z', { fill: barrelFill, stroke: '#050505', strokeWidth: 2 }),
    rect(46, -12, 10, 24, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 1.5, rx: 2 }),
    circle(-34, 0, 9, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 1.5 }),
    rivetLine(-20, -12, 40, -9, 4, 1.6, '#c8ccd2'),
  ]);
}

function helmWheel(doc: SvgDoc, x: number, y: number, r: number): string {
  const spokes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tip = polar(x, y, r * 1.28, a);
    const base = polar(x, y, r * 0.2, a);
    spokes.push(line(base.x, base.y, tip.x, tip.y, { stroke: '#5a3a1a', strokeWidth: 6, strokeLinecap: 'round' }), circle(tip.x, tip.y, 5.5, { fill: '#7a4a24', stroke: '#2a1a0e', strokeWidth: 1.5 }));
  }
  return [
    softShadow(doc, x + 10, y + 12, r * 1.4, r * 1.3, 0.5),
    rect(x - 20, y - r * 0.4, 40, r * 0.8, { fill: '#4a2e18', stroke: '#1e120a', strokeWidth: 2, rx: 4 }),
    ...spokes,
    circle(x, y, r, { fill: 'none', stroke: '#2a1a0e', strokeWidth: 12 }),
    circle(x, y, r, { fill: 'none', stroke: '#8a5a2a', strokeWidth: 8 }),
    rivetRing(x, y, r, 16, 1.8, BRASS.light),
    circle(x, y, r * 0.24, { fill: metalRadial(doc, 'helmHub', BRASS), stroke: '#2a1a0a', strokeWidth: 2 }),
  ].join('');
}

function binnacle(doc: SvgDoc, x: number, y: number): string {
  return [
    softShadow(doc, x + 6, y + 8, 22, 20, 0.5),
    circle(x, y, 18, { fill: metalRadial(doc, 'binnacle', BRASS), stroke: '#2a1a0a', strokeWidth: 2 }),
    circle(x, y, 12, { fill: '#f3ead6', stroke: '#5a3e10', strokeWidth: 1 }),
    path(`M${x} ${y - 10}L${x + 3} ${y}L${x} ${y + 10}L${x - 3} ${y}Z`, { fill: '#c0392b' }),
  ].join('');
}

/** Engine order telegraph (dial on a pedestal). */
function telegraph(doc: SvgDoc, x: number, y: number): string {
  return [softShadow(doc, x + 6, y + 8, 20, 18, 0.5), circle(x, y, 16, { fill: metalRadial(doc, 'telegraph', BRASS), stroke: '#2a1a0a', strokeWidth: 2 }), pressureGauge(x, y, 11, -1.9)].join('');
}

function funnel(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  return [
    softShadow(doc, x + 14, y + 18, r * 1.4, r * 1.3, 0.55),
    circle(x, y, r + 8, { fill: '#1a1a1a' }),
    circle(x, y, r, { fill: metalRadial(doc, 'funnelBody', { light: '#e07a5a', base: '#8a2a1a', dark: '#2a0a04' }), stroke: '#0a0404', strokeWidth: 3 }),
    circle(x, y, r * 0.86, { fill: 'none', stroke: BRASS.base, strokeWidth: 4 }),
    circle(x, y, r * 0.6, { fill: '#050404' }),
    plume(doc, rng, x, y, r * 0.75, '#6a6660', 0.5, { x: -1, y: -0.25 }),
  ].join('');
}

function figurehead(doc: SvgDoc, x: number, y: number): string {
  const brass = metalLinear(doc, 'figureheadBrass', BRASS);
  return [
    softShadow(doc, x + 50, y + 16, 70, 40, 0.4),
    path(`M${x - 10} ${y - 10}L${x + 60} ${y - 6}L${x + 92} ${y}L${x + 60} ${y + 6}L${x - 10} ${y + 10}Z`, { fill: brass, stroke: '#2a1a0a', strokeWidth: 2 }),
    // Spread albatross wings.
    path(`M${x + 30} ${y - 6}Q${x + 10} ${y - 60} ${x - 30} ${y - 82}Q${x + 10} ${y - 70} ${x + 50} ${y - 8}Z`, { fill: brass, stroke: '#2a1a0a', strokeWidth: 2 }),
    path(`M${x + 30} ${y + 6}Q${x + 10} ${y + 60} ${x - 30} ${y + 82}Q${x + 10} ${y + 70} ${x + 50} ${y + 8}Z`, { fill: brass, stroke: '#2a1a0a', strokeWidth: 2 }),
    path(`M${x + 10} ${y - 30}l18 4M${x} ${y - 48}l20 6M${x + 10} ${y + 30}l18 -4M${x} ${y + 48}l20 -6`, { stroke: '#5a3e10', strokeWidth: 1.5 }),
    circle(x + 72, y - 2, 2.5, { fill: '#1a120a' }),
  ].join('');
}

function capstan(doc: SvgDoc, x: number, y: number): string {
  const bars: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = polar(x, y, 46, a);
    bars.push(line(x, y, p.x, p.y, { stroke: '#6a4422', strokeWidth: 6, strokeLinecap: 'round' }));
  }
  return [softShadow(doc, x + 8, y + 10, 40, 36, 0.5), ...bars, circle(x, y, 22, { fill: metalRadial(doc, 'capstan', IRON), stroke: '#0e0c0a', strokeWidth: 2.5 }), circle(x, y, 26, { fill: 'none', stroke: '#c8b48a', strokeWidth: 4, strokeDasharray: '6 3' }), rivetRing(x, y, 15, 8, 1.6, '#c8ccd2')].join('');
}

function ropeCoil(x: number, y: number, r: number): string {
  return [circle(x + 3, y + 4, r, { fill: '#000000', opacity: 0.3 }), circle(x, y, r, { fill: '#a8946b', stroke: '#5a4a2a', strokeWidth: 1.5 }), circle(x, y, r * 0.68, { fill: 'none', stroke: '#5a4a2a', strokeWidth: 1.5 }), circle(x, y, r * 0.36, { fill: 'none', stroke: '#5a4a2a', strokeWidth: 1.5 })].join('');
}

function navLight(doc: SvgDoc, x: number, y: number, color: string): string {
  return [lightPool(doc, `navGlow${color.replace('#', '')}`, color, x, y, 80, 0.6), circle(x, y, 11, { fill: metalRadial(doc, 'navHousing', BRASS), stroke: '#1a120a', strokeWidth: 2 }), circle(x, y, 7, { fill: color })].join('');
}

/** Stair flight down into a hatch (rect), steps along x. */
function hatchStairs(doc: SvgDoc, r: RectSpec, down: boolean): string {
  const id = down ? 'hatchStairsDown' : 'hatchStairsUp';
  const grad = doc.def(id, linearGradient(id, down ? [[0, '#6a5a44'], [1, '#0a0806']] : [[0, '#0a0806'], [1, '#8a7a5a']], 0, 0, 1, 0));
  const parts: string[] = [rect(r.x - 10, r.y - 10, r.w + 20, r.h + 20, { fill: '#2a1a0e', stroke: '#0e0806', strokeWidth: 3 }), rect(r.x, r.y, r.w, r.h, { fill: grad })];
  for (let i = 1; i < 7; i++) parts.push(line(r.x + (i * r.w) / 7, r.y, r.x + (i * r.w) / 7, r.y + r.h, { stroke: '#0e0806', strokeWidth: 2.5, opacity: 0.7 }));
  parts.push(rect(r.x - 10, r.y - 10, r.w + 20, 8, { fill: BRASS.base }), rect(r.x - 10, r.y + r.h + 2, r.w + 20, 8, { fill: BRASS.base }), rivetLine(r.x - 4, r.y - 6, r.x + r.w + 4, r.y - 6, 6, 1.8, BRASS.light), rivetLine(r.x - 4, r.y + r.h + 6, r.x + r.w + 4, r.y + r.h + 6, 6, 1.8, BRASS.light));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Cubierta superior
// ---------------------------------------------------------------------------

export function buildAirshipDeck(): string {
  const rng = createRng('map-albatros-cubierta');
  const doc = new SvgDoc(L.width, L.height, 'El «Albatros» — Cubierta superior');
  doc.add(cloudSea(doc, rng, 0, 0, L.width, L.height, 46));

  // Port pier at the top edge and the boarding gangway down to the gate.
  const pierPlanks = plankTexture(doc, rng, 'deckPierPlanks', '#7a5634');
  doc.add(rect(560, -20, 1600, 150, { fill: '#000000', opacity: 0.3, transform: 'translate(20 40)' }), rect(560, -20, 1600, 140, { fill: pierPlanks, stroke: '#2a1a0e', strokeWidth: 3 }), rect(560, 112, 1600, 10, { fill: metalLinear(doc, 'deckPierBeam', IRON) }), rivetLine(570, 117, 2090, 117, 44, 1.8, '#a8aeb8'));
  for (let x = 640; x < 2100; x += 210) doc.add(circle(x + 3, 95, 11, { fill: '#000000', opacity: 0.35 }), circle(x, 92, 11, { fill: IRON.base, stroke: '#0e1012', strokeWidth: 2 }));
  const gx = (L.gate.from + L.gate.to) / 2;
  const hullTopAtGate = spanAt(L.hull, gx)[0];
  const gw = 70;
  doc.add(rect(gx - gw / 2 + 14, 120 + 20, gw, hullTopAtGate - 120, { fill: '#000000', opacity: 0.35 }));
  for (let y = 120; y < hullTopAtGate + 10; y += 17) doc.add(rect(gx - gw / 2, y, gw, 15, { fill: (y / 17) % 2 < 1 ? '#8a6236' : '#7a5530', stroke: '#3a2412', strokeWidth: 1 }));
  doc.add(line(gx - gw / 2 - 4, 120, gx - gw / 2 - 4, hullTopAtGate + 10, { stroke: '#c8b48a', strokeWidth: 4 }), line(gx + gw / 2 + 4, 120, gx + gw / 2 + 4, hullTopAtGate + 10, { stroke: '#c8b48a', strokeWidth: 4 }));

  // Hull shadow on the clouds, hull side and deck.
  const hullD = polyPath(L.hull);
  doc.add(path(hullD, { fill: '#000000', opacity: 0.3, transform: 'translate(60 110)' }));
  doc.add(path(hullD, { fill: '#2a1a0e', stroke: '#0e0806', strokeWidth: 30, strokeLinejoin: 'round' }));
  const clip = hullClip(doc, 'deckHullClip');
  const planks = plankTexture(doc, rng, 'deckPlanks', '#8a6236');
  const qdPlanks = plankTexture(doc, rng, 'quarterdeckPlanks', '#6a4626');
  const deck: string[] = [rect(0, 0, L.width, L.height, { fill: planks })];
  deck.push(rect(0, 0, L.quarterdeckX, L.height, { fill: qdPlanks }), line(L.quarterdeckX, 0, L.quarterdeckX, L.height, { stroke: '#1e120a', strokeWidth: 6 }));
  for (let i = 0; i < 40; i++) deck.push(ellipse(rng.range(240, 1960), rng.range(440, 960), rng.range(10, 34), rng.range(6, 16), { fill: '#2a1a0e', opacity: rng.range(0.06, 0.16) }));
  // Caulked seams along the hull edge.
  deck.push(path(hullD, { fill: 'none', stroke: '#3a2412', strokeWidth: 60, opacity: 0.35 }));
  doc.add(g({ clipPath: clip }, deck));
  doc.add(path(hullD, { fill: 'none', stroke: '#5a3a1a', strokeWidth: 14, strokeLinejoin: 'round' }), path(hullD, { fill: 'none', stroke: '#c9a24a', strokeWidth: 3, strokeLinejoin: 'round', opacity: 0.7 }));

  // Quarterdeck: helm, binnacle, telegraph and the stern lanterns.
  const qd = spanAt(L.hull, L.quarterdeckX);
  for (const [y0, y1] of [
    [qd[0] + 70, qd[0] + 140],
    [qd[1] - 140, qd[1] - 70],
  ] as [number, number][]) {
    for (let k = 0; k < 4; k++) doc.add(rect(L.quarterdeckX + k * 14 - 2, y0, 14, y1 - y0, { fill: k % 2 === 0 ? '#7a5530' : '#6a4626', stroke: '#2a1a0e', strokeWidth: 1.5 }));
  }
  doc.add(helmWheel(doc, L.helm.x, L.helm.y, 34), binnacle(doc, L.helm.x + 80, L.helm.y), telegraph(doc, L.helm.x + 70, L.helm.y - 70));
  doc.add(rect(270, 680, 22, 40, { fill: BRASS.base, stroke: '#2a1a0a', strokeWidth: 1.5, rx: 3 }), circle(281, 676, 9, { fill: BRASS.light, stroke: '#2a1a0a', strokeWidth: 1.5 }));
  doc.add(ropeCoil(300, 560, 22), ropeCoil(300, 840, 22));

  // Bridge house interior (walls block vision).
  const br = L.bridge;
  doc.add(rect(br.x, br.y, br.w, br.h, { fill: plankTexture(doc, rng, 'bridgeFloor', '#5a3a1e') }));
  doc.add(rug({ x: br.x + 30, y: br.y + 40, w: br.w - 60, h: br.h - 80 }, '#5a1a1a', '#c9a24a'));
  doc.add(rect(br.x + 40, br.y + 70, 110, 60, { fill: '#6a4422', stroke: '#1e120a', strokeWidth: 2.5 }), rect(br.x + 50, br.y + 78, 90, 44, { fill: '#e8dcc0', stroke: '#8a7a5a', strokeWidth: 1 }), path(`M${br.x + 60} ${br.y + 100}q20 -18 40 0t30 -6`, { fill: 'none', stroke: '#3a5a9a', strokeWidth: 1.5 }));
  doc.add(circle(br.x + 175, br.y + 40, 12, { fill: '#6a4422', stroke: '#1e120a', strokeWidth: 2 }), circle(br.x + 175, br.y + 160, 12, { fill: '#6a4422', stroke: '#1e120a', strokeWidth: 2 }));
  doc.add(wallLamp(doc, br.x + br.w / 2, br.y + 22));
  const bridgeWalls = L.deckWalls.filter((w) => insideRect(br, w.points));
  doc.add(steamWalls(bridgeWalls, PANEL_WALL));

  // Funnels from the engine room.
  doc.add(funnel(doc, rng, 880, 610, 30), funnel(doc, rng, 880, 790, 30));

  // Hatch with stairs down to the engine room.
  const h = L.hatch;
  doc.add(lightPool(doc, 'hatchGlow', '#ff8a3a', h.x, h.y, 150, 0.45));
  doc.add(hatchStairs(doc, { x: h.x - h.size / 2, y: h.y - h.size / 2, w: h.size, h: h.size }, true));

  // Envelope pylons with mooring cables.
  for (const side of [0, 1] as const) {
    const span = spanAt(L.hull, L.pylonX);
    const y = side === 0 ? span[0] + 46 : span[1] - 46;
    doc.add(softShadow(doc, L.pylonX + 10, y + 12, 50, 30, 0.5), rect(L.pylonX - 40, y - 18, 80, 36, { fill: metalLinear(doc, 'pylonBase', IRON), stroke: '#0e1012', strokeWidth: 2.5 }), rivetLine(L.pylonX - 32, y, L.pylonX + 32, y, 6, 2, '#c8ccd2'));
    for (const dx of [-28, 28]) doc.add(circle(L.pylonX + dx, y, 9, { fill: BRASS.base, stroke: '#1a120a', strokeWidth: 1.5 }));
  }

  // Cannons along both rails.
  for (const cx of L.cannonsX) {
    const span = spanAt(L.hull, cx);
    doc.add(deckCannon(doc, cx, span[0] + 48, -1), deckCannon(doc, cx, span[1] - 48, 1));
  }

  // Cargo lashed to the deck, water barrels and the ship's bell.
  doc.add(crate(1480, 640, 40, 4), crate(1500, 760, 36, -6), barrel(doc, 1420, 700, 20), barrel(doc, 1440, 650, 16));
  doc.add(barrel(doc, 1060, 640, 18), barrel(doc, 1060, 760, 18), ropeCoil(1120, 700, 20));
  doc.add(circle(560, 700, 16, { fill: metalRadial(doc, 'shipBell', BRASS), stroke: '#2a1a0a', strokeWidth: 2 }), circle(560, 700, 5, { fill: '#5a3e10' }));

  // Bow: capstan, anchor chain, figurehead and navigation lights.
  doc.add(capstan(doc, 1860, 700));
  doc.add(path('M1882 700L1960 700', { stroke: '#3a3f46', strokeWidth: 8, strokeDasharray: '10 4' }));
  doc.add(figurehead(doc, 1960, 700));
  doc.add(navLight(doc, 1800, 575, '#ff3a2a'), navLight(doc, 1800, 825, '#3aff7a'));

  // Railings.
  doc.add(brassRailing(railingAroundHull()));
  for (const [y0, y1] of [
    [qd[0], qd[0] + 70],
    [qd[0] + 140, qd[1] - 140],
    [qd[1] - 70, qd[1]],
  ] as [number, number][])
    doc.add(brassRailing([{ x: L.quarterdeckX, y: y0 }, { x: L.quarterdeckX, y: y1 }]));
  doc.add(circle(L.gate.from, hullTopAtGate + 4, 8, { fill: BRASS.dark, stroke: '#1a120a', strokeWidth: 2 }), circle(L.gate.to, spanAt(L.hull, L.gate.to)[0] + 4, 8, { fill: BRASS.dark, stroke: '#1a120a', strokeWidth: 2 }));

  // Deck lanterns.
  for (const l of L.deckLights) if (l.color === '#ffcf7a') doc.add(wallLamp(doc, l.x, l.y));

  // Shadow of the envelope overhead and the cables that hold it.
  const env = L.envelope;
  const envShadow = doc.def('envelopeShadow', radialGradient('envelopeShadow', [[0, '#000000', 0.42], [0.82, '#000000', 0.36], [1, '#000000', 0]]));
  doc.add(ellipse(env.cx + 40, env.cy + 60, env.rx * 1.04, env.ry * 1.08, { fill: envShadow }));
  doc.add(ellipse(env.cx, env.cy, env.rx, env.ry, { fill: 'none', stroke: '#f3ead6', strokeWidth: 2, strokeDasharray: '18 14', opacity: 0.25 }));
  doc.add(vignette(doc, L.width, L.height, 0.3, '#14202a'));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Sala de máquinas
// ---------------------------------------------------------------------------

export function buildAirshipEngine(): string {
  const rng = createRng('map-albatros-maquinas');
  const doc = new SvgDoc(L.width, L.height, 'El «Albatros» — Sala de máquinas');
  doc.add(rect(0, 0, L.width, L.height, { fill: '#0b0a08' }));
  doc.add(rect(0, 0, L.width, L.height, { fill: doc.def('engineVoid', radialGradient('engineVoid', [[0, '#1a1612'], [1, '#050404']])) }));

  const hullD = polyPath(L.hull);
  const clip = hullClip(doc, 'engineHullClip');
  const floor: string[] = [rect(0, 0, L.width, L.height, { fill: treadTexture(doc, 'engineTread', '#4a4740') })];
  // Stern bunker room and bow hold use timber floors.
  const hold = plankTexture(doc, rng, 'holdPlanks', '#5a3a1e');
  floor.push(rect(0, 0, L.sternBulkhead, L.height, { fill: hold }), rect(L.bowBulkhead, 0, L.width - L.bowBulkhead, L.height, { fill: hold }));
  for (let i = 0; i < 50; i++) floor.push(ellipse(rng.range(240, 1960), rng.range(440, 960), rng.range(10, 40), rng.range(6, 20), { fill: '#0a0806', opacity: rng.range(0.1, 0.3) }));
  // Hull ribs (frames) along the walls.
  for (let x = 300; x < 1950; x += 70) {
    const span = spanAt(L.hull, x);
    floor.push(rect(x - 6, span[0], 12, 60, { fill: '#2a1a0e', opacity: 0.85 }), rect(x - 6, span[1] - 60, 12, 60, { fill: '#2a1a0e', opacity: 0.85 }));
  }
  floor.push(path(hullD, { fill: 'none', stroke: '#000000', strokeWidth: 120, opacity: 0.35 }));
  doc.add(g({ clipPath: clip }, floor));

  // Stern room: coal bunkers and the propeller shaft housing.
  doc.add(coalBunker(doc, rng, { x: 290, y: 515, w: 205, h: 112 }), coalBunker(doc, rng, { x: 290, y: 773, w: 205, h: 112 }));
  doc.add(coalScatter(rng, 300, 650, 200, 100, 22));
  doc.add(rect(250, 690, 40, 20, { fill: metalLinear(doc, 'shaftHousing', IRON), stroke: '#0e0c0a', strokeWidth: 2 }));

  // Boilers fired from the stern side.
  doc.add(boiler(doc, 560, 480, 330, 130, 'left', 'boilerA'), boiler(doc, 560, 790, 330, 130, 'left', 'boilerB'));
  // Central catwalk from bulkhead to bulkhead.
  doc.add(catwalk(doc, { x: L.sternBulkhead, y: 646, w: L.hatch.x - L.hatch.size / 2 - L.sternBulkhead, h: 108 }, { rails: true }));
  doc.add(catwalk(doc, { x: L.hatch.x + L.hatch.size / 2, y: 646, w: L.bowBulkhead - L.hatch.x - L.hatch.size / 2, h: 108 }, { rails: true }));
  // Piston banks driving the crankshaft.
  doc.add(pistonBank(doc, 960, 545, 3, 72, 26, 'x'), pistonBank(doc, 960, 820, 3, 72, 26, 'x'));
  doc.add(rect(940, 905, 190, 18, { fill: hazardTexture(doc), opacity: 0.8 }), rect(940, 478, 190, 18, { fill: hazardTexture(doc), opacity: 0.8 }));
  // Steam lines from the boiler domes to the pistons, and the overhead mains.
  doc.add(pipeRun([{ x: 725, y: 545 }, { x: 725, y: 505 }, { x: 930, y: 505 }, { x: 930, y: 545 }], 16, COPPER, 120));
  doc.add(pipeRun([{ x: 725, y: 855 }, { x: 725, y: 895 }, { x: 930, y: 895 }, { x: 930, y: 860 }], 16, COPPER, 120));
  const mainTop = spanAt(L.hull, 1500)[0] + 22;
  const mainBottom = spanAt(L.hull, 1500)[1] - 22;
  doc.add(pipeRun([{ x: 560, y: mainTop }, { x: 1500, y: mainTop }], 14, IRON, 140), pipeRun([{ x: 560, y: mainBottom }, { x: 1500, y: mainBottom }], 14, IRON, 140));
  doc.add(valveWheel(1150, mainTop, 13), valveWheel(1150, mainBottom, 13), pressureGauge(1210, mainTop + 30, 12, 0.4), pressureGauge(1210, mainBottom - 30, 12, 1.2));
  // Bulkhead instruments.
  doc.add(pressureGauge(L.sternBulkhead + 24, 620, 13, -0.2), pressureGauge(L.sternBulkhead + 24, 780, 13, 0.6), valveWheel(L.bowBulkhead - 26, 610, 14), valveWheel(L.bowBulkhead - 26, 790, 14, '#2a6ac0'));
  // Stairs up to the deck.
  const h = L.hatch;
  doc.add(lightPool(doc, 'stairsDaylight', '#ffe2a0', h.x, h.y, 140, 0.35));
  doc.add(hatchStairs(doc, { x: h.x - h.size / 2, y: h.y - h.size / 2, w: h.size, h: h.size }, false));
  // Maintenance corner: workbench, flywheel and spare parts.
  doc.add(workbench(doc, rng, { x: 1340, y: 486, w: 160, h: 58 }));
  doc.add(gearPlate(doc, 1420, 850, 62, 22, BRASS, 'engineFlywheel', { rot: 0.2, spokes: 6 }));
  doc.add(crate(1350, 880, 34, 6), barrel(doc, 1490, 880, 17));

  // Bow hold: cargo, sacks and netting (kept inside the hull).
  const cargo: string[] = [];
  for (const [x, y, s, r] of [
    [1600, 545, 44, 4],
    [1650, 580, 34, -8],
    [1598, 858, 42, -4],
    [1652, 826, 32, 10],
  ] as [number, number, number, number][])
    cargo.push(crate(x, y, s, r));
  cargo.push(barrel(doc, 1735, 582, 18), barrel(doc, 1768, 606, 15), barrel(doc, 1590, 700, 17));
  for (const [x, y] of [
    [1705, 852],
    [1738, 830],
  ] as [number, number][])
    cargo.push(ellipse(x + 4, y + 5, 22, 15, { fill: '#000000', opacity: 0.35 }), ellipse(x, y, 22, 15, { fill: '#b89a6a', stroke: '#5a4a2a', strokeWidth: 1.5 }), line(x - 8, y - 12, x - 8, y - 4, { stroke: '#5a4a2a', strokeWidth: 2 }));
  cargo.push(path('M1572 500L1690 512L1684 616L1566 604Z', { fill: 'none', stroke: '#c8b48a', strokeWidth: 1.5, strokeDasharray: '6 4', opacity: 0.8 }));
  doc.add(g({ clipPath: clip }, cargo));

  // Hull and bulkheads (walls) on top.
  doc.add(steamWalls(L.engineWalls, IRON_WALL));
  // Lamps.
  for (const l of L.engineLights) if (l.color === '#ffe2a0' || l.color === '#ffd28a' || l.color === '#ffb057') doc.add(wallLamp(doc, l.x, l.y, l.color));
  doc.add(vignette(doc, L.width, L.height, 0.5));
  return doc.render();
}
