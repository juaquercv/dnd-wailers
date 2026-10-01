import type { EntryKind } from '@wailers/shared';
import { categoryId } from './ids';

/** Facets (root categories) and their values per entry kind. Values may nest (Arma › Cuerpo a cuerpo › Espada). */

export interface CategoryDef {
  name: string;
  color?: string;
  icon?: string;
  /** Seed version that introduced the category (default 1); children inherit it. */
  since?: number;
  children?: CategoryDef[];
}

const ELEMENTS: CategoryDef[] = [
  { name: 'Fuego', icon: '🔥', color: '#e8622a' },
  { name: 'Hielo', icon: '❄️', color: '#7fd6ff' },
  { name: 'Rayo', icon: '⚡', color: '#f0d040' },
  { name: 'Ácido', icon: '🧪', color: '#8ad04a' },
  { name: 'Veneno', icon: '☠️', color: '#6abf3a' },
  { name: 'Necrótico', icon: '💀', color: '#8a6ab8' },
  { name: 'Radiante', icon: '☀️', color: '#ffe680' },
];

const PHYSICAL: CategoryDef = { name: 'Físico', icon: '💪', color: '#b08a5a' };

export const CATEGORY_TREE: Record<EntryKind, CategoryDef[]> = {
  creature: [
    {
      name: 'Tipo de criatura',
      icon: '🐾',
      color: '#c0392b',
      children: [
        { name: 'Bestia', icon: '🐺' },
        { name: 'Dragón', icon: '🐉', color: '#c43d33' },
        { name: 'No-muerto', icon: '💀', color: '#8a6ab8' },
        { name: 'Humanoide', icon: '🧑' },
        { name: 'Demonio', icon: '😈', color: '#9b2c24' },
        { name: 'Elemental', icon: '🌪️' },
        { name: 'Gigante', icon: '🗿' },
        { name: 'Constructo', icon: '⚙️' },
        { name: 'Aberración', icon: '👁️', color: '#a35cff' },
        { name: 'Planta', icon: '🌿', color: '#4fc24f' },
        { name: 'Monstruosidad', icon: '🦂' },
        { name: 'Hada', icon: '🧚', color: '#ff7ab8' },
      ],
    },
    {
      name: 'Rol',
      icon: '⚔️',
      color: '#d4a63f',
      children: [
        { name: 'Jefe', icon: '👑', color: '#e9c063' },
        { name: 'Élite', icon: '⭐', color: '#a98bff' },
        { name: 'Esbirro', icon: '🗡️' },
        { name: 'NPC aliado', icon: '🤝', color: '#5fd07a' },
        { name: 'NPC neutral', icon: '😐' },
        { name: 'Comerciante', icon: '💰', color: '#e9c063' },
      ],
    },
    {
      name: 'Hábitat',
      icon: '🗺️',
      color: '#16a085',
      children: [
        { name: 'Bosque', icon: '🌲' },
        { name: 'Cueva', icon: '🕳️' },
        { name: 'Montaña', icon: '⛰️' },
        { name: 'Mar', icon: '🌊' },
        { name: 'Ciudad', icon: '🏰' },
        { name: 'Mazmorra', icon: '🗝️' },
        { name: 'Desierto', icon: '🏜️' },
        { name: 'Pantano', icon: '🐸' },
        { name: 'Cielo', icon: '☁️', color: '#7fb4d8', since: 2 },
        { name: 'Fábrica', icon: '🏭', color: '#b0703a', since: 2 },
      ],
    },
    { name: 'Afinidad elemental', icon: '✨', color: '#8e44ad', children: [...ELEMENTS, { name: 'Ninguna', icon: '⚪', color: '#9a9a9a' }] },
    { name: 'Resistencias', icon: '🛡️', color: '#2980b9', children: [...ELEMENTS, PHYSICAL] },
    { name: 'Debilidades', icon: '💔', color: '#e74c3c', children: [...ELEMENTS, PHYSICAL] },
  ],
  item: [
    {
      name: 'Tipo de objeto',
      icon: '🎒',
      color: '#d4a63f',
      children: [
        {
          name: 'Arma',
          icon: '⚔️',
          color: '#c0392b',
          children: [
            {
              name: 'Cuerpo a cuerpo',
              icon: '🗡️',
              children: [
                { name: 'Espada', icon: '⚔️' },
                { name: 'Hacha', icon: '🪓' },
                { name: 'Maza', icon: '🔨' },
                { name: 'Daga', icon: '🔪' },
                { name: 'Lanza', icon: '🔱' },
              ],
            },
            {
              name: 'A distancia',
              icon: '🏹',
              children: [
                { name: 'Arco', icon: '🏹' },
                { name: 'Ballesta', icon: '🎯' },
                { name: 'Arrojadiza', icon: '🪃' },
                { name: 'Arma de fuego', icon: '🔫', color: '#b0703a', since: 2 },
              ],
            },
          ],
        },
        {
          name: 'Armadura',
          icon: '🛡️',
          color: '#7f8c8d',
          children: [
            { name: 'Ligera', icon: '🧥' },
            { name: 'Media', icon: '🦺' },
            { name: 'Pesada', icon: '🛡️' },
          ],
        },
        { name: 'Escudo', icon: '🛡️', color: '#7f8c8d' },
        { name: 'Poción', icon: '🧪', color: '#e74c3c' },
        { name: 'Pergamino', icon: '📜', color: '#cdb98f' },
        { name: 'Anillo', icon: '💍', color: '#3d8bff' },
        { name: 'Amuleto', icon: '📿', color: '#a35cff' },
        { name: 'Herramienta', icon: '🔧' },
        { name: 'Consumible', icon: '🍖', color: '#e67e22' },
        { name: 'Munición', icon: '➶' },
        { name: 'Tesoro', icon: '💎', color: '#e9c063' },
        { name: 'Objeto de misión', icon: '🗝️', color: '#ff9b2f' },
        { name: 'Material', icon: '🪨' },
        { name: 'Artilugio', icon: '⚙️', color: '#c9a24a', since: 2 },
      ],
    },
  ],
  hero: [
    {
      name: 'Raza',
      icon: '🧝',
      color: '#16a085',
      children: [
        { name: 'Humano', icon: '🧑' },
        { name: 'Elfo', icon: '🧝' },
        { name: 'Enano', icon: '🧔' },
        { name: 'Mediano', icon: '🧒' },
        { name: 'Gnomo', icon: '🍄' },
        { name: 'Semiorco', icon: '👹' },
        { name: 'Semielfo', icon: '🌗' },
        { name: 'Tiefling', icon: '😈' },
        { name: 'Dracónido', icon: '🐲' },
        { name: 'Autómata', icon: '🤖', color: '#c9a24a', since: 2 },
      ],
    },
    {
      name: 'Clase',
      icon: '📖',
      color: '#d4a63f',
      children: [
        { name: 'Guerrero', icon: '⚔️', children: [{ name: 'Campeón' }, { name: 'Maestro de batalla' }] },
        { name: 'Mago', icon: '🧙', color: '#3d8bff', children: [{ name: 'Evocación' }, { name: 'Abjuración' }] },
        { name: 'Pícaro', icon: '🗡️', children: [{ name: 'Ladrón' }, { name: 'Asesino' }] },
        { name: 'Clérigo', icon: '✝️', color: '#ffe680', children: [{ name: 'Dominio de la Vida' }, { name: 'Dominio de la Luz' }] },
        { name: 'Bárbaro', icon: '🪓', color: '#c0392b', children: [{ name: 'Berserker' }] },
        { name: 'Bardo', icon: '🎻', color: '#ff7ab8', children: [{ name: 'Colegio del Saber' }] },
        { name: 'Druida', icon: '🌿', color: '#4fc24f', children: [{ name: 'Círculo de la Luna' }] },
        { name: 'Explorador', icon: '🏹', color: '#27ae60', children: [{ name: 'Cazador' }] },
        { name: 'Paladín', icon: '🛡️', color: '#f1c40f', children: [{ name: 'Juramento de Devoción' }] },
        { name: 'Brujo', icon: '👁️', color: '#8e44ad', children: [{ name: 'Pacto Infernal' }] },
        { name: 'Hechicero', icon: '🔥', color: '#e67e22', children: [{ name: 'Linaje Dracónico' }] },
        { name: 'Monje', icon: '🥋', children: [{ name: 'Camino de la Mano Abierta' }] },
        { name: 'Ingeniero', icon: '🔧', color: '#c9a24a', since: 2, children: [{ name: 'Maestro de calderas' }] },
        { name: 'Aeronauta', icon: '🎈', color: '#7fb4d8', since: 2, children: [{ name: 'Piloto de dirigible' }] },
        { name: 'Pistolero', icon: '🔫', color: '#b0703a', since: 2, children: [{ name: 'Tirador de élite' }] },
        { name: 'Mecánico', icon: '⚙️', color: '#8a909a', since: 2, children: [{ name: 'Chatarrero' }] },
        { name: 'Inventor', icon: '💡', color: '#e9c063', since: 2, children: [{ name: 'Artificiero' }] },
        { name: 'Duelista', icon: '🤺', color: '#c0392b', since: 2, children: [{ name: 'Esgrimista de salón' }] },
      ],
    },
    {
      name: 'Alineamiento',
      icon: '⚖️',
      color: '#7f8c8d',
      children: [
        { name: 'Legal bueno', icon: '😇' },
        { name: 'Neutral bueno', icon: '🙂' },
        { name: 'Caótico bueno', icon: '😄' },
        { name: 'Legal neutral', icon: '⚖️' },
        { name: 'Neutral', icon: '😐' },
        { name: 'Caótico neutral', icon: '🌀' },
        { name: 'Legal malvado', icon: '😠' },
        { name: 'Neutral malvado', icon: '😒' },
        { name: 'Caótico malvado', icon: '😈' },
      ],
    },
    {
      name: 'Rol en el grupo',
      icon: '🎭',
      color: '#2980b9',
      children: [
        { name: 'Tanque', icon: '🛡️', color: '#7f8c8d' },
        { name: 'Sanador', icon: '💚', color: '#5fd07a' },
        { name: 'Daño', icon: '⚔️', color: '#e74c3c' },
        { name: 'Apoyo', icon: '🎵', color: '#f1c40f' },
        { name: 'Control', icon: '🌀', color: '#8e44ad' },
      ],
    },
  ],
  spell: [
    {
      name: 'Escuela de magia',
      icon: '🔮',
      color: '#8e44ad',
      children: [
        { name: 'Abjuración', icon: '🛡️' },
        { name: 'Conjuración', icon: '🌀' },
        { name: 'Adivinación', icon: '👁️' },
        { name: 'Encantamiento', icon: '💫' },
        { name: 'Evocación', icon: '💥' },
        { name: 'Ilusión', icon: '🎭' },
        { name: 'Nigromancia', icon: '💀' },
        { name: 'Transmutación', icon: '⚗️' },
      ],
    },
    {
      name: 'Tipo de daño',
      icon: '💥',
      color: '#c0392b',
      children: [
        { name: 'Fuego', icon: '🔥', color: '#e8622a' },
        { name: 'Frío', icon: '❄️', color: '#7fd6ff' },
        { name: 'Rayo', icon: '⚡', color: '#f0d040' },
        { name: 'Ácido', icon: '🧪', color: '#8ad04a' },
        { name: 'Veneno', icon: '☠️', color: '#6abf3a' },
        { name: 'Necrótico', icon: '💀', color: '#8a6ab8' },
        { name: 'Radiante', icon: '☀️', color: '#ffe680' },
        { name: 'Fuerza', icon: '✴️', color: '#a98bff' },
        { name: 'Trueno', icon: '🔊', color: '#3d8bff' },
        { name: 'Psíquico', icon: '🧠', color: '#ff7ab8' },
        { name: 'Ninguno', icon: '⚪', color: '#9a9a9a' },
      ],
    },
    {
      name: 'Rol',
      icon: '🎯',
      color: '#d4a63f',
      children: [
        { name: 'Ataque', icon: '⚔️', color: '#e74c3c' },
        { name: 'Curación', icon: '💚', color: '#5fd07a' },
        { name: 'Utilidad', icon: '🔧', color: '#3d8bff' },
        { name: 'Control', icon: '🌀', color: '#8e44ad' },
      ],
    },
    {
      name: 'Clases',
      icon: '📚',
      color: '#2980b9',
      children: [
        { name: 'Mago', icon: '🧙' },
        { name: 'Clérigo', icon: '✝️' },
        { name: 'Druida', icon: '🌿' },
        { name: 'Bardo', icon: '🎻' },
        { name: 'Brujo', icon: '👁️' },
        { name: 'Hechicero', icon: '🔥' },
        { name: 'Paladín', icon: '🛡️' },
        { name: 'Explorador', icon: '🏹' },
        { name: 'Ingeniero', icon: '🔧', since: 2 },
        { name: 'Aeronauta', icon: '🎈', since: 2 },
        { name: 'Pistolero', icon: '🔫', since: 2 },
        { name: 'Mecánico', icon: '⚙️', since: 2 },
        { name: 'Inventor', icon: '💡', since: 2 },
        { name: 'Duelista', icon: '🤺', since: 2 },
      ],
    },
    {
      name: 'Tecnología',
      icon: '⚙️',
      color: '#c9a24a',
      since: 2,
      children: [
        { name: 'Vapor', icon: '♨️', color: '#d8dee4' },
        { name: 'Electricidad', icon: '⚡', color: '#7fd6ff' },
        { name: 'Mecánica', icon: '🔩', color: '#b0703a' },
        { name: 'Química', icon: '⚗️', color: '#8ad04a' },
      ],
    },
  ],
  zone: [
    {
      name: 'Bioma',
      icon: '🌍',
      color: '#27ae60',
      children: [
        { name: 'Bosque', icon: '🌲' },
        { name: 'Montaña', icon: '⛰️' },
        { name: 'Cueva', icon: '🕳️' },
        { name: 'Ciudad', icon: '🏰' },
        { name: 'Pradera', icon: '🌾' },
        { name: 'Pantano', icon: '🐸' },
        { name: 'Desierto', icon: '🏜️' },
        { name: 'Costa', icon: '🏖️' },
        { name: 'Volcán', icon: '🌋' },
        { name: 'Subterráneo', icon: '🦇' },
        { name: 'Cielo', icon: '☁️', since: 2 },
        { name: 'Industrial', icon: '🏭', since: 2 },
      ],
    },
    {
      name: 'Tipo',
      icon: '🏷️',
      color: '#2980b9',
      children: [
        { name: 'Exterior', icon: '☀️' },
        { name: 'Interior', icon: '🏠' },
        { name: 'Mazmorra', icon: '🗝️' },
        { name: 'Ciudad', icon: '🏰' },
        { name: 'Sub-zona', icon: '🚪' },
      ],
    },
  ],
  sound: [
    {
      name: 'Estado de ánimo',
      icon: '🎭',
      color: '#8e44ad',
      children: [
        { name: 'Combate', icon: '⚔️', color: '#e74c3c' },
        { name: 'Misterio', icon: '🔮', color: '#8e44ad' },
        { name: 'Calma', icon: '🍃', color: '#5fd07a' },
        { name: 'Épico', icon: '🐉', color: '#e9c063' },
        { name: 'Terror', icon: '👻', color: '#7f8c8d' },
      ],
    },
  ],
};

