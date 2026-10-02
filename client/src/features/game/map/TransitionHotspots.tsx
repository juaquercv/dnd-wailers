import { memo, useState } from 'react';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import type { TransitionElement } from '@wailers/shared';
import { MAP_COLORS, MapLabel, setStageCursor, TRANSITION_STYLES, useMapView } from '../../../map';

export type TransitionPointerEvent = Konva.KonvaEventObject<Event>;

export interface TransitionHotspotsProps {
  transitions: TransitionElement[];
  /** Transition currently usable by the player's own token (pulsing emerald frame + "Usar" pill). */
  activeId?: string | null;
  /** When false the hotspots are drawn but ignore the pointer (cast/ping modes). */
  interactive: boolean;
  onActivate(el: TransitionElement, e: TransitionPointerEvent): void;
}

const PILL_GAP_PX = 10;

/**
 * "Usar …" pill above the transition the player's token stands on. Constant screen size; drawn in the same
 * layer as the tokens but before them, so it can never cover a token or steal its clicks.
 */
function UsePill({ el, interactive, onActivate }: { el: TransitionElement; interactive: boolean; onActivate: (el: TransitionElement, e: TransitionPointerEvent) => void }) {
  const view = useMapView();
  const k = 1 / Math.max(0.05, view.scale || 1);
  const style = TRANSITION_STYLES[el.transitionType];
  const label = el.label || style?.label || 'paso';
  const top = el.y - Math.max(8, el.height) / 2;
  return (
    <Group
      x={el.x}
      y={top - PILL_GAP_PX * k}
      scaleX={k}
      scaleY={k}
      listening={interactive}
      onMouseEnter={(e) => setStageCursor(e.target, 'pointer')}
      onMouseLeave={(e) => setStageCursor(e.target, '')}
      onMouseDown={(e) => {
        if (e.evt.button === 0) e.cancelBubble = true;
      }}
      onClick={(e) => {
        if (e.evt.button !== 0) return;
        e.cancelBubble = true;
        onActivate(el, e);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onActivate(el, e);
      }}
    >
      <MapLabel
        text={`${style?.icon ?? '➜'}  Usar: ${label}`}
        y={0}
        anchor="bottom"
        fontSize={14}
        paddingX={12}
        paddingY={6}
        maxWidth={260}
        textColor={MAP_COLORS.parchment50}
        background="rgba(6, 40, 28, 0.94)"
        borderColor={MAP_COLORS.emerald400}
        listening
      />
    </Group>
  );
}

const Hotspot = memo(function Hotspot({
  el,
  active,
  interactive,
  onActivate,
}: {
  el: TransitionElement;
  active: boolean;
  interactive: boolean;
  onActivate: (el: TransitionElement, e: TransitionPointerEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const w = Math.max(8, el.width);
  const h = Math.max(8, el.height);
  const color = TRANSITION_STYLES[el.transitionType]?.color ?? MAP_COLORS.gold400;
  const showFrame = (hover && interactive) || active;
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation || 0} listening={interactive}>
      <Rect
        x={-w / 2 - 4}
        y={-h / 2 - 4}
        width={w + 8}
        height={h + 8}
        cornerRadius={6}
        fill={showFrame ? (active ? 'rgba(52, 211, 153, 0.12)' : 'rgba(233, 192, 99, 0.10)') : 'rgba(0, 0, 0, 0.001)'}
        stroke={showFrame ? (active ? MAP_COLORS.emerald400 : color) : undefined}
        strokeWidth={2}
        dash={[8, 5]}
        strokeScaleEnabled={false}
        shadowColor={active ? MAP_COLORS.emerald400 : color}
        shadowBlur={showFrame ? 12 : 0}
        shadowOpacity={showFrame ? 0.8 : 0}
        perfectDrawEnabled={false}
        onMouseEnter={(e) => {
          setHover(true);
          setStageCursor(e.target, 'pointer');
        }}
        onMouseLeave={(e) => {
          setHover(false);
          setStageCursor(e.target, '');
        }}
        onMouseDown={(e) => {
          if (e.evt.button === 0) e.cancelBubble = true;
        }}
        onClick={(e) => {
          if (e.evt.button !== 0) return;
          e.cancelBubble = true;
          onActivate(el, e);
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onActivate(el, e);
        }}
      />
    </Group>
  );
});

/** Invisible click targets over transition elements (doors, stairs, portals...) with hover feedback. */
export function TransitionHotspots({ transitions, activeId, interactive, onActivate }: TransitionHotspotsProps) {
  const active = activeId ? transitions.find((el) => el.id === activeId) ?? null : null;
  return (
    <Group listening={interactive}>
      {transitions.map((el) => (
        <Hotspot key={el.id} el={el} active={el.id === activeId} interactive={interactive} onActivate={onActivate} />
      ))}
      {active && <UsePill el={active} interactive={interactive} onActivate={onActivate} />}
    </Group>
  );
}
