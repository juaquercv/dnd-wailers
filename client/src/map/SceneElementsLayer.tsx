import { memo, useMemo, useRef } from 'react';
import type Konva from 'konva';
import { Arrow, Circle, Ellipse, Group, Image as KonvaImage, Line, Path, Rect, Text } from 'react-konva';
import {
  LAYER_IDS,
  type ImageElement,
  type LayerId,
  type MarkerElement,
  type NoteElement,
  type PathElement,
  type SceneElement,
  type SceneElementType,
  type ShapeElement,
  type TextElement,
  type TokenElement,
  type TransitionElement,
  type TransitionType,
  type ZoneLevel,
} from '@wailers/shared';
import { MapLayerShell } from './MapLayer';
import { EyeOffBadge, labelBoxSize, MapLabel, Portrait } from './mapShapes';
import {
  clamp,
  FONT_DISPLAY,
  FONT_EMOJI,
  FONT_SANS,
  iconToEmoji,
  MAP_COLORS,
  measureTextBlock,
  pointsBounds,
  setStageCursor,
  shadeColor,
  useFontsVersion,
  withAlpha,
  type Bounds,
} from './mapUtils';
import { useImageStatus } from './useLoadedImage';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

/** Patch produced by a Transformer on an element (size/position/rotation in element terms). */
export type ElementPatch = Partial<SceneElement>;

export interface SceneElementsLayerProps {
  level: ZoneLevel;
  /** Layers to render (an element is drawn when its layer is listed; notes also need 'notes'). */
  layers: LayerId[];
  /** Render hidden elements (DM/editor) semi-transparent with a dashed outline. */
  showHidden: boolean;
  selectedIds?: string[];
  /** Elements receive pointer events (otherwise the layer does not listen). */
  interactive?: boolean;
  onElementMouseDown?(el: SceneElement, e: KMouseEvent): void;
  /** Left clicks only. */
  onElementClick?(el: SceneElement, e: KMouseEvent): void;
  onElementDblClick?(el: SceneElement, e: KMouseEvent): void;
  onElementContextMenu?(el: SceneElement, e: KMouseEvent): void;
  onElementDragMove?(el: SceneElement, x: number, y: number): void;
  /** New root position; the node is reset to the element's props, so apply it to the store. */
  onElementDragEnd?(el: SceneElement, x: number, y: number): void;
  /** Called after a Konva.Transformer attached to the element root (id = el.id, name = "element") finishes. */
  onElementTransformEnd?(el: SceneElement, patch: ElementPatch): void;
  draggable?: (el: SceneElement) => boolean;
  /** Element types to skip (e.g. ['token'] in live play, where design tokens became live tokens). */
  excludeTypes?: SceneElementType[];
}

const LAYER_ORDER = new Map<LayerId, number>(LAYER_IDS.map((id, i) => [id, i]));
const HIDDEN_OPACITY = 0.45;
const TEXT_LINE_HEIGHT = 1.15;
const NOTE_W = 200;
const NOTE_H = 150;
const NOTE_FOLD = 22;
const MARKER_R = 15;
const MARKER_HEAD_Y = MARKER_R * 1.75;
const MARKER_LABEL = { fontSize: 13, fontFamily: FONT_SANS, fontStyle: 'bold' } as const;
const TOKEN_LABEL = { fontSize: 12, fontFamily: FONT_SANS, fontStyle: 'bold', maxWidth: 180 } as const;
const TRANSITION_LABEL = { fontSize: 12, fontFamily: FONT_SANS, fontStyle: 'bold', maxWidth: 220 } as const;

// Teardrop pin with the tip at (0, 0): tangent points of the head circle seen from the tip.
const PIN_TANGENT_X = MARKER_R * Math.sqrt(1 - 1 / (1.75 * 1.75));
const PIN_TANGENT_Y = MARKER_HEAD_Y - MARKER_R / 1.75;
const PIN_PATH = `M 0 0 L ${-PIN_TANGENT_X} ${-PIN_TANGENT_Y} A ${MARKER_R} ${MARKER_R} 0 1 1 ${PIN_TANGENT_X} ${-PIN_TANGENT_Y} Z`;

