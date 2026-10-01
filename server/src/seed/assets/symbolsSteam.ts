import { BRASS, COPPER, IRON, gearD, gearWithHoleD, metalLinear, metalRadial, rivetLine, rivetRing, tubeGradient } from './steamKit';
import { OUT, glowFill, lin, rad, stroke, type SymbolFn } from './symbolsCreatures';
import { circle, ellipse, g, line, path, rect, type SvgDoc } from './svg';

/**
 * Steampunk portrait emblems ("Los Cielos de Latón"): constructs, sky pirates, NPCs and heroes.
 * Same contract as symbolsCreatures: 100 x 100 box, gradients registered on the document.
 */

function steamPuff(x: number, y: number, s: number, opacity = 0.75): string {
  return [
    circle(x, y, s, { fill: '#eef2f4', opacity }),
    circle(x + s * 0.9, y - s * 0.4, s * 0.8, { fill: '#eef2f4', opacity: opacity * 0.9 }),
    circle(x + s * 1.7, y - s * 1.1, s * 0.6, { fill: '#eef2f4', opacity: opacity * 0.7 }),
  ].join('');
}

function goggles(doc: SvgDoc, cx: number, cy: number, r: number, lens: [string, string], id: string, strap = '#5a3418'): string {
  const lensFill = rad(doc, id, lens[0], lens[1], 0.35, 0.3);
  const rim = metalLinear(doc, `${id}Rim`, BRASS);
  const gap = r * 2.3;
  return [
    path(`M${cx - gap - r * 1.6} ${cy + 2}Q${cx - gap} ${cy - r * 0.6} ${cx - gap * 0.5} ${cy}M${cx + gap * 0.5} ${cy}Q${cx + gap} ${cy - r * 0.6} ${cx + gap + r * 1.6} ${cy + 2}`, { fill: 'none', stroke: strap, strokeWidth: r * 0.55, strokeLinecap: 'round' }),
    rect(cx - r * 0.5, cy - r * 0.18, r, r * 0.36, { fill: rim, ...stroke(1) }),
    circle(cx - gap * 0.5, cy, r, { fill: rim, ...stroke(1.8) }),
    circle(cx + gap * 0.5, cy, r, { fill: rim, ...stroke(1.8) }),
    circle(cx - gap * 0.5, cy, r * 0.72, { fill: lensFill, ...stroke(1.2) }),
    circle(cx + gap * 0.5, cy, r * 0.72, { fill: lensFill, ...stroke(1.2) }),
    ellipse(cx - gap * 0.5 - r * 0.25, cy - r * 0.28, r * 0.24, r * 0.14, { fill: '#ffffff', opacity: 0.75 }),
    ellipse(cx + gap * 0.5 - r * 0.25, cy - r * 0.28, r * 0.24, r * 0.14, { fill: '#ffffff', opacity: 0.75 }),
  ].join('');
}


// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

export const automatonGuard: SymbolFn = (doc) => {
  const brass = metalLinear(doc, 'autoBrass', BRASS);
  const iron = metalLinear(doc, 'autoIron', IRON);
  return [
    circle(50, 44, 46, { fill: glowFill(doc, 'autoAura', '#5fd8ff'), opacity: 0.55 }),
    path('M8 100Q10 84 30 81H70Q90 84 92 100Z', { fill: iron, ...stroke(2.4) }),
    path(gearD(50, 93, 10, 3, 10), { fill: brass, ...stroke(1.4) }),
    circle(50, 93, 3, { fill: OUT }),
    rect(31, 72, 9, 14, { fill: lin(doc, 'autoPiston', '#d8dde4', '#4a4f58', true), ...stroke(1.6) }),
    rect(60, 72, 9, 14, { fill: 'url(#autoPiston)', ...stroke(1.6) }),
    path('M43 1L50 -4L57 1L55 10H45Z', { fill: lin(doc, 'autoCrest', '#ff9a6a', '#8a2a10'), ...stroke(1.6) }),
    path('M24 32Q24 7 50 7Q76 7 76 32V60Q76 74 63 78H37Q24 74 24 60Z', { fill: brass, ...stroke(2.8) }),
    path('M50 8V30', { stroke: '#7a5a1a', strokeWidth: 2, opacity: 0.6 }),
    path('M30 20Q50 12 70 20', { fill: 'none', stroke: '#fff3c0', strokeWidth: 2, opacity: 0.55, strokeLinecap: 'round' }),
    rect(29, 36, 42, 12, { rx: 6, fill: '#0c1418', ...stroke(1.8) }),
    rect(32, 39, 36, 6, { rx: 3, fill: glowFill(doc, 'autoVisor', '#7fe8ff'), opacity: 0.9 }),
    ellipse(40, 42, 4.5, 2.4, { fill: '#c8f6ff' }),
    ellipse(60, 42, 4.5, 2.4, { fill: '#c8f6ff' }),
    rect(36, 58, 28, 14, { rx: 3, fill: '#2a2018', ...stroke(1.6) }),
    path('M40 61V69M45 61V69M50 61V69M55 61V69M60 61V69', { stroke: '#b8943a', strokeWidth: 1.8 }),
    circle(21, 44, 6, { fill: metalRadial(doc, 'autoBolt', COPPER), ...stroke(1.6) }),
    circle(79, 44, 6, { fill: 'url(#autoBolt)', ...stroke(1.6) }),
    rivetLine(30, 28, 30, 62, 5, 1.4, '#f6dc8e'),
    rivetLine(70, 28, 70, 62, 5, 1.4, '#f6dc8e'),
  ].join('');
};

