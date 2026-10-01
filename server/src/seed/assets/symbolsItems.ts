import { OUT, glowFill, lin, rad, stroke, type SymbolFn } from './symbolsCreatures';
import { circle, ellipse, g, line, path, pattern, polyPath, rect, regularPolygon, starPoints, tag, text, type SvgDoc } from './svg';

/** Item, spell and sound symbols (100 x 100 box). */

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

function swordShape(blade: string, guard: string, rot = 45): string {
  return g({ transform: `rotate(${rot} 50 50)` }, [
    path('M50 4L57 15L57 64H43L43 15Z', { fill: blade, ...stroke(2.4) }),
    path('M50 12V60', { stroke: '#5a606a', strokeWidth: 2, opacity: 0.7 }),
    rect(30, 63, 40, 7, { rx: 3.5, fill: guard, ...stroke(2) }),
    rect(46, 70, 8, 18, { fill: '#5a3418', ...stroke(1.8) }),
    path('M46 74H54M46 79H54M46 84H54', { stroke: '#2a1408', strokeWidth: 1.4 }),
    circle(50, 92, 5.5, { fill: guard, ...stroke(1.8) }),
  ]);
}

export const sword: SymbolFn = (doc) => swordShape(lin(doc, 'swordBlade', '#f6f8fc', '#7a808a', true), lin(doc, 'swordGuard', '#ffe08a', '#9a6a1a'));

export const flamingSword: SymbolFn = (doc) =>
  [
    circle(50, 50, 46, { fill: glowFill(doc, 'flameSwordGlow', '#ff7a2a') }),
    g({ transform: 'rotate(45 50 50)' }, [
      path('M50 0C60 12 66 24 62 40C68 34 70 28 68 22C76 36 72 56 64 66H36C28 56 24 36 32 22C30 28 32 34 38 40C34 24 40 12 50 0Z', { fill: lin(doc, 'flameSwordFire', '#fff3a0', '#ff4a0a'), opacity: 0.95 }),
    ]),
    swordShape(lin(doc, 'flameSwordBlade', '#ffffff', '#ffb070', true), lin(doc, 'flameSwordGuard', '#ffe08a', '#9a6a1a')),
  ].join('');

export const dagger: SymbolFn = (doc) =>
  g({ transform: 'rotate(45 50 50)' }, [
    path('M50 14L56 24L56 58H44L44 24Z', { fill: lin(doc, 'daggerBlade', '#f6f8fc', '#7a808a', true), ...stroke(2.4) }),
    path('M50 20V54', { stroke: '#5a606a', strokeWidth: 1.6, opacity: 0.7 }),
    rect(36, 57, 28, 6, { rx: 3, fill: '#b8b8c0', ...stroke(1.8) }),
    rect(46, 63, 8, 18, { fill: '#2a1a2e', ...stroke(1.8) }),
    circle(50, 84, 5, { fill: '#b8b8c0', ...stroke(1.6) }),
  ]);

export const battleAxe: SymbolFn = (doc) =>
  g({ transform: 'rotate(30 50 50)' }, [
    rect(46, 10, 8, 88, { rx: 3, fill: lin(doc, 'axeHaft', '#9a6a3a', '#5a3418', true), ...stroke(2.2) }),
    path('M54 16C74 10 90 24 90 44C80 39 68 41 54 48Z', { fill: lin(doc, 'axeHead', '#f0f2f6', '#6a707a'), ...stroke(2.4) }),
    path('M46 22L32 28L46 34Z', { fill: '#8a909a', ...stroke(1.8) }),
    path('M58 20C72 16 84 26 86 40', { fill: 'none', stroke: '#ffffff', strokeWidth: 1.6, opacity: 0.7 }),
    rect(44, 70, 12, 4, { fill: '#2a1a0e' }),
    rect(44, 78, 12, 4, { fill: '#2a1a0e' }),
  ]);

export const mace: SymbolFn = (doc) => {
  const steel = rad(doc, 'maceHead', '#f0f2f6', '#5a606a');
  const flanges: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = 50 + Math.cos(a) * 17;
    const y = 26 + Math.sin(a) * 17;
    flanges.push(path(`M${50 + Math.cos(a - 0.3) * 11} ${26 + Math.sin(a - 0.3) * 11}L${x} ${y}L${50 + Math.cos(a + 0.3) * 11} ${26 + Math.sin(a + 0.3) * 11}Z`, { fill: '#9aa0aa', ...stroke(1.6) }));
  }
  return g({ transform: 'rotate(30 50 50)' }, [rect(46, 36, 8, 60, { rx: 3, fill: '#6a4626', ...stroke(2) }), rect(45, 80, 10, 14, { fill: '#2a1a0e' }), ...flanges, circle(50, 26, 13, { fill: steel, ...stroke(2.4) })]);
};

export const spear: SymbolFn = (doc) =>
  g({ transform: 'rotate(40 50 50)' }, [
    rect(47.5, 30, 5, 70, { rx: 2, fill: '#8a5a2e', ...stroke(1.8) }),
    path('M50 0C59 13 59 24 50 36C41 24 41 13 50 0Z', { fill: lin(doc, 'spearHead', '#f6f8fc', '#7a808a', true), ...stroke(2.2) }),
    path('M50 4V32', { stroke: '#5a606a', strokeWidth: 1.4 }),
    rect(46, 34, 8, 6, { fill: '#5a3418', ...stroke(1.4) }),
  ]);

export const javelins: SymbolFn = (doc) => {
  const head = lin(doc, 'javHead', '#f6f8fc', '#7a808a', true);
  const one = (rot: number): string => g({ transform: `rotate(${rot} 50 50)` }, [rect(48.5, 22, 3.5, 76, { rx: 1.5, fill: '#a07040', ...stroke(1.4) }), path('M50 4L56 22H44Z', { fill: head, ...stroke(1.8) }), path('M46 90L50 84L54 90L54 98L50 94L46 98Z', { fill: '#c43d33', ...stroke(1.2) })]);
  return [one(30), one(50)].join('');
};

export const shortbow: SymbolFn = (doc) =>
  g({ transform: 'rotate(25 50 50)' }, [
    path('M32 6C74 22 74 78 32 94', { fill: 'none', stroke: OUT, strokeWidth: 8, strokeLinecap: 'round' }),
    path('M32 6C74 22 74 78 32 94', { fill: 'none', stroke: lin(doc, 'bowWood', '#c88a4a', '#6a4220'), strokeWidth: 5, strokeLinecap: 'round' }),
    line(32, 6, 32, 94, { stroke: '#f3ead6', strokeWidth: 1.4 }),
    rect(57, 42, 8, 16, { rx: 2, fill: '#3a2412', ...stroke(1.4) }),
    line(26, 50, 92, 50, { stroke: '#8a5a2e', strokeWidth: 2.4 }),
    path('M92 50L84 45V55Z', { fill: '#c8ccd4', ...stroke(1.4) }),
    path('M26 50L32 45M26 50L32 55M30 50L36 45M30 50L36 55', { stroke: '#c43d33', strokeWidth: 2 }),
  ]);

