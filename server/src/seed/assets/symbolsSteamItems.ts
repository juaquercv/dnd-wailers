import { BRASS, COPPER, IRON, gearD, gearWithHoleD, metalLinear, metalRadial, rivetLine, rivetRing, spokeWindowsD, tubeGradient } from './steamKit';
import { OUT, glowFill, lin, rad, stroke, type SymbolFn } from './symbolsCreatures';
import { circle, ellipse, g, line, path, polyPath, rect, starPoints, text } from './svg';

/** Steampunk item, gadget and sound symbols (100 x 100 box). Nothing here is magical: brass, steam and sparks. */

function wisp(x: number, y: number, s: number, opacity = 0.8): string {
  return path(`M${x} ${y}Q${x - s} ${y - s} ${x} ${y - s * 2}Q${x + s} ${y - s * 3} ${x} ${y - s * 4}`, { fill: 'none', stroke: '#eef2f4', strokeWidth: s * 0.7, strokeLinecap: 'round', opacity });
}

function puff(x: number, y: number, r: number, opacity = 0.85): string {
  return [circle(x, y, r, { fill: '#eef2f4', opacity }), circle(x + r * 0.8, y - r * 0.5, r * 0.75, { fill: '#ffffff', opacity }), circle(x - r * 0.8, y - r * 0.3, r * 0.65, { fill: '#dfe6ea', opacity })].join('');
}

// ---------------------------------------------------------------------------
// Weapons and armor
// ---------------------------------------------------------------------------

export const steamPistol: SymbolFn = (doc) => {
  const brass = tubeGradient(doc, 'spBarrel', BRASS);
  const wood = lin(doc, 'spGrip', '#9a5a2a', '#3a1a08', true);
  return g({ transform: 'rotate(-18 50 50)' }, [
    path('M30 52L44 52L40 84Q39 90 33 90H24Q18 90 19 84Z', { fill: wood, ...stroke(2.2) }),
    path('M24 62H36M23 70H35M22 78H34', { stroke: '#2a1206', strokeWidth: 1.2, opacity: 0.6 }),
    path('M38 56Q42 66 52 64', { fill: 'none', ...stroke(2.4) }),
    path('M40 56L43 63', { stroke: '#2a2c30', strokeWidth: 2.4, strokeLinecap: 'round' }),
    rect(24, 40, 70, 14, { rx: 4, fill: brass, ...stroke(2.4) }),
    rect(84, 38, 10, 18, { rx: 2, fill: metalLinear(doc, 'spMuzzle', COPPER), ...stroke(2) }),
    rect(40, 38, 6, 18, { fill: '#b8673a', ...stroke(1.4) }),
    rect(62, 38, 6, 18, { fill: '#b8673a', ...stroke(1.4) }),
    rect(30, 24, 30, 15, { rx: 7, fill: lin(doc, 'spTank', '#dff4ff', '#7aa8c8'), opacity: 0.9, ...stroke(2) }),
    rect(32, 30, 26, 7, { rx: 3.5, fill: '#5fd8ff', opacity: 0.6 }),
    circle(70, 32, 7, { fill: '#f3ead6', ...stroke(1.8) }),
    path('M70 32L73 28', { stroke: '#c0392b', strokeWidth: 1.6, strokeLinecap: 'round' }),
    rect(14, 42, 12, 8, { rx: 3, fill: '#5c616a', ...stroke(1.6) }),
    wisp(96, 36, 3, 0.7),
  ]);
};

export const airRifle: SymbolFn = (doc) => {
  const wood = lin(doc, 'arStock', '#b06a34', '#4a2410');
  return g({ transform: 'rotate(-40 50 50)' }, [
    path('M2 52L30 46L34 58L8 70Q2 70 2 64Z', { fill: wood, ...stroke(2.2) }),
    rect(30, 45, 66, 9, { rx: 3, fill: tubeGradient(doc, 'arBarrel', BRASS), ...stroke(2) }),
    rect(34, 56, 40, 12, { rx: 6, fill: tubeGradient(doc, 'arTank', COPPER), ...stroke(2) }),
    path('M40 56V68M50 56V68M60 56V68', { stroke: '#5e2c12', strokeWidth: 1.2 }),
    rect(44, 32, 30, 9, { rx: 4.5, fill: tubeGradient(doc, 'arScope', IRON), ...stroke(1.8) }),
    path('M50 41V45M68 41V45', { stroke: OUT, strokeWidth: 2 }),
    circle(74, 36.5, 3.4, { fill: '#7fe8ff', ...stroke(1) }),
    path('M34 54Q36 62 42 60', { fill: 'none', ...stroke(1.8) }),
    rect(92, 43, 6, 13, { rx: 1.5, fill: '#2a2c30', ...stroke(1.4) }),
  ]);
};

export const heavyWrench: SymbolFn = (doc) => {
  const steel = lin(doc, 'hwSteel', '#f6f8fc', '#6a707a', true);
  return g({ transform: 'rotate(40 50 50)' }, [
    rect(43, 30, 14, 66, { rx: 5, fill: steel, ...stroke(2.4) }),
    path('M46 40V88', { stroke: '#ffffff', strokeWidth: 1.6, opacity: 0.6 }),
    path('M30 6H46V22H54V6H70V26Q70 34 62 34H38Q30 34 30 26Z', { fill: steel, ...stroke(2.4) }),
    rect(40, 36, 20, 10, { rx: 2, fill: metalLinear(doc, 'hwScrew', BRASS), ...stroke(1.8) }),
    path('M44 36V46M48 36V46M52 36V46M56 36V46', { stroke: '#6e4e14', strokeWidth: 1.2 }),
    rect(43, 70, 14, 24, { rx: 5, fill: lin(doc, 'hwGrip', '#c0392b', '#5a1006', true), ...stroke(2) }),
    circle(50, 88, 3, { fill: '#2a2c30' }),
  ]);
};

