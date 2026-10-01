import {
  abilityModifier,
  newId,
  normalizeText,
  type CategoryDTO,
  type CategoryNode,
  type HeroSpell,
  type LibraryEntry,
  type SpellEntry,
} from '@wailers/shared';

/** Hero spell (independent copy) from a library spell. */
export function heroSpellFromEntry(entry: LibraryEntry): HeroSpell {
  const spell = entry as SpellEntry;
  const d = spell.data;
  return {
    id: newId('hsp'),
    entryId: spell.id,
    name: spell.name,
    level: spell.level ?? 0,
    manaCost: d?.manaCost ?? 0,
    slotLevel: d?.slotLevel ?? spell.level ?? 0,
    animation: d?.animation ?? 'arcane',
    description: (d?.effect || spell.description || '').trim(),
    prepared: true,
  };
}

export type HitDie = 6 | 8 | 10 | 12;
export const HIT_DICE: HitDie[] = [6, 8, 10, 12];

const HIT_DIE_BY_CLASS: [RegExp, HitDie][] = [
  [/barbar/, 12],
  [/guerrer|paladin|explorador|guardabosques|luchador/, 10],
  [/mago|hechicer/, 6],
  [/bardo|clerig|druida|monje|picaro|brujo|artificier/, 8],
];

/** Usual hit die for a class name (classic D&D classes; d8 otherwise). The creator lets the user change it. */
export function suggestedHitDie(className: string | null | undefined): HitDie {
  const n = normalizeText(className ?? '');
  if (!n) return 8;
  for (const [re, die] of HIT_DIE_BY_CLASS) if (re.test(n)) return die;
  return 8;
}

/** Max HP suggestion: full die at level 1, average (die/2 + 1) afterwards, plus CON modifier per level. */
export function suggestedHp(hitDie: HitDie, level: number, conScore: number | null): number {
  const con = conScore === null ? 0 : abilityModifier(conScore);
  const lv = Math.max(1, Math.floor(level));
  const total = hitDie + con + (lv - 1) * (hitDie / 2 + 1 + con);
  return Math.max(lv, Math.round(total));
}

export type HeroFacetRole = 'race' | 'class' | 'subclass' | 'alignment' | 'role';

/** Detects the role of a hero facet from its (localized) name. */
export function facetRole(name: string): HeroFacetRole | null {
  const n = normalizeText(name);
  if (n.startsWith('subclase')) return 'subclass';
  if (n.startsWith('clase')) return 'class';
  if (/^(raza|especie|linaje|ascendencia|pueblo)/.test(n)) return 'race';
  if (n.startsWith('alineamiento')) return 'alignment';
  if (n.startsWith('rol')) return 'role';
  return null;
}

export interface HeroFacets {
  race: CategoryNode | null;
  class: CategoryNode | null;
  subclass: CategoryNode | null;
  alignment: CategoryNode | null;
  role: CategoryNode | null;
  others: CategoryNode[];
}

/** Splits the hero category tree into known facets; allowed ids also help locating race/class facets. */
export function splitHeroFacets(
  tree: CategoryNode[],
  facetOf: (id: string) => CategoryDTO | null,
  allowedRaceIds: string[],
  allowedClassIds: string[],
): HeroFacets {
  const out: HeroFacets = { race: null, class: null, subclass: null, alignment: null, role: null, others: [] };
  const byId = new Map(tree.map((f) => [f.id, f]));
  const raceFacetId = allowedRaceIds.map((id) => facetOf(id)?.id).find(Boolean);
  const classFacetId = allowedClassIds.map((id) => facetOf(id)?.id).find(Boolean);
  if (raceFacetId) out.race = byId.get(raceFacetId) ?? null;
  if (classFacetId) out.class = byId.get(classFacetId) ?? null;
  for (const f of tree) {
    if (f === out.race || f === out.class) continue;
    const role = facetRole(f.name);
    if (role && !out[role]) out[role] = f;
    else out.others.push(f);
  }
  return out;
}

/** Nodes of `facet` that may be chosen given an allow-list (empty = top-level values). */
export function allowedOptions(facet: CategoryNode | null, allowed: string[]): CategoryNode[] {
  if (!facet) return [];
  if (allowed.length === 0) return facet.children;
  const allowedSet = new Set(allowed);
  const out: CategoryNode[] = [];
  const visit = (n: CategoryNode, ancestorAllowed: boolean) => {
    const ok = allowedSet.has(n.id);
    if (ok && !ancestorAllowed) out.push(n);
    n.children.forEach((c) => visit(c, ancestorAllowed || ok));
  };
  facet.children.forEach((c) => visit(c, false));
  return out;
}
