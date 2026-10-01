import {
  adaptHeroToRules,
  createRuleSystem,
  emptyHeroData,
  inventoryItemFromEntry,
  newId,
  type HeroData,
  type HeroSpell,
  type InventoryItem,
  type LimitedUse,
} from '@wailers/shared';
import { portraitFile, seedUrl } from '../assets/paths';
import type { PortraitKey } from '../assets/portraits';
import { cat } from './categories';
import { STEAM_HERO_DEFS } from './heroesSteam';
import { entryId } from './ids';
import { itemEntry } from './items';
import { spellEntry } from './spells';
import { asLibraryEntry, seedEntry, type SeedEntry } from './types';

/** Seeded heroes: fantasy (one per user plus a second one for Juan and Adriel) and steampunk (one per user). Full sheets, adapted to both magic systems. */

type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface HeroDef {
  key: string;
  name: string;
  owner: string;
  portrait: PortraitKey;
  description: string;
  level: number;
  race: string;
  heroClass: string;
  subclass: string;
  alignment: string;
  roles: string[];
  abilities: Record<Ability, number>;
  hpMax: number;
  ac: number;
  speed: string;
  initiativeBonus: number;
  xp: number;
  gold: number;
  /** [item key, quantity, equipped] */
  inventory: [string, number, boolean][];
  /** [spell key, prepared] */
  spells: [string, boolean][];
  uses: Omit<LimitedUse, 'id' | 'used'>[];
  caster: boolean;
  /** Explicit max mana ("Vapor" in the steampunk campaign); default 10 × level + 10 for casters. */
  vapor?: number;
  visionCells: number | null;
  notes: string;
  tags: string[];
  origin?: 'A' | 'B';
  since?: number;
}

