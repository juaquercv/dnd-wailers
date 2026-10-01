import { memo } from 'react';
import type Konva from 'konva';
import { Circle, Group } from 'react-konva';
import type { Point } from '@wailers/shared';
import { MAP_COLORS, setStageCursor } from '../../../map';
import { useCanvasUi } from './canvasUiStore';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export interface VertexHandlesProps {
  target: 'wall' | 'fog';
  id: string;
  points: number[];
  /** Fog regions are closed polygons (an extra midpoint between the last and first vertex). */
  closed: boolean;
  snap(p: Point, altKey: boolean): Point;
  onPreview(target: 'wall' | 'fog', points: number[] | null): void;
  onCommit(target: 'wall' | 'fog', id: string, points: number[]): void;
  onHandleMouseDown(e: KMouseEvent): void;
}

function snapBound(snap: (p: Point, altKey: boolean) => Point) {
  return function (this: Konva.Node, pos: Konva.Vector2d, evt?: unknown): Konva.Vector2d {
    const parent = this.getParent();
    if (!parent) return pos;
    const t = parent.getAbsoluteTransform();
    const local = t.copy().invert().point(pos);
    return t.point(snap(local, evt instanceof MouseEvent ? evt.altKey : false));
  };
}

function withPoint(points: number[], index: number, p: Point): number[] {
  const out = points.slice();
  out[index * 2] = p.x;
  out[index * 2 + 1] = p.y;
  return out;
}

function insertPoint(points: number[], index: number, p: Point): number[] {
  const out = points.slice();
  out.splice(index * 2, 0, p.x, p.y);
  return out;
}

function removePoint(points: number[], index: number): number[] {
  const out = points.slice();
  out.splice(index * 2, 2);
  return out;
}

/**
 * Editable vertices of the selected wall or fog region: drag a vertex to move it, drag a midpoint to insert
 * a new vertex, double-click a vertex to delete it. The shape preview lives on the draft layer until drop.
 */
export const VertexHandles = memo(function VertexHandles({ target, id, points, closed, snap, onPreview, onCommit, onHandleMouseDown }: VertexHandlesProps) {
  const scale = useCanvasUi((s) => s.view.scale);
  const k = 1 / Math.max(0.05, scale);
  const n = Math.floor(points.length / 2);
  const minPoints = closed ? 3 : 2;
  const bound = snapBound(snap);

  const hoverCursor = (cursor: string) => (e: KMouseEvent) => setStageCursor(e.target, cursor);
  const reset = (node: Konva.Node, p: Point) => node.position({ x: p.x, y: p.y });

  const vertices = [];
  const midpoints = [];
  for (let i = 0; i < n; i++) {
    const p = { x: points[i * 2] ?? 0, y: points[i * 2 + 1] ?? 0 };
    vertices.push(
      <Circle
        key={`v${i}`}
        x={p.x}
        y={p.y}
        radius={6 * k}
        fill={MAP_COLORS.gold400}
        stroke={MAP_COLORS.ink950}
        strokeWidth={1.5 * k}
        hitStrokeWidth={8 * k}
        draggable
        dragBoundFunc={bound}
        onMouseDown={onHandleMouseDown}
        onMouseEnter={hoverCursor('move')}
        onMouseLeave={hoverCursor('')}
        onDragMove={(e) => onPreview(target, withPoint(points, i, e.target.position()))}
        onDragEnd={(e) => {
          const next = e.target.position();
          reset(e.target, p);
          onPreview(target, null);
          if (next.x !== p.x || next.y !== p.y) onCommit(target, id, withPoint(points, i, next));
        }}
        onDblClick={(e) => {
          e.cancelBubble = true;
          if (n > minPoints) onCommit(target, id, removePoint(points, i));
        }}
      />,
    );
    const j = i + 1 < n ? i + 1 : closed && n >= 3 ? 0 : -1;
    if (j < 0) continue;
    const q = { x: points[j * 2] ?? 0, y: points[j * 2 + 1] ?? 0 };
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (Math.hypot(q.x - p.x, q.y - p.y) * scale < 28) continue;
    midpoints.push(
      <Circle
        key={`m${i}`}
        x={mid.x}
        y={mid.y}
        radius={4.5 * k}
        fill={MAP_COLORS.ink900}
        stroke={MAP_COLORS.gold400}
        strokeWidth={1.5 * k}
        opacity={0.85}
        hitStrokeWidth={8 * k}
        draggable
        dragBoundFunc={bound}
        onMouseDown={onHandleMouseDown}
        onMouseEnter={hoverCursor('copy')}
        onMouseLeave={hoverCursor('')}
        onDragMove={(e) => onPreview(target, insertPoint(points, i + 1, e.target.position()))}
        onDragEnd={(e) => {
          const next = e.target.position();
          reset(e.target, mid);
          onPreview(target, null);
          onCommit(target, id, insertPoint(points, i + 1, next));
        }}
      />,
    );
  }

  return (
    <Group>
      {midpoints}
      {vertices}
    </Group>
  );
});
