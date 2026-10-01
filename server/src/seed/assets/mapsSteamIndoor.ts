import { barrel, bed, bookshelf, cobbleTexture, crate, flagstoneTexture, fogPatches, lavaPool, plankTexture, rug, speckleTexture, terrain } from './brushes';
import type { RectSpec } from './layouts';
import { FACTORY, WORKSHOP } from './layoutsSteam';
import { createRng, type Prng } from './rng';
import {
  BRICK_WALL,
  anvil,
  automatonOnTable,
  blastFurnace,
  blueprintTable,
  catwalk,
  chimneyStack,
  coalScatter,
  conveyor,
  forgeHearth,
  gearPlate,
  hazardTexture,
  hydraulicPress,
  ironSafe,
  lightPool,
  partsShelf,
  pipeRun,
  plateTexture,
  plume,
  pressureGauge,
  railway,
  scrapHeap,
  steamWalls,
  teslaCoil,
  toxicPuddle,
  valveWheel,
  wallLamp,
  workbench,
  boiler,
} from './steamBrushes';
import { BRASS, COPPER, IRON, metalLinear, metalRadial, rivetLine, rivetRing } from './steamKit';
import { SvgDoc, blobPoints, circle, ellipse, g, line, n, path, polyPath, radialGradient, rect, smoothPath, softShadow, vignette } from './svg';

/** "Los Cielos de Latón": Taller del Inventor (1680 x 1120) and Fábrica Abandonada (2100 x 1400). */

// ---------------------------------------------------------------------------
// Taller del Inventor
// ---------------------------------------------------------------------------

function lathe(doc: SvgDoc, r: RectSpec): string {
  return [
    rect(r.x + 10, r.y + 12, r.w, r.h, { fill: '#000000', opacity: 0.4 }),
    rect(r.x, r.y, r.w, r.h, { fill: '#2f5a4a', stroke: '#0e1a16', strokeWidth: 3, rx: 6 }),
    rect(r.x + 10, r.y + r.h / 2 - 6, r.w - 20, 12, { fill: '#c8ccd2', stroke: '#1a1a1a', strokeWidth: 1.5 }),
    rect(r.x + 14, r.y + 10, 46, r.h - 20, { fill: metalLinear(doc, 'latheHead', IRON), stroke: '#0e0c0a', strokeWidth: 2, rx: 4 }),
    rect(r.x + r.w - 52, r.y + 12, 38, r.h - 24, { fill: metalLinear(doc, 'latheTail', IRON), stroke: '#0e0c0a', strokeWidth: 2, rx: 4 }),
    circle(r.x + 37, r.y + r.h / 2, 13, { fill: BRASS.base, stroke: '#2a1a0a', strokeWidth: 2 }),
    rect(r.x + r.w * 0.45, r.y + 6, 26, r.h - 12, { fill: BRASS.dark, stroke: '#2a1a0a', strokeWidth: 1.5 }),
    ...Array.from({ length: 6 }, (_, i) => path(`M${n(r.x + 80 + i * 14)} ${n(r.y + r.h + 4)}q4 6 0 10q-4 4 0 10`, { fill: 'none', stroke: '#c8ccd2', strokeWidth: 1.4, opacity: 0.7 })),
  ].join('');
}

function dynamo(doc: SvgDoc, x: number, y: number): string {
  return [
    softShadow(doc, x + 10, y + 12, 60, 44, 0.5),
    rect(x - 56, y - 34, 112, 68, { fill: '#2a2e33', stroke: '#0e1012', strokeWidth: 3, rx: 8 }),
    rect(x - 40, y - 30, 80, 60, { fill: metalLinear(doc, 'dynamoBody', { light: '#e0b860', base: '#a8742a', dark: '#4a2e0a' }), stroke: '#1a120a', strokeWidth: 2, rx: 26 }),
    ...[-24, -8, 8, 24].map((dx) => line(x + dx, y - 28, x + dx, y + 28, { stroke: COPPER.dark, strokeWidth: 4 })),
    circle(x + 56, y, 16, { fill: metalRadial(doc, 'dynamoPulley', IRON), stroke: '#0e1012', strokeWidth: 2 }),
    circle(x + 56, y, 5, { fill: BRASS.base }),
  ].join('');
}