export const crossbow: SymbolFn = (doc) =>
  g({ transform: 'rotate(-30 50 50)' }, [
    rect(45, 28, 10, 66, { rx: 3, fill: lin(doc, 'xbowStock', '#a07040', '#5a3418', true), ...stroke(2.2) }),
    path('M12 38Q50 18 88 38', { fill: 'none', stroke: OUT, strokeWidth: 7, strokeLinecap: 'round' }),
    path('M12 38Q50 18 88 38', { fill: 'none', stroke: '#9aa0aa', strokeWidth: 4, strokeLinecap: 'round' }),
    path('M12 38L50 52L88 38', { fill: 'none', stroke: '#f3ead6', strokeWidth: 1.4 }),
    line(50, 14, 50, 52, { stroke: '#5a3418', strokeWidth: 3 }),
    path('M50 8L54 16H46Z', { fill: '#c8ccd4', ...stroke(1.2) }),
    path('M47 66Q42 74 48 78', { fill: 'none', ...stroke(2) }),
  ]);

export const arrows: SymbolFn = (doc) => {
  const head = lin(doc, 'arrowHead', '#f6f8fc', '#7a808a', true);
  const arrow = (rot: number): string => g({ transform: `rotate(${rot} 50 70)` }, [line(50, 14, 50, 94, { stroke: '#a07040', strokeWidth: 3.2 }), path('M50 4L56 16H44Z', { fill: head, ...stroke(1.6) }), path('M50 80L43 88V96L50 90L57 96V88Z', { fill: '#e8dcc0', ...stroke(1.2) }), path('M50 82V92', { stroke: '#c43d33', strokeWidth: 2 })]);
  return [arrow(-16), arrow(0), arrow(16), rect(40, 62, 20, 8, { rx: 2, fill: '#6a3a1a', ...stroke(1.6) })].join('');
};

// ---------------------------------------------------------------------------
// Armor and shields
// ---------------------------------------------------------------------------

const VEST = 'M30 14L42 18Q50 24 58 18L70 14L84 30L76 40L74 88Q50 96 26 88L24 40L16 30Z';

export const leatherArmor: SymbolFn = (doc) =>
  [
    path(VEST, { fill: lin(doc, 'leatherFill', '#b8784a', '#5a3418'), ...stroke(2.6) }),
    path('M50 24V88', { stroke: '#3a2010', strokeWidth: 2 }),
    path('M44 34L56 40M56 34L44 40M44 46L56 52M56 46L44 52M44 58L56 64M56 58L44 64', { stroke: '#e8dcc0', strokeWidth: 1.4 }),
    path('M29 42L28 84M71 42L72 84', { stroke: '#e8dcc0', strokeWidth: 1.2, strokeDasharray: '3 3' }),
    rect(26, 72, 48, 7, { fill: '#3a2010', ...stroke(1.4) }),
    rect(46, 71, 8, 9, { fill: '#e9c063', ...stroke(1.2) }),
  ].join('');

export const scaleArmor: SymbolFn = (doc) => {
  const scales: string[] = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) scales.push(path(`M${24 + col * 8 + (row % 2) * 4} ${34 + row * 8}q4 8 8 0`, { fill: '#c8a050', stroke: '#5a3a10', strokeWidth: 1 }));
  doc.def('scaleClip', tag('clipPath', { id: 'scaleClip' }, path(VEST)));
  return [
    path(VEST, { fill: lin(doc, 'scaleFill', '#d8b060', '#7a5a20'), ...stroke(2.6) }),
    g({ clipPath: 'url(#scaleClip)' }, scales),
    path('M42 18Q50 24 58 18L58 28Q50 32 42 28Z', { fill: '#7a5a20', ...stroke(1.6) }),
  ].join('');
};

export const chainmail: SymbolFn = (doc) => {
  const rings = pattern('chainRings', 6, 6, circle(3, 3, 2.2, { fill: 'none', stroke: '#3a3e46', strokeWidth: 0.9 }));
  const fill = doc.def('chainRings', rings);
  const shirt = 'M26 14L42 12Q50 20 58 12L74 14L92 40L80 48L74 38L74 90H26L26 38L20 48L8 40Z';
  return [
    path(shirt, { fill: lin(doc, 'chainFill', '#c8ccd4', '#5a5e66'), ...stroke(2.6) }),
    path(shirt, { fill }),
    path('M42 12Q50 20 58 12', { fill: 'none', stroke: '#2a2e36', strokeWidth: 3 }),
    rect(26, 82, 48, 8, { fill: '#5a3418', ...stroke(1.4) }),
  ].join('');
};

export const plateArmor: SymbolFn = (doc) =>
  [
    ellipse(22, 30, 14, 11, { fill: lin(doc, 'pauldron', '#f0f2f6', '#6a707a'), ...stroke(2.2) }),
    ellipse(78, 30, 14, 11, { fill: 'url(#pauldron)', ...stroke(2.2) }),
    path('M26 20Q50 30 74 20L80 40Q78 70 66 90Q50 96 34 90Q22 70 20 40Z', { fill: lin(doc, 'plateFill', '#f6f8fc', '#5a606a', true), ...stroke(2.6) }),
    path('M50 26V90', { stroke: '#8a909a', strokeWidth: 2.4 }),
    path('M30 26Q50 34 70 26', { fill: 'none', stroke: '#e9c063', strokeWidth: 3 }),
    path('M34 72Q50 78 66 72M36 80Q50 86 64 80', { fill: 'none', stroke: '#5a606a', strokeWidth: 2 }),
    path('M34 34Q38 52 36 64', { fill: 'none', stroke: '#ffffff', strokeWidth: 2.4, opacity: 0.7 }),
  ].join('');

export const woodenShield: SymbolFn = (doc) => {
  const planks: string[] = [];
  for (let i = 0; i < 6; i++) planks.push(rect(10 + i * 13.4, 10, 13.4, 80, { fill: i % 2 === 0 ? '#9a6a3a' : '#8a5a2e', stroke: '#4a2a12', strokeWidth: 1 }));
  doc.def('shieldClip', tag('clipPath', { id: 'shieldClip' }, circle(50, 50, 40)));
  return [
    g({ clipPath: 'url(#shieldClip)' }, planks),
    circle(50, 50, 40, { fill: 'none', stroke: OUT, strokeWidth: 8 }),
    circle(50, 50, 40, { fill: 'none', stroke: '#8a8e96', strokeWidth: 5 }),
    circle(50, 50, 11, { fill: rad(doc, 'shieldBoss', '#f0f2f6', '#5a606a'), ...stroke(2) }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => circle(50 + Math.cos((i / 8) * Math.PI * 2) * 34, 50 + Math.sin((i / 8) * Math.PI * 2) * 34, 2, { fill: '#c8ccd4', ...stroke(0.8) })),
  ].join('');
};

