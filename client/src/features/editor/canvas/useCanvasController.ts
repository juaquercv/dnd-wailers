import { useEffect, useMemo, useRef, type DragEvent as ReactDragEvent, type RefObject } from 'react';
import type Konva from 'konva';
import {
  type FogRegion,
  type LightSource,
  type Point,
  type SceneElement,
  type Wall,
} from '@wailers/shared';
import { setStageCursor, type ElementPatch, type MapMouseEvent, type MapPoint, type MapStageHandle } from '../../../map';
import { useContextMenu } from '../../../components/ui/ContextMenu';
import { toast } from '../../../components/ui/toast';
import { isEditableTarget } from '../../../lib/hotkeys';
import { useEditorStore, type EditorTool, type SelectionItem } from '../editorStore';
import { resetCanvasUi, setCanvasDraft, setCanvasPointer, useCanvasUi, type PolyTool } from './canvasUiStore';
import { buildCanvasMenu, buildElementMenu, hiddenPatch, isInlineEditable } from './elementMenu';
import {
  createFogRegion,
  createLight,
  createMarkerElement,
  createNoteElement,
  createPathElement,
  createShapeElement,
  createTextElement,
  createTransitionElement,
  createWall,
} from './factories';
import {
  distance,
  elementWorldRect,
  firstPoint,
  hasUsableGrid,
  lastPoint,
  polylineLength,
  rectContainsPoint,
  rectContainsPoints,
  rectContainsRect,
  rectFromPoints,
  round1,
  roundPoint,
  roundPoints,
  simplifyPoints,
  snapElementPosition,
  snapPoint,
  type Rect,
  type SnapKind,
} from './geometry';
import { ensureLayerWritable, getCurrentScene, isElementSelectable, isLayerEditable, layerForTool } from './sceneAccess';
import { useCanvasDrop } from './useCanvasDrop';

type KMouseEvent = Konva.KonvaEventObject<MouseEvent>;

/** Screen px under which a click repeats the previous point (second click of a double click). */
const DUPLICATE_POINT_PX = 5;
/** Screen px around the first point that closes a polygon. */
const CLOSE_POLYGON_PX = 10;
/** Screen px a press must travel before a marquee / shape drag starts. */
const DRAG_THRESHOLD_PX = 4;
/** Max screen px between the two clicks of a double click (Konva fires stage dblclicks regardless of distance). */
const DOUBLE_CLICK_SLOP_PX = 6;
/** Max length of an element name derived from its text or label. */
const DERIVED_NAME_MAX = 48;

const TOOL_CURSORS: Partial<Record<EditorTool, string>> = {
  draw: 'crosshair',
  line: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
  text: 'text',
  marker: 'copy',
  wall: 'crosshair',
  light: 'copy',
  fog: 'crosshair',
  transition: 'copy',
  note: 'copy',
  spawn: 'copy',
};

interface DragSession {
  primaryId: string;
  /** Start positions of every element moving with the primary one (primary included). */
  start: Map<string, Point>;
  /** Konva nodes of the secondary elements (resolved on the first move). */
  nodes: Map<string, Konva.Node> | null;
}

interface WindowGesture {
  move: (ev: MouseEvent) => void;
  up: (ev: MouseEvent) => void;
  cancel: () => void;
}

export interface CanvasController {
  onStageMouseDown(e: MapMouseEvent, world: MapPoint): void;
  onStageMouseMove(e: MapMouseEvent, world: MapPoint): void;
  onStageClick(e: MapMouseEvent, world: MapPoint): void;
  onStageDblClick(e: MapMouseEvent, world: MapPoint): void;
  onStageContextMenu(e: MapMouseEvent, world: MapPoint): void;
  onDrop(e: DragEvent, world: MapPoint): void;
  onDragOver(e: DragEvent): void;
  onViewChange(v: { x: number; y: number; scale: number }): void;
  onWrapperMouseLeave(): void;
  onWrapperDragLeave(e: ReactDragEvent<HTMLDivElement>): void;

  onElementMouseDown(el: SceneElement, e: KMouseEvent): void;
  onElementClick(el: SceneElement, e: KMouseEvent): void;
  onElementDblClick(el: SceneElement, e: KMouseEvent): void;
  onElementContextMenu(el: SceneElement, e: KMouseEvent): void;
  onElementDragMove(el: SceneElement, x: number, y: number): void;
  onElementDragEnd(el: SceneElement, x: number, y: number): void;
  onElementTransformEnd(el: SceneElement, patch: ElementPatch): void;

  onWallClick(wall: Wall, e: KMouseEvent): void;
  onLightClick(light: LightSource, e: KMouseEvent): void;
  onLightDragEnd(light: LightSource, x: number, y: number): void;
  onFogClick(region: FogRegion, e: KMouseEvent): void;

  onSpawnMouseDown(e: KMouseEvent): void;
  onSpawnClick(e: KMouseEvent): void;
  onSpawnDragEnd(x: number, y: number): void;
  /** Spawn flag drag snapping (world point → world point). */
  snapSpawn(p: Point, altKey: boolean): Point;

  /** Vertex editing of the selected wall / fog region. */
  snapVertex(p: Point, altKey: boolean): Point;
  onVertexPreview(target: 'wall' | 'fog', points: number[] | null): void;
  onVertexCommit(target: 'wall' | 'fog', id: string, points: number[]): void;
  onHandleMouseDown(e: KMouseEvent): void;

  commitInlineEdit(id: string, value: string, isNew: boolean): void;
  fitToView(): void;

  /** Keyboard paths for the multi-click drawing in progress. */
  finishPolyDraft(): void;
  removeLastPolyPoint(): void;
  cancelDraft(): void;
}

function store() {
  return useEditorStore.getState();
}

function view() {
  return useCanvasUi.getState().view;
}

