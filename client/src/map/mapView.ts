import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

/** Current camera of a MapStage: stage translation (screen px), zoom and viewport size. */
export interface MapViewState {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

/** Imperative view source provided by MapStage to its children (no React re-render on pan/zoom). */
export interface MapViewSource {
  getView(): MapViewState;
  /** Called synchronously on every view change, before the stage redraws. */
  subscribe(listener: (view: MapViewState) => void): () => void;
}

export const MapViewContext = createContext<MapViewSource | null>(null);

const FALLBACK_VIEW: MapViewState = { x: 0, y: 0, scale: 1, width: 0, height: 0 };

/** Imperative access to the enclosing MapStage camera (null outside a MapStage). */
export function useMapViewSource(): MapViewSource | null {
  return useContext(MapViewContext);
}

/** Reactive camera state. Re-renders on every pan/zoom frame: prefer useMapViewSource for hot paths. */
export function useMapView(): MapViewState {
  const source = useContext(MapViewContext);
  const subscribe = useCallback(
    (onChange: () => void) => (source ? source.subscribe(() => onChange()) : () => undefined),
    [source],
  );
  return useSyncExternalStore(
    subscribe,
    () => (source ? source.getView() : FALLBACK_VIEW),
    () => (source ? source.getView() : FALLBACK_VIEW),
  );
}
