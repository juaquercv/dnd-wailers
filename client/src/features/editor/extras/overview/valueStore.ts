import { useSyncExternalStore } from 'react';

export interface WorldPoint {
  x: number;
  y: number;
}

/** Tiny external store, so only the components reading a hot value (pointer, zoom) re-render. */
export interface ValueStore<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): ValueStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (value) => {
      if (equals(current, value)) return;
      current = value;
      for (const l of [...listeners]) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useValueStore<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export type PointerStore = ValueStore<WorldPoint | null>;

export function samePoint(a: WorldPoint | null, b: WorldPoint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

export function createPointerStore(): PointerStore {
  return createValueStore<WorldPoint | null>(null, samePoint);
}
