import { circle, ellipse, g, line, linearGradient, path, radialGradient, rect, type Attrs, type SvgDoc } from './svg';

/**
 * Bold emblem symbols for creature and hero portraits, drawn in a 100 x 100 box.
 * Each function registers its gradients on the document and returns the markup.
 */

export type SymbolFn = (doc: SvgDoc) => string;

export const OUT = '#1a120c';

export function stroke(width = 2.5, color = OUT): Attrs {
  return { stroke: color, strokeWidth: width, strokeLinejoin: 'round', strokeLinecap: 'round' };
}

export function lin(doc: SvgDoc, id: string, top: string, bottom: string, horizontal = false): string {
  return doc.def(id, linearGradient(id, [[0, top], [1, bottom]], 0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1));
}

export function rad(doc: SvgDoc, id: string, inner: string, outer: string, cx = 0.4, cy = 0.35): string {
  return doc.def(id, radialGradient(id, [[0, inner], [1, outer]], { cx, cy, r: 0.75 }));
}

export function glowFill(doc: SvgDoc, id: string, color: string): string {
  return doc.def(id, radialGradient(id, [[0, color, 0.9], [0.5, color, 0.35], [1, color, 0]]));
}

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

export const dragonHead: SymbolFn = (doc) => {
  const skin = lin(doc, 'dragonSkin', '#ef6a4a', '#7a1410');
  const bone = lin(doc, 'dragonHorn', '#f3ead6', '#a8946b');
  return [
    path('M38 36C28 22 16 16 4 16C16 22 24 30 30 40Z', { fill: bone, ...stroke(2) }),
    path('M50 33C48 20 42 10 32 4C40 14 44 24 44 34Z', { fill: bone, ...stroke(2) }),
    path('M20 60L6 62L16 69ZM14 74L1 78L12 83ZM11 88L0 94L10 97Z', { fill: '#5c0f0b', ...stroke(1.5) }),
    path('M8 98C10 80 14 68 20 60C24 46 34 36 48 33L66 34C78 35 88 40 94 47L93 53C86 56 76 57 68 57L60 58C68 63 76 67 84 69L80 74C66 76 52 76 42 80C34 84 30 92 28 98Z', { fill: skin, ...stroke(2.8) }),
    path('M42 80C36 86 32 92 30 98L40 98C42 92 46 86 52 82Z', { fill: '#f0a050', opacity: 0.9 }),
    path('M46 63Q58 67 72 66M30 66Q36 72 38 82', { fill: 'none', stroke: '#5c0f0b', strokeWidth: 1.6, opacity: 0.7 }),
    path('M52 39Q62 33 73 40', { fill: 'none', stroke: '#3a0806', strokeWidth: 3.5, strokeLinecap: 'round' }),
    circle(63, 43, 7, { fill: glowFill(doc, 'dragonEyeGlow', '#ffd23a') }),
    ellipse(63, 43, 5, 3.2, { fill: '#ffd23a', stroke: '#3a0806', strokeWidth: 1 }),
    ellipse(63, 43, 1.1, 3, { fill: '#1a0a00' }),
    ellipse(88, 47, 2.2, 1.4, { fill: '#2a0604' }),
    path('M62 57l2 6l2-6ZM70 57l2 6l2-6ZM78 56l2 5l2-5ZM66 66l2-5l2 5ZM74 68l2-5l2 5Z', { fill: '#fbf6ea' }),
    path('M84 68Q96 62 100 70Q94 71 98 79Q88 75 84 68Z', { fill: '#ffb030', opacity: 0.9 }),
    path('M28 50Q34 44 40 46M24 58Q30 54 36 56', { fill: 'none', stroke: '#ff9a7a', strokeWidth: 1.5, opacity: 0.6 }),
  ].join('');
};

function goblinFace(doc: SvgDoc, skinTop: string, skinBottom: string, id: string): string {
  const skin = lin(doc, id, skinTop, skinBottom);
  return [
    path('M32 44L2 28L10 40L30 56Z', { fill: skin, ...stroke(2.2) }),
    path('M68 44L98 28L90 40L70 56Z', { fill: skin, ...stroke(2.2) }),
    path('M28 44L10 34L26 52Z', { fill: '#c06a6a', opacity: 0.6 }),
    path('M72 44L90 34L74 52Z', { fill: '#c06a6a', opacity: 0.6 }),
    path('M50 22C70 22 78 38 77 52C76 68 66 82 50 84C34 82 24 68 23 52C22 38 30 22 50 22Z', { fill: skin, ...stroke(2.6) }),
    path('M32 44L46 49M68 44L54 49', { stroke: '#1e2a10', strokeWidth: 4, strokeLinecap: 'round' }),
    ellipse(40, 52, 6, 4.5, { fill: '#ffe14a', ...stroke(1.2) }),
    ellipse(60, 52, 6, 4.5, { fill: '#ffe14a', ...stroke(1.2) }),
    circle(41, 52, 2, { fill: '#a01a0a' }),
    circle(59, 52, 2, { fill: '#a01a0a' }),
    path('M50 52C55 59 57 63 53 67C51 68 47 67 47 64', { fill: shadeHex(skinBottom), ...stroke(1.5) }),
    path('M33 71Q50 82 67 71Q50 76 33 71Z', { fill: '#2a0a0a', ...stroke(1.6) }),
    path('M38 72l3 5l2-4ZM62 72l-3 5l-2-4ZM47 74l2 3l2-3Z', { fill: '#f3ead6' }),
    circle(30, 60, 1.6, { fill: '#2a3a14' }),
    circle(70, 62, 1.4, { fill: '#2a3a14' }),
  ].join('');
}

