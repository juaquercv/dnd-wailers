import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import Konva from 'konva';
import { Stage } from 'react-konva';
import { MapCamera, MAX_SCALE, MIN_SCALE } from './camera';
import { AmbientLightingContext, createAmbientLightingStore, type AmbientLightingStore } from './ambientLighting';
import { MapViewContext, type MapViewState } from './mapView';
import { clamp, PAN_CURSOR_ATTR } from './mapUtils';

// Middle mouse is reserved for panning the map: nodes only drag with the left button.
Konva.dragButtons = [0];

export { MIN_SCALE as MAP_MIN_SCALE, MAX_SCALE as MAP_MAX_SCALE };

export interface MapPoint {
  x: number;
  y: number;
}

export type MapMouseEvent = Konva.KonvaEventObject<MouseEvent>;

export interface MapStageHandle {
  /** Fit the whole world (level) in the viewport (animated). */
  fitToView(): void;
  /** Center the viewport on a world point, optionally changing the zoom (animated). */
  centerOn(x: number, y: number, scale?: number): void;
  /** Container-relative px -> world px. */
  screenToWorld(p: MapPoint): MapPoint;
  /** World px -> container-relative px. */
  worldToScreen(p: MapPoint): MapPoint;
  getScale(): number;
  getStage(): Konva.Stage | null;
  /** Zoom around the viewport center (e.g. toolbar +/- buttons). */
  zoomBy(factor: number): void;
  getView(): MapViewState;
}

export interface MapStageProps {
  worldWidth: number;
  worldHeight: number;
  /** Konva Layers, drawn in WORLD coordinates (level px). */
  children: ReactNode;
  /** Left-drag pans the map (hand tool). */
  panMode?: boolean;
  /** Right-drag pans the map; a right click without movement still opens onStageContextMenu. */
  panWithRightButton?: boolean;
  onStageMouseDown?(e: MapMouseEvent, world: MapPoint): void;
  onStageMouseMove?(e: MapMouseEvent, world: MapPoint): void;
  onStageMouseUp?(e: MapMouseEvent, world: MapPoint): void;
  /** Left clicks only (not fired after a pan gesture). */
  onStageClick?(e: MapMouseEvent, world: MapPoint): void;
  onStageDblClick?(e: MapMouseEvent, world: MapPoint): void;
  onStageContextMenu?(e: MapMouseEvent, world: MapPoint): void;
  /** HTML5 drop on the canvas (library entries, items...). */
  onDrop?(e: DragEvent, world: MapPoint): void;
  onDragOver?(e: DragEvent): void;
  className?: string;
  /** CSS background of the area around the world. */
  background?: string;
  /** Throttled to one call per animation frame. */
  onViewChange?(v: { x: number; y: number; scale: number }): void;
  /** Fit the world on mount and whenever the world size or fitKey changes. */
  initialFit?: boolean;
  /** Changing it re-fits the view when initialFit is set (e.g. pass `${zoneId}:${levelId}`). */
  fitKey?: string | number;
  style?: CSSProperties;
}

interface PanGesture {
  button: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Right-button pans start only after moving a few px (so plain right clicks still open menus). */
  active: boolean;
}

type TouchGesture =
  | { kind: 'pinch'; dist: number; cx: number; cy: number }
  | { kind: 'pan'; x: number; y: number };

const RIGHT_PAN_THRESHOLD_PX = 5;
const CONTEXT_MENU_SUPPRESS_MS = 300;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The map intentionally uses one canvas per primitive (see CombinedLayer to merge them): silence Konva's
 * "more than 5 layers" advice for this stage instance only.
 */
function muteLayerCountWarning(stage: Konva.Stage): void {
  const add = stage.add.bind(stage);
  stage.add = ((...layers: Parameters<Konva.Stage['add']>) => {
    const previous = Konva.showWarnings;
    Konva.showWarnings = false;
    try {
      return add(...layers);
    } finally {
      Konva.showWarnings = previous;
    }
  }) as Konva.Stage['add'];
}

function wheelDelta(evt: WheelEvent): number {
  let dy = evt.deltaY;
  if (evt.deltaMode === 1) dy *= 16;
  else if (evt.deltaMode === 2) dy *= 400;
  return clamp(dy, -300, 300);
}

