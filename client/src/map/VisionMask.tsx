import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Layer, Shape } from 'react-konva';
import { isCellExplored, type ExploredGrid, type VisionMode, type ZoneLevel } from '@wailers/shared';
import { hashBytes } from './mapUtils';

export interface VisionMaskProps {
  level: Pick<ZoneLevel, 'background' | 'grid'>;
  mode: VisionMode;
  /** Currently visible areas (flat absolute polygons). */
  polygons: number[][];
  explored: ExploredGrid | null;
}

/** Alpha (0..255) of the darkness over explored-but-not-visible cells (60 % dark). */
const EXPLORED_ALPHA = 153;

interface ExploredImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** One pixel per explored-grid cell; scaled up with smoothing it gives soft fog edges for free. */
function buildExploredImage(grid: ExploredGrid): ExploredImage | null {
  if (typeof document === 'undefined' || grid.cols <= 0 || grid.rows <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const data = ctx.createImageData(grid.cols, grid.rows);
  const px = data.data;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const i = (row * grid.cols + col) * 4 + 3;
      px[i] = isCellExplored(grid, col, row) ? EXPLORED_ALPHA : 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  return { canvas, width: grid.cols * grid.cellSize, height: grid.rows * grid.cellSize };
}

function exploredSignature(grid: ExploredGrid | null): string {
  if (!grid) return '';
  return `${grid.cols}x${grid.rows}@${grid.cellSize}:${hashBytes(grid.bits)}`;
}

function tracePolygons(c: CanvasRenderingContext2D, polygons: number[][]): void {
  c.beginPath();
  for (const poly of polygons) {
    if (poly.length < 6) continue;
    c.moveTo(poly[0] ?? 0, poly[1] ?? 0);
    for (let i = 2; i + 1 < poly.length; i += 2) c.lineTo(poly[i] ?? 0, poly[i + 1] ?? 0);
    c.closePath();
  }
}

/**
 * `VisionMask`: player fog of war drawn on a single Shape.
 * 'all' nothing · 'vision' black outside the polygons · 'explored' black unexplored, 60 % dark explored,
 * clear inside the polygons · 'none' full black.
 */
export function VisionMask({ level, mode, polygons, explored }: VisionMaskProps) {
  const layerRef = useRef<Konva.Layer>(null);
  const width = Math.max(1, level.background.width);
  const height = Math.max(1, level.background.height);

  // The explored grid may be mutated in place (markExplored), so key the cache by content.
  const signature = mode === 'explored' ? exploredSignature(explored) : '';
  const exploredRef = useRef(explored);
  exploredRef.current = explored;
  const exploredImage = useMemo(
    () => (signature && exploredRef.current ? buildExploredImage(exploredRef.current) : null),
    [signature],
  );

  const sceneFunc = useCallback(
    (ctx: Konva.Context) => {
      const c = ctx._context;
      const margin = Math.max(width, height, 4000) * 3;
      c.save();
      c.fillStyle = '#000000';
      if (mode === 'explored') {
        // darkness around the level, then the explored memory inside it
        c.beginPath();
        c.rect(-margin, -margin, width + margin * 2, height + margin * 2);
        c.rect(0, 0, width, height);
        c.fill('evenodd');
        c.save();
        c.beginPath();
        c.rect(0, 0, width, height);
        c.clip();
        if (exploredImage) {
          c.imageSmoothingEnabled = true;
          c.imageSmoothingQuality = 'high';
          c.drawImage(exploredImage.canvas, 0, 0, exploredImage.width, exploredImage.height);
        } else {
          c.fillRect(0, 0, width, height);
        }
        c.restore();
      } else {
        c.fillRect(-margin, -margin, width + margin * 2, height + margin * 2);
      }
      if (mode !== 'none' && polygons.length > 0) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000000';
        tracePolygons(c, polygons);
        c.fill('nonzero');
      }
      c.restore();
    },
    [mode, polygons, exploredImage, width, height],
  );

  // A soft mask does not need retina resolution: render this layer at 1x to save memory and fill-rate.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const canvas = layer.getCanvas();
    if (canvas.getPixelRatio() !== 1) {
      canvas.setPixelRatio(1);
      layer.batchDraw();
    }
  }, []);

  return (
    <Layer ref={layerRef} listening={false}>
      {mode !== 'all' && <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />}
    </Layer>
  );
}