export const aviatorGoggles: SymbolFn = (doc) => {
  const rim = metalLinear(doc, 'agRim', BRASS);
  const lens = rad(doc, 'agLens', '#fff0b0', '#c06a1a', 0.35, 0.3);
  return [
    path('M4 54Q8 30 24 34M96 54Q92 30 76 34', { fill: 'none', stroke: lin(doc, 'agStrap', '#8a5a34', '#3a2210'), strokeWidth: 9, strokeLinecap: 'round' }),
    path('M4 54Q2 66 10 70M96 54Q98 66 90 70', { fill: 'none', stroke: '#3a2210', strokeWidth: 9, strokeLinecap: 'round' }),
    rect(42, 46, 16, 9, { rx: 3, fill: rim, ...stroke(1.8) }),
    circle(28, 52, 21, { fill: rim, ...stroke(2.6) }),
    circle(72, 52, 21, { fill: rim, ...stroke(2.6) }),
    rivetRing(28, 52, 18, 10, 1.2, '#fff3c0'),
    rivetRing(72, 52, 18, 10, 1.2, '#fff3c0'),
    circle(28, 52, 14, { fill: lens, ...stroke(1.6) }),
    circle(72, 52, 14, { fill: lens, ...stroke(1.6) }),
    path('M18 46Q24 40 32 42', { fill: 'none', stroke: '#ffffff', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.8 }),
    path('M62 46Q68 40 76 42', { fill: 'none', stroke: '#ffffff', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.8 }),
  ].join('');
};

export const fieldKit: SymbolFn = (doc) => {
  const leather = lin(doc, 'fkLeather', '#a86a3a', '#4a2410');
  return [
    path('M30 30Q30 12 50 12Q70 12 70 30', { fill: 'none', stroke: '#3a2210', strokeWidth: 6, strokeLinecap: 'round' }),
    rect(10, 28, 80, 62, { rx: 12, fill: leather, ...stroke(2.6) }),
    rect(10, 28, 80, 16, { rx: 10, fill: lin(doc, 'fkFlap', '#c08a5a', '#6a3a1a'), ...stroke(2) }),
    path('M16 50H84', { stroke: '#2a1206', strokeWidth: 1.2, strokeDasharray: '3 3' }),
    rect(44, 38, 12, 12, { rx: 2, fill: metalLinear(doc, 'fkBuckle', BRASS), ...stroke(1.6) }),
    circle(50, 70, 15, { fill: '#f3ead6', ...stroke(2) }),
    path('M45 58H55V65H62V75H55V82H45V75H38V65H45Z', { fill: '#3fae5a', ...stroke(1.4) }),
    rivetLine(16, 84, 84, 84, 8, 1.2, '#f6dc8e'),
  ].join('');
};

export const steamGrenade: SymbolFn = (doc) => {
  const shell = metalRadial(doc, 'sgShell', BRASS);
  return [
    circle(50, 60, 34, { fill: glowFill(doc, 'sgGlow', '#ff8a3a'), opacity: 0.45 }),
    circle(50, 60, 28, { fill: shell, ...stroke(2.6) }),
    path('M22 60Q50 70 78 60M24 48Q50 58 76 48M26 74Q50 82 74 74', { fill: 'none', stroke: metalLinear(doc, 'sgBand', COPPER), strokeWidth: 4 }),
    rivetLine(30, 55, 70, 55, 6, 1.2, '#fff3c0'),
    rect(42, 22, 16, 12, { rx: 2, fill: tubeGradient(doc, 'sgValve', IRON, true), ...stroke(2) }),
    rect(38, 18, 24, 6, { rx: 2, fill: '#c0392b', ...stroke(1.6) }),
    circle(70, 22, 8, { fill: 'none', stroke: '#c9ced6', strokeWidth: 3 }),
    path('M58 21L63 22', { stroke: '#c9ced6', strokeWidth: 2.4 }),
    puff(28, 24, 6, 0.8),
    puff(18, 14, 4, 0.6),
  ].join('');
};

