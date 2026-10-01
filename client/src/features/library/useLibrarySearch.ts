import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignSummary, LibraryEntry, LibraryQuery } from '@wailers/shared';
import { api } from '../../api/http';
import { toast } from '../../components/ui/toast';

interface SearchState {
  items: LibraryEntry[];
  total: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** True once the first page of the current query arrived. */
  loaded: boolean;
}

export interface LibrarySearchResult extends SearchState {
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Local edit of the loaded items (after create/edit/delete) without refetching. */
  patch: (fn: (items: LibraryEntry[]) => LibraryEntry[], totalDelta?: number) => void;
}

const EMPTY: SearchState = { items: [], total: 0, page: 0, loading: false, loadingMore: false, error: null, loaded: false };

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'No se pudo consultar la biblioteca';
}

/**
 * Paged library search. Results of the previous query stay visible while the next one loads
 * (`loading` is true); responses of outdated queries are ignored.
 */
export function useLibrarySearch(query: LibraryQuery | null, pageSize = 36): LibrarySearchResult {
  const key = query ? JSON.stringify(query) : null;
  const [state, setState] = useState<SearchState>(EMPTY);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const q = queryRef.current;
    const my = ++seq.current;
    if (!q) {
      setState(EMPTY);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    api.library
      .search({ ...q, page: 1, pageSize })
      .then((res) => {
        if (my !== seq.current) return;
        setState({
          items: Array.isArray(res.items) ? res.items : [],
          total: typeof res.total === 'number' ? res.total : 0,
          page: 1,
          loading: false,
          loadingMore: false,
          error: null,
          loaded: true,
        });
      })
      .catch((err: unknown) => {
        if (my !== seq.current) return;
        setState((s) => ({ ...s, loading: false, loadingMore: false, error: errorMessage(err), loaded: true }));
      });
  }, [key, pageSize, tick]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    const q = queryRef.current;
    if (!q || s.loading || s.loadingMore || s.items.length >= s.total) return;
    const my = seq.current;
    setState((prev) => ({ ...prev, loadingMore: true }));
    api.library
      .search({ ...q, page: s.page + 1, pageSize })
      .then((res) => {
        if (my !== seq.current) return;
        setState((prev) => {
          const ids = new Set(prev.items.map((i) => i.id));
          const fresh = (res.items ?? []).filter((i) => !ids.has(i.id));
          return {
            ...prev,
            items: [...prev.items, ...fresh],
            total: typeof res.total === 'number' ? res.total : prev.total,
            page: prev.page + 1,
            loadingMore: false,
          };
        });
      })
      .catch((err: unknown) => {
        if (my !== seq.current) return;
        setState((prev) => ({ ...prev, loadingMore: false }));
        toast.fromError(err, 'No se pudieron cargar más resultados');
      });
  }, [pageSize]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const patch = useCallback((fn: (items: LibraryEntry[]) => LibraryEntry[], totalDelta = 0) => {
    setState((prev) => ({ ...prev, items: fn(prev.items), total: Math.max(0, prev.total + totalDelta) }));
  }, []);

  return { ...state, hasMore: state.items.length < state.total, loadMore, reload, patch };
}

// ---------------------------------------------------------------------------
// Campaign list cache (origin campaign selects)
// ---------------------------------------------------------------------------

let campaignsCache: CampaignSummary[] | null = null;
let campaignsInflight: Promise<CampaignSummary[]> | null = null;

function fetchCampaigns(force = false): Promise<CampaignSummary[]> {
  if (campaignsCache && !force) return Promise.resolve(campaignsCache);
  if (campaignsInflight) return campaignsInflight;
  campaignsInflight = api.campaigns
    .list()
    .then((list) => {
      campaignsCache = [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      return campaignsCache;
    })
    .finally(() => {
      campaignsInflight = null;
    });
  return campaignsInflight;
}

/** All campaigns (cached for the page lifetime), sorted by name. */
export function useCampaignList(): CampaignSummary[] {
  const [list, setList] = useState<CampaignSummary[]>(campaignsCache ?? []);
  useEffect(() => {
    let alive = true;
    fetchCampaigns(true)
      .then((l) => {
        if (alive) setList(l);
      })
      .catch(() => {
        /* the select simply stays empty */
      });
    return () => {
      alive = false;
    };
  }, []);
  return list;
}
