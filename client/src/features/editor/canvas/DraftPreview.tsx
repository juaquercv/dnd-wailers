import { Circle, Ellipse, Group, Line, Rect } from 'react-konva';
import type { GridConfig, Point, Wall } from '@wailers/shared';
import { MAP_COLORS, MapLabel, TRANSITION_STYLES, withAlpha } from '../../../map';
import { useEditorStore, type ToolOptions } from '../editorStore';
import { useCanvasUi, type CanvasDraft, type DropGhost } from './canvasUiStore';
import { NOTE_SIZE, TRANSITION_SIZE } from './factories';
import { distance, firstPoint, formatCells, formatNumber, hasUsableGrid, lastPoint, polylineLength, toCells } from './geometry';

const WALL_COLORS: Record<Wall['kind'], string> = {
  wall: '#d9c9a3',
  door: MAP_COLORS.door,
  window: MAP_COLORS.window,
};
const OUTLINE = 'rgba(11, 10, 8, 0.85)';
const CLOSE_RING_PX = 10;

/** Pill label with a constant on-screen size, anchored below-right of a world point. */
function ScreenLabel({ at, k, text, tone = 'gold' }: { at: Point; k: number; text: string; tone?: 'gold' | 'arcane' | 'blood' }) {
  const border = tone === 'arcane' ? 'rgba(169, 139, 255, 0.7)' : tone === 'blood' ? 'rgba(224, 98, 90, 0.8)' : 'rgba(212, 166, 63, 0.7)';
  return (
    <Group x={at.x} y={at.y} scaleX={k} scaleY={k} listening={false}>
      <MapLabel text={text} x={0} y={18} anchor="top" fontSize={12} borderColor={border} />
    </Group>
  );
}

function measureText(points: number[], hover: Point | null, grid: GridConfig): string | null {
  const last = lastPoint(points);
  if (!last || !hover) return null;
  const segment = distance(last, hover);
  if (!hasUsableGrid(grid)) return `${formatNumber(segment)} px`;
  const total = polylineLength(points) + segment;
  const seg = formatCells(toCells(segment, grid));
  return points.length >= 4 ? `${seg} · total ${formatCells(toCells(total, grid))}` : seg;
}

function Vertices({ points, k, color }: { points: number[]; k: number; color: string }) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push(
      <Circle
        key={i}
        x={points[i]}
        y={points[i + 1]}
        radius={(i === 0 ? 5 : 4) * k}
        fill={i === 0 ? MAP_COLORS.ink900 : color}
        stroke={i === 0 ? color : MAP_COLORS.ink950}
        strokeWidth={1.5 * k}
        listening={false}
      />,
    );
  }
  return <>{out}</>;
}