function deskWithLamp(doc: SvgDoc, rng: Prng, r: RectSpec): string {
  const wood = doc.def('deskWood', radialGradient('deskWood', [[0, '#8a5a2a'], [1, '#4a2a10']], { r: 0.8 }));
  const papers: string[] = [];
  for (let i = 0; i < 5; i++) papers.push(rect(r.x + 30 + i * 30 + rng.jitter(6), r.y + 14 + rng.jitter(6), 26, 34, { fill: i % 2 ? '#e8dcc0' : '#24508a', stroke: '#8a7a5a', strokeWidth: 0.8, transform: `rotate(${n(rng.range(-14, 14))} ${n(r.x + 43 + i * 30)} ${n(r.y + 31)})` }));
  return [
    rect(r.x + 8, r.y + 10, r.w, r.h, { fill: '#000000', opacity: 0.4 }),
    rect(r.x, r.y, r.w, r.h, { fill: wood, stroke: '#1e120a', strokeWidth: 3, rx: 3 }),
    ...papers,
    circle(r.x + r.w - 26, r.y + 24, 10, { fill: '#1a1a1a' }),
    line(r.x + r.w - 40, r.y + r.h - 18, r.x + r.w - 14, r.y + r.h - 30, { stroke: '#2a1a0e', strokeWidth: 3 }),
    circle(r.x + r.w / 2, r.y + r.h + 34, 20, { fill: '#5a1a1a', stroke: '#1e0a06', strokeWidth: 2 }),
    wallLamp(doc, r.x + r.w - 30, r.y + 18, '#ffe2a0'),
  ].join('');
}

/** Chain hoist hanging above the assembly table. */
function chainHoist(x: number, y: number): string {
  return [line(x, y - 90, x, y, { stroke: '#8a909a', strokeWidth: 4, strokeDasharray: '6 3' }), path(`M${x - 8} ${y}a8 8 0 1 0 16 0`, { fill: 'none', stroke: '#c8ccd2', strokeWidth: 3 }), rect(x - 20, y - 104, 40, 18, { fill: IRON.base, stroke: '#0e0c0a', strokeWidth: 2, rx: 3 })].join('');
}