/** Fantasy heroes (seed v1). */
const FANTASY_DEFS: HeroDef[] = [
  {
    key: 'thorin-martillo-de-piedra',
    name: 'Thorin Martillo de Piedra',
    owner: 'juan',
    portrait: 'thorin',
    description: 'Enano guerrero de barba trenzada y escudo abollado. Nunca retrocede y nunca olvida una deuda.',
    level: 4,
    race: 'Enano',
    heroClass: 'Guerrero',
    subclass: 'Campeón',
    alignment: 'Legal bueno',
    roles: ['Tanque'],
    abilities: { str: 17, dex: 12, con: 16, int: 10, wis: 13, cha: 8 },
    hpMax: 44,
    ac: 18,
    speed: '7,5 m',
    initiativeBonus: 1,
    xp: 2900,
    gold: 85,
    inventory: [
      ['hacha-batalla', 1, true],
      ['cota-malla', 1, true],
      ['escudo-madera', 1, true],
      ['daga', 2, false],
      ['raciones', 5, false],
      ['pocion-curacion', 2, false],
    ],
    spells: [],
    uses: [
      { name: 'Segundo aliento', max: 1, resetOn: 'short' },
      { name: 'Oleada de acción', max: 1, resetOn: 'short' },
    ],
    caster: false,
    visionCells: 8,
    notes: 'Último heredero del clan Martillo de Piedra. Juró vengar la fortaleza de Khaz-Dumar, arrasada por un dragón carmesí hace cien años.',
    tags: ['enano', 'guerrero', 'tanque', 'venganza'],
  },
  {
    key: 'sombra',
    name: 'Sombra',
    owner: 'juan',
    portrait: 'sombra',
    description: 'Tiefling bruja de mirada dorada y voz suave. Nadie conoce su verdadero nombre, ni siquiera ella.',
    level: 3,
    race: 'Tiefling',
    heroClass: 'Brujo',
    subclass: 'Pacto Infernal',
    alignment: 'Caótico neutral',
    roles: ['Daño', 'Control'],
    abilities: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 17 },
    hpMax: 24,
    ac: 13,
    speed: '9 m',
    initiativeBonus: 2,
    xp: 1000,
    gold: 40,
    inventory: [
      ['armadura-cuero', 1, true],
      ['daga', 2, true],
      ['ballesta-ligera', 1, false],
      ['raciones', 3, false],
      ['gema-rubi', 1, false],
    ],
    spells: [
      ['explosion-sobrenatural', true],
      ['toque-sombrio', true],
      ['invisibilidad', true],
      ['dormir', true],
    ],
    uses: [{ name: 'Reprensión infernal', max: 1, resetOn: 'long' }],
    caster: true,
    visionCells: 8,
    notes: 'Hizo un pacto con un archidiablo para escapar de un culto. Su patrón le susurra en sueños sobre el Orbe de los Dragones.',
    tags: ['tiefling', 'bruja', 'pacto', 'misterio'],
  },
  {
    key: 'lyra-vientoalba',
    name: 'Lyra Vientoalba',
    owner: 'adriel',
    portrait: 'lyra',
    description: 'Elfa maga de cabello plateado y paciencia infinita. Cree que todo problema tiene solución... y que suele implicar fuego.',
    level: 5,
    race: 'Elfo',
    heroClass: 'Mago',
    subclass: 'Evocación',
    alignment: 'Neutral bueno',
    roles: ['Daño', 'Control'],
    abilities: { str: 8, dex: 15, con: 12, int: 18, wis: 13, cha: 10 },
    hpMax: 27,
    ac: 12,
    speed: '9 m',
    initiativeBonus: 2,
    xp: 6800,
    gold: 120,
    inventory: [
      ['daga', 1, true],
      ['pergamino-bola-fuego', 1, false],
      ['pocion-curacion', 1, false],
      ['raciones', 3, false],
    ],
    spells: [
      ['rayo-de-escarcha', true],
      ['luz', true],
      ['proyectil-magico', true],
      ['escudo', true],
      ['dormir', true],
      ['detectar-magia', false],
      ['telarana', true],
      ['bola-de-fuego', true],
      ['relampago', false],
    ],
    uses: [{ name: 'Recuperación arcana', max: 1, resetOn: 'long' }],
    caster: true,
    visionCells: 8,
    notes: 'Estudió en la Torre del Hechicero antes de que quedara sellada. Busca el grimorio perdido de su maestro, el archimago Orvandel.',
    tags: ['elfa', 'maga', 'evocación', 'erudita'],
  },
  {
    key: 'gwen-la-juglar',
    name: 'Gwen la Juglar',
    owner: 'adriel',
    portrait: 'gwen',
    description: 'Semielfa barda con un laúd lleno de pegatinas de tabernas. Su lengua corta más que cualquier espada.',
    level: 3,
    race: 'Semielfo',
    heroClass: 'Bardo',
    subclass: 'Colegio del Saber',
    alignment: 'Caótico bueno',
    roles: ['Apoyo', 'Sanador'],
    abilities: { str: 9, dex: 14, con: 12, int: 12, wis: 10, cha: 17 },
    hpMax: 21,
    ac: 13,
    speed: '9 m',
    initiativeBonus: 2,
    xp: 1100,
    gold: 65,
    inventory: [
      ['armadura-cuero', 1, true],
      ['daga', 1, true],
      ['arco-corto', 1, false],
      ['flechas', 1, false],
      ['pocion-curacion', 1, false],
      ['raciones', 2, false],
    ],
    spells: [
      ['burla-cruel', true],
      ['luz', true],
      ['palabra-sanadora', true],
      ['curar-heridas', true],
      ['dormir', true],
      ['ola-atronadora', true],
      ['invisibilidad', true],
    ],
    uses: [{ name: 'Inspiración bárdica', max: 3, resetOn: 'long' }],
    caster: true,
    visionCells: 8,
    notes: 'Recorre las tabernas del valle componiendo la balada del dragón carmesí. Le falta el final... y piensa vivirlo en primera fila.',
    tags: ['semielfa', 'barda', 'música', 'apoyo'],
  },
  {
    key: 'kael-pasoligero',
    name: 'Kael Pasoligero',
    owner: 'patrick',
    portrait: 'kael',
    description: 'Mediano pícaro de sonrisa encantadora y dedos aún más rápidos. Siempre sabe dónde está la salida.',
    level: 4,
    race: 'Mediano',
    heroClass: 'Pícaro',
    subclass: 'Ladrón',
    alignment: 'Caótico bueno',
    roles: ['Daño'],
    abilities: { str: 10, dex: 18, con: 12, int: 13, wis: 12, cha: 14 },
    hpMax: 27,
    ac: 15,
    speed: '7,5 m',
    initiativeBonus: 4,
    xp: 2800,
    gold: 150,
    inventory: [
      ['daga', 2, true],
      ['arco-corto', 1, true],
      ['flechas', 2, false],
      ['armadura-cuero', 1, true],
      ['herramientas-ladron', 1, false],
      ['gema-rubi', 1, false],
      ['pocion-curacion', 1, false],
    ],
    spells: [],
    uses: [],
    caster: false,
    visionCells: null,
    notes: 'Nadie sabe cómo entró en la cámara del tesoro del conde... ni cómo salió. Le debe un favor al Capitán Bandido.',
    tags: ['mediano', 'pícaro', 'sigilo', 'trampas'],
  },
  {
    key: 'hermana-isolde',
    name: 'Hermana Isolde',
    owner: 'javier',
    portrait: 'isolde',
    description: 'Clériga humana de la Llama Serena. Sana con una mano y aplasta cráneos de no-muertos con la otra.',
    level: 4,
    race: 'Humano',
    heroClass: 'Clérigo',
    subclass: 'Dominio de la Vida',
    alignment: 'Legal bueno',
    roles: ['Sanador'],
    abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 17, cha: 12 },
    hpMax: 31,
    ac: 18,
    speed: '9 m',
    initiativeBonus: 0,
    xp: 2750,
    gold: 30,
    inventory: [
      ['maza', 1, true],
      ['cota-malla', 1, true],
      ['escudo-madera', 1, true],
      ['pocion-curacion', 3, false],
      ['raciones', 4, false],
    ],
    spells: [
      ['llama-sagrada', true],
      ['luz', true],
      ['curar-heridas', true],
      ['palabra-sanadora', true],
      ['detectar-magia', true],
    ],
    uses: [{ name: 'Canalizar divinidad', max: 1, resetOn: 'short' }],
    caster: true,
    visionCells: null,
    notes: 'Fue enviada a Valdris para consagrar de nuevo la capilla en ruinas. Sueña cada noche con un trono de huesos.',
    tags: ['humana', 'clériga', 'curación', 'sagrado'],
  },
  {
    key: 'grak-el-salvaje',
    name: 'Grak el Salvaje',
    owner: 'campos',
    portrait: 'grak',
    description: 'Semiorco bárbaro de músculos tallados en piedra. Ríe a carcajadas cuando la pelea se pone seria.',
    level: 4,
    race: 'Semiorco',
    heroClass: 'Bárbaro',
    subclass: 'Berserker',
    alignment: 'Caótico neutral',
    roles: ['Tanque', 'Daño'],
    abilities: { str: 18, dex: 14, con: 16, int: 8, wis: 11, cha: 9 },
    hpMax: 45,
    ac: 15,
    speed: '12 m',
    initiativeBonus: 2,
    xp: 2950,
    gold: 20,
    inventory: [
      ['hacha-batalla', 1, true],
      ['jabalina', 4, false],
      ['raciones', 6, false],
      ['pocion-curacion', 1, false],
    ],
    spells: [],
    uses: [{ name: 'Furia', max: 3, resetOn: 'long' }],
    caster: false,
    visionCells: 8,
    notes: 'Expulsado de su tribu por perdonar la vida a un enemigo. Quiere demostrar que la fuerza también sirve para proteger.',
    tags: ['semiorco', 'bárbaro', 'furia', 'fuerza'],
  },
];

