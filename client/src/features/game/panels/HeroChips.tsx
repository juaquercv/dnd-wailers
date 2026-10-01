import { useMemo } from 'react';
import clsx from 'clsx';
import type { CategoryDTO } from '@wailers/shared';
import { withAlpha } from '../../../components/ui/Badge';
import { useCategories } from '../../../stores/categories';

export interface HeroChipGroup {
  facet: CategoryDTO;
  chips: { id: string; label: string; icon: string | null; color: string | null; title: string }[];
}

/**
 * Groups a hero's categories by facet (Raza, Clase, Alineamiento…). When a category and one of its
 * descendants are both present (Clase › Guerrero › Campeón) only the deepest is shown, with its path.
 */
export function useHeroChipGroups(categoryIds: string[]): HeroChipGroup[] {
  const { byId, loaded } = useCategories('hero');
  return useMemo(() => {
    if (!loaded) return [];
    const present = categoryIds.filter((id) => byId[id]);
    const pathOf = (id: string): CategoryDTO[] => {
      const chain: CategoryDTO[] = [];
      const seen = new Set<string>();
      let cur: CategoryDTO | undefined = byId[id];
      while (cur && !seen.has(cur.id)) {
        chain.unshift(cur);
        seen.add(cur.id);
        cur = cur.parentId ? byId[cur.parentId] : undefined;
      }
      return chain;
    };
    const ancestorsInUse = new Set<string>();
    for (const id of present) for (const anc of pathOf(id).slice(0, -1)) ancestorsInUse.add(anc.id);
    const groups = new Map<string, HeroChipGroup>();
    for (const id of present) {
      if (ancestorsInUse.has(id)) continue;
      const chain = pathOf(id);
      const facet = chain[0];
      if (!facet || facet.id === id) continue;
      const values = chain.slice(1);
      const top = values[0]!;
      const own = values[values.length - 1]!;
      const group = groups.get(facet.id) ?? { facet, chips: [] };
      group.chips.push({
        id,
        label: values.map((c) => c.name).join(' · '),
        icon: own.icon ?? top.icon ?? null,
        color: own.color ?? top.color ?? facet.color ?? null,
        title: `${facet.name}: ${values.map((c) => c.name).join(' › ')}`,
      });
      groups.set(facet.id, group);
    }
    return [...groups.values()].sort((a, b) => a.facet.sortOrder - b.facet.sortOrder || a.facet.name.localeCompare(b.facet.name, 'es'));
  }, [categoryIds, byId, loaded]);
}

export interface HeroChipsProps {
  categoryIds: string[];
  /** Only the first N facets (e.g. 2 → race and class in the party cards). */
  maxFacets?: number;
  size?: 'xs' | 'sm';
  className?: string;
}

/** Category chips of a hero (names come from the categories store; nothing hardcoded). */
export function HeroChips({ categoryIds, maxFacets, size = 'sm', className }: HeroChipsProps) {
  const groups = useHeroChipGroups(categoryIds);
  const shown = maxFacets !== undefined ? groups.slice(0, maxFacets) : groups;
  if (shown.length === 0) return null;
  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {shown.flatMap((g) =>
        g.chips.map((c) => {
          const color = c.color ?? '#cdb98f';
          return (
            <span
              key={c.id}
              title={c.title}
              className={clsx(
                'inline-flex max-w-full items-center gap-1 truncate rounded-full border font-medium',
                size === 'xs' ? 'px-1.5 py-0 text-[10px] leading-4' : 'px-2 py-0.5 text-[11px] leading-4',
              )}
              style={{ color, borderColor: withAlpha(color, 0.45), backgroundColor: withAlpha(color, 0.12) }}
            >
              {c.icon && <span aria-hidden>{c.icon}</span>}
              <span className="truncate">{c.label}</span>
            </span>
          );
        }),
      )}
    </div>
  );
}