export function buildWorkshop(): string {
  const L = WORKSHOP;
  const rng = createRng('map-taller-inventor');
  const doc = new SvgDoc(L.width, L.height, 'Taller del Inventor');
  doc.add(terrain(rng, L.width, L.height, { base: '#3a3631', blotches: ['#2a2622', '#4a453e'], count: 30, texture: cobbleTexture(doc, rng, 'workshopStreet', '#6a655c', '#2a2622') }));
  doc.add(rect(L.shell.x - 16, L.shell.y - 16, L.shell.w + 32, L.shell.h + 32, { fill: '#000000', opacity: 0.55 }));

  // Floors.
  const hallPlanks = plankTexture(doc, rng, 'workshopPlanks', '#6a4a2c');
  doc.add(rect(L.hall.x, L.hall.y, L.hall.w, L.hall.h, { fill: hallPlanks }));
  doc.add(rect(L.store.x, L.store.y, L.store.w, L.store.h, { fill: plateTexture(doc, rng, 'storePlates', '#5c5a54', '#7a3a1a') }));
  doc.add(rect(L.office.x, L.office.y, L.office.w, L.office.h, { fill: plankTexture(doc, rng, 'officePlanks', '#7a5634') }));
  for (let i = 0; i < 34; i++) doc.add(ellipse(L.hall.x + rng.range(20, L.hall.w - 20), L.hall.y + rng.range(20, L.hall.h - 20), rng.range(8, 34), rng.range(5, 18), { fill: '#120c08', opacity: rng.range(0.1, 0.25) }));
  // Soot fan in front of the forge and sawdust near the lathe.
  doc.add(ellipse(L.furnace.x + L.furnace.w + 50, L.furnace.y + L.furnace.h / 2, 120, 90, { fill: '#0a0806', opacity: 0.35 }));
  doc.add(ellipse(L.lathe.x + L.lathe.w / 2, L.lathe.y + L.lathe.h + 40, 120, 30, { fill: '#c8a86a', opacity: 0.2 }));
  doc.add(rug({ x: 1250, y: 720, w: 150, h: 220 }, '#1f3f5a', '#c9a24a'));

  // Hall: workbench, lathe, dynamo, tesla coil, forge and anvil.
  doc.add(workbench(doc, rng, L.bench));
  doc.add(lathe(doc, L.lathe));
  doc.add(path(`M${n(L.dynamo.x + 56)} ${n(L.dynamo.y - 16)}L${n(L.lathe.x + 37)} ${n(L.lathe.y + L.lathe.h / 2 - 12)}M${n(L.dynamo.x + 56)} ${n(L.dynamo.y + 16)}L${n(L.lathe.x + 50)} ${n(L.lathe.y + L.lathe.h / 2 + 12)}`, { stroke: '#2a1a0e', strokeWidth: 5 }));
  doc.add(dynamo(doc, L.dynamo.x, L.dynamo.y));
  doc.add(pipeRun([{ x: L.dynamo.x - 56, y: L.dynamo.y }, { x: 760, y: L.dynamo.y }, { x: 760, y: 220 }], 8, COPPER, 999));
  doc.add(teslaCoil(doc, rng, L.tesla.x, L.tesla.y, 48));
  doc.add(rect(L.tesla.x - 70, L.tesla.y + 70, 140, 14, { fill: hazardTexture(doc), opacity: 0.85 }));
  doc.add(forgeHearth(doc, rng, L.furnace));
  doc.add(anvil(L.anvil.x, L.anvil.y, 8));
  doc.add(barrel(doc, 120, 640, 22), circle(120, 640, 14, { fill: '#2f6f8f', opacity: 0.8 }));
  doc.add(coalScatter(rng, 90, 300, 90, 60, 18));
  // Drafting table with the airship blueprints.
  doc.add(blueprintTable(doc, L.blueprintTable));
  doc.add(circle(L.blueprintTable.x + L.blueprintTable.w / 2, L.blueprintTable.y + L.blueprintTable.h + 36, 18, { fill: '#5a3a1a', stroke: '#1e120a', strokeWidth: 2 }));
  // Assembly table with the half-built automaton and a chain hoist.
  doc.add(automatonOnTable(doc, rng, L.assemblyTable));
  doc.add(chainHoist(L.assemblyTable.x + L.assemblyTable.w * 0.35, L.assemblyTable.y + 40));
  doc.add(gearPlate(doc, 600, 760, 30, 14, BRASS, 'wsSpareGear', { rot: 0.4 }), gearPlate(doc, 640, 820, 18, 10, COPPER, 'wsSpareGear2', { rot: 0.1, spokes: 4 }));
  doc.add(crate(950, 860, 44, 6), crate(1000, 900, 34, -10), barrel(doc, 1090, 870, 20), crate(860, 930, 30, 14));

  // Wall pipework with gauges.
  doc.add(pipeRun([{ x: 180, y: 380 }, { x: 180, y: 300 }, { x: 640, y: 300 }, { x: 640, y: 200 }], 12, COPPER, 120));
  doc.add(pressureGauge(400, 300, 13, 0.3), valveWheel(560, 300, 12));
  doc.add(pipeRun([{ x: 1170, y: 360 }, { x: 1170, y: 980 }], 12, IRON, 140), valveWheel(1170, 520, 12, '#2a6ac0'));

  // Shelves (bottom wall of the hall and the store walls).
  for (const s of L.shelves) doc.add(partsShelf(rng, s));

  // Store: safe, crates and coils of cable.
  doc.add(ironSafe(doc, L.safe.x, L.safe.y));
  doc.add(crate(1320, 140, 50, 4), crate(1380, 150, 40, -8), crate(1330, 210, 38, 12), barrel(doc, 1460, 140, 20), barrel(doc, 1500, 170, 18));
  doc.add(circle(1320, 400, 22, { fill: 'none', stroke: COPPER.base, strokeWidth: 6 }), circle(1320, 400, 12, { fill: 'none', stroke: COPPER.dark, strokeWidth: 5 }));
  doc.add(gearPlate(doc, 1420, 300, 26, 12, IRON, 'storeGear', { rot: 0.2, spokes: 5 }));

  // Office: desk with plans, bookshelf, bed and a small stove.
  doc.add(deskWithLamp(doc, rng, L.desk));
  doc.add(bookshelf(rng, 1560, 540, 40, 170, 0));
  doc.add(bed(L.bed.x, L.bed.y, L.bed.w, L.bed.h, '#5a2a1a'));
  doc.add(circle(1260, 990, 28, { fill: metalRadial(doc, 'officeStove', IRON), stroke: '#0e0c0a', strokeWidth: 3 }), circle(1260, 990, 12, { fill: '#ff8a2a', opacity: 0.8 }), rivetRing(1260, 990, 22, 8, 1.6, '#c8ccd2'));

  // Doorstep outside.
  doc.add(rect(L.frontDoor.x - 50, L.frontDoor.y + 14, 100, 30, { fill: '#7a766c', stroke: '#2f2c27', strokeWidth: 2 }), rect(L.frontDoor.x - 36, L.frontDoor.y - 40, 72, 30, { fill: '#5a3a2a', stroke: '#2a1a0e', strokeWidth: 1.5, rx: 3 }));

  doc.add(steamWalls(L.walls, BRICK_WALL));
  for (const l of L.lights) if (l.color === '#ffcf7a' || l.color === '#ffe2a0') doc.add(wallLamp(doc, l.x, l.y, l.color));
  doc.add(vignette(doc, L.width, L.height, 0.45));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Fábrica Abandonada
// ---------------------------------------------------------------------------

function rubble(doc: SvgDoc, rng: Prng, x: number, y: number, r: number, count: number): string {
  const parts: string[] = [softShadow(doc, x + r * 0.2, y + r * 0.3, r * 1.2, r, 0.45)];
  for (let i = 0; i < count; i++) {
    const px = x + rng.jitter(r);
    const py = y + rng.jitter(r * 0.8);
    const s = rng.range(5, 16);
    parts.push(path(polyPath(blobPoints(rng, px, py, s, s * 0.7, 5, 0.35, rng.range(0, 3))), { fill: rng.pick(['#7a3424', '#8a3e2a', '#5a5048', '#6d675e', '#4a4038']), stroke: '#1a1210', strokeWidth: 1 }));
  }
  return parts.join('');
}

function brokenBeam(x: number, y: number, len: number, rot: number): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-len / 2 + 8, -9 + 10, len, 18, { fill: '#000000', opacity: 0.4 }),
    rect(-len / 2, -9, len, 18, { fill: '#4a4f56', stroke: '#0e1012', strokeWidth: 2 }),
    rect(-len / 2, -3, len, 6, { fill: '#2a2e33' }),
    rivetLine(-len / 2 + 8, -6, len / 2 - 8, -6, Math.max(2, Math.round(len / 30)), 1.6, '#a8aeb8'),
    path(`M${n(len / 2)} -9l10 6l-6 4l8 8`, { fill: 'none', stroke: '#4a4f56', strokeWidth: 3 }),
  ]);
}

