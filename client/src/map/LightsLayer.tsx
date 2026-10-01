import { memo, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Circle, Group, Text } from 'react-konva';
import type { LightSource } from '@wailers/shared';
import { MapLayerShell } from './MapLayer';
import { clamp, FONT_EMOJI, MAP_COLORS, setStageCursor, withAlpha } from './mapUtils';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export interface LightsLayerProps {
  lights: LightSource[];
  selectedIds?: string[];
  interactive?: boolean;
  onLightClick?(light: LightSource, e: KMouseEvent): void;
  /** Gizmos are draggable when provided (and interactive); the node snaps back to props after the call. */
  onLightDragEnd?(light: LightSource, x: number, y: number): void;
}

const GIZMO_R = 14;

interface LightHandlers {
  click(light: LightSource, e: KMouseEvent): void;
  dragEnd(light: LightSource, node: Konva.Node): void;
}

const LightGizmo = memo(function LightGizmo({
  light,
  selected,
  interactive,
  draggable,
  handlers,
}: {
  light: LightSource;
  selected: boolean;
  interactive: boolean;
  draggable: boolean;
  handlers: LightHandlers;
}) {
  const color = light.color || '#ffb347';
  const intensity = clamp(light.intensity ?? 1, 0, 1);
  const radius = Math.max(1, light.radius);
  return (
    <Group
      x={light.x}
      y={light.y}
      draggable={interactive && draggable}
      listening={interactive}
      onClick={(e) => {
        if (e.evt.button === 0) handlers.click(light, e);
      }}
      onDragEnd={(e) => {
        if (e.target === e.currentTarget) handlers.dragEnd(light, e.currentTarget);
      }}
      onMouseEnter={(e) => setStageCursor(e.target, draggable ? 'move' : 'pointer')}
      onMouseLeave={(e) => setStageCursor(e.target, '')}
    >
      {/* area of effect (never intercepts clicks) */}
      <Circle
        radius={radius}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={radius}
        fillRadialGradientColorStops={[0, withAlpha(color, 0.26 * intensity + 0.04), 0.6, withAlpha(color, 0.1 * intensity + 0.02), 1, withAlpha(color, 0)]}
        fillPriority="radial-gradient"
        stroke={selected ? MAP_COLORS.gold400 : withAlpha(color, 0.75)}
        strokeWidth={selected ? 2 : 1.5}
        dash={selected ? undefined : [10, 8]}
        strokeScaleEnabled={false}
        listening={false}
        perfectDrawEnabled={false}
      />
      {selected && <Circle radius={GIZMO_R + 5} stroke={MAP_COLORS.gold400} strokeWidth={2.5} shadowColor={MAP_COLORS.gold400} shadowBlur={10} shadowOpacity={0.9} listening={false} />}
      <Circle
        radius={GIZMO_R}
        fill={MAP_COLORS.ink900}
        stroke={color}
        strokeWidth={2.5}
        shadowColor={color}
        shadowBlur={14}
        shadowOpacity={0.85}
        perfectDrawEnabled={false}
      />
      <Text
        x={-GIZMO_R}
        y={-GIZMO_R}
        width={GIZMO_R * 2}
        height={GIZMO_R * 2}
        text={light.flicker ? '🔥' : '💡'}
        fontSize={GIZMO_R * 1.1}
        fontFamily={FONT_EMOJI}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  );
});

/** `LightsLayer`: editor gizmos for light sources (bulb + dashed radius with a soft glow). */
export function LightsLayer({ lights, selectedIds, interactive = false, onLightClick, onLightDragEnd }: LightsLayerProps) {
  const callbacks = useRef({ onLightClick, onLightDragEnd });
  callbacks.current = { onLightClick, onLightDragEnd };
  const selectedKey = (selectedIds ?? []).join('|');
  const selected = useMemo(() => new Set(selectedKey ? selectedKey.split('|') : []), [selectedKey]);
  const handlers = useMemo<LightHandlers>(
    () => ({
      click: (light, e) => callbacks.current.onLightClick?.(light, e),
      dragEnd: (light, node) => {
        const x = node.x();
        const y = node.y();
        node.position({ x: light.x, y: light.y });
        callbacks.current.onLightDragEnd?.(light, x, y);
      },
    }),
    [],
  );
  const canDrag = !!onLightDragEnd;
  return (
    <MapLayerShell listening={interactive}>
      {lights.map((light) => (
        <LightGizmo key={light.id} light={light} selected={selected.has(light.id)} interactive={interactive} draggable={canDrag} handlers={handlers} />
      ))}
    </MapLayerShell>
  );
}
