import type { LucideIcon } from 'lucide-react';
import {
  BrickWall,
  Circle,
  CloudFog,
  DoorOpen,
  Eraser,
  Flag,
  Hand,
  Lightbulb,
  MapPin,
  MousePointer2,
  Pencil,
  Spline,
  Square,
  StickyNote,
  Type,
} from 'lucide-react';
import type { EditorTool } from '../editorStore';

export type ToolGroupId = 'navigate' | 'draw' | 'map' | 'dm';

export interface ToolDef {
  id: EditorTool;
  label: string;
  /** Single-letter shortcut (lowercase, no modifiers). */
  key: string;
  icon: LucideIcon;
  group: ToolGroupId;
  /** Short usage hint shown in the toolbar options row. */
  hint: string;
}

export const TOOL_GROUPS: { id: ToolGroupId; label: string }[] = [
  { id: 'navigate', label: 'Navegación' },
  { id: 'draw', label: 'Dibujo' },
  { id: 'map', label: 'Mapa' },
  { id: 'dm', label: 'Herramientas del DM' },
];

export const EDITOR_TOOLS: readonly ToolDef[] = [
  {
    id: 'select',
    label: 'Seleccionar',
    key: 'v',
    icon: MousePointer2,
    group: 'navigate',
    hint: 'Haz clic en un elemento para seleccionarlo y arrástralo para moverlo.',
  },
  {
    id: 'pan',
    label: 'Desplazar vista',
    key: 'h',
    icon: Hand,
    group: 'navigate',
    hint: 'Arrastra para mover la vista. La rueda del ratón acerca y aleja.',
  },
  {
    id: 'draw',
    label: 'Dibujo libre',
    key: 'b',
    icon: Pencil,
    group: 'draw',
    hint: 'Mantén pulsado y arrastra para dibujar a mano alzada.',
  },
  {
    id: 'line',
    label: 'Línea',
    key: 'l',
    icon: Spline,
    group: 'draw',
    hint: 'Haz clic para añadir puntos; doble clic o Intro para terminar.',
  },
  { id: 'rect', label: 'Rectángulo', key: 'r', icon: Square, group: 'draw', hint: 'Arrastra para dibujar un rectángulo.' },
  { id: 'ellipse', label: 'Elipse', key: 'e', icon: Circle, group: 'draw', hint: 'Arrastra para dibujar una elipse.' },
  { id: 'text', label: 'Texto', key: 't', icon: Type, group: 'draw', hint: 'Haz clic donde quieras escribir un texto.' },
  {
    id: 'marker',
    label: 'Marcador',
    key: 'm',
    icon: MapPin,
    group: 'draw',
    hint: 'Haz clic para colocar un marcador con icono y etiqueta.',
  },
  {
    id: 'wall',
    label: 'Pared',
    key: 'w',
    icon: BrickWall,
    group: 'map',
    hint: 'Haz clic para añadir puntos; doble clic o Intro para terminar. Las paredes y puertas cerradas bloquean la visión.',
  },
  {
    id: 'light',
    label: 'Luz',
    key: 'i',
    icon: Lightbulb,
    group: 'map',
    hint: 'Haz clic para colocar una fuente de luz (antorcha, farol, cristal…).',
  },
  {
    id: 'fog',
    label: 'Niebla',
    key: 'f',
    icon: CloudFog,
    group: 'map',
    hint: 'Haz clic para trazar una región oculta; doble clic o Intro para cerrarla. Se revela durante la partida.',
  },
  {
    id: 'transition',
    label: 'Transición',
    key: 'd',
    icon: DoorOpen,
    group: 'map',
    hint: 'Haz clic para colocar una puerta, entrada, escalera o portal y elige su destino en Propiedades.',
  },
  {
    id: 'note',
    label: 'Nota del DM',
    key: 'n',
    icon: StickyNote,
    group: 'dm',
    hint: 'Haz clic para fijar una nota privada. Los jugadores nunca la ven.',
  },
  {
    id: 'spawn',
    label: 'Punto de aparición',
    key: 's',
    icon: Flag,
    group: 'dm',
    hint: 'Haz clic para fijar dónde aparecen los héroes al empezar la campaña.',
  },
  {
    id: 'erase',
    label: 'Borrar',
    key: 'x',
    icon: Eraser,
    group: 'dm',
    hint: 'Haz clic sobre un elemento, pared, luz o región de niebla para borrarlo.',
  },
];

export const TOOL_BY_ID: Record<EditorTool, ToolDef> = Object.fromEntries(EDITOR_TOOLS.map((t) => [t.id, t])) as Record<
  EditorTool,
  ToolDef
>;

/** Tools that create layered scene elements (they use toolOptions.activeLayer). */
export const LAYERED_TOOLS: ReadonlySet<EditorTool> = new Set<EditorTool>(['draw', 'line', 'rect', 'ellipse', 'text', 'marker']);