export const MapStage = forwardRef<MapStageHandle, MapStageProps>(function MapStage(props, ref) {
  const { worldWidth, worldHeight, children, className, background = '#0b0a08', initialFit = false, fitKey, panMode = false, style } =
    props;

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const cameraRef = useRef<MapCamera | null>(null);
  if (!cameraRef.current) cameraRef.current = new MapCamera();
  const camera = cameraRef.current;
  const ambientRef = useRef<AmbientLightingStore | null>(null);
  if (!ambientRef.current) ambientRef.current = createAmbientLightingStore();
  const ambient = ambientRef.current;

  const propsRef = useRef(props);
  propsRef.current = props;

  const [size, setSize] = useState({ width: 0, height: 0 });
  // Once created, the stage stays mounted even if the container collapses (hidden tabs), keeping node state.
  const [stageMounted, setStageMounted] = useState(false);
  // Children mount one commit after the stage, once the camera transform is in place.
  const [childrenReady, setChildrenReady] = useState(false);
  const initializedRef = useRef(false);
  const fitSigRef = useRef<string | null>(null);

  const panRef = useRef<PanGesture | null>(null);
  const spaceRef = useRef(false);
  const hoverRef = useRef(false);
  const suppressClickRef = useRef(false);
  const lastRightPanEndRef = useRef(0);
  const touchRef = useRef<TouchGesture | null>(null);

  // --- gesture controller (stable functions, read state through refs) -------
  const controller = useMemo(() => {
    const refreshCursor = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const pan = panRef.current;
      const cursor = pan?.active ? 'grabbing' : spaceRef.current || propsRef.current.panMode ? 'grab' : '';
      const prev: unknown = stage.getAttr(PAN_CURSOR_ATTR);
      if ((prev || '') === cursor) return;
      stage.setAttr(PAN_CURSOR_ATTR, cursor || null);
      stage.container().style.cursor = cursor || 'default';
    };

    const onWindowMove = (e: MouseEvent) => {
      const pan = panRef.current;
      if (!pan) return;
      if (!pan.active) {
        if (Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY) < RIGHT_PAN_THRESHOLD_PX) return;
        pan.active = true;
        refreshCursor();
      }
      const dx = e.clientX - pan.lastX;
      const dy = e.clientY - pan.lastY;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      if (dx !== 0 || dy !== 0) camera.panBy(dx, dy);
    };

    const endPan = () => {
      const pan = panRef.current;
      if (!pan) return;
      if (pan.button === 2 && pan.active) lastRightPanEndRef.current = performance.now();
      panRef.current = null;
      // Pan gestures disable node dragging for their mousedown; restore the default for any Konva stage.
      Konva.dragButtons = [0];
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
      refreshCursor();
    };

    function onWindowUp(e: MouseEvent) {
      const pan = panRef.current;
      if (!pan || e.button !== pan.button) return;
      endPan();
    }

    const startPan = (evt: MouseEvent, needsThreshold: boolean) => {
      endPan();
      camera.cancelTween();
      panRef.current = {
        button: evt.button,
        startX: evt.clientX,
        startY: evt.clientY,
        lastX: evt.clientX,
        lastY: evt.clientY,
        active: !needsThreshold,
      };
      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', onWindowUp);
      refreshCursor();
    };

    return { refreshCursor, startPan, endPan };
  }, [camera]);

  // Callback ref: react-konva may replace the Konva.Stage instance (e.g. StrictMode remounts).
  const mutedStages = useRef(new WeakSet<Konva.Stage>());
  const setStageRef = useCallback(
    (stage: Konva.Stage | null) => {
      if (stage === stageRef.current) return;
      stageRef.current = stage;
      if (stage && !mutedStages.current.has(stage)) {
        muteLayerCountWarning(stage);
        mutedStages.current.add(stage);
      }
      camera.attach(stage);
      if (stage) controller.refreshCursor();
    },
    [camera, controller],
  );

  // --- sizing -----------------------------------------------------------------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const width = Math.max(0, Math.floor(el.clientWidth));
      const height = Math.max(0, Math.floor(el.clientHeight));
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    camera.setWorld(worldWidth, worldHeight);
    if (initializedRef.current) camera.reclamp();
  }, [camera, worldWidth, worldHeight]);

  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    if (!stageMounted) {
      setStageMounted(true);
      return;
    }
    camera.setSize(size.width, size.height);
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (!camera.flushPendingMove()) {
        if (initialFit) camera.fit(false);
        else camera.centerOn(worldWidth / 2, worldHeight / 2, 1, false);
      }
      controller.refreshCursor();
    }
    if (stageRef.current && !childrenReady) setChildrenReady(true);
    // Only the viewport size drives this effect; the world size is already in the camera.
  }, [camera, controller, stageMounted, childrenReady, size.width, size.height]);

  // Re-fit when the world or fitKey changes (zone/level switch).
  useEffect(() => {
    const sig = `${worldWidth}x${worldHeight}|${fitKey ?? ''}`;
    if (fitSigRef.current === null) {
      fitSigRef.current = sig;
      return;
    }
    if (fitSigRef.current === sig) return;
    fitSigRef.current = sig;
    if (initialFit && camera.hasSize()) camera.fit(true);
  }, [camera, worldWidth, worldHeight, fitKey, initialFit]);

  useEffect(() => {
    camera.onViewChange = (v) => propsRef.current.onViewChange?.({ x: v.x, y: v.y, scale: v.scale });
  }, [camera]);

  useEffect(() => () => camera.dispose(), [camera]);

  useEffect(() => {
    controller.refreshCursor();
  }, [controller, panMode]);

  // --- keyboard: hold Space to pan ----------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      if (hoverRef.current || panRef.current) e.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        controller.refreshCursor();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceRef.current) return;
      spaceRef.current = false;
      controller.refreshCursor();
    };
    const onBlur = () => {
      spaceRef.current = false;
      controller.endPan();
      controller.refreshCursor();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      controller.endPan();
    };
  }, [controller]);

  // --- imperative handle ----------------------------------------------------------
  useImperativeHandle(
    ref,
    (): MapStageHandle => ({
      fitToView: () => camera.fit(true),
      centerOn: (x, y, scale) => camera.centerOn(x, y, scale, true),
      screenToWorld: (p) => camera.screenToWorld(p),
      worldToScreen: (p) => camera.worldToScreen(p),
      getScale: () => camera.getView().scale,
      getStage: () => stageRef.current,
      zoomBy: (factor) => {
        const v = camera.getView();
        camera.zoomAt({ x: v.width / 2, y: v.height / 2 }, factor, true);
      },
      getView: () => camera.getView(),
    }),
    [camera],
  );

  // --- helpers ------------------------------------------------------------------
  const pointerWorld = (evt: MouseEvent | TouchEvent | null): MapPoint => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (p) return camera.screenToWorld(p);
    const el = containerRef.current;
    if (el && evt && 'clientX' in evt) {
      const rect = el.getBoundingClientRect();
      return camera.screenToWorld({ x: evt.clientX - rect.left, y: evt.clientY - rect.top });
    }
    return camera.screenToWorld({ x: size.width / 2, y: size.height / 2 });
  };

  const containerPoint = (clientX: number, clientY: number): MapPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  };

  const isPanTrigger = (button: number) =>
    button === 1 || (button === 0 && (spaceRef.current || !!propsRef.current.panMode));

  // --- DOM handlers on the container -------------------------------------------------
  const handleMouseDownCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Decide before Konva sees the event whether nodes may start a drag.
    Konva.dragButtons = isPanTrigger(e.button) ? [] : [0];
  };

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    const p = propsRef.current;
    if (p.onDrop) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
    p.onDragOver?.(e.nativeEvent);
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    const p = propsRef.current;
    if (!p.onDrop) return;
    e.preventDefault();
    p.onDrop(e.nativeEvent, camera.screenToWorld(containerPoint(e.clientX, e.clientY)));
  };

  // --- Konva handlers ------------------------------------------------------------------
  const handleMouseDown = (e: MapMouseEvent) => {
    const evt = e.evt;
    suppressClickRef.current = false;
    if (isPanTrigger(evt.button)) {
      evt.preventDefault();
      suppressClickRef.current = true;
      controller.startPan(evt, false);
      return;
    }
    if (evt.button === 2 && propsRef.current.panWithRightButton) {
      controller.startPan(evt, true);
      return;
    }
    propsRef.current.onStageMouseDown?.(e, pointerWorld(evt));
  };

  const handleMouseMove = (e: MapMouseEvent) => {
    if (panRef.current) return;
    propsRef.current.onStageMouseMove?.(e, pointerWorld(e.evt));
  };

  const handleMouseUp = (e: MapMouseEvent) => {
    if (panRef.current) return;
    propsRef.current.onStageMouseUp?.(e, pointerWorld(e.evt));
  };

  const handleClick = (e: MapMouseEvent) => {
    if (e.evt.button !== 0) return;
    if (suppressClickRef.current || panRef.current) {
      suppressClickRef.current = false;
      return;
    }
    propsRef.current.onStageClick?.(e, pointerWorld(e.evt));
  };

  const handleDblClick = (e: MapMouseEvent) => {
    if (e.evt.button !== 0 || spaceRef.current || propsRef.current.panMode) return;
    propsRef.current.onStageDblClick?.(e, pointerWorld(e.evt));
  };

  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    const pan = panRef.current;
    if (pan?.active) return;
    if (performance.now() - lastRightPanEndRef.current < CONTEXT_MENU_SUPPRESS_MS) return;
    propsRef.current.onStageContextMenu?.(e, pointerWorld(e.evt));
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    const evt = e.evt;
    evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition() ?? containerPoint(evt.clientX, evt.clientY);
    const dy = wheelDelta(evt);
    if (dy === 0) return;
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const intensity = evt.ctrlKey && Math.abs(dy) < 50 ? 0.012 : 0.0018;
    camera.zoomAt(pointer, Math.exp(-dy * intensity), true);
  };

  const stopNodeDrag = (node: Konva.Node | null) => {
    let n: Konva.Node | null = node;
    while (n) {
      if (n.isDragging()) {
        n.stopDrag();
        return;
      }
      n = n.getParent();
    }
  };

  const touchInfo = (touches: TouchList): TouchGesture | null => {
    const a = touches[0];
    const b = touches[1];
    if (a && b) {
      const pa = containerPoint(a.clientX, a.clientY);
      const pb = containerPoint(b.clientX, b.clientY);
      return { kind: 'pinch', dist: Math.max(1, Math.hypot(pb.x - pa.x, pb.y - pa.y)), cx: (pa.x + pb.x) / 2, cy: (pa.y + pb.y) / 2 };
    }
    if (a) return { kind: 'pan', x: a.clientX, y: a.clientY };
    return null;
  };

  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length >= 2) {
      stopNodeDrag(e.target);
      camera.cancelTween();
      touchRef.current = touchInfo(touches);
    } else if (touches.length === 1 && propsRef.current.panMode) {
      touchRef.current = touchInfo(touches);
    } else {
      touchRef.current = null;
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const prev = touchRef.current;
    if (!prev) return;
    const next = touchInfo(e.evt.touches);
    if (!next || next.kind !== prev.kind) {
      touchRef.current = next;
      return;
    }
    e.evt.preventDefault();
    if (next.kind === 'pinch' && prev.kind === 'pinch') {
      camera.panBy(next.cx - prev.cx, next.cy - prev.cy);
      camera.zoomAt({ x: next.cx, y: next.cy }, next.dist / prev.dist, false);
    } else if (next.kind === 'pan' && prev.kind === 'pan') {
      camera.panBy(next.x - prev.x, next.y - prev.y);
    }
    touchRef.current = next;
  };

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    touchRef.current = touches.length >= 2 || (touches.length === 1 && propsRef.current.panMode) ? touchInfo(touches) : null;
  };

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (panRef.current || touchRef.current?.kind === 'pinch') stopNodeDrag(e.target);
  };

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background,
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    outline: 'none',
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseEnter={() => {
        hoverRef.current = true;
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {stageMounted && (
        <Stage
          ref={setStageRef}
          width={Math.max(1, size.width)}
          height={Math.max(1, size.height)}
          style={{ position: 'absolute', inset: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onDblClick={handleDblClick}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDragStart={handleDragStart}
        >
          {childrenReady && (
            <MapViewContext.Provider value={camera}>
              <AmbientLightingContext.Provider value={ambient}>{children}</AmbientLightingContext.Provider>
            </MapViewContext.Provider>
          )}
        </Stage>
      )}
    </div>
  );
});
