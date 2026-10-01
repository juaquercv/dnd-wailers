import { useCallback, useEffect, useState } from 'react';
import type { LibraryEntry, SoundType } from '@wailers/shared';
import { api } from '../../api/http';

export type SoundEntry = LibraryEntry<'sound'>;

const CACHE_TTL_MS = 60_000;
const PAGE_SIZE = 100;

const searchCache = new Map<string, { at: number; items: SoundEntry[] }>();
const nameCache = new Map<string, string | null>();
const namePending = new Map<string, Promise<string | null>>();

function isSound(entry: LibraryEntry): entry is SoundEntry {
  return entry.kind === 'sound';
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
  for (const item of items) nameCache.set(item.id, item.name);
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

/** Display name of a library sound by id (cached; null while unknown). */
export function useSoundName(soundId: string | null): string | null {
  const [name, setName] = useState<string | null>(() => (soundId ? nameCache.get(soundId) ?? null : null));

  useEffect(() => {
    if (!soundId) {
      setName(null);
      return;
    }
    const cached = nameCache.get(soundId);
    if (cached !== undefined) {
      setName(cached);
      return;
    }
    let cancelled = false;
    let pending = namePending.get(soundId);
    if (!pending) {
      pending = api.library
        .get(soundId)
        .then((entry) => entry.name)
        .catch(() => null)
        .then((value) => {
          nameCache.set(soundId, value);
          namePending.delete(soundId);
          return value;
        });
      namePending.set(soundId, pending);
    }
    void pending.then((value) => {
      if (!cancelled) setName(value);
    });
    return () => {
      cancelled = true;
    };
  }, [soundId]);

  return name;
}