export const skyPirate: SymbolFn = (doc) => {
  const skin = lin(doc, 'pirateSkin', '#f0c098', '#a86a44');
  const leather = lin(doc, 'pirateCap', '#8a5a34', '#3a2210');
  return [
    path('M14 100Q16 82 34 78L50 86L66 78Q84 82 86 100Z', { fill: lin(doc, 'pirateCoat', '#5a3a2a', '#1e140c'), ...stroke(2.2) }),
    path('M34 78L50 92L66 78L60 74H40Z', { fill: lin(doc, 'pirateScarf', '#e0402a', '#8a1a10'), ...stroke(1.8) }),
    path('M28 46Q28 76 50 80Q72 76 72 46Q72 22 50 22Q28 22 28 46Z', { fill: skin, ...stroke(2.6) }),
    path('M24 46Q20 64 30 70L32 48Z', { fill: leather, ...stroke(1.8) }),
    path('M76 46Q80 64 70 70L68 48Z', { fill: leather, ...stroke(1.8) }),
    path('M24 44Q22 12 50 12Q78 12 76 44Q66 34 50 34Q34 34 24 44Z', { fill: leather, ...stroke(2.4) }),
    goggles(doc, 50, 30, 8.5, ['#bfe8ff', '#2a5a7a'], 'pirateLens'),
    path('M36 48Q40 45 44 48M56 48Q60 45 64 48', { fill: 'none', ...stroke(2) }),
    circle(40, 52, 2.4, { fill: OUT }),
    circle(60, 52, 2.4, { fill: OUT }),
    path('M50 52Q53 60 49 64', { fill: 'none', ...stroke(1.6) }),
    path('M39 68Q50 75 62 67', { fill: 'none', ...stroke(2.2) }),
    rect(53, 68, 4, 4, { fill: '#e9c063', ...stroke(0.8) }),
    path('M60 40L70 58', { stroke: '#8a3a2a', strokeWidth: 1.8, opacity: 0.85 }),
    path('M64 44L67 43M65 50L68 49M67 55L70 54', { stroke: '#8a3a2a', strokeWidth: 1.2 }),
    ...Array.from({ length: 14 }, (_, i) => circle(38 + (i % 7) * 4 + (i > 6 ? 2 : 0), 72 + Math.floor(i / 7) * 3, 0.7, { fill: '#5a3a24', opacity: 0.6 })),
    circle(28, 60, 2.6, { fill: 'none', stroke: '#e9c063', strokeWidth: 1.6 }),
  ].join('');
};

export const crowCaptain: SymbolFn = (doc) => {
  const skin = lin(doc, 'crowSkin', '#f6d0b0', '#b07a5a');
  const hat = lin(doc, 'crowHat', '#3a2a30', '#0c080a');
  return [
    path('M12 100Q14 80 32 76L50 90L68 76Q86 80 88 100Z', { fill: lin(doc, 'crowCoat', '#d02a2a', '#5a0a0a'), ...stroke(2.2) }),
    path('M40 78L50 90L60 78', { fill: '#f3ead6', ...stroke(1.6) }),
    circle(36, 92, 2.4, { fill: '#e9c063', ...stroke(0.8) }),
    circle(64, 92, 2.4, { fill: '#e9c063', ...stroke(0.8) }),
    path('M22 50Q16 78 30 84L34 50ZM78 50Q84 78 70 84L66 50Z', { fill: '#1a1214', ...stroke(1.6) }),
    path('M30 48Q30 76 50 79Q70 76 70 48Q70 26 50 26Q30 26 30 48Z', { fill: skin, ...stroke(2.4) }),
    path('M30 46Q36 30 52 30Q64 30 70 44Q60 36 46 38Q36 40 30 46Z', { fill: '#1a1214' }),
    path('M66 24Q74 2 92 0Q82 8 80 18Q90 14 96 16Q84 22 74 30Z', { fill: lin(doc, 'crowFeather', '#ff4a3a', '#1a0606'), ...stroke(1.6) }),
    path('M4 32Q20 30 26 18Q50 26 74 18Q80 30 96 32Q88 40 74 36Q50 44 26 36Q12 40 4 32Z', { fill: hat, ...stroke(2.4) }),
    path('M8 33Q22 32 27 21M92 33Q78 32 73 21', { fill: 'none', stroke: '#d02a2a', strokeWidth: 2 }),
    path('M26 22Q50 8 74 22L72 32Q50 26 28 32Z', { fill: hat, ...stroke(2) }),
    circle(50, 22, 3.2, { fill: '#e9c063', ...stroke(1) }),
    path('M37 52Q41 49 45 52', { fill: 'none', ...stroke(1.8) }),
    circle(41, 55, 2.3, { fill: OUT }),
    circle(60, 55, 7, { fill: glowFill(doc, 'crowLensGlow', '#ff3a2a'), opacity: 0.9 }),
    circle(60, 55, 6, { fill: 'none', stroke: metalLinear(doc, 'crowMonocle', BRASS), strokeWidth: 3 }),
    circle(60, 55, 3.6, { fill: '#ff5a3a', opacity: 0.85 }),
    path('M66 58Q72 70 70 80', { fill: 'none', stroke: '#e9c063', strokeWidth: 1.2 }),
    path('M50 56Q52 62 49 65', { fill: 'none', ...stroke(1.4) }),
    path('M42 70Q50 74 58 69Q50 72 42 70Z', { fill: '#b81a2a', ...stroke(1.4) }),
  ].join('');
};