// ---------------------------------------------------------------------------
// Potions, scrolls, jewelry, misc
// ---------------------------------------------------------------------------

function flask(doc: SvgDoc, id: string, liquidTop: string, liquidBottom: string, r: number, ribbon?: string): string {
  const cy = 62;
  const glass = rad(doc, `${id}Glass`, '#ffffff', '#a8c8d8');
  const liquid = lin(doc, `${id}Liquid`, liquidTop, liquidBottom);
  const levelY = cy - r * 0.2;
  const half = Math.sqrt(r * r - (levelY - cy) ** 2);
  return [
    circle(50, cy, r + 8, { fill: glowFill(doc, `${id}Glow`, liquidTop), opacity: 0.6 }),
    rect(43, 14, 14, cy - r - 10, { fill: glass, opacity: 0.6, ...stroke(2.2) }),
    rect(41, 8, 18, 10, { rx: 2, fill: '#8a5a2e', ...stroke(2) }),
    circle(50, cy, r, { fill: glass, opacity: 0.35 }),
    path(`M${50 - half} ${levelY}Q50 ${levelY - 5} ${50 + half} ${levelY}A${r} ${r} 0 1 1 ${50 - half} ${levelY}Z`, { fill: liquid }),
    circle(50, cy, r, { fill: 'none', ...stroke(2.6) }),
    ellipse(40, cy - r * 0.45, r * 0.22, r * 0.12, { fill: '#ffffff', opacity: 0.8, transform: `rotate(-35 40 ${cy - r * 0.45})` }),
    circle(58, cy + 4, 2.4, { fill: '#ffffff', opacity: 0.6 }),
    circle(52, cy + 12, 1.6, { fill: '#ffffff', opacity: 0.6 }),
    ribbon ? path(`M42 ${cy - r - 4}H58L56 ${cy - r + 2}H44Z`, { fill: ribbon, ...stroke(1.2) }) : '',
  ].join('');
}

export const potion: SymbolFn = (doc) => flask(doc, 'potionRed', '#ff6a5a', '#9b1a14', 26);
export const potionGreater: SymbolFn = (doc) =>
  [flask(doc, 'potionGreater', '#ff5a8a', '#6a1040', 32, '#e9c063'), path(polyPath(starPoints(80, 26, 7, 2.5, 4)), { fill: '#fff6c8' }), path(polyPath(starPoints(20, 40, 5, 2, 4)), { fill: '#fff6c8' })].join('');

export const scroll: SymbolFn = (doc) => {
  const paper = lin(doc, 'scrollPaper', '#fbf2d8', '#d8c090');
  return [
    rect(24, 24, 52, 52, { fill: paper, ...stroke(2.2) }),
    rect(16, 16, 68, 13, { rx: 6.5, fill: lin(doc, 'scrollRoll', '#efe0b8', '#a8946b'), ...stroke(2.2) }),
    rect(16, 71, 68, 13, { rx: 6.5, fill: 'url(#scrollRoll)', ...stroke(2.2) }),
    circle(16, 22.5, 4, { fill: '#7a4a22', ...stroke(1.4) }),
    circle(84, 22.5, 4, { fill: '#7a4a22', ...stroke(1.4) }),
    circle(16, 77.5, 4, { fill: '#7a4a22', ...stroke(1.4) }),
    circle(84, 77.5, 4, { fill: '#7a4a22', ...stroke(1.4) }),
    path('M31 38H64M31 45H60M31 52H66M31 59H52', { stroke: '#7a5a2a', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.8 }),
    circle(66, 64, 9, { fill: '#b8261e', ...stroke(1.8) }),
    path('M66 58C69 62 70 66 66 69C62 66 63 62 66 58Z', { fill: '#ffb030' }),
    path('M60 72L56 86M70 72L74 84', { stroke: '#b8261e', strokeWidth: 3 }),
  ].join('');
};

export const ring: SymbolFn = (doc) =>
  [
    ellipse(50, 62, 28, 22, { fill: 'none', stroke: OUT, strokeWidth: 12 }),
    ellipse(50, 62, 28, 22, { fill: 'none', stroke: lin(doc, 'ringGold', '#ffe68a', '#a8741a'), strokeWidth: 8 }),
    path('M30 52Q40 44 50 44', { fill: 'none', stroke: '#fff6c8', strokeWidth: 2, opacity: 0.8 }),
    path('M40 42L44 30M60 42L56 30M50 44V28', { stroke: '#d4a63f', strokeWidth: 3, strokeLinecap: 'round' }),
    circle(50, 30, 12, { fill: glowFill(doc, 'ringGlow', '#3d8bff') }),
    path(polyPath(regularPolygon(50, 30, 10, 8, Math.PI / 8)), { fill: rad(doc, 'ringGem', '#bfe0ff', '#1a4ab8'), ...stroke(2) }),
    path('M45 26L50 22L55 26', { fill: 'none', stroke: '#ffffff', strokeWidth: 1.4, opacity: 0.8 }),
  ].join('');

export const amulet: SymbolFn = (doc) =>
  [
    path('M18 6Q50 64 82 6', { fill: 'none', stroke: OUT, strokeWidth: 5 }),
    path('M18 6Q50 64 82 6', { fill: 'none', stroke: '#e9c063', strokeWidth: 3, strokeDasharray: '4 2.5' }),
    path('M50 44L34 54L30 72L50 92L70 72L66 54Z', { fill: lin(doc, 'amuletGold', '#ffe68a', '#a8741a'), ...stroke(2.4) }),
    path('M34 54L26 48M66 54L74 48M30 72L22 74M70 72L78 74', { stroke: '#d4a63f', strokeWidth: 3, strokeLinecap: 'round' }),
    ellipse(50, 70, 12, 14, { fill: rad(doc, 'amuletGem', '#ff9a7a', '#8a0a0a'), ...stroke(2) }),
    ellipse(50, 70, 2, 10, { fill: '#1a0400' }),
    circle(46, 64, 2.4, { fill: '#ffffff', opacity: 0.8 }),
  ].join('');

export const thievesTools: SymbolFn = (doc) =>
  [
    rect(12, 46, 76, 38, { rx: 5, fill: lin(doc, 'toolRoll', '#9a6a3a', '#5a3418'), ...stroke(2.4) }),
    rect(16, 50, 68, 30, { rx: 3, fill: 'none', stroke: '#e8dcc0', strokeWidth: 1.2, strokeDasharray: '3 3' }),
    ...[22, 34, 46, 58, 70].map((x, i) => [line(x, 64, x + (i - 2) * 3, 14 + (i % 2) * 8, { stroke: '#c8ccd4', strokeWidth: 3, strokeLinecap: 'round' }), line(x, 64, x + (i - 2) * 3, 14 + (i % 2) * 8, { stroke: OUT, strokeWidth: 0.8, opacity: 0.5 }), rect(x - 3, 60, 6, 14, { rx: 2, fill: '#2a1a0e' })].join('')),
    path('M22 14l4 -4M34 18l3 -6l3 4M46 14l2 -5M58 18q3 -4 6 0M70 14l4 4', { fill: 'none', stroke: '#c8ccd4', strokeWidth: 2 }),
  ].join('');

