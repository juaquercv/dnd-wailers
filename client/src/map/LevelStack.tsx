import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Group, Line, Rect } from 'react-konva';
import { LAYER_IDS, type FogRegion, type LayerId, type SceneElementType, type ZoneContent, type ZoneLevel } from '@wailers/shared';
import { useAmbientLighting } from './ambientLighting';
import { LevelBackgroundGroup } from './LevelBackground';
import { MapLayerShell } from './MapLayer';
import { useMapViewSource } from './mapView';
import { clamp, isOpaqueColor } from './mapUtils';
import { SceneElementsGroup } from './SceneElementsLayer';

/** Who looks at the stack: decides how the lower floors' fog regions are painted. */
export type LevelStackViewer = 'player' | 'dm';

export interface LevelStackProps {
  zone: Pick<ZoneContent, 'levels'>;
  currentLevelId: string;
  /**
   * View translation as reported by MapStage.onViewChange. Inside a MapStage the live camera is used
   * (no re-render needed while panning); this value is the fallback vanishing-point shift otherwise.
   */
  viewOffset: { x: number; y: number };
  /**
   * 'player' (default, never leaks hidden areas): unrevealed fog regions of the lower floors are opaque.
   * 'dm' (editor, DM view): they are only tinted.
   */
  viewer?: LevelStackViewer;
  /** Fog region ids revealed to players (ZoneLiveState.revealedFog): revealed regions stay clear. */
  revealedFog?: readonly string[];
}

/** Scale applied per floor of depth (perspective towards the viewport center). */
const FLOOR_SCALE = 0.96;
const MAX_FLOORS = 3;
/**
 * Extra lag per floor of depth while panning, as a fraction of the (soft-clamped) distance between the viewport
 * center and the current level center: lower floors move slower on screen and slide out past the edge being looked at.
 */
const PARALLAX = 0.22;
/** Resting downward shift per floor of depth (fraction of the current level height): lower floors peek out below it. */
const TILT_Y = 0.055;
const STACK_LAYERS: LayerId[] = LAYER_IDS.filter((l) => l !== 'notes');
const STACK_EXCLUDE: SceneElementType[] = ['note', 'token'];
const DROP = { x: 16, y: 22 };
const NO_REVEALED: readonly string[] = [];

/** Offset of `v` from `center`, saturating smoothly at about ±center (no runaway drift when panned far away). */
function softOffset(v: number, center: number): number {
  if (!(center > 0) || !Number.isFinite(v)) return 0;
  return Math.tanh((v - center) / center) * center;
}

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

/** Fog regions of a lower floor: opaque for players unless revealed, a dark tint for the DM. */
const StackFog = memo(function StackFog({
  regions,
  revealed,
  viewer,
}: {
  regions: FogRegion[];
  revealed: ReadonlySet<string>;
  viewer: LevelStackViewer;
}) {
  return (
    <>
      {regions.map((region) => {
        if (region.points.length < 6 || revealed.has(region.id)) return null;
        return (
          <Line
            key={region.id}
            points={region.points}
            closed
            fill={viewer === 'player' ? '#000000' : 'rgba(5, 4, 10, 0.5)'}
            stroke={viewer === 'player' ? '#000000' : undefined}
            strokeWidth={viewer === 'player' ? 3 : 0}
            lineJoin="round"
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      })}
    </>
  );
});

/**
 * `LevelStack`: lower floors of the zone drawn below the current one (2.5D). Each floor shrinks 4 % per level of depth
 * around the viewport center, rests a little lower than the floor above (so it peeks out under its bottom edge) and lags
 * behind while panning (parallax), sliding out past the edge being looked at. Floors get darker with depth, cast a drop
 * shadow and keep a faint rim so dark maps stay readable. On top of that, they take the base darkness of the
 * LightingOverlay of the same MapStage (zone lighting, without its light holes), so a floor below is never brighter than
 * the one being viewed. Hidden elements, notes and tokens of lower floors are never drawn, and their unrevealed fog
 * regions are opaque unless `viewer` is 'dm'.
 */
export function LevelStack({ zone, currentLevelId, viewOffset, viewer = 'player', revealedFog = NO_REVEALED }: LevelStackProps) {
  const source = useMapViewSource();
  const ambient = useAmbientLighting();
  const current = zone.levels.find((l) => l.id === currentLevelId) ?? null;
  const groupNodes = useRef(new Map<string, Konva.Group>());
  const viewOffsetRef = useRef(viewOffset);
  viewOffsetRef.current = viewOffset;

  const revealedKey = revealedFog.join('|');
  const revealedSet = useMemo<ReadonlySet<string>>(() => new Set(revealedKey ? revealedKey.split('|') : []), [revealedKey]);

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
    const width = Math.max(1, current.background.width);
    const height = Math.max(1, current.background.height);
    const view = source?.getView();
    let vx: number;
    let vy: number;
    if (view && view.width > 0 && view.height > 0 && view.scale > 0) {
      vx = (view.width / 2 - view.x) / view.scale;
      vy = (view.height / 2 - view.y) / view.scale;
    } else {
      vx = width / 2 - viewOffsetRef.current.x;
      vy = height / 2 - viewOffsetRef.current.y;
    }
    const lagX = softOffset(vx, width / 2) * PARALLAX;
    const lagY = softOffset(vy, height / 2) * PARALLAX;
    const tilt = height * TILT_Y;
    for (const { level, depth } of floors) {
      const node = groupNodes.current.get(level.id);
      if (!node) continue;
      const s = Math.pow(FLOOR_SCALE, depth);
      node.setAttrs({
        x: vx * (1 - s) + lagX * depth,
        y: vy * (1 - s) + (lagY + tilt) * depth,
        scaleX: s,
        scaleY: s,
      });
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
      {floors.map(({ level, depth }) => {
        const width = Math.max(1, level.background.width);
        const height = Math.max(1, level.background.height);
        return (
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
            <StackFog regions={level.fogRegions} revealed={revealedSet} viewer={viewer} />
            <Rect width={width} height={height} fill="#04050a" opacity={clamp(0.2 + 0.15 * depth, 0, 0.75)} listening={false} />
            <Rect
              width={width}
              height={height}
              stroke={`rgba(230, 216, 184, ${(0.26 / depth).toFixed(3)})`}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              listening={false}
              perfectDrawEnabled={false}
            />
            {ambient && (
              <Rect width={width} height={height} fill={ambient.tint} opacity={clamp(ambient.darkness, 0, 1)} listening={false} />
            )}
          </Group>
        );
      })}
      {current && floors.length > 0 && <DropShadow level={current} />}
    </MapLayerShell>
  );
}