function PolyDraft({ draft, hover, k, opts, grid }: { draft: Extract<CanvasDraft, { kind: 'poly' }>; hover: Point | null; k: number; opts: ToolOptions; grid: GridConfig }) {
  const { points, tool } = draft;
  const last = lastPoint(points);
  const first = firstPoint(points);
  const n = points.length / 2;
  const nearFirst = !!hover && !!first && n >= 3 && distance(hover, first) / k < CLOSE_RING_PX;
  const tail = last && hover && !nearFirst ? [last.x, last.y, hover.x, hover.y] : last && first && nearFirst ? [last.x, last.y, first.x, first.y] : null;
  const label = nearFirst ? (tool === 'wall' ? 'Cerrar pared' : tool === 'fog' ? 'Cerrar niebla' : 'Cerrar forma') : measureText(points, hover, grid);

  let body;
  if (tool === 'wall') {
    const color = WALL_COLORS[opts.wallKind];
    body = (
      <>
        {n >= 2 && <Line points={points} stroke={OUTLINE} strokeWidth={10} lineCap="round" lineJoin="round" listening={false} />}
        {n >= 2 && (
          <Line
            points={points}
            stroke={color}
            strokeWidth={opts.wallKind === 'window' ? 5 : 6}
            dash={opts.wallKind === 'door' ? [16, 8] : undefined}
            lineCap={opts.wallKind === 'door' ? 'butt' : 'round'}
            lineJoin="round"
            listening={false}
          />
        )}
        {tail && <Line points={tail} stroke={color} strokeWidth={4} dash={[10 * k, 7 * k]} opacity={0.8} lineCap="round" listening={false} />}
        <Vertices points={points} k={k} color={MAP_COLORS.gold400} />
      </>
    );
  } else if (tool === 'fog') {
    const preview = hover && !nearFirst ? [...points, hover.x, hover.y] : points;
    body = (
      <>
        {preview.length >= 6 && (
          <Line points={preview} closed fill="rgba(138, 99, 240, 0.16)" stroke={MAP_COLORS.arcane400} strokeWidth={2} strokeScaleEnabled={false} dash={[10, 6]} listening={false} />
        )}
        {preview.length === 4 && <Line points={preview} stroke={MAP_COLORS.arcane400} strokeWidth={2} strokeScaleEnabled={false} dash={[10, 6]} listening={false} />}
        <Vertices points={points} k={k} color={MAP_COLORS.arcane400} />
      </>
    );
  } else {
    body = (
      <>
        {n >= 2 && (
          <Line points={points} stroke={opts.stroke} strokeWidth={Math.max(0.5, opts.strokeWidth)} opacity={opts.opacity} lineCap="round" lineJoin="round" listening={false} />
        )}
        {tail && (
          <Line
            points={tail}
            stroke={opts.stroke}
            strokeWidth={Math.max(0.5, opts.strokeWidth)}
            opacity={opts.opacity * 0.6}
            dash={[10 * k, 7 * k]}
            lineCap="round"
            listening={false}
          />
        )}
        <Vertices points={points} k={k} color={MAP_COLORS.gold400} />
      </>
    );
  }

  return (
    <Group listening={false}>
      {body}
      {nearFirst && first && <Circle x={first.x} y={first.y} radius={11 * k} stroke={MAP_COLORS.gold300} strokeWidth={2 * k} listening={false} />}
      {hover && label && <ScreenLabel at={hover} k={k} text={label} tone={tool === 'fog' ? 'arcane' : 'gold'} />}
    </Group>
  );
}

function BoxDraft({ draft, k, opts, grid }: { draft: Extract<CanvasDraft, { kind: 'box' }>; k: number; opts: ToolOptions; grid: GridConfig }) {
  const { x, y, width, height, shape } = draft;
  const common = {
    fill: opts.fill,
    stroke: opts.strokeWidth > 0 ? opts.stroke : undefined,
    strokeWidth: opts.strokeWidth,
    opacity: Math.min(1, opts.opacity) * 0.85,
    listening: false,
  };
  const dims = hasUsableGrid(grid)
    ? `${formatNumber(toCells(width, grid), 1)} × ${formatNumber(toCells(height, grid), 1)} casillas`
    : `${formatNumber(width)} × ${formatNumber(height)} px`;
  return (
    <Group listening={false}>
      {shape === 'ellipse' ? (
        <Ellipse x={x + width / 2} y={y + height / 2} radiusX={width / 2} radiusY={height / 2} {...common} />
      ) : (
        <Rect x={x} y={y} width={width} height={height} {...common} />
      )}
      <Rect x={x} y={y} width={width} height={height} stroke={MAP_COLORS.gold400} strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
      <ScreenLabel at={{ x: x + width, y: y + height }} k={k} text={dims} />
    </Group>
  );
}