export const rations: SymbolFn = (doc) =>
  [
    ellipse(42, 60, 32, 19, { fill: rad(doc, 'bread', '#e8b070', '#8a5a2a'), ...stroke(2.4) }),
    path('M24 54Q30 48 34 56M36 50Q42 44 46 52M48 48Q54 42 58 50', { fill: 'none', stroke: '#6a3a14', strokeWidth: 2.2, strokeLinecap: 'round' }),
    path('M60 72L94 60L94 82L60 88Z', { fill: lin(doc, 'cheese', '#ffe68a', '#d8a020'), ...stroke(2.2) }),
    path('M60 72L74 52L94 60', { fill: '#fff0a8', ...stroke(2.2) }),
    circle(72, 76, 3, { fill: '#c8901a' }),
    circle(84, 72, 2.4, { fill: '#c8901a' }),
    circle(80, 82, 2, { fill: '#c8901a' }),
    circle(78, 30, 13, { fill: rad(doc, 'apple', '#ff7a6a', '#9a1a14'), ...stroke(2.2) }),
    path('M78 18Q80 12 84 10', { fill: 'none', ...stroke(2) }),
    path('M80 16Q88 12 90 18Q84 20 80 16Z', { fill: '#5fa03a', ...stroke(1.2) }),
  ].join('');

export const ruby: SymbolFn = (doc) => {
  const outline = regularPolygon(50, 52, 38, 8, Math.PI / 8);
  const table = regularPolygon(50, 48, 18, 8, Math.PI / 8);
  const facets: string[] = [];
  for (let i = 0; i < 8; i++) facets.push(line(outline[i]!.x, outline[i]!.y, table[i]!.x, table[i]!.y, { stroke: '#5a0a10', strokeWidth: 1.2, opacity: 0.8 }));
  return [
    circle(50, 52, 46, { fill: glowFill(doc, 'rubyGlow', '#ff4a5a') }),
    path(polyPath(outline), { fill: rad(doc, 'rubyFill', '#ff9aa0', '#7a0a14'), ...stroke(2.6) }),
    path(polyPath(table), { fill: '#ff5a6a', opacity: 0.7, stroke: '#5a0a10', strokeWidth: 1.2 }),
    ...facets,
    path('M38 38L46 34L44 44Z', { fill: '#ffffff', opacity: 0.85 }),
    path(polyPath(starPoints(76, 24, 6, 2, 4)), { fill: '#ffffff' }),
  ].join('');
};

export const cryptKey: SymbolFn = (doc) => {
  const iron = lin(doc, 'keyIron', '#9a9aa4', '#3a3a42');
  return g({ transform: 'rotate(30 50 50)' }, [
    circle(50, 24, 17, { fill: 'none', stroke: OUT, strokeWidth: 9 }),
    circle(50, 24, 17, { fill: 'none', stroke: iron, strokeWidth: 6 }),
    path('M50 14C43 14 41 19 41 23C41 27 43 29 45 30V33H55V30C57 29 59 27 59 23C59 19 57 14 50 14Z', { fill: '#e8dcc0', ...stroke(1.6) }),
    circle(46.5, 23, 2, { fill: OUT }),
    circle(53.5, 23, 2, { fill: OUT }),
    rect(46, 40, 8, 52, { fill: iron, ...stroke(2) }),
    path('M54 74H70V80H62V86H54Z', { fill: iron, ...stroke(2) }),
    path('M54 88H66V94H54Z', { fill: iron, ...stroke(2) }),
    circle(50, 60, 1.5, { fill: '#7a3a1a' }),
    circle(52, 70, 1.2, { fill: '#7a3a1a' }),
  ]);
};

export const dragonScale: SymbolFn = (doc) =>
  [
    circle(50, 52, 44, { fill: glowFill(doc, 'scaleGlow', '#ff6a3a'), opacity: 0.6 }),
    path('M50 8C74 20 84 40 80 62C76 80 62 92 50 94C38 92 24 80 20 62C16 40 26 20 50 8Z', { fill: lin(doc, 'scaleRed', '#ff7a5a', '#6a0a08'), ...stroke(2.8) }),
    path('M50 12V90', { stroke: '#3a0604', strokeWidth: 2.4 }),
    path('M50 34Q36 40 28 54M50 34Q64 40 72 54M50 56Q38 62 32 74M50 56Q62 62 68 74', { fill: 'none', stroke: '#3a0604', strokeWidth: 1.6, opacity: 0.8 }),
    path('M36 24Q30 34 30 46', { fill: 'none', stroke: '#ffd0b0', strokeWidth: 3, opacity: 0.7, strokeLinecap: 'round' }),
  ].join('');

export const archmageStaff: SymbolFn = (doc) =>
  [
    circle(64, 20, 26, { fill: glowFill(doc, 'staffGlow', '#c8a8ff') }),
    g({ transform: 'rotate(25 50 50)' }, [
      rect(47, 24, 6, 76, { rx: 2, fill: lin(doc, 'staffWood', '#6a4a2a', '#2a1a0a', true), ...stroke(2) }),
      rect(45, 40, 10, 5, { fill: '#e9c063', ...stroke(1.2) }),
      rect(45, 62, 10, 5, { fill: '#e9c063', ...stroke(1.2) }),
      rect(45, 84, 10, 5, { fill: '#e9c063', ...stroke(1.2) }),
      path('M50 26C38 24 34 12 40 4C40 12 44 18 50 18C56 18 60 12 60 4C66 12 62 24 50 26Z', { fill: '#e9c063', ...stroke(1.8) }),
      circle(50, 10, 8, { fill: rad(doc, 'staffOrb', '#ffffff', '#8a63f0'), ...stroke(1.8) }),
    ]),
    path(polyPath(starPoints(22, 30, 6, 2, 4)), { fill: '#e8dcff' }),
    path(polyPath(starPoints(84, 60, 5, 1.8, 4)), { fill: '#e8dcff' }),
    path(polyPath(starPoints(30, 76, 4, 1.5, 4)), { fill: '#e8dcff' }),
  ].join('');

