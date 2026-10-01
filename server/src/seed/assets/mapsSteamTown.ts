import { barrel, cobbleTexture, crate, flagstoneTexture, fogPatches, plankTexture, speckleTexture, terrain } from './brushes';
import { GEAR_CITY, SKY_PORT } from './layoutsSteam';
import { createRng, type Prng } from './rng';
import {
  airshipTop,
  coalBunker,
  clockTower,
  cloudSea,
  dockCrane,
  gangway,
  gasLamp,
  gearPlate,
  gearPlaza,
  islandRim,
  marketStall,
  mooringTower,
  pipeRun,
  plume,
  pressureGauge,
  railway,
  skyPier,
  steamBuilding,
  steamVent,
  tramCar,
  valveWheel,
} from './steamBrushes';
import { BRASS, COPPER, IRON, metalLinear, metalRadial, rivetLine } from './steamKit';
import { SvgDoc, circle, ellipse, g, line, n, path, polyPath, rect, shade, softShadow, tag, text, vignette, type Pt } from './svg';

/** "Los Cielos de Latón": Ciudad de Engranajes and Puerto de Dirigibles (2100 x 1400, 70 px grid). */

const SERIF = "Georgia, 'Times New Roman', serif";

function streetSurface(doc: SvgDoc, rng: Prng): string {
  return flagstoneTexture(doc, rng, 'streetStone', '#58534c', '#26231f');
}

/** Iron bench seen from above. */
function bench(x: number, y: number, rot: number): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-34 + 5, -10 + 7, 68, 20, { fill: '#000000', opacity: 0.35 }),
    rect(-34, -10, 68, 20, { fill: '#7a5530', stroke: '#1e120a', strokeWidth: 2, rx: 3 }),
    line(-30, -3, 30, -3, { stroke: '#5a3a1a', strokeWidth: 1.5 }),
    line(-30, 4, 30, 4, { stroke: '#5a3a1a', strokeWidth: 1.5 }),
    rect(-38, -12, 6, 24, { fill: '#1e2226', rx: 2 }),
    rect(32, -12, 6, 24, { fill: '#1e2226', rx: 2 }),
  ]);
}

/** Cast-iron planter with a clipped shrub. */
function planter(doc: SvgDoc, rng: Prng, x: number, y: number): string {
  return [
    softShadow(doc, x + 6, y + 8, 26, 24, 0.45),
    rect(x - 22, y - 22, 44, 44, { fill: '#2a2e33', stroke: '#0e1012', strokeWidth: 2.5, rx: 4 }),
    circle(x, y, 17, { fill: '#2f5a26' }),
    circle(x - 5, y - 5, 10, { fill: '#4f8a3a' }),
    circle(x + rng.jitter(5), y + rng.jitter(5), 4, { fill: '#7aa84a', opacity: 0.7 }),
  ].join('');
}

function manhole(x: number, y: number): string {
  return [circle(x, y, 18, { fill: '#2a2622', stroke: '#141210', strokeWidth: 3 }), circle(x, y, 13, { fill: 'none', stroke: '#5c616a', strokeWidth: 2 }), line(x - 12, y, x + 12, y, { stroke: '#5c616a', strokeWidth: 2 }), line(x, y - 12, x, y + 12, { stroke: '#5c616a', strokeWidth: 2 })].join('');
}

function oilPuddle(doc: SvgDoc, rng: Prng, x: number, y: number, r: number): string {
  return [ellipse(x, y, r, r * 0.6, { fill: '#121418', opacity: 0.7, transform: `rotate(${n(rng.range(0, 180))} ${n(x)} ${n(y)})` }), ellipse(x - r * 0.2, y - r * 0.1, r * 0.4, r * 0.15, { fill: '#7a5aa8', opacity: 0.25 }), ellipse(x + r * 0.15, y + r * 0.1, r * 0.3, r * 0.1, { fill: '#3a9a8a', opacity: 0.25 })].join('');
}

