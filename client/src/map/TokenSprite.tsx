import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import Konva from 'konva';
import { Circle, Group, Line, Rect, RegularPolygon, Text } from 'react-konva';
import type { GridConfig, Token } from '@wailers/shared';
import { EyeOffBadge, MapLabel, Portrait } from './mapShapes';
import { clamp, FONT_EMOJI, FONT_SANS, hpColor, MAP_COLORS, setStageCursor, statusInfo, useFontsVersion, withAlpha } from './mapUtils';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export interface TokenHpInfo {
  hp: number | null;
  maxHp: number | null;
  temp: number;
  /** 0..1 when only an approximate bar is known (players with enemyHp = 'bar'). */
  ratio: number | null;
}

export type HpBarMode = 'exact' | 'bar' | 'none';

export interface TokenSpriteProps {
  token: Token;
  grid: GridConfig;
  hp: TokenHpInfo;
  selected: boolean;
  /** DM view: hidden tokens are drawn ghosted with an eye-off badge. */
  isDmView: boolean;
  showHpBar: HpBarMode;
  draggable: boolean;
  /** World position of the token center while dragging (throttle before emitting). */
  onDragMove?(x: number, y: number): void;
  /** Drop position; the sprite stays there until the state confirms (or reverts after a timeout). */
  onDragEnd?(x: number, y: number): void;
  onClick?(e: KMouseEvent): void;
  onDblClick?(e: KMouseEvent): void;
  onContextMenu?(e: KMouseEvent): void;
  onHoverChange?(hovered: boolean): void;
  /** Remote drag position (another user dragging this token): drawn as a translucent ghost. */
  dragPreview?: { x: number; y: number } | null;
  /** Extra dashed ring color (targeting, hover from lists...). */
  highlight?: string | null;
  isCurrentTurn?: boolean;
}

const PULSE_MS = 1400;
const REVERT_AFTER_MS = 1600;
const MAX_STATUS_BUBBLES = 6;

interface HpLayout {
  ratio: number;
  hpFrac: number;
  tempFrac: number;
  text: string | null;
}

function computeHp(hp: TokenHpInfo): HpLayout | null {
  const cur = hp.hp;
  const max = hp.maxHp;
  const temp = Math.max(0, hp.temp || 0);
  if (cur !== null && max !== null && max > 0) {
    const value = Math.max(0, cur);
    const denom = Math.max(max, value + temp);
    return {
      ratio: clamp(value / max, 0, 1),
      hpFrac: value / denom,
      tempFrac: temp / denom,
      text: `${cur}/${max}${temp > 0 ? ` +${temp}` : ''}`,
    };
  }
  if (hp.ratio !== null && Number.isFinite(hp.ratio)) {
    const ratio = clamp(hp.ratio, 0, 1);
    return { ratio, hpFrac: temp > 0 ? ratio * 0.9 : ratio, tempFrac: temp > 0 ? 0.1 : 0, text: null };
  }
  return null;
}

/** Circle or rounded-square outline used for rings, glows and highlights. */
function TokenOutline({
  square,
  radius,
  stroke,
  strokeWidth,
  dash,
  glow,
  fill,
}: {
  square: boolean;
  radius: number;
  stroke?: string;
  strokeWidth?: number;
  dash?: number[];
  glow?: string;
  fill?: string;
}) {
  const shadow = glow ? { shadowColor: glow, shadowBlur: Math.max(10, radius * 0.35), shadowOpacity: 0.95 } : {};
  if (square) {
    return (
      <Rect
        x={-radius}
        y={-radius}
        width={radius * 2}
        height={radius * 2}
        cornerRadius={radius * 0.36}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        fill={fill}
        listening={false}
        perfectDrawEnabled={false}
        {...shadow}
      />
    );
  }
  return (
    <Circle radius={radius} stroke={stroke} strokeWidth={strokeWidth} dash={dash} fill={fill} listening={false} perfectDrawEnabled={false} {...shadow} />
  );
}

