import { useEffect, useRef } from 'react';
import Konva from 'konva';
import { Circle, Group, Line, Rect } from 'react-konva';
import type { SpellAnimation } from '@wailers/shared';
import { MAP_COLORS } from '../../../map';

/** Accent color per spell animation (targeting reticle, banners). */
export const SPELL_COLORS: Record<SpellAnimation, string> = {
  fire: '#ff7a2f',
  ice: '#7fd6ff',
  lightning: '#f0e05a',
  heal: '#5fd07a',
  arcane: '#a98bff',
  poison: '#8bd13a',
  holy: '#ffe680',
  shadow: '#9b6bff',
};

export interface MarqueeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** DM selection rectangle (world coordinates). */
export function MarqueeRect({ box }: { box: MarqueeBox }) {
  return (
    <Rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      fill="rgba(233, 192, 99, 0.08)"
      stroke={MAP_COLORS.gold400}
      strokeWidth={1.5}
      dash={[6, 4]}
      strokeScaleEnabled={false}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** Spell target reticle following the pointer while choosing a target. */
export function TargetReticle({ x, y, radius, color }: { x: number; y: number; radius: number; color: string }) {
  const ringRef = useRef<Konva.Group>(null);

  useEffect(() => {
    const ring = ringRef.current;
    const layer = ring?.getLayer();
    if (!ring || !layer) return;
    let last = -1;
    const anim = new Konva.Animation((frame) => {
      if (!frame) return false;
      if (last >= 0 && frame.time - last < 33) return false;
      last = frame.time;
      ring.rotation((frame.time / 40) % 360);
      const pulse = 1 + 0.06 * Math.sin(frame.time / 220);
      ring.scale({ x: pulse, y: pulse });
      return true;
    }, layer);
    anim.start();
    return () => {
      anim.stop();
    };
  }, []);

  const r = Math.max(12, radius);
  const tick = Math.max(6, r * 0.22);
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={r} fill={color} opacity={0.12} perfectDrawEnabled={false} />
      <Group ref={ringRef}>
        <Circle radius={r} stroke={color} strokeWidth={2.5} dash={[r * 0.35, r * 0.18]} strokeScaleEnabled={false} shadowColor={color} shadowBlur={10} shadowOpacity={0.9} perfectDrawEnabled={false} />
      </Group>
      <Circle radius={r * 0.18} stroke={MAP_COLORS.parchment50} strokeWidth={1.5} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      <Line points={[-r - tick, 0, -r + tick, 0]} stroke={color} strokeWidth={2} strokeScaleEnabled={false} />
      <Line points={[r - tick, 0, r + tick, 0]} stroke={color} strokeWidth={2} strokeScaleEnabled={false} />
      <Line points={[0, -r - tick, 0, -r + tick]} stroke={color} strokeWidth={2} strokeScaleEnabled={false} />
      <Line points={[0, r - tick, 0, r + tick]} stroke={color} strokeWidth={2} strokeScaleEnabled={false} />
    </Group>
  );
}

/**
 * Forwards touch taps that land on the empty stage (MapStage only reports mouse clicks).
 * Renders an empty non-listening group inside the stage to reach it.
 */
export function StageTapBinder({ onTap }: { onTap: (stage: Konva.Stage) => void }) {
  const ref = useRef<Konva.Group>(null);
  const callback = useRef(onTap);
  callback.current = onTap;
  useEffect(() => {
    const stage = ref.current?.getStage();
    if (!stage) return;
    const handler = (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (e.target !== stage) return;
      callback.current(stage);
    };
    stage.on('tap.gameMap', handler);
    return () => {
      stage.off('tap.gameMap');
    };
  }, []);
  return <Group ref={ref} listening={false} />;
}
