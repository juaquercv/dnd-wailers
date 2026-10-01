import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Copy, Trash2 } from 'lucide-react';
import type { FogRegion, LightSource, SceneElement, Wall, ZoneLevel } from '@wailers/shared';
import { IconButton } from '../../../../components/ui';
import { useEditorStore, type SelectionItem } from '../../editorStore';

export type ResolvedItem =
  | { kind: 'element'; id: string; element: SceneElement }
  | { kind: 'wall'; id: string; wall: Wall }
  | { kind: 'light'; id: string; light: LightSource }
  | { kind: 'fog'; id: string; fog: FogRegion };

/** Maps selection ids to the actual objects of the level (missing ones are dropped). */
export function resolveSelection(level: ZoneLevel, selection: SelectionItem[]): ResolvedItem[] {
  const out: ResolvedItem[] = [];
  for (const item of selection) {
    if (item.kind === 'element') {
      const element = level.elements.find((e) => e.id === item.id);
      if (element) out.push({ kind: 'element', id: item.id, element });
    } else if (item.kind === 'wall') {
      const wall = level.walls.find((w) => w.id === item.id);
      if (wall) out.push({ kind: 'wall', id: item.id, wall });
    } else if (item.kind === 'light') {
      const light = level.lights.find((l) => l.id === item.id);
      if (light) out.push({ kind: 'light', id: item.id, light });
    } else {
      const fog = level.fogRegions.find((f) => f.id === item.id);
      if (fog) out.push({ kind: 'fog', id: item.id, fog });
    }
  }
  return out;
}

/** Coalesced history key for typing into one field of one object. */
export function fieldKey(id: string, field: string): { coalesceKey: string } {
  return { coalesceKey: `prop:${id}:${field}` };
}

export interface PropertyHeaderProps {
  icon: LucideIcon;
  kindLabel: string;
  title: ReactNode;
  /** Extra badges under the title. */
  meta?: ReactNode;
  onDuplicate?: () => void;
  onDelete: () => void;
}

/** Card heading the properties of the selected object, with duplicate/delete actions. */
export function PropertyHeader({ icon: Icon, kindLabel, title, meta, onDuplicate, onDelete }: PropertyHeaderProps) {
  return (
    <div className="flex items-start gap-2.5 border-b border-ink-700/80 bg-gradient-to-b from-gold-500/[0.07] to-transparent px-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-700/50 bg-gold-500/10 text-gold-300">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400/90">{kindLabel}</div>
        <div className="truncate text-sm font-semibold text-parchment-50">{title}</div>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-1">{meta}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {onDuplicate && <IconButton icon={<Copy />} title="Duplicar (Ctrl+D)" size="sm" onClick={onDuplicate} />}
        <IconButton icon={<Trash2 />} title="Eliminar (Supr)" size="sm" variant="danger" onClick={onDelete} />
      </div>
    </div>
  );
}

/** Updates one wall / light / fog region of the current level. */
export function useLevelObjectUpdaters() {
  const updateLevel = useEditorStore((s) => s.updateLevel);
  return {
    updateWall: (id: string, patch: Partial<Wall>, field?: string) =>
      updateLevel(
        (level) => {
          const i = level.walls.findIndex((w) => w.id === id);
          if (i >= 0) level.walls[i] = { ...level.walls[i]!, ...patch };
        },
        field ? fieldKey(id, field) : undefined,
      ),
    updateLight: (id: string, patch: Partial<LightSource>, field?: string) =>
      updateLevel(
        (level) => {
          const i = level.lights.findIndex((l) => l.id === id);
          if (i >= 0) level.lights[i] = { ...level.lights[i]!, ...patch };
        },
        field ? fieldKey(id, field) : undefined,
      ),
    updateFog: (id: string, patch: Partial<FogRegion>, field?: string) =>
      updateLevel(
        (level) => {
          const i = level.fogRegions.findIndex((f) => f.id === id);
          if (i >= 0) level.fogRegions[i] = { ...level.fogRegions[i]!, ...patch };
        },
        field ? fieldKey(id, field) : undefined,
      ),
  };
}

/** Deletes exactly the given selection items (keeps the rest of the selection untouched). */
export function deleteItems(items: SelectionItem[]): void {
  const s = useEditorStore.getState();
  s.setSelection(items);
  s.deleteSelection();
}

/** Total length of a polyline. */
export function polylineLength(points: number[]): number {
  let total = 0;
  for (let i = 2; i + 1 < points.length; i += 2) {
    total += Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!);
  }
  return total;
}
