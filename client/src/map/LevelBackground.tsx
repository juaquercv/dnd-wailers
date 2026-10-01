import { memo } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';
import type { ZoneLevel } from '@wailers/shared';
import { clamp, isOpaqueColor } from './mapUtils';
import { MapLayerShell } from './MapLayer';
import { useLoadedImage } from './useLoadedImage';

export interface LevelBackgroundProps {
  level: Pick<ZoneLevel, 'background'>;
  /** Darkening overlay: 0..1 (true = 0.5). */
  dim?: number | boolean;
}

/** Soft frame of dark strokes around the level so the map reads as a sheet above the void (cheaper than a blurred shadow). */
const FRAME_SHADOW: { spread: number; alpha: number }[] = [
  { spread: 6, alpha: 0.32 },
  { spread: 14, alpha: 0.16 },
  { spread: 28, alpha: 0.08 },
];

/** Background color + image of a level as a Group (for composing inside another layer). */
export const LevelBackgroundGroup = memo(function LevelBackgroundGroup({ level, dim }: LevelBackgroundProps) {
  const bg = level.background;
  const image = useLoadedImage(bg.url);
  const width = Math.max(1, bg.width);
  const height = Math.max(1, bg.height);
  const dimAlpha = typeof dim === 'number' ? clamp(dim, 0, 1) : dim ? 0.5 : 0;
  const opaque = isOpaqueColor(bg.color);

  return (
    <Group listening={false}>
      {opaque &&
        FRAME_SHADOW.map((f) => (
          <Rect
            key={f.spread}
            x={-f.spread / 2}
            y={-f.spread / 2}
            width={width + f.spread}
            height={height + f.spread}
            stroke={`rgba(0, 0, 0, ${f.alpha})`}
            strokeWidth={f.spread}
            listening={false}
            perfectDrawEnabled={false}
          />
        ))}
      <Rect width={width} height={height} fill={bg.color} listening={false} perfectDrawEnabled={false} />
      {image && <KonvaImage image={image} width={width} height={height} listening={false} perfectDrawEnabled={false} />}
      {dimAlpha > 0 && <Rect width={width} height={height} fill="#000000" opacity={dimAlpha} listening={false} />}
    </Group>
  );
});

/** `LevelBackground({ level, dim? })`: a non-listening Layer with the level color and image. */
export function LevelBackground(props: LevelBackgroundProps) {
  return (
    <MapLayerShell listening={false}>
      <LevelBackgroundGroup {...props} />
    </MapLayerShell>
  );
}
