import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, TriangleAlert } from 'lucide-react';
import { normalizeText, type CategoryDTO, type RuleSystem } from '@wailers/shared';
import { api } from '../../api/http';
import { Badge } from '../../components/ui/Badge';
import { useCategories } from '../../stores/categories';
import { Portrait } from './lobbyUi';

/** Minimal hero shape shared by library heroes (LibraryEntry<'hero'>) and live hero sheets (HeroSheet). */
export interface HeroLike {
  id: string;
  name: string;
  imageUrl: string | null;
  level: number | null;
  categoryIds: string[];
}

export interface HeroChip {
  id: string;
  /** "Mago · Evocación" (facet excluded). */
  label: string;
  facet: string;
  color: string | null;
  icon: string | null;
}

/** Facets that read as "race" or "class" are shown first; the rest follow their sort order. */
function facetPriority(facet: CategoryDTO): number {
  const n = normalizeText(facet.name);
  if (/^(raza|especie|ascendencia|linaje|race|species)/.test(n)) return 0;
  if (/^(clase|profesion|oficio|class)/.test(n)) return 1;
  return 2;
}

function chainOf(id: string, byId: Record<string, CategoryDTO>): CategoryDTO[] {
  const chain: CategoryDTO[] = [];
  const seen = new Set<string>();
  let cur: CategoryDTO | undefined = byId[id];
  while (cur && !seen.has(cur.id)) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? byId[cur.parentId] : undefined;
  }
  return chain;
}

/** Category chips of a hero, one per facet (deepest value wins), race/class first. */
export function heroChips(categoryIds: string[], byId: Record<string, CategoryDTO>): HeroChip[] {
  const perFacet = new Map<string, { facet: CategoryDTO; chain: CategoryDTO[] }>();
  for (const id of categoryIds) {
    const chain = chainOf(id, byId);
    if (chain.length < 2) continue;
    const facet = chain[0]!;
    const prev = perFacet.get(facet.id);
    if (!prev || chain.length > prev.chain.length) perFacet.set(facet.id, { facet, chain });
  }
  return [...perFacet.values()]
    .sort((a, b) => facetPriority(a.facet) - facetPriority(b.facet) || a.facet.sortOrder - b.facet.sortOrder)
    .map(({ facet, chain }) => {
      const values = chain.slice(1);
      const deepestFirst = [...values].reverse();
      return {
        id: values[values.length - 1]!.id,
        label: values.map((c) => c.name).join(' · '),
        facet: facet.name,
        color: deepestFirst.find((c) => c.color)?.color ?? facet.color ?? null,
        icon: deepestFirst.find((c) => c.icon)?.icon ?? null,
      };
    });
}

/** Soft (non-blocking) notes when a hero does not match the campaign's hero creation rules. */
export function heroRuleWarnings(hero: HeroLike, rules: RuleSystem | null | undefined, byId: Record<string, CategoryDTO>): string[] {
  if (!rules) return [];
  const out: string[] = [];
  const hc = rules.heroCreation;
  if (hero.level !== null && hc.maxLevel > 0 && hero.level > hc.maxLevel) out.push(`Supera el nivel máximo de la campaña (${hc.maxLevel})`);
  const check = (allowed: string[], label: string) => {
    if (allowed.length === 0) return;
    const facetIds = new Set(allowed.map((id) => chainOf(id, byId)[0]?.id).filter((id): id is string => !!id));
    const heroChains = hero.categoryIds.map((id) => chainOf(id, byId)).filter((c) => c.length > 1 && facetIds.has(c[0]!.id));
    if (heroChains.length === 0) return;
    const allowedSet = new Set(allowed);
    const ok = heroChains.some((chain) => chain.some((c) => allowedSet.has(c.id)));
    if (!ok) out.push(`${label} no permitida en esta campaña`);
  };
  check(hc.allowedRaceIds, 'Raza');
  check(hc.allowedClassIds, 'Clase');
  return out;
}

const EMPTY_IDS: string[] = [];
/** Library categories of heroes whose live sheet arrived without them (heroId -> category ids). */
const libraryCategoryCache = new Map<string, Promise<string[]>>();

/**
 * Category ids of a hero. Live sheets may come without categories: then the library entry is
 * asked once (cached per hero) so race/class chips still show.
 */