function HoverGhost({ hover, k, opts, grid }: { hover: Point; k: number; opts: ToolOptions; grid: GridConfig }) {
  const tool = useEditorStore((s) => s.tool);
  const dot = (
    <>
      <Circle x={hover.x} y={hover.y} radius={8 * k} stroke={MAP_COLORS.gold400} strokeWidth={1.5 * k} opacity={0.7} listening={false} />
      <Circle x={hover.x} y={hover.y} radius={2.5 * k} fill={MAP_COLORS.gold300} listening={false} />
    </>
  );
  switch (tool) {
    case 'transition': {
      const color = TRANSITION_STYLES[opts.transitionType].color;
      return (
        <Rect
          x={hover.x - TRANSITION_SIZE / 2}
          y={hover.y - TRANSITION_SIZE / 2}
          width={TRANSITION_SIZE}
          height={TRANSITION_SIZE}
          cornerRadius={10}
          fill={withAlpha(color, 0.12)}
          stroke={color}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          dash={[6, 4]}
          listening={false}
        />
      );
    }
    case 'light':
      return (
        <>
          <Circle
            x={hover.x}
            y={hover.y}
            radius={Math.max(1, opts.lightRadius)}
            fill={withAlpha(opts.lightColor, 0.08)}
            stroke={withAlpha(opts.lightColor, 0.8)}
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            dash={[10, 8]}
            listening={false}
          />
          {dot}
        </>
      );
    case 'note':
      return (
        <>
          <Rect
            x={hover.x - NOTE_SIZE.width / 2}
            y={hover.y}
            width={NOTE_SIZE.width}
            height={NOTE_SIZE.height}
            fill="rgba(246, 226, 122, 0.12)"
            stroke="rgba(246, 226, 122, 0.8)"
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            dash={[6, 4]}
            listening={false}
          />
          {dot}
        </>
      );
    case 'marker':
      return (
        <>
          <Circle x={hover.x} y={hover.y - 26} radius={15} fill={withAlpha(opts.markerColor, 0.35)} stroke={opts.markerColor} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
          {dot}
        </>
      );
    case 'spawn': {
      const r = (hasUsableGrid(grid) ? grid.size : 70) * 0.42;
      return (
        <>
          <Circle x={hover.x} y={hover.y} radius={r} fill="rgba(233, 192, 99, 0.08)" stroke={MAP_COLORS.gold400} strokeWidth={1.5} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
          {dot}
        </>
      );
    }
    default:
      return dot;
  }
}

function DropGhostShape({ ghost }: { ghost: DropGhost }) {
  const color = ghost.allowed ? MAP_COLORS.gold400 : MAP_COLORS.blood400;
  return (
    <Circle
      x={ghost.x}
      y={ghost.y}
      radius={Math.max(4, ghost.radius)}
      fill={withAlpha(color, 0.14)}
      stroke={color}
      strokeWidth={2}
      strokeScaleEnabled={false}
      dash={[8, 5]}
      listening={false}
    />
  );
}

/**
 * Previews of the drawing in progress (paths, walls, fog, shapes, marquee, vertex edits), the placement
 * ghost under the cursor and the library drop ghost. Only this group re-renders on pointer moves.
 */
export function DraftPreview({ grid }: { grid: GridConfig }) {
  const draft = useCanvasUi((s) => s.draft);
  const hover = useCanvasUi((s) => s.hover);
  const scale = useCanvasUi((s) => s.view.scale);
  const ghost = useCanvasUi((s) => s.dropGhost);
  const opts = useEditorStore((s) => s.toolOptions);
  const k = 1 / Math.max(0.05, scale);

  let content = null;
  if (draft?.kind === 'freehand') {
    content = (
      <Line
        points={draft.points}
        stroke={opts.stroke}
        strokeWidth={Math.max(0.5, opts.strokeWidth)}
        opacity={opts.opacity}
        lineCap="round"
        lineJoin="round"
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  } else if (draft?.kind === 'poly') {
    content = <PolyDraft draft={draft} hover={hover} k={k} opts={opts} grid={grid} />;
  } else if (draft?.kind === 'box') {
    content = <BoxDraft draft={draft} k={k} opts={opts} grid={grid} />;
  } else if (draft?.kind === 'marquee') {
    content = (
      <Rect
        x={draft.x}
        y={draft.y}
        width={draft.width}
        height={draft.height}
        fill="rgba(233, 192, 99, 0.08)"
        stroke={MAP_COLORS.gold400}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={[6, 4]}
        listening={false}
      />
    );
  } else if (draft?.kind === 'vertex') {
    content = (
      <Line
        points={draft.points}
        closed={draft.target === 'fog'}
        fill={draft.target === 'fog' ? 'rgba(138, 99, 240, 0.12)' : undefined}
        stroke={MAP_COLORS.gold300}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[8, 5]}
        lineJoin="round"
        listening={false}
      />
    );
  } else if (hover) {
    content = <HoverGhost hover={hover} k={k} opts={opts} grid={grid} />;
  }

  return (
    <Group listening={false}>
      {content}
      {ghost && <DropGhostShape ghost={ghost} />}
    </Group>
  );
}