function shadeHex(hex: string): string {
  // Slightly darker variant without importing the color helpers (keeps symbols self-contained).
  const v = Number.parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((v >> 16) & 255) - 30);
  const gg = Math.max(0, ((v >> 8) & 255) - 30);
  const b = Math.max(0, (v & 255) - 30);
  return `#${[r, gg, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const goblin: SymbolFn = (doc) =>
  [goblinFace(doc, '#9ad05e', '#4a7a28', 'goblinSkin'), path('M26 40C28 18 72 18 74 40C66 31 34 31 26 40Z', { fill: '#6b4426', ...stroke(2.2) }), path('M50 18v8', { stroke: '#3a2412', strokeWidth: 3 })].join('');

export const goblinShaman: SymbolFn = (doc) =>
  [
    circle(50, 50, 48, { fill: glowFill(doc, 'shamanAura', '#a98bff') }),
    g({ transform: 'rotate(-25 50 30)' }, ellipse(50, 8, 4, 16, { fill: '#c43d33', ...stroke(1.5) })),
    g({ transform: 'rotate(0 50 30)' }, ellipse(50, 4, 4, 16, { fill: '#2f6fb8', ...stroke(1.5) })),
    g({ transform: 'rotate(25 50 30)' }, ellipse(50, 8, 4, 16, { fill: '#e9c063', ...stroke(1.5) })),
    goblinFace(doc, '#7ac0a0', '#2f6a5a', 'shamanSkin'),
    path('M24 38C30 22 70 22 76 38L70 34C60 28 40 28 30 34Z', { fill: '#e8dcc0', ...stroke(1.8) }),
    circle(50, 36, 4.5, { fill: '#a98bff', stroke: '#e8dcff', strokeWidth: 1.2 }),
    path('M40 66h20', { stroke: '#e8dcc0', strokeWidth: 3.5, strokeLinecap: 'round' }),
    circle(39, 66, 2.6, { fill: '#e8dcc0' }),
    circle(61, 66, 2.6, { fill: '#e8dcc0' }),
  ].join('');

export const wolf: SymbolFn = (doc) => {
  const fur = lin(doc, 'wolfFur', '#a8aeb8', '#3e424a');
  return [
    path('M24 36L20 4L44 26Z', { fill: fur, ...stroke(2.2) }),
    path('M76 36L80 4L56 26Z', { fill: fur, ...stroke(2.2) }),
    path('M26 30L24 12L36 26Z', { fill: '#5a3a3a', opacity: 0.8 }),
    path('M74 30L76 12L64 26Z', { fill: '#5a3a3a', opacity: 0.8 }),
    path('M50 24C64 24 78 30 82 44C86 56 80 66 70 72L60 88C56 94 44 94 40 88L30 72C20 66 14 56 18 44C22 30 36 24 50 24Z', { fill: fur, ...stroke(2.6) }),
    path('M18 44L6 52L19 55L10 63L27 63ZM82 44L94 52L81 55L90 63L73 63Z', { fill: fur, ...stroke(2) }),
    path('M40 56C44 52 56 52 60 56L60 78C56 86 44 86 40 78Z', { fill: '#d0d4da' }),
    path('M50 28L45 46L50 54L55 46Z', { fill: '#2e3238', opacity: 0.6 }),
    path('M31 49Q38 41 45 49Q38 52 31 49Z', { fill: '#ffd23a', ...stroke(1.2) }),
    path('M55 49Q62 41 69 49Q62 52 55 49Z', { fill: '#ffd23a', ...stroke(1.2) }),
    ellipse(38, 48.5, 1, 2.6, { fill: '#1a0a00' }),
    ellipse(62, 48.5, 1, 2.6, { fill: '#1a0a00' }),
    path('M29 43L43 46M71 43L57 46', { stroke: '#1a1c20', strokeWidth: 3, strokeLinecap: 'round' }),
    path('M44 75Q50 71 56 75Q54 81 50 81Q46 81 44 75Z', { fill: '#141414' }),
    path('M50 81V86M42 86Q50 92 58 86', { fill: 'none', ...stroke(2) }),
    path('M44 86l1.6 5l1.6-4.4ZM56 86l-1.6 5l-1.6-4.4Z', { fill: '#fbf6ea' }),
  ].join('');
};

export const skull: SymbolFn = (doc) => {
  const boneFill = lin(doc, 'skullBone', '#f6efdc', '#b8a888');
  const bone = (rot: number): string =>
    g({ transform: `rotate(${rot} 50 56)` }, [rect(10, 51, 80, 10, { rx: 5, fill: boneFill, ...stroke(2) }), circle(10, 50, 6.5, { fill: boneFill, ...stroke(2) }), circle(10, 62, 6.5, { fill: boneFill, ...stroke(2) }), circle(90, 50, 6.5, { fill: boneFill, ...stroke(2) }), circle(90, 62, 6.5, { fill: boneFill, ...stroke(2) })]);
  return [
    bone(45),
    bone(-45),
    path('M50 12C28 12 20 28 21 44C22 54 27 59 31 61L31 70Q50 78 69 70L69 61C73 59 78 54 79 44C80 28 72 12 50 12Z', { fill: boneFill, ...stroke(2.8) }),
    ellipse(39, 43, 8, 9, { fill: '#1a120c' }),
    ellipse(61, 43, 8, 9, { fill: '#1a120c' }),
    circle(39, 44, 2.5, { fill: '#ff4a2a' }),
    circle(61, 44, 2.5, { fill: '#ff4a2a' }),
    path('M50 51L45 60H55Z', { fill: '#1a120c' }),
    path('M38 64V72M44 65V74M50 65V75M56 65V74M62 64V72M34 66Q50 72 66 66', { fill: 'none', ...stroke(1.8) }),
    path('M57 14L53 22L58 26L55 32', { fill: 'none', ...stroke(1.5) }),
  ].join('');
};

export const zombie: SymbolFn = (doc) => {
  const skin = lin(doc, 'zombieSkin', '#9fb488', '#4a5f3e');
  return [
    path('M24 44L14 38L16 52L24 56Z', { fill: skin, ...stroke(2) }),
    path('M50 16C72 16 80 34 78 52C76 70 66 86 50 88C34 86 24 70 22 52C20 34 28 16 50 16Z', { fill: skin, ...stroke(2.6) }),
    path('M30 26L26 38M38 18L35 30M62 18L66 30M70 26L76 36M46 16L45 26', { fill: 'none', stroke: '#2a2a1a', strokeWidth: 2.5 }),
    path('M54 22Q66 22 68 32Q60 34 54 28Z', { fill: '#7a2a2a', ...stroke(1.4) }),
    path('M56 25l3 4M60 24l3 4M64 26l2 3', { stroke: '#1a1a1a', strokeWidth: 1.2 }),
    circle(38, 47, 8.5, { fill: '#f3ead6', ...stroke(1.6) }),
    circle(39.5, 48, 2.2, { fill: '#1a1a1a' }),
    ellipse(62, 50, 7, 4, { fill: '#5a1a1a', ...stroke(1.6) }),
    path('M55 47Q62 44 69 48', { fill: 'none', ...stroke(2) }),
    circle(47, 61, 1.8, { fill: '#1a1a1a' }),
    circle(53, 61, 1.8, { fill: '#1a1a1a' }),
    path('M35 73Q50 68 65 73', { fill: 'none', ...stroke(3) }),
    path('M39 68v8M45 67v8M51 67v8M57 68v8M62 69v7', { stroke: '#2a1a1a', strokeWidth: 1.5 }),
    ellipse(30, 66, 4, 3, { fill: '#6a7a4a', opacity: 0.8 }),
  ].join('');
};

export const orc: SymbolFn = (doc) => {
  const skin = lin(doc, 'orcSkin', '#7f9f56', '#3a5226');
  const steel = lin(doc, 'orcSteel', '#d8dce2', '#6a707a');
  const axe = (flip: boolean): string =>
    g({ transform: flip ? 'translate(100 0) scale(-1 1)' : '' }, [line(12, 94, 84, 10, { stroke: '#5a3a1a', strokeWidth: 5, strokeLinecap: 'round' }), path('M78 6C92 8 98 20 94 32C88 26 82 24 74 24Z', { fill: steel, ...stroke(2) })]);
  return [
    axe(false),
    axe(true),
    path('M50 22C72 22 82 38 80 56C78 74 66 88 50 90C34 88 22 74 20 56C18 38 28 22 50 22Z', { fill: skin, ...stroke(2.6) }),
    path('M42 24Q50 2 58 24Z', { fill: '#141414', ...stroke(1.6) }),
    rect(45, 18, 10, 4, { fill: '#c43d33' }),
    path('M26 44Q38 36 48 46L52 46Q62 36 74 44L72 50Q62 44 52 50L48 50Q38 44 28 50Z', { fill: '#2a3a18' }),
    ellipse(38, 52, 5, 3, { fill: '#ff3a2a' }),
    ellipse(62, 52, 5, 3, { fill: '#ff3a2a' }),
    path('M26 58l12 4M26 64l12 4M74 58l-12 4M74 64l-12 4', { stroke: '#c43d33', strokeWidth: 3, strokeLinecap: 'round' }),
    path('M44 60Q50 56 56 60Q56 66 50 66Q44 66 44 60Z', { fill: '#2f4a1e' }),
    path('M34 74Q50 82 66 74', { fill: 'none', ...stroke(3) }),
    path('M36 76L33 62L41 74ZM64 76L67 62L59 74Z', { fill: '#f3ead6', ...stroke(1.4) }),
  ].join('');
};

export const bandit: SymbolFn = (doc) => {
  const hood = lin(doc, 'banditHood', '#7a5434', '#2a1a0e');
  return [
    path('M50 8C78 8 90 32 88 58L92 98H8L12 58C10 32 22 8 50 8Z', { fill: hood, ...stroke(2.6) }),
    path('M50 26C66 26 72 38 72 52C72 66 62 76 50 76C38 76 28 66 28 52C28 38 34 26 50 26Z', { fill: '#1e140c' }),
    ellipse(41, 48, 4.5, 2.2, { fill: '#f3ead6' }),
    ellipse(59, 48, 4.5, 2.2, { fill: '#f3ead6' }),
    circle(41, 48, 1.4, { fill: '#1a1a1a' }),
    circle(59, 48, 1.4, { fill: '#1a1a1a' }),
    path('M34 43L46 45M66 43L54 45', { stroke: '#000', strokeWidth: 2.5 }),
    path('M28 56Q50 51 72 56L70 72Q50 82 30 72Z', { fill: '#9b2c24', ...stroke(2) }),
    path('M34 62Q50 66 66 62M38 68Q50 72 62 68', { fill: 'none', stroke: '#5a1410', strokeWidth: 1.6 }),
    path('M72 58L84 54L80 64Z', { fill: '#9b2c24', ...stroke(1.6) }),
    path('M22 30Q30 14 50 12', { fill: 'none', stroke: '#a07a54', strokeWidth: 2, opacity: 0.7 }),
  ].join('');
};

export const banditCaptain: SymbolFn = (doc) => {
  const skin = lin(doc, 'captainSkin', '#e0aa80', '#9a6a4a');
  const blade = lin(doc, 'captainBlade', '#f4f6fa', '#8a909a');
  return [
    path('M10 92Q38 52 88 12', { fill: 'none', stroke: OUT, strokeWidth: 7, strokeLinecap: 'round' }),
    path('M10 92Q38 52 88 12', { fill: 'none', stroke: blade, strokeWidth: 4, strokeLinecap: 'round' }),
    path('M90 92Q62 52 12 12', { fill: 'none', stroke: OUT, strokeWidth: 7, strokeLinecap: 'round' }),
    path('M90 92Q62 52 12 12', { fill: 'none', stroke: blade, strokeWidth: 4, strokeLinecap: 'round' }),
    circle(12, 90, 5, { fill: '#e9c063', ...stroke(1.5) }),
    circle(88, 90, 5, { fill: '#e9c063', ...stroke(1.5) }),
    ellipse(50, 58, 20, 24, { fill: skin, ...stroke(2.5) }),
    path('M30 46L72 60', { stroke: '#141414', strokeWidth: 2 }),
    ellipse(58, 54, 5.5, 4.5, { fill: '#141414' }),
    circle(42, 54, 2.5, { fill: '#1a1a1a' }),
    path('M40 49L46 48', { stroke: '#3a2412', strokeWidth: 2 }),
    path('M36 68Q44 62 50 66Q56 62 64 68Q56 69 50 70Q44 69 36 68Z', { fill: '#3a2412' }),
    path('M38 58l6 8', { stroke: '#9a4a3a', strokeWidth: 1.5 }),
    path('M30 40Q34 14 50 12Q66 14 70 40Z', { fill: '#2a1a2e', ...stroke(2.2) }),
    path('M12 42Q50 26 88 42Q76 48 50 46Q24 48 12 42Z', { fill: '#1e1222', ...stroke(2.2) }),
    path('M30 38Q50 32 70 38', { fill: 'none', stroke: '#e9c063', strokeWidth: 2.5 }),
    path('M66 22Q84 4 96 8Q86 14 70 28Z', { fill: '#c43d33', ...stroke(1.5) }),
  ].join('');
};

export const ogre: SymbolFn = (doc) => {
  const skin = lin(doc, 'ogreSkin', '#c8b47a', '#6a5a38');
  return [
    path('M72 98L82 99L99 22Q97 6 86 8Q77 12 79 24Z', { fill: '#7a5230', ...stroke(2.4) }),
    circle(88, 18, 2, { fill: '#3a2412' }),
    circle(85, 34, 2, { fill: '#3a2412' }),
    circle(13, 54, 6, { fill: skin, ...stroke(2) }),
    circle(87, 54, 6, { fill: skin, ...stroke(2) }),
    path('M50 14C76 14 88 34 86 56C84 78 70 92 50 92C30 92 16 78 14 56C12 34 24 14 50 14Z', { fill: skin, ...stroke(2.8) }),
    path('M30 40Q50 32 70 40', { fill: 'none', stroke: '#3a2a14', strokeWidth: 5, strokeLinecap: 'round' }),
    circle(40, 46, 3.2, { fill: '#1a1a1a' }),
    circle(60, 46, 3.2, { fill: '#1a1a1a' }),
    circle(41, 45, 1, { fill: '#fff' }),
    circle(61, 45, 1, { fill: '#fff' }),
    ellipse(50, 58, 9, 7, { fill: '#8a7448', ...stroke(1.6) }),
    path('M32 74Q50 68 68 74Q66 86 50 86Q34 86 32 74Z', { fill: '#2a1414', ...stroke(2) }),
    path('M38 76L40 64L43.5 76ZM62 76L60 64L56.5 76Z', { fill: '#f3ead6', ...stroke(1.2) }),
    circle(70, 66, 2.2, { fill: '#8a7448' }),
    circle(28, 62, 1.8, { fill: '#8a7448' }),
    path('M46 15Q48 8 50 14M54 15Q56 8 58 14', { fill: 'none', stroke: '#3a2a14', strokeWidth: 1.6 }),
  ].join('');
};

export const spider: SymbolFn = (doc) => {
  const body = rad(doc, 'spiderBody', '#5a4a6a', '#120c18');
  const legs: string[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bx = 50 + side * 8;
      const by = 36 + i * 5;
      const kx = 50 + side * (30 + i * 2);
      const ky = 18 + i * 14;
      const fx = 50 + side * 47;
      const fy = 8 + i * 26;
      legs.push(path(`M${bx} ${by}L${kx} ${ky}L${fx} ${fy}`, { fill: 'none', stroke: '#140e18', strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' }));
      legs.push(path(`M${bx} ${by}L${kx} ${ky}L${fx} ${fy}`, { fill: 'none', stroke: '#4a3a5a', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.8 }));
    }
  }
  return [
    ...legs,
    ellipse(50, 67, 21, 25, { fill: body, ...stroke(2.4) }),
    path('M43 56H57L50 65ZM43 78H57L50 69Z', { fill: '#c43d33' }),
    ellipse(50, 38, 13, 11, { fill: body, ...stroke(2.2) }),
    circle(46, 33, 2.6, { fill: '#ff3a2a' }),
    circle(54, 33, 2.6, { fill: '#ff3a2a' }),
    circle(42.5, 36, 1.8, { fill: '#ff3a2a' }),
    circle(57.5, 36, 1.8, { fill: '#ff3a2a' }),
    circle(48, 29.5, 1.4, { fill: '#ff6a4a' }),
    circle(52, 29.5, 1.4, { fill: '#ff6a4a' }),
    path('M46 47Q43 53 47 55M54 47Q57 53 53 55', { fill: 'none', stroke: '#e8dcc0', strokeWidth: 2.2, strokeLinecap: 'round' }),
    circle(44, 60, 4, { fill: '#ffffff', opacity: 0.08 }),
  ].join('');
};

export const fireElemental: SymbolFn = (doc) => {
  const outer = doc.def('elemOuter', radialGradient('elemOuter', [[0, '#fff3c0'], [0.45, '#ffb030'], [0.8, '#ff5a10'], [1, '#a01a05']], { cx: 0.5, cy: 0.75, r: 0.8 }));
  const inner = doc.def('elemInner', radialGradient('elemInner', [[0, '#ffffff'], [0.6, '#fff3a0'], [1, '#ffc040']], { cx: 0.5, cy: 0.7, r: 0.8 }));
  return [
    circle(50, 55, 46, { fill: glowFill(doc, 'elemGlow', '#ff8a2a') }),
    path('M50 4C58 20 72 24 74 42C82 34 82 26 80 20C92 34 94 58 84 72C78 84 64 96 50 96C36 96 22 84 16 72C6 58 8 34 20 20C18 26 18 34 26 42C28 24 42 20 50 4Z', { fill: outer, ...stroke(2.4, '#5a1004') }),
    path('M50 30C56 40 64 44 64 56C68 52 68 48 67 44C74 52 74 66 68 74C64 82 58 88 50 88C42 88 36 82 32 74C26 66 26 52 33 44C32 48 32 52 36 56C36 44 46 40 50 30Z', { fill: inner }),
    path('M33 52L46 57L33 60Z', { fill: '#3a0a00' }),
    path('M67 52L54 57L67 60Z', { fill: '#3a0a00' }),
    path('M40 70Q50 79 60 70Q50 74 40 70Z', { fill: '#3a0a00' }),
    circle(20, 30, 2, { fill: '#ffcf5a' }),
    circle(84, 16, 1.8, { fill: '#ffcf5a' }),
    circle(88, 44, 1.5, { fill: '#ffcf5a' }),
  ].join('');
};

export const lich: SymbolFn = (doc) => {
  const robe = lin(doc, 'lichRobe', '#3a1a4e', '#0a0410');
  const boneFill = lin(doc, 'lichBone', '#e2ead2', '#8a9a80');
  const gold = lin(doc, 'lichGold', '#ffe68a', '#a8741a');
  return [
    circle(50, 50, 50, { fill: glowFill(doc, 'lichAura', '#7fffd4') }),
    path('M50 6C78 8 90 34 88 60L94 98H6L12 60C10 34 22 8 50 6Z', { fill: robe, ...stroke(2.6) }),
    path('M50 28C64 28 70 40 70 52C70 62 64 68 60 70L60 78Q50 84 40 78L40 70C36 68 30 62 30 52C30 40 36 28 50 28Z', { fill: boneFill, ...stroke(2.2) }),
    ellipse(42, 51, 6, 7, { fill: '#0a0a0a' }),
    ellipse(58, 51, 6, 7, { fill: '#0a0a0a' }),
    circle(42, 52, 5, { fill: glowFill(doc, 'lichEye', '#7fffd4') }),
    circle(58, 52, 5, { fill: 'url(#lichEye)' }),
    circle(42, 52, 2.2, { fill: '#d8fff2' }),
    circle(58, 52, 2.2, { fill: '#d8fff2' }),
    path('M50 58L47 64H53Z', { fill: '#0a0a0a' }),
    path('M43 70V76M47 71V78M50 71V78M53 71V78M57 70V76', { stroke: '#2a2a2a', strokeWidth: 1.4 }),
    path('M30 32L34 14L40 24L45 8L50 22L55 8L60 24L66 14L70 32Q50 26 30 32Z', { fill: gold, ...stroke(2) }),
    circle(50, 26, 2.6, { fill: '#a35cff' }),
    circle(40, 28, 1.8, { fill: '#5fd07a' }),
    circle(60, 28, 1.8, { fill: '#5fd07a' }),
    path('M20 90Q30 80 26 70M80 90Q70 80 74 70', { fill: 'none', stroke: '#7fffd4', strokeWidth: 1.5, opacity: 0.6 }),
  ].join('');
};

export const rat: SymbolFn = (doc) => {
  const fur = lin(doc, 'ratFur', '#9a8a7a', '#4a3e34');
  return [
    path('M96 76Q100 96 80 96Q66 96 62 88', { fill: 'none', stroke: '#d88a9a', strokeWidth: 3.5, strokeLinecap: 'round' }),
    ellipse(70, 72, 28, 20, { fill: fur, ...stroke(2.2) }),
    path('M10 58C14 50 26 40 42 38C56 36 66 44 70 56C72 66 64 74 50 74C34 74 18 68 10 58Z', { fill: fur, ...stroke(2.6) }),
    circle(58, 36, 14, { fill: fur, ...stroke(2.2) }),
    circle(58, 36, 9, { fill: '#d88a9a' }),
    circle(10, 58, 4.5, { fill: '#e88a9a', ...stroke(1.4) }),
    circle(36, 50, 4.2, { fill: '#ff3a2a', ...stroke(1.2) }),
    circle(35, 49, 1.3, { fill: '#fff' }),
    path('M14 58L0 50M14 59L0 59M14 60L2 68', { stroke: '#e8dcc0', strokeWidth: 1.2 }),
    rect(14, 62, 4, 6, { fill: '#f3e6a0', ...stroke(1) }),
    path('M40 70Q50 66 60 70', { fill: 'none', stroke: '#2a221a', strokeWidth: 1.4, opacity: 0.6 }),
  ].join('');
};

export const tankard: SymbolFn = (doc) => {
  const wood = lin(doc, 'tankWood', '#c88a4a', '#6a4220', true);
  return [
    path('M70 38C94 38 94 76 70 76L70 67C83 67 83 47 70 47Z', { fill: '#7a4a22', ...stroke(2.2) }),
    rect(24, 32, 48, 60, { rx: 6, fill: wood, ...stroke(2.6) }),
    path('M36 34V90M48 34V90M60 34V90', { stroke: '#5a3418', strokeWidth: 1.5, opacity: 0.7 }),
    rect(22, 42, 52, 6, { fill: '#a8acb4', ...stroke(1.5) }),
    rect(22, 78, 52, 6, { fill: '#a8acb4', ...stroke(1.5) }),
    path('M20 36C18 24 30 18 36 22C40 12 56 12 60 20C70 16 80 24 76 34C74 40 66 38 64 36L64 46C64 52 58 52 58 46L58 38C50 40 30 40 20 36Z', { fill: '#fbf6ea', ...stroke(2.2) }),
    circle(32, 28, 3, { fill: '#ffffff' }),
    circle(54, 22, 2.4, { fill: '#ffffff' }),
    path('M30 52v18', { stroke: '#ffffff', strokeWidth: 3, opacity: 0.35, strokeLinecap: 'round' }),
  ].join('');
};

export const anvil: SymbolFn = (doc) => {
  const metal = lin(doc, 'anvilMetal', '#7a7a86', '#22222a');
  return [
    path('M14 54L70 54C80 54 90 50 96 44L96 52C90 60 82 64 74 64L66 64L62 72L72 84L28 84L38 72L34 64L24 64C18 64 14 60 14 54Z', { fill: metal, ...stroke(2.6) }),
    path('M18 55H70', { stroke: '#c8ccd4', strokeWidth: 2, opacity: 0.8 }),
    rect(24, 84, 52, 10, { fill: '#3a3a42', ...stroke(2.2) }),
    g({ transform: 'rotate(-38 50 30)' }, [rect(47, 22, 6, 40, { fill: '#7a5230', ...stroke(1.8) }), rect(34, 10, 32, 14, { rx: 2, fill: metal, ...stroke(2) })]),
    path('M48 46L44 36M52 46L58 34M50 46L50 32M46 47L36 40M54 47L64 42', { stroke: '#ffcf5a', strokeWidth: 2, strokeLinecap: 'round' }),
    circle(50, 48, 4, { fill: glowFill(doc, 'sparkGlow', '#ff9a3c') }),
  ].join('');
};

export const elder: SymbolFn = (doc) => {
  const robe = lin(doc, 'elderRobe', '#4f6080', '#1a243a');
  const skin = lin(doc, 'elderSkin', '#e8c098', '#a07a5a');
  const beard = lin(doc, 'elderBeard', '#ffffff', '#b8b8c4');
  return [
    line(86, 98, 86, 14, { stroke: '#6a4626', strokeWidth: 5, strokeLinecap: 'round' }),
    circle(86, 12, 9, { fill: glowFill(doc, 'elderOrb', '#7fd6ff') }),
    circle(86, 12, 4.5, { fill: '#d8f6ff', ...stroke(1.4) }),
    path('M50 6C76 6 88 30 86 56L90 98H10L14 56C12 30 24 6 50 6Z', { fill: robe, ...stroke(2.6) }),
    ellipse(50, 46, 18, 20, { fill: skin, ...stroke(2) }),
    path('M34 38Q40 31 47 37M53 37Q60 31 66 38', { fill: 'none', stroke: '#ffffff', strokeWidth: 3.5, strokeLinecap: 'round' }),
    path('M38 44Q42 47 46 44M54 44Q58 47 62 44', { fill: 'none', ...stroke(1.8) }),
    path('M50 44Q54 52 50 56', { fill: 'none', ...stroke(1.6) }),
    path('M32 52C30 70 38 90 50 99C62 90 70 70 68 52C62 60 56 62 50 60C44 62 38 60 32 52Z', { fill: beard, ...stroke(2) }),
    path('M38 58Q50 52 62 58Q50 61 38 58Z', { fill: '#ffffff', ...stroke(1.2) }),
    path('M44 66Q46 80 50 92M56 66Q55 80 52 90M40 64Q40 74 44 84', { fill: 'none', stroke: '#9a9aa8', strokeWidth: 1.2 }),
  ].join('');
};

export const guard: SymbolFn = (doc) => {
  const shield = lin(doc, 'guardShield', '#3f74b8', '#163262');
  const steel = lin(doc, 'guardSteel', '#e8ecf2', '#7a808a');
  const spear = (flip: boolean): string =>
    g({ transform: flip ? 'translate(100 0) scale(-1 1)' : '' }, [line(14, 94, 82, 12, { stroke: '#6a4626', strokeWidth: 4.5, strokeLinecap: 'round' }), path('M82 12L94 2L88 18Z', { fill: steel, ...stroke(1.8) })]);
  return [
    spear(false),
    spear(true),
    path('M20 20H80V50C80 72 66 86 50 95C34 86 20 72 20 50Z', { fill: shield, ...stroke(2.8) }),
    path('M25 25H75V50C75 69 63 81 50 89C37 81 25 69 25 50Z', { fill: 'none', stroke: '#e9c063', strokeWidth: 2.5 }),
    path('M41 44H59V74H41ZM39 38H45V44H39ZM47 38H53V44H47ZM55 38H61V44H55Z', { fill: '#e9c063', ...stroke(1.5) }),
    path('M46 74V64Q50 58 54 64V74Z', { fill: '#163262' }),
    rect(48, 50, 4, 6, { fill: '#163262' }),
  ].join('');
};

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

export const dwarfWarrior: SymbolFn = (doc) => {
  const steel = lin(doc, 'dwarfSteel', '#eef0f4', '#6a707a');
  const beard = lin(doc, 'dwarfBeard', '#d8783a', '#7a3a14');
  const skin = lin(doc, 'dwarfSkin', '#e8b890', '#a87a5a');
  return [
    path('M24 36C10 32 4 20 8 4C14 16 20 22 30 26Z', { fill: '#f3ead6', ...stroke(2) }),
    path('M76 36C90 32 96 20 92 4C86 16 80 22 70 26Z', { fill: '#f3ead6', ...stroke(2) }),
    ellipse(50, 56, 21, 15, { fill: skin, ...stroke(2) }),
    path('M22 46C22 24 34 12 50 12C66 12 78 24 78 46Z', { fill: steel, ...stroke(2.6) }),
    rect(20, 40, 60, 8, { fill: '#b8743a', ...stroke(2) }),
    path('M47 40H53V62H47Z', { fill: steel, ...stroke(1.8) }),
    circle(30, 44, 1.6, { fill: OUT }),
    circle(70, 44, 1.6, { fill: OUT }),
    circle(41, 54, 2.4, { fill: '#1a1a1a' }),
    circle(59, 54, 2.4, { fill: '#1a1a1a' }),
    path('M28 56C26 74 34 92 50 98C66 92 74 74 72 56C66 64 58 66 50 66C42 66 34 64 28 56Z', { fill: beard, ...stroke(2.4) }),
    path('M36 62Q50 56 64 62Q58 68 50 66Q42 68 36 62Z', { fill: '#a8501e', ...stroke(1.6) }),
    path('M44 70V90M56 70V90M50 68V94', { fill: 'none', stroke: '#7a3a14', strokeWidth: 1.6 }),
    circle(44, 86, 3, { fill: '#e9c063', ...stroke(1.2) }),
    circle(56, 86, 3, { fill: '#e9c063', ...stroke(1.2) }),
    path('M30 22Q40 16 50 15', { fill: 'none', stroke: '#ffffff', strokeWidth: 2.5, opacity: 0.6 }),
  ].join('');
};

export const tieflingWarlock: SymbolFn = (doc) => {
  const cloak = lin(doc, 'warlockCloak', '#4a1f5e', '#120818');
  const skin = lin(doc, 'warlockSkin', '#d8607a', '#7a2a3e');
  return [
    circle(50, 50, 48, { fill: glowFill(doc, 'warlockAura', '#a98bff') }),
    path('M50 14C76 14 88 36 86 60L92 98H8L14 60C12 36 24 14 50 14Z', { fill: cloak, ...stroke(2.6) }),
    ellipse(50, 52, 17, 21, { fill: skin, ...stroke(2) }),
    path('M38 34C30 18 16 12 8 20C16 18 24 22 30 38Z', { fill: '#3a2a3a', ...stroke(2) }),
    path('M62 34C70 18 84 12 92 20C84 18 76 22 70 38Z', { fill: '#3a2a3a', ...stroke(2) }),
    path('M36 46L46 49M64 46L54 49', { stroke: '#2a0a14', strokeWidth: 2.5, strokeLinecap: 'round' }),
    ellipse(43, 52, 4.5, 2.6, { fill: '#ffe680' }),
    ellipse(57, 52, 4.5, 2.6, { fill: '#ffe680' }),
    circle(43, 52, 6, { fill: glowFill(doc, 'warlockEye', '#ffe680'), opacity: 0.8 }),
    circle(57, 52, 6, { fill: 'url(#warlockEye)', opacity: 0.8 }),
    path('M43 64Q50 67 57 63', { fill: 'none', ...stroke(1.8) }),
    path('M50 74L39 92H61Z', { fill: 'none', stroke: '#a98bff', strokeWidth: 2.4 }),
    ellipse(50, 86, 5, 3, { fill: 'none', stroke: '#a98bff', strokeWidth: 1.8 }),
    circle(50, 86, 1.6, { fill: '#e8dcff' }),
  ].join('');
};

export const elfWizard: SymbolFn = (doc) => {
  const wood = lin(doc, 'wizStaff', '#9a6a3a', '#4a2a12');
  const star = (x: number, y: number, r: number): string => path(`M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`, { fill: '#f3e6a0' });
  return [
    path('M42 10C22 12 10 30 14 46C18 62 36 70 50 60C36 60 26 50 28 36C30 24 34 16 42 10Z', { fill: '#e8ecf4', ...stroke(2) }),
    star(80, 30, 6),
    star(88, 62, 4),
    star(16, 78, 5),
    star(60, 88, 3.5),
    star(30, 60, 3),
    line(26, 98, 70, 18, { stroke: OUT, strokeWidth: 8, strokeLinecap: 'round' }),
    line(26, 98, 70, 18, { stroke: wood, strokeWidth: 5, strokeLinecap: 'round' }),
    path('M62 28Q56 14 66 6M76 30Q86 22 82 10', { fill: 'none', stroke: '#e9c063', strokeWidth: 3, strokeLinecap: 'round' }),
    circle(72, 14, 16, { fill: glowFill(doc, 'wizGlow', '#8ab4ff') }),
    path('M72 2L80 14L72 26L64 14Z', { fill: '#d8ecff', ...stroke(2) }),
    path('M72 2L72 26M64 14H80', { stroke: '#8ab4ff', strokeWidth: 1.2 }),
    path('M40 58Q30 50 36 40Q44 34 50 42', { fill: 'none', stroke: '#a98bff', strokeWidth: 2, opacity: 0.8 }),
    circle(52, 44, 2, { fill: '#a98bff' }),
  ].join('');
};

export const bardLute: SymbolFn = (doc) => {
  const wood = rad(doc, 'luteWood', '#e8a050', '#7a4220');
  const note = (x: number, y: number): string => [ellipse(x, y, 4.5, 3.5, { fill: '#e9c063', ...stroke(1.2), transform: `rotate(-20 ${x} ${y})` }), line(x + 4, y - 1, x + 4, y - 16, { stroke: OUT, strokeWidth: 2 }), path(`M${x + 4} ${y - 16}q6 3 6 9`, { fill: 'none', stroke: OUT, strokeWidth: 2 })].join('');
  return [
    note(16, 34),
    note(84, 26),
    note(78, 84),
    g({ transform: 'rotate(-35 50 56)' }, [
      rect(46, 8, 8, 44, { fill: '#5a3418', ...stroke(2) }),
      path('M45 10L38 0L52 -2L55 10Z', { fill: '#5a3418', ...stroke(1.8) }),
      path('M50 48C30 48 22 66 26 80C30 94 44 98 50 98C56 98 70 94 74 80C78 66 70 48 50 48Z', { fill: wood, ...stroke(2.6) }),
      circle(50, 72, 8, { fill: '#2a1408', stroke: '#e9c063', strokeWidth: 2 }),
      rect(41, 86, 18, 4, { fill: '#3a1a08' }),
      path('M48 4V88M50 4V88M52 4V88', { stroke: '#f3ead6', strokeWidth: 0.8, opacity: 0.9 }),
    ]),
  ].join('');
};

export const rogueDaggers: SymbolFn = (doc) => {
  const hood = lin(doc, 'rogueHood', '#3f4a3a', '#0c120c');
  const blade = lin(doc, 'rogueBlade', '#f4f6fa', '#8a909a');
  const dagger = (rot: number): string =>
    g({ transform: `rotate(${rot} 50 72)` }, [path('M50 34L55 42L55 68H45L45 42Z', { fill: blade, ...stroke(2) }), rect(40, 68, 20, 5, { rx: 2, fill: '#e9c063', ...stroke(1.6) }), rect(47, 73, 6, 14, { fill: '#3a2412', ...stroke(1.4) }), circle(50, 89, 3.5, { fill: '#e9c063', ...stroke(1.2) })]);
  return [
    path('M50 8C74 8 84 28 82 50C80 68 66 78 50 80C34 78 20 68 18 50C16 28 26 8 50 8Z', { fill: hood, ...stroke(2.6) }),
    ellipse(50, 48, 18, 20, { fill: '#0a0a0a' }),
    path('M37 46L46 48L37 50ZM63 46L54 48L63 50Z', { fill: '#e8f0d8' }),
    path('M44 60Q50 63 56 59', { fill: 'none', stroke: '#5a5a5a', strokeWidth: 1.4 }),
    path('M24 64Q50 74 76 64L72 78Q50 86 28 78Z', { fill: '#4a5a3a', ...stroke(2) }),
    dagger(-40),
    dagger(40),
  ].join('');
};

export const clericSun: SymbolFn = (doc) => {
  const gold = rad(doc, 'clericGold', '#fff6c8', '#d4a63f', 0.45, 0.4);
  const rays: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 2 === 0 ? 46 : 36;
    const w = 0.16;
    const p1 = `${50 + Math.cos(a - w) * 24} ${50 + Math.sin(a - w) * 24}`;
    const p2 = `${50 + Math.cos(a) * len} ${50 + Math.sin(a) * len}`;
    const p3 = `${50 + Math.cos(a + w) * 24} ${50 + Math.sin(a + w) * 24}`;
    rays.push(path(`M${p1}L${p2}L${p3}Z`, { fill: '#f3d58a', ...stroke(1.8) }));
  }
  return [
    circle(50, 50, 48, { fill: glowFill(doc, 'clericGlow', '#ffe680') }),
    ...rays,
    circle(50, 50, 25, { fill: gold, ...stroke(2.6) }),
    circle(50, 50, 19, { fill: 'none', stroke: '#b0852b', strokeWidth: 2 }),
    path('M50 36V64M40 46H60', { stroke: '#ffffff', strokeWidth: 6, strokeLinecap: 'round' }),
    path('M50 36V64M40 46H60', { stroke: '#d4a63f', strokeWidth: 2.4, strokeLinecap: 'round' }),
  ].join('');
};

export const barbarianAxe: SymbolFn = (doc) => {
  const steel = lin(doc, 'barbSteel', '#f0f2f6', '#6a707a');
  return [
    path('M14 30L40 92M28 22L54 86M42 16L66 78', { stroke: '#c43d33', strokeWidth: 5, strokeLinecap: 'round', opacity: 0.75 }),
    g({ transform: 'rotate(28 50 54)' }, [
      rect(46, 12, 8, 88, { rx: 3, fill: '#6a4626', ...stroke(2.2) }),
      path('M46 60H54M46 66H54M46 72H54', { stroke: '#2a1a0e', strokeWidth: 2 }),
      path('M46 16C28 8 14 18 12 38C18 33 32 35 46 44Z', { fill: steel, ...stroke(2.4) }),
      path('M54 16C72 8 86 18 88 38C82 33 68 35 54 44Z', { fill: steel, ...stroke(2.4) }),
      path('M16 34C24 28 34 30 44 36M84 34C76 28 66 30 56 36', { fill: 'none', stroke: '#ffffff', strokeWidth: 1.5, opacity: 0.7 }),
      rect(44, 18, 12, 28, { rx: 2, fill: '#4a4e56', ...stroke(1.8) }),
      circle(50, 8, 5, { fill: '#e9c063', ...stroke(1.6) }),
    ]),
  ].join('');
};
