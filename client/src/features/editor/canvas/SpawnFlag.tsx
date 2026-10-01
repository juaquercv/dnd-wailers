import { memo } from 'react';
import type Konva from 'konva';
import { Circle, Group, Line } from 'react-konva';
import type { GridConfig, Point } from '@wailers/shared';
import { MAP_COLORS, MapLabel, setStageCursor } from '../../../map';
import { hasUsableGrid } from './geometry';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export interface SpawnFlagProps {
  x: number;
  y: number;
  grid: GridConfig;
  draggable: boolean;
  /** Clickable (erase tool). */
  interactive: boolean;
  snap(p: Point, altKey: boolean): Point;
  onMouseDown(e: KMouseEvent): void;
  onClick(e: KMouseEvent): void;
  onDragEnd(x: number, y: number): void;
}

/** Heroes' spawn point on the current level: a banner on a pole inside a dashed cell ring. */
export const SpawnFlag = memo(function SpawnFlag({ x, y, grid, draggable, interactive, snap, onMouseDown, onClick, onDragEnd }: SpawnFlagProps) {
  const size = hasUsableGrid(grid) ? grid.size : 70;
  const r = size * 0.42;
  const pole = r * 1.95;
  const listening = draggable || interactive;
  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      listening={listening}
      dragBoundFunc={function (this: Konva.Node, pos: Konva.Vector2d, evt?: unknown) {
        const parent = this.getParent();
        if (!parent) return pos;
        const t = parent.getAbsoluteTransform();
        const local = t.copy().invert().point(pos);
        return t.point(snap(local, evt instanceof MouseEvent ? evt.altKey : false));
      }}
      onMouseDown={onMouseDown}
      onClick={(e) => {
        if (e.evt.button === 0) onClick(e);
      }}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        const node = e.currentTarget;
        const nx = node.x();
        const ny = node.y();
        node.position({ x, y });
        onDragEnd(nx, ny);
      }}
      onMouseEnter={(e) => {
        if (listening) setStageCursor(e.target, draggable ? 'move' : 'pointer');
      }}
      onMouseLeave={(e) => {
        if (listening) setStageCursor(e.target, '');
      }}
    >
      <Circle
        radius={r}
        fill="rgba(233, 192, 99, 0.12)"
        stroke={MAP_COLORS.gold400}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[7, 5]}
        shadowColor={MAP_COLORS.gold400}
        shadowBlur={10}
        shadowOpacity={0.5}
        perfectDrawEnabled={false}
      />
      <Circle radius={Math.max(3, r * 0.14)} fill={MAP_COLORS.gold300} stroke={MAP_COLORS.ink950} strokeWidth={1} perfectDrawEnabled={false} />
      <Line points={[0, 0, 0, -pole]} stroke={MAP_COLORS.ink950} strokeWidth={Math.max(3, r * 0.12)} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[0, 0, 0, -pole]} stroke={MAP_COLORS.parchment200} strokeWidth={Math.max(1.5, r * 0.06)} lineCap="round" perfectDrawEnabled={false} />
      <Line
        points={[0, -pole, r * 1.15, -pole + r * 0.32, r * 0.85, -pole + r * 0.48, r * 1.15, -pole + r * 0.66, 0, -pole + r * 0.8]}
        closed
        fillLinearGradientStartPoint={{ x: 0, y: -pole }}
        fillLinearGradientEndPoint={{ x: r * 1.15, y: -pole + r * 0.8 }}
        fillLinearGradientColorStops={[0, MAP_COLORS.gold300, 1, MAP_COLORS.gold600]}
        stroke={MAP_COLORS.gold700}
        strokeWidth={1}
        shadowColor="#000000"
        shadowBlur={6}
        shadowOpacity={0.6}
        shadowOffsetY={2}
        perfectDrawEnabled={false}
      />
      <MapLabel text="Aparición de los héroes" y={r + 4} anchor="top" fontSize={12} borderColor="rgba(233, 192, 99, 0.75)" textColor={MAP_COLORS.gold300} listening={listening} />
    </Group>
  );
});
