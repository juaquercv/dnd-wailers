import { memo, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Circle, Group, Line, Rect } from 'react-konva';
import type { Wall } from '@wailers/shared';
import { MapLayerShell } from './MapLayer';
import { MAP_COLORS, polylineMidpoint, setStageCursor } from './mapUtils';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export interface WallsLayerProps {
  walls: Wall[];
  /** Live door states (wall id -> open), overriding Wall.open. */
  doorStates?: Record<string, boolean>;
  /** Walls are clickable (editor selection). */
  interactive?: boolean;
  selectedIds?: string[];
  onWallClick?(wall: Wall, e: KMouseEvent): void;
  /** Shows a clickable open/close handle on each door. */
  onDoorToggle?(wall: Wall): void;
}

const WALL_CORE = '#d9c9a3';
const OUTLINE = 'rgba(11, 10, 8, 0.85)';
const HANDLE_R = 12;

function DoorHandle({ wall, open, onToggle }: { wall: Wall; open: boolean; onToggle: (wall: Wall) => void }) {
  const mid = polylineMidpoint(wall.points);
  const ring = open ? MAP_COLORS.emerald400 : MAP_COLORS.door;
  return (
    <Group
      x={mid.x}
      y={mid.y}
      onClick={(e) => {
        if (e.evt.button !== 0) return;
        e.cancelBubble = true;
        onToggle(wall);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onToggle(wall);
      }}
      onMouseDown={(e) => {
        if (e.evt.button === 0) e.cancelBubble = true;
      }}
      onMouseEnter={(e) => setStageCursor(e.target, 'pointer')}
      onMouseLeave={(e) => setStageCursor(e.target, '')}
    >
      <Circle
        radius={HANDLE_R}
        fill={MAP_COLORS.ink900}
        stroke={ring}
        strokeWidth={2.5}
        shadowColor={ring}
        shadowBlur={8}
        shadowOpacity={0.7}
        perfectDrawEnabled={false}
      />
      {open ? (
        <Group listening={false}>
          {/* open: empty frame + leaf swung outwards */}
          <Rect x={-4.5} y={-6.5} width={9} height={13} stroke={MAP_COLORS.parchment300} strokeWidth={1.4} />
          <Line points={[-4.5, -6.5, 2.5, -8.5, 2.5, 4.5, -4.5, 6.5]} closed fill={MAP_COLORS.door} stroke={MAP_COLORS.doorDark} strokeWidth={1} />
        </Group>
      ) : (
        <Group listening={false}>
          {/* closed: solid door with a knob */}
          <Rect x={-4.5} y={-6.5} width={9} height={13} cornerRadius={1} fill={MAP_COLORS.door} stroke={MAP_COLORS.doorDark} strokeWidth={1} />
          <Circle x={2.2} y={0.5} radius={1.2} fill={MAP_COLORS.gold300} />
        </Group>
      )}
    </Group>
  );
}

const WallShape = memo(function WallShape({
  wall,
  open,
  selected,
  interactive,
  onClick,
}: {
  wall: Wall;
  open: boolean;
  selected: boolean;
  interactive: boolean;
  onClick: (wall: Wall, e: KMouseEvent) => void;
}) {
  if (wall.points.length < 4) return null;
  const glow = selected ? { shadowColor: MAP_COLORS.gold400, shadowBlur: 12, shadowOpacity: 1 } : {};
  const events = interactive
    ? {
        onClick: (e: KMouseEvent) => {
          if (e.evt.button === 0) onClick(wall, e);
        },
        onMouseEnter: (e: KMouseEvent) => setStageCursor(e.target, 'pointer'),
        onMouseLeave: (e: KMouseEvent) => setStageCursor(e.target, ''),
      }
    : {};

  let core;
  if (wall.kind === 'door') {
    core = (
      <Line
        points={wall.points}
        stroke={selected ? MAP_COLORS.gold400 : MAP_COLORS.door}
        strokeWidth={6}
        dash={[16, 8]}
        lineCap="butt"
        lineJoin="round"
        opacity={open ? 0.45 : 1}
        hitStrokeWidth={20}
        listening={interactive}
        perfectDrawEnabled={false}
        {...glow}
        {...events}
      />
    );
  } else if (wall.kind === 'window') {
    core = (
      <Group listening={interactive} {...events}>
        <Line points={wall.points} stroke={selected ? MAP_COLORS.gold400 : MAP_COLORS.window} strokeWidth={5} lineCap="round" lineJoin="round" hitStrokeWidth={20} perfectDrawEnabled={false} {...glow} />
        <Line points={wall.points} stroke="rgba(255, 255, 255, 0.85)" strokeWidth={1.4} lineCap="round" lineJoin="round" listening={false} />
      </Group>
    );
  } else {
    core = (
      <Line
        points={wall.points}
        stroke={selected ? MAP_COLORS.gold400 : WALL_CORE}
        strokeWidth={5}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={20}
        listening={interactive}
        perfectDrawEnabled={false}
        {...glow}
        {...events}
      />
    );
  }

  const vertices: { x: number; y: number }[] = [];
  if (selected) {
    for (let i = 0; i + 1 < wall.points.length; i += 2) vertices.push({ x: wall.points[i] ?? 0, y: wall.points[i + 1] ?? 0 });
  }

  return (
    <Group>
      <Line
        points={wall.points}
        stroke={OUTLINE}
        strokeWidth={wall.kind === 'window' ? 9 : 10}
        lineCap="round"
        lineJoin="round"
        opacity={wall.kind === 'door' && open ? 0.5 : 1}
        listening={false}
        perfectDrawEnabled={false}
      />
      {core}
      {vertices.map((v, i) => (
        <Circle key={i} x={v.x} y={v.y} radius={5} fill={MAP_COLORS.gold400} stroke={MAP_COLORS.ink950} strokeWidth={1.5} listening={false} />
      ))}
    </Group>
  );
});

/** `WallsLayer`: walls (thick lines), doors (brown dashed + open/close handle) and windows (light blue). */
export function WallsLayer({ walls, doorStates, interactive = false, selectedIds, onWallClick, onDoorToggle }: WallsLayerProps) {
  const callbacks = useRef({ onWallClick, onDoorToggle });
  callbacks.current = { onWallClick, onDoorToggle };
  const selectedKey = (selectedIds ?? []).join('|');
  const selected = useMemo(() => new Set(selectedKey ? selectedKey.split('|') : []), [selectedKey]);
  const handleClick = useMemo(() => (wall: Wall, e: KMouseEvent) => callbacks.current.onWallClick?.(wall, e), []);
  const handleToggle = useMemo(() => (wall: Wall) => callbacks.current.onDoorToggle?.(wall), []);
  const showHandles = !!onDoorToggle;

  return (
    <MapLayerShell listening={interactive || showHandles}>
      {walls.map((wall) => (
        <WallShape
          key={wall.id}
          wall={wall}
          open={doorStates?.[wall.id] ?? wall.open}
          selected={selected.has(wall.id)}
          interactive={interactive}
          onClick={handleClick}
        />
      ))}
      {showHandles &&
        walls
          .filter((w) => w.kind === 'door' && w.points.length >= 4)
          .map((wall) => <DoorHandle key={wall.id} wall={wall} open={doorStates?.[wall.id] ?? wall.open} onToggle={handleToggle} />)}
    </MapLayerShell>
  );
}