/** Fantasy heroes followed by one steampunk hero per user for "Los Cielos de Latón" (seed v2). */
const DEFS: HeroDef[] = [...FANTASY_DEFS, ...STEAM_HERO_DEFS.map((d) => ({ ...d, origin: 'A' as const, since: 2 }))];

function inventory(def: HeroDef): InventoryItem[] {
  return def.inventory.map(([key, quantity, equipped]) => ({ ...inventoryItemFromEntry(asLibraryEntry(itemEntry(key)), quantity), equipped }));
}

function spells(def: HeroDef): HeroSpell[] {
  return def.spells.map(([key, prepared]) => {
    const spell = spellEntry(key);
    return {
      id: newId('hsp'),
      entryId: spell.id,
      name: spell.name,
      level: spell.level ?? 0,
      manaCost: spell.data.manaCost,
      slotLevel: spell.data.slotLevel,
      animation: spell.data.animation,
      description: spell.data.effect || spell.description,
      prepared,
    };
  });
}

function heroData(def: HeroDef): HeroData {
  const base = emptyHeroData();
  let data: HeroData = {
    ...base,
    abilities: { ...def.abilities },
    hp: { current: def.hpMax, max: def.hpMax, temp: 0 },
    ac: def.ac,
    speed: def.speed,
    initiativeBonus: def.initiativeBonus,
    xp: def.xp,
    gold: def.gold,
    inventory: inventory(def),
    spells: spells(def),
    resources: {
      mana: def.caster ? { current: def.vapor ?? 10 * def.level + 10, max: def.vapor ?? 10 * def.level + 10 } : { current: 0, max: 0 },
      slots: [],
      uses: def.uses.map((u) => ({ ...u, id: newId('use'), used: 0 })),
    },
    visionCells: def.visionCells,
    notes: def.notes,
  };
  // Make the sheet ready for both campaign magic systems (never destroys existing values).
  data = adaptHeroToRules(data, createRuleSystem('mana'), def.level);
  data = adaptHeroToRules(data, createRuleSystem('slots'), def.level);
  return data;
}

export function heroId(key: string): string {
  return entryId('hero', key);
}

export const HERO_ENTRIES: SeedEntry<'hero'>[] = DEFS.map((d) =>
  seedEntry<'hero'>({
    id: heroId(d.key),
    kind: 'hero',
    name: d.name,
    description: d.description,
    imageUrl: seedUrl(portraitFile(d.portrait)),
    tags: d.tags,
    categoryIds: [
      cat('hero', 'Raza', d.race),
      cat('hero', 'Clase', d.heroClass),
      cat('hero', 'Clase', d.heroClass, d.subclass),
      cat('hero', 'Alineamiento', d.alignment),
      ...d.roles.map((r) => cat('hero', 'Rol en el grupo', r)),
    ],
    ownerId: d.owner,
    origin: d.origin ?? null,
    since: d.since ?? 1,
    level: d.level,
    hp: d.hpMax,
    data: heroData(d),
  }),
);
