import { memo, useCallback } from 'react';
import type Konva from 'konva';
import { Shape } from 'react-konva';
import { hexCorners, type GridConfig, type ZoneLevel } from '@wailers/shared';
import { MapLayerShell } from './MapLayer';
import { absoluteScale, clamp, visibleLocalRect } from './mapUtils';

export interface GridLayerProps {
  level: Pick<ZoneLevel, 'grid' | 'background'>;
}

/** Cells smaller than this on screen are not drawn; the grid fades in above it. */
const MIN_SCREEN_CELL_PX = 6;
const FADE_RANGE_PX = 12;
const MAX_HEX_CELLS = 40_000;
const SQRT3 = Math.sqrt(3);

function isOdd(n: number): boolean {
  return ((n % 2) + 2) % 2 === 1;
}

function drawSquare(c: CanvasRenderingContext2D, grid: GridConfig, x0: number, y0: number, x1: number, y1: number): void {
  const size = grid.size;
  const firstX = grid.offsetX + Math.ceil((x0 - grid.offsetX) / size) * size;
  for (let x = firstX; x <= x1; x += size) {
    c.moveTo(x, y0);
    c.lineTo(x, y1);
  }
  const firstY = grid.offsetY + Math.ceil((y0 - grid.offsetY) / size) * size;
  for (let y = firstY; y <= y1; y += size) {
    c.moveTo(x0, y);
    c.lineTo(x1, y);
  }
}

function drawHex(c: CanvasRenderingContext2D, grid: GridConfig, x0: number, y0: number, x1: number, y1: number): void {
  const size = grid.size;
  const radius = size / SQRT3;
  const rowStep = (size * SQRT3) / 2;
  const corners = hexCorners({ x: 0, y: 0 }, grid);
  if (corners.length < 3) return;
  const rowStart = Math.floor((y0 - grid.offsetY - radius) / rowStep) - 1;
  const rowEnd = Math.ceil((y1 - grid.offsetY - radius) / rowStep) + 1;
  const colsPerRow = Math.ceil((x1 - x0) / size) + 3;
  if ((rowEnd - rowStart + 1) * colsPerRow > MAX_HEX_CELLS) return;
  for (let r = rowStart; r <= rowEnd; r++) {
    const cy = grid.offsetY + radius + r * rowStep;
    const shift = isOdd(r) ? size / 2 : 0;
    const colStart = Math.floor((x0 - grid.offsetX - size / 2 - shift) / size) - 1;
    const colEnd = Math.ceil((x1 - grid.offsetX - size / 2 - shift) / size) + 1;
    for (let col = colStart; col <= colEnd; col++) {
      const cx = grid.offsetX + size / 2 + shift + col * size;
      const first = corners[0]!;
      c.moveTo(cx + first.x, cy + first.y);
      for (let k = 1; k < corners.length; k++) {
        const p = corners[k]!;
        c.lineTo(cx + p.x, cy + p.y);
      }
      c.closePath();
    }
  }
}

/** The grid as a single Shape that strokes only the visible part of the level (no listening). */
export const GridShape = memo(function GridShape({ level }: GridLayerProps) {
  const { grid, background } = level;
  const width = background.width;
  const height = background.height;

  const sceneFunc = useCallback(
    (ctx: Konva.Context, shape: Konva.Shape) => {
      if (grid.size <= 0) return;
      const view = visibleLocalRect(shape);
      if (!view) return;
      const x0 = Math.max(0, view.x);
      const y0 = Math.max(0, view.y);
      const x1 = Math.min(width, view.x + view.width);
      const y1 = Math.min(height, view.y + view.height);
      if (x1 <= x0 || y1 <= y0) return;
      const scale = absoluteScale(shape);
      const screenCell = grid.size * scale;
      if (screenCell < MIN_SCREEN_CELL_PX) return;
      const alpha = clamp(grid.opacity, 0, 1) * clamp((screenCell - MIN_SCREEN_CELL_PX) / FADE_RANGE_PX, 0, 1);
      if (alpha <= 0.01) return;

      const c = ctx._context;
      c.save();
      c.beginPath();
      c.rect(0, 0, width, height);
      c.clip();
      c.beginPath();
      if (grid.type === 'hex') drawHex(c, grid, x0, y0, x1, y1);
      else drawSquare(c, grid, x0, y0, x1, y1);
      c.globalAlpha *= alpha;
      c.strokeStyle = grid.color;
      // Constant on-screen thickness, slightly bolder when zoomed in on large cells.
      c.lineWidth = clamp(screenCell / 70, 1, 2) / scale;
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
    },
    [grid, width, height],
  );

  if (!grid.show || grid.size <= 0) return null;
  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
});

/** `GridLayer({ level })`: square or hex grid of the level (respects grid.show). */
export function GridLayer({ level }: GridLayerProps) {
  return (
    <MapLayerShell listening={false}>
      <GridShape level={level} />
    </MapLayerShell>
  );
}