export const steamGolem: SymbolFn = (doc) => {
  const iron = metalLinear(doc, 'golemIron', { light: '#9aa0a8', base: '#4e535a', dark: '#1c1e22' }, true);
  const fire = glowFill(doc, 'golemFire', '#ff8a2a');
  return [
    steamPuff(52, 6, 6),
    rect(40, 4, 16, 22, { fill: tubeGradient(doc, 'golemStack', IRON, true), ...stroke(2) }),
    rect(37, 2, 22, 5, { rx: 1.5, fill: '#2a2c30', ...stroke(1.4) }),
    rect(4, 46, 16, 30, { rx: 6, fill: iron, ...stroke(2) }),
    rect(80, 46, 16, 30, { rx: 6, fill: iron, ...stroke(2) }),
    rect(14, 24, 72, 72, { rx: 24, fill: iron, ...stroke(2.8) }),
    rect(14, 40, 72, 6, { fill: '#2a2c30', opacity: 0.7 }),
    rect(14, 78, 72, 6, { fill: '#2a2c30', opacity: 0.7 }),
    rivetLine(20, 43, 80, 43, 9, 1.5, '#c9ced6'),
    rivetLine(20, 81, 80, 81, 9, 1.5, '#c9ced6'),
    rect(26, 50, 18, 10, { rx: 2, fill: '#1a0a04', ...stroke(1.6) }),
    rect(56, 50, 18, 10, { rx: 2, fill: '#1a0a04', ...stroke(1.6) }),
    ellipse(35, 55, 12, 8, { fill: fire }),
    ellipse(65, 55, 12, 8, { fill: fire }),
    rect(28, 52, 14, 6, { fill: '#ffb040', opacity: 0.95 }),
    rect(58, 52, 14, 6, { fill: '#ffb040', opacity: 0.95 }),
    rect(30, 64, 40, 13, { rx: 3, fill: '#140804', ...stroke(1.8) }),
    rect(32, 66, 36, 9, { fill: fire, opacity: 0.9 }),
    path('M36 64V77M42 64V77M48 64V77M54 64V77M60 64V77M66 64V77', { stroke: '#2a2c30', strokeWidth: 2.4 }),
    circle(78, 30, 8, { fill: '#f3ead6', ...stroke(1.8) }),
    path('M78 30L82 25', { stroke: '#c0392b', strokeWidth: 1.8, strokeLinecap: 'round' }),
    circle(78, 30, 1.6, { fill: OUT }),
    path('M24 30Q50 22 76 30', { fill: 'none', stroke: '#ffffff', strokeWidth: 2, opacity: 0.25 }),
  ].join('');
};

export const brassDragon: SymbolFn = (doc) => {
  const plate = lin(doc, 'bdPlate', '#ffe08a', '#7a4e10');
  const pipe = tubeGradient(doc, 'bdPipe', COPPER);
  return [
    circle(70, 62, 34, { fill: glowFill(doc, 'bdFurnace', '#ff7a1a'), opacity: 0.55 }),
    path('M38 36C30 22 18 16 6 15', { fill: 'none', stroke: pipe, strokeWidth: 7, strokeLinecap: 'round' }),
    path('M50 33C48 20 42 10 32 4', { fill: 'none', stroke: pipe, strokeWidth: 6, strokeLinecap: 'round' }),
    circle(6, 15, 4, { fill: '#2a1408', ...stroke(1.4) }),
    circle(32, 4, 3.4, { fill: '#2a1408', ...stroke(1.4) }),
    path('M20 60L6 62L16 69ZM14 74L1 78L12 83ZM11 88L0 94L10 97Z', { fill: '#8a5a1a', ...stroke(1.5) }),
    path('M8 98C10 80 14 68 20 60C24 46 34 36 48 33L66 34C78 35 88 40 94 47L93 53C86 56 76 57 68 57L60 58C68 63 76 67 84 69L80 74C66 76 52 76 42 80C34 84 30 92 28 98Z', { fill: plate, ...stroke(2.8) }),
    path('M46 36L44 56M58 34L56 57M28 54Q34 60 40 76M68 57L64 72', { fill: 'none', stroke: '#7a4e10', strokeWidth: 1.4, opacity: 0.8 }),
    rivetLine(49, 39, 47, 54, 4, 1.1, '#fff3c0'),
    rivetLine(61, 38, 60, 54, 4, 1.1, '#fff3c0'),
    path('M60 58C68 63 76 67 84 69L80 74C70 75 62 72 56 66Z', { fill: '#ff9a2a', opacity: 0.85 }),
    path('M84 68Q96 62 100 70Q94 71 98 79Q88 75 84 68Z', { fill: '#ffd060', opacity: 0.95 }),
    path(gearWithHoleD(36, 66, 11, 3, 10, 3.5), { fill: metalLinear(doc, 'bdGear', COPPER), fillRule: 'evenodd', ...stroke(1.4) }),
    path('M52 39Q62 33 73 40', { fill: 'none', stroke: '#3a1a04', strokeWidth: 3.5, strokeLinecap: 'round' }),
    circle(63, 44, 7, { fill: glowFill(doc, 'bdEyeGlow', '#ff6a1a') }),
    circle(63, 44, 4.8, { fill: '#ffb040', stroke: '#3a1a04', strokeWidth: 1.4 }),
    circle(63, 44, 1.8, { fill: '#fff3c0' }),
    path('M62 57l2 6l2-6ZM70 57l2 6l2-6ZM78 56l2 5l2-5ZM66 66l2-5l2 5ZM74 68l2-5l2 5Z', { fill: '#e8e0d0', ...stroke(0.6) }),
    circle(88, 46, 2.2, { fill: '#2a1408' }),
    path('M90 44Q94 38 92 32Q98 36 96 30', { fill: 'none', stroke: '#eef2f4', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.7 }),
  ].join('');
};