export const dragonOrb: SymbolFn = (doc) => {
  const sphere = doc.def('orbSphere', `<radialGradient id="orbSphere" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#fff0a0"/><stop offset="0.35" stop-color="#ff7a2a"/><stop offset="0.75" stop-color="#8a0a2a"/><stop offset="1" stop-color="#2a0410"/></radialGradient>`);
  return [
    circle(50, 44, 46, { fill: glowFill(doc, 'orbGlow', '#ff6a2a') }),
    ellipse(50, 92, 26, 6, { fill: '#5a3a10', ...stroke(2) }),
    path('M30 70Q26 84 36 90M70 70Q74 84 64 90M50 76V90', { fill: 'none', stroke: '#e9c063', strokeWidth: 5, strokeLinecap: 'round' }),
    circle(50, 44, 32, { fill: sphere, ...stroke(2.6) }),
    path('M30 40Q50 22 70 44Q52 34 30 40Z', { fill: '#ffb030', opacity: 0.5 }),
    ellipse(50, 46, 12, 8, { fill: '#ffd23a', ...stroke(1.4) }),
    ellipse(50, 46, 2.2, 7.5, { fill: '#1a0400' }),
    ellipse(38, 30, 9, 5, { fill: '#ffffff', opacity: 0.6, transform: 'rotate(-30 38 30)' }),
    path('M26 70L22 62L32 66ZM74 70L78 62L68 66Z', { fill: '#e9c063', ...stroke(1.4) }),
  ].join('');
};

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

export const fireball: SymbolFn = (doc) =>
  [
    path('M44 52C32 64 22 76 6 92C20 74 22 66 26 58C18 64 12 66 4 66C18 58 28 48 40 38Z', { fill: lin(doc, 'fbTail', '#ffb030', '#c2300f'), opacity: 0.9 }),
    circle(60, 40, 34, { fill: glowFill(doc, 'fbGlow', '#ff8a2a') }),
    circle(60, 40, 22, { fill: rad(doc, 'fbCore', '#ffffff', '#ff4a0a', 0.45, 0.4), ...stroke(2, '#7a1a04') }),
    circle(56, 36, 9, { fill: '#fff6c8' }),
    circle(22, 80, 2, { fill: '#ffcf5a' }),
    circle(34, 70, 1.6, { fill: '#ffcf5a' }),
  ].join('');

export const magicMissile: SymbolFn = (doc) => {
  const dart = (d: string): string => [path(d, { fill: 'none', stroke: '#a98bff', strokeWidth: 9, strokeLinecap: 'round', opacity: 0.35 }), path(d, { fill: 'none', stroke: '#e8dcff', strokeWidth: 3.5, strokeLinecap: 'round' })].join('');
  return [
    dart('M10 80Q40 70 84 22'),
    dart('M14 92Q50 84 90 46'),
    dart('M6 62Q30 48 68 12'),
    circle(84, 22, 6, { fill: glowFill(doc, 'mmTip', '#e8dcff') }),
    circle(90, 46, 6, { fill: 'url(#mmTip)' }),
    circle(68, 12, 6, { fill: 'url(#mmTip)' }),
  ].join('');
};

export const cureWounds: SymbolFn = (doc) =>
  [
    circle(50, 52, 46, { fill: glowFill(doc, 'cureGlow', '#5fd07a') }),
    path('M50 86C20 66 12 48 18 34C24 20 42 18 50 32C58 18 76 20 82 34C88 48 80 66 50 86Z', { fill: rad(doc, 'cureHeart', '#ff8a8a', '#9b1a14'), ...stroke(2.6) }),
    path('M50 40V68M36 54H64', { stroke: '#ffffff', strokeWidth: 8, strokeLinecap: 'round' }),
    path('M50 40V68M36 54H64', { stroke: '#5fd07a', strokeWidth: 4, strokeLinecap: 'round' }),
  ].join('');

export const lightningBolt: SymbolFn = (doc) =>
  [
    circle(50, 50, 46, { fill: glowFill(doc, 'boltGlow', '#ffe14a') }),
    path('M60 2L24 54H46L34 98L78 38H54L72 2Z', { fill: lin(doc, 'boltFill', '#fffbe0', '#f0b020'), ...stroke(2.6, '#5a3a00') }),
  ].join('');

export const snowflake: SymbolFn = (doc) => {
  const arms: string[] = [];
  for (let i = 0; i < 6; i++) {
    arms.push(g({ transform: `rotate(${i * 60} 50 50)` }, path('M50 50V10M50 22L42 14M50 22L58 14M50 34L40 28M50 34L60 28', { fill: 'none', stroke: '#e8f8ff', strokeWidth: 4.5, strokeLinecap: 'round' })));
  }
  return [circle(50, 50, 46, { fill: glowFill(doc, 'frostGlow', '#7fd6ff') }), g({ stroke: '#1a3a5a' }, arms), circle(50, 50, 7, { fill: '#e8f8ff', ...stroke(1.6, '#2a6f9f') })].join('');
};

export const shieldSpell: SymbolFn = (doc) => {
  const hexes: string[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) hexes.push(path(polyPath(regularPolygon(28 + c * 15 + (r % 2) * 7.5, 26 + r * 13, 8, 6, Math.PI / 6)), { fill: 'none', stroke: '#d8ecff', strokeWidth: 1, opacity: 0.6 }));
  doc.def('shieldSpellClip', tag('clipPath', { id: 'shieldSpellClip' }, path('M20 14H80V46C80 70 66 84 50 94C34 84 20 70 20 46Z')));
  return [
    circle(50, 52, 46, { fill: glowFill(doc, 'shieldSpellGlow', '#8ab4ff') }),
    path('M20 14H80V46C80 70 66 84 50 94C34 84 20 70 20 46Z', { fill: '#8ab4ff', opacity: 0.35 }),
    g({ clipPath: 'url(#shieldSpellClip)' }, hexes),
    path('M20 14H80V46C80 70 66 84 50 94C34 84 20 70 20 46Z', { fill: 'none', stroke: '#e8f4ff', strokeWidth: 3.5 }),
    path('M50 34L56 46L50 58L44 46Z', { fill: '#ffffff', opacity: 0.9 }),
  ].join('');
};

export const lightOrb: SymbolFn = (doc) => {
  const rays: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rays.push(line(50 + Math.cos(a) * 24, 50 + Math.sin(a) * 24, 50 + Math.cos(a) * (i % 2 === 0 ? 44 : 36), 50 + Math.sin(a) * (i % 2 === 0 ? 44 : 36), { stroke: '#fff6c8', strokeWidth: 4, strokeLinecap: 'round' }));
  }
  return [circle(50, 50, 46, { fill: glowFill(doc, 'lightGlow', '#fff3a0') }), ...rays, circle(50, 50, 17, { fill: rad(doc, 'lightCore', '#ffffff', '#ffe14a'), ...stroke(1.8, '#a8741a') })].join('');
};

