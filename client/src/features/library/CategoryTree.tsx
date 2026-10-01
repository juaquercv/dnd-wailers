import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, FolderTree, X } from 'lucide-react';
import { normalizeText, type CategoryNode, type EntryKind } from '@wailers/shared';
import { Checkbox } from '../../components/ui/Checkbox';
import { SearchInput } from '../../components/ui/SearchInput';
import { Spinner } from '../../components/ui/Spinner';
import { useCategories } from '../../stores/categories';

export interface CategoryTreeProps {
  kind: EntryKind;
  value: string[];
  onChange: (ids: string[]) => void;
  /**
   * 'filter': checking a value implies its descendants (shown checked and locked).
   * 'pick': independent selection (assigning categories to an entry).
   */
  mode: 'filter' | 'pick';
  searchable?: boolean;
  /** Which facets start expanded. Facets holding a selection are always expanded. */
  defaultExpanded?: 'first' | 'all' | 'none';
  /** Only render these facets (root ids). */
  facetIds?: string[];
  className?: string;
  /** Text when the kind has no categories. */
  emptyText?: string;
}

function collectIds(node: CategoryNode, out: string[] = []): string[] {
  for (const c of node.children) {
    out.push(c.id);
    collectIds(c, out);
  }
  return out;
}

/** Facet trees with checkboxes (sidebar filters and the entry editor's category picker). */
export function CategoryTree({
  kind,
  value,
  onChange,
  mode,
  searchable = false,
  defaultExpanded = 'first',
  facetIds,
  className,
  emptyText = 'No hay categorías para este tipo.',
}: CategoryTreeProps) {
  const { tree, byId, loading, loaded } = useCategories(kind);
  const facets = useMemo(() => (facetIds ? tree.filter((f) => facetIds.includes(f.id)) : tree), [tree, facetIds]);
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(value), [value]);

  // Descendant ids per node (for indeterminate state and cleanup on check).
  const descendants = useMemo(() => {
    const map = new Map<string, string[]>();
    const visit = (n: CategoryNode) => {
      map.set(n.id, collectIds(n));
      n.children.forEach(visit);
    };
    facets.forEach(visit);
    return map;
  }, [facets]);

  const ancestorsOf = (id: string): string[] => {
    const out: string[] = [];
    const guard = new Set<string>();
    let cur = byId[id]?.parentId ?? null;
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      out.push(cur);
      cur = byId[cur]?.parentId ?? null;
    }
    return out;
  };

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const [initialized, setInitialized] = useState(false);
  if (!initialized && facets.length > 0) {
    // First render with data: expand defaults plus every ancestor of a selected value.
    const next = new Set<string>();
    if (defaultExpanded === 'all') facets.forEach((f) => next.add(f.id));
    else if (defaultExpanded === 'first' && facets[0]) next.add(facets[0].id);
    for (const id of value) for (const a of ancestorsOf(id)) next.add(a);
    setExpanded(next);
    setInitialized(true);
  }

  const query = normalizeText(search);
  const matches = useMemo(() => {
    if (!query) return null;
    const keep = new Set<string>();
    const visit = (n: CategoryNode, trail: string[]): boolean => {
      const self = normalizeText(n.name).includes(query);
      let child = false;
      for (const c of n.children) if (visit(c, [...trail, n.id])) child = true;
      if (self || child) {
        keep.add(n.id);
        trail.forEach((t) => keep.add(t));
        if (self) collectIds(n).forEach((d) => keep.add(d));
        return true;
      }
      return false;
    };
    facets.forEach((f) => visit(f, []));
    return keep;
  }, [query, facets]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const impliedBy = (id: string): string | null => {
    if (mode !== 'filter') return null;
    for (const a of ancestorsOf(id)) if (selected.has(a)) return a;
    return null;
  };

  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (mode === 'filter') {
      const desc = new Set(descendants.get(id) ?? []);
      onChange([...value.filter((v) => !desc.has(v)), id]);
    } else {
      onChange([...value, id]);
    }
  };

  const clearFacet = (facet: CategoryNode) => {
    const ids = new Set([facet.id, ...(descendants.get(facet.id) ?? [])]);
    onChange(value.filter((v) => !ids.has(v)));
  };

  if (!loaded && loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (facets.length === 0) {
    return (
      <p className="flex items-center gap-2 py-2 text-xs text-parchment-400">
        <FolderTree className="h-3.5 w-3.5 shrink-0" />
        {emptyText}
      </p>
    );
  }

  const renderNode = (node: CategoryNode, depth: number) => {
    if (matches && !matches.has(node.id)) return null;
    const hasKids = node.children.length > 0;
    const open = matches ? true : expanded.has(node.id);
    const implied = impliedBy(node.id);
    const checked = selected.has(node.id) || implied !== null;
    const desc = descendants.get(node.id) ?? [];
    const partial = !checked && desc.some((d) => selected.has(d));
    return (
      <li key={node.id}>
        <div
          className={clsx(
            'group flex items-center gap-1 rounded-md py-0.5 pr-1 transition hover:bg-ink-800/80',
            checked && !implied && 'bg-gold-500/[0.07]',
          )}
          style={{ paddingLeft: depth * 14 }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node.id)}
              aria-label={open ? `Contraer ${node.name}` : `Expandir ${node.name}`}
              aria-expanded={open}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100"
            >
              <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <Checkbox
            size="sm"
            checked={checked}
            indeterminate={partial}
            disabled={implied !== null}
            onChange={() => toggle(node.id)}
            title={implied ? `Incluida por «${byId[implied]?.name ?? ''}»` : undefined}
            className="min-w-0 flex-1 py-0.5"
            label={
              <span className="flex min-w-0 items-center gap-1.5">
                {node.icon ? (
                  <span className="shrink-0 text-[13px] leading-none">{node.icon}</span>
                ) : node.color ? (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: node.color }} />
                ) : null}
                <span className={clsx('truncate', checked ? 'text-parchment-50' : 'text-parchment-200')}>{node.name}</span>
                {hasKids && <span className="shrink-0 text-[10px] text-parchment-500">{node.children.length}</span>}
              </span>
            }
          />
        </div>
        {hasKids && open && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {searchable && <SearchInput value={search} onChange={setSearch} size="sm" placeholder="Buscar categoría…" />}
      <div className="flex flex-col gap-1">
        {facets.map((facet) => {
          if (matches && !matches.has(facet.id)) return null;
          const open = matches ? true : expanded.has(facet.id);
          const ids = descendants.get(facet.id) ?? [];
          const count = ids.filter((id) => selected.has(id)).length + (selected.has(facet.id) ? 1 : 0);
          return (
            <section key={facet.id} className="rounded-lg border border-ink-600/60 bg-ink-950/30">
              <div className="flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() => toggleExpanded(facet.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-ink-800/70"
                >
                  <ChevronRight className={clsx('h-3.5 w-3.5 shrink-0 text-parchment-400 transition-transform', open && 'rotate-90')} />
                  {facet.icon && <span className="shrink-0 text-sm leading-none">{facet.icon}</span>}
                  <span className="truncate text-xs font-semibold uppercase tracking-wider text-parchment-200">{facet.name}</span>
                  {count > 0 && (
                    <span className="ml-auto inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gold-500/25 px-1 text-[10px] font-bold text-gold-200">
                      {count}
                    </span>
                  )}
                </button>
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => clearFacet(facet)}
                    title={`Quitar la selección de «${facet.name}»`}
                    aria-label={`Quitar la selección de ${facet.name}`}
                    className="rounded p-1 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {open && (
                <ul className="px-1 pb-1.5">
                  {facet.children.length === 0 ? (
                    <li className="px-2 py-1 text-[11px] italic text-parchment-500">Sin valores todavía</li>
                  ) : (
                    facet.children.map((c) => renderNode(c, 0))
                  )}
                </ul>
              )}
            </section>
          );
        })}
        {matches && matches.size === 0 && <p className="px-1 py-2 text-xs text-parchment-400">Ninguna categoría coincide con «{search}».</p>}
      </div>
    </div>
  );
}