export const armoredVest: SymbolFn = (doc) => {
  const leather = lin(doc, 'avLeather', '#a8703a', '#4a2a12');
  const plate = tubeGradient(doc, 'avPlate', IRON, true);
  return [
    path('M30 14L42 18Q50 24 58 18L70 14L84 30L76 40L74 88Q50 96 26 88L24 40L16 30Z', { fill: leather, ...stroke(2.6) }),
    path('M50 22V92', { stroke: '#2a1408', strokeWidth: 2 }),
    rect(30, 42, 16, 12, { rx: 2, fill: plate, ...stroke(1.6) }),
    rect(54, 42, 16, 12, { rx: 2, fill: plate, ...stroke(1.6) }),
    rect(30, 58, 16, 12, { rx: 2, fill: plate, ...stroke(1.6) }),
    rect(54, 58, 16, 12, { rx: 2, fill: plate, ...stroke(1.6) }),
    rect(30, 74, 16, 10, { rx: 2, fill: plate, ...stroke(1.6) }),
    rect(54, 74, 16, 10, { rx: 2, fill: plate, ...stroke(1.6) }),
    rect(44, 46, 12, 5, { fill: metalLinear(doc, 'avBuckle', BRASS), ...stroke(1.2) }),
    rect(44, 62, 12, 5, { fill: 'url(#avBuckle)', ...stroke(1.2) }),
    rect(44, 77, 12, 5, { fill: 'url(#avBuckle)', ...stroke(1.2) }),
    path('M30 14L42 18L36 30L24 28Z', { fill: '#7a4a24', ...stroke(1.4) }),
    path('M70 14L58 18L64 30L76 28Z', { fill: '#7a4a24', ...stroke(1.4) }),
  ].join('');
};

export const cartridges: SymbolFn = (doc) => {
  const casing = tubeGradient(doc, 'ctCase', BRASS, true);
  const tip = lin(doc, 'ctTip', '#f2b48a', '#7a3414', true);
  const round = (x: number, rot: number): string =>
    g({ transform: `rotate(${rot} ${x} 86)` }, [
      rect(x - 8, 40, 16, 46, { rx: 2, fill: casing, ...stroke(2) }),
      path(`M${x - 8} 40Q${x - 8} 18 ${x} 14Q${x + 8} 18 ${x + 8} 40Z`, { fill: tip, ...stroke(2) }),
      rect(x - 9, 80, 18, 6, { rx: 1, fill: '#8a6a1a', ...stroke(1.4) }),
      line(x - 8, 48, x + 8, 48, { stroke: '#6e4e14', strokeWidth: 1.4 }),
    ]);
  return [round(30, -16), round(70, 16), round(50, 0), circle(50, 92, 3, { fill: '#c9a24a', opacity: 0.6 })].join('');
};

// ---------------------------------------------------------------------------
// Gadgets, treasure and materials
// ---------------------------------------------------------------------------

export const jetpack: SymbolFn = (doc) => {
  const tank = tubeGradient(doc, 'jpTank', BRASS, true);
  const flame = lin(doc, 'jpFlame', '#fff3a0', '#ff4a0a');
  return [
    path('M30 76L24 98L36 88L40 98L42 76ZM58 76L60 98L64 88L76 98L70 76Z', { fill: flame, opacity: 0.95 }),
    rect(22, 10, 24, 66, { rx: 12, fill: tank, ...stroke(2.4) }),
    rect(54, 10, 24, 66, { rx: 12, fill: tank, ...stroke(2.4) }),
    rect(22, 28, 24, 5, { fill: '#b8673a', ...stroke(1) }),
    rect(54, 28, 24, 5, { fill: '#b8673a', ...stroke(1) }),
    rect(22, 56, 24, 5, { fill: '#b8673a', ...stroke(1) }),
    rect(54, 56, 24, 5, { fill: '#b8673a', ...stroke(1) }),
    path('M26 74L30 84H40L42 74ZM58 74L60 84H70L74 74Z', { fill: tubeGradient(doc, 'jpNozzle', IRON, true), ...stroke(2) }),
    rect(44, 22, 12, 40, { rx: 3, fill: '#5a3418', ...stroke(1.8) }),
    circle(50, 18, 8, { fill: '#f3ead6', ...stroke(1.8) }),
    path('M50 18L54 13', { stroke: '#c0392b', strokeWidth: 1.8, strokeLinecap: 'round' }),
    path('M12 30Q6 50 14 70M88 30Q94 50 86 70', { fill: 'none', stroke: '#3a2210', strokeWidth: 5, strokeLinecap: 'round' }),
  ].join('');
};

export const mechArm: SymbolFn = (doc) => {
  const brass = tubeGradient(doc, 'maBrass', BRASS);
  const steel = lin(doc, 'maSteel', '#e0e4ea', '#5a606a');
  return g({ transform: 'rotate(-35 50 50)' }, [
    path(gearWithHoleD(18, 50, 15, 4, 10, 5), { fill: metalLinear(doc, 'maShoulder', COPPER), fillRule: 'evenodd', ...stroke(2) }),
    rect(24, 42, 34, 16, { rx: 6, fill: brass, ...stroke(2.2) }),
    rivetLine(28, 46, 54, 46, 5, 1.1, '#fff3c0'),
    circle(60, 50, 8, { fill: metalRadial(doc, 'maElbow', IRON), ...stroke(2) }),
    rect(62, 44, 22, 12, { rx: 4, fill: brass, ...stroke(2) }),
    path('M34 60L60 58M36 40L60 42', { stroke: steel, strokeWidth: 3.4, strokeLinecap: 'round' }),
    path('M84 42L96 34L98 40L88 46ZM84 50L98 50L98 56L86 55ZM84 56L94 66L90 70L82 60Z', { fill: steel, ...stroke(1.8) }),
    circle(85, 50, 4, { fill: '#2a2c30' }),
  ]);
};

