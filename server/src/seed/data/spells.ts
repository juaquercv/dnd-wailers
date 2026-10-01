import { emptySpellData, type SpellAnimation, type SpellData } from '@wailers/shared';
import type { SpellIconKey } from '../assets/icons';
import { seedUrl, spellIconFile } from '../assets/paths';
import { cat } from './categories';
import { GADGET_ENTRIES } from './gadgets';
import { entryId } from './ids';
import { seedEntry, type SeedEntry } from './types';

/** Seeded spells: each has both a mana cost and a slot level so it works under either rule system. */

type SpellRole = 'Ataque' | 'Curación' | 'Utilidad' | 'Control';
type DamageCategory = 'Fuego' | 'Frío' | 'Rayo' | 'Ácido' | 'Veneno' | 'Necrótico' | 'Radiante' | 'Fuerza' | 'Trueno' | 'Psíquico' | 'Ninguno';
type SpellClass = 'Mago' | 'Clérigo' | 'Druida' | 'Bardo' | 'Brujo' | 'Hechicero' | 'Paladín' | 'Explorador';

interface SpellDef {
  key: SpellIconKey;
  name: string;
  description: string;
  level: number;
  school: string;
  role: SpellRole;
  damageCategory: DamageCategory;
  animation: SpellAnimation;
  classes: SpellClass[];
  tags: string[];
  data: Partial<SpellData> & Pick<SpellData, 'manaCost' | 'effect'>;
}

