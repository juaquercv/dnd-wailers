import { Castle, CornerDownRight, House, Skull, Trees, type LucideIcon } from 'lucide-react';
import { ZONE_TYPE_LABELS, type ZoneLevel, type ZoneType } from '@wailers/shared';

/** Minimal zone shape needed to build navigation trees (SessionZone and Zone both fit). */
export interface TreeZone {
  id: string;
  name: string;
  order: number;
  parentZoneId: string | null;
  zoneType: ZoneType;
  levels: ZoneLevel[];
  defaultLevelId: string;
}

export interface ZoneTreeItem<Z extends TreeZone = TreeZone> {
  zone: Z;
  depth: number;
}

export const ZONE_TYPE_ICONS: Record<ZoneType, LucideIcon> = {
  exterior: Trees,
  interior: House,
  dungeon: Skull,
  city: Castle,
  subzone: CornerDownRight,
};

export function zoneTypeLabel(type: ZoneType): string {
  return ZONE_TYPE_LABELS[type] ?? 'Zona';
}

/**
 * Zones in slide order with sub-zones right after their parent (depth-first).
 * Sub-zones whose parent is missing (e.g. filtered for a player) are shown as roots.
 */
export function zoneTree<Z extends TreeZone>(zones: Z[]): ZoneTreeItem<Z>[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const children = new Map<string, Z[]>();
  const roots: Z[] = [];
  for (const z of zones) {
    if (z.parentZoneId && z.parentZoneId !== z.id && byId.has(z.parentZoneId)) {
      const list = children.get(z.parentZoneId) ?? [];
      list.push(z);
      children.set(z.parentZoneId, list);
    } else {
      roots.push(z);
    }
  }
  const byOrder = (a: Z, b: Z) => a.order - b.order || a.name.localeCompare(b.name, 'es');
  const out: ZoneTreeItem<Z>[] = [];
  const visited = new Set<string>();
  const walk = (z: Z, depth: number) => {
    if (visited.has(z.id)) return;
    visited.add(z.id);
    out.push({ zone: z, depth });
    for (const child of (children.get(z.id) ?? []).sort(byOrder)) walk(child, depth + 1);
  };
  for (const root of roots.sort(byOrder)) walk(root, 0);
  // Cycles (defensive): anything not reached yet is appended as a root.
  for (const z of [...zones].sort(byOrder)) if (!visited.has(z.id)) walk(z, 0);
  return out;
}

/** Levels from the highest floor to the deepest basement. */
export function sortedLevels(levels: ZoneLevel[]): ZoneLevel[] {
  return [...levels].sort((a, b) => b.elevation - a.elevation || a.name.localeCompare(b.name, 'es'));
}

/** "Planta baja", "Planta 2", "Sótano 1"... when the level has no name. */
export function levelLabel(level: Pick<ZoneLevel, 'name' | 'elevation'>): string {
  const name = level.name.trim();
  if (name) return name;
  if (level.elevation === 0) return 'Planta baja';
  return level.elevation > 0 ? `Planta ${level.elevation}` : `Sótano ${Math.abs(level.elevation)}`;
}

export function findLevel(zone: TreeZone | null | undefined, levelId: string | null | undefined): ZoneLevel | null {
  if (!zone) return null;
  return zone.levels.find((l) => l.id === levelId) ?? zone.levels.find((l) => l.id === zone.defaultLevelId) ?? zone.levels[0] ?? null;
}