function weedTuft(rng: Prng, x: number, y: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + rng.jitter(1.2);
    const len = rng.range(8, 16);
    parts.push(line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, { stroke: rng.pick(['#4a6a2a', '#5a7a3a', '#3a5a22']), strokeWidth: 2, strokeLinecap: 'round' }));
  }
  return parts.join('');
}

export function buildFactory(): string {
  const L = FACTORY;
  const rng = createRng('map-fabrica-abandonada');
  const doc = new SvgDoc(L.width, L.height, 'Fábrica Abandonada');

  // Yard: cracked concrete, weeds and puddles.
  const yard = flagstoneTexture(doc, rng, 'yardConcrete', '#5a564e', '#2a2724');
  doc.add(terrain(rng, L.width, L.height, { base: '#3a3631', blotches: ['#2a2622', '#4a4038', '#3a3a2a'], count: 70, texture: yard }));
  doc.add(rect(0, 0, L.width, L.height, { fill: speckleTexture(doc, rng, 'yardGrit', ['#1a1714', '#5a564e', '#2a2622'], 160, 90), opacity: 0.6 }));
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, L.width);
    const y = rng.range(0, L.height);
    const inHall = x > L.hall.x && x < L.hall.x + L.hall.w && y > L.hall.y && y < L.hall.y + L.hall.h;
    const inFurnace = x > L.furnaceRoom.x && x < L.furnaceRoom.x + L.furnaceRoom.w && y > L.furnaceRoom.y && y < L.furnaceRoom.y + L.furnaceRoom.h;
    if (!inHall && !inFurnace) doc.add(weedTuft(rng, x, y));
  }
  doc.add(railway(L.rail, 34, false));
  doc.add(chimneyStack(doc, rng, L.chimneys[0]!.x, L.chimneys[0]!.y, L.chimneys[0]!.r));

  // Hall floor: stained concrete slabs. Furnace room: rusted plates.
  const hallFloor = flagstoneTexture(doc, rng, 'factoryFloor', '#6a665e', '#2e2b27');
  doc.add(rect(L.hall.x - 12, L.hall.y - 12, L.hall.w + 24, L.hall.h + 24, { fill: '#000000', opacity: 0.5 }));
  doc.add(rect(L.hall.x, L.hall.y, L.hall.w, L.hall.h, { fill: hallFloor }));
  doc.add(rect(L.furnaceRoom.x, L.furnaceRoom.y, L.furnaceRoom.w, L.furnaceRoom.h, { fill: plateTexture(doc, rng, 'furnacePlates', '#4a4740', '#8a3a1a') }));
  for (let i = 0; i < 60; i++) doc.add(ellipse(rng.range(L.hall.x, L.furnaceRoom.x + L.furnaceRoom.w), rng.range(L.hall.y, L.hall.y + L.hall.h), rng.range(12, 50), rng.range(8, 26), { fill: rng.pick(['#0e0c0a', '#1a1612', '#2a1a10']), opacity: rng.range(0.15, 0.4) }));
  // Painted floor markings.
  doc.add(rect(L.hall.x + 30, L.hall.y + 560, 260, 16, { fill: hazardTexture(doc), opacity: 0.4 }), rect(L.hall.x + 800, L.hall.y + 30, 16, 200, { fill: hazardTexture(doc), opacity: 0.4 }));

  // Collapsed roof: light shaft, rubble and fallen beams.
  const c = L.collapse;
  doc.add(lightPool(doc, 'collapseShaft', '#e8eef2', c.x, c.y + 20, c.r * 1.6, 0.55));
  doc.add(rubble(doc, rng, c.x, c.y + 10, c.r * 0.7, 46));
  doc.add(brokenBeam(c.x - 40, c.y - 10, 220, 24), brokenBeam(c.x + 60, c.y + 50, 180, -38));

  // Conveyors, presses and the toppled boiler.
  for (const cv of L.conveyors) doc.add(conveyor(doc, rng, cv.x, cv.y, cv.len, 60, cv.gap));
  for (const p of L.presses) doc.add(hydraulicPress(doc, p));
  const tb = L.toppledBoiler;
  doc.add(g({ transform: `rotate(-8 ${tb.x + tb.w / 2} ${tb.y + tb.h / 2})` }, boiler(doc, tb.x, tb.y, tb.w, tb.h, 'right', 'toppledBoiler')));
  doc.add(path(smoothPath(blobPoints(rng, tb.x + tb.w + 40, tb.y + tb.h * 0.8, 60, 30, 10, 0.2)), { fill: '#0e1418', opacity: 0.7 }));

  // The pit, bridged by the catwalk.
  const pit = L.pit;
  doc.add(rect(pit.x - 12, pit.y - 12, pit.w + 24, pit.h + 24, { fill: hazardTexture(doc) }));
  doc.add(rect(pit.x, pit.y, pit.w, pit.h, { fill: '#050404' }));
  doc.add(rect(pit.x, pit.y, pit.w, pit.h, { fill: doc.def('pitGlow', radialGradient('pitGlow', [[0, '#ff6a1a', 0.55], [0.6, '#7a1a05', 0.3], [1, '#000000', 0]])) }));
  for (const cw of L.catwalks) doc.add(catwalk(doc, cw));

  // Toxic puddles leaking from burst drums.
  for (const p of L.puddles) doc.add(toxicPuddle(doc, rng, p.x, p.y, p.rx, p.ry));
  doc.add(barrel(doc, 690, 300, 20), barrel(doc, 1200, 1150, 20), barrel(doc, 440, 1140, 18));
  // Scrap heaps.
  for (const s of L.scrap) doc.add(scrapHeap(doc, rng, s.x, s.y, s.r));
  doc.add(crate(1460, 380, 40, 18), crate(300, 640, 44, -10), crate(340, 820, 34, 24));

  // Furnace room: blast furnace, giant gear, slag pools and coal.
  for (const s of L.slag) doc.add(lavaPool(doc, rng, s.x, s.y, s.rx, s.ry));
  doc.add(gearPlate(doc, L.bigGear.x, L.bigGear.y, L.bigGear.r, 28, BRASS, 'factoryBigGear', { rot: 0.15, spokes: 6 }));
  doc.add(blastFurnace(doc, rng, L.furnace.x, L.furnace.y, L.furnace.r));
  doc.add(coalScatter(rng, 1600, 1060, 220, 70, 40));
  doc.add(chimneyStack(doc, rng, L.chimneys[1]!.x, L.chimneys[1]!.y, L.chimneys[1]!.r));
  doc.add(pipeRun([{ x: 1520, y: 300 }, { x: 1520, y: 560 }, { x: 1680, y: 560 }], 16, COPPER, 120), valveWheel(1520, 430, 13), pressureGauge(1560, 330, 14, 1.3));

  // Walls with collapsed sections, plus rubble at the breaches.
  doc.add(steamWalls(L.walls, BRICK_WALL));
  const hx1 = L.hall.x + L.hall.w;
  const hy1 = L.hall.y + L.hall.h;
  for (const [x, y] of [
    [L.hall.x + 160, L.hall.y],
    [L.hall.x + 280, L.hall.y],
    [L.hall.x + 740, L.hall.y],
    [L.hall.x + 880, L.hall.y],
    [hx1, L.hall.y + 810],
    [hx1, L.hall.y + 880],
    [hx1 - 640, hy1],
    [hx1 - 800, hy1],
    [L.hall.x, hy1 - 160],
    [L.hall.x, hy1 - 270],
  ] as [number, number][])
    doc.add(rubble(doc, rng, x, y, 26, 8));

  // Drifting smoke and dust.
  doc.add(plume(doc, rng, L.collapse.x, L.collapse.y - 60, 30, '#c8c4bc', 0.25, { x: 0.6, y: -0.8 }));
  doc.add(fogPatches(doc, rng, L.width, L.height, 10, '#a8a090', [0.05, 0.12]));
  doc.add(vignette(doc, L.width, L.height, 0.55));
  return doc.render();
}