function StatusBubbles({ statuses, radius, bubble, fontsVersion }: { statuses: string[]; radius: number; bubble: number; fontsVersion: number }) {
  if (statuses.length === 0) return null;
  const overflow = statuses.length > MAX_STATUS_BUBBLES;
  const shown = overflow ? statuses.slice(0, MAX_STATUS_BUBBLES - 1) : statuses;
  const items: { key: string; icon: string; color: string; emoji: boolean }[] = shown.map((s) => {
    const info = statusInfo(s);
    return { key: s, icon: info.icon, color: info.color, emoji: true };
  });
  if (overflow) items.push({ key: '__more', icon: `+${statuses.length - shown.length}`, color: MAP_COLORS.parchment300, emoji: false });
  const n = items.length;
  let step = (bubble * 2 + 2) / Math.max(1, radius);
  if (n > 1 && step * (n - 1) > Math.PI * 1.1) step = (Math.PI * 1.1) / (n - 1);
  const start = -Math.PI / 2 - (step * (n - 1)) / 2;
  return (
    <Group listening={false}>
      {items.map((item, i) => {
        const a = start + i * step;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        return (
          <Group key={item.key} x={x} y={y}>
            <Circle radius={bubble} fill="rgba(11, 10, 8, 0.88)" stroke={item.color} strokeWidth={Math.max(1, bubble * 0.14)} perfectDrawEnabled={false} />
            <Text
              key={fontsVersion}
              x={-bubble}
              y={-bubble}
              width={bubble * 2}
              height={bubble * 2}
              text={item.icon}
              fontSize={item.emoji ? bubble * 1.15 : bubble * 0.95}
              fontFamily={item.emoji ? FONT_EMOJI : FONT_SANS}
              fontStyle={item.emoji ? 'normal' : 'bold'}
              fill={MAP_COLORS.parchment100}
              align="center"
              verticalAlign="middle"
              wrap="none"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function HpBar({ layout, width, height, y, exact, fontsVersion }: { layout: HpLayout; width: number; height: number; y: number; exact: boolean; fontsVersion: number }) {
  const x = -width / 2;
  const inner = Math.max(0, width - 2);
  const hpW = inner * clamp(layout.hpFrac, 0, 1);
  const tempW = inner * clamp(layout.tempFrac, 0, 1 - clamp(layout.hpFrac, 0, 1));
  const radius = height / 2;
  return (
    <Group x={x} y={y} listening={false}>
      <Rect width={width} height={height} cornerRadius={radius} fill="rgba(11, 10, 8, 0.88)" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1} perfectDrawEnabled={false} />
      {hpW > 0.5 && (
        <Rect
          x={1}
          y={1}
          width={hpW}
          height={height - 2}
          cornerRadius={Math.max(0, radius - 1)}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: height }}
          fillLinearGradientColorStops={[0, hpColor(Math.min(1, layout.ratio + 0.12)), 1, hpColor(layout.ratio)]}
          perfectDrawEnabled={false}
        />
      )}
      {tempW > 0.5 && (
        <Rect x={1 + hpW} y={1} width={tempW} height={height - 2} cornerRadius={Math.max(0, radius - 1)} fill={MAP_COLORS.tempHp} perfectDrawEnabled={false} />
      )}
      {exact && layout.text && (
        <Text
          key={fontsVersion}
          width={width}
          height={height}
          text={layout.text}
          fontSize={height * 0.8}
          fontStyle="bold"
          fontFamily={FONT_SANS}
          fill="#ffffff"
          align="center"
          verticalAlign="middle"
          shadowColor="#000000"
          shadowBlur={2}
          shadowOpacity={0.9}
          wrap="none"
        />
      )}
    </Group>
  );
}

function TokenGhost({ token, radius, square, pos }: { token: Token; radius: number; square: boolean; pos: { x: number; y: number } }) {
  return (
    <>
      <Line
        points={[token.x, token.y, pos.x, pos.y]}
        stroke={withAlpha(token.color, 0.7)}
        strokeWidth={2}
        dash={[8, 6]}
        strokeScaleEnabled={false}
        listening={false}
      />
      <Group x={pos.x} y={pos.y} opacity={0.45} listening={false}>
        <TokenOutline square={square} radius={radius} fill={MAP_COLORS.ink900} />
        <Portrait imageUrl={token.imageUrl} name={token.name} radius={radius} color={token.color} shape={square ? 'square' : 'circle'} />
        <TokenOutline square={square} radius={radius} stroke={token.color} strokeWidth={Math.max(2, radius * 0.1)} dash={[radius * 0.3, radius * 0.2]} />
      </Group>
    </>
  );
}

/**
 * Live token on the map: portrait (or initials), ring, HP bar, status emojis, name plate,
 * selection/turn/highlight rings and DM "hidden" ghosting. Center = (token.x, token.y).
 */
export const TokenSprite = memo(function TokenSprite(props: TokenSpriteProps) {
  const { token, grid, hp, selected, isDmView, showHpBar, draggable, dragPreview, highlight, isCurrentTurn = false } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const fontsVersion = useFontsVersion();

  const groupRef = useRef<Konva.Group>(null);
  const pulseRef = useRef<Konva.Group>(null);
  const tweenRef = useRef<Konva.Tween | null>(null);
  const placedRef = useRef(false);
  const revertTimerRef = useRef<number | null>(null);

  const cellPx = Math.max(8, grid.size);
  const d = Math.max(0.25, token.cells || 1) * cellPx;
  const r = d / 2;
  const square = token.kind === 'item';
  const ringW = clamp(d * 0.06, 2.5, 8);
  const hpLayout = showHpBar === 'none' ? null : computeHp(hp);
  const exact = showHpBar === 'exact' && !!hpLayout?.text;
  const barH = exact ? clamp(d * 0.17, 10, 16) : clamp(d * 0.09, 5, 9);
  const barW = Math.max(d * 0.92, exact ? 46 : 26);
  const barY = r - barH * 0.55;
  const nameSize = clamp(d * 0.16, 10, 16);
  const nameY = hpLayout ? barY + barH + 3 : r + 4;
  const bubble = clamp(d * 0.11, 7, 12);
  const isDead = token.statuses.includes('dead');
  const isDown = isDead || token.statuses.includes('unconscious');
  const ghosted = isDmView && token.hidden;
  const facingRad = (token.facing * Math.PI) / 180;
  const hiddenAngle = (200 * Math.PI) / 180;

  // Position: set directly on mount, tween on remote moves, never fight a local drag.
  useLayoutEffect(() => {
    const node = groupRef.current;
    if (!node) return;
    if (revertTimerRef.current !== null) {
      window.clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
    if (!placedRef.current) {
      placedRef.current = true;
      node.position({ x: token.x, y: token.y });
      return;
    }
    if (node.isDragging()) return;
    const dx = token.x - node.x();
    const dy = token.y - node.y();
    const dist = Math.hypot(dx, dy);
    tweenRef.current?.destroy();
    tweenRef.current = null;
    if (dist < 0.5 || dist > cellPx * 30) {
      node.position({ x: token.x, y: token.y });
      node.getLayer()?.batchDraw();
      return;
    }
    const tween = new Konva.Tween({
      node,
      x: token.x,
      y: token.y,
      duration: clamp(0.12 + dist / 2500, 0.15, 0.45),
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (tweenRef.current === tween) tweenRef.current = null;
      },
    });
    tweenRef.current = tween;
    tween.play();
  }, [token.x, token.y, cellPx]);

  useEffect(
    () => () => {
      tweenRef.current?.destroy();
      tweenRef.current = null;
      if (revertTimerRef.current !== null) window.clearTimeout(revertTimerRef.current);
    },
    [],
  );

  // Current turn: pulsing ring (~30 fps redraw of the token layer while active).
  useEffect(() => {
    const ring = pulseRef.current;
    const layer = ring?.getLayer();
    if (!isCurrentTurn || !ring || !layer) return;
    let last = -1;
    const anim = new Konva.Animation((frame) => {
      if (!frame) return false;
      if (last >= 0 && frame.time - last < 33) return false;
      last = frame.time;
      const k = (frame.time % PULSE_MS) / PULSE_MS;
      const s = 1 + 0.3 * k;
      ring.scale({ x: s, y: s });
      ring.opacity(0.9 * (1 - k));
      return true;
    }, layer);
    anim.start();
    return () => {
      anim.stop();
      ring.scale({ x: 1, y: 1 });
      ring.opacity(0);
      layer.batchDraw();
    };
  }, [isCurrentTurn]);

  const scheduleRevert = () => {
    if (revertTimerRef.current !== null) window.clearTimeout(revertTimerRef.current);
    revertTimerRef.current = window.setTimeout(() => {
      revertTimerRef.current = null;
      const node = groupRef.current;
      const t = propsRef.current.token;
      if (!node || node.isDragging()) return;
      if (Math.abs(node.x() - t.x) > 0.5 || Math.abs(node.y() - t.y) > 0.5) {
        tweenRef.current?.destroy();
        const tween = new Konva.Tween({ node, x: t.x, y: t.y, duration: 0.22, easing: Konva.Easings.EaseOut });
        tweenRef.current = tween;
        tween.play();
      }
    }, REVERT_AFTER_MS);
  };

  return (
    <>
      {dragPreview && <TokenGhost token={token} radius={r} square={square} pos={dragPreview} />}
      <Group
        ref={groupRef}
        draggable={draggable}
        opacity={ghosted ? 0.5 : 1}
        onClick={(e) => {
          if (e.evt.button === 0) propsRef.current.onClick?.(e);
        }}
        onDblClick={(e) => {
          if (e.evt.button === 0) propsRef.current.onDblClick?.(e);
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          propsRef.current.onContextMenu?.(e);
        }}
        onMouseEnter={(e) => {
          setStageCursor(e.target, propsRef.current.draggable ? 'grab' : 'pointer');
          propsRef.current.onHoverChange?.(true);
        }}
        onMouseLeave={(e) => {
          setStageCursor(e.target, '');
          propsRef.current.onHoverChange?.(false);
        }}
        onDragStart={(e) => {
          if (e.target !== e.currentTarget) return;
          tweenRef.current?.destroy();
          tweenRef.current = null;
          if (revertTimerRef.current !== null) {
            window.clearTimeout(revertTimerRef.current);
            revertTimerRef.current = null;
          }
          setStageCursor(e.target, 'grabbing');
        }}
        onDragMove={(e) => {
          if (e.target !== e.currentTarget) return;
          propsRef.current.onDragMove?.(e.target.x(), e.target.y());
        }}
        onDragEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          const x = e.target.x();
          const y = e.target.y();
          setStageCursor(e.target, propsRef.current.draggable ? 'grab' : 'pointer');
          propsRef.current.onDragEnd?.(x, y);
          scheduleRevert();
        }}
      >
        {/* turn pulse (behind) */}
        <Group ref={pulseRef} opacity={0} listening={false}>
          <TokenOutline square={square} radius={r + 4} stroke={MAP_COLORS.gold300} strokeWidth={3} glow={MAP_COLORS.gold400} />
        </Group>
        {isCurrentTurn && <TokenOutline square={square} radius={r + ringW * 0.5 + 1.5} stroke={withAlpha(MAP_COLORS.gold300, 0.85)} strokeWidth={2} />}
        {selected && <TokenOutline square={square} radius={r + ringW * 0.5 + 3} stroke={MAP_COLORS.gold400} strokeWidth={3} glow={MAP_COLORS.gold400} />}
        {highlight && (
          <TokenOutline square={square} radius={r + (selected ? 9 : 5)} stroke={highlight} strokeWidth={2.5} dash={[7, 5]} glow={highlight} />
        )}

        {/* body: drop shadow + portrait + ring */}
        {square ? (
          <Rect
            x={-r}
            y={-r}
            width={d}
            height={d}
            cornerRadius={r * 0.36}
            fill={MAP_COLORS.ink900}
            shadowColor="#000000"
            shadowBlur={d * 0.14}
            shadowOffsetY={d * 0.04}
            shadowOpacity={0.6}
            perfectDrawEnabled={false}
          />
        ) : (
          <Circle radius={r} fill={MAP_COLORS.ink900} shadowColor="#000000" shadowBlur={d * 0.14} shadowOffsetY={d * 0.04} shadowOpacity={0.6} perfectDrawEnabled={false} />
        )}
        <Portrait imageUrl={token.imageUrl} name={token.name} radius={r - ringW * 0.5} color={token.color} shape={square ? 'square' : 'circle'} />
        {isDown && <TokenOutline square={square} radius={r - ringW * 0.5} fill={isDead ? 'rgba(20, 20, 24, 0.62)' : 'rgba(20, 20, 40, 0.38)'} />}
        <TokenOutline square={square} radius={r - ringW * 0.5} stroke={token.color} strokeWidth={ringW} />
        <TokenOutline square={square} radius={r - ringW - 0.5} stroke="rgba(0, 0, 0, 0.55)" strokeWidth={1} />
        {!square && selected && (
          <RegularPolygon
            x={Math.cos(facingRad) * (r + ringW * 0.55)}
            y={Math.sin(facingRad) * (r + ringW * 0.55)}
            sides={3}
            radius={Math.max(3, ringW * 1.1)}
            rotation={token.facing + 90}
            fill={token.color}
            stroke={MAP_COLORS.ink950}
            strokeWidth={1}
            listening={false}
            perfectDrawEnabled={false}
          />
        )}

        <StatusBubbles statuses={token.statuses} radius={r} bubble={bubble} fontsVersion={fontsVersion} />
        {ghosted && <EyeOffBadge x={Math.cos(hiddenAngle) * r} y={Math.sin(hiddenAngle) * r} radius={bubble} />}
        {hpLayout && <HpBar layout={hpLayout} width={barW} height={barH} y={barY} exact={exact} fontsVersion={fontsVersion} />}
        <MapLabel
          text={token.name}
          y={nameY}
          anchor="top"
          fontSize={nameSize}
          maxWidth={Math.max(d * 2.2, 120)}
          borderColor={withAlpha(token.color, 0.8)}
          listening={false}
        />
      </Group>
    </>
  );
});