export const clockworkRat: SymbolFn = (doc) => {
  const body = metalLinear(doc, 'ratCopper', COPPER);
  const brass = metalLinear(doc, 'ratKey', BRASS);
  return [
    path('M84 70Q96 74 94 84Q90 92 80 88Q74 86 76 80Q78 76 82 78', { fill: 'none', stroke: '#8a909a', strokeWidth: 2.6, strokeLinecap: 'round' }),
    path('M6 64Q8 52 22 46Q34 34 54 36Q76 38 84 56Q88 70 76 76Q56 82 30 78Q12 76 6 64Z', { fill: body, ...stroke(2.6) }),
    path('M34 40Q38 60 34 78M54 37Q58 58 54 80M70 44Q72 60 68 78', { fill: 'none', stroke: '#5e2c12', strokeWidth: 1.4, opacity: 0.8 }),
    rivetLine(36, 46, 36, 72, 4, 1, '#ffd8b8'),
    rivetLine(56, 44, 56, 74, 4, 1, '#ffd8b8'),
    path(gearWithHoleD(26, 38, 11, 3, 9, 4), { fill: brass, fillRule: 'evenodd', ...stroke(1.4) }),
    circle(17, 56, 4.5, { fill: glowFill(doc, 'ratEyeGlow', '#ff3a2a') }),
    circle(17, 56, 2.6, { fill: '#ff4a2a', ...stroke(0.8) }),
    circle(6, 64, 2.4, { fill: '#2a1408' }),
    path('M6 62L-2 58M6 64L-3 65M7 66L-1 71', { stroke: '#c9ced6', strokeWidth: 1, strokeLinecap: 'round' }),
    path('M12 72L10 82M24 77L22 88M60 80L60 90M72 78L74 88', { stroke: '#5c616a', strokeWidth: 3, strokeLinecap: 'round' }),
    rect(54, 20, 6, 18, { fill: brass, ...stroke(1.4) }),
    path('M57 20C46 20 44 6 52 4C56 3 57 10 57 12C57 10 58 3 62 4C70 6 68 20 57 20Z', { fill: brass, ...stroke(1.8) }),
    circle(52, 10, 2, { fill: '#5e2c12' }),
    circle(62, 10, 2, { fill: '#5e2c12' }),
  ].join('');
};

export const scoutDrone: SymbolFn = (doc) => {
  const shell = metalRadial(doc, 'droneShell', BRASS);
  const rotor = (x: number, y: number): string =>
    [
      ellipse(x, y, 17, 5.5, { fill: '#eef6fa', opacity: 0.35, ...stroke(1.2, '#3a4a5a') }),
      path(`M${x - 15} ${y + 1}L${x + 15} ${y - 1}`, { stroke: '#2a2c30', strokeWidth: 2.4, strokeLinecap: 'round' }),
      circle(x, y, 2.6, { fill: '#c9a24a', ...stroke(1) }),
    ].join('');
  return [
    path('M30 50L16 30M70 50L84 30', { stroke: tubeGradient(doc, 'droneArm', IRON), strokeWidth: 4, strokeLinecap: 'round' }),
    rotor(16, 28),
    rotor(84, 28),
    path('M50 30V14', { stroke: '#2a2c30', strokeWidth: 2 }),
    circle(50, 12, 3.4, { fill: '#ff4a3a', ...stroke(1) }),
    circle(50, 12, 7, { fill: glowFill(doc, 'droneBeacon', '#ff4a3a'), opacity: 0.8 }),
    path('M36 74L30 90M64 74L70 90M50 78V94', { stroke: '#5c616a', strokeWidth: 3, strokeLinecap: 'round' }),
    circle(50, 54, 25, { fill: shell, ...stroke(2.8) }),
    path('M26 50Q50 40 74 50', { fill: 'none', stroke: '#6e4e14', strokeWidth: 1.6 }),
    rivetLine(30, 47, 70, 47, 7, 1.1, '#fff3c0'),
    circle(50, 60, 12, { fill: '#1a120c', ...stroke(1.8) }),
    circle(50, 60, 9, { fill: glowFill(doc, 'droneLens', '#5fd8ff') }),
    circle(50, 60, 5.5, { fill: '#7fe8ff', ...stroke(1) }),
    circle(47.5, 57.5, 2, { fill: '#ffffff', opacity: 0.85 }),
  ].join('');
};

