import { useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { Circle, Ellipse, Group, Layer, Line, Path, Rect, Text } from 'react-konva';
import type { OverviewLink, OverviewMap, OverviewPin, Zone } from '@wailers/shared';
import { FONT_EMOJI, MAP_COLORS, MapLabel, setStageCursor, withAlpha } from '../../../../map';
import { shadeColor } from '../../../../map/mapUtils';
import { useMapScale } from '../useMapScale';
import { LINK_STYLES, pinIcon, pinLabel, pinStyleFor, type LinkStyle } from './overviewStyles';
import { useValueStore, type PointerStore, type WorldPoint } from './valueStore';

export type OverviewTool = 'select' | 'connect' | 'erase';

export type OverviewSelection = { kind: 'pin'; id: string } | { kind: 'link'; id: string };

type KonvaPointerEvent = Konva.KonvaEventObject<MouseEvent | TouchEvent>;

/** Screen px a press may travel and still count as a click (more = a pan gesture). */
const CLICK_SLOP_PX = 5;

export interface OverviewMapLayerProps {
  overview: OverviewMap;
  zonesById: Map<string, Zone>;
  /** 'view' = read-only rendering (no handlers, no catch area). */
  tool: OverviewTool | 'view';
  selection?: OverviewSelection | null;
  /** First pin chosen while connecting. */
  connectFrom?: string | null;
  linkStyle?: LinkStyle;
  /** Zone being placed with a click (shows a ghost pin under the pointer). */
  placingZone?: Zone | null;
  pointer?: PointerStore;
  onBackgroundClick?: (world: WorldPoint) => void;
  onPinClick?: (pin: OverviewPin) => void;
  onPinDblClick?: (pin: OverviewPin) => void;
  onPinDragEnd?: (pin: OverviewPin, x: number, y: number) => void;
  onLinkClick?: (link: OverviewLink) => void;
}

/** Pin geometry in unit (screen) px, tip at the origin. */
const HEAD_Y = -30;
const HEAD_R = 17;
const PIN_PATH = `M0,0 C-4,-8 -${HEAD_R},-16 -${HEAD_R},${HEAD_Y} A${HEAD_R},${HEAD_R} 0 1 1 ${HEAD_R},${HEAD_Y} C${HEAD_R},-16 4,-8 0,0 Z`;

function modeCursor(tool: OverviewTool | 'view', placing: boolean): string {
  if (placing) return 'crosshair';
  if (tool === 'connect') return 'crosshair';
  return 'default';
}

/**
 * Konva Layer (direct MapStage child) with the overview links and pins.
 * Pins and lines keep a constant screen size whatever the zoom.
 */
export function OverviewMapLayer({
  overview,
  zonesById,
  tool,
  selection = null,
  connectFrom = null,
  linkStyle = 'road',
  placingZone = null,
  pointer,
  onBackgroundClick,
  onPinClick,
  onPinDblClick,
  onPinDragEnd,
  onLinkClick,
}: OverviewMapLayerProps) {
  const scale = useMapScale();
  const k = 1 / Math.max(scale, 0.01);
  const interactive = tool !== 'view';
  const placing = !!placingZone;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const positions = useMemo(() => {
    const map = new Map<string, WorldPoint>();
    for (const p of overview.pins) map.set(p.id, drag && drag.id === p.id ? { x: drag.x, y: drag.y } : { x: p.x, y: p.y });
    return map;
  }, [overview.pins, drag]);

  // Lower pins are drawn last (natural overlap); the selected one always on top.
  const orderedPins = useMemo(() => {
    const selectedId = selection?.kind === 'pin' ? selection.id : null;
    return [...overview.pins].sort((a, b) => {
      if (a.id === selectedId) return 1;
      if (b.id === selectedId) return -1;
      return a.y - b.y;
    });
  }, [overview.pins, selection]);

  const cursorFor = (node: Konva.Node, target: 'pin' | 'link' | 'none') => {
    if (!interactive) return;
    if (target === 'none' || placing) {
      setStageCursor(node, modeCursor(tool, placing));
      return;
    }
    if (tool === 'erase') setStageCursor(node, 'pointer');
    else if (tool === 'connect') setStageCursor(node, target === 'pin' ? 'pointer' : 'crosshair');
    else setStageCursor(node, target === 'pin' ? 'grab' : 'pointer');
  };

  const downRef = useRef<{ x: number; y: number } | null>(null);
  /** Left click / tap that was not the end of a pan gesture (space + drag). */
  const accept = (e: KonvaPointerEvent): boolean => {
    const evt = e.evt;
    if (!('button' in evt)) return true;
    if (evt.button !== 0) return false;
    const down = downRef.current;
    return !down || Math.hypot(evt.clientX - down.x, evt.clientY - down.y) <= CLICK_SLOP_PX;
  };

  const handleBackground = (e: KonvaPointerEvent) => {
    if (!onBackgroundClick || !accept(e)) return;
    e.cancelBubble = true;
    const layer = e.target.getLayer();
    const p = layer?.getRelativePointerPosition();
    if (p) onBackgroundClick({ x: p.x, y: p.y });
  };

  return (
    <Layer
      listening={interactive}
      onMouseDown={(e) => {
        downRef.current = { x: e.evt.clientX, y: e.evt.clientY };
      }}
    >
      {interactive && (
        <Rect
          x={0}
          y={0}
          width={Math.max(1, overview.width)}
          height={Math.max(1, overview.height)}
          fill="rgba(0,0,0,0)"
          onClick={handleBackground}
          onTap={handleBackground}
          onMouseEnter={(e) => cursorFor(e.target, 'none')}
        />
      )}

      <Group>
        {overview.links.map((link) => {
          const a = positions.get(link.fromPinId);
          const b = positions.get(link.toPinId);
          if (!a || !b) return null;
          const selected = selection?.kind === 'link' && selection.id === link.id;
          return (
            <LinkShape
              key={link.id}
              link={link}
              a={a}
              b={b}
              k={k}
              selected={selected}
              danger={tool === 'erase' && hover === link.id}
              interactive={interactive && !placing}
              accept={accept}
              onEnter={(node) => {
                setHover(link.id);
                cursorFor(node, 'link');
              }}
              onLeave={(node) => {
                setHover((h) => (h === link.id ? null : h));
                cursorFor(node, 'none');
              }}
              onClick={() => onLinkClick?.(link)}
            />
          );
        })}
      </Group>

      {interactive && connectFrom && pointer && (
        <ConnectPreview from={positions.get(connectFrom) ?? null} pointer={pointer} k={k} style={linkStyle} />
      )}

      <Group>
        {orderedPins.map((pin) => {
          const zone = zonesById.get(pin.zoneId);
          const pos = positions.get(pin.id) ?? pin;
          const selected = selection?.kind === 'pin' && selection.id === pin.id;
          return (
            <PinShape
              key={pin.id}
              pin={pin}
              zone={zone}
              x={pos.x}
              y={pos.y}
              k={k}
              selected={selected}
              connectSource={connectFrom === pin.id}
              danger={tool === 'erase' && hover === pin.id}
              interactive={interactive && !placing}
              draggable={tool === 'select' && !placing}
              accept={accept}
              onEnter={(node) => {
                setHover(pin.id);
                cursorFor(node, 'pin');
              }}
              onLeave={(node) => {
                setHover((h) => (h === pin.id ? null : h));
                cursorFor(node, 'none');
              }}
              onClick={() => onPinClick?.(pin)}
              onDblClick={() => onPinDblClick?.(pin)}
              onDragMove={(x, y) => setDrag({ id: pin.id, x, y })}
              onDragEnd={(x, y) => {
                setDrag(null);
                onPinDragEnd?.(pin, x, y);
              }}
            />
          );
        })}
      </Group>

      {interactive && placingZone && pointer && <PlacingGhost zone={placingZone} pointer={pointer} k={k} />}
    </Layer>
  );
}

interface LinkShapeProps {
  link: OverviewLink;
  a: WorldPoint;
  b: WorldPoint;
  k: number;
  selected: boolean;
  danger: boolean;
  interactive: boolean;
  accept: (e: KonvaPointerEvent) => boolean;
  onEnter: (node: Konva.Node) => void;
  onLeave: (node: Konva.Node) => void;
  onClick: () => void;
}

function LinkShape({ link, a, b, k, selected, danger, interactive, accept, onEnter, onLeave, onClick }: LinkShapeProps) {
  const def = LINK_STYLES[link.style] ?? LINK_STYLES.road;
  const points = [a.x, a.y, b.x, b.y];
  const dash = def.dash ? def.dash.map((d) => d * k) : undefined;
  const color = danger ? MAP_COLORS.blood400 : def.color;
  const handle = (e: KonvaPointerEvent) => {
    e.cancelBubble = true;
    if (accept(e)) onClick();
  };
  return (
    <Group
      listening={interactive}
      onClick={handle}
      onTap={handle}
      onMouseEnter={(e) => onEnter(e.target)}
      onMouseLeave={(e) => onLeave(e.target)}
    >
      {selected && (
        <Line
          points={points}
          stroke={MAP_COLORS.gold400}
          strokeWidth={(def.width + 12) * k}
          lineCap="round"
          opacity={0.4}
          shadowColor={MAP_COLORS.gold400}
          shadowBlur={14 * k}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Line
        points={points}
        stroke={def.casing}
        strokeWidth={(def.width + 3) * k}
        dash={dash}
        lineCap={def.lineCap}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Line
        points={points}
        stroke={color}
        strokeWidth={def.width * k}
        dash={dash}
        lineCap={def.lineCap}
        hitStrokeWidth={18 * k}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

interface PinShapeProps {
  pin: OverviewPin;
  zone: Zone | undefined;
  x: number;
  y: number;
  k: number;
  selected: boolean;
  connectSource: boolean;
  danger: boolean;
  interactive: boolean;
  draggable: boolean;
  accept: (e: KonvaPointerEvent) => boolean;
  onEnter: (node: Konva.Node) => void;
  onLeave: (node: Konva.Node) => void;
  onClick: () => void;
  onDblClick: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}

function PinShape({
  pin,
  zone,
  x,
  y,
  k,
  selected,
  connectSource,
  danger,
  interactive,
  draggable,
  accept,
  onEnter,
  onLeave,
  onClick,
  onDblClick,
  onDragMove,
  onDragEnd,
}: PinShapeProps) {
  const style = pinStyleFor(zone);
  const fill = danger ? MAP_COLORS.blood500 : style.color;
  const label = pinLabel(pin, zone);
  const icon = pinIcon(pin, zone);

  const handleClick = (e: KonvaPointerEvent) => {
    e.cancelBubble = true;
    if (accept(e)) onClick();
  };
  const handleDbl = (e: KonvaPointerEvent) => {
    e.cancelBubble = true;
    onDblClick();
  };

  return (
    <Group
      x={x}
      y={y}
      scaleX={k}
      scaleY={k}
      listening={interactive}
      draggable={draggable}
      onMouseEnter={(e) => onEnter(e.target)}
      onMouseLeave={(e) => onLeave(e.target)}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDbl}
      onDblTap={handleDbl}
      onDragStart={(e) => {
        setStageCursor(e.target, 'grabbing');
      }}
      onDragMove={(e) => onDragMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => {
        setStageCursor(e.target, 'grab');
        onDragEnd(e.target.x(), e.target.y());
      }}
    >
      <Ellipse radiusX={9} radiusY={3.5} fill="rgba(0,0,0,0.5)" listening={false} perfectDrawEnabled={false} />
      {selected && (
        <Circle
          y={HEAD_Y}
          radius={HEAD_R + 7}
          stroke={MAP_COLORS.gold300}
          strokeWidth={2.5}
          shadowColor={MAP_COLORS.gold400}
          shadowBlur={14}
          shadowOpacity={0.9}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {connectSource && (
        <Circle
          y={HEAD_Y}
          radius={HEAD_R + 7}
          stroke={MAP_COLORS.arcane400}
          strokeWidth={2.5}
          dash={[5, 4]}
          shadowColor={MAP_COLORS.arcane400}
          shadowBlur={12}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Path
        data={PIN_PATH}
        fillLinearGradientStartPoint={{ x: 0, y: HEAD_Y - HEAD_R }}
        fillLinearGradientEndPoint={{ x: 0, y: 0 }}
        fillLinearGradientColorStops={[0, shadeColor(fill, 0.22), 0.6, fill, 1, shadeColor(fill, -0.45)]}
        stroke={shadeColor(fill, -0.6)}
        strokeWidth={1.5}
        shadowColor="#000000"
        shadowBlur={6}
        shadowOffsetY={2}
        shadowOpacity={0.55}
        perfectDrawEnabled={false}
      />
      <Circle y={HEAD_Y} radius={HEAD_R - 4.5} fill={MAP_COLORS.ink900} stroke={withAlpha('#ffffff', 0.15)} strokeWidth={1} perfectDrawEnabled={false} />
      <Text
        x={-15}
        y={HEAD_Y - 15}
        width={30}
        height={30}
        text={icon}
        fontSize={15}
        fontFamily={FONT_EMOJI}
        align="center"
        verticalAlign="middle"
        listening={false}
        perfectDrawEnabled={false}
      />
      <MapLabel
        text={label}
        y={6}
        anchor="top"
        fontSize={12.5}
        maxWidth={200}
        listening={interactive}
        textColor={zone ? MAP_COLORS.parchment50 : MAP_COLORS.parchment300}
        borderColor={selected ? MAP_COLORS.gold400 : withAlpha(style.color, 0.75)}
      />
    </Group>
  );
}

function ConnectPreview({ from, pointer, k, style }: { from: WorldPoint | null; pointer: PointerStore; k: number; style: LinkStyle }) {
  const p = useValueStore(pointer);
  if (!from || !p) return null;
  const def = LINK_STYLES[style];
  return (
    <Line
      points={[from.x, from.y, p.x, p.y]}
      stroke={def.color}
      strokeWidth={def.width * k}
      dash={(def.dash ?? [10, 8]).map((d) => d * k)}
      lineCap={def.lineCap}
      opacity={0.75}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

function PlacingGhost({ zone, pointer, k }: { zone: Zone; pointer: PointerStore; k: number }) {
  const p = useValueStore(pointer);
  if (!p) return null;
  const style = pinStyleFor(zone);
  return (
    <Group x={p.x} y={p.y} scaleX={k} scaleY={k} opacity={0.65} listening={false}>
      <Path data={PIN_PATH} fill={style.color} stroke={shadeColor(style.color, -0.6)} strokeWidth={1.5} dash={[4, 3]} />
      <Circle y={HEAD_Y} radius={HEAD_R - 4.5} fill={MAP_COLORS.ink900} />
      <Text x={-15} y={HEAD_Y - 15} width={30} height={30} text={style.icon} fontSize={15} fontFamily={FONT_EMOJI} align="center" verticalAlign="middle" />
      <MapLabel text={zone.name} y={6} anchor="top" fontSize={12.5} maxWidth={200} />
    </Group>
  );
}