export const healingWord: SymbolFn = (doc) =>
  [
    circle(50, 50, 46, { fill: glowFill(doc, 'wordGlow', '#5fd07a') }),
    path('M16 20H84Q90 20 90 26V62Q90 68 84 68H44L28 84V68H16Q10 68 10 62V26Q10 20 16 20Z', { fill: '#fbf6ea', ...stroke(2.6) }),
    path('M50 30V58M36 44H64', { stroke: '#5fd07a', strokeWidth: 7, strokeLinecap: 'round' }),
    path(polyPath(starPoints(76, 30, 6, 2, 4)), { fill: '#e9c063' }),
    path(polyPath(starPoints(24, 56, 5, 1.8, 4)), { fill: '#e9c063' }),
  ].join('');

export const rayOfFrost: SymbolFn = (doc) =>
  [
    path('M8 92L72 28', { stroke: '#7fd6ff', strokeWidth: 18, strokeLinecap: 'round', opacity: 0.3 }),
    path('M8 92L72 28', { stroke: lin(doc, 'rayFill', '#ffffff', '#7fd6ff', true), strokeWidth: 7, strokeLinecap: 'round' }),
    circle(76, 24, 18, { fill: glowFill(doc, 'rayGlow', '#bfeeff') }),
    path('M76 6L84 24L76 42L68 24Z', { fill: '#e8f8ff', ...stroke(2, '#2a6f9f') }),
    path('M58 24L94 24', { stroke: '#e8f8ff', strokeWidth: 3, strokeLinecap: 'round' }),
    path('M24 60l4 4M34 70l3 3M40 52l3 3', { stroke: '#e8f8ff', strokeWidth: 2.4, strokeLinecap: 'round' }),
  ].join('');

export const poisonCloud: SymbolFn = (doc) =>
  [
    path('M22 70C8 70 6 52 18 48C14 34 30 26 40 34C44 20 64 18 70 32C82 28 94 40 88 52C98 58 92 72 80 70Z', { fill: rad(doc, 'poisonFill', '#b8f070', '#3a7a1a'), ...stroke(2.6, '#1a3a0a') }),
    circle(50, 50, 10, { fill: '#e8f8d8', ...stroke(1.6, '#1a3a0a') }),
    circle(46, 49, 2.4, { fill: '#1a3a0a' }),
    circle(54, 49, 2.4, { fill: '#1a3a0a' }),
    path('M46 58V62M50 58V62M54 58V62', { stroke: '#1a3a0a', strokeWidth: 1.6 }),
    path('M30 74Q28 84 32 90M60 74Q62 82 58 88M76 72Q78 80 74 86', { fill: 'none', stroke: '#8ad04a', strokeWidth: 4, strokeLinecap: 'round' }),
  ].join('');

export const sacredFlame: SymbolFn = (doc) =>
  [
    circle(50, 56, 44, { fill: glowFill(doc, 'sacredGlow', '#ffe680') }),
    path('M50 4C60 22 76 30 74 54C72 76 62 92 50 94C38 92 28 76 26 54C24 30 40 22 50 4Z', { fill: lin(doc, 'sacredFill', '#ffffff', '#f0b020'), ...stroke(2.4, '#8a5a00') }),
    path('M50 34C56 46 62 52 60 64C58 76 54 84 50 84C46 84 42 76 40 64C38 52 44 46 50 34Z', { fill: '#ffffff' }),
    path(polyPath(starPoints(20, 30, 6, 2, 4)), { fill: '#fff6c8' }),
    path(polyPath(starPoints(82, 22, 5, 1.8, 4)), { fill: '#fff6c8' }),
  ].join('');

export const shadowTouch: SymbolFn = (doc) => {
  const hand = lin(doc, 'shadowHand', '#5a2a7a', '#120818');
  return [
    circle(50, 50, 46, { fill: glowFill(doc, 'shadowGlow', '#8a63f0') }),
    path('M30 92C26 74 26 62 32 54L30 30Q30 24 35 24Q40 24 40 30L41 46L42 20Q42 14 47 14Q52 14 52 20L52 44L54 22Q54 16 59 16Q64 16 64 22L62 46L66 32Q67 26 72 27Q77 28 76 34L70 62C68 74 64 84 60 92Z', { fill: hand, ...stroke(2.4, '#05020a') }),
    path('M20 40Q12 30 18 18M84 52Q94 46 90 32M14 70Q6 64 10 54', { fill: 'none', stroke: '#a98bff', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.8 }),
  ].join('');
};