export const scrapGargoyle: SymbolFn = (doc) => {
  const plateA = lin(doc, 'gargA', '#8a909a', '#3a3e44');
  const plateB = lin(doc, 'gargB', '#b07a4a', '#4a2a14');
  const pipe = tubeGradient(doc, 'gargPipe', IRON);
  return [
    path('M26 34Q10 26 8 6Q20 14 30 24', { fill: 'none', stroke: pipe, strokeWidth: 8, strokeLinecap: 'round' }),
    path('M74 34Q90 26 92 6Q80 14 70 24', { fill: 'none', stroke: pipe, strokeWidth: 8, strokeLinecap: 'round' }),
    path('M14 40L4 30L10 52Z', { fill: plateB, ...stroke(1.8) }),
    path('M86 40L96 30L90 52Z', { fill: plateB, ...stroke(1.8) }),
    path('M50 20L74 26L84 46L78 74L62 90H38L22 74L16 46L26 26Z', { fill: plateA, ...stroke(2.8) }),
    path('M26 26L50 34L74 26M16 46L40 50L50 34L60 50L84 46M22 74L38 64L62 64L78 74', { fill: 'none', stroke: '#1e2024', strokeWidth: 1.4, opacity: 0.8 }),
    path('M50 34L60 50L50 56L40 50Z', { fill: plateB, ...stroke(1.4) }),
    path('M30 30L44 36L40 46L28 42Z', { fill: '#a0461e', opacity: 0.55 }),
    path('M62 70L72 66L74 76Z', { fill: '#a0461e', opacity: 0.6 }),
    path(gearD(36, 46, 7.5, 2.4, 6), { fill: '#2a2c30', ...stroke(1.2) }),
    path(gearD(64, 46, 7.5, 2.4, 6), { fill: '#2a2c30', ...stroke(1.2) }),
    circle(36, 46, 6, { fill: glowFill(doc, 'gargEye', '#ffd23a') }),
    circle(64, 46, 6, { fill: 'url(#gargEye)' }),
    circle(36, 46, 2.4, { fill: '#fff3a0' }),
    circle(64, 46, 2.4, { fill: '#fff3a0' }),
    path('M32 66Q50 60 68 66L62 80H38Z', { fill: '#140c08', ...stroke(1.8) }),
    path('M36 66l3 7l3-7M44 64l3 7l3-7M52 64l3 7l3-7M60 65l3 7l2-7M40 80l3-6l3 6M50 80l3-6l3 6', { fill: '#c9ced6', ...stroke(0.8) }),
    rivetRing(50, 54, 30, 10, 1.3, '#c9ced6', 0.2),
  ].join('');
};

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

