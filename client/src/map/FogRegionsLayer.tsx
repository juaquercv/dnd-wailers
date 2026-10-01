import { memo, useCallback, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Group, Line, Shape } from 'react-konva';
import type { FogRegion } from '@wailers/shared';
import { MapLayerShell } from './MapLayer';
import { MapLabel } from './mapShapes';
import { absoluteScale, FONT_DISPLAY, MAP_COLORS, polygonCentroid, setStageCursor } from './mapUtils';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export type FogRegionsMode = 'editor' | 'dm' | 'player';

export interface FogRegionsLayerProps {
  regions: FogRegion[];
  /** Region ids revealed to players. */
  revealed: string[];
  /** player: opaque black for unrevealed; dm: translucent dark with label; editor: hatched. */
  mode: FogRegionsMode;
  selectedIds?: string[];
  onRegionClick?(region: FogRegion, e: KMouseEvent): void;
}

const HATCH_TILE = 14;
let hatchCanvas: HTMLCanvasElement | null | undefined;

function getHatchCanvas(): HTMLCanvasElement | null {
  if (hatchCanvas !== undefined) return hatchCanvas;
  if (typeof document === 'undefined') return (hatchCanvas = null);
  const c = document.createElement('canvas');
  c.width = HATCH_TILE;
  c.height = HATCH_TILE;
  const ctx = c.getContext('2d');
  if (!ctx) return (hatchCanvas = null);
  ctx.strokeStyle = 'rgba(169, 139, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  ctx.beginPath();
  // diagonal lines continuing across tile edges
  ctx.moveTo(-2, HATCH_TILE + 2);
  ctx.lineTo(HATCH_TILE + 2, -2);
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, -2);
  ctx.moveTo(HATCH_TILE - 2, HATCH_TILE + 2);
  ctx.lineTo(HATCH_TILE + 2, HATCH_TILE - 2);
  ctx.stroke();
  return (hatchCanvas = c);
}

function tracePolygon(ctx: Konva.Context, points: number[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0] ?? 0, points[1] ?? 0);
  for (let i = 2; i + 1 < points.length; i += 2) ctx.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
  ctx.closePath();
}

/** Editor look: arcane tint + screen-constant diagonal hatch + dashed outline. */
function HatchedPolygon({ points, selected }: { points: number[]; selected: boolean }) {
  const sceneFunc = useCallback(
    (ctx: Konva.Context, shape: Konva.Shape) => {
      tracePolygon(ctx, points);
      const c = ctx._context;
      c.save();
      c.fillStyle = 'rgba(138, 99, 240, 0.12)';
      c.fill();
      const tile = getHatchCanvas();
      const pattern = tile ? c.createPattern(tile, 'repeat') : null;
      if (pattern) {
        const s = 1 / absoluteScale(shape);
        if (typeof DOMMatrix !== 'undefined') pattern.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
        c.fillStyle = pattern;
        c.fill();
      }
      c.restore();
      ctx.strokeShape(shape);
    },
    [points],
  );
  const hitFunc = useCallback(
    (ctx: Konva.Context, shape: Konva.Shape) => {
      tracePolygon(ctx, points);
      ctx.fillStrokeShape(shape);
    },
    [points],
  );
  return (
    <Shape
      sceneFunc={sceneFunc}
      hitFunc={hitFunc}
      fill="#000000"
      stroke={selected ? MAP_COLORS.gold400 : MAP_COLORS.arcane400}
      strokeWidth={selected ? 2.5 : 2}
      dash={selected ? undefined : [10, 6]}
      strokeScaleEnabled={false}
      perfectDrawEnabled={false}
    />
  );
}

const RegionNode = memo(function RegionNode({
  region,
  revealed,
  mode,
  selected,
  interactive,
  onClick,
}: {
  region: FogRegion;
  revealed: boolean;
  mode: FogRegionsMode;
  selected: boolean;
  interactive: boolean;
  onClick: (region: FogRegion, e: KMouseEvent) => void;
}) {
  const centroid = useMemo(() => polygonCentroid(region.points), [region.points]);
  if (region.points.length < 6) return null;

  if (mode === 'player') {
    if (revealed) return null;
    return (
      <Line
        points={region.points}
        closed
        fill="#000000"
        stroke="#000000"
        strokeWidth={2}
        lineJoin="round"
        shadowColor="#000000"
        shadowBlur={28}
        shadowOpacity={1}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }

  const events = interactive
    ? {
        onClick: (e: KMouseEvent) => {
          if (e.evt.button === 0) onClick(region, e);
        },
        onMouseEnter: (e: KMouseEvent) => setStageCursor(e.target, 'pointer'),
        onMouseLeave: (e: KMouseEvent) => setStageCursor(e.target, ''),
      }
    : {};
  const name = region.name || 'Región de niebla';

  if (mode === 'editor') {
    return (
      <Group listening={interactive} {...events}>
        <HatchedPolygon points={region.points} selected={selected} />
        <MapLabel
          text={`🌫 ${name}`}
          x={centroid.x}
          y={centroid.y}
          anchor="center"
          fontSize={14}
          fontFamily={FONT_DISPLAY}
          fontStyle="bold"
          borderColor="rgba(169, 139, 255, 0.7)"
          listening={interactive}
        />
      </Group>
    );
  }

  // dm
  const stroke = selected ? MAP_COLORS.gold400 : revealed ? 'rgba(52, 211, 153, 0.75)' : 'rgba(169, 139, 255, 0.85)';
  return (
    <Group listening={interactive} {...events}>
      <Line
        points={region.points}
        closed
        fill={revealed ? 'rgba(52, 211, 153, 0.04)' : 'rgba(5, 4, 10, 0.5)'}
        stroke={stroke}
        strokeWidth={selected ? 2.5 : 2}
        dash={revealed ? [4, 8] : [12, 6]}
        lineJoin="round"
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
      />
      <MapLabel
        text={`${revealed ? '👁' : '🌫'} ${name} · ${revealed ? 'Revelada' : 'Oculta'}`}
        x={centroid.x}
        y={centroid.y}
        anchor="center"
        fontSize={14}
        fontFamily={FONT_DISPLAY}
        fontStyle="bold"
        opacity={revealed ? 0.7 : 1}
        borderColor={revealed ? 'rgba(52, 211, 153, 0.7)' : 'rgba(169, 139, 255, 0.7)'}
        listening={interactive}
      />
    </Group>
  );
});

/** `FogRegionsLayer`: DM-defined fog polygons in editor, DM and player styles. */
export function FogRegionsLayer({ regions, revealed, mode, selectedIds, onRegionClick }: FogRegionsLayerProps) {
  const callbackRef = useRef(onRegionClick);
  callbackRef.current = onRegionClick;
  const handleClick = useMemo(() => (region: FogRegion, e: KMouseEvent) => callbackRef.current?.(region, e), []);
  const revealedKey = revealed.join('|');
  const revealedSet = useMemo(() => new Set(revealedKey ? revealedKey.split('|') : []), [revealedKey]);
  const selectedKey = (selectedIds ?? []).join('|');
  const selectedSet = useMemo(() => new Set(selectedKey ? selectedKey.split('|') : []), [selectedKey]);
  const interactive = mode !== 'player' && !!onRegionClick;

  return (
    <MapLayerShell listening={interactive}>
      {regions.map((region) => (
        <RegionNode
          key={region.id}
          region={region}
          revealed={revealedSet.has(region.id)}
          mode={mode}
          selected={selectedSet.has(region.id)}
          interactive={interactive}
          onClick={handleClick}
        />
      ))}
    </MapLayerShell>
  );
}