export const TRANSITION_STYLES: Record<TransitionType, { color: string; icon: string; label: string }> = {
  door: { color: '#c98a4b', icon: '🚪', label: 'Puerta' },
  entrance: { color: '#5fd07a', icon: '🏛️', label: 'Entrada' },
  stairs_up: { color: MAP_COLORS.gold400, icon: '⬆️', label: 'Escaleras (subir)' },
  stairs_down: { color: MAP_COLORS.gold400, icon: '⬇️', label: 'Escaleras (bajar)' },
  portal: { color: MAP_COLORS.arcane400, icon: '🌀', label: 'Portal' },
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function tokenRadius(el: TokenElement, gridSize: number): number {
  return (Math.max(0.25, el.cells || 1) * Math.max(1, gridSize)) / 2;
}

/** Local bounds of an element (relative to its root node, before rotation). */
export function elementBounds(el: SceneElement, gridSize: number): Bounds {
  switch (el.type) {
    case 'image':
    case 'shape':
      return { x: Math.min(0, el.width), y: Math.min(0, el.height), width: Math.abs(el.width), height: Math.abs(el.height) };
    case 'path': {
      const b = pointsBounds(el.points);
      const pad = el.strokeWidth / 2;
      return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
    }
    case 'text': {
      const m = measureTextBlock(el.text || 'Texto', Math.max(4, el.fontSize), FONT_DISPLAY, TEXT_LINE_HEIGHT);
      return { x: 0, y: 0, width: Math.max(8, m.width), height: Math.max(8, m.height) };
    }
    case 'marker': {
      const label = el.label ? labelBoxSize(el.label, MARKER_LABEL) : null;
      const width = Math.max(MARKER_R * 2, label?.width ?? 0);
      const top = MARKER_HEAD_Y + MARKER_R;
      return { x: -width / 2, y: -top, width, height: top + (label ? 6 + label.height : 0) };
    }
    case 'token': {
      const r = tokenRadius(el, gridSize);
      const text = el.label || el.name;
      const label = text ? labelBoxSize(text, TOKEN_LABEL) : null;
      const width = Math.max(r * 2, label?.width ?? 0);
      return { x: -width / 2, y: -r, width, height: r * 2 + (label ? 4 + label.height : 0) };
    }
    case 'transition': {
      const w = Math.max(8, el.width);
      const h = Math.max(8, el.height);
      const label = labelBoxSize(el.label || TRANSITION_STYLES[el.transitionType].label, TRANSITION_LABEL);
      const width = Math.max(w, label.width);
      return { x: -width / 2, y: -h / 2, width, height: h + 5 + label.height };
    }
    case 'note':
      return { x: 0, y: -8, width: NOTE_W, height: NOTE_H + 8 };
  }
}

/** Converts a Transformer result (node scale/rotation/position) into an element patch. */
export function transformPatch(
  el: SceneElement,
  base: { x: number; y: number; rotation: number },
  scaleX: number,
  scaleY: number,
): ElementPatch {
  const sx = Math.abs(scaleX) || 1;
  const sy = Math.abs(scaleY) || 1;
  switch (el.type) {
    case 'image':
    case 'shape':
    case 'transition':
      return { ...base, width: Math.max(4, Math.round(el.width * sx)), height: Math.max(4, Math.round(el.height * sy)) };
    case 'text':
      return { ...base, fontSize: Math.max(6, Math.round(el.fontSize * sy)) };
    case 'path':
      return { ...base, points: el.points.map((v, i) => Math.round((i % 2 === 0 ? v * scaleX : v * scaleY) * 100) / 100) };
    case 'token':
      return { ...base, cells: Math.max(0.5, Math.round(el.cells * ((sx + sy) / 2) * 2) / 2) };
    case 'marker':
    case 'note':
      return base;
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
    }
    return true;
  }
  return false;
}