const DEFS: SpellDef[] = [
  {
    key: 'bola-de-fuego',
    name: 'Bola de fuego',
    description: 'Una chispa sale disparada de tu dedo y estalla en una esfera de llamas rugientes.',
    level: 3,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Fuego',
    animation: 'fire',
    classes: ['Mago', 'Hechicero'],
    tags: ['área', 'fuego', 'explosión'],
    data: { manaCost: 15, range: '45 m', components: 'V, S, M (guano y azufre)', effect: 'Esfera de 6 m de radio. Salvación de Destreza: mitad de daño si la supera. +1d6 por cada nivel de espacio superior.', damage: '8d6', damageType: 'Fuego' },
  },
  {
    key: 'proyectil-magico',
    name: 'Proyectil mágico',
    description: 'Tres dardos de energía brillante salen de tus manos y buscan a sus objetivos sin fallar jamás.',
    level: 1,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Fuerza',
    animation: 'arcane',
    classes: ['Mago', 'Hechicero'],
    tags: ['infalible', 'arcano'],
    data: { manaCost: 5, range: '36 m', effect: 'Tres dardos que impactan automáticamente; puedes repartirlos entre varios objetivos. +1 dardo por nivel superior.', damage: '3 × (1d4+1)', damageType: 'Fuerza' },
  },
  {
    key: 'curar-heridas',
    name: 'Curar heridas',
    description: 'Una luz cálida cierra las heridas de la criatura que tocas.',
    level: 1,
    school: 'Evocación',
    role: 'Curación',
    damageCategory: 'Ninguno',
    animation: 'heal',
    classes: ['Clérigo', 'Druida', 'Bardo', 'Paladín', 'Explorador'],
    tags: ['curación', 'toque'],
    data: { manaCost: 5, range: 'Toque', effect: 'La criatura recupera PV. No afecta a muertos vivientes ni constructos. +1d8 por nivel superior.', damage: '1d8 + modificador', damageType: 'Curación' },
  },
  {
    key: 'relampago',
    name: 'Relámpago',
    description: 'Un rayo cegador recorre una línea recta frente a ti, chamuscando todo a su paso.',
    level: 3,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Rayo',
    animation: 'lightning',
    classes: ['Mago', 'Hechicero'],
    tags: ['línea', 'rayo', 'área'],
    data: { manaCost: 15, range: 'Línea de 30 m', components: 'V, S, M (pelaje y una vara de cristal)', effect: 'Línea de 30 m × 1,5 m. Salvación de Destreza: mitad de daño. Prende objetos inflamables.', damage: '8d6', damageType: 'Rayo' },
  },
  {
    key: 'cono-de-frio',
    name: 'Cono de frío',
    description: 'Una ráfaga de aire helado brota de tus manos y congela todo lo que alcanza.',
    level: 5,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Frío',
    animation: 'ice',
    classes: ['Mago', 'Hechicero'],
    tags: ['área', 'hielo', 'cono'],
    data: { manaCost: 25, range: 'Cono de 18 m', components: 'V, S, M (un pequeño cono de cristal)', effect: 'Salvación de Constitución: mitad de daño. Las criaturas que mueren quedan como estatuas de hielo.', damage: '8d8', damageType: 'Frío' },
  },
  {
    key: 'escudo',
    name: 'Escudo',
    description: 'Una barrera invisible de fuerza mágica aparece justo a tiempo para protegerte.',
    level: 1,
    school: 'Abjuración',
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    animation: 'arcane',
    classes: ['Mago', 'Hechicero'],
    tags: ['defensa', 'reacción'],
    data: { manaCost: 4, castingTime: '1 reacción', range: 'Personal', duration: '1 asalto', effect: '+5 a la CA hasta el inicio de tu siguiente turno, incluido el ataque que la provocó. Inmune a Proyectil mágico.' },
  },
  {
    key: 'luz',
    name: 'Luz',
    description: 'Haces que un objeto brille como una antorcha.',
    level: 0,
    school: 'Evocación',
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    animation: 'holy',
    classes: ['Bardo', 'Clérigo', 'Hechicero', 'Mago'],
    tags: ['truco', 'luz', 'exploración'],
    data: { manaCost: 0, slotLevel: 0, range: 'Toque', duration: '1 hora', components: 'V, M (una luciérnaga o musgo fosforescente)', effect: 'El objeto emite luz brillante en 6 m y tenue 6 m más, del color que elijas.' },
  },
  {
    key: 'palabra-sanadora',
    name: 'Palabra sanadora',
    description: 'Pronuncias una palabra de poder y las heridas de un aliado lejano se cierran.',
    level: 1,
    school: 'Evocación',
    role: 'Curación',
    damageCategory: 'Ninguno',
    animation: 'heal',
    classes: ['Bardo', 'Clérigo', 'Druida'],
    tags: ['curación', 'distancia', 'acción-adicional'],
    data: { manaCost: 4, castingTime: '1 acción adicional', range: '18 m', components: 'V', effect: 'Una criatura que veas recupera PV. +1d4 por nivel superior.', damage: '1d4 + modificador', damageType: 'Curación' },
  },
  {
    key: 'rayo-de-escarcha',
    name: 'Rayo de escarcha',
    description: 'Un haz gélido de luz azulada golpea a una criatura y entumece sus músculos.',
    level: 0,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Frío',
    animation: 'ice',
    classes: ['Mago', 'Hechicero'],
    tags: ['truco', 'hielo', 'ralentizar'],
    data: { manaCost: 0, slotLevel: 0, range: '18 m', effect: 'Ataque de conjuro a distancia. Si impacta, la velocidad del objetivo se reduce 3 m hasta tu siguiente turno.', damage: '1d8', damageType: 'Frío' },
  },
  {
    key: 'nube-venenosa',
    name: 'Nube venenosa',
    description: 'Una niebla verdosa y apestosa brota del suelo y se arrastra hacia tus enemigos.',
    level: 3,
    school: 'Conjuración',
    role: 'Control',
    damageCategory: 'Veneno',
    animation: 'poison',
    classes: ['Mago', 'Hechicero', 'Brujo'],
    tags: ['área', 'veneno', 'concentración'],
    data: { manaCost: 15, range: '36 m', duration: 'Concentración, hasta 1 minuto', concentration: true, effect: 'Esfera de 6 m de radio que bloquea la visión. Al entrar o empezar el turno dentro: salvación de Constitución o daño completo (mitad si supera). La nube se aleja 3 m de ti cada turno.', damage: '4d8', damageType: 'Veneno' },
  },
  {
    key: 'llama-sagrada',
    name: 'Llama sagrada',
    description: 'Una llama radiante desciende del cielo sobre una criatura que puedas ver.',
    level: 0,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Radiante',
    animation: 'holy',
    classes: ['Clérigo'],
    tags: ['truco', 'radiante', 'sagrado'],
    data: { manaCost: 0, slotLevel: 0, range: '18 m', effect: 'Salvación de Destreza o recibe el daño. No obtiene beneficio de la cobertura.', damage: '1d8', damageType: 'Radiante' },
  },
  {
    key: 'toque-sombrio',
    name: 'Toque sombrío',
    description: 'Una mano espectral y helada aferra a la criatura y le roba el aliento vital.',
    level: 0,
    school: 'Nigromancia',
    role: 'Ataque',
    damageCategory: 'Necrótico',
    animation: 'shadow',
    classes: ['Mago', 'Brujo', 'Hechicero'],
    tags: ['truco', 'necrótico', 'sombra'],
    data: { manaCost: 0, slotLevel: 0, range: '36 m', effect: 'Ataque de conjuro a distancia. El objetivo no puede recuperar PV hasta tu siguiente turno; los muertos vivientes además atacan con desventaja.', damage: '1d8', damageType: 'Necrótico' },
  },
  {
    key: 'dormir',
    name: 'Dormir',
    description: 'Un sopor mágico envuelve a las criaturas más débiles de la zona.',
    level: 1,
    school: 'Encantamiento',
    role: 'Control',
    damageCategory: 'Ninguno',
    animation: 'arcane',
    classes: ['Bardo', 'Hechicero', 'Mago'],
    tags: ['control', 'sueño', 'área'],
    data: { manaCost: 5, range: '27 m', duration: '1 minuto', components: 'V, S, M (arena fina o pétalos de rosa)', effect: 'Tira 5d8: duerme a criaturas en 6 m de radio empezando por la de menos PV hasta agotar el total. +2d8 por nivel superior.', damage: '5d8 (PV afectados)' },
  },
  {
    key: 'telarana',
    name: 'Telaraña',
    description: 'Gruesas hebras pegajosas llenan un cubo del espacio que elijas.',
    level: 2,
    school: 'Conjuración',
    role: 'Control',
    damageCategory: 'Ninguno',
    animation: 'arcane',
    classes: ['Mago', 'Hechicero'],
    tags: ['control', 'apresar', 'concentración'],
    data: { manaCost: 8, range: '18 m', duration: 'Concentración, hasta 1 hora', concentration: true, components: 'V, S, M (un trozo de telaraña)', effect: 'Cubo de 6 m de terreno difícil. Salvación de Destreza o queda apresado; prueba de Fuerza para liberarse. Las telarañas arden con facilidad.' },
  },
  {
    key: 'detectar-magia',
    name: 'Detectar magia',
    description: 'Durante un tiempo percibes el aura de la magia que te rodea.',
    level: 1,
    school: 'Adivinación',
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    animation: 'arcane',
    classes: ['Bardo', 'Clérigo', 'Druida', 'Mago', 'Paladín', 'Explorador', 'Hechicero'],
    tags: ['ritual', 'exploración', 'concentración'],
    data: { manaCost: 3, range: 'Personal (9 m)', duration: 'Concentración, hasta 10 minutos', concentration: true, effect: 'Sientes la presencia de magia a 9 m y puedes ver su aura y su escuela. Puede lanzarse como ritual.' },
  },
  {
    key: 'invisibilidad',
    name: 'Invisibilidad',
    description: 'La criatura que tocas desaparece de la vista.',
    level: 2,
    school: 'Ilusión',
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    animation: 'shadow',
    classes: ['Bardo', 'Brujo', 'Hechicero', 'Mago'],
    tags: ['sigilo', 'concentración'],
    data: { manaCost: 8, range: 'Toque', duration: 'Concentración, hasta 1 hora', concentration: true, components: 'V, S, M (una pestaña envuelta en goma)', effect: 'El objetivo es invisible hasta que ataque o lance un conjuro.' },
  },
  {
    key: 'agrandar-reducir',
    name: 'Agrandar/Reducir',
    description: 'Haces que una criatura o un objeto crezca o encoja durante un minuto.',
    level: 2,
    school: 'Transmutación',
    role: 'Utilidad',
    damageCategory: 'Ninguno',
    animation: 'arcane',
    classes: ['Hechicero', 'Mago'],
    tags: ['transmutación', 'tamaño', 'concentración'],
    data: { manaCost: 8, range: '9 m', duration: 'Concentración, hasta 1 minuto', concentration: true, effect: 'Agrandar: duplica el tamaño, ventaja en Fuerza y +1d4 al daño. Reducir: la mitad de tamaño, desventaja en Fuerza y −1d4 al daño.' },
  },
  {
    key: 'explosion-sobrenatural',
    name: 'Explosión sobrenatural',
    description: 'Un rayo de energía crepitante surge de tu pacto y golpea a tu enemigo.',
    level: 0,
    school: 'Evocación',
    role: 'Ataque',
    damageCategory: 'Fuerza',
    animation: 'shadow',
    classes: ['Brujo'],
    tags: ['truco', 'brujo', 'fuerza'],
    data: { manaCost: 0, slotLevel: 0, range: '36 m', effect: 'Ataque de conjuro a distancia. A partir de nivel 5 lanzas dos rayos (tres a nivel 11).', damage: '1d10', damageType: 'Fuerza' },
  },
  {
    key: 'burla-cruel',
    name: 'Burla cruel',
    description: 'Lanzas una retahíla de insultos cargados de magia que hieren la mente.',
    level: 0,
    school: 'Encantamiento',
    role: 'Ataque',
    damageCategory: 'Psíquico',
    animation: 'arcane',
    classes: ['Bardo'],
    tags: ['truco', 'bardo', 'psíquico'],
    data: { manaCost: 0, slotLevel: 0, range: '18 m', components: 'V', effect: 'Salvación de Sabiduría o recibe el daño y tiene desventaja en su siguiente ataque.', damage: '1d4', damageType: 'Psíquico' },
  },
  {
    key: 'ola-atronadora',
    name: 'Ola atronadora',
    description: 'Una onda de fuerza atronadora sale de ti y empuja a todo lo que te rodea.',
    level: 1,
    school: 'Evocación',
    role: 'Control',
    damageCategory: 'Trueno',
    animation: 'lightning',
    classes: ['Bardo', 'Druida', 'Hechicero', 'Mago'],
    tags: ['área', 'empujar', 'trueno'],
    data: { manaCost: 5, range: 'Personal (cubo de 4,5 m)', components: 'V, S', effect: 'Salvación de Constitución: si falla recibe el daño y es empujada 3 m. Se oye a 90 m.', damage: '2d8', damageType: 'Trueno' },
  },
  {
    key: 'salpicadura-acida',
    name: 'Salpicadura ácida',
    description: 'Arrojas una burbuja de ácido que revienta sobre uno o dos enemigos cercanos.',
    level: 0,
    school: 'Conjuración',
    role: 'Ataque',
    damageCategory: 'Ácido',
    animation: 'poison',
    classes: ['Hechicero', 'Mago'],
    tags: ['truco', 'ácido'],
    data: { manaCost: 0, slotLevel: 0, range: '18 m', effect: 'Una o dos criaturas a 1,5 m entre sí hacen una salvación de Destreza o reciben el daño.', damage: '1d6', damageType: 'Ácido' },
  },
];

