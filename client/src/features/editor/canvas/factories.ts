import {
  newId,
  type FogRegion,
  type ImageElement,
  type LayerId,
  type LightSource,
  type MarkerElement,
  type NoteElement,
  type PathElement,
  type Point,
  type ShapeElement,
  type TextElement,
  type TokenElement,
  type TransitionElement,
  type TransitionType,
  type Wall,
} from '@wailers/shared';
import { TRANSITION_STYLES } from '../../../map';
import type { ToolOptions } from '../editorStore';
import { round1, roundPoints, toRelativePoints } from './geometry';

/** Default look of new DM notes (matches the note renderer). */
export const NOTE_COLOR = '#f6e27a';
export const NOTE_SIZE = { width: 200, height: 150 } as const;
export const TRANSITION_SIZE = 70;
/** Max side of an image dropped on the canvas. */
export const MAX_DROPPED_IMAGE_SIDE = 800;

function base(layer: LayerId, p: Point, name: string) {
  return {
    id: newId('el'),
    layer,
    x: round1(p.x),
    y: round1(p.y),
    rotation: 0,
    hidden: false,
    locked: false,
    name,
  };
}

/** Freehand stroke or polyline from absolute points. */
export function createPathElement(
  absolutePoints: number[],
  opts: { layer: LayerId; tool: ToolOptions; closed: boolean; freehand: boolean },
): PathElement {
  const rel = toRelativePoints(absolutePoints);
  return {
    ...base(opts.layer, rel, opts.freehand ? 'Trazo' : opts.closed ? 'Polígono' : 'Línea'),
    type: 'path',
    points: rel.points,
    stroke: opts.tool.stroke,
    strokeWidth: opts.tool.strokeWidth,
    closed: opts.closed,
    fill: null,
    opacity: opts.tool.opacity,
  };
}

export function createShapeElement(
  shape: 'rect' | 'ellipse',
  rect: { x: number; y: number; width: number; height: number },
  opts: { layer: LayerId; tool: ToolOptions },
): ShapeElement {
  return {
    ...base(opts.layer, rect, shape === 'rect' ? 'Rectángulo' : 'Elipse'),
    type: 'shape',
    shape,
    width: Math.max(4, Math.round(rect.width)),
    height: Math.max(4, Math.round(rect.height)),
    fill: opts.tool.fill,
    stroke: opts.tool.stroke,
    strokeWidth: opts.tool.strokeWidth,
    opacity: opts.tool.opacity,
  };
}

export function createTextElement(p: Point, opts: { layer: LayerId; tool: ToolOptions }): TextElement {
  return {
    ...base(opts.layer, p, 'Texto'),
    type: 'text',
    text: 'Texto',
    fontSize: Math.max(6, Math.round(opts.tool.fontSize)),
    color: opts.tool.stroke,
  };
}

export function createMarkerElement(p: Point, opts: { layer: LayerId; tool: ToolOptions }): MarkerElement {
  return {
    ...base(opts.layer, p, 'Marcador'),
    type: 'marker',
    icon: opts.tool.markerIcon,
    label: '',
    color: opts.tool.markerColor,
  };
}

export function createTransitionElement(p: Point, transitionType: TransitionType): TransitionElement {
  const label = TRANSITION_STYLES[transitionType].label;
  return {
    ...base('objects', p, label),
    type: 'transition',
    transitionType,
    width: TRANSITION_SIZE,
    height: TRANSITION_SIZE,
    label,
    target: null,
  };
}

/** Note whose pin (top center) sits at p. */
export function createNoteElement(pin: Point): NoteElement {
  return {
    ...base('notes', { x: pin.x - NOTE_SIZE.width / 2, y: pin.y }, 'Nota'),
    type: 'note',
    text: '',
    color: NOTE_COLOR,
  };
}

export function createTokenElement(
  p: Point,
  entry: { id: string; name: string; imageUrl: string | null; kind: 'creature' | 'item' },
  cells: number,
): TokenElement {
  return {
    ...base('tokens', p, entry.name),
    type: 'token',
    entryId: entry.id,
    entryKind: entry.kind,
    label: entry.name,
    cells: Math.max(0.5, cells),
    imageUrl: entry.imageUrl,
    startHidden: false,
  };
}

/** Image scaled to fit MAX_DROPPED_IMAGE_SIDE, top-left at p. */
export function createImageElement(
  p: Point,
  image: { url: string; naturalWidth: number; naturalHeight: number; name: string },
  layer: LayerId,
): ImageElement {
  const { width, height } = fitImageSize(image.naturalWidth, image.naturalHeight);
  return {
    ...base(layer, p, image.name || 'Imagen'),
    type: 'image',
    url: image.url,
    width,
    height,
    opacity: 1,
    entryId: null,
  };
}

export function fitImageSize(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
  const w = naturalWidth > 0 ? naturalWidth : 400;
  const h = naturalHeight > 0 ? naturalHeight : 400;
  const k = Math.min(1, MAX_DROPPED_IMAGE_SIDE / Math.max(w, h));
  return { width: Math.max(4, Math.round(w * k)), height: Math.max(4, Math.round(h * k)) };
}

export function createWall(points: number[], kind: Wall['kind']): Wall {
  return { id: newId('wall'), points: roundPoints(points), kind, open: false };
}

export function createLight(p: Point, tool: ToolOptions): LightSource {
  return {
    id: newId('light'),
    x: round1(p.x),
    y: round1(p.y),
    radius: Math.max(10, Math.round(tool.lightRadius)),
    color: tool.lightColor,
    intensity: 0.9,
    flicker: true,
  };
}

/** Next free "Niebla N" name for a level. */
export function nextFogName(existing: FogRegion[]): string {
  let max = 0;
  for (const f of existing) {
    const m = /^Niebla\s+(\d+)$/i.exec(f.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Niebla ${Math.max(max, existing.length) + 1}`;
}

export function createFogRegion(points: number[], existing: FogRegion[]): FogRegion {
  return { id: newId('fog'), name: nextFogName(existing), points: roundPoints(points) };
}

/** File name without extension, used as the element name of dropped images. */
export function fileBaseName(name: string): string {
  const trimmed = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  return trimmed || 'Imagen';
}
