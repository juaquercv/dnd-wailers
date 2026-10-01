import { SvgDoc, circle, g, path, radialGradient, tag, type Stop } from './svg';
import {
  anvil,
  bandit,
  banditCaptain,
  bardLute,
  barbarianAxe,
  clericSun,
  dragonHead,
  dwarfWarrior,
  elder,
  elfWizard,
  fireElemental,
  goblin,
  goblinShaman,
  guard,
  lich,
  ogre,
  orc,
  rat,
  rogueDaggers,
  skull,
  spider,
  tankard,
  tieflingWarlock,
  wolf,
  zombie,
  type SymbolFn,
} from './symbolsCreatures';

/** Circular token portraits (256 x 256): gradient background, rays, emblem, metallic ring. */

export interface PortraitSpec {
  symbol: SymbolFn;
  bg: [inner: string, outer: string];
  ring: [light: string, dark: string];
}

const GOLD: [string, string] = ['#ffe9a8', '#8a6420'];
const SILVER: [string, string] = ['#f4f6fa', '#5a606a'];
const BRONZE: [string, string] = ['#f0b878', '#6a3a14'];
const JADE: [string, string] = ['#c8fff0', '#1a6a5a'];

export const PORTRAIT_SPECS = {
  'dragon-rojo': { symbol: dragonHead, bg: ['#9a2a14', '#1a0604'], ring: GOLD },
  goblin: { symbol: goblin, bg: ['#4a6a2a', '#0e1a0a'], ring: BRONZE },
  'goblin-chaman': { symbol: goblinShaman, bg: ['#4a3a6a', '#0e0a1a'], ring: BRONZE },
  'lobo-huargo': { symbol: wolf, bg: ['#4a5a6a', '#0a0e14'], ring: SILVER },
  esqueleto: { symbol: skull, bg: ['#4a4a5a', '#0a0a10'], ring: SILVER },
  zombi: { symbol: zombie, bg: ['#4a5a2a', '#0a0e06'], ring: BRONZE },
  'orco-berserker': { symbol: orc, bg: ['#6a2a1a', '#140806'], ring: BRONZE },
  bandido: { symbol: bandit, bg: ['#5a4a3a', '#100c08'], ring: BRONZE },
  'capitan-bandido': { symbol: banditCaptain, bg: ['#6a1a2a', '#14060a'], ring: SILVER },
  ogro: { symbol: ogre, bg: ['#5a5a2a', '#10100a'], ring: BRONZE },
  'arana-gigante': { symbol: spider, bg: ['#3a4a3a', '#060a06'], ring: SILVER },
  'elemental-fuego': { symbol: fireElemental, bg: ['#6a2a0a', '#140402'], ring: GOLD },
  'liche-valdris': { symbol: lich, bg: ['#1a4a4a', '#040a0a'], ring: JADE },
  'rata-gigante': { symbol: rat, bg: ['#5a4a4a', '#0e0a0a'], ring: BRONZE },
  marta: { symbol: tankard, bg: ['#8a5a1a', '#1a0e04'], ring: GOLD },
  bruno: { symbol: anvil, bg: ['#7a3a10', '#140804'], ring: BRONZE },
  eldric: { symbol: elder, bg: ['#2a3a6a', '#080c16'], ring: GOLD },
  guardia: { symbol: guard, bg: ['#3a4a5a', '#080c10'], ring: SILVER },
  thorin: { symbol: dwarfWarrior, bg: ['#6a4a1a', '#140c06'], ring: GOLD },
  sombra: { symbol: tieflingWarlock, bg: ['#4a1a5a', '#0a0410'], ring: SILVER },
  lyra: { symbol: elfWizard, bg: ['#1a2a6a', '#040814'], ring: GOLD },
  gwen: { symbol: bardLute, bg: ['#6a1a4a', '#140410'], ring: GOLD },
  kael: { symbol: rogueDaggers, bg: ['#1a4a2a', '#040e08'], ring: SILVER },
  isolde: { symbol: clericSun, bg: ['#7a6a2a', '#1a1406'], ring: GOLD },
  grak: { symbol: barbarianAxe, bg: ['#6a2a1a', '#140806'], ring: BRONZE },
} satisfies Record<string, PortraitSpec>;

export type PortraitKey = keyof typeof PORTRAIT_SPECS;

export const DROP_SHADOW_FILTER =
  '<filter id="symbolShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.65"/></filter>';

export function buildPortrait(spec: PortraitSpec, title: string): string {
  const doc = new SvgDoc(256, 256, title);
  const bgStops: Stop[] = [[0, spec.bg[0]], [1, spec.bg[1]]];
  const bg = doc.def('portraitBg', radialGradient('portraitBg', bgStops, { cx: 0.5, cy: 0.42, r: 0.62 }));
  const ring = doc.def('portraitRing', tag('linearGradient', { id: 'portraitRing', x1: 0, y1: 0, x2: 1, y2: 1 }, [tag('stop', { offset: 0, stopColor: spec.ring[0] }), tag('stop', { offset: 0.5, stopColor: spec.ring[1] }), tag('stop', { offset: 1, stopColor: spec.ring[0] })].join('')));
  const inner = doc.def('portraitInner', radialGradient('portraitInner', [[0.6, '#000000', 0], [1, '#000000', 0.55]]));
  doc.def('portraitClip', tag('clipPath', { id: 'portraitClip' }, circle(128, 128, 118)));
  doc.def('symbolShadow', DROP_SHADOW_FILTER);
  const rays: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a1 = (i / 16) * Math.PI * 2;
    const a2 = a1 + Math.PI / 16;
    rays.push(path(`M128 128L${128 + Math.cos(a1) * 130} ${128 + Math.sin(a1) * 130}L${128 + Math.cos(a2) * 130} ${128 + Math.sin(a2) * 130}Z`, { fill: '#ffffff', opacity: 0.045 }));
  }
  doc.add(circle(128, 128, 127, { fill: '#0b0a08' }));
  doc.add(circle(128, 128, 118, { fill: bg }));
  doc.add(g({ clipPath: 'url(#portraitClip)' }, [...rays, g({ transform: 'translate(30 30) scale(1.96)', filter: 'url(#symbolShadow)' }, spec.symbol(doc)), circle(128, 128, 118, { fill: inner })]));
  doc.add(circle(128, 128, 120, { fill: 'none', stroke: ring, strokeWidth: 9 }));
  doc.add(circle(128, 128, 115, { fill: 'none', stroke: '#000000', strokeWidth: 2, opacity: 0.45 }));
  doc.add(circle(128, 128, 124.5, { fill: 'none', stroke: '#000000', strokeWidth: 1.5, opacity: 0.6 }));
  return doc.render();
}
