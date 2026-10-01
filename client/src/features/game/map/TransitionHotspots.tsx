import { memo, useState } from 'react';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import type { TransitionElement } from '@wailers/shared';
import { MAP_COLORS, setStageCursor, TRANSITION_STYLES } from '../../../map';

export type TransitionPointerEvent = Konva.KonvaEventObject<Event>;

export interface TransitionHotspotsProps {
  transitions: TransitionElement[];
  /** Transition currently usable by the player's own token (drawn with a pulsing emerald frame). */
  activeId?: string | null;
  /** When false the hotspots are drawn but ignore the pointer (cast/ping modes). */
  interactive: boolean;
  onActivate(el: TransitionElement, e: TransitionPointerEvent): void;
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
  return (
    <Group listening={interactive}>
      {transitions.map((el) => (
        <Hotspot key={el.id} el={el} active={el.id === activeId} interactive={interactive} onActivate={onActivate} />
      ))}
    </Group>
  );
}