export const adaVolta: SymbolFn = (doc) => {
  const skin = lin(doc, 'adaSkin', '#f8d8c0', '#c08a6a');
  const hair = lin(doc, 'adaHair', '#c0582a', '#5a1e0c');
  return [
    path('M12 100Q16 80 34 76L50 84L66 76Q84 80 88 100Z', { fill: lin(doc, 'adaCoat', '#f3ead6', '#a8946b'), ...stroke(2.2) }),
    path('M34 76L44 100M66 76L56 100', { stroke: '#8a7a5a', strokeWidth: 1.6 }),
    path('M44 82L50 88L56 82L50 78Z', { fill: '#3a4a6a', ...stroke(1.2) }),
    path('M62 86L58 92H62L58 98', { fill: 'none', stroke: '#ffd23a', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    circle(50, 14, 11, { fill: hair, ...stroke(2) }),
    path('M26 50Q24 22 50 20Q76 22 74 50Q72 36 60 30Q44 28 34 36Q28 42 26 50Z', { fill: hair, ...stroke(2.2) }),
    path('M30 48Q30 76 50 78Q70 76 70 48Q70 30 50 30Q30 30 30 48Z', { fill: skin, ...stroke(2.4) }),
    path('M30 44Q34 32 48 30Q38 36 36 46Z', { fill: hair }),
    goggles(doc, 50, 31, 7.5, ['#a8f0c8', '#1e6a4a'], 'adaLens'),
    path('M37 50Q41 47 45 50M55 50Q59 47 63 50', { fill: 'none', ...stroke(1.8) }),
    circle(41, 54, 2.3, { fill: '#2a5a3a' }),
    circle(59, 54, 2.3, { fill: '#2a5a3a' }),
    path('M50 55Q52 61 49 63', { fill: 'none', ...stroke(1.4) }),
    path('M42 68Q50 73 58 68', { fill: 'none', ...stroke(1.8) }),
    ellipse(64, 63, 4, 2.4, { fill: '#3a3632', opacity: 0.45 }),
  ].join('');
};

export const merchantCobre: SymbolFn = (doc) => {
  const skin = lin(doc, 'cobreSkin', '#f6caa6', '#b47a54');
  const hat = lin(doc, 'cobreHat', '#3a3236', '#0e0a0c');
  return [
    path('M10 100Q14 80 32 76L50 86L68 76Q86 80 90 100Z', { fill: lin(doc, 'cobreCoat', '#3a5a4a', '#122018'), ...stroke(2.2) }),
    path('M40 78L50 86L60 78L56 74H44Z', { fill: '#f3ead6', ...stroke(1.4) }),
    path('M42 84L50 88L58 84L58 92L50 88L42 92Z', { fill: '#b8673a', ...stroke(1.2) }),
    path('M26 50Q26 80 50 82Q74 80 74 50Q74 32 50 32Q26 32 26 50Z', { fill: skin, ...stroke(2.4) }),
    path('M14 34Q50 26 86 34Q84 40 50 38Q16 40 14 34Z', { fill: hat, ...stroke(2.2) }),
    path('M28 34V6Q50 0 72 6V34Q50 30 28 34Z', { fill: hat, ...stroke(2.4) }),
    path('M28 26Q50 22 72 26V32Q50 28 28 32Z', { fill: metalLinear(doc, 'cobreBand', COPPER), ...stroke(1.4) }),
    path(gearD(62, 29, 4.5, 1.6, 8), { fill: '#f6dc8e', ...stroke(0.8) }),
    path('M36 50Q40 47 44 50', { fill: 'none', ...stroke(1.8) }),
    circle(40, 53, 2.2, { fill: OUT }),
    circle(60, 53, 6.5, { fill: '#dff0ff', opacity: 0.5, stroke: '#e9c063', strokeWidth: 2.2 }),
    circle(60, 53, 2.2, { fill: OUT }),
    path('M66 56Q74 66 72 78', { fill: 'none', stroke: '#e9c063', strokeWidth: 1.1 }),
    path('M50 54Q53 61 49 63', { fill: 'none', ...stroke(1.4) }),
    path('M30 66Q38 58 50 64Q62 58 70 66Q66 72 58 68Q50 72 42 68Q34 72 30 66Z', { fill: lin(doc, 'cobreStache', '#8a4a2a', '#3a1a0a'), ...stroke(1.6) }),
    circle(84, 82, 8, { fill: metalRadial(doc, 'cobreCoin', BRASS), ...stroke(1.6) }),
    circle(84, 82, 5, { fill: 'none', stroke: '#6e4e14', strokeWidth: 1 }),
  ].join('');
};

export const captainNiebla: SymbolFn = (doc) => {
  const skin = lin(doc, 'nieblaSkin', '#ecc09a', '#a06c4a');
  const beard = lin(doc, 'nieblaBeard', '#e8e8ec', '#8a8e96');
  const cap = lin(doc, 'nieblaCap', '#2a3a5a', '#0a1020');
  return [
    path('M10 100Q14 80 32 76L50 84L68 76Q86 80 90 100Z', { fill: lin(doc, 'nieblaCoat', '#2a3a5a', '#0a1020'), ...stroke(2.2) }),
    circle(40, 92, 2.4, { fill: '#e9c063', ...stroke(0.8) }),
    circle(60, 92, 2.4, { fill: '#e9c063', ...stroke(0.8) }),
    path('M26 48Q26 76 50 78Q74 76 74 48Q74 30 50 30Q26 30 26 48Z', { fill: skin, ...stroke(2.4) }),
    path('M26 52Q24 84 50 90Q76 84 74 52Q70 66 60 68Q50 62 40 68Q30 66 26 52Z', { fill: beard, ...stroke(2) }),
    path('M40 66Q50 60 60 66Q50 64 40 66Z', { fill: '#c8ccd2', ...stroke(1.2) }),
    path('M20 34Q50 18 80 34L78 40Q50 32 22 40Z', { fill: '#0a0e18', ...stroke(2) }),
    path('M24 34Q22 12 50 10Q78 12 76 34Q50 26 24 34Z', { fill: cap, ...stroke(2.4) }),
    path('M24 32Q50 24 76 32', { fill: 'none', stroke: '#f3ead6', strokeWidth: 1.4, opacity: 0.6 }),
    path('M38 22Q44 16 50 22Q56 16 62 22L56 24L50 21L44 24Z', { fill: metalLinear(doc, 'nieblaWing', BRASS), ...stroke(1.2) }),
    circle(50, 22, 3, { fill: '#e9c063', ...stroke(1) }),
    path('M36 48Q40 45 44 48M56 48Q60 45 64 48', { fill: 'none', ...stroke(1.8) }),
    circle(40, 51, 2.2, { fill: OUT }),
    circle(60, 51, 2.2, { fill: OUT }),
    path('M50 52Q53 58 49 61', { fill: 'none', ...stroke(1.4) }),
    path('M58 70H74V80Q74 84 70 84H66Q62 84 62 80V74H58Z', { fill: lin(doc, 'nieblaPipe', '#8a5a2a', '#3a2010'), ...stroke(1.6) }),
    path('M70 70Q66 60 72 54Q78 48 74 40', { fill: 'none', stroke: '#e8eef2', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.65 }),
  ].join('');
};

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

export const engineerGear: SymbolFn = (doc) => {
  const brass = metalLinear(doc, 'engGear', BRASS);
  const steel = lin(doc, 'engSteel', '#f0f2f6', '#6a707a', true);
  return [
    circle(50, 50, 46, { fill: glowFill(doc, 'engAura', '#ffcf6a'), opacity: 0.5 }),
    path(gearWithHoleD(50, 50, 40, 8, 14, 14), { fill: brass, fillRule: 'evenodd', ...stroke(2.4) }),
    circle(50, 50, 26, { fill: 'none', stroke: '#6e4e14', strokeWidth: 1.6 }),
    rivetRing(50, 50, 21, 8, 1.4, '#fff3c0'),
    g({ transform: 'rotate(45 50 50)' }, [
      rect(45, 14, 10, 62, { rx: 3, fill: steel, ...stroke(2) }),
      path('M42 4H58V18Q58 22 54 22H54V12H46V22Q42 22 42 18Z', { fill: steel, ...stroke(2) }),
      circle(50, 82, 8, { fill: steel, ...stroke(2) }),
      circle(50, 82, 3.5, { fill: '#2a2c30' }),
    ]),
    g({ transform: 'rotate(-45 50 50)' }, [
      rect(47, 8, 6, 46, { fill: steel, ...stroke(1.8) }),
      path('M47 8L50 0L53 8Z', { fill: steel, ...stroke(1.4) }),
      rect(43, 54, 14, 34, { rx: 5, fill: lin(doc, 'engHandle', '#e04a2a', '#7a1a0a', true), ...stroke(2) }),
      path('M46 60V84M50 60V84M54 60V84', { stroke: '#5a1006', strokeWidth: 1.2, opacity: 0.7 }),
    ]),
  ].join('');
};

export const aeronautElf: SymbolFn = (doc) => {
  const skin = lin(doc, 'veraSkin', '#fbe2cc', '#c89a7a');
  const leather = lin(doc, 'veraHelmet', '#a06a3a', '#4a2a12');
  return [
    path('M60 76Q84 72 98 84Q86 86 92 96Q78 88 64 90Z', { fill: lin(doc, 'veraScarf', '#ffffff', '#c8d4de', true), ...stroke(1.8) }),
    path('M12 100Q16 82 34 78L50 86L66 78Q84 82 88 100Z', { fill: lin(doc, 'veraJacket', '#7a4a24', '#2a160a'), ...stroke(2.2) }),
    path('M34 78Q50 92 66 78L64 74H36Z', { fill: '#e8e0d0', ...stroke(1.6) }),
    path('M24 46L6 30L18 54Z', { fill: skin, ...stroke(2) }),
    path('M76 46L94 30L82 54Z', { fill: skin, ...stroke(2) }),
    path('M28 48Q28 76 50 79Q72 76 72 48Q72 26 50 26Q28 26 28 48Z', { fill: skin, ...stroke(2.4) }),
    path('M24 46Q22 12 50 12Q78 12 76 46Q72 36 66 34V40Q50 34 34 40V34Q28 36 24 46Z', { fill: leather, ...stroke(2.4) }),
    path('M24 46Q22 60 30 64L32 44ZM76 46Q78 60 70 64L68 44Z', { fill: leather, ...stroke(1.6) }),
    path('M50 12V34', { stroke: '#2a160a', strokeWidth: 1.6, opacity: 0.7 }),
    goggles(doc, 50, 48, 9, ['#d8f4ff', '#3a7aaa'], 'veraLens', '#3a2210'),
    path('M40 60Q44 58 48 60', { fill: 'none', ...stroke(1.2) }),
    path('M42 68Q50 73 58 68', { fill: 'none', ...stroke(1.8) }),
    path('M30 26Q50 20 70 26', { fill: 'none', stroke: '#e9c063', strokeWidth: 1.6, opacity: 0.7 }),
    circle(50, 22, 3.4, { fill: metalRadial(doc, 'veraBadge', BRASS), ...stroke(1) }),
  ].join('');
};

export const rustAutomaton: SymbolFn = (doc) => {
  const rust = lin(doc, 'oxRust', '#d0884a', '#5a2a10');
  const lamp = glowFill(doc, 'oxLamp', '#ffd84a');
  return [
    path('M50 18V6', { stroke: '#4a2a14', strokeWidth: 2.6 }),
    circle(50, 5, 4.5, { fill: glowFill(doc, 'oxBulb', '#9aff6a') }),
    circle(50, 5, 2.6, { fill: '#c8ff9a', ...stroke(0.8) }),
    path('M10 100Q12 86 28 82H72Q88 86 90 100Z', { fill: rust, ...stroke(2.2) }),
    rect(38, 74, 24, 10, { fill: tubeGradient(doc, 'oxNeck', IRON, true), ...stroke(1.6) }),
    rect(18, 18, 64, 58, { rx: 14, fill: rust, ...stroke(2.8) }),
    path('M18 40H82M50 18V40', { stroke: '#3a1a08', strokeWidth: 1.4, opacity: 0.7 }),
    rivetLine(24, 24, 76, 24, 7, 1.3, '#e8b080'),
    circle(36, 46, 11, { fill: '#1a120c', ...stroke(2) }),
    circle(64, 46, 11, { fill: '#1a120c', ...stroke(2) }),
    circle(36, 46, 9, { fill: lamp }),
    circle(64, 46, 9, { fill: lamp }),
    circle(36, 46, 5, { fill: '#fff3a0' }),
    circle(64, 46, 5, { fill: '#fff3a0' }),
    rect(30, 62, 40, 9, { rx: 2, fill: '#2a1408', ...stroke(1.6) }),
    path('M35 62V71M40 62V71M45 62V71M50 62V71M55 62V71M60 62V71M65 62V71', { stroke: '#a86a3a', strokeWidth: 1.6 }),
    ellipse(72, 30, 7, 4, { fill: '#7a3a14', opacity: 0.6 }),
    ellipse(26, 66, 5, 3, { fill: '#3a8a6a', opacity: 0.5 }),
    path('M70 58l6 2l-3 4', { fill: 'none', stroke: '#3a1a08', strokeWidth: 1.4 }),
    circle(12, 46, 6, { fill: metalRadial(doc, 'oxEar', IRON), ...stroke(1.6) }),
    circle(88, 46, 6, { fill: 'url(#oxEar)', ...stroke(1.6) }),
  ].join('');
};

export const inventorFlask: SymbolFn = (doc) => {
  const brass = metalLinear(doc, 'invGear', BRASS);
  const liquid = lin(doc, 'invLiquid', '#b8ff6a', '#2a8a2a');
  return [
    circle(50, 50, 46, { fill: glowFill(doc, 'invAura', '#9aff6a'), opacity: 0.45 }),
    path(gearWithHoleD(50, 56, 36, 7, 12, 22), { fill: brass, fillRule: 'evenodd', ...stroke(2.2) }),
    rivetRing(50, 56, 31, 12, 1.2, '#fff3c0', 0.26),
    g({ transform: 'rotate(-30 50 50)' }, [
      path('M30 46L38 46L44 70Q46 78 38 80H22Q14 78 16 70Z', { fill: lin(doc, 'invBellows', '#a86a3a', '#4a2410'), ...stroke(2) }),
      path('M20 56H40M18 64H42M17 72H43', { stroke: '#3a1a08', strokeWidth: 1.4 }),
      rect(28, 34, 6, 12, { fill: '#c9a24a', ...stroke(1.4) }),
      path('M31 34V20', { stroke: '#8a909a', strokeWidth: 3, strokeLinecap: 'round' }),
    ]),
    g({ transform: 'rotate(25 50 50)' }, [
      rect(56, 10, 14, 10, { rx: 2, fill: '#8a5a2e', ...stroke(1.6) }),
      path('M58 20V44L48 72Q46 82 56 84H72Q82 82 78 72L68 44V20Z', { fill: '#dff4ff', opacity: 0.55, ...stroke(2) }),
      path('M52 64L76 64L78 72Q80 82 72 82H56Q48 82 50 72Z', { fill: liquid }),
      circle(60, 72, 2, { fill: '#ffffff', opacity: 0.7 }),
      circle(66, 68, 1.4, { fill: '#ffffff', opacity: 0.7 }),
    ]),
    path('M78 18Q82 10 80 4M84 22Q90 16 92 10', { fill: 'none', stroke: '#c8ff9a', strokeWidth: 2.4, strokeLinecap: 'round', opacity: 0.8 }),
  ].join('');
};

export const gunslingerOrc: SymbolFn = (doc) => {
  const skin = lin(doc, 'brunoSkin', '#a8c088', '#4a6a3a');
  const hat = lin(doc, 'brunoHat', '#4a3a2a', '#14100a');
  return [
    path('M10 100Q14 80 32 76L50 86L68 76Q86 80 90 100Z', { fill: lin(doc, 'brunoCoat', '#6a4a2a', '#24160a'), ...stroke(2.2) }),
    path('M24 82L40 100M76 82L60 100', { stroke: '#2a1a0e', strokeWidth: 4 }),
    rect(26, 84, 6, 6, { fill: '#e9c063', ...stroke(0.8), transform: 'rotate(40 29 87)' }),
    path('M24 50Q24 80 50 82Q76 80 76 50Q76 32 50 32Q24 32 24 50Z', { fill: skin, ...stroke(2.4) }),
    path('M12 34Q50 28 88 34Q86 40 50 38Q14 40 12 34Z', { fill: hat, ...stroke(2.2) }),
    path('M26 34Q24 10 50 10Q76 10 74 34Q50 30 26 34Z', { fill: hat, ...stroke(2.4) }),
    path('M26 30Q50 26 74 30', { fill: 'none', stroke: '#b8673a', strokeWidth: 3 }),
    path('M33 46L45 50M67 46L55 50', { stroke: '#1e2a10', strokeWidth: 3.4, strokeLinecap: 'round' }),
    circle(40, 53, 2.4, { fill: '#ffe14a', ...stroke(0.8) }),
    circle(60, 53, 2.4, { fill: '#ffe14a', ...stroke(0.8) }),
    path('M50 53Q54 60 50 64Q47 64 46 62', { fill: 'none', ...stroke(1.6) }),
    path('M36 70Q50 64 64 70', { fill: 'none', ...stroke(2.2) }),
    path('M38 70L36 60L42 68ZM62 70L64 60L58 68Z', { fill: '#f3ead6', ...stroke(1.2) }),
    rect(62, 66, 18, 4, { rx: 2, fill: '#7a4a24', ...stroke(1), transform: 'rotate(-12 62 68)' }),
    circle(81, 64, 2, { fill: '#ff7a2a' }),
    path('M83 62Q88 56 86 50Q90 46 88 40', { fill: 'none', stroke: '#c8ccd2', strokeWidth: 1.8, strokeLinecap: 'round', opacity: 0.7 }),
    path('M24 60L14 66L26 68Z', { fill: skin, ...stroke(1.6) }),
    line(30, 74, 36, 76, { stroke: '#2a3a1a', strokeWidth: 1.2 }),
  ].join('');
};