export function spellId(key: string): string {
  return entryId('spell', key);
}

const FANTASY_SPELL_ENTRIES: SeedEntry<'spell'>[] = DEFS.map((d) =>
  seedEntry<'spell'>({
    id: spellId(d.key),
    kind: 'spell',
    name: d.name,
    description: d.description,
    imageUrl: seedUrl(spellIconFile(d.key)),
    tags: d.tags,
    categoryIds: [
      cat('spell', 'Escuela de magia', d.school),
      cat('spell', 'Tipo de daño', d.damageCategory),
      cat('spell', 'Rol', d.role),
      ...d.classes.map((c) => cat('spell', 'Clases', c)),
    ],
    level: d.level,
    data: {
      ...emptySpellData(),
      school: d.school,
      slotLevel: d.level,
      animation: d.animation,
      classes: [...d.classes],
      damageType: d.damageCategory === 'Ninguno' ? '' : d.damageCategory,
      ...d.data,
    },
  }),
);

/** Fantasy spells (seed v1) followed by the gadgets of "Los Cielos de Latón" (seed v2). */
export const SPELL_ENTRIES: SeedEntry<'spell'>[] = [...FANTASY_SPELL_ENTRIES, ...GADGET_ENTRIES];

export function spellEntry(key: string): SeedEntry<'spell'> {
  const found = SPELL_ENTRIES.find((e) => e.id === spellId(key));
  if (!found) throw new Error(`Hechizo de semilla inexistente: ${key}`);
  return found;
}
