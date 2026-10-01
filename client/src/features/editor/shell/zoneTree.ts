import type { Zone } from '@wailers/shared';
import type { SelectOption } from '../../../components/ui';

export interface ZoneNode {
  zone: Zone;
  depth: number;
  children: ZoneNode[];
}

function compareZones(a: Zone, b: Zone): number {
  return a.order - b.order || a.name.localeCompare(b.name, 'es');
}

/** True when following parentZoneId from `zone` leads back to it. */
function inParentCycle(zone: Zone, byId: Map<string, Zone>): boolean {
  const seen = new Set<string>();
  let cur = zone.parentZoneId ? byId.get(zone.parentZoneId) : undefined;
  while (cur) {
    if (cur.id === zone.id) return true;
    if (seen.has(cur.id)) return false;
    seen.add(cur.id);
    cur = cur.parentZoneId ? byId.get(cur.parentZoneId) : undefined;
  }
  return false;
}

/** Effective parent id (null for top-level zones, orphans and zones caught in a parent cycle). */
export function effectiveParentId(zone: Zone, byId: Map<string, Zone>): string | null {
  if (!zone.parentZoneId || !byId.has(zone.parentZoneId)) return null;
  return inParentCycle(zone, byId) ? null : zone.parentZoneId;
}

/** Zones as a forest: roots ordered by slide order, sub-zones nested under their parent. */
export function buildZoneTree(zones: Zone[]): ZoneNode[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const childrenOf = new Map<string | null, Zone[]>();
  for (const z of [...zones].sort(compareZones)) {
    const parent = effectiveParentId(z, byId);
    const list = childrenOf.get(parent) ?? [];
    list.push(z);
    childrenOf.set(parent, list);
  }
  const visited = new Set<string>();
  const visit = (z: Zone, depth: number): ZoneNode => {
    visited.add(z.id);
    const kids = (childrenOf.get(z.id) ?? []).filter((c) => !visited.has(c.id));
    return { zone: z, depth, children: kids.map((c) => visit(c, depth + 1)) };
  };
  return (childrenOf.get(null) ?? []).map((z) => visit(z, 0));
}

/** Depth-first list of nodes. */
export function flattenZoneTree(nodes: ZoneNode[]): ZoneNode[] {
  const out: ZoneNode[] = [];
  const walk = (list: ZoneNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Ids of a node and all its descendants, depth first. */
export function subtreeIds(node: ZoneNode): string[] {
  return flattenZoneTree([node]).map((n) => n.zone.id);
}

/** Full slide order: each top-level zone followed by its sub-zones (depth first). */
export function orderedZoneIds(roots: ZoneNode[]): string[] {
  return flattenZoneTree(roots).map((n) => n.zone.id);
}

/** Ids of every descendant of `zoneId` (not including itself). */
export function descendantIds(zones: Zone[], zoneId: string): Set<string> {
  const node = flattenZoneTree(buildZoneTree(zones)).find((n) => n.zone.id === zoneId);
  return new Set(node ? subtreeIds(node).slice(1) : []);
}

/** Top-level ancestor of a zone (itself when top-level). */
export function rootZoneOf(zones: Zone[], zoneId: string): Zone | null {
  const byId = new Map(zones.map((z) => [z.id, z]));
  let cur = byId.get(zoneId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = effectiveParentId(cur, byId);
    if (!parent) return cur;
    cur = byId.get(parent);
  }
  return cur ?? null;
}

/**
 * Select options for every zone, grouped by top-level zone (native optgroups) with sub-zones
 * indented under their parent.
 */
export function zoneSelectOptions(zones: Zone[], opts: { exclude?: Set<string> } = {}): SelectOption<string>[] {
  const options: SelectOption<string>[] = [];
  for (const root of buildZoneTree(zones)) {
    const group = root.zone.name || 'Zona sin nombre';
    for (const n of flattenZoneTree([root])) {
      if (opts.exclude?.has(n.zone.id)) continue;
      const indent = n.depth > 0 ? `${'   '.repeat(n.depth - 1)}↳ ` : '';
      options.push({ value: n.zone.id, label: `${indent}${n.zone.name || 'Zona sin nombre'}`, group });
    }
  }
  return options;
}
