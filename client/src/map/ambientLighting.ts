import { createContext, useCallback, useContext, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/** Base darkness of a map (no light holes): what LightingOverlay paints over the current level. */
export interface AmbientLighting {
  /** CSS color of the darkness. */
  tint: string;
  /** 0..1 alpha of the darkness (0 = daylight). */
  darkness: number;
}

/**
 * Per-MapStage slot for the ambient lighting. LightingOverlay publishes the lighting it renders (DM-softened or real)
 * and LevelStack darkens the lower floors with it, so a floor below is never brighter than the one being viewed.
 */
export interface AmbientLightingStore {
  get(): AmbientLighting | null;
  /** Sets (or clears with null) the value published by `owner`; clearing never drops another owner's value. */
  set(owner: object, value: AmbientLighting | null): void;
  subscribe(listener: () => void): () => void;
}

export function createAmbientLightingStore(): AmbientLightingStore {
  let slot: { owner: object; value: AmbientLighting } | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => slot?.value ?? null,
    set(owner, value) {
      const prev = slot?.value ?? null;
      if (value) {
        slot = prev && slot?.owner === owner && prev.tint === value.tint && prev.darkness === value.darkness ? slot : { owner, value };
      } else if (slot?.owner === owner) {
        slot = null;
      }
      if ((slot?.value ?? null) !== prev) listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const AmbientLightingContext = createContext<AmbientLightingStore | null>(null);

const noopUnsubscribe = () => undefined;

/** Ambient lighting published in the enclosing MapStage (null outside a MapStage or without a LightingOverlay). */
export function useAmbientLighting(): AmbientLighting | null {
  const store = useContext(AmbientLightingContext);
  const subscribe = useCallback((onChange: () => void) => (store ? store.subscribe(onChange) : noopUnsubscribe), [store]);
  const get = useCallback(() => (store ? store.get() : null), [store]);
  return useSyncExternalStore(subscribe, get, get);
}

/** Publishes the ambient lighting of the enclosing MapStage while mounted (darkness <= 0 publishes nothing). */
export function usePublishAmbientLighting(tint: string, darkness: number): void {
  const store = useContext(AmbientLightingContext);
  const owner = useRef<object>({}).current;
  useLayoutEffect(() => {
    if (!store) return;
    store.set(owner, darkness > 0 ? { tint, darkness } : null);
    return () => store.set(owner, null);
  }, [store, owner, tint, darkness]);
}
