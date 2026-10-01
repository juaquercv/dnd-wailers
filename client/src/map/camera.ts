import type Konva from 'konva';
import { clamp, easeInOutCubic, lerp } from './mapUtils';
import type { MapViewSource, MapViewState } from './mapView';

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 5;
/** Screen px of the world that always stay inside the viewport while panning. */
const KEEP_VISIBLE_PX = 120;
const FIT_PADDING = 0.94;

export interface Point {
  x: number;
  y: number;
}

interface ViewTween {
  from: { cx: number; cy: number; scale: number };
  to: { cx: number; cy: number; scale: number };
  start: number;
  duration: number;
}

interface ZoomTarget {
  scale: number;
  anchor: Point;
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/**
 * Imperative camera of a MapStage. Owns the stage transform so panning/zooming never re-renders React
 * children; layers that depend on the view read it at draw time or subscribe here.
 */
export class MapCamera implements MapViewSource {
  private stage: Konva.Stage | null = null;
  private snapshot: MapViewState = { x: 0, y: 0, scale: 1, width: 0, height: 0 };
  private world = { width: 0, height: 0 };
  private listeners = new Set<(view: MapViewState) => void>();
  private rafId: number | null = null;
  private notifyRafId: number | null = null;
  private tween: ViewTween | null = null;
  private zoomTarget: ZoomTarget | null = null;

  /** Throttled (one call per animation frame) change callback for React consumers. */
  onViewChange: ((view: MapViewState) => void) | null = null;

  getView = (): MapViewState => this.snapshot;

