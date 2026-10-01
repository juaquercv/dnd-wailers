import type { LucideIcon } from 'lucide-react';
import {
  BrickWall,
  CloudFog,
  DoorOpen,
  Grid2x2,
  Image as ImageIcon,
  Lightbulb,
  MapPin,
  Shapes,
  Spline,
  StickyNote,
  Swords,
  Type,
} from 'lucide-react';
import type { SceneElement, SceneElementType, TransitionType, Wall } from '@wailers/shared';

export const ELEMENT_TYPE_INFO: Record<SceneElementType, { label: string; icon: LucideIcon }> = {
  image: { label: 'Imagen', icon: ImageIcon },
  shape: { label: 'Forma', icon: Shapes },
  path: { label: 'Trazo', icon: Spline },
  text: { label: 'Texto', icon: Type },
  marker: { label: 'Marcador', icon: MapPin },
  token: { label: 'Ficha', icon: Swords },
  transition: { label: 'Transición', icon: DoorOpen },
  note: { label: 'Nota del DM', icon: StickyNote },
};

export const SELECTION_KIND_INFO = {
  wall: { label: 'Pared', icon: BrickWall },
  light: { label: 'Luz', icon: Lightbulb },
  fog: { label: 'Región de niebla', icon: CloudFog },
} satisfies Record<string, { label: string; icon: LucideIcon }>;

export const WALL_KIND_INFO: Record<Wall['kind'], { label: string; icon: LucideIcon; description: string }> = {
  wall: { label: 'Pared', icon: BrickWall, description: 'Bloquea la visión y el paso.' },
  door: { label: 'Puerta', icon: DoorOpen, description: 'Bloquea la visión mientras está cerrada; el DM la abre en la partida.' },
  window: { label: 'Ventana', icon: Grid2x2, description: 'Deja ver a través, pero no se puede cruzar.' },
};

export const WALL_KINDS: Wall['kind'][] = ['wall', 'door', 'window'];

export const TRANSITION_TYPES: TransitionType[] = ['door', 'entrance', 'stairs_up', 'stairs_down', 'portal'];

export const TRANSITION_TYPE_LABELS: Record<TransitionType, string> = {
  door: 'Puerta',
  entrance: 'Entrada',
  stairs_up: 'Escalera ↑',
  stairs_down: 'Escalera ↓',
  portal: 'Portal',
};

export const TRANSITION_TYPE_ICONS: Record<TransitionType, string> = {
  door: '🚪',
  entrance: '🏛️',
  stairs_up: '⬆️',
  stairs_down: '⬇️',
  portal: '🌀',
};

/** Type used for the way back (stairs up ↔ stairs down, the rest stay the same). */
export function reciprocalTransitionType(type: TransitionType): TransitionType {
  if (type === 'stairs_up') return 'stairs_down';
  if (type === 'stairs_down') return 'stairs_up';
  return type;
}

/** Short elevation badge: "+2", "0", "−1". */
export function elevationBadge(elevation: number): string {
  if (elevation > 0) return `+${elevation}`;
  if (elevation < 0) return `−${Math.abs(elevation)}`;
  return '0';
}

/** Descriptive floor name for an elevation. */
export function elevationName(elevation: number): string {
  if (elevation === 0) return 'Planta baja';
  if (elevation > 0) return `Planta ${elevation}`;
  return elevation === -1 ? 'Sótano' : `Sótano ${Math.abs(elevation)}`;
}

/** Human title of a scene element ("Rectángulo", "Marcador «Taberna»"…). */
export function elementTitle(el: SceneElement): string {
  const base =
    el.type === 'shape' ? (el.shape === 'ellipse' ? 'Elipse' : 'Rectángulo') : ELEMENT_TYPE_INFO[el.type].label;
  const named =
    el.name ||
    (el.type === 'marker' || el.type === 'token' || el.type === 'transition' ? el.label : '') ||
    (el.type === 'text' ? el.text.split('\n')[0]?.slice(0, 24) ?? '' : '');
  if (!named || named.trim().toLocaleLowerCase('es') === base.toLocaleLowerCase('es')) return base;
  return `${base} «${named}»`;
}

/** Drawing palette for map annotations (parchment, inks, terrain and magic tones). */
export const MAP_PALETTE = [
  '#f5e6c4',
  '#e9c063',
  '#c98a4b',
  '#7a5c3a',
  '#4a3b2a',
  '#2b2a24',
  '#0b0a08',
  '#ffffff',
  '#9b2c24',
  '#e0625a',
  '#27ae60',
  '#5fd07a',
  '#2980b9',
  '#7fd6ff',
  '#8a63f0',
  '#a98bff',
];

/** Light colors: torch, candle, moonlight, magic… */
export const LIGHT_PALETTE = ['#ffb347', '#ffd27a', '#fff3d6', '#ff7a3d', '#9fd3ff', '#c7b4ff', '#7dffb0', '#ff5e7a'];

/** Sticky-note colors. */
export const NOTE_PALETTE = ['#f3d58a', '#ffe680', '#ffb3c7', '#9fd3ff', '#9be3a8', '#d2b8ff', '#f3ead6', '#ff9b6b'];

/** Marker emoji picker (~50 fantasy icons). */
export const MARKER_EMOJIS = [
  '📍', '⭐', '❗', '❓', '⚠️', '🏰', '🏯', '🏠', '🛖', '⛪',
  '🗼', '🏛️', '⛺', '🏕️', '🗻', '🌋', '🌲', '🌳', '🌊', '🏝️',
  '🕳️', '⚓', '⛵', '🎈', '⚙️', '🗝️', '💰', '💎', '👑', '📜',
  '📖', '🧪', '🔮', '🗡️', '⚔️', '🛡️', '🏹', '🪓', '🔥', '💀',
  '☠️', '⚰️', '🐉', '👹', '👻', '🕷️', '🦇', '🐺', '🧙', '🍺',
];
