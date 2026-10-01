import { emptySpellData, type SpellAnimation, type SpellData } from '@wailers/shared';
import type { GadgetIconKey } from '../assets/icons';
import { seedUrl, spellIconFile } from '../assets/paths';
import { cat } from './categories';
import { entryId } from './ids';
import { seedEntry, type SeedEntry } from './types';

/**
 * "Los Cielos de Latón" has no magic: its "spells" are gadgets (artilugios) stored as spell entries.
 * They cost Vapor (the campaign's mana resource) and also carry a slot level for other rule systems.
 */

type GadgetRole = 'Ataque' | 'Curación' | 'Utilidad' | 'Control';
type DamageCategory = 'Fuego' | 'Rayo' | 'Veneno' | 'Fuerza' | 'Ninguno';
type GadgetClass = 'Ingeniero' | 'Aeronauta' | 'Pistolero' | 'Mecánico' | 'Inventor' | 'Duelista';
type Technology = 'Vapor' | 'Electricidad' | 'Mecánica' | 'Química';

interface GadgetDef {
  key: GadgetIconKey;
  name: string;
  description: string;
  level: number;
  role: GadgetRole;
  damageCategory: DamageCategory;
  technology: Technology;
  animation: SpellAnimation;
  classes: GadgetClass[];
  tags: string[];
  data: Partial<SpellData> & Pick<SpellData, 'manaCost' | 'effect'>;
}

