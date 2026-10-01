import { useCallback, useEffect, useState } from 'react';
import { emptySoundData, type LibraryEntry, type SoundType } from '@wailers/shared';
import { api } from '../../api/http';

export type SoundEntry = LibraryEntry<'sound'>;

/** What the session player needs from a library sound. */
export interface SoundInfo {
  name: string;
  /** The entry's own playback volume 0..1. */
  volume: number;
}

const CACHE_TTL_MS = 60_000;
const PAGE_SIZE = 100;
const DEFAULT_SOUND_VOLUME = emptySoundData().volume;

const searchCache = new Map<string, { at: number; items: SoundEntry[] }>();
const infoCache = new Map<string, { at: number; info: SoundInfo | null }>();
const infoPending = new Map<string, Promise<SoundInfo | null>>();

function isSound(entry: LibraryEntry): entry is SoundEntry {
  return entry.kind === 'sound';
}

function soundInfoOf(entry: SoundEntry): SoundInfo {
  const volume = entry.data?.volume;
  return {
    name: entry.name,
    volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_SOUND_VOLUME,
  };
}

/** Loads (once at a time per id) a sound's name and volume; a failed refresh keeps what was known. */
function fetchSoundInfo(soundId: string): Promise<SoundInfo | null> {
  const running = infoPending.get(soundId);
  if (running) return running;
  const pending = api.library
    .get(soundId)
    .then((entry) => (isSound(entry) ? soundInfoOf(entry) : null))
    .catch(() => infoCache.get(soundId)?.info ?? null)
    .then((info) => {
      infoCache.set(soundId, { at: Date.now(), info });
      infoPending.delete(soundId);
      return info;
    });
  infoPending.set(soundId, pending);
  return pending;
}

function cacheKey(soundType: SoundType, q: string): string {
  return `${soundType}|${q.trim().toLowerCase()}`;
}

/** Library sounds of one type (music / ambience / effect), fuzzy-filtered by `q`. Cached for a minute. */
export async function searchSounds(soundType: SoundType, q: string): Promise<SoundEntry[]> {
  const key = cacheKey(soundType, q);
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const text = q.trim();
  const page = await api.library.search({
    kind: 'sound',
    q: text || undefined,
    dataEquals: { soundType },
    sort: text ? 'relevance' : 'name',
    order: 'asc',
    pageSize: PAGE_SIZE,
  });
  const items = page.items.filter(isSound);
  searchCache.set(key, { at: Date.now(), items });
  const now = Date.now();
  for (const item of items) infoCache.set(item.id, { at: now, info: soundInfoOf(item) });
  return items;
}

export interface SoundSearchState {
  items: SoundEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSoundSearch(soundType: SoundType, q: string): SoundSearchState {
  const [state, setState] = useState<{ items: SoundEntry[]; loading: boolean; error: string | null }>(() => {
    const hit = searchCache.get(cacheKey(soundType, q));
    return { items: hit?.items ?? [], loading: !hit, error: null };
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    searchSounds(soundType, q)
      .then((items) => {
        if (!cancelled) setState({ items, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error && err.message ? err.message : 'No se pudieron cargar los sonidos';
        setState((s) => ({ ...s, loading: false, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [soundType, q, nonce]);

  const reload = useCallback(() => {
    searchCache.delete(cacheKey(soundType, q));
    setNonce((n) => n + 1);
  }, [soundType, q]);

  return { ...state, reload };
}

/**
 * Name and own volume of a library sound by id (cached; re-read in the background after a minute).
 * `undefined` while it loads for the first time; `null` without id or when the entry cannot be read.
 */
export function useSoundInfo(soundId: string | null): SoundInfo | null | undefined {
  const [, setLoaded] = useState(0);

  useEffect(() => {
    if (!soundId) return;
    const cached = infoCache.get(soundId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return;
    let cancelled = false;
    void fetchSoundInfo(soundId).then(() => {
      if (!cancelled) setLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [soundId]);

  if (!soundId) return null;
  const cached = infoCache.get(soundId);
  return cached ? cached.info : undefined;
}
