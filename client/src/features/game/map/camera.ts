import { create } from 'zustand';
import type { GridConfig } from '@wailers/shared';
import type { MapStageHandle } from '../../../map';

/** Zone/level currently drawn by the game map, with its world size. */
export interface CameraTarget {
  zoneId: string;
  levelId: string;
  width: number;
  height: number;
  grid: GridConfig;
}

export interface WorldPoint {
  x: number;
  y: number;
}

interface GameCameraState {
  /** Imperative handle of the game MapStage (null while the map is not mounted). */
  handle: MapStageHandle | null;
  target: CameraTarget | null;
  /** Current zoom (updated at most once per animation frame). */
  scale: number;
  setHandle: (handle: MapStageHandle | null) => void;
  setTarget: (target: CameraTarget | null) => void;
  setScale: (scale: number) => void;
}

/** Small local store exposing the game map camera to the rest of the game screen. */
export const useGameCamera = create<GameCameraState>((set) => ({
  handle: null,
  target: null,
  scale: 1,
  setHandle: (handle) => set({ handle }),
  setTarget: (target) => set({ target }),
  setScale: (scale) => set((s) => (Math.abs(s.scale - scale) < 0.0005 ? s : { scale })),
}));

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function hasViewport(handle: MapStageHandle | null): handle is MapStageHandle {
  if (!handle) return false;
  const v = handle.getView();
  return v.width > 0 && v.height > 0;
}

/** Imperative camera helpers (hotkeys, menus, quick search, overlays). */
export const gameCamera = {
  /** World point at the center of the viewport (clamped to the level) or the level center. */
  center(): (WorldPoint & { zoneId: string; levelId: string }) | null {
    const { handle, target } = useGameCamera.getState();
    if (!target) return null;
    let x = target.width / 2;
    let y = target.height / 2;
    if (hasViewport(handle)) {
      const v = handle.getView();
      const p = handle.screenToWorld({ x: v.width / 2, y: v.height / 2 });
      x = clamp(p.x, 0, target.width);
      y = clamp(p.y, 0, target.height);
    }
    return { zoneId: target.zoneId, levelId: target.levelId, x, y };
  },

  centerOn(x: number, y: number, scale?: number): void {
    useGameCamera.getState().handle?.centerOn(x, y, scale);
  },

  fit(): void {
    useGameCamera.getState().handle?.fitToView();
  },

  zoomBy(factor: number): void {
    useGameCamera.getState().handle?.zoomBy(factor);
  },

  getScale(): number {
    return useGameCamera.getState().handle?.getScale() ?? 1;
  },

  /** Browser client coordinates -> world coordinates of the displayed level. */
  clientToWorld(clientX: number, clientY: number): WorldPoint | null {
    const handle = useGameCamera.getState().handle;
    const stage = handle?.getStage();
    if (!handle || !stage) return null;
    const rect = stage.container().getBoundingClientRect();
    return handle.screenToWorld({ x: clientX - rect.left, y: clientY - rect.top });
  },

  /** World coordinates -> browser client coordinates. */
  worldToClient(p: WorldPoint): WorldPoint | null {
    const handle = useGameCamera.getState().handle;
    const stage = handle?.getStage();
    if (!handle || !stage) return null;
    const rect = stage.container().getBoundingClientRect();
    const s = handle.worldToScreen(p);
    return { x: s.x + rect.left, y: s.y + rect.top };
  },

  /** Zoom that shows roughly `cells` grid cells across the shorter side of the viewport. */
  scaleForCells(cells: number): number | undefined {
    const { handle, target } = useGameCamera.getState();
    if (!target || !hasViewport(handle) || !(target.grid.size > 0)) return undefined;
    const v = handle.getView();
    return clamp(Math.min(v.width, v.height) / (target.grid.size * cells), 0.25, 1.75);
  },

  /** Runs `fn` once the map viewport has been measured (polls a few frames). */
  whenReady(fn: (handle: MapStageHandle) => void, maxFrames = 90): () => void {
    let frames = 0;
    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const handle = useGameCamera.getState().handle;
      if (hasViewport(handle)) {
        fn(handle);
        return;
      }
      frames += 1;
      if (frames < maxFrames) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  },
};