  subscribe = (listener: (view: MapViewState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  attach(stage: Konva.Stage | null): void {
    this.stage = stage;
    this.applyToStage();
  }

  hasSize(): boolean {
    return this.snapshot.width > 0 && this.snapshot.height > 0;
  }

  setWorld(width: number, height: number): void {
    this.world = { width: Math.max(0, width), height: Math.max(0, height) };
  }

  /** Re-applies the pan limits (after the world size changed). */
  reclamp(): void {
    const v = this.snapshot;
    this.commit({ x: v.x, y: v.y, scale: v.scale });
  }

  /** Viewport resize: keeps the world point at the center of the viewport where it was. */
  setSize(width: number, height: number): void {
    const prev = this.snapshot;
    if (prev.width === width && prev.height === height) return;
    const hadSize = prev.width > 0 && prev.height > 0;
    const x = hadSize ? prev.x + (width - prev.width) / 2 : prev.x;
    const y = hadSize ? prev.y + (height - prev.height) / 2 : prev.y;
    this.commit({ x, y, scale: prev.scale }, { width, height });
  }

  screenToWorld(p: Point): Point {
    const v = this.snapshot;
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
  }

  worldToScreen(p: Point): Point {
    const v = this.snapshot;
    return { x: p.x * v.scale + v.x, y: p.y * v.scale + v.y };
  }

  panBy(dx: number, dy: number): void {
    this.tween = null;
    const v = this.snapshot;
    this.commit({ x: v.x + dx, y: v.y + dy, scale: v.scale });
  }

  /** Zoom by `factor` keeping the screen point `anchor` fixed. Animated zooms accumulate smoothly. */
  zoomAt(anchor: Point, factor: number, animated: boolean): void {
    this.tween = null;
    if (!animated) {
      this.zoomTarget = null;
      this.applyZoom(anchor, clampScale(this.snapshot.scale * factor));
      return;
    }
    const base = this.zoomTarget?.scale ?? this.snapshot.scale;
    this.zoomTarget = { scale: clampScale(base * factor), anchor: { ...anchor } };
    this.ensureLoop();
  }

  /** Scale and center that make the whole world visible, or null if sizes are unknown. */
  private fitTarget(): { cx: number; cy: number; scale: number } | null {
    const { width, height } = this.snapshot;
    const W = this.world.width;
    const H = this.world.height;
    if (!width || !height || !W || !H) return null;
    return { cx: W / 2, cy: H / 2, scale: clampScale(Math.min(width / W, height / H) * FIT_PADDING) };
  }

  fit(animated: boolean): void {
    const target = this.fitTarget();
    if (!target) return;
    this.moveTo(target.cx, target.cy, target.scale, animated);
  }

  centerOn(x: number, y: number, scale: number | undefined, animated: boolean): void {
    this.moveTo(x, y, clampScale(scale ?? this.snapshot.scale), animated);
  }

  cancelAnimations(): void {
    this.tween = null;
    this.zoomTarget = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  cancelTween(): void {
    this.tween = null;
  }

  dispose(): void {
    this.cancelAnimations();
    if (this.notifyRafId !== null) cancelAnimationFrame(this.notifyRafId);
    this.notifyRafId = null;
    this.listeners.clear();
    this.onViewChange = null;
    this.stage = null;
  }

  // -------------------------------------------------------------------------

  private viewForCenter(cx: number, cy: number, scale: number): { x: number; y: number; scale: number } {
    const { width, height } = this.snapshot;
    return { x: width / 2 - cx * scale, y: height / 2 - cy * scale, scale };
  }

  private currentCenter(): { cx: number; cy: number; scale: number } {
    const v = this.snapshot;
    return { cx: (v.width / 2 - v.x) / v.scale, cy: (v.height / 2 - v.y) / v.scale, scale: v.scale };
  }

  private moveTo(cx: number, cy: number, scale: number, animated: boolean): void {
    this.zoomTarget = null;
    if (!animated || !this.hasSize()) {
      this.tween = null;
      this.commit(this.viewForCenter(cx, cy, scale));
      return;
    }
    const from = this.currentCenter();
    const dist = Math.hypot(cx - from.cx, cy - from.cy) * scale;
    const zoomRatio = Math.abs(Math.log(scale / from.scale));
    const duration = clamp(220 + dist * 0.12 + zoomRatio * 140, 220, 650);
    this.tween = { from, to: { cx, cy, scale }, start: performance.now(), duration };
    this.ensureLoop();
  }

  private applyZoom(anchor: Point, scale: number): void {
    const v = this.snapshot;
    const world = { x: (anchor.x - v.x) / v.scale, y: (anchor.y - v.y) / v.scale };
    this.commit({ x: anchor.x - world.x * scale, y: anchor.y - world.y * scale, scale });
  }

  private ensureLoop(): void {
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return;
    const step = (now: number) => {
      this.rafId = null;
      let again = false;
      if (this.tween) {
        const t = clamp((now - this.tween.start) / this.tween.duration, 0, 1);
        const e = easeInOutCubic(t);
        const { from, to } = this.tween;
        const scale = Math.exp(lerp(Math.log(from.scale), Math.log(to.scale), e));
        const cx = lerp(from.cx, to.cx, e);
        const cy = lerp(from.cy, to.cy, e);
        this.commit(this.viewForCenter(cx, cy, scale));
        if (t >= 1) this.tween = null;
        else again = true;
      }
      if (this.zoomTarget) {
        const cur = this.snapshot.scale;
        const target = this.zoomTarget.scale;
        let next = cur + (target - cur) * 0.3;
        if (Math.abs(next - target) / target < 0.002) next = target;
        this.applyZoom(this.zoomTarget.anchor, next);
        if (next === target || this.snapshot.scale !== next) this.zoomTarget = null;
        else again = true;
      }
      if (again) this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  private clampPosition(x: number, y: number, scale: number, width: number, height: number): Point {
    const W = this.world.width * scale;
    const H = this.world.height * scale;
    if (!W || !H || !width || !height) return { x, y };
    const mx = Math.min(KEEP_VISIBLE_PX, W / 2, width / 2);
    const my = Math.min(KEEP_VISIBLE_PX, H / 2, height / 2);
    return { x: clamp(x, mx - W, width - mx), y: clamp(y, my - H, height - my) };
  }

  private commit(view: { x: number; y: number; scale: number }, size?: { width: number; height: number }): void {
    const width = size?.width ?? this.snapshot.width;
    const height = size?.height ?? this.snapshot.height;
    const scale = clampScale(view.scale);
    const pos = this.clampPosition(view.x, view.y, scale, width, height);
    const prev = this.snapshot;
    if (prev.x === pos.x && prev.y === pos.y && prev.scale === scale && prev.width === width && prev.height === height) return;
    this.snapshot = { x: pos.x, y: pos.y, scale, width, height };
    for (const listener of [...this.listeners]) listener(this.snapshot);
    this.applyToStage();
    this.scheduleNotify();
  }

  private applyToStage(): void {
    const stage = this.stage;
    if (!stage) return;
    const v = this.snapshot;
    stage.setAttrs({ x: v.x, y: v.y, scaleX: v.scale, scaleY: v.scale });
    stage.batchDraw();
  }

  private scheduleNotify(): void {
    if (!this.onViewChange || this.notifyRafId !== null || typeof requestAnimationFrame === 'undefined') return;
    this.notifyRafId = requestAnimationFrame(() => {
      this.notifyRafId = null;
      this.onViewChange?.(this.snapshot);
    });
  }
}