/** Elements are cloned on every editor update; compare by value to avoid re-rendering untouched nodes. */
function elementsEqual(a: SceneElement, b: SceneElement): boolean {
  if (a === b) return true;
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  const keys = Object.keys(ra);
  if (keys.length !== Object.keys(rb).length) return false;
  for (const k of keys) if (!valuesEqual(ra[k], rb[k])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Element visuals
// ---------------------------------------------------------------------------

function ImageContent({ el }: { el: ImageElement }) {
  const { image, status } = useImageStatus(el.url);
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  return (
    <Group opacity={clamp(el.opacity ?? 1, 0, 1)}>
      {image ? (
        <KonvaImage image={image} width={w} height={h} perfectDrawEnabled={false} />
      ) : (
        <>
          <Rect
            width={w}
            height={h}
            fill="rgba(243, 234, 214, 0.05)"
            stroke="rgba(243, 234, 214, 0.35)"
            strokeWidth={1.5}
            dash={[8, 6]}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
          {w > 70 && h > 24 && (
            <Text
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              text={status === 'failed' ? 'Imagen no disponible' : 'Cargando imagen…'}
              fontSize={clamp(Math.min(w, h) * 0.08, 10, 18)}
              fontFamily={FONT_SANS}
              fill="rgba(243, 234, 214, 0.6)"
              listening={false}
            />
          )}
        </>
      )}
    </Group>
  );
}

function ShapeContent({ el }: { el: ShapeElement }) {
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  const hasStroke = el.strokeWidth > 0 && !!el.stroke;
  const common = {
    fill: el.fill || 'rgba(0, 0, 0, 0)',
    stroke: hasStroke ? el.stroke : undefined,
    strokeWidth: hasStroke ? el.strokeWidth : 0,
    opacity: clamp(el.opacity ?? 1, 0, 1),
    perfectDrawEnabled: false,
  };
  if (el.shape === 'ellipse') return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
  return <Rect width={w} height={h} {...common} />;
}

function PathContent({ el }: { el: PathElement }) {
  return (
    <Line
      points={el.points}
      stroke={el.stroke}
      strokeWidth={Math.max(0.5, el.strokeWidth)}
      closed={el.closed}
      fill={el.closed && el.fill ? el.fill : undefined}
      tension={0}
      lineCap="round"
      lineJoin="round"
      opacity={clamp(el.opacity ?? 1, 0, 1)}
      hitStrokeWidth={Math.max(el.strokeWidth, 14)}
      perfectDrawEnabled={false}
    />
  );
}

function TextContent({ el, showPlaceholder, fontsVersion }: { el: TextElement; showPlaceholder: boolean; fontsVersion: number }) {
  const empty = !el.text.trim();
  if (empty && !showPlaceholder) return null;
  const fontSize = Math.max(4, el.fontSize);
  return (
    <Text
      key={fontsVersion}
      text={empty ? 'Texto' : el.text}
      opacity={empty ? 0.35 : 1}
      fontSize={fontSize}
      fontFamily={FONT_DISPLAY}
      lineHeight={TEXT_LINE_HEIGHT}
      fill={el.color || MAP_COLORS.parchment100}
      shadowColor="#000000"
      shadowBlur={Math.max(2, fontSize * 0.12)}
      shadowOpacity={0.75}
      shadowOffsetY={1}
      perfectDrawEnabled={false}
    />
  );
}

function MarkerContent({ el }: { el: MarkerElement }) {
  const color = el.color || MAP_COLORS.gold400;
  const iconSize = MARKER_R * 1.05;
  return (
    <Group>
      <Path
        data={PIN_PATH}
        fill={color}
        stroke={MAP_COLORS.ink950}
        strokeWidth={1.5}
        shadowColor="#000000"
        shadowBlur={6}
        shadowOffsetY={2}
        shadowOpacity={0.6}
        perfectDrawEnabled={false}
      />
      <Circle y={-MARKER_HEAD_Y} radius={MARKER_R * 0.74} fill="rgba(11, 10, 8, 0.35)" listening={false} />
      <Text
        x={-MARKER_R}
        y={-MARKER_HEAD_Y - iconSize / 2}
        width={MARKER_R * 2}
        height={iconSize}
        text={iconToEmoji(el.icon)}
        fontSize={iconSize}
        fontFamily={FONT_EMOJI}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
      {el.label && <MapLabel text={el.label} y={6} anchor="top" {...MARKER_LABEL} borderColor={withAlpha(color, 0.7)} listening />}
    </Group>
  );
}

function TokenElementContent({ el, gridSize }: { el: TokenElement; gridSize: number }) {
  const r = tokenRadius(el, gridSize);
  const ring = el.entryKind === 'item' ? MAP_COLORS.gold400 : MAP_COLORS.blood400;
  const ringWidth = Math.max(2, r * 0.08);
  const text = el.label || el.name;
  return (
    <Group>
      <Circle
        radius={r}
        fill={MAP_COLORS.ink800}
        shadowColor="#000000"
        shadowBlur={r * 0.3}
        shadowOpacity={0.55}
        shadowOffsetY={r * 0.06}
        perfectDrawEnabled={false}
      />
      <Portrait imageUrl={el.imageUrl} name={text} radius={r - ringWidth * 0.5} color={ring} shape={el.entryKind === 'item' ? 'square' : 'circle'} />
      <Circle
        radius={r - ringWidth / 2}
        stroke={ring}
        strokeWidth={ringWidth}
        dash={[r * 0.32, r * 0.18]}
        lineCap="round"
        perfectDrawEnabled={false}
      />
      {el.startHidden && <EyeOffBadge x={r * 0.72} y={-r * 0.72} radius={Math.max(7, r * 0.22)} />}
      {text && <MapLabel text={text} y={r + 4} anchor="top" {...TOKEN_LABEL} borderColor={withAlpha(ring, 0.7)} listening />}
    </Group>
  );
}

function StairsGlyph({ w, h, up, color }: { w: number; h: number; up: boolean; color: string }) {
  const steps = 4;
  const inset = Math.min(10, w * 0.12);
  const lines = [];
  for (let i = 1; i <= steps; i++) {
    const y = -h / 2 + (i * h) / (steps + 1);
    const shrink = ((up ? steps + 1 - i : i) / (steps + 1)) * w * 0.18;
    lines.push(
      <Line key={i} points={[-w / 2 + inset + shrink, y, w / 2 - inset - shrink, y]} stroke={withAlpha(color, 0.38)} strokeWidth={2} lineCap="round" listening={false} />,
    );
  }
  const len = h * 0.3;
  const size = Math.min(w, h);
  return (
    <Group listening={false}>
      {lines}
      <Arrow
        points={up ? [0, len, 0, -len] : [0, -len, 0, len]}
        stroke={color}
        fill={color}
        strokeWidth={Math.max(3, size * 0.07)}
        pointerLength={Math.max(6, size * 0.18)}
        pointerWidth={Math.max(6, size * 0.2)}
        lineCap="round"
        shadowColor="#000000"
        shadowBlur={4}
        shadowOpacity={0.6}
      />
    </Group>
  );
}

function TransitionContent({ el, showWarnings }: { el: TransitionElement; showWarnings: boolean }) {
  const style = TRANSITION_STYLES[el.transitionType];
  const w = Math.max(8, el.width);
  const h = Math.max(8, el.height);
  const size = Math.min(w, h);
  const isStairs = el.transitionType === 'stairs_up' || el.transitionType === 'stairs_down';
  return (
    <Group>
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        cornerRadius={Math.min(10, size * 0.2)}
        fill={withAlpha(style.color, 0.18)}
        stroke={style.color}
        strokeWidth={2}
        shadowColor={style.color}
        shadowBlur={16}
        shadowOpacity={0.55}
        perfectDrawEnabled={false}
      />
      {el.transitionType === 'portal' && (
        <Ellipse
          radiusX={w * 0.34}
          radiusY={h * 0.4}
          stroke={style.color}
          strokeWidth={Math.max(2, size * 0.05)}
          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientEndRadius={Math.max(w, h) * 0.4}
          fillRadialGradientColorStops={[0, withAlpha(MAP_COLORS.parchment50, 0.55), 0.5, withAlpha(style.color, 0.45), 1, withAlpha(style.color, 0)]}
          shadowColor={style.color}
          shadowBlur={12}
          shadowOpacity={0.8}
          listening={false}
        />
      )}
      {isStairs ? (
        <StairsGlyph w={w} h={h} up={el.transitionType === 'stairs_up'} color={style.color} />
      ) : (
        <Text
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          text={style.icon}
          fontSize={size * (el.transitionType === 'portal' ? 0.36 : 0.5)}
          fontFamily={FONT_EMOJI}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
      <MapLabel text={el.label || style.label} y={h / 2 + 5} anchor="top" {...TRANSITION_LABEL} borderColor={withAlpha(style.color, 0.75)} listening />
      {showWarnings && !el.target && (
        <Group x={w / 2 - 2} y={-h / 2 + 2} listening={false}>
          <Circle radius={9} fill={MAP_COLORS.blood500} stroke={MAP_COLORS.ink950} strokeWidth={1.5} />
          <Text x={-9} y={-9} width={18} height={18} text="!" fontSize={13} fontStyle="bold" fontFamily={FONT_SANS} fill="#ffffff" align="center" verticalAlign="middle" />
        </Group>
      )}
    </Group>
  );
}

function NoteContent({ el, fontsVersion }: { el: NoteElement; fontsVersion: number }) {
  const color = el.color || '#f6e27a';
  return (
    <Group>
      <Line
        points={[0, 0, NOTE_W, 0, NOTE_W, NOTE_H - NOTE_FOLD, NOTE_W - NOTE_FOLD, NOTE_H, 0, NOTE_H]}
        closed
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: NOTE_H }}
        fillLinearGradientColorStops={[0, shadeColor(color, 0.12), 1, color]}
        shadowColor="#000000"
        shadowBlur={12}
        shadowOffsetX={3}
        shadowOffsetY={5}
        shadowOpacity={0.45}
        perfectDrawEnabled={false}
      />
      <Line
        points={[NOTE_W, NOTE_H - NOTE_FOLD, NOTE_W - NOTE_FOLD, NOTE_H - NOTE_FOLD, NOTE_W - NOTE_FOLD, NOTE_H]}
        closed
        fill={shadeColor(color, -0.22)}
        listening={false}
      />
      <Text
        key={`h${fontsVersion}`}
        x={12}
        y={12}
        width={NOTE_W - 24}
        text={el.name && el.name !== 'Nota' ? el.name.toUpperCase() : 'NOTA DEL DM'}
        fontSize={10}
        fontStyle="bold"
        fontFamily={FONT_SANS}
        letterSpacing={1.2}
        fill="rgba(59, 47, 18, 0.7)"
        wrap="none"
        ellipsis
        listening={false}
      />
      <Text
        key={`t${fontsVersion}`}
        x={12}
        y={30}
        width={NOTE_W - 24}
        height={NOTE_H - 30 - 14}
        text={el.text || 'Nota vacía'}
        opacity={el.text ? 1 : 0.5}
        fontSize={14}
        lineHeight={1.25}
        fontFamily={FONT_SANS}
        fill="#3b2f12"
        wrap="word"
        ellipsis
        listening={false}
      />
      <Circle x={NOTE_W / 2} y={0} radius={6.5} fill={MAP_COLORS.blood500} stroke={MAP_COLORS.blood600} strokeWidth={1} shadowColor="#000000" shadowBlur={3} shadowOpacity={0.5} listening={false} />
      <Circle x={NOTE_W / 2 - 2} y={-2} radius={2} fill="rgba(255, 255, 255, 0.7)" listening={false} />
    </Group>
  );
}

function ElementContent({ el, gridSize, showWarnings, fontsVersion }: { el: SceneElement; gridSize: number; showWarnings: boolean; fontsVersion: number }) {
  switch (el.type) {
    case 'image':
      return <ImageContent el={el} />;
    case 'shape':
      return <ShapeContent el={el} />;
    case 'path':
      return <PathContent el={el} />;
    case 'text':
      return <TextContent el={el} showPlaceholder={showWarnings} fontsVersion={fontsVersion} />;
    case 'marker':
      return <MarkerContent el={el} />;
    case 'token':
      return <TokenElementContent el={el} gridSize={gridSize} />;
    case 'transition':
      return <TransitionContent el={el} showWarnings={showWarnings} />;
    case 'note':
      return <NoteContent el={el} fontsVersion={fontsVersion} />;
  }
}

// ---------------------------------------------------------------------------
// Element nodes
// ---------------------------------------------------------------------------

interface ElementHandlers {
  mouseDown(el: SceneElement, e: KMouseEvent): void;
  click(el: SceneElement, e: KMouseEvent): void;
  dblClick(el: SceneElement, e: KMouseEvent): void;
  contextMenu(el: SceneElement, e: KMouseEvent): void;
  dragMove(el: SceneElement, node: Konva.Node): void;
  dragEnd(el: SceneElement, node: Konva.Node): void;
  transform(el: SceneElement, node: Konva.Node): void;
  transformEnd(el: SceneElement, node: Konva.Node): void;
}

interface ElementNodeProps {
  el: SceneElement;
  gridSize: number;
  interactive: boolean;
  draggable: boolean;
  tagNodes: boolean;
  showWarnings: boolean;
  fontsVersion: number;
  handlers: ElementHandlers;
}

const ElementNode = memo(
  function ElementNode({ el, gridSize, interactive, draggable, tagNodes, showWarnings, fontsVersion, handlers }: ElementNodeProps) {
    return (
      <Group
        id={tagNodes ? el.id : undefined}
        name={tagNodes ? 'element' : undefined}
        x={el.x}
        y={el.y}
        rotation={el.rotation}
        opacity={el.hidden ? HIDDEN_OPACITY : 1}
        draggable={interactive && draggable}
        listening={interactive}
        onMouseDown={(e) => handlers.mouseDown(el, e)}
        onClick={(e) => handlers.click(el, e)}
        onDblClick={(e) => handlers.dblClick(el, e)}
        onContextMenu={(e) => handlers.contextMenu(el, e)}
        onDragMove={(e) => {
          if (e.target === e.currentTarget) handlers.dragMove(el, e.currentTarget);
        }}
        onDragEnd={(e) => {
          if (e.target === e.currentTarget) handlers.dragEnd(el, e.currentTarget);
        }}
        onTransform={(e) => handlers.transform(el, e.currentTarget)}
        onTransformEnd={(e) => handlers.transformEnd(el, e.currentTarget)}
        onMouseEnter={(e) => {
          if (interactive) setStageCursor(e.target, draggable ? 'move' : 'pointer');
        }}
        onMouseLeave={(e) => {
          if (interactive) setStageCursor(e.target, '');
        }}
      >
        <ElementContent el={el} gridSize={gridSize} showWarnings={showWarnings} fontsVersion={fontsVersion} />
      </Group>
    );
  },
  (a, b) =>
    a.gridSize === b.gridSize &&
    a.interactive === b.interactive &&
    a.draggable === b.draggable &&
    a.tagNodes === b.tagNodes &&
    a.showWarnings === b.showWarnings &&
    a.fontsVersion === b.fontsVersion &&
    a.handlers === b.handlers &&
    elementsEqual(a.el, b.el),
);

interface OutlineProps {
  el: SceneElement;
  bounds: Bounds;
  selected: boolean;
  register: (id: string, node: Konva.Group | null) => void;
}

/** Selection / hidden outlines drawn above all elements, kept in sync with the node while dragging or transforming. */
function ElementOutline({ el, bounds, selected, register }: OutlineProps) {
  const pad = selected ? 5 : 3;
  return (
    <Group ref={(node) => register(el.id, node)} x={el.x} y={el.y} rotation={el.rotation} listening={false}>
      {el.hidden && (
        <>
          <Rect
            x={bounds.x - 3}
            y={bounds.y - 3}
            width={bounds.width + 6}
            height={bounds.height + 6}
            stroke="rgba(243, 234, 214, 0.75)"
            strokeWidth={1.5}
            dash={[7, 5]}
            cornerRadius={4}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
          <EyeOffBadge x={bounds.x - 3} y={bounds.y - 3} radius={8} />
        </>
      )}
      {selected && (
        <Rect
          x={bounds.x - pad}
          y={bounds.y - pad}
          width={bounds.width + pad * 2}
          height={bounds.height + pad * 2}
          stroke={MAP_COLORS.gold400}
          strokeWidth={2}
          cornerRadius={5}
          shadowColor={MAP_COLORS.gold400}
          shadowBlur={8}
          shadowOpacity={0.8}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Group + Layer
// ---------------------------------------------------------------------------

export interface SceneElementsGroupProps extends SceneElementsLayerProps {
  /** Set id/name on element roots for Transformers (false for decorative copies, e.g. lower floors). */
  tagNodes?: boolean;
}

/** All visible elements of a level as a Group (compose it inside another layer if needed). */
export function SceneElementsGroup(props: SceneElementsGroupProps) {
  const { level, layers, showHidden, selectedIds, interactive = false, draggable, excludeTypes, tagNodes = true } = props;
  const fontsVersion = useFontsVersion();
  const gridSize = level.grid.size;

  const propsRef = useRef(props);
  propsRef.current = props;
  const outlineNodes = useRef(new Map<string, Konva.Group>());

  const layersKey = layers.join('|');
  const excludeKey = (excludeTypes ?? []).join('|');
  const selectedKey = (selectedIds ?? []).join('|');

  const visible = useMemo(() => {
    const layerSet = new Set<string>(layersKey ? layersKey.split('|') : []);
    const excluded = new Set<string>(excludeKey ? excludeKey.split('|') : []);
    return level.elements
      .map((el, index) => ({ el, index }))
      .filter(({ el }) => {
        if (!layerSet.has(el.layer)) return false;
        if (el.type === 'note' && !layerSet.has('notes')) return false;
        if (el.hidden && !showHidden) return false;
        return !excluded.has(el.type);
      })
      .sort((a, b) => (LAYER_ORDER.get(a.el.layer) ?? 0) - (LAYER_ORDER.get(b.el.layer) ?? 0) || a.index - b.index)
      .map(({ el }) => el);
  }, [level.elements, layersKey, excludeKey, showHidden]);

  const selectedSet = useMemo(() => new Set(selectedKey ? selectedKey.split('|') : []), [selectedKey]);

  const handlers = useMemo<ElementHandlers>(() => {
    const syncOutline = (id: string, node: Konva.Node) => {
      const outline = outlineNodes.current.get(id);
      if (!outline) return;
      outline.setAttrs({ x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() });
    };
    const resetOutline = (el: SceneElement) => {
      outlineNodes.current.get(el.id)?.setAttrs({ x: el.x, y: el.y, rotation: el.rotation, scaleX: 1, scaleY: 1 });
    };
    return {
      mouseDown: (el, e) => propsRef.current.onElementMouseDown?.(el, e),
      click: (el, e) => {
        if (e.evt.button === 0) propsRef.current.onElementClick?.(el, e);
      },
      dblClick: (el, e) => {
        if (e.evt.button === 0) propsRef.current.onElementDblClick?.(el, e);
      },
      contextMenu: (el, e) => propsRef.current.onElementContextMenu?.(el, e),
      dragMove: (el, node) => {
        syncOutline(el.id, node);
        propsRef.current.onElementDragMove?.(el, node.x(), node.y());
      },
      dragEnd: (el, node) => {
        const x = node.x();
        const y = node.y();
        // Controlled: snap back to props; the store update (if any) moves it to the final place.
        node.position({ x: el.x, y: el.y });
        resetOutline(el);
        propsRef.current.onElementDragEnd?.(el, x, y);
      },
      transform: (el, node) => syncOutline(el.id, node),
      transformEnd: (el, node) => {
        const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.setAttrs({ x: el.x, y: el.y, rotation: el.rotation, scaleX: 1, scaleY: 1 });
        resetOutline(el);
        propsRef.current.onElementTransformEnd?.(el, transformPatch(el, base, sx, sy));
      },
    };
  }, []);

  const register = useMemo(
    () => (id: string, node: Konva.Group | null) => {
      if (node) outlineNodes.current.set(id, node);
      else outlineNodes.current.delete(id);
    },
    [],
  );

  const outlined = visible.filter((el) => el.hidden || selectedSet.has(el.id));

  return (
    <Group>
      {visible.map((el) => (
        <ElementNode
          key={el.id}
          el={el}
          gridSize={gridSize}
          interactive={interactive}
          draggable={!!draggable && !el.locked && draggable(el)}
          tagNodes={tagNodes}
          showWarnings={showHidden}
          fontsVersion={fontsVersion}
          handlers={handlers}
        />
      ))}
      {outlined.length > 0 && (
        <Group listening={false}>
          {outlined.map((el) => (
            <ElementOutline key={el.id} el={el} bounds={elementBounds(el, gridSize)} selected={selectedSet.has(el.id)} register={register} />
          ))}
        </Group>
      )}
    </Group>
  );
}

/**
 * `SceneElementsLayer`: renders image/shape/path/text/marker/token/transition/note elements of a level.
 * Each element root has id = el.id and name = "element" so an editor can attach a Konva.Transformer.
 */
export function SceneElementsLayer(props: SceneElementsLayerProps) {
  return (
    <MapLayerShell listening={!!props.interactive}>
      <SceneElementsGroup {...props} />
    </MapLayerShell>
  );
}