const DEFS: GadgetDef[] = [
  {
    key: 'granada-de-vapor',
    name: 'Granada de vapor',
    description: 'Montas en segundos una granada con un cartucho de tu cinturón de artilugios y la lanzas: estalla en una nube de vapor abrasador.',
    level: 2,
    role: 'Ataque',
    damageCategory: 'Fuego',
    technology: 'Vapor',
    animation: 'fire',
    classes: ['Ingeniero', 'Inventor', 'Pistolero'],
    tags: ['área', 'explosivo', 'fuego'],
    data: { manaCost: 8, range: '18 m', components: 'Carcasa de latón y cartucho de vapor', effect: 'Esfera de 3 m de radio. Salvación de Destreza: mitad de daño si la supera. +1d6 por cada 4 de Vapor adicionales.', damage: '3d6', damageType: 'Fuego' },
  },
  {
    key: 'bobina-tesla',
    name: 'Bobina Tesla',
    description: 'Una bobina portátil descarga la presión acumulada en un arco eléctrico cegador que salta de un objetivo a otro.',
    level: 3,
    role: 'Ataque',
    damageCategory: 'Rayo',
    technology: 'Electricidad',
    animation: 'lightning',
    classes: ['Inventor', 'Ingeniero'],
    tags: ['línea', 'electricidad', 'antiautómatas'],
    data: { manaCost: 12, range: 'Línea de 18 m', components: 'Bobina de cobre y acumulador', effect: 'Línea de 18 m × 1,5 m. Salvación de Destreza: mitad de daño. Los constructos tienen desventaja en la salvación.', damage: '6d6', damageType: 'Rayo' },
  },
  {
    key: 'botiquin-de-engranajes',
    name: 'Botiquín de engranajes',
    description: 'Suturas mecánicas, vendas a presión y un tónico de caldera: remiendas a un aliado (o a un autómata) en plena refriega.',
    level: 1,
    role: 'Curación',
    damageCategory: 'Ninguno',
    technology: 'Mecánica',
    animation: 'heal',
    classes: ['Mecánico', 'Ingeniero', 'Inventor', 'Aeronauta'],
    tags: ['curación', 'reparación', 'toque'],
    data: { manaCost: 5, range: 'Toque', components: 'Botiquín de engranajes', effect: 'La criatura recupera PV (lo aplica el DM). En un constructo o autómata repara el doble. +1d8 por cada 3 de Vapor adicionales.', damage: '1d8 + modificador', damageType: 'Curación' },
  },
  {
    key: 'red-de-cables',
    name: 'Red de cables',
    description: 'Un lanzador neumático dispara una red de cable de acero lastrada que se cierra sobre los enemigos.',
    level: 2,
    role: 'Control',
    damageCategory: 'Ninguno',
    technology: 'Mecánica',
    animation: 'arcane',
    classes: ['Mecánico', 'Aeronauta', 'Inventor'],
    tags: ['control', 'apresar', 'red'],
    data: { manaCost: 6, range: '18 m', duration: 'Hasta 1 minuto', components: 'Lanzador de red', effect: 'Cubo de 3 m. Salvación de Destreza o queda apresado; para liberarse hace falta Fuerza CD 13 o cortar el cable con una herramienta.' },
  },
  {
    key: 'nube-de-hollin',
    name: 'Nube de hollín',
    description: 'Revientas un cartucho de hollín cáustico que oscurece el aire y hace toser hasta a los piratas más curtidos.',
    level: 2,
    role: 'Control',
    damageCategory: 'Veneno',
    technology: 'Química',
    animation: 'poison',
    classes: ['Inventor', 'Ingeniero'],
    tags: ['área', 'química', 'visión'],
    data: { manaCost: 8, range: '27 m', duration: 'Concentración, hasta 1 minuto', concentration: true, components: 'Cartucho de hollín', effect: 'Nube de 4,5 m de radio que bloquea la visión. Al entrar o empezar el turno dentro: salvación de Constitución o recibe el daño y queda cegado hasta el final de su turno (mitad de daño si la supera).', damage: '2d8', damageType: 'Veneno' },
  },
  {
    key: 'pulso-magnetico',
    name: 'Pulso magnético',
    description: 'Un electroimán de tu mochila libera una onda que detiene engranajes y arranca las armas de las manos.',
    level: 3,
    role: 'Control',
    damageCategory: 'Fuerza',
    technology: 'Electricidad',
    animation: 'arcane',
    classes: ['Inventor', 'Mecánico'],
    tags: ['antiautómatas', 'área', 'electricidad'],
    data: { manaCost: 10, range: 'Personal (radio de 6 m)', duration: '1 asalto', components: 'Electroimán y acumulador', effect: 'Los constructos en el área hacen una salvación de Constitución: si fallan, reciben el daño y quedan aturdidos hasta el final de tu siguiente turno. Las demás criaturas con armas de metal tienen −2 a sus ataques durante 1 asalto.', damage: '4d8', damageType: 'Fuerza' },
  },
  {
    key: 'arpon-neumatico',
    name: 'Arpón neumático',
    description: 'Un arpón con cable disparado por aire comprimido: sirve para atraer enemigos, cruzar abismos o saltar de un dirigible a otro.',
    level: 1,
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    technology: 'Vapor',
    animation: 'arcane',
    classes: ['Aeronauta', 'Pistolero', 'Duelista', 'Mecánico'],
    tags: ['movilidad', 'abordaje', 'cable'],
    data: { manaCost: 3, range: '18 m', components: 'Lanzaarpones de muñeca', effect: 'Ataque a distancia contra una criatura: si impacta, recibe el daño y puedes atraerla 3 m o desplazarte tú hasta ella. También te engancha a barandillas, salientes y cascos de dirigible.', damage: '1d10', damageType: 'Perforante' },
  },
  {
    key: 'bengala-de-magnesio',
    name: 'Bengala de magnesio',
    description: 'Disparas una bengala de luz blanca que deslumbra a los enemigos cercanos y se ve a millas de distancia.',
    level: 0,
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    technology: 'Química',
    animation: 'holy',
    classes: ['Aeronauta', 'Pistolero', 'Ingeniero', 'Duelista'],
    tags: ['luz', 'señal', 'deslumbrar'],
    data: { manaCost: 0, slotLevel: 0, range: '36 m', duration: '10 minutos', components: 'Cartucho de magnesio', effect: 'Ilumina 12 m de radio. Las criaturas a 1,5 m del impacto hacen una salvación de Constitución o quedan cegadas hasta el final de su siguiente turno.' },
  },
  {
    key: 'escudo-de-presion',
    name: 'Escudo de presión',
    description: 'Una válvula de tu brazal libera una cortina de vapor a presión justo cuando el golpe va a alcanzarte.',
    level: 1,
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    technology: 'Vapor',
    animation: 'arcane',
    classes: ['Ingeniero', 'Duelista', 'Mecánico', 'Pistolero'],
    tags: ['defensa', 'reacción', 'vapor'],
    data: { manaCost: 4, castingTime: '1 reacción', range: 'Personal', duration: '1 asalto', components: 'Brazal de válvulas', effect: '+5 a la CA contra el ataque que la provoca y hasta el inicio de tu siguiente turno.' },
  },
];

export function gadgetId(key: string): string {
  return entryId('spell', key);
}

export const GADGET_ENTRIES: SeedEntry<'spell'>[] = DEFS.map((d) =>
  seedEntry<'spell'>({
    id: gadgetId(d.key),
    kind: 'spell',
    name: d.name,
    description: d.description,
    imageUrl: seedUrl(spellIconFile(d.key)),
    tags: ['#steampunk', '#artilugio', ...d.tags],
    categoryIds: [
      cat('spell', 'Tecnología', d.technology),
      cat('spell', 'Tipo de daño', d.damageCategory),
      cat('spell', 'Rol', d.role),
      ...d.classes.map((c) => cat('spell', 'Clases', c)),
    ],
    origin: 'A',
    since: 2,
    level: d.level,
    data: {
      ...emptySpellData(),
      school: 'Artilugio',
      slotLevel: d.level,
      animation: d.animation,
      classes: [...d.classes],
      damageType: d.damageCategory === 'Ninguno' ? '' : d.damageCategory,
      castingTime: '1 acción',
      ...d.data,
    },
  }),
);
