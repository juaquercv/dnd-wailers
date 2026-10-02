import { memo, useCallback, useMemo } from 'react';
import type Konva from 'konva';
import { Circle, Group, Line, Shape, Text } from 'react-konva';
import { hexAt, hexCorners, hexDistance, hexToPixel, squareCellAt, type GridConfig, type Point, type Wall } from '@wailers/shared';
import { FONT_EMOJI, MAP_COLORS, MapLabel, setStageCursor, useMapView } from '../../../map';

const REACH_FILL = 'rgba(52, 211, 153, 0.13)';
const REACH_STROKE = 'rgba(52, 211, 153, 0.85)';
const OVER_COLOR = '#e0625a';

/** Polygons (flat point lists) of the cells within `cells` steps of `origin` (square: one block; hex: each hex). */
function reachPolygons(origin: Point, cells: number, grid: GridConfig, width: number, height: number): number[][] {
  const n = Math.max(0, Math.floor(cells));
  if (!(grid.size > 0)) return [];
  if (grid.type === 'hex') {
    const center = hexAt(origin, grid);
    const out: number[][] = [];
    for (let dq = -n; dq <= n; dq++) {
      for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
        const h = { q: center.q + dq, r: center.r + dr };
        if (hexDistance(center, h) > n) continue;
        const c = hexToPixel(h, grid);
        if (c.x < 0 || c.y < 0 || c.x > width || c.y > height) continue;
        out.push(hexCorners(c, grid).flatMap((p) => [p.x, p.y]));
      }
    }
    return out;
  }
  const { col, row } = squareCellAt(origin, grid);
  const ox = Number.isFinite(grid.offsetX) ? grid.offsetX : 0;
  const oy = Number.isFinite(grid.offsetY) ? grid.offsetY : 0;
  const x0 = Math.max(0, ox + (col - n) * grid.size);
  const y0 = Math.max(0, oy + (row - n) * grid.size);
  const x1 = Math.min(width, ox + (col + n + 1) * grid.size);
  const y1 = Math.min(height, oy + (row + n + 1) * grid.size);
  if (x1 <= x0 || y1 <= y0) return [];
  return [[x0, y0, x1, y0, x1, y1, x0, y1]];
}

export interface ReachAreaProps {
  origin: Point;
  /** Movement left this turn, in cells. */
  cells: number;
  grid: GridConfig;
  width: number;
  height: number;
}

/** Cells the hero can still reach this turn (shown while the player drags their hero in combat). */
export const ReachArea = memo(function ReachArea({ origin, cells, grid, width, height }: ReachAreaProps) {
  const polygons = useMemo(() => reachPolygons(origin, cells, grid, width, height), [origin, cells, grid, width, height]);
  const sceneFunc = useCallback(
    (ctx: Konva.Context) => {
      const c = ctx._context;
      c.save();
      c.fillStyle = REACH_FILL;
      c.strokeStyle = REACH_STROKE;
      c.lineWidth = Math.max(1.5, grid.size * 0.03);
      c.setLineDash(grid.type === 'hex' ? [] : [grid.size * 0.18, grid.size * 0.12]);
      for (const poly of polygons) {
        c.beginPath();
        c.moveTo(poly[0]!, poly[1]!);
        for (let i = 2; i + 1 < poly.length; i += 2) c.lineTo(poly[i]!, poly[i + 1]!);
        c.closePath();
        c.fill();
        if (grid.type !== 'hex') c.stroke();
      }
      c.restore();
    },
    [polygons, grid],
  );
  if (polygons.length === 0) return null;
  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
});

export interface DragRulerProps {
  from: Point;
  to: Point;
  /** Cells between from and to. */
  cost: number;
  /** Movement left (null = no limit: plain distance). */
  limit: number | null;
}

