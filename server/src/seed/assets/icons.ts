import { RARITY_INFO, type Rarity, type SoundType } from '@wailers/shared';
import { DROP_SHADOW_FILTER } from './portraits';
import { BRASS, gearD, metalLinear, rivetRing } from './steamKit';
import { SvgDoc, circle, g, linearGradient, path, radialGradient, rect, shade } from './svg';
import {
  airRifle,
  airshipChase,
  armoredVest,
  aviatorGoggles,
  blueprints,
  brassCoins,
  cableNet,
  cartridges,
  coalLumps,
  deckWind,
  enginePiston,
  fieldKit,
  flare,
  gearHeart,
  gearKit,
  gearsPair,
  harpoon,
  heavyWrench,
  jetpack,
  magnetPulse,
  mechArm,
  musicBox,
  pistolShot,
  pressureShield,
  propeller,
  sootCloud,
  steamGrenade,
  steamPistol,
  steamWhistle,
  stormCompass,
  teslaCoil,
} from './symbolsSteamItems';
import { dragonHead, bardLute, type SymbolFn } from './symbolsCreatures';
import {
  acidSplash,
  amulet,
  archmageStaff,
  arrows,
  battleAxe,
  bell,
  book,
  campfireSymbol,
  caveSymbol,
  chainmail,
  coinStack,
  crossbow,
  crossedSwords,
  cryptKey,
  cureWounds,
  dagger,
  detectMagic,
  door,
  dragonOrb,
  dragonScale,
  drum,
  eldritchBlast,
  enlarge,
  fireball,
  flamingSword,
  healingWord,
  impact,
  invisibility,
  javelins,
  leatherArmor,
  lightOrb,
  lightningBolt,
  mace,
  magicMissile,
  mockery,
  plateArmor,
  poisonCloud,
  potion,
  potionGreater,
  rainCloud,
  rations,
  rayOfFrost,
  ring,
  ruby,
  sacredFlame,
  scaleArmor,
  scroll,
  shadowTouch,
  shieldSpell,
  shortbow,
  sleepMoon,
  snowflake,
  spear,
  sword,
  thievesTools,
  thunderwave,
  treeSymbol,
  web,
  woodenShield,
} from './symbolsItems';

/** Square item icons framed by rarity, round spell badges and sound tiles (256 x 256). */

export const ITEM_SYMBOLS = {
  sword,
  flamingSword,
  dagger,
  battleAxe,
  mace,
  spear,
  javelins,
  shortbow,
  crossbow,
  arrows,
  leatherArmor,
  scaleArmor,
  chainmail,
  plateArmor,
  woodenShield,
  potion,
  potionGreater,
  scroll,
  ring,
  amulet,
  thievesTools,
  rations,
  ruby,
  cryptKey,
  dragonScale,
  archmageStaff,
  dragonOrb,
  // Los Cielos de Latón (steampunk).
  steamPistol,
  airRifle,
  heavyWrench,
  aviatorGoggles,
  fieldKit,
  steamGrenade,
  jetpack,
  mechArm,
  gearHeart,
  blueprints,
  coalLumps,
  brassCoins,
  cartridges,
  armoredVest,
  stormCompass,
} satisfies Record<string, SymbolFn>;

export type ItemSymbolKey = keyof typeof ITEM_SYMBOLS;