export interface CategoryRow {
  id: string;
  kind: EntryKind;
  name: string;
  parentId: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  depth: number;
  /** Seed version that introduced the row (used when upgrading an older database). */
  since: number;
}

function flatten(): CategoryRow[] {
  const rows: CategoryRow[] = [];
  const walk = (kind: EntryKind, defs: CategoryDef[], path: string[], parentId: string | null, depth: number, parentSince: number): void => {
    defs.forEach((def, index) => {
      const nextPath = [...path, def.name];
      const id = categoryId(kind, nextPath);
      const since = Math.max(parentSince, def.since ?? 1);
      rows.push({ id, kind, name: def.name, parentId, color: def.color ?? null, icon: def.icon ?? null, sortOrder: index, depth, since });
      if (def.children) walk(kind, def.children, nextPath, id, depth + 1, since);
    });
  };
  for (const [kind, defs] of Object.entries(CATEGORY_TREE) as [EntryKind, CategoryDef[]][]) walk(kind, defs, [], null, 0, 1);
  return rows;
}

export const CATEGORY_ROWS: CategoryRow[] = flatten();
const BY_ID = new Map(CATEGORY_ROWS.map((r) => [r.id, r]));

/** Category id for a path, e.g. cat('item', 'Tipo de objeto', 'Arma', 'Cuerpo a cuerpo', 'Espada'). Throws on typos. */
export function cat(kind: EntryKind, ...path: string[]): string {
  const id = categoryId(kind, path);
  if (!BY_ID.has(id)) throw new Error(`Categoría de semilla inexistente: ${kind} › ${path.join(' › ')}`);
  return id;
}

/** Names of the given categories and their ancestors, excluding facet roots (for searchText). */
export function categoryNames(ids: string[]): string[] {
  const names = new Set<string>();
  for (const id of ids) {
    let cur = BY_ID.get(id);
    while (cur && cur.depth > 0) {
      names.add(cur.name);
      cur = cur.parentId ? BY_ID.get(cur.parentId) : undefined;
    }
  }
  return [...names];
}