export const gearHeart: SymbolFn = (doc) => {
  const shell = lin(doc, 'ghShell', '#ffe08a', '#8a4e10');
  return [
    circle(50, 56, 44, { fill: glowFill(doc, 'ghGlow', '#ff9a3a'), opacity: 0.6 }),
    path('M40 18Q38 6 30 4M52 16Q54 4 62 2M64 20Q72 12 80 14', { fill: 'none', stroke: tubeGradient(doc, 'ghPipe', COPPER), strokeWidth: 6, strokeLinecap: 'round' }),
    path('M50 92C26 76 8 60 8 40C8 26 18 18 30 18C40 18 46 24 50 30C54 24 60 18 70 18C82 18 92 26 92 40C92 60 74 76 50 92Z', { fill: shell, ...stroke(2.8) }),
    path(gearWithHoleD(34, 44, 14, 4, 10, 5), { fill: '#a8741a', fillRule: 'evenodd', ...stroke(1.4) }),
    path(gearWithHoleD(62, 46, 17, 4, 12, 6, 0.2), { fill: '#c9a24a', fillRule: 'evenodd', ...stroke(1.4) }),
    path(gearWithHoleD(48, 68, 10, 3, 8, 3.5), { fill: '#8a5a1a', fillRule: 'evenodd', ...stroke(1.2) }),
    circle(50, 52, 9, { fill: glowFill(doc, 'ghCore', '#ff6a1a') }),
    circle(50, 52, 4.5, { fill: '#fff3a0' }),
    path('M16 34Q20 24 30 24', { fill: 'none', stroke: '#fff6c8', strokeWidth: 2.6, strokeLinecap: 'round', opacity: 0.8 }),
  ].join('');
};

export const blueprints: SymbolFn = (doc) => {
  const paper = lin(doc, 'bpPaper', '#3a6ab8', '#1a3a7a');
  return [
    rect(10, 18, 72, 64, { fill: paper, ...stroke(2.4), transform: 'rotate(-6 46 50)' }),
    g({ transform: 'rotate(-6 46 50)' }, [
      path('M16 24H76V76H16Z', { fill: 'none', stroke: '#cfe0ff', strokeWidth: 1, opacity: 0.5 }),
      ellipse(46, 44, 24, 9, { fill: 'none', stroke: '#eef4ff', strokeWidth: 1.8 }),
      path('M22 44H70M30 37Q46 33 62 37M30 51Q46 55 62 51', { fill: 'none', stroke: '#eef4ff', strokeWidth: 1 }),
      rect(36, 56, 20, 7, { fill: 'none', stroke: '#eef4ff', strokeWidth: 1.4 }),
      path('M40 53V56M52 53V56M70 40L76 34M70 48L76 54', { stroke: '#eef4ff', strokeWidth: 1.2 }),
      path('M20 70H44M20 66H34', { stroke: '#eef4ff', strokeWidth: 1.2, opacity: 0.8 }),
    ]),
    rect(70, 12, 16, 76, { rx: 8, fill: lin(doc, 'bpRoll', '#5a8ad8', '#1a3a7a', true), ...stroke(2.2) }),
    path('M8 92L56 64', { stroke: metalLinear(doc, 'bpRuler', BRASS), strokeWidth: 7, strokeLinecap: 'round' }),
    path('M14 87l3 4M22 82l3 4M30 78l3 4M38 73l3 4M46 69l3 4', { stroke: '#6e4e14', strokeWidth: 1 }),
    path('M60 88L66 60L72 88', { fill: 'none', stroke: '#c9ced6', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    circle(66, 60, 3, { fill: '#c9a24a', ...stroke(1) }),
  ].join('');
};

export const coalLumps: SymbolFn = (doc) => {
  const coal = rad(doc, 'clCoal', '#5a5e66', '#0c0d10', 0.35, 0.3);
  const lump = (pts: string, x: number, y: number): string => path(pts, { fill: coal, ...stroke(2), transform: `translate(${x} ${y})` });
  return [
    ellipse(50, 84, 40, 10, { fill: '#000000', opacity: 0.35 }),
    lump('M0 20L10 4L28 0L38 12L34 28L14 32Z', 10, 50),
    lump('M0 16L14 0L32 6L34 24L18 32L4 28Z', 54, 52),
    lump('M0 18L12 2L30 4L36 20L24 32L6 30Z', 30, 34),
    lump('M0 12L10 0L24 4L24 18L10 22Z', 60, 28),
    lump('M0 12L8 0L20 2L22 14L10 20Z', 18, 30),
    path('M18 58L24 54M46 42L52 38M64 60L70 56', { stroke: '#ffffff', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.55 }),
    circle(44, 76, 3, { fill: '#ff7a2a' }),
    circle(44, 76, 7, { fill: glowFill(doc, 'clEmber', '#ff7a2a'), opacity: 0.8 }),
    circle(70, 70, 2.2, { fill: '#ffb040' }),
  ].join('');
};

export const brassCoins: SymbolFn = (doc) => {
  const brass = lin(doc, 'bcFill', '#ffe08a', '#8a5a14');
  const coins: string[] = [];
  for (let i = 0; i < 5; i++) coins.push(ellipse(36, 86 - i * 9, 25, 8, { fill: brass, ...stroke(2) }));
  for (let i = 0; i < 3; i++) coins.push(ellipse(70, 88 - i * 9, 20, 7, { fill: brass, ...stroke(2) }));
  return [
    ...coins,
    path(gearWithHoleD(68, 32, 22, 4, 16, 6), { fill: metalLinear(doc, 'bcGear', BRASS), fillRule: 'evenodd', ...stroke(2.2) }),
    circle(68, 32, 13, { fill: 'none', stroke: '#6e4e14', strokeWidth: 1.4 }),
    path(polyPath(starPoints(20, 26, 6, 2, 4)), { fill: '#fff6c8' }),
  ].join('');
};

export const stormCompass: SymbolFn = (doc) => {
  const case_ = metalRadial(doc, 'scCase', BRASS);
  return [
    circle(50, 52, 46, { fill: glowFill(doc, 'scGlow', '#5fd8ff'), opacity: 0.55 }),
    rect(44, 2, 12, 10, { rx: 3, fill: case_, ...stroke(1.8) }),
    circle(50, 4, 5, { fill: 'none', stroke: '#c9a24a', strokeWidth: 2.4 }),
    circle(50, 54, 40, { fill: case_, ...stroke(2.8) }),
    circle(50, 54, 32, { fill: rad(doc, 'scFace', '#1e3a5a', '#08121e', 0.5, 0.4), ...stroke(1.8) }),
    ...Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const r0 = i % 4 === 0 ? 24 : 28;
      return line(50 + Math.cos(a) * r0, 54 + Math.sin(a) * r0, 50 + Math.cos(a) * 31, 54 + Math.sin(a) * 31, { stroke: '#cfe8ff', strokeWidth: i % 4 === 0 ? 2 : 1 });
    }),
    path('M38 38Q40 30 48 32Q52 26 60 30Q68 30 66 38Z', { fill: '#5a6a7a', opacity: 0.85, ...stroke(1) }),
    path('M54 34L44 56H52L46 76L62 50H53L60 34Z', { fill: '#ffe14a', ...stroke(1.4, '#7a5a04') }),
    circle(50, 54, 3, { fill: '#c9a24a', ...stroke(1) }),
    path('M24 40Q30 28 42 24', { fill: 'none', stroke: '#ffffff', strokeWidth: 2.4, opacity: 0.4, strokeLinecap: 'round' }),
    text(50, 30, 'N', { fontFamily: 'Georgia, serif', fontSize: 7, fill: '#cfe8ff', textAnchor: 'middle', fontWeight: 'bold' }),
  ].join('');
};