export function useResolvedCategoryIds(heroId: string | null | undefined, categoryIds: string[] | null | undefined): string[] {
  const own = categoryIds ?? EMPTY_IDS;
  const needsLookup = !!heroId && own.length === 0;
  const [fetched, setFetched] = useState<{ heroId: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (!needsLookup || !heroId) return;
    let cancelled = false;
    let pending = libraryCategoryCache.get(heroId);
    if (!pending) {
      pending = api.library
        .get<'hero'>(heroId)
        .then((entry) => entry.categoryIds)
        .catch(() => {
          libraryCategoryCache.delete(heroId);
          return EMPTY_IDS;
        });
      libraryCategoryCache.set(heroId, pending);
    }
    void pending.then((ids) => {
      if (!cancelled) setFetched({ heroId, ids });
    });
    return () => {
      cancelled = true;
    };
  }, [needsLookup, heroId]);

  if (!needsLookup) return own;
  return fetched && fetched.heroId === heroId ? fetched.ids : own;
}

export function useHeroChips(categoryIds: string[]): HeroChip[] {
  const { byId } = useCategories('hero');
  return useMemo(() => heroChips(categoryIds, byId), [categoryIds, byId]);
}

export function ChipList({ chips, max = 2, size = 'xs' }: { chips: HeroChip[]; max?: number; size?: 'xs' | 'sm' }) {
  if (chips.length === 0) return null;
  const shown = chips.slice(0, max);
  const rest = chips.length - shown.length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((c) => (
        <Badge key={c.id} size={size} color={c.color} title={`${c.facet}: ${c.label}`} className="max-w-[11rem]">
          {c.icon ? `${c.icon} ${c.label}` : c.label}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge size={size} tone="outline" title={chips.slice(max).map((c) => `${c.facet}: ${c.label}`).join('\n')}>
          +{rest}
        </Badge>
      )}
    </div>
  );
}

export interface HeroCardProps {
  hero: HeroLike;
  /** 'picker': big selectable card. 'compact': inline summary (player grid). */
  variant?: 'picker' | 'compact';
  selected?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  warnings?: string[];
  /** Extra content under the chips (picker). */
  footer?: ReactNode;
  className?: string;
  /** Tint for the initials fallback. */
  color?: string | null;
}

/** Hero portrait + name + level + race/class chips. */
export function HeroCard({ hero, variant = 'picker', selected = false, busy = false, disabled = false, onClick, warnings = [], footer, className, color }: HeroCardProps) {
  const categoryIds = useResolvedCategoryIds(hero.id, hero.categoryIds);
  const chips = useHeroChips(categoryIds);

  if (variant === 'compact') {
    return (
      <div className={clsx('flex min-w-0 items-center gap-3', className)}>
        <Portrait name={hero.name} imageUrl={hero.imageUrl} color={color} size={52} glow={selected} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-sm font-semibold text-parchment-50">{hero.name}</span>
            {hero.level !== null && (
              <Badge tone="gold" size="xs" className="shrink-0">
                Nv. {hero.level}
              </Badge>
            )}
          </div>
          <div className="mt-1">
            <ChipList chips={chips} max={2} />
          </div>
          {warnings.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-gold-300" title={warnings.join('\n')}>
              <TriangleAlert className="h-3 w-3 shrink-0" />
              <span className="truncate">{warnings[0]}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={selected}
      className={clsx(
        'group relative flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl border p-3 text-left transition duration-200',
        selected
          ? 'border-gold-400/80 bg-gradient-to-br from-gold-500/15 via-ink-800/90 to-ink-900 shadow-glow-gold'
          : 'border-ink-600 bg-ink-800/70 hover:-translate-y-0.5 hover:border-gold-700/80 hover:bg-ink-800',
        !interactive && !selected && 'cursor-default opacity-70 hover:translate-y-0',
        busy && 'animate-pulse',
        className,
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-6 w-6 animate-pop items-center justify-center rounded-full bg-gold-sheen text-ink-950 shadow-glow-gold">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      )}
      <Portrait name={hero.name} imageUrl={hero.imageUrl} color={color} size={64} glow={selected} />
      <div className="min-w-0 flex-1 pr-6">
        <div className={clsx('truncate font-display text-base font-semibold', selected ? 'text-gold-200' : 'text-parchment-50')}>{hero.name}</div>
        <div className="text-xs text-parchment-300">{hero.level !== null ? `Nivel ${hero.level}` : 'Nivel —'}</div>
        <div className="mt-1.5">
          <ChipList chips={chips} max={3} />
        </div>
        {warnings.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {warnings.map((w) => (
              <li key={w} className="flex items-center gap-1 text-[11px] text-gold-300">
                <TriangleAlert className="h-3 w-3 shrink-0" />
                <span className="truncate">{w}</span>
              </li>
            ))}
          </ul>
        )}
        {footer}
      </div>
    </button>
  );
}
