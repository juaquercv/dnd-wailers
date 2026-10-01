import type { Wall } from '@wailers/shared';
import type { EditorTool } from '../editorStore';
import type { CanvasDraft } from './canvasUiStore';

const WALL_KIND_LABELS: Record<Wall['kind'], string> = {
  wall: 'pared',
  door: 'puerta',
  window: 'ventana',
};

/** Tools whose placement follows the grid when snapping is on. */
export const SNAPPING_TOOLS: ReadonlySet<EditorTool> = new Set<EditorTool>([
  'select',
  'line',
  'rect',
  'ellipse',
  'text',
  'marker',
  'wall',
  'light',
  'fog',
  'transition',
  'note',
  'spawn',
]);

/** Status-bar hint for the active tool (and the drawing in progress). */
export function toolHint(tool: EditorTool, draft: CanvasDraft | null, wallKind: Wall['kind']): string {
  if (draft?.kind === 'poly') {
    const n = draft.points.length / 2;
    if (draft.tool === 'wall') {
      return n < 2
        ? `Haz clic para añadir puntos de ${WALL_KIND_LABELS[wallKind]}. Doble clic o Enter para terminar. Esc cancela.`
        : 'Haz clic para añadir puntos de pared. Doble clic o Enter para terminar. Retroceso quita el último punto.';
    }
    if (draft.tool === 'fog') {
      return n < 3
        ? 'Haz clic para añadir vértices de la niebla (mínimo 3). Esc cancela.'
        : 'Doble clic, Enter o clic en el primer punto para cerrar la niebla. Retroceso quita el último punto.';
    }
    return 'Haz clic para añadir puntos. Doble clic o Enter para terminar; clic en el primer punto para cerrar.';
  }
  if (draft?.kind === 'box') return 'Suelta para crear la forma. Mayús: proporción 1:1. Esc cancela.';
  if (draft?.kind === 'freehand') return 'Suelta el botón para terminar el trazo. Esc cancela.';
  if (draft?.kind === 'marquee') return 'Suelta para seleccionar los elementos que queden dentro del recuadro.';
  if (draft?.kind === 'vertex') return 'Suelta para mover el vértice.';

  switch (tool) {
    case 'select':
      return 'Clic para seleccionar (Mayús: añadir). Arrastra en vacío para seleccionar varios. Doble clic edita textos.';
    case 'pan':
      return 'Arrastra para desplazar la vista. La rueda del ratón acerca y aleja.';
    case 'draw':
      return 'Mantén pulsado y arrastra para dibujar a mano alzada.';
    case 'line':
      return 'Haz clic para añadir puntos. Doble clic o Enter para terminar.';
    case 'rect':
      return 'Arrastra para dibujar un rectángulo (Mayús: cuadrado). Un clic crea uno de tamaño estándar.';
    case 'ellipse':
      return 'Arrastra para dibujar una elipse (Mayús: círculo). Un clic crea una de tamaño estándar.';
    case 'text':
      return 'Haz clic donde quieras escribir un texto.';
    case 'marker':
      return 'Haz clic para colocar un marcador y escribe su etiqueta.';
    case 'wall':
      return `Haz clic para añadir puntos de ${WALL_KIND_LABELS[wallKind]}. Doble clic o Enter para terminar.`;
    case 'light':
      return 'Haz clic para colocar una fuente de luz.';
    case 'fog':
      return 'Haz clic para trazar una región de niebla. Doble clic o Enter para cerrarla.';
    case 'transition':
      return 'Haz clic para colocar una transición y elige su destino en Propiedades.';
    case 'note':
      return 'Haz clic para fijar una nota privada del DM (los jugadores nunca la ven).';
    case 'spawn':
      return 'Haz clic para fijar el punto de aparición de los héroes.';
    case 'erase':
      return 'Haz clic sobre un elemento, pared, luz o región de niebla para borrarlo.';
  }
}