// ---------------------------------------------------------------------------
// Gadgets ("artilugios")
// ---------------------------------------------------------------------------

export const teslaCoil: SymbolFn = (doc) => {
  const copper = tubeGradient(doc, 'tcCopper', COPPER, true);
  const arcs = 'M50 18L36 6L40 16L24 12M50 18L66 4L62 14L80 10M50 18L30 26L38 28L18 34M50 18L72 28L64 30L84 36';
  return [
    circle(50, 18, 30, { fill: glowFill(doc, 'tcGlow', '#7fd6ff'), opacity: 0.85 }),
    path(arcs, { fill: 'none', stroke: '#e8f8ff', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    path(arcs, { fill: 'none', stroke: '#5fd8ff', strokeWidth: 5, opacity: 0.35, strokeLinecap: 'round' }),
    rect(38, 30, 24, 52, { rx: 4, fill: copper, ...stroke(2.2) }),
    ...Array.from({ length: 12 }, (_, i) => line(38, 34 + i * 4, 62, 34 + i * 4, { stroke: '#5e2c12', strokeWidth: 1.2, opacity: 0.8 })),
    ellipse(50, 22, 18, 8, { fill: metalRadial(doc, 'tcTorus', IRON), ...stroke(2) }),
    circle(50, 22, 3, { fill: '#e8f8ff' }),
    rect(24, 82, 52, 12, { rx: 3, fill: lin(doc, 'tcBase', '#6a4a2a', '#2a1808'), ...stroke(2) }),
    rivetLine(28, 88, 72, 88, 6, 1.3, '#f6dc8e'),
  ].join('');
};

export const gearKit: SymbolFn = (doc) => {
  const brass = metalLinear(doc, 'gkGear', BRASS);
  return [
    path(gearWithHoleD(50, 52, 44, 8, 16, 30), { fill: brass, fillRule: 'evenodd', ...stroke(2.4) }),
    rivetRing(50, 52, 39, 16, 1.2, '#fff3c0', 0.2),
    circle(50, 52, 30, { fill: rad(doc, 'gkCore', '#d8ffd8', '#3fae5a', 0.45, 0.4), ...stroke(2) }),
    path('M43 30H57V45H72V59H57V74H43V59H28V45H43Z', { fill: '#f3fff3', ...stroke(2) }),
    path('M44 48H56M50 42V62', { stroke: '#3fae5a', strokeWidth: 1.6, opacity: 0.6 }),
  ].join('');
};

export const cableNet: SymbolFn = (doc) => {
  const strands: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    strands.push(`M${12 + t * 76} 14Q${50 + (t - 0.5) * 60} 52 ${16 + t * 68} 88`, `M12 ${14 + t * 74}Q50 ${40 + t * 26} 88 ${14 + t * 74}`);
  }
  const d = strands.join('');
  const weight = (x: number, y: number): string => [circle(x, y, 7, { fill: metalRadial(doc, 'cnWeight', IRON), ...stroke(1.8) }), circle(x - 2, y - 2, 2, { fill: '#ffffff', opacity: 0.6 })].join('');
  return [
    circle(50, 50, 44, { fill: glowFill(doc, 'cnGlow', '#7fd6ff'), opacity: 0.3 }),
    path(d, { fill: 'none', stroke: '#3a3e44', strokeWidth: 4.4, opacity: 0.9 }),
    path(d, { fill: 'none', stroke: '#c9ced6', strokeWidth: 2.4 }),
    weight(12, 14),
    weight(88, 14),
    weight(12, 88),
    weight(88, 88),
    circle(50, 50, 5, { fill: '#c9a24a', ...stroke(1.4) }),
  ].join('');
};

export const sootCloud: SymbolFn = (doc) => {
  const smoke = rad(doc, 'scSmoke', '#5a5e66', '#121316', 0.4, 0.35);
  return [
    circle(50, 56, 40, { fill: glowFill(doc, 'scToxic', '#9aff6a'), opacity: 0.3 }),
    circle(30, 60, 20, { fill: smoke, ...stroke(2) }),
    circle(70, 58, 22, { fill: smoke, ...stroke(2) }),
    circle(50, 40, 24, { fill: smoke, ...stroke(2) }),
    circle(48, 66, 22, { fill: smoke }),
    path('M20 52Q26 44 34 46M46 26Q52 20 60 24M64 46Q72 40 80 46', { fill: 'none', stroke: '#9aa0a8', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.8 }),
    path('M30 82Q34 90 28 96M52 86Q56 94 50 99M72 80Q76 88 70 94', { fill: 'none', stroke: '#8ad04a', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.8 }),
    ...Array.from({ length: 9 }, (_, i) => circle(20 + ((i * 37) % 60), 30 + ((i * 23) % 50), 1.6, { fill: '#c8ff9a', opacity: 0.55 })),
  ].join('');
};

export const magnetPulse: SymbolFn = (doc) => {
  const red = lin(doc, 'mpRed', '#ff6a5a', '#8a1a10', true);
  return [
    path('M14 30Q24 50 14 70M6 22Q20 50 6 78', { fill: 'none', stroke: '#7fd6ff', strokeWidth: 2.6, strokeLinecap: 'round', opacity: 0.8 }),
    path('M86 30Q76 50 86 70M94 22Q80 50 94 78', { fill: 'none', stroke: '#7fd6ff', strokeWidth: 2.6, strokeLinecap: 'round', opacity: 0.8 }),
    path('M26 14H42V54Q42 66 50 66Q58 66 58 54V14H74V54Q74 82 50 82Q26 82 26 54Z', { fill: red, ...stroke(2.6) }),
    rect(26, 8, 16, 14, { fill: lin(doc, 'mpTip', '#f6f8fc', '#7a808a', true), ...stroke(2) }),
    rect(58, 8, 16, 14, { fill: 'url(#mpTip)', ...stroke(2) }),
    path('M30 60Q34 74 50 76', { fill: 'none', stroke: '#ffffff', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.45 }),
    path('M50 90L46 96M50 90L54 96', { stroke: '#7fd6ff', strokeWidth: 2, strokeLinecap: 'round' }),
  ].join('');
};

export const harpoon: SymbolFn = (doc) => {
  const steel = lin(doc, 'hpSteel', '#f6f8fc', '#6a707a', true);
  return [
    path('M18 82Q4 70 14 60Q24 50 12 40Q4 32 12 24', { fill: 'none', stroke: '#c9a24a', strokeWidth: 2.6, strokeLinecap: 'round' }),
    g({ transform: 'rotate(45 50 50)' }, [
      rect(46, 22, 8, 56, { rx: 2, fill: tubeGradient(doc, 'hpShaft', IRON, true), ...stroke(2) }),
      path('M50 0L60 18L54 16L54 26H46V16L40 18Z', { fill: steel, ...stroke(2) }),
      path('M46 26L38 36L46 32ZM54 26L62 36L54 32Z', { fill: steel, ...stroke(1.4) }),
      rect(40, 72, 20, 22, { rx: 4, fill: metalLinear(doc, 'hpLauncher', BRASS), ...stroke(2) }),
      rivetLine(44, 78, 56, 78, 3, 1.1, '#fff3c0'),
      rivetLine(44, 88, 56, 88, 3, 1.1, '#fff3c0'),
    ]),
    circle(20, 82, 6, { fill: '#5a3418', ...stroke(1.6) }),
  ].join('');
};

export const flare: SymbolFn = (doc) => [
  circle(58, 30, 30, { fill: glowFill(doc, 'flGlow', '#fff6c8') }),
  path(polyPath(starPoints(58, 30, 24, 7, 8, 0.2)), { fill: '#ffffff', opacity: 0.95 }),
  path(polyPath(starPoints(58, 30, 13, 5, 8, 0.6)), { fill: '#fff3a0' }),
  g({ transform: 'rotate(35 50 50)' }, [
    rect(44, 44, 12, 50, { rx: 3, fill: lin(doc, 'flTube', '#e04a2a', '#7a1a0a', true), ...stroke(2) }),
    rect(44, 44, 12, 8, { fill: metalLinear(doc, 'flCap', BRASS), ...stroke(1.6) }),
    path('M46 64H54M46 74H54', { stroke: '#f3ead6', strokeWidth: 2 }),
  ]),
  ...Array.from({ length: 7 }, (_, i) => circle(26 + i * 6, 56 - (i % 3) * 8, 1.6, { fill: '#fff3a0', opacity: 0.8 })),
].join('');

export const pressureShield: SymbolFn = (doc) => {
  const brass = metalRadial(doc, 'psShell', BRASS);
  return [
    puff(16, 62, 9, 0.75),
    puff(84, 60, 9, 0.75),
    puff(50, 92, 8, 0.7),
    circle(50, 50, 38, { fill: brass, ...stroke(2.8) }),
    circle(50, 50, 30, { fill: 'none', stroke: '#6e4e14', strokeWidth: 2 }),
    rivetRing(50, 50, 34, 14, 1.4, '#fff3c0'),
    circle(50, 50, 16, { fill: '#f3ead6', ...stroke(2) }),
    path('M38 56A14 14 0 0 1 62 56', { fill: 'none', stroke: '#c0392b', strokeWidth: 2.4 }),
    path('M50 50L58 41', { stroke: OUT, strokeWidth: 2.4, strokeLinecap: 'round' }),
    circle(50, 50, 2.6, { fill: OUT }),
    path('M24 28Q34 18 48 16', { fill: 'none', stroke: '#ffffff', strokeWidth: 2.4, opacity: 0.45, strokeLinecap: 'round' }),
  ].join('');
};

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

export const musicBox: SymbolFn = (doc) => {
  const wood = lin(doc, 'mbWood', '#b0703a', '#4a2410');
  return [
    path('M10 40L24 10H86L76 40Z', { fill: lin(doc, 'mbLid', '#8a4e22', '#3a1a08'), ...stroke(2.2) }),
    path('M18 36L28 14H80L72 36Z', { fill: '#7a1a2a', opacity: 0.85 }),
    rect(10, 40, 66, 44, { rx: 3, fill: wood, ...stroke(2.4) }),
    rect(16, 46, 54, 22, { rx: 2, fill: '#2a1808', ...stroke(1.4) }),
    rect(20, 50, 34, 12, { rx: 6, fill: tubeGradient(doc, 'mbDrum', BRASS), ...stroke(1.4) }),
    ...Array.from({ length: 10 }, (_, i) => circle(23 + i * 3.2, 51 + ((i * 7) % 10), 0.9, { fill: '#2a1808' })),
    path('M56 50H68M56 54H67M56 58H66M56 62H65', { stroke: '#d8dde4', strokeWidth: 1.4 }),
    path('M76 62H86V74', { fill: 'none', stroke: '#c9a24a', strokeWidth: 3, strokeLinecap: 'round' }),
    circle(86, 76, 4, { fill: '#7a1a2a', ...stroke(1.4) }),
    path('M64 6V-4L72 -6V4', { fill: 'none', ...stroke(2) }),
    path('M86 22V12L94 10V20', { fill: 'none', ...stroke(2) }),
    ellipse(62, 6, 3.4, 2.4, { fill: OUT }),
    ellipse(84, 22, 3.4, 2.4, { fill: OUT }),
    rivetLine(16, 78, 70, 78, 6, 1.1, '#f6dc8e'),
  ].join('');
};

export const airshipChase: SymbolFn = (doc) => {
  const envelope = lin(doc, 'acEnvelope', '#f3d8a8', '#8a5a2a');
  return [
    path('M2 30H22M0 44H16M4 58H20', { stroke: '#eef2f4', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.75 }),
    path('M82 22L98 10L96 30ZM82 52L98 64L96 44Z', { fill: '#7a1a2a', ...stroke(1.8) }),
    ellipse(56, 37, 38, 18, { fill: envelope, ...stroke(2.6) }),
    path('M22 37H92M26 28Q56 22 88 28M26 46Q56 52 88 46', { fill: 'none', stroke: '#6a3a14', strokeWidth: 1.2, opacity: 0.7 }),
    path('M36 54L40 66M76 54L72 66M46 55V66M66 55V66', { stroke: '#3a2210', strokeWidth: 1.4 }),
    path('M34 66H78L72 80H40Z', { fill: lin(doc, 'acGondola', '#8a5a2a', '#3a2010'), ...stroke(2.2) }),
    path('M44 72H50M56 72H62M68 72H72', { stroke: '#ffd23a', strokeWidth: 2.6 }),
    rect(78, 68, 6, 6, { fill: '#2a2c30', ...stroke(1) }),
    ellipse(88, 71, 3, 11, { fill: '#c8d4de', opacity: 0.5, ...stroke(1) }),
    circle(14, 80, 7, { fill: '#c8ccd2', opacity: 0.6 }),
    circle(24, 86, 5, { fill: '#c8ccd2', opacity: 0.5 }),
  ].join('');
};

export const enginePiston: SymbolFn = (doc) => {
  const brass = tubeGradient(doc, 'epCyl', BRASS, true);
  const steel = lin(doc, 'epRod', '#f6f8fc', '#6a707a', true);
  return [
    puff(20, 16, 8, 0.75),
    rect(30, 8, 30, 40, { rx: 3, fill: brass, ...stroke(2.4) }),
    rect(26, 8, 38, 6, { rx: 2, fill: '#8a6a1a', ...stroke(1.6) }),
    rivetLine(34, 20, 34, 42, 4, 1.2, '#fff3c0'),
    rivetLine(56, 20, 56, 42, 4, 1.2, '#fff3c0'),
    rect(41, 48, 8, 18, { fill: steel, ...stroke(1.8) }),
    path('M45 66L66 78', { stroke: steel, strokeWidth: 7, strokeLinecap: 'round' }),
    path('M45 66L66 78', { stroke: OUT, strokeWidth: 9, strokeLinecap: 'round', opacity: 0.2 }),
    circle(45, 66, 5, { fill: '#5c616a', ...stroke(1.6) }),
    path(`${gearD(68, 78, 20, 4, 14)}${spokeWindowsD(68, 78, 6, 13, 5)}`, { fill: metalLinear(doc, 'epWheel', IRON), fillRule: 'evenodd', ...stroke(2) }),
    circle(66, 78, 3.4, { fill: '#c9a24a', ...stroke(1.2) }),
  ].join('');
};

export const deckWind: SymbolFn = (doc) => [
  path('M6 30H58Q72 30 72 18Q72 8 62 8Q54 8 54 16', { fill: 'none', stroke: '#e8f2f8', strokeWidth: 5, strokeLinecap: 'round' }),
  path('M10 48H80Q94 48 94 60Q94 72 82 72Q72 72 72 64', { fill: 'none', stroke: '#e8f2f8', strokeWidth: 5, strokeLinecap: 'round' }),
  path('M4 64H44', { stroke: '#cfe0ea', strokeWidth: 4, strokeLinecap: 'round', opacity: 0.8 }),
  ellipse(30, 84, 20, 9, { fill: 'none', stroke: lin(doc, 'dwRope', '#e0b878', '#7a5226'), strokeWidth: 5 }),
  ellipse(30, 84, 12, 5, { fill: 'none', stroke: 'url(#dwRope)', strokeWidth: 4 }),
  path('M50 84Q62 88 70 96', { fill: 'none', stroke: 'url(#dwRope)', strokeWidth: 4, strokeLinecap: 'round' }),
].join('');

export const steamWhistle: SymbolFn = (doc) => {
  const brass = tubeGradient(doc, 'swBrass', BRASS, true);
  return [
    puff(30, 22, 12, 0.85),
    puff(70, 18, 10, 0.8),
    puff(50, 10, 9, 0.75),
    path('M38 30H62L58 40H42Z', { fill: brass, ...stroke(2) }),
    rect(40, 40, 20, 34, { fill: brass, ...stroke(2.2) }),
    rect(38, 50, 24, 4, { fill: '#8a6a1a', ...stroke(1) }),
    rect(38, 62, 24, 4, { fill: '#8a6a1a', ...stroke(1) }),
    rect(44, 74, 12, 16, { fill: tubeGradient(doc, 'swPipe', COPPER, true), ...stroke(2) }),
    path('M56 80L84 70', { stroke: '#2a2c30', strokeWidth: 4, strokeLinecap: 'round' }),
    circle(86, 69, 5, { fill: '#c0392b', ...stroke(1.6) }),
    rect(34, 88, 32, 8, { rx: 2, fill: '#5c616a', ...stroke(1.8) }),
  ].join('');
};

export const gearsPair: SymbolFn = (doc) => [
  path(`${gearD(38, 40, 30, 7, 12)}${spokeWindowsD(38, 40, 8, 19, 5)}`, { fill: metalLinear(doc, 'gpA', BRASS), fillRule: 'evenodd', ...stroke(2.2) }),
  circle(38, 40, 5, { fill: '#6e4e14', ...stroke(1.4) }),
  path(`${gearD(70, 72, 22, 6, 10, 0.3)}${spokeWindowsD(70, 72, 6, 13, 4, 0.3)}`, { fill: metalLinear(doc, 'gpB', COPPER), fillRule: 'evenodd', ...stroke(2.2) }),
  circle(70, 72, 4, { fill: '#5e2c12', ...stroke(1.2) }),
  path(gearD(80, 26, 11, 3.5, 8), { fill: metalLinear(doc, 'gpC', IRON), ...stroke(1.6) }),
  circle(80, 26, 2.4, { fill: OUT }),
].join('');

export const pistolShot: SymbolFn = (doc) => [
  path(polyPath(starPoints(84, 30, 16, 6, 9, 0.1)), { fill: lin(doc, 'psFlash', '#fff6c8', '#ff8a1a'), ...stroke(1.4, '#a8400a') }),
  g({ transform: 'translate(-6 8) scale(0.92)' }, steamPistol(doc)),
].join('');

export const propeller: SymbolFn = (doc) => {
  const blade = lin(doc, 'prBlade', '#d8a06a', '#5a3014');
  const arcs = 'M50 6A44 44 0 0 1 92 38M50 94A44 44 0 0 1 8 62';
  return [
    path(arcs, { fill: 'none', stroke: '#e8f2f8', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.7 }),
    ...[0, 120, 240].map((rot) =>
      g({ transform: `rotate(${rot} 50 50)` }, [path('M50 50Q40 30 44 10Q50 4 56 10Q60 30 50 50Z', { fill: blade, ...stroke(2.2) }), path('M48 14Q46 28 49 42', { fill: 'none', stroke: '#ffffff', strokeWidth: 1.4, opacity: 0.4 })]),
    ),
    circle(50, 50, 10, { fill: metalRadial(doc, 'prHub', BRASS), ...stroke(2) }),
    circle(50, 50, 3, { fill: OUT }),
  ].join('');
};