/** Steam carriage parked on the street (top view). */
function steamCarriage(doc: SvgDoc, x: number, y: number, rot: number, color: string): string {
  return g({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(rot)})` }, [
    rect(-62 + 8, -30 + 10, 124, 60, { fill: '#000000', opacity: 0.4, rx: 10 }),
    rect(-58, -34, 22, 12, { fill: '#141210', rx: 3 }),
    rect(-58, 22, 22, 12, { fill: '#141210', rx: 3 }),
    rect(30, -34, 22, 12, { fill: '#141210', rx: 3 }),
    rect(30, 22, 22, 12, { fill: '#141210', rx: 3 }),
    rect(-62, -28, 124, 56, { fill: color, stroke: '#0e0a06', strokeWidth: 2.5, rx: 12 }),
    rect(-40, -22, 50, 44, { fill: shade(color, -0.3), stroke: '#0e0a06', strokeWidth: 1.5, rx: 6 }),
    circle(36, 0, 17, { fill: metalRadial(doc, 'carriageBoiler', COPPER), stroke: '#1a0e06', strokeWidth: 2 }),
    circle(36, 0, 6, { fill: '#1a1a1a' }),
    circle(60, -18, 4, { fill: '#fff4c0' }),
    circle(60, 18, 4, { fill: '#fff4c0' }),
  ]);
}

/** Newspaper / ticket kiosk with a dome. */
function kiosk(doc: SvgDoc, x: number, y: number, label: string): string {
  return [
    softShadow(doc, x + 10, y + 12, 44, 40, 0.5),
    circle(x, y, 34, { fill: '#2f5a4a', stroke: '#0e1a16', strokeWidth: 3 }),
    gearPlate(doc, x, y, 28, 14, BRASS, 'kioskDome', { spokes: 6 }),
    text(x, y + 54, label, { fontFamily: SERIF, fontSize: 15, fontWeight: 'bold', fill: '#f3ead6', textAnchor: 'middle', stroke: '#1a120a', strokeWidth: 3, paintOrder: 'stroke' }),
  ].join('');
}

/** Hanging sign in front of a door. */
function shopSign(doc: SvgDoc, x: number, y: number, label: string, icon: 'gear' | 'coin'): string {
  const w = Math.round(label.length * 11 + 56);
  const gx = x - w / 2 + 20;
  const glyph = icon === 'gear' ? gearPlate(doc, gx, y, 11, 10, BRASS, 'signGear', { spokes: 0 }) : circle(gx, y, 10, { fill: BRASS.base, stroke: '#2a1a0a', strokeWidth: 2 });
  return [
    rect(x - w / 2 + 5, y - 16 + 6, w, 32, { fill: '#000000', opacity: 0.4, rx: 4 }),
    rect(x - w / 2, y - 16, w, 32, { fill: '#3a2412', stroke: BRASS.base, strokeWidth: 2.5, rx: 4 }),
    glyph,
    text(x + 16, y + 6, label, { fontFamily: SERIF, fontSize: 16, fontWeight: 'bold', fill: '#f3d58a', textAnchor: 'middle', letterSpacing: 1 }),
  ].join('');
}

// ---------------------------------------------------------------------------
// Ciudad de Engranajes
// ---------------------------------------------------------------------------

export function buildGearCity(): string {
  const L = GEAR_CITY;
  const rng = createRng('map-ciudad-engranajes');
  const doc = new SvgDoc(L.width, L.height, 'Ciudad de Engranajes');
  const cobbles = cobbleTexture(doc, rng, 'cityCobbles', '#6a655c', '#2a2622');
  doc.add(terrain(rng, L.width, L.height, { base: '#3a3631', blotches: ['#2a2622', '#4a453e', '#1e1b18'], count: 60, texture: cobbles }));
  doc.add(rect(0, 0, L.width, L.height, { fill: speckleTexture(doc, rng, 'citySoot', ['#141210', '#2a2622', '#0a0908'], 180, 80), opacity: 0.6 }));

  // Avenue with sidewalks and the south street.
  const street = streetSurface(doc, rng);
  const av = L.avenue;
  const top = av.y - av.h / 2;
  const bottom = av.y + av.h / 2;
  const sidewalk = flagstoneTexture(doc, rng, 'sidewalkStone', '#8d867a', '#3a362f');
  doc.add(rect(0, top - 26, L.width, 26, { fill: sidewalk }), rect(0, bottom, L.width, 26, { fill: sidewalk }));
  doc.add(rect(0, top, L.width, av.h, { fill: street }), line(0, top, L.width, top, { stroke: '#1a1714', strokeWidth: 5 }), line(0, bottom, L.width, bottom, { stroke: '#1a1714', strokeWidth: 5 }));
  const ss = L.southStreet;
  doc.add(rect(ss.x - ss.w / 2 - 22, bottom, 22, L.height - bottom, { fill: sidewalk }), rect(ss.x + ss.w / 2, bottom, 22, L.height - bottom, { fill: sidewalk }));
  doc.add(rect(ss.x - ss.w / 2, bottom - 4, ss.w, L.height - bottom + 8, { fill: street }), line(ss.x - ss.w / 2, bottom + 26, ss.x - ss.w / 2, L.height, { stroke: '#1a1714', strokeWidth: 5 }), line(ss.x + ss.w / 2, bottom + 26, ss.x + ss.w / 2, L.height, { stroke: '#1a1714', strokeWidth: 5 }));
  // Street between the plaza and the clock tower.
  doc.add(rect(L.plaza.x - 70, L.clockTower.y, 140, L.plaza.y - L.clockTower.y, { fill: street }));
  // Puddles, oil stains and manholes on the avenue.
  for (let i = 0; i < 10; i++) doc.add(oilPuddle(doc, rng, rng.range(60, L.width - 60), rng.range(top + 20, bottom - 20), rng.range(14, 34)));
  for (const x of [190, 880, 1560, 1990]) doc.add(manhole(x, av.y + 48));
  doc.add(manhole(ss.x, 1180));

  // Rails and tram.
  doc.add(railway(L.rails, 34, false), railway(L.railBranch, 34, true));
  doc.add(tramCar(doc, L.tram.x, L.tram.y, 0, '#2f6f6a'));

  // Plaza of the Gears.
  doc.add(gearPlaza(doc, rng, L.plaza.x, L.plaza.y, L.plaza.r));
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i / 6) * Math.PI * 2 + Math.PI / 6;
    const bx = L.plaza.x + Math.cos(a) * (L.plaza.r * 0.66);
    const by = L.plaza.y + Math.sin(a) * (L.plaza.r * 0.66);
    if (Math.hypot(bx - L.spawn.x, by - L.spawn.y) < 80) continue;
    doc.add(bench(bx, by, (a * 180) / Math.PI + 90));
  }
  for (const s of L.stalls) doc.add(marketStall(doc, rng, s));
  doc.add(planter(doc, rng, L.plaza.x - 250, L.plaza.y + 170), planter(doc, rng, L.plaza.x + 250, L.plaza.y + 170), planter(doc, rng, L.plaza.x - 250, L.plaza.y - 170), planter(doc, rng, L.plaza.x + 255, L.plaza.y - 120));

  // Clock tower.
  doc.add(clockTower(doc, rng, L.clockTower.x, L.clockTower.y, L.clockTower.size));

  // Buildings.
  for (const b of L.buildings) doc.add(steamBuilding(doc, rng, b));
  const ws = L.workshop;
  doc.add(steamBuilding(doc, rng, ws, { chimneys: 2 }));
  // Inventor's workshop: glowing skylight, door, sign and a lamp.
  doc.add(gearPlate(doc, ws.cx + 120, ws.cy - 60, 34, 14, BRASS, 'workshopRoofGear', { rot: 0.3 }), gearPlate(doc, ws.cx + 158, ws.cy - 20, 20, 10, COPPER, 'workshopRoofGear2', { rot: 0.1, spokes: 4 }));
  const wd = L.workshopDoor;
  doc.add(rect(wd.x - 44, wd.y - 4, 88, 26, { fill: '#7a766c', stroke: '#2f2c27', strokeWidth: 2 }), rect(wd.x - 34, wd.y - 10, 68, 12, { fill: '#5a3a1a', stroke: '#1e120a', strokeWidth: 2 }));
  doc.add(shopSign(doc, wd.x - 130, wd.y + 32, 'TALLER VOLTA', 'gear'));

  // Pipes (some overhead, crossing streets on iron stands).
  for (const run of L.pipes) {
    const metal = run.length > 2 ? COPPER : rng.chance(0.5) ? COPPER : IRON;
    doc.add(pipeRun(run, 18, metal, 140));
  }
  for (const [x, y] of [
    [620, 870],
    [620, 1050],
    [1620, 870],
    [1620, 1050],
  ] as [number, number][])
    doc.add(rect(x - 22, y - 7, 44, 14, { fill: '#1e2226', stroke: '#0a0c0e', strokeWidth: 2 }));
  doc.add(valveWheel(1520, 868, 14), pressureGauge(1800, 822, 14), valveWheel(620, 790, 13), pressureGauge(1450, 420, 13, 0.2));

  // Steam vents and street props.
  for (const v of L.vents) doc.add(steamVent(doc, rng, v.x, v.y, 20));
  doc.add(steamCarriage(doc, 1750, 1010, 180, '#7a2a24'), steamCarriage(doc, 800, 1012, 180, '#2a3a5a'));
  doc.add(kiosk(doc, 1250, 815, 'GACETA'));
  doc.add(crate(700, 790, 40, 8), crate(735, 818, 30, -6), barrel(doc, 668, 820, 18), barrel(doc, 1330, 790, 18), crate(1370, 800, 34, 12));
  doc.add(crate(905, 1110, 36, 4), barrel(doc, 945, 1100, 16), crate(1990, 1090, 38, -8), barrel(doc, 2040, 1100, 18));
  doc.add(crate(150, 820, 36, 10), barrel(doc, 110, 820, 17), crate(1500, 790, 30, -12));

  // Gas lamps.
  for (const l of L.lights) if (l.color === '#ffd28a') doc.add(gasLamp(doc, l.x, l.y));

  // Chimney smoke drifting over the roofs and a light industrial haze.
  for (let i = 0; i < 6; i++) doc.add(plume(doc, rng, rng.range(100, 2000), rng.range(80, 350), rng.range(20, 34), '#5a5650', 0.25, { x: 1, y: -0.3 }));
  doc.add(fogPatches(doc, rng, L.width, L.height, 9, '#b8b0a4', [0.05, 0.12]));
  doc.add(vignette(doc, L.width, L.height, 0.45));
  return doc.render();
}

// ---------------------------------------------------------------------------
// Puerto de Dirigibles
// ---------------------------------------------------------------------------

function windsock(x: number, y: number): string {
  return [
    circle(x, y, 7, { fill: '#2a2e33', stroke: '#0e1012', strokeWidth: 2 }),
    path(`M${x} ${y}l70 -18l-4 12l4 12z`, { fill: '#e8742a', stroke: '#3a1a08', strokeWidth: 1.5 }),
    path(`M${x + 24} ${y - 6}v13M${x + 48} ${y - 12}v20`, { stroke: '#f3ead6', strokeWidth: 6 }),
  ].join('');
}

/** Flexible gas hose from a quay manifold to a moored airship. */
function gasHose(doc: SvgDoc, from: Pt, to: Pt): string {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 60 };
  const d = `M${n(from.x)} ${n(from.y)}Q${n(mid.x)} ${n(mid.y)} ${n(to.x)} ${n(to.y)}`;
  return [
    path(d, { fill: 'none', stroke: '#000000', strokeWidth: 16, opacity: 0.25, transform: 'translate(10 14)' }),
    path(d, { fill: 'none', stroke: '#14100c', strokeWidth: 14 }),
    path(d, { fill: 'none', stroke: '#4a3a2a', strokeWidth: 10 }),
    path(d, { fill: 'none', stroke: '#8a6a4a', strokeWidth: 3, strokeDasharray: '6 8' }),
    circle(from.x, from.y, 16, { fill: metalRadial(doc, 'hoseManifold', BRASS), stroke: '#1a120a', strokeWidth: 2 }),
    valveWheel(from.x, from.y, 10),
  ].join('');
}

export function buildSkyPort(): string {
  const L = SKY_PORT;
  const rng = createRng('map-puerto-dirigibles');
  const doc = new SvgDoc(L.width, L.height, 'Puerto de Dirigibles');

  // Sky and clouds below the island edge.
  doc.add(cloudSea(doc, rng, 0, 0, L.width, L.height, 40));

  // Island ground clipped to the land polygon.
  const landD = polyPath(L.land);
  doc.def('portLandClip', tag('clipPath', { id: 'portLandClip' }, path(landD)));
  const cobbles = cobbleTexture(doc, rng, 'portCobbles', '#6a655c', '#2a2622');
  const quay = flagstoneTexture(doc, rng, 'quayStone', '#8a8274', '#3a352e');
  const street = flagstoneTexture(doc, rng, 'portStreet', '#58534c', '#26231f');
  const ground: string[] = [terrain(rng, 1000, L.height, { base: '#3a3631', blotches: ['#2a2622', '#4a453e'], count: 30, texture: cobbles }), rect(L.quayX, 0, 400, L.height, { fill: quay }), line(L.quayX, 0, L.quayX, L.height, { stroke: '#1a1714', strokeWidth: 6 })];
  // Road towards the city.
  const roadTop = L.road[0]!.y - 60;
  ground.push(rect(0, roadTop, 1000, 120, { fill: street }), line(0, roadTop, L.quayX, roadTop, { stroke: '#1a1714', strokeWidth: 4 }), line(0, roadTop + 120, L.quayX, roadTop + 120, { stroke: '#1a1714', strokeWidth: 4 }));
  for (let i = 0; i < 26; i++) ground.push(ellipse(rng.range(0, 950), rng.range(0, L.height), rng.range(10, 30), rng.range(6, 18), { fill: '#141210', opacity: rng.range(0.15, 0.35) }));
  ground.push(railway(L.rail, 34, false));
  doc.add(g({ clipPath: 'url(#portLandClip)' }, ground));
  doc.add(islandRim(doc, rng, L.edge, { x: 1, y: 0 }));
  // Coal bin for refuelling the boilers.
  doc.add(coalBunker(doc, rng, { x: 712, y: 1170, w: 150, h: 96 }));

  // Warehouses with loading doors.
  for (const w of L.warehouses) {
    doc.add(steamBuilding(doc, rng, w, { chimneys: 1 }));
    const doorX = w.cx + w.w / 2;
    for (const dy of [-50, 50]) doc.add(rect(doorX - 4, w.cy + dy - 30, 14, 60, { fill: '#5a3a1a', stroke: '#1e120a', strokeWidth: 2 }), line(doorX + 2, w.cy + dy - 26, doorX + 2, w.cy + dy + 26, { stroke: '#3a2412', strokeWidth: 1.5, strokeDasharray: '4 4' }));
    doc.add(crate(doorX + 50, w.cy - 60, 38, rng.range(-12, 12)), crate(doorX + 82, w.cy - 40, 30, rng.range(-12, 12)), barrel(doc, doorX + 60, w.cy + 70, 17), barrel(doc, doorX + 92, w.cy + 58, 15));
  }
  doc.add(shopSign(doc, 250, 615, 'COBRE Y CÍA.', 'coin'));

  // Piers, gangway and ships.
  const planks = plankTexture(doc, rng, 'pierPlanks', '#7a5634');
  const gaviota = L.ships.gaviota;
  const albatros = L.ships.albatros;
  const urraca = L.ships.urraca;
  for (const p of L.piers) doc.add(skyPier(doc, rng, p.x0, p.x1, p.y, p.h, planks));
  doc.add(gangway(doc, L.gangway.x, L.gangway.y0, L.gangway.y1, L.gangway.w));
  doc.add(gasHose(doc, { x: 880, y: 600 }, { x: 1040, y: 640 }));
  doc.add(airshipTop(doc, rng, gaviota, 'shipGaviota', { shadowOffset: { x: 60, y: 120 }, mooringTo: { x: L.towers[0]!.x, y: L.towers[0]!.y } }));
  doc.add(airshipTop(doc, rng, albatros, 'shipAlbatros', { shadowOffset: { x: 70, y: 140 }, mooringTo: { x: L.towers[2]!.x, y: L.towers[2]!.y } }));
  doc.add(airshipTop(doc, rng, urraca, 'shipUrraca', { shadowOffset: { x: 60, y: 110 }, mooringTo: { x: L.towers[1]!.x, y: L.towers[1]!.y } }));
  // Pirate flag painted on La Urraca.
  doc.add(g({ transform: `translate(${urraca.cx - urraca.len * 0.32} ${urraca.cy})` }, [circle(0, 0, 26, { fill: '#c0392b', stroke: '#140a06', strokeWidth: 2 }), circle(0, -3, 10, { fill: '#f3ead6' }), circle(-4, -4, 2.5, { fill: '#140a06' }), circle(4, -4, 2.5, { fill: '#140a06' }), path('M-14 10L14 18M14 10L-14 18', { stroke: '#f3ead6', strokeWidth: 3 })]));
  for (const t of L.towers) doc.add(mooringTower(doc, t.x, t.y, t.r));

  // Cranes, cargo and quay furniture.
  for (const c of L.cranes) doc.add(dockCrane(doc, rng, c.x, c.y, c.rot, c.boom));
  for (const [x, y] of [
    [760, 300],
    [800, 340],
    [770, 1050],
    [815, 1095],
    [740, 640],
  ] as [number, number][])
    doc.add(crate(x, y, rng.range(32, 44), rng.range(-15, 15)));
  doc.add(barrel(doc, 840, 280, 18), barrel(doc, 845, 1010, 18), barrel(doc, 720, 1110, 16));
  doc.add(windsock(770, 190));
  // Passenger shelter on the quay and ticket kiosk by the road.
  doc.add(rect(722 + 10, 772 + 12, 120, 62, { fill: '#000000', opacity: 0.4 }), rect(722, 772, 120, 62, { fill: metalLinear(doc, 'shelterRoof', { light: '#9fd8c4', base: '#4f9a84', dark: '#1e4a3e' }), stroke: '#0e1a16', strokeWidth: 3 }), rivetLine(728, 778, 836, 778, 8, 1.8, BRASS.light), bench(782, 852, 0));
  doc.add(kiosk(doc, 480, 815, 'BILLETES'));
  // Lamps.
  for (const l of L.lights) if (l.color === '#ffd28a') doc.add(gasLamp(doc, l.x, l.y));
  // Exhaust from the moored ships.
  doc.add(plume(doc, rng, albatros.cx - albatros.len / 2 - 60, albatros.cy - 40, 22, '#f2f4f6', 0.35, { x: -1, y: -0.2 }));
  doc.add(fogPatches(doc, rng, L.width, L.height, 7, '#ffffff', [0.06, 0.14]));
  doc.add(vignette(doc, L.width, L.height, 0.35, '#1a2a3a'));
  return doc.render();
}

