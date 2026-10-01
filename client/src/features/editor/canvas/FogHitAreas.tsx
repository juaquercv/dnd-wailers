import { memo } from 'react';
import type Konva from 'konva';
import { Group, Line, Rect } from 'react-konva';
import type { FogRegion } from '@wailers/shared';
import { FONT_DISPLAY, labelBoxSize, setStageCursor } from '../../../map';
import { polygonCentroid } from '../../../map/mapUtils';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const LABEL_FONT = { fontSize: 14, fontFamily: FONT_DISPLAY, fontStyle: 'bold' } as const;

const RegionHit = memo(function RegionHit({ region, onClick }: { region: FogRegion; onClick: (region: FogRegion, e: KMouseEvent) => void }) {
  if (region.points.length < 6) return null;
  const c = polygonCentroid(region.points);
  const box = labelBoxSize(`🌫 ${region.name || 'Región de niebla'}`, LABEL_FONT);
  return (
    <Group
      onClick={(e) => {
        if (e.evt.button === 0) onClick(region, e);
      }}
      onMouseEnter={(e) => setStageCursor(e.target, 'pointer')}
      onMouseLeave={(e) => setStageCursor(e.target, '')}
    >
      <Line
        points={region.points}
        closed
        stroke={TRANSPARENT}
        strokeWidth={1}
        hitStrokeWidth={12}
        strokeScaleEnabled={false}
        fillEnabled={false}
        perfectDrawEnabled={false}
      />
      <Rect x={c.x - box.width / 2} y={c.y - box.height / 2} width={box.width} height={box.height} fill={TRANSPARENT} perfectDrawEnabled={false} />
    </Group>
  );
});

/**
 * Click targets for fog regions in the editor: only their outline and label react, so the (large) hatched
 * area never steals clicks from the elements drawn below it.
 */
export function FogHitAreas({ regions, onRegionClick }: { regions: FogRegion[]; onRegionClick: (region: FogRegion, e: KMouseEvent) => void }) {
  return (
    <Group>
      {regions.map((region) => (
        <RegionHit key={region.id} region={region} onClick={onRegionClick} />
      ))}
    </Group>
  );
}
