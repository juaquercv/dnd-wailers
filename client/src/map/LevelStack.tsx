import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import { LAYER_IDS, type LayerId, type SceneElementType, type ZoneContent, type ZoneLevel } from '@wailers/shared';
import { LevelBackgroundGroup } from './LevelBackground';
import { MapLayerShell } from './MapLayer';
import { useMapViewSource } from './mapView';
import { clamp, isOpaqueColor } from './mapUtils';
import { SceneElementsGroup } from './SceneElementsLayer';

export interface LevelStackProps {
  zone: Pick<ZoneContent, 'levels'>;
  currentLevelId: string;
  /**
   * View translation as reported by MapStage.onViewChange. Inside a MapStage the live camera is used
   * (no re-render needed while panning); this value is the fallback vanishing-point shift otherwise.
   */
  viewOffset: { x: number; y: number };
}

/** Scale applied per floor of depth (perspective towards the viewport center). */
const FLOOR_SCALE = 0.96;
const MAX_FLOORS = 3;
const STACK_LAYERS: LayerId[] = LAYER_IDS.filter((l) => l !== 'notes');
const STACK_EXCLUDE: SceneElementType[] = ['note', 'token'];
const DROP = { x: 16, y: 22 };

function DropShadow({ level }: { level: ZoneLevel }) {
  const { width, height, color } = level.background;
  if (!isOpaqueColor(color)) return null;
  return (
    <Group x={DROP.x} y={DROP.y} listening={false}>
      {[18, 10, 4].map((spread, i) => (
        <Rect
          key={spread}
          x={-spread / 2}
          y={-spread / 2}
          width={width + spread}
          height={height + spread}
          stroke={`rgba(0, 0, 0, ${0.12 + i * 0.08})`}
          strokeWidth={spread}
          perfectDrawEnabled={false}
        />
      ))}
      <Rect width={width} height={height} fill="rgba(0, 0, 0, 0.42)" perfectDrawEnabled={false} />
    </Group>
  );
}

/**
 * `LevelStack`: lower floors of the zone drawn below the current one (2.5D): each floor shrinks 4 % per level
 * of depth around the viewport center (parallax while panning), gets darker and casts a drop shadow.
 */
export function LevelStack({ zone, currentLevelId, viewOffset }: LevelStackProps) {
  const source = useMapViewSource();
  const current = zone.levels.find((l) => l.id === currentLevelId) ?? null;
  const groupNodes = useRef(new Map<string, Konva.Group>());
  const viewOffsetRef = useRef(viewOffset);
  viewOffsetRef.current = viewOffset;

  const floors = useMemo(() => {
    if (!current) return [];
    return zone.levels
      .filter((l) => l.id !== current.id && l.elevation < current.elevation)
      .sort((a, b) => b.elevation - a.elevation)
      .slice(0, MAX_FLOORS)
      .reverse()
      .map((level) => ({ level, depth: Math.max(1, current.elevation - level.elevation) }));
  }, [zone.levels, current]);

  const apply = useCallback(() => {
    if (!current || floors.length === 0) return;
    const view = source?.getView();
    let vx: number;
    let vy: number;
    if (view && view.width > 0 && view.height > 0) {
      vx = (view.width / 2 - view.x) / view.scale;
      vy = (view.height / 2 - view.y) / view.scale;
    } else {
      vx = current.background.width / 2 - viewOffsetRef.current.x;
      vy = current.background.height / 2 - viewOffsetRef.current.y;
    }
    for (const { level, depth } of floors) {
      const node = groupNodes.current.get(level.id);
      if (!node) continue;
      const s = Math.pow(FLOOR_SCALE, depth);
      node.setAttrs({ x: vx * (1 - s), y: vy * (1 - s), scaleX: s, scaleY: s });
    }
  }, [source, current, floors]);

  useLayoutEffect(() => {
    apply();
    if (!source) return;
    return source.subscribe(() => apply());
  }, [source, apply]);

  useLayoutEffect(() => {
    if (!source) apply();
  }, [source, apply, viewOffset.x, viewOffset.y]);

  return (
    <MapLayerShell listening={false}>
      {floors.map(({ level, depth }) => (
        <Group
          key={level.id}
          ref={(node) => {
            if (node) groupNodes.current.set(level.id, node);
            else groupNodes.current.delete(level.id);
          }}
          listening={false}
        >
          <DropShadow level={level} />
          <LevelBackgroundGroup level={level} />
          <SceneElementsGroup
            level={level}
            layers={STACK_LAYERS}
            showHidden={false}
            interactive={false}
            tagNodes={false}
            excludeTypes={STACK_EXCLUDE}
          />
          <Rect
            width={Math.max(1, level.background.width)}
            height={Math.max(1, level.background.height)}
            fill="#04050a"
            opacity={clamp(0.28 + 0.16 * depth, 0, 0.8)}
            listening={false}
          />
        </Group>
      ))}
      {current && floors.length > 0 && <DropShadow level={current} />}
    </MapLayerShell>
  );
}