function sameItem(a: SelectionItem, b: SelectionItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function findElementRoot(node: Konva.Node | null): Konva.Node | null {
  let n: Konva.Node | null = node;
  while (n) {
    if (n.hasName('element') && n.id()) return n;
    n = n.getParent();
  }
  return null;
}

/** Element root node (id = element id, name = "element") rendered by SceneElementsLayer. */
export function findElementNode(stage: Konva.Stage | null | undefined, id: string): Konva.Node | undefined {
  if (!stage) return undefined;
  return stage.findOne((n: Konva.Node) => n.id() === id && n.hasName('element')) ?? undefined;
}

/** Applies several element patches as one undo step. */
function commitElementPatches(patches: Map<string, ElementPatch>, coalesceKey: string): void {
  if (patches.size === 0) return;
  const s = store();
  if (patches.size === 1) {
    const [entry] = [...patches];
    if (entry) s.updateElement(entry[0], entry[1], { coalesceKey });
    return;
  }
  s.updateLevel(
    (level) => {
      level.elements = level.elements.map((el) => {
        const patch = patches.get(el.id);
        return patch ? ({ ...el, ...patch } as SceneElement) : el;
      });
    },
    { coalesceKey },
  );
}

/** First non-empty line of a text, collapsed and shortened, to name an element after its content. */
function nameFromContent(value: string): string {
  const line = value.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  return line.length > DERIVED_NAME_MAX ? `${line.slice(0, DERIVED_NAME_MAX - 1).trimEnd()}…` : line;
}

/**
 * New name when the element still uses its default name or a name derived from the previous content;
 * a name the DM typed by hand is kept (empty object).
 */
function syncedName(current: string, defaultName: string, previous: string, next: string): { name?: string } {
  const name = current.trim();
  if (name && name !== defaultName && name !== nameFromContent(previous)) return {};
  const derived = nameFromContent(next) || defaultName;
  return derived === current ? {} : { name: derived };
}

function roundPatch(patch: ElementPatch): ElementPatch {
  const out: ElementPatch = { ...patch };
  if (typeof out.x === 'number') out.x = round1(out.x);
  if (typeof out.y === 'number') out.y = round1(out.y);
  if (typeof out.rotation === 'number') out.rotation = Math.round(out.rotation * 100) / 100;
  return out;
}

/**
 * All pointer/keyboard logic of the editor canvas. Handlers are stable (they read the editor store and
 * refs), so heavy layers never re-render because of them; transient previews go to the canvas UI store.
 */
export function useCanvasController(mapRef: RefObject<MapStageHandle>): CanvasController {
  const menu = useContextMenu();
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const spaceRef = useRef(false);
  const altRef = useRef(false);
  const handledRef = useRef(new WeakSet<Event>());
  const gestureRef = useRef<WindowGesture | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const endedDragIdsRef = useRef<Set<string> | null>(null);
  const pendingSingleRef = useRef<string | null>(null);
  const pendingTransformsRef = useRef<Map<string, ElementPatch> | null>(null);
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastPlacementRef = useRef<{ t: number; x: number; y: number } | null>(null);
  /** Client positions of the last two stage clicks (to tell real double clicks from quick separate clicks). */
  const clicksRef = useRef<{ x: number; y: number }[]>([]);
  /** The press that closed an inline editor must not also place/select something. */
  const skipClickRef = useRef(false);

  const drop = useCanvasDrop(mapRef);

  const controller = useMemo<CanvasController>(() => {
    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------
    const markHandled = (evt: Event) => handledRef.current.add(evt);
    const isHandled = (evt: Event) => handledRef.current.has(evt);

    const stageOf = (): Konva.Stage | null => mapRef.current?.getStage() ?? null;

    const clientToWorld = (clientX: number, clientY: number): Point => {
      const handle = mapRef.current;
      const stage = handle?.getStage();
      if (!handle || !stage) return { x: clientX, y: clientY };
      const rect = stage.container().getBoundingClientRect();
      return handle.screenToWorld({ x: clientX - rect.left, y: clientY - rect.top });
    };

    /** Snapped placement for the current level (Alt bypasses snapping). */
    const place = (p: Point, kind: SnapKind, altKey: boolean): Point => {
      const scene = getCurrentScene();
      if (!scene) return p;
      const grid = scene.level.grid;
      if (!grid.snap || altKey || !hasUsableGrid(grid)) return { x: p.x, y: p.y };
      return snapPoint(p, grid, kind);
    };

    const setSelection = (items: SelectionItem[]) => store().setSelection(items);

    const selectItem = (item: SelectionItem, additive: boolean) => {
      const sel = store().selection;
      if (!additive) {
        setSelection([item]);
        return;
      }
      setSelection(sel.some((s) => sameItem(s, item)) ? sel.filter((s) => !sameItem(s, item)) : [...sel, item]);
    };

    const isRightPan = (evt: MouseEvent): boolean => {
      const down = rightDownRef.current;
      return !!down && Math.hypot(evt.clientX - down.x, evt.clientY - down.y) > DRAG_THRESHOLD_PX;
    };

    const rememberClick = (evt: MouseEvent) => {
      clicksRef.current = [...clicksRef.current.slice(-1), { x: evt.clientX, y: evt.clientY }];
    };

    /** The last two clicks landed on the same spot (a genuine double click). */
    const isInPlaceDoubleClick = (): boolean => {
      const [a, b] = clicksRef.current;
      return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) <= DOUBLE_CLICK_SLOP_PX;
    };

    const isRepeatedPlacement = (p: Point): boolean => {
      const last = lastPlacementRef.current;
      const now = performance.now();
      const scale = view().scale;
      const repeated = !!last && now - last.t < 450 && Math.hypot(p.x - last.x, p.y - last.y) * scale < 8;
      lastPlacementRef.current = { t: now, x: p.x, y: p.y };
      return repeated;
    };

    // -------------------------------------------------------------------------
    // window gestures (mouse held: marquee, freehand, boxes)
    // -------------------------------------------------------------------------
    const endGesture = () => {
      const g = gestureRef.current;
      if (!g) return;
      gestureRef.current = null;
      window.removeEventListener('mousemove', g.move);
      window.removeEventListener('mouseup', g.up);
    };

    const beginGesture = (onMove: (ev: MouseEvent) => void, onUp: (ev: MouseEvent) => void, onCancel: () => void) => {
      gestureRef.current?.cancel();
      const gesture: WindowGesture = {
        move: (ev) => onMove(ev),
        up: (ev) => {
          if (ev.button !== 0) return;
          endGesture();
          onUp(ev);
        },
        cancel: () => {
          endGesture();
          onCancel();
        },
      };
      gestureRef.current = gesture;
      window.addEventListener('mousemove', gesture.move);
      window.addEventListener('mouseup', gesture.up);
    };

    const cancelGesture = () => gestureRef.current?.cancel();

    // -------------------------------------------------------------------------
    // selection
    // -------------------------------------------------------------------------
    const selectInRect = (r: Rect, additive: boolean) => {
      const scene = getCurrentScene();
      if (!scene) return;
      const { level } = scene;
      const items: SelectionItem[] = [];
      for (const el of level.elements) {
        if (isElementSelectable(el) && rectContainsRect(r, elementWorldRect(el, level.grid.size))) items.push({ kind: 'element', id: el.id });
      }
      if (isLayerEditable('walls')) {
        for (const w of level.walls) if (rectContainsPoints(r, w.points)) items.push({ kind: 'wall', id: w.id });
      }
      if (isLayerEditable('lighting')) {
        for (const l of level.lights) if (rectContainsPoint(r, l)) items.push({ kind: 'light', id: l.id });
      }
      if (isLayerEditable('fog')) {
        for (const f of level.fogRegions) if (rectContainsPoints(r, f.points)) items.push({ kind: 'fog', id: f.id });
      }
      if (!additive) {
        setSelection(items);
        return;
      }
      const merged = [...store().selection];
      for (const item of items) if (!merged.some((s) => sameItem(s, item))) merged.push(item);
      setSelection(merged);
    };

    const selectAll = () => {
      const scene = getCurrentScene();
      if (!scene) return;
      if (store().tool !== 'select') store().setTool('select');
      const huge = { x: -1e9, y: -1e9, width: 2e9, height: 2e9 };
      selectInRect(huge, false);
    };

    // -------------------------------------------------------------------------
    // removal / mutation helpers
    // -------------------------------------------------------------------------
    const dropFromSelection = (id: string) => {
      const sel = store().selection;
      if (sel.some((s) => s.id === id)) setSelection(sel.filter((s) => s.id !== id));
    };

    const removeElement = (el: SceneElement) => {
      if (el.locked) {
        toast.warning('Este elemento está bloqueado', { description: 'Desbloquéalo (clic derecho) para poder borrarlo.' });
        return;
      }
      store().updateLevel((level) => {
        level.elements = level.elements.filter((e) => e.id !== el.id);
      });
      dropFromSelection(el.id);
    };

    const removeWall = (id: string) => {
      store().updateLevel((level) => {
        level.walls = level.walls.filter((w) => w.id !== id);
      });
      dropFromSelection(id);
    };

    const removeLight = (id: string) => {
      store().updateLevel((level) => {
        level.lights = level.lights.filter((l) => l.id !== id);
      });
      dropFromSelection(id);
    };

    const removeFog = (id: string) => {
      store().updateLevel((level) => {
        level.fogRegions = level.fogRegions.filter((f) => f.id !== id);
      });
      dropFromSelection(id);
    };

    const patchElements = (ids: Set<string>, patchFor: (el: SceneElement) => Partial<SceneElement>) => {
      store().updateLevel((level) => {
        level.elements = level.elements.map((el) => (ids.has(el.id) ? ({ ...el, ...patchFor(el) } as SceneElement) : el));
      });
    };

    const reorderElements = (ids: Set<string>, toFront: boolean) => {
      store().updateLevel((level) => {
        const moving = level.elements.filter((e) => ids.has(e.id));
        const rest = level.elements.filter((e) => !ids.has(e.id));
        level.elements = toFront ? [...rest, ...moving] : [...moving, ...rest];
      });
    };

    // -------------------------------------------------------------------------
    // inline editing
    // -------------------------------------------------------------------------
    const startInlineEdit = (el: SceneElement, isNew: boolean) => {
      if (!isInlineEditable(el)) return;
      const handle = mapRef.current;
      const scene = getCurrentScene();
      if (handle && scene) {
        // The editor overlay follows the element: bring it into view if it is off-screen (zoom unchanged).
        const v = handle.getView();
        const r = elementWorldRect(el, scene.level.grid.size);
        const a = handle.worldToScreen({ x: r.x, y: r.y });
        const b = handle.worldToScreen({ x: r.x + r.width, y: r.y + r.height });
        if (v.width > 0 && v.height > 0 && (b.x < 0 || b.y < 0 || a.x > v.width || a.y > v.height)) {
          handle.centerOn(r.x + r.width / 2, r.y + r.height / 2);
        }
      }
      useCanvasUi.setState({ editing: { id: el.id, isNew } });
    };

    /** Commits an inline edit; the element is looked up in every zone (the user may have switched level meanwhile). */
    const commitInlineEdit = (id: string, value: string, isNew: boolean) => {
      const current = useCanvasUi.getState().editing;
      if (current?.id === id) useCanvasUi.setState({ editing: null });
      const s = store();
      let found: { zoneId: string; levelId: string; el: SceneElement } | null = null;
      for (const zone of s.zones) {
        for (const level of zone.levels) {
          const el = level.elements.find((e) => e.id === id);
          if (el) {
            found = { zoneId: zone.id, levelId: level.id, el };
            break;
          }
        }
        if (found) break;
      }
      if (!found) return;
      const { zoneId, levelId, el } = found;
      const apply = (recipe: (elements: SceneElement[]) => SceneElement[]) =>
        s.updateZone(
          zoneId,
          (zone) => {
            const level = zone.levels.find((l) => l.id === levelId);
            if (level) level.elements = recipe(level.elements);
          },
          { coalesceKey: `edit-${id}` },
        );
      const patch = (p: Partial<SceneElement>) => apply((elements) => elements.map((e) => (e.id === id ? ({ ...e, ...p } as SceneElement) : e)));
      if (el.type === 'text') {
        if (!value.trim()) {
          apply((elements) => elements.filter((e) => e.id !== id));
          dropFromSelection(id);
          if (!isNew) toast.info('Texto vacío eliminado');
          return;
        }
        if (value !== el.text) patch({ text: value, ...syncedName(el.name, 'Texto', el.text, value) });
      } else if (el.type === 'note') {
        if (value !== el.text) patch({ text: value });
      } else if (el.type === 'marker') {
        const label = value.replace(/\s+/g, ' ').trim();
        if (label !== el.label) patch({ label, ...syncedName(el.name, 'Marcador', el.label, label) });
      }
    };

    // -------------------------------------------------------------------------
    // multi-click tools (line / wall / fog)
    // -------------------------------------------------------------------------
    /** Next poly point: snapped to grid points; Shift locks the segment to 45° steps. */
    const polyPoint = (world: Point, evt: { altKey: boolean; shiftKey: boolean }): Point => {
      let p = place(world, 'point', evt.altKey);
      const d = useCanvasUi.getState().draft;
      const last = d?.kind === 'poly' ? lastPoint(d.points) : null;
      if (last && evt.shiftKey) {
        const dx = world.x - last.x;
        const dy = world.y - last.y;
        const len = Math.hypot(dx, dy);
        const step = Math.PI / 4;
        const angle = Math.round(Math.atan2(dy, dx) / step) * step;
        p = { x: last.x + Math.cos(angle) * len, y: last.y + Math.sin(angle) * len };
        const scene = getCurrentScene();
        if (scene && scene.level.grid.snap && !evt.altKey && hasUsableGrid(scene.level.grid)) {
          // keep the constrained direction, snap the length to whole cells
          const cells = Math.max(1, Math.round(len / scene.level.grid.size));
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          const k = Math.abs(ux) > 0.01 && Math.abs(uy) > 0.01 ? Math.SQRT2 : 1;
          const l = cells * scene.level.grid.size * k;
          p = { x: last.x + ux * l, y: last.y + uy * l };
        }
      }
      return p;
    };

    const finishPoly = (close: boolean, silent = false): boolean => {
      const d = useCanvasUi.getState().draft;
      if (!d || d.kind !== 'poly') return false;
      const scene = getCurrentScene();
      if (!scene) return false;
      const n = d.points.length / 2;
      const s = store();
      if (d.tool === 'fog') {
        if (n < 3) {
          if (!silent) toast.info('La niebla necesita al menos tres vértices');
          return false;
        }
        const region = createFogRegion(d.points, scene.level.fogRegions);
        s.addFogRegion(region);
        setSelection([{ kind: 'fog', id: region.id }]);
      } else if (d.tool === 'wall') {
        if (n < 2) {
          if (!silent) toast.info('Añade al menos dos puntos para crear la pared');
          return false;
        }
        const first = firstPoint(d.points);
        const points = close && n >= 3 && first ? [...d.points, first.x, first.y] : d.points;
        const wall = createWall(points, s.toolOptions.wallKind);
        s.addWall(wall);
        setSelection([{ kind: 'wall', id: wall.id }]);
      } else {
        if (n < 2) {
          if (!silent) toast.info('Añade al menos dos puntos para crear la línea');
          return false;
        }
        const el = createPathElement(d.points, { layer: s.toolOptions.activeLayer, tool: s.toolOptions, closed: close && n >= 3, freehand: false });
        s.addElement(el);
      }
      setCanvasDraft(null);
      return true;
    };

    const addPolyPoint = (tool: PolyTool, p: Point) => {
      const d = useCanvasUi.getState().draft;
      if (!d || d.kind !== 'poly' || d.tool !== tool) {
        const s = store();
        if (!ensureLayerWritable(layerForTool(tool, s.toolOptions.activeLayer))) return;
        setCanvasDraft({ kind: 'poly', tool, points: [round1(p.x), round1(p.y)] });
        return;
      }
      const scale = view().scale;
      const last = lastPoint(d.points);
      if (last && distance(p, last) * scale < DUPLICATE_POINT_PX) return;
      const first = firstPoint(d.points);
      const n = d.points.length / 2;
      if (first && n >= 3 && distance(p, first) * scale < CLOSE_POLYGON_PX) {
        finishPoly(true);
        return;
      }
      setCanvasDraft({ kind: 'poly', tool, points: [...d.points, round1(p.x), round1(p.y)] });
    };

    const removeLastPolyPoint = () => {
      const d = useCanvasUi.getState().draft;
      if (!d || d.kind !== 'poly') return;
      const points = d.points.slice(0, -2);
      setCanvasDraft(points.length >= 2 ? { ...d, points } : null);
    };

    // -------------------------------------------------------------------------
    // press-and-drag tools
    // -------------------------------------------------------------------------
    const beginMarquee = (evt: MouseEvent, origin: Point) => {
      const startX = evt.clientX;
      const startY = evt.clientY;
      const additive = evt.shiftKey;
      let moved = false;
      beginGesture(
        (ev) => {
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
          moved = true;
          const r = rectFromPoints(origin, clientToWorld(ev.clientX, ev.clientY));
          setCanvasDraft({ kind: 'marquee', ...r });
        },
        (ev) => {
          setCanvasDraft(null);
          if (moved) selectInRect(rectFromPoints(origin, clientToWorld(ev.clientX, ev.clientY)), additive);
          else if (!additive) setSelection([]);
        },
        () => setCanvasDraft(null),
      );
    };

    const beginFreehand = (origin: Point) => {
      const s = store();
      const layer = s.toolOptions.activeLayer;
      if (!ensureLayerWritable(layer)) return;
      const points = [origin.x, origin.y];
      setCanvasDraft({ kind: 'freehand', points: points.slice() });
      beginGesture(
        (ev) => {
          const p = clientToWorld(ev.clientX, ev.clientY);
          const last = lastPoint(points);
          if (last && distance(p, last) * view().scale < 2) return;
          points.push(p.x, p.y);
          setCanvasDraft({ kind: 'freehand', points: points.slice() });
        },
        () => {
          setCanvasDraft(null);
          const scale = view().scale;
          if (points.length < 4 || polylineLength(points) * scale < 3) return;
          const simplified = simplifyPoints(points, 0.9 / scale);
          if (simplified.length < 4) return;
          const opts = store().toolOptions;
          store().addElement(createPathElement(simplified, { layer: opts.activeLayer, tool: opts, closed: false, freehand: true }));
        },
        () => setCanvasDraft(null),
      );
    };

    const beginBox = (shape: 'rect' | 'ellipse', evt: MouseEvent, world: Point) => {
      const s = store();
      if (!ensureLayerWritable(s.toolOptions.activeLayer)) return;
      const start = place(world, 'point', evt.altKey);
      const startX = evt.clientX;
      const startY = evt.clientY;
      let moved = false;
      /** Opposite corner under the pointer (snapped; Shift keeps a 1:1 ratio). */
      const cornerAt = (ev: MouseEvent): Point => {
        const p = place(clientToWorld(ev.clientX, ev.clientY), 'point', ev.altKey);
        if (!ev.shiftKey) return p;
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
      };
      beginGesture(
        (ev) => {
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
          moved = true;
          setCanvasDraft({ kind: 'box', shape, ...rectFromPoints(start, cornerAt(ev)) });
        },
        (ev) => {
          setCanvasDraft(null);
          let r = rectFromPoints(start, moved ? cornerAt(ev) : start);
          if (!moved || r.width < 4 || r.height < 4) {
            const scene = getCurrentScene();
            const size = scene && hasUsableGrid(scene.level.grid) ? scene.level.grid.size * 2 : 140;
            r = { x: start.x, y: start.y, width: size, height: size };
          }
          const opts = store().toolOptions;
          store().addElement(createShapeElement(shape, r, { layer: opts.activeLayer, tool: opts }));
        },
        () => setCanvasDraft(null),
      );
    };

    // -------------------------------------------------------------------------
    // single-click tools
    // -------------------------------------------------------------------------
    const setSpawnAt = (p: Point) => {
      const scene = getCurrentScene();
      const s = store();
      if (!scene || !s.campaign) return;
      const pos = roundPoint(p);
      void s.updateCampaign({ spawn: { zoneId: scene.zone.id, levelId: scene.level.id, x: pos.x, y: pos.y } });
      toast.success('Punto de aparición fijado', { description: `${scene.zone.name} · ${scene.level.name}` });
    };

    const placeWithTool = (tool: EditorTool, world: Point, evt: MouseEvent) => {
      const s = store();
      const opts = s.toolOptions;
      switch (tool) {
        case 'text': {
          const p = place(world, 'point', evt.altKey);
          if (isRepeatedPlacement(p) || !ensureLayerWritable(opts.activeLayer)) return;
          const el = createTextElement(p, { layer: opts.activeLayer, tool: opts });
          s.addElement(el);
          startInlineEdit(el, true);
          return;
        }
        case 'marker': {
          const p = place(world, 'cell', evt.altKey);
          if (isRepeatedPlacement(p) || !ensureLayerWritable(opts.activeLayer)) return;
          const el = createMarkerElement(p, { layer: opts.activeLayer, tool: opts });
          s.addElement(el);
          startInlineEdit(el, true);
          return;
        }
        case 'note': {
          const p = place(world, 'point', evt.altKey);
          if (isRepeatedPlacement(p) || !ensureLayerWritable('notes')) return;
          const el = createNoteElement(p);
          s.addElement(el);
          startInlineEdit(el, true);
          return;
        }
        case 'transition': {
          const p = place(world, 'cell', evt.altKey);
          if (isRepeatedPlacement(p) || !ensureLayerWritable('objects')) return;
          s.addElement(createTransitionElement(p, opts.transitionType));
          return;
        }
        case 'light': {
          const p = place(world, 'cell', evt.altKey);
          if (isRepeatedPlacement(p) || !ensureLayerWritable('lighting')) return;
          s.addLight(createLight(p, opts));
          return;
        }
        case 'spawn': {
          const p = place(world, 'cell', evt.altKey);
          if (isRepeatedPlacement(p)) return;
          setSpawnAt(p);
          return;
        }
        default:
          return;
      }
    };

    // -------------------------------------------------------------------------
    // element dragging (select tool)
    // -------------------------------------------------------------------------
    const prepareDrag = (el: SceneElement, node: Konva.Node, selection: SelectionItem[]) => {
      const scene = getCurrentScene();
      if (!scene) return;
      const ids = new Set(selection.filter((s) => s.kind === 'element').map((s) => s.id));
      ids.add(el.id);
      const start = new Map<string, Point>();
      for (const item of scene.level.elements) {
        if (ids.has(item.id) && isElementSelectable(item)) start.set(item.id, { x: item.x, y: item.y });
      }
      sessionRef.current = { primaryId: el.id, start, nodes: null };
      node.dragBoundFunc(function (this: Konva.Node, pos: Konva.Vector2d, evt?: unknown) {
        const current = getCurrentScene();
        const altKey = evt instanceof MouseEvent ? evt.altKey : altRef.current;
        const parent = this.getParent();
        if (!current || !parent || altKey) return pos;
        const grid = current.level.grid;
        if (!grid.snap || !hasUsableGrid(grid)) return pos;
        const t = parent.getAbsoluteTransform();
        const local = t.copy().invert().point(pos);
        return t.point(snapElementPosition(el, local, grid));
      });
    };

    /** Stops a pending drag (e.g. Shift+click that removes the element from the selection). */
    const suppressDrag = (node: Konva.Node) => {
      if (!node.draggable()) return;
      node.draggable(false);
      const restore = () => {
        window.removeEventListener('mouseup', restore, true);
        if (node.getStage()) node.draggable(true);
      };
      window.addEventListener('mouseup', restore, true);
    };

    // -------------------------------------------------------------------------
    // context menus
    // -------------------------------------------------------------------------
    const openElementMenu = (el: SceneElement, evt: MouseEvent) => {
      const scene = getCurrentScene();
      if (!scene) return;
      const sel = store().selection;
      const inSelection = sel.some((s) => s.kind === 'element' && s.id === el.id);
      let targets: SceneElement[];
      if (inSelection) {
        const ids = new Set(sel.filter((s) => s.kind === 'element').map((s) => s.id));
        targets = scene.level.elements.filter((e) => ids.has(e.id));
      } else {
        targets = [el];
        setSelection([{ kind: 'element', id: el.id }]);
      }
      const ids = new Set(targets.map((t) => t.id));
      const asSelection = (): SelectionItem[] => targets.map((t) => ({ kind: 'element', id: t.id }));
      menuRef.current.open(
        evt,
        buildElementMenu(targets, {
          edit:
            targets.length === 1 && isInlineEditable(el) && !el.locked
              ? () => {
                  if (store().tool !== 'select') store().setTool('select');
                  startInlineEdit(el, false);
                }
              : undefined,
          setHidden: (hidden) => {
            const byId = new Map(targets.map((t) => [t.id, t]));
            patchElements(ids, (e) => hiddenPatch(byId.get(e.id) ?? e, hidden));
          },
          setLocked: (locked) => patchElements(ids, () => ({ locked })),
          bringToFront: () => reorderElements(ids, true),
          sendToBack: () => reorderElements(ids, false),
          duplicate: () => {
            setSelection(asSelection());
            store().duplicateSelection();
          },
          remove: () => {
            setSelection(asSelection());
            store().deleteSelection();
          },
        }),
      );
    };

    const openCanvasMenu = (evt: MouseEvent, world: Point) => {
      const s = store();
      const scene = getCurrentScene();
      menuRef.current.open(
        evt,
        buildCanvasMenu({
          fit: () => mapRef.current?.fitToView(),
          selectAll: scene ? selectAll : null,
          clearSelection: s.selection.length > 0 ? () => setSelection([]) : null,
          setSpawnHere: scene && s.campaign ? () => setSpawnAt(place(world, 'cell', false)) : null,
        }),
      );
    };

    // -------------------------------------------------------------------------
    // the controller
    // -------------------------------------------------------------------------
    return {
      onStageMouseDown(e, world) {
        altRef.current = e.evt.altKey;
        skipClickRef.current = false;
        if (e.evt.button !== 0 || isHandled(e.evt) || spaceRef.current) return;
        if (useCanvasUi.getState().editing) {
          skipClickRef.current = true;
          return;
        }
        const tool = store().tool;
        if (tool === 'select') {
          const stage = e.target.getStage();
          let empty = e.target === stage;
          if (!empty) {
            const root = findElementRoot(e.target);
            if (root) {
              const el = getCurrentScene()?.level.elements.find((x) => x.id === root.id());
              empty = !el || !isElementSelectable(el);
            }
          }
          if (empty) beginMarquee(e.evt, world);
          return;
        }
        if (tool === 'draw') {
          beginFreehand(world);
          return;
        }
        if (tool === 'rect' || tool === 'ellipse') beginBox(tool, e.evt, world);
      },

      onStageMouseMove(e, world) {
        altRef.current = e.evt.altKey;
        const tool = store().tool;
        let hover: Point | null = null;
        switch (tool) {
          case 'line':
          case 'wall':
          case 'fog':
            hover = polyPoint(world, e.evt);
            break;
          case 'marker':
          case 'transition':
          case 'light':
          case 'spawn':
            hover = place(world, 'cell', e.evt.altKey);
            break;
          case 'text':
          case 'note':
          case 'rect':
          case 'ellipse':
            hover = place(world, 'point', e.evt.altKey);
            break;
          default:
            hover = null;
        }
        setCanvasPointer(world, hover);
        const cursor = TOOL_CURSORS[tool];
        const stage = e.target.getStage();
        if (cursor && stage && stage.container().style.cursor !== cursor) setStageCursor(stage, cursor);
      },

      onStageClick(e, world) {
        rememberClick(e.evt);
        if (skipClickRef.current) {
          skipClickRef.current = false;
          return;
        }
        if (isHandled(e.evt)) return;
        const tool = store().tool;
        if (tool === 'line' || tool === 'wall' || tool === 'fog') {
          addPolyPoint(tool, polyPoint(world, e.evt));
          return;
        }
        placeWithTool(tool, world, e.evt);
      },

      onStageDblClick(e) {
        if (isHandled(e.evt) || !isInPlaceDoubleClick()) return;
        const d = useCanvasUi.getState().draft;
        if (d?.kind === 'poly') finishPoly(false);
      },

      onStageContextMenu(e, world) {
        if (isRightPan(e.evt)) return;
        const d = useCanvasUi.getState().draft;
        if (d?.kind === 'poly') {
          if (!finishPoly(false, true)) setCanvasDraft(null);
          return;
        }
        if (d) {
          cancelGesture();
          setCanvasDraft(null);
          return;
        }
        openCanvasMenu(e.evt, world);
      },

      onDrop: drop.onDrop,
      onDragOver: drop.onDragOver,
      onWrapperDragLeave: drop.onWrapperDragLeave,

      onViewChange(v) {
        useCanvasUi.setState({ view: { x: v.x, y: v.y, scale: v.scale } });
      },

      onWrapperMouseLeave() {
        setCanvasPointer(null, null);
      },

      // --- elements ------------------------------------------------------------
      onElementMouseDown(el, e) {
        if (e.evt.button !== 0 || spaceRef.current) return;
        const tool = store().tool;
        if (tool === 'erase') {
          markHandled(e.evt);
          return;
        }
        if (tool !== 'select' || !isElementSelectable(el)) return;
        markHandled(e.evt);
        pendingSingleRef.current = null;
        const sel = store().selection;
        const item: SelectionItem = { kind: 'element', id: el.id };
        const inSelection = sel.some((s) => sameItem(s, item));
        let next = sel;
        if (e.evt.shiftKey) {
          if (inSelection) {
            setSelection(sel.filter((s) => !sameItem(s, item)));
            suppressDrag(e.currentTarget);
            return;
          }
          next = [...sel, item];
        } else if (inSelection) {
          pendingSingleRef.current = el.id;
        } else {
          next = [item];
        }
        if (next !== sel) setSelection(next);
        prepareDrag(el, e.currentTarget, next);
      },

      onElementClick(el, e) {
        markHandled(e.evt);
        const tool = store().tool;
        if (tool === 'erase') {
          removeElement(el);
          return;
        }
        if (tool !== 'select') return;
        if (pendingSingleRef.current === el.id && !e.evt.shiftKey) setSelection([{ kind: 'element', id: el.id }]);
        pendingSingleRef.current = null;
      },

      onElementDblClick(el, e) {
        markHandled(e.evt);
        if (store().tool !== 'select' || !isElementSelectable(el) || !isInlineEditable(el)) return;
        setSelection([{ kind: 'element', id: el.id }]);
        startInlineEdit(el, false);
      },

      onElementContextMenu(el, e) {
        e.cancelBubble = true;
        e.evt.preventDefault();
        if (isRightPan(e.evt)) return;
        openElementMenu(el, e.evt);
      },

      onElementDragMove(el, x, y) {
        const session = sessionRef.current;
        if (!session || el.id !== session.primaryId) return;
        pendingSingleRef.current = null;
        const pointer = stageOf()?.getPointerPosition();
        if (pointer && mapRef.current) setCanvasPointer(mapRef.current.screenToWorld(pointer), null);
        const start = session.start.get(el.id);
        if (!start) return;
        const dx = x - start.x;
        const dy = y - start.y;
        if (!session.nodes) {
          const stage = stageOf();
          session.nodes = new Map();
          for (const id of session.start.keys()) {
            if (id === session.primaryId) continue;
            const node = findElementNode(stage, id);
            if (!node) continue;
            node.dragBoundFunc((p: Konva.Vector2d) => p);
            if (!node.isDragging()) node.startDrag();
            session.nodes.set(id, node);
          }
        }
        for (const [id, node] of session.nodes) {
          const p = session.start.get(id);
          if (p) node.position({ x: p.x + dx, y: p.y + dy });
        }
      },

      onElementDragEnd(el, x, y) {
        const session = sessionRef.current;
        if (session && el.id === session.primaryId) {
          sessionRef.current = null;
          const ended = new Set(session.start.keys());
          endedDragIdsRef.current = ended;
          queueMicrotask(() => {
            if (endedDragIdsRef.current === ended) endedDragIdsRef.current = null;
          });
          const start = session.start.get(el.id) ?? { x: el.x, y: el.y };
          const dx = x - start.x;
          const dy = y - start.y;
          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
          const patches = new Map<string, ElementPatch>();
          for (const [id, p] of session.start) patches.set(id, { x: round1(p.x + dx), y: round1(p.y + dy) });
          const ids = [...session.start.keys()];
          commitElementPatches(patches, ids.length === 1 ? `drag-${ids[0]}` : `drag-${ids.join(',')}`);
          return;
        }
        // Secondary nodes of a group drag: the primary element commits the whole group.
        if (endedDragIdsRef.current?.has(el.id) || session?.start.has(el.id)) return;
        if (Math.abs(x - el.x) < 0.01 && Math.abs(y - el.y) < 0.01) return;
        store().updateElement(el.id, { x: round1(x), y: round1(y) }, { coalesceKey: `drag-${el.id}` });
      },

      onElementTransformEnd(el, patch) {
        let pending = pendingTransformsRef.current;
        if (!pending) {
          pending = new Map();
          pendingTransformsRef.current = pending;
          const batch = pending;
          queueMicrotask(() => {
            if (pendingTransformsRef.current === batch) pendingTransformsRef.current = null;
            commitElementPatches(batch, `transform-${[...batch.keys()].join(',')}`);
          });
        }
        pending.set(el.id, roundPatch(patch));
      },

      // --- walls / lights / fog -------------------------------------------------
      onWallClick(wall, e) {
        markHandled(e.evt);
        const tool = store().tool;
        if (tool === 'erase') removeWall(wall.id);
        else if (tool === 'select') selectItem({ kind: 'wall', id: wall.id }, e.evt.shiftKey);
      },

      onLightClick(light, e) {
        markHandled(e.evt);
        const tool = store().tool;
        if (tool === 'erase') removeLight(light.id);
        else if (tool === 'select') selectItem({ kind: 'light', id: light.id }, e.evt.shiftKey);
      },

      onLightDragEnd(light, x, y) {
        const p = place({ x, y }, 'cell', altRef.current);
        if (Math.abs(p.x - light.x) < 0.01 && Math.abs(p.y - light.y) < 0.01) return;
        store().updateLevel(
          (level) => {
            const l = level.lights.find((item) => item.id === light.id);
            if (l) {
              l.x = round1(p.x);
              l.y = round1(p.y);
            }
          },
          { coalesceKey: `light-${light.id}` },
        );
        if (!store().selection.some((s) => s.kind === 'light' && s.id === light.id)) setSelection([{ kind: 'light', id: light.id }]);
      },

      onFogClick(region, e) {
        markHandled(e.evt);
        const tool = store().tool;
        if (tool === 'erase') removeFog(region.id);
        else if (tool === 'select') selectItem({ kind: 'fog', id: region.id }, e.evt.shiftKey);
      },

      // --- spawn flag ----------------------------------------------------------------
      onSpawnMouseDown(e) {
        markHandled(e.evt);
      },

      onSpawnClick(e) {
        markHandled(e.evt);
        const s = store();
        if (s.tool !== 'erase' || !s.campaign?.spawn) return;
        const previous = s.campaign.spawn;
        void s.updateCampaign({ spawn: null });
        toast.info('Punto de aparición eliminado', {
          action: { label: 'Deshacer', onClick: () => void store().updateCampaign({ spawn: previous }) },
        });
      },

      onSpawnDragEnd(x, y) {
        const s = store();
        const spawn = s.campaign?.spawn;
        if (!spawn) return;
        const p = roundPoint(place({ x, y }, 'cell', altRef.current));
        if (p.x === spawn.x && p.y === spawn.y) return;
        void s.updateCampaign({ spawn: { ...spawn, x: p.x, y: p.y } });
      },

      snapSpawn(p, altKey) {
        return place(p, 'cell', altKey);
      },

      // --- vertex editing -----------------------------------------------------------
      snapVertex(p, altKey) {
        return place(p, 'point', altKey);
      },

      onVertexPreview(target, points) {
        setCanvasDraft(points ? { kind: 'vertex', target, points } : null);
      },

      onVertexCommit(target, id, points) {
        setCanvasDraft(null);
        const rounded = roundPoints(points);
        store().updateLevel(
          (level) => {
            if (target === 'wall') {
              const w = level.walls.find((item) => item.id === id);
              if (w) w.points = rounded;
            } else {
              const f = level.fogRegions.find((item) => item.id === id);
              if (f) f.points = rounded;
            }
          },
          { coalesceKey: `vertex-${id}` },
        );
      },

      onHandleMouseDown(e) {
        markHandled(e.evt);
      },

      commitInlineEdit,

      fitToView() {
        mapRef.current?.fitToView();
      },

      finishPolyDraft() {
        finishPoly(false);
      },

      removeLastPolyPoint,

      cancelDraft() {
        cancelGesture();
        setCanvasDraft(null);
      },
    };
  }, [mapRef]);

  // Keyboard: Enter / Escape / Backspace for drawings in progress; Space and Alt tracking.
  useEffect(() => {
    const stop = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      altRef.current = ev.altKey;
      const editable = isEditableTarget(ev.target);
      if (ev.code === 'Space' && !editable) spaceRef.current = true;
      if (editable || useCanvasUi.getState().editing) return;
      const d = useCanvasUi.getState().draft;
      if (d?.kind === 'poly') {
        if (ev.key === 'Enter') {
          stop(ev);
          controller.finishPolyDraft();
        } else if (ev.key === 'Escape') {
          stop(ev);
          controller.cancelDraft();
        } else if (ev.key === 'Backspace' || ev.key === 'Delete') {
          stop(ev);
          controller.removeLastPolyPoint();
        }
        return;
      }
      if (ev.key === 'Escape') {
        if (d) {
          stop(ev);
          controller.cancelDraft();
          return;
        }
        const s = useEditorStore.getState();
        if (s.tool === 'select' && s.selection.length > 0 && !document.querySelector('[data-context-menu]')) s.setSelection([]);
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      altRef.current = ev.altKey;
      if (ev.code === 'Space') spaceRef.current = false;
    };
    const onBlur = () => {
      spaceRef.current = false;
      altRef.current = false;
      gestureRef.current?.cancel();
    };
    const onMouseDown = (ev: MouseEvent) => {
      if (ev.button === 2) rightDownRef.current = { x: ev.clientX, y: ev.clientY };
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [controller]);

  // Tool change: drop drawings in progress and give the cursor back.
  const tool = useEditorStore((s) => s.tool);
  useEffect(() => {
    gestureRef.current?.cancel();
    sessionRef.current = null;
    useCanvasUi.setState({ draft: null, hover: null });
    const stage = mapRef.current?.getStage();
    if (stage) setStageCursor(stage, TOOL_CURSORS[tool] ?? '');
  }, [tool, mapRef]);

  // Zone / level change: nothing in progress survives.
  const zoneId = useEditorStore((s) => s.currentZoneId);
  const levelId = useEditorStore((s) => s.currentLevelId);
  useEffect(() => {
    gestureRef.current?.cancel();
    sessionRef.current = null;
    useCanvasUi.setState({ draft: null, hover: null, editing: null, dropGhost: null, dragHint: null });
  }, [zoneId, levelId]);

  useEffect(() => {
    resetCanvasUi();
    return () => {
      gestureRef.current?.cancel();
      resetCanvasUi();
    };
  }, []);

  return controller;
}