export function buildItemIcon(symbol: SymbolFn, rarity: Rarity, title: string): string {
  const color = RARITY_INFO[rarity].color;
  const doc = new SvgDoc(256, 256, title);
  const bg = doc.def('itemBg', radialGradient('itemBg', [[0, '#3a332b'], [1, '#0e0c0a']], { cx: 0.5, cy: 0.4, r: 0.75 }));
  const aura = doc.def('itemAura', radialGradient('itemAura', [[0, color, 0.55], [0.6, color, 0.15], [1, color, 0]]));
  const border = doc.def('itemBorder', linearGradient('itemBorder', [[0, shade(color, 0.35)], [0.5, color], [1, shade(color, -0.45)]], 0, 0, 1, 1));
  doc.def('symbolShadow', DROP_SHADOW_FILTER);
  doc.add(rect(4, 4, 248, 248, { rx: 38, fill: '#050403' }));
  doc.add(rect(10, 10, 236, 236, { rx: 32, fill: bg }));
  doc.add(circle(128, 128, 112, { fill: aura }));
  doc.add(g({ transform: 'translate(28 28) scale(2)', filter: 'url(#symbolShadow)' }, symbol(doc)));
  doc.add(rect(10, 10, 236, 236, { rx: 32, fill: 'none', stroke: border, strokeWidth: 8 }));
  doc.add(rect(20, 20, 216, 216, { rx: 24, fill: 'none', stroke: '#d4a63f', strokeWidth: 1.5, opacity: 0.45 }));
  // Rarity gem at the top.
  doc.add(path('M128 4L140 16L128 28L116 16Z', { fill: color, stroke: '#050403', strokeWidth: 3 }), path('M128 9L134 16L128 23L122 16Z', { fill: '#ffffff', opacity: 0.35 }));
  return doc.render();
}

export interface SpellIconSpec {
  symbol: SymbolFn;
  color: string;
}

export const SPELL_ICON_SPECS = {
  'bola-de-fuego': { symbol: fireball, color: '#ff6a1a' },
  'proyectil-magico': { symbol: magicMissile, color: '#8a63f0' },
  'curar-heridas': { symbol: cureWounds, color: '#3fae5a' },
  relampago: { symbol: lightningBolt, color: '#e6b81a' },
  'cono-de-frio': { symbol: snowflake, color: '#3a9ad8' },
  escudo: { symbol: shieldSpell, color: '#4a7ad8' },
  luz: { symbol: lightOrb, color: '#e6c84a' },
  'palabra-sanadora': { symbol: healingWord, color: '#3fae5a' },
  'rayo-de-escarcha': { symbol: rayOfFrost, color: '#3a9ad8' },
  'nube-venenosa': { symbol: poisonCloud, color: '#5a9a2a' },
  'llama-sagrada': { symbol: sacredFlame, color: '#e6b81a' },
  'toque-sombrio': { symbol: shadowTouch, color: '#6a3ab8' },
  dormir: { symbol: sleepMoon, color: '#5a4ab8' },
  telarana: { symbol: web, color: '#6a6a7a' },
  'detectar-magia': { symbol: detectMagic, color: '#8a63f0' },
  invisibilidad: { symbol: invisibility, color: '#5ab8d8' },
  'agrandar-reducir': { symbol: enlarge, color: '#b88a2a' },
  'explosion-sobrenatural': { symbol: eldritchBlast, color: '#7a4ad8' },
  'burla-cruel': { symbol: mockery, color: '#c84a8a' },
  'ola-atronadora': { symbol: thunderwave, color: '#3a6ad8' },
  'salpicadura-acida': { symbol: acidSplash, color: '#7ab82a' },
} satisfies Record<string, SpellIconSpec>;

export type SpellIconKey = keyof typeof SPELL_ICON_SPECS;