/** Dashed line from where the token was to where it is being dragged, with the distance in cells. */
export function DragRuler({ from, to, cost, limit }: DragRulerProps) {
  const view = useMapView();
  const k = 1 / Math.max(0.05, view.scale || 1);
  const over = limit !== null && cost > limit;
  const color = over ? OVER_COLOR : limit !== null ? MAP_COLORS.emerald400 : MAP_COLORS.gold300;
  const unit = (n: number) => (n === 1 ? 'casilla' : 'casillas');
  const text = limit !== null ? `${cost} / ${limit} ${unit(limit)}${over ? ' · demasiado lejos' : ''}` : `${cost} ${unit(cost)}`;
  // Near the top of the viewport the label goes below the token so it stays readable.
  const below = to.y * (view.scale || 1) + view.y < 80;
  return (
    <Group listening={false}>
      <Line points={[from.x, from.y, to.x, to.y]} stroke={color} strokeWidth={2.5} dash={[10, 7]} strokeScaleEnabled={false} lineCap="round" opacity={0.9} />
      <Circle x={from.x} y={from.y} radius={5 * k} fill={color} opacity={0.9} />
      <Group x={to.x} y={to.y} scaleX={k} scaleY={k}>
        <MapLabel
          text={text}
          y={below ? 38 : -38}
          anchor={below ? 'top' : 'bottom'}
          fontSize={13}
          paddingX={10}
          paddingY={4}
          textColor={over ? '#ffe2df' : MAP_COLORS.parchment50}
          background={over ? 'rgba(80, 16, 12, 0.94)' : 'rgba(11, 10, 8, 0.9)'}
          borderColor={color}
        />
      </Group>
    </Group>
  );
}

function polylineCenter(points: number[]): Point {
  let total = 0;
  const segs: { a: Point; b: Point; len: number }[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    const a = { x: points[i]!, y: points[i + 1]! };
    const b = { x: points[i + 2]!, y: points[i + 3]! };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len });
    total += len;
  }
  let half = total / 2;
  for (const s of segs) {
    if (half <= s.len && s.len > 0) {
      const t = half / s.len;
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
    half -= s.len;
  }
  return { x: points[0] ?? 0, y: points[1] ?? 0 };
}

export interface PlayerDoor {
  wall: Wall;
  open: boolean;
}

/**
 * Handle position: the door centre or, when the hero token would cover it, the closest point along the door
 * line that clears the token (the name plate hangs below the token, so sideways stays visible).
 */
function handlePoint(wall: Wall, r: number, avoid: { x: number; y: number; r: number } | null): Point {
  const c = polylineCenter(wall.points);
  if (!avoid) return c;
  const min = avoid.r + r + 4;
  if (Math.hypot(c.x - avoid.x, c.y - avoid.y) >= min) return c;
  const n = wall.points.length;
  let dx = (wall.points[n - 2] ?? 0) - (wall.points[0] ?? 0);
  let dy = (wall.points[n - 1] ?? 0) - (wall.points[1] ?? 0);
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: avoid.x, y: avoid.y - min };
  dx /= len;
  dy /= len;
  const along = (avoid.x - c.x) * dx + (avoid.y - c.y) * dy;
  const perp = Math.abs((avoid.x - c.x) * dy - (avoid.y - c.y) * dx);
  const need = Math.sqrt(Math.max(0, min * min - perp * perp));
  const a = along + need;
  const b = along - need;
  const s = Math.abs(a) < Math.abs(b) ? a : b;
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** Open/close handles on the doors next to the player's hero (free action, no movement spent). */
export function PlayerDoorHandles({
  doors,
  gridSize,
  interactive,
  avoid,
  onToggle,
}: {
  doors: PlayerDoor[];
  gridSize: number;
  interactive: boolean;
  /** The hero token (handles never hide under it). */
  avoid: { x: number; y: number; r: number } | null;
  onToggle: (wall: Wall) => void;
}) {
  const view = useMapView();
  // Never smaller than ~13 screen px, so the handle stays easy to hit when zoomed out.
  const r = Math.max(12, (gridSize > 0 ? gridSize : 70) * 0.22, 13 / Math.max(0.05, view.scale || 1));
  return (
    <Group listening={interactive}>
      {doors.map(({ wall, open }) => {
        const c = handlePoint(wall, r, avoid);
        const ring = open ? MAP_COLORS.emerald400 : MAP_COLORS.gold400;
        return (
          <Group
            key={wall.id}
            x={c.x}
            y={c.y}
            onMouseEnter={(e) => setStageCursor(e.target, 'pointer')}
            onMouseLeave={(e) => setStageCursor(e.target, '')}
            onMouseDown={(e) => {
              if (e.evt.button === 0) e.cancelBubble = true;
            }}
            onClick={(e) => {
              if (e.evt.button !== 0) return;
              e.cancelBubble = true;
              onToggle(wall);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onToggle(wall);
            }}
          >
            <Circle radius={r} fill="rgba(11, 10, 8, 0.92)" stroke={ring} strokeWidth={2.5} shadowColor={ring} shadowBlur={10} shadowOpacity={0.8} perfectDrawEnabled={false} />
            <Text
              x={-r}
              y={-r}
              width={r * 2}
              height={r * 2}
              text={open ? '🔓' : '🚪'}
              fontSize={r * 1.05}
              fontFamily={FONT_EMOJI}
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          </Group>
        );
      })}
    </Group>
  );
}
