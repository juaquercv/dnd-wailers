import { create } from 'zustand';
import type { Point } from '@wailers/shared';

/** Multi-click tools that build a point list. */
export type PolyTool = 'line' | 'wall' | 'fog';

/** In-progress (uncommitted) drawing shown on the preview layer. Points are absolute world px. */
export type CanvasDraft =
  | { kind: 'freehand'; points: number[] }
  | { kind: 'poly'; tool: PolyTool; points: number[] }
  | { kind: 'box'; shape: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number }
  | { kind: 'marquee'; x: number; y: number; width: number; height: number }
  | { kind: 'vertex'; target: 'wall' | 'fog'; points: number[] };

export interface DropGhost {
  x: number;
  y: number;
  radius: number;
  allowed: boolean;
}

export interface DragHint {
  text: string;
  tone: 'ok' | 'error';
}

export interface InlineEditState {
  id: string;
  /** Just created by a tool (empty texts are removed on commit). */
  isNew: boolean;
}

export interface CanvasView {
  x: number;
  y: number;
  scale: number;
}

interface CanvasUiState {
  /** Raw pointer position in world px (null when outside the canvas). */
  cursor: Point | null;
  /** Where the current tool would place/add (snapped when the grid snaps). */
  hover: Point | null;
  draft: CanvasDraft | null;
  view: CanvasView;
  dropGhost: DropGhost | null;
  dragHint: DragHint | null;
  uploads: number;
  editing: InlineEditState | null;
}

const INITIAL: CanvasUiState = {
  cursor: null,
  hover: null,
  draft: null,
  view: { x: 0, y: 0, scale: 1 },
  dropGhost: null,
  dragHint: null,
  uploads: 0,
  editing: null,
};

/**
 * Transient editor-canvas state (pointer, previews, inline editing, camera). Kept out of the editor store so
 * mouse moves only re-render the light preview/status components, never the scene layers.
 */
export const useCanvasUi = create<CanvasUiState>(() => ({ ...INITIAL }));

export function resetCanvasUi(): void {
  useCanvasUi.setState({ ...INITIAL, view: useCanvasUi.getState().view });
}

export function setCanvasDraft(draft: CanvasDraft | null): void {
  useCanvasUi.setState({ draft });
}

export function samePoint(a: Point | null, b: Point | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

/** Updates cursor/hover only when they actually changed. */
export function setCanvasPointer(cursor: Point | null, hover: Point | null): void {
  const s = useCanvasUi.getState();
  if (samePoint(s.cursor, cursor) && samePoint(s.hover, hover)) return;
  useCanvasUi.setState({ cursor, hover });
}