export const sleepMoon: SymbolFn = (doc) =>
  [
    circle(40, 54, 40, { fill: glowFill(doc, 'sleepGlow', '#a98bff') }),
    path('M46 16C24 18 12 38 16 56C20 76 42 86 60 76C40 74 28 58 30 42C32 30 38 22 46 16Z', { fill: rad(doc, 'sleepMoonFill', '#fbf6ea', '#c8c0e8'), ...stroke(2.4) }),
    path('M58 20H74L58 38H74', { fill: 'none', stroke: '#e8dcff', strokeWidth: 4.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    path('M74 46H86L74 60H86', { fill: 'none', stroke: '#e8dcff', strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    path('M84 70H92L84 80H92', { fill: 'none', stroke: '#e8dcff', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  ].join('');

export const web: SymbolFn = () => {
  const spokes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spokes.push(line(50, 50, 50 + Math.cos(a) * 46, 50 + Math.sin(a) * 46, { stroke: '#f3f3f3', strokeWidth: 2 }));
  }
  const rings: string[] = [];
  for (let k = 1; k <= 4; k++) rings.push(path(polyPath(regularPolygon(50, 50, k * 11, 8, 0)), { fill: 'none', stroke: '#f3f3f3', strokeWidth: 1.6 }));
  return [...spokes, ...rings, circle(66, 36, 6, { fill: '#1a1a1a', stroke: '#f3f3f3', strokeWidth: 1.2 }), circle(66, 30, 3.5, { fill: '#1a1a1a' }), line(50, 4, 66, 30, { stroke: '#f3f3f3', strokeWidth: 1 })].join('');
};

export const detectMagic: SymbolFn = (doc) =>
  [
    circle(50, 50, 44, { fill: 'none', stroke: '#a98bff', strokeWidth: 2, strokeDasharray: '4 4' }),
    circle(50, 50, 36, { fill: 'none', stroke: '#a98bff', strokeWidth: 1.2 }),
    path('M8 50Q50 12 92 50Q50 88 8 50Z', { fill: '#fbf6ea', ...stroke(2.6) }),
    circle(50, 50, 16, { fill: rad(doc, 'detectIris', '#e8dcff', '#6a3ab8'), ...stroke(2) }),
    path(polyPath(starPoints(50, 50, 9, 3.5, 5)), { fill: '#fff6c8' }),
    circle(44, 44, 3, { fill: '#ffffff' }),
  ].join('');

export const invisibility: SymbolFn = (doc) =>
  [
    circle(50, 50, 44, { fill: glowFill(doc, 'invisGlow', '#c8f0ff'), opacity: 0.6 }),
    circle(50, 28, 13, { fill: '#c8f0ff', fillOpacity: 0.2, stroke: '#e8f8ff', strokeWidth: 2.4, strokeDasharray: '5 4' }),
    path('M24 92C24 62 34 46 50 46C66 46 76 62 76 92', { fill: '#c8f0ff', fillOpacity: 0.2, stroke: '#e8f8ff', strokeWidth: 2.4, strokeDasharray: '5 4' }),
    path(polyPath(starPoints(82, 24, 6, 2, 4)), { fill: '#ffffff' }),
    path(polyPath(starPoints(16, 58, 5, 1.8, 4)), { fill: '#ffffff' }),
  ].join('');

export const enlarge: SymbolFn = () => {
  const arrow = (rot: number): string => g({ transform: `rotate(${rot} 50 50)` }, path('M64 36L84 16M84 16H70M84 16V30', { fill: 'none', stroke: '#e9c063', strokeWidth: 4.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
  return [arrow(0), arrow(90), arrow(180), arrow(270), circle(50, 38, 8, { fill: '#fbf6ea', ...stroke(2) }), path('M38 70C38 56 42 50 50 50C58 50 62 56 62 70Z', { fill: '#fbf6ea', ...stroke(2) })].join('');
};

export const eldritchBlast: SymbolFn = (doc) =>
  [
    path('M10 90L58 42', { stroke: '#8a63f0', strokeWidth: 16, strokeLinecap: 'round', opacity: 0.35 }),
    path('M10 90L58 42', { stroke: '#e8dcff', strokeWidth: 5, strokeLinecap: 'round' }),
    circle(64, 36, 30, { fill: glowFill(doc, 'ebGlow', '#a98bff') }),
    circle(64, 36, 16, { fill: rad(doc, 'ebCore', '#ffffff', '#6a3ab8'), ...stroke(2, '#2a0a4a') }),
    path('M64 6L60 18L68 20L62 30M92 34L80 34L80 42L70 40M86 64L76 54L70 60L66 50', { fill: 'none', stroke: '#e8dcff', strokeWidth: 2, strokeLinecap: 'round' }),
  ].join('');

export const mockery: SymbolFn = (doc) =>
  [
    circle(50, 50, 44, { fill: glowFill(doc, 'mockGlow', '#ff7ab8') }),
    path('M18 18H82V50C82 72 68 88 50 88C32 88 18 72 18 50Z', { fill: lin(doc, 'maskFill', '#fbf6ea', '#c8b8e0'), ...stroke(2.6) }),
    path('M28 40Q36 32 44 40M56 40Q64 32 72 40', { fill: 'none', ...stroke(3.5) }),
    path('M30 56Q50 82 70 56Q50 64 30 56Z', { fill: '#3a0a2a', ...stroke(2) }),
    path('M84 10L76 24L86 26L78 40', { fill: 'none', stroke: '#ffe14a', strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  ].join('');

export const thunderwave: SymbolFn = (doc) =>
  [
    circle(24, 50, 12, { fill: rad(doc, 'thunderCore', '#ffffff', '#3d8bff'), ...stroke(2) }),
    path('M40 26Q56 50 40 74', { fill: 'none', stroke: '#bfe0ff', strokeWidth: 6, strokeLinecap: 'round' }),
    path('M56 16Q78 50 56 84', { fill: 'none', stroke: '#8ab4ff', strokeWidth: 5, strokeLinecap: 'round', opacity: 0.85 }),
    path('M72 8Q98 50 72 92', { fill: 'none', stroke: '#5a8ad8', strokeWidth: 4, strokeLinecap: 'round', opacity: 0.7 }),
  ].join('');

export const acidSplash: SymbolFn = (doc) =>
  [
    circle(50, 56, 42, { fill: glowFill(doc, 'acidGlow', '#b8f070') }),
    path('M50 14C60 32 70 44 70 58C70 72 60 80 50 80C40 80 30 72 30 58C30 44 40 32 50 14Z', { fill: rad(doc, 'acidDrop', '#e8ffb0', '#5a9a1a'), ...stroke(2.6, '#1a3a0a') }),
    ellipse(42, 54, 4, 8, { fill: '#ffffff', opacity: 0.7, transform: 'rotate(20 42 54)' }),
    circle(18, 84, 6, { fill: '#8ad04a', ...stroke(1.6, '#1a3a0a') }),
    circle(84, 80, 5, { fill: '#8ad04a', ...stroke(1.6, '#1a3a0a') }),
    circle(80, 30, 4, { fill: '#8ad04a', ...stroke(1.4, '#1a3a0a') }),
    circle(20, 34, 3, { fill: '#8ad04a', ...stroke(1.2, '#1a3a0a') }),
  ].join('');

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

export const drum: SymbolFn = (doc) =>
  [
    line(20, 8, 56, 44, { stroke: '#c88a4a', strokeWidth: 5, strokeLinecap: 'round' }),
    line(80, 8, 44, 44, { stroke: '#c88a4a', strokeWidth: 5, strokeLinecap: 'round' }),
    circle(20, 8, 5, { fill: '#f3ead6', ...stroke(1.6) }),
    circle(80, 8, 5, { fill: '#f3ead6', ...stroke(1.6) }),
    path('M16 50V82Q50 96 84 82V50', { fill: lin(doc, 'drumBody', '#c43d33', '#6a1410', true), ...stroke(2.6) }),
    path('M16 54L30 84L44 54L58 88L72 54L84 82', { fill: 'none', stroke: '#f3ead6', strokeWidth: 2 }),
    ellipse(50, 50, 34, 12, { fill: '#f3e6c0', ...stroke(2.6) }),
  ].join('');

export const bell: SymbolFn = (doc) =>
  [
    path('M50 10C32 10 26 26 26 44C26 60 20 68 12 74H88C80 68 74 60 74 44C74 26 68 10 50 10Z', { fill: lin(doc, 'bellFill', '#ffe68a', '#8a5a10', true), ...stroke(2.6) }),
    rect(10, 72, 80, 8, { rx: 4, fill: '#c8901a', ...stroke(2) }),
    circle(50, 86, 7, { fill: '#c8901a', ...stroke(2) }),
    circle(50, 8, 4, { fill: 'none', ...stroke(2.4) }),
    path('M8 36Q2 48 8 60M92 36Q98 48 92 60', { fill: 'none', stroke: '#fbf6ea', strokeWidth: 2.6, strokeLinecap: 'round', opacity: 0.8 }),
    path('M36 24Q32 40 34 60', { fill: 'none', stroke: '#fff6c8', strokeWidth: 3, opacity: 0.6, strokeLinecap: 'round' }),
  ].join('');

export const treeSymbol: SymbolFn = (doc) =>
  [
    rect(44, 56, 12, 38, { fill: '#6a4626', ...stroke(2.2) }),
    circle(50, 36, 26, { fill: rad(doc, 'treeFill', '#9ad05e', '#2f5a1e'), ...stroke(2.4) }),
    circle(30, 50, 16, { fill: 'url(#treeFill)', ...stroke(2.2) }),
    circle(70, 50, 16, { fill: 'url(#treeFill)', ...stroke(2.2) }),
    path('M4 20Q16 14 28 20M70 14Q84 8 96 14M6 76Q14 72 22 76', { fill: 'none', stroke: '#fbf6ea', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.8 }),
    path('M78 30l6 -3l-1 6z', { fill: '#3a2a1a' }),
  ].join('');

export const rainCloud: SymbolFn = (doc) =>
  [
    path('M24 56C10 56 8 40 20 36C18 24 34 18 42 26C46 14 66 12 72 26C84 24 94 36 88 46C96 52 90 62 80 62H26Z', { fill: lin(doc, 'cloudFill', '#c8d0dc', '#6a7484'), ...stroke(2.4) }),
    path('M28 70L24 82M44 70L40 86M60 70L56 82M76 70L72 86', { stroke: '#7fd6ff', strokeWidth: 3.5, strokeLinecap: 'round' }),
  ].join('');

export const caveSymbol: SymbolFn = (doc) =>
  [
    path('M4 92C8 52 26 22 50 20C74 22 92 52 96 92Z', { fill: lin(doc, 'caveRock', '#8a7a6a', '#3a322a'), ...stroke(2.6) }),
    path('M24 92C26 64 36 46 50 44C64 46 74 64 76 92Z', { fill: '#0a0807' }),
    path('M38 50L42 62L46 50ZM54 48L57 58L60 48Z', { fill: '#8a7a6a' }),
    path('M50 66C53 71 54 74 50 76C46 74 47 71 50 66Z', { fill: '#7fd6ff' }),
  ].join('');

export const campfireSymbol: SymbolFn = (doc) =>
  [
    circle(50, 54, 40, { fill: glowFill(doc, 'campGlow', '#ff8a2a') }),
    path('M14 86L86 70M14 70L86 86', { stroke: '#6a4020', strokeWidth: 9, strokeLinecap: 'round' }),
    path('M14 86L86 70M14 70L86 86', { stroke: OUT, strokeWidth: 1.2, opacity: 0.4 }),
    path('M50 14C58 28 70 34 68 52C67 64 60 72 50 72C40 72 33 64 32 52C30 34 42 28 50 14Z', { fill: lin(doc, 'campFlame', '#fff3a0', '#ff4a0a'), ...stroke(2.2, '#7a1a04') }),
    path('M50 38C54 46 58 50 57 58C56 64 53 68 50 68C47 68 44 64 43 58C42 50 46 46 50 38Z', { fill: '#fff6c8' }),
  ].join('');

export const crossedSwords: SymbolFn = (doc) => {
  const blade = lin(doc, 'xsBlade', '#f6f8fc', '#7a808a', true);
  const guard = lin(doc, 'xsGuard', '#ffe08a', '#9a6a1a');
  const s = (rot: number): string =>
    g({ transform: `rotate(${rot} 50 50)` }, [path('M50 2L56 12L56 60H44L44 12Z', { fill: blade, ...stroke(2.2) }), rect(34, 59, 32, 6, { rx: 3, fill: guard, ...stroke(1.8) }), rect(46.5, 65, 7, 18, { fill: '#5a3418', ...stroke(1.6) }), circle(50, 86, 5, { fill: guard, ...stroke(1.6) })]);
  return [s(-38), s(38), path(polyPath(starPoints(50, 30, 10, 3, 4)), { fill: '#fff6c8' })].join('');
};

export const door: SymbolFn = (doc) =>
  [
    path('M20 94V40C20 18 34 8 50 8C66 8 80 18 80 40V94Z', { fill: lin(doc, 'doorWood', '#a06a3a', '#4a2a12', true), ...stroke(2.6) }),
    path('M35 12V94M50 8V94M65 12V94', { stroke: '#3a1e0a', strokeWidth: 1.8 }),
    rect(20, 30, 26, 6, { fill: '#4a4e56', ...stroke(1.4) }),
    rect(20, 70, 26, 6, { fill: '#4a4e56', ...stroke(1.4) }),
    circle(66, 56, 6, { fill: 'none', stroke: '#c8ccd4', strokeWidth: 3 }),
    path('M86 30Q94 40 88 52M92 20Q100 34 94 46', { fill: 'none', stroke: '#fbf6ea', strokeWidth: 2.2, strokeLinecap: 'round', opacity: 0.7 }),
  ].join('');

export const coinStack: SymbolFn = (doc) => {
  const gold = lin(doc, 'coinFill', '#ffe68a', '#a8741a');
  const coins: string[] = [];
  for (let i = 0; i < 5; i++) coins.push(ellipse(40, 84 - i * 9, 24, 8, { fill: gold, ...stroke(2) }));
  for (let i = 0; i < 3; i++) coins.push(ellipse(72, 86 - i * 9, 20, 7, { fill: gold, ...stroke(2) }));
  return [
    ...coins,
    circle(70, 30, 16, { fill: gold, ...stroke(2.4) }),
    circle(70, 30, 11, { fill: 'none', stroke: '#a8741a', strokeWidth: 1.6 }),
    text(70, 36, '$', { fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 'bold', fill: '#7a5010', textAnchor: 'middle' }),
    path(polyPath(starPoints(22, 24, 6, 2, 4)), { fill: '#fff6c8' }),
  ].join('');
};

export const impact: SymbolFn = (doc) =>
  [
    path(polyPath(starPoints(50, 50, 46, 22, 10, -Math.PI / 2)), { fill: lin(doc, 'impactFill', '#fff3a0', '#ff6a1a'), ...stroke(2.6, '#7a1a04') }),
    path(polyPath(starPoints(50, 50, 24, 12, 8, 0)), { fill: '#ffffff' }),
  ].join('');

export const book: SymbolFn = (doc) =>
  [
    path('M8 28Q30 20 50 30Q70 20 92 28V84Q70 76 50 86Q30 76 8 84Z', { fill: '#7a2a1a', ...stroke(2.4) }),
    path('M12 26Q30 18 50 28V80Q30 72 12 80Z', { fill: lin(doc, 'pageFill', '#fbf6ea', '#d8c090'), ...stroke(2) }),
    path('M50 28Q70 18 88 26V80Q70 72 50 80Z', { fill: 'url(#pageFill)', ...stroke(2) }),
    path('M50 28Q66 8 84 12V66Q66 62 50 80', { fill: '#fbf6ea', ...stroke(2) }),
    path('M20 38H42M20 46H40M20 54H42M60 30Q70 24 78 24M60 40Q70 34 78 34', { stroke: '#8a7a5a', strokeWidth: 1.6, strokeLinecap: 'round' }),
  ].join('');
