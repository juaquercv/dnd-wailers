import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { CategoryDTO, CategoryNode, EntryKind } from '@wailers/shared';
import { api } from '../api/http';

/**
 * Cache of every library category (all kinds). Roots are facets ("Tipo de criatura", "Hábitat"…),
 * children are values and may nest.
 */
interface CategoriesState {
  categories: CategoryDTO[];
  byId: Record<string, CategoryDTO>;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  /** Load once (no-op when already loaded unless force). */
  load: (force?: boolean) => Promise<void>;
  /** Reload after edits. */
  refresh: () => Promise<void>;

  byKind: (kind: EntryKind) => CategoryDTO[];
  tree: (kind: EntryKind) => CategoryNode[];
  /** Display name ('' when unknown). */
  name: (id: string) => string;
  /** "Arma › Cuerpo a cuerpo › Espada" (facet excluded unless includeFacet). */
  pathName: (id: string, includeFacet?: boolean) => string;
  /** Ancestors chain from the root facet to the category itself. */
  path: (id: string) => CategoryDTO[];
  /** Root ancestor (the facet) of a category; the category itself when it is a root. */
  facetOf: (id: string) => CategoryDTO | null;
  /** Ids of every descendant (children, grandchildren…). */
  descendantsOf: (id: string, includeSelf?: boolean) => string[];
  childrenOf: (id: string | null, kind?: EntryKind) => CategoryDTO[];
}

function compare(a: CategoryDTO, b: CategoryDTO): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');
}

/** Per-array memo so tree()/byKind() return stable references between renders. */
const treeCache = new WeakMap<CategoryDTO[], Map<EntryKind, CategoryNode[]>>();
const kindCache = new WeakMap<CategoryDTO[], Map<EntryKind, CategoryDTO[]>>();
const childrenCache = new WeakMap<CategoryDTO[], Map<string | null, CategoryDTO[]>>();

function childrenIndex(categories: CategoryDTO[]): Map<string | null, CategoryDTO[]> {
  let idx = childrenCache.get(categories);
  if (!idx) {
    idx = new Map();
    for (const c of categories) {
      const list = idx.get(c.parentId) ?? [];
      list.push(c);
      idx.set(c.parentId, list);
    }
    for (const list of idx.values()) list.sort(compare);
    childrenCache.set(categories, idx);
  }
  return idx;
}

function buildTree(categories: CategoryDTO[], kind: EntryKind): CategoryNode[] {
  let perKind = treeCache.get(categories);
  if (!perKind) {
    perKind = new Map();
    treeCache.set(categories, perKind);
  }
  const cached = perKind.get(kind);
  if (cached) return cached;
  const idx = childrenIndex(categories);
  const ids = new Set(categories.map((c) => c.id));
  const visit = (c: CategoryDTO, seen: Set<string>): CategoryNode => {
    const next = new Set(seen).add(c.id);
    const kids = (idx.get(c.id) ?? []).filter((k) => !next.has(k.id));
    return { ...c, children: kids.map((k) => visit(k, next)) };
  };
  // Roots: no parent, or an orphan whose parent is missing.
  const roots = categories.filter((c) => c.kind === kind && (c.parentId === null || !ids.has(c.parentId))).sort(compare);
  const tree = roots.map((r) => visit(r, new Set()));
  perKind.set(kind, tree);
  return tree;
}

let inflight: Promise<void> | null = null;

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  byId: {},
  loaded: false,
  loading: false,
  error: null,

  load: (force = false) => {
    if (!force && get().loaded) return Promise.resolve();
    if (inflight) return inflight;
    set({ loading: true, error: null });
    inflight = api.categories
      .list()
      .then((list) => {
        const byId: Record<string, CategoryDTO> = {};
        for (const c of list) byId[c.id] = c;
        set({ categories: list, byId, loaded: true, loading: false });
      })
      .catch((err: unknown) => {
        set({ loading: false, error: err instanceof Error ? err.message : 'No se pudieron cargar las categorías' });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },

  refresh: () => get().load(true),

  byKind: (kind) => {
    const { categories } = get();
    let perKind = kindCache.get(categories);
    if (!perKind) {
      perKind = new Map();
      kindCache.set(categories, perKind);
    }
    let list = perKind.get(kind);
    if (!list) {
      list = categories.filter((c) => c.kind === kind).sort(compare);
      perKind.set(kind, list);
    }
    return list;
  },

  tree: (kind) => buildTree(get().categories, kind),

  name: (id) => get().byId[id]?.name ?? '',

  path: (id) => {
    const { byId } = get();
    const chain: CategoryDTO[] = [];
    const seen = new Set<string>();
    let cur: CategoryDTO | undefined = byId[id];
    while (cur && !seen.has(cur.id)) {
      chain.unshift(cur);
      seen.add(cur.id);
      cur = cur.parentId ? byId[cur.parentId] : undefined;
    }
    return chain;
  },

  pathName: (id, includeFacet = false) => {
    const chain = get().path(id);
    const parts = includeFacet || chain.length <= 1 ? chain : chain.slice(1);
    return parts.map((c) => c.name).join(' › ');
  },

  facetOf: (id) => get().path(id)[0] ?? null,

  descendantsOf: (id, includeSelf = false) => {
    const idx = childrenIndex(get().categories);
    const out: string[] = includeSelf ? [id] : [];
    const seen = new Set<string>([id]);
    const stack = [...(idx.get(id) ?? [])];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      stack.push(...(idx.get(c.id) ?? []));
    }
    return out;
  },

  childrenOf: (id, kind) => {
    const list = childrenIndex(get().categories).get(id) ?? [];
    return kind ? list.filter((c) => c.kind === kind) : list;
  },
}));

export interface UseCategoriesResult {
  /** Categories of `kind` (all kinds when omitted), sorted. */
  categories: CategoryDTO[];
  /** Facet tree of `kind` (empty when kind is omitted). */
  tree: CategoryNode[];
  byId: Record<string, CategoryDTO>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  name: CategoriesState['name'];
  pathName: CategoriesState['pathName'];
  facetOf: CategoriesState['facetOf'];
  descendantsOf: CategoriesState['descendantsOf'];
  childrenOf: CategoriesState['childrenOf'];
  refresh: CategoriesState['refresh'];
}

/** Categories (optionally of one kind). Loads the cache on first use. */
export function useCategories(kind?: EntryKind): UseCategoriesResult {
  const all = useCategoriesStore((s) => s.categories);
  const byId = useCategoriesStore((s) => s.byId);
  const loading = useCategoriesStore((s) => s.loading);
  const loaded = useCategoriesStore((s) => s.loaded);
  const error = useCategoriesStore((s) => s.error);
  const store = useCategoriesStore.getState();

  useEffect(() => {
    const s = useCategoriesStore.getState();
    if (!s.loaded && !s.loading) void s.load();
  }, []);

  const categories = useMemo(
    () => (kind ? all.filter((c) => c.kind === kind).sort(compare) : [...all].sort(compare)),
    [all, kind],
  );
  const tree = useMemo(() => (kind ? buildTree(all, kind) : []), [all, kind]);

  return {
    categories,
    tree,
    byId,
    loading,
    loaded,
    error,
    name: store.name,
    pathName: store.pathName,
    facetOf: store.facetOf,
    descendantsOf: store.descendantsOf,
    childrenOf: store.childrenOf,
    refresh: store.refresh,
  };
}
