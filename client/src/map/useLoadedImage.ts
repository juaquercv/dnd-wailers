import { useCallback, useSyncExternalStore } from 'react';

export type ImageStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface ImageState {
  image: HTMLImageElement | undefined;
  status: ImageStatus;
}

interface CacheEntry {
  url: string;
  state: ImageState;
  listeners: Set<() => void>;
  failedAt: number;
}

const IDLE: ImageState = { image: undefined, status: 'idle' };
const RETRY_FAILED_AFTER_MS = 15_000;
const MAX_ENTRIES = 400;
const cache = new Map<string, CacheEntry>();

function isSameOrigin(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}

function setState(entry: CacheEntry, state: ImageState): void {
  entry.state = state;
  for (const l of [...entry.listeners]) l();
}

function startLoad(entry: CacheEntry, useCors: boolean): void {
  const img = new Image();
  // 'anonymous' keeps the canvas untainted (exports/hit tests); retried without it for foreign hosts lacking CORS.
  if (useCors) img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    setState(entry, { image: img, status: 'loaded' });
  };
  img.onerror = () => {
    if (useCors && !isSameOrigin(entry.url)) {
      startLoad(entry, false);
      return;
    }
    entry.failedAt = Date.now();
    setState(entry, { image: undefined, status: 'failed' });
  };
  img.src = entry.url;
}

function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  for (const [key, entry] of cache) {
    if (cache.size <= MAX_ENTRIES) break;
    if (entry.listeners.size === 0) cache.delete(key);
  }
}

function getEntry(url: string): CacheEntry {
  let entry = cache.get(url);
  if (entry) {
    // LRU touch
    cache.delete(url);
    cache.set(url, entry);
    return entry;
  }
  entry = { url, state: { image: undefined, status: 'loading' }, listeners: new Set(), failedAt: 0 };
  cache.set(url, entry);
  startLoad(entry, true);
  evictIfNeeded();
  return entry;
}

function normalizeUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

/** Loads (once, shared cache) an image for Konva. Returns its state; image is set only when loaded. */
export function useImageStatus(url: string | null | undefined): ImageState {
  const key = normalizeUrl(url);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!key) return () => undefined;
      const entry = getEntry(key);
      if (entry.state.status === 'failed' && Date.now() - entry.failedAt > RETRY_FAILED_AFTER_MS) {
        entry.state = { image: undefined, status: 'loading' };
        startLoad(entry, true);
        queueMicrotask(onChange);
      }
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
      };
    },
    [key],
  );
  const getSnapshot = () => (key ? getEntry(key).state : IDLE);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** `useLoadedImage(url)`: the HTMLImageElement once loaded (works with SVG files that declare width/height). */
export function useLoadedImage(url: string | null): HTMLImageElement | undefined {
  return useImageStatus(url).image;
}

/** Starts loading an image into the shared cache; resolves when loaded (rejects on failure). */
export function preloadImage(url: string): Promise<HTMLImageElement> {
  const key = normalizeUrl(url);
  if (!key) return Promise.reject(new Error('URL de imagen vacía'));
  const entry = getEntry(key);
  if (entry.state.status === 'loaded' && entry.state.image) return Promise.resolve(entry.state.image);
  if (entry.state.status === 'failed') return Promise.reject(new Error('No se pudo cargar la imagen'));
  return new Promise((resolve, reject) => {
    const listener = () => {
      if (entry.state.status === 'loaded' && entry.state.image) {
        entry.listeners.delete(listener);
        resolve(entry.state.image);
      } else if (entry.state.status === 'failed') {
        entry.listeners.delete(listener);
        reject(new Error('No se pudo cargar la imagen'));
      }
    };
    entry.listeners.add(listener);
  });
}

/** Synchronous cache lookup (undefined when not loaded yet). */
export function getCachedImage(url: string | null | undefined): HTMLImageElement | undefined {
  const key = normalizeUrl(url);
  if (!key) return undefined;
  const entry = cache.get(key);
  return entry?.state.status === 'loaded' ? entry.state.image : undefined;
}