export function buildSpellIcon(spec: SpellIconSpec, title: string): string {
  const doc = new SvgDoc(256, 256, title);
  const bg = doc.def('spellBg', radialGradient('spellBg', [[0, shade(spec.color, -0.35)], [1, '#06050a']], { cx: 0.5, cy: 0.45, r: 0.6 }));
  const ring = doc.def('spellRing', linearGradient('spellRing', [[0, shade(spec.color, 0.45)], [0.5, spec.color], [1, shade(spec.color, -0.4)]], 0, 0, 1, 1));
  doc.def('symbolShadow', DROP_SHADOW_FILTER);
  const runes: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = 128 + Math.cos(a) * 108;
    const y = 128 + Math.sin(a) * 108;
    runes.push(path(['M-3 -4L3 4M-3 4L3 -4', 'M0 -5V5M-3 0H3', 'M-3 -4H3L-3 4H3'][i % 3]!, { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((a * 180) / Math.PI + 90).toFixed(1)})`, stroke: shade(spec.color, 0.5), strokeWidth: 1.4, fill: 'none', opacity: 0.8 }));
  }
  doc.add(circle(128, 128, 126, { fill: '#050403' }));
  doc.add(circle(128, 128, 120, { fill: bg }));
  doc.add(circle(128, 128, 100, { fill: 'none', stroke: spec.color, strokeWidth: 1.5, opacity: 0.5 }));
  doc.add(...runes);
  doc.add(g({ transform: 'translate(38 38) scale(1.8)', filter: 'url(#symbolShadow)' }, spec.symbol(doc)));
  doc.add(circle(128, 128, 120, { fill: 'none', stroke: ring, strokeWidth: 8 }));
  return doc.render();
}

/** Gadgets ("artilugios") are spell entries in the steampunk campaign: brass gear badge instead of runes. */
export const GADGET_ICON_SPECS = {
  'granada-de-vapor': { symbol: steamGrenade, color: '#d86a2a' },
  'bobina-tesla': { symbol: teslaCoil, color: '#3a9ad8' },
  'botiquin-de-engranajes': { symbol: gearKit, color: '#3fae5a' },
  'red-de-cables': { symbol: cableNet, color: '#6a7a8a' },
  'nube-de-hollin': { symbol: sootCloud, color: '#5a8a3a' },
  'pulso-magnetico': { symbol: magnetPulse, color: '#c84a3a' },
  'arpon-neumatico': { symbol: harpoon, color: '#8a6a3a' },
  'bengala-de-magnesio': { symbol: flare, color: '#e6b81a' },
  'escudo-de-presion': { symbol: pressureShield, color: '#b88a2a' },
} satisfies Record<string, SpellIconSpec>;

export type GadgetIconKey = keyof typeof GADGET_ICON_SPECS;

export function buildGadgetIcon(spec: SpellIconSpec, title: string): string {
  const doc = new SvgDoc(256, 256, title);
  const bg = doc.def('gadgetBg', radialGradient('gadgetBg', [[0, shade(spec.color, -0.3)], [1, '#070605']], { cx: 0.5, cy: 0.45, r: 0.6 }));
  const brass = metalLinear(doc, 'gadgetBrass', BRASS);
  doc.def('symbolShadow', DROP_SHADOW_FILTER);
  doc.add(path(gearD(128, 128, 127, 10, 28), { fill: '#050403' }));
  doc.add(path(gearD(128, 128, 122, 9, 28), { fill: brass, stroke: '#3a2a0a', strokeWidth: 2 }));
  doc.add(circle(128, 128, 106, { fill: '#2a1e0a', stroke: '#1a1206', strokeWidth: 2 }));
  doc.add(circle(128, 128, 100, { fill: bg }));
  doc.add(rivetRing(128, 128, 112, 14, 3.2, '#f6dc8e'));
  doc.add(circle(128, 128, 92, { fill: 'none', stroke: spec.color, strokeWidth: 1.5, opacity: 0.55 }));
  doc.add(g({ transform: 'translate(44 44) scale(1.68)', filter: 'url(#symbolShadow)' }, spec.symbol(doc)));
  doc.add(circle(128, 128, 100, { fill: 'none', stroke: shade(spec.color, 0.25), strokeWidth: 4, opacity: 0.8 }));
  return doc.render();
}

export interface SoundIconSpec {
  symbol: SymbolFn;
  color: string;
  type: SoundType;
}

export const SOUND_ICON_SPECS = {
  'taberna-alegre': { symbol: bardLute, color: '#b8782a', type: 'music' },
  'tambores-de-guerra': { symbol: drum, color: '#b83a2a', type: 'music' },
  'cripta-silenciosa': { symbol: bell, color: '#4a5a7a', type: 'music' },
  'himno-del-dragon': { symbol: dragonHead, color: '#c84a1a', type: 'music' },
  bosque: { symbol: treeSymbol, color: '#3a8a3a', type: 'ambience' },
  lluvia: { symbol: rainCloud, color: '#3a6a9a', type: 'ambience' },
  cueva: { symbol: caveSymbol, color: '#5a4a3a', type: 'ambience' },
  'fuego-de-campamento': { symbol: campfireSymbol, color: '#c86a1a', type: 'ambience' },
  'choque-de-espadas': { symbol: crossedSwords, color: '#7a8a9a', type: 'effect' },
  'efecto-bola-de-fuego': { symbol: fireball, color: '#d8541a', type: 'effect' },
  'puerta-que-cruje': { symbol: door, color: '#7a5a3a', type: 'effect' },
  'rugido-de-dragon': { symbol: dragonHead, color: '#a82a1a', type: 'effect' },
  trueno: { symbol: lightningBolt, color: '#5a5aa8', type: 'effect' },
  curacion: { symbol: cureWounds, color: '#3aa85a', type: 'effect' },
  monedas: { symbol: coinStack, color: '#c8a02a', type: 'effect' },
  golpe: { symbol: impact, color: '#c85a2a', type: 'effect' },
  'paso-de-pagina': { symbol: book, color: '#8a6a4a', type: 'effect' },
  // Los Cielos de Latón (steampunk).
  'vals-de-vapor': { symbol: musicBox, color: '#b8843a', type: 'music' },
  'persecucion-en-las-nubes': { symbol: airshipChase, color: '#3a7ab8', type: 'music' },
  'sala-de-maquinas': { symbol: enginePiston, color: '#8a5a2a', type: 'ambience' },
  'viento-en-cubierta': { symbol: deckWind, color: '#4a8aaa', type: 'ambience' },
  'silbato-de-vapor': { symbol: steamWhistle, color: '#a8843a', type: 'effect' },
  engranajes: { symbol: gearsPair, color: '#8a6a2a', type: 'effect' },
  'disparo-de-pistola': { symbol: pistolShot, color: '#a8542a', type: 'effect' },
  helices: { symbol: propeller, color: '#4a7a9a', type: 'effect' },
} satisfies Record<string, SoundIconSpec>;

export type SoundIconKey = keyof typeof SOUND_ICON_SPECS;

function typeBadge(type: SoundType): string {
  const glyph =
    type === 'music'
      ? path('M-5 6V-7L7 -9V4', { fill: 'none', stroke: '#fbf6ea', strokeWidth: 2.4 }) + circle(-7, 6, 3, { fill: '#fbf6ea' }) + circle(5, 4, 3, { fill: '#fbf6ea' })
      : type === 'ambience'
        ? path('M-9 -4Q-4 -9 0 -4T9 -4M-9 4Q-4 -1 0 4T9 4', { fill: 'none', stroke: '#fbf6ea', strokeWidth: 2.4, strokeLinecap: 'round' })
        : path('M2 -11L-6 1H0L-2 11L6 -1H0Z', { fill: '#fbf6ea' });
  return g({ transform: 'translate(212 212)' }, [circle(0, 0, 20, { fill: '#0b0a08', stroke: '#d4a63f', strokeWidth: 3 }), glyph]);
}

export function buildSoundIcon(spec: SoundIconSpec, title: string): string {
  const doc = new SvgDoc(256, 256, title);
  const bg = doc.def('soundBg', radialGradient('soundBg', [[0, shade(spec.color, -0.1)], [1, shade(spec.color, -0.8)]], { cx: 0.45, cy: 0.35, r: 0.8 }));
  doc.def('symbolShadow', DROP_SHADOW_FILTER);
  const bars: string[] = [];
  for (let i = 0; i < 14; i++) {
    const h = 10 + Math.abs(Math.sin(i * 1.7) * 26);
    bars.push(rect(30 + i * 14, 224 - h, 8, h, { rx: 3, fill: '#ffffff', opacity: 0.08 }));
  }
  doc.add(rect(4, 4, 248, 248, { rx: 38, fill: '#050403' }));
  doc.add(rect(10, 10, 236, 236, { rx: 32, fill: bg }));
  doc.add(...bars);
  doc.add(g({ transform: 'translate(36 30) scale(1.84)', filter: 'url(#symbolShadow)' }, spec.symbol(doc)));
  doc.add(rect(10, 10, 236, 236, { rx: 32, fill: 'none', stroke: shade(spec.color, 0.3), strokeWidth: 6 }));
  doc.add(typeBadge(spec.type));
  return doc.render();
}

