import type { LayerId, ZoneLevel } from '@wailers/shared';
import { isAnyModalOpen, toast } from '../../components/ui';
import { useHotkeys, type HotkeyHandler } from '../../lib/hotkeys';
import { useEditorStore, type SelectionItem } from './editorStore';
import { currentSaveError, hasSaveError, hasUnsavedWork, retrySave } from './shell/campaignSave';
import { EDITOR_TOOLS } from './shell/tools';

export interface EditorHotkeysOptions {
  /** Default true. Map shortcuts (tools, delete, nudge, undo/redo) are meant for the zone editor. */
  enabled?: boolean;
}

/**
 * Wraps a handler so it stays quiet when another component already handled the key
 * (canvas, dnd-kit keyboard sorting, popovers call preventDefault) or a modal is open.
 * The handler returns false when it did nothing, so the browser default is kept.
 */
function guarded(run: (e: KeyboardEvent) => boolean | void): HotkeyHandler {
  return (e) => {
    if (e.defaultPrevented || isAnyModalOpen()) return;
    if (run(e) === false) return;
    e.preventDefault();
  };
}

/** Moves every selected (unlocked) element, wall, light and fog region by (dx, dy). */
function nudgeSelection(dx: number, dy: number): boolean {
  const s = useEditorStore.getState();
  if (s.selection.length === 0 || !s.currentZoneId || !s.currentLevelId) return false;
  const ids = {
    element: new Set<string>(),
    wall: new Set<string>(),
    light: new Set<string>(),
    fog: new Set<string>(),
  };
  for (const item of s.selection) ids[item.kind].add(item.id);
  const locked = s.layerLocked;
  const shift = (points: number[]) => points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
  const key = s.selection
    .map((i) => i.id)
    .sort()
    .join(',');
  s.updateLevel(
    (level) => {
      for (const el of level.elements) {
        if (!ids.element.has(el.id) || el.locked || locked[el.layer]) continue;
        el.x += dx;
        el.y += dy;
      }
      if (!locked.walls) {
        for (const w of level.walls) if (ids.wall.has(w.id)) w.points = shift(w.points);
      }
      if (!locked.lighting) {
        for (const l of level.lights) {
          if (!ids.light.has(l.id)) continue;
          l.x += dx;
          l.y += dy;
        }
      }
      if (!locked.fog) {
        for (const f of level.fogRegions) if (ids.fog.has(f.id)) f.points = shift(f.points);
      }
    },
    { coalesceKey: `nudge:${key}` },
  );
  return true;
}

function currentLevel(): ZoneLevel | null {
  const s = useEditorStore.getState();
  const zone = s.zones.find((z) => z.id === s.currentZoneId);
  return zone?.levels.find((l) => l.id === s.currentLevelId) ?? zone?.levels[0] ?? null;
}

function currentGridSize(): number {
  return Math.max(1, Math.round(currentLevel()?.grid.size ?? 70));
}

/** Selects everything that can be picked on the current level (unlocked, on visible and unlocked layers). */
function selectAll(): boolean {
  const s = useEditorStore.getState();
  const level = currentLevel();
  if (!level) return false;
  const editable = (layer: LayerId) => s.layerVisible[layer] && !s.layerLocked[layer];
  const items: SelectionItem[] = [
    ...level.elements.filter((el) => !el.locked && editable(el.layer)).map((el) => ({ kind: 'element' as const, id: el.id })),
    ...(editable('walls') ? level.walls.map((w) => ({ kind: 'wall' as const, id: w.id })) : []),
    ...(editable('lighting') ? level.lights.map((l) => ({ kind: 'light' as const, id: l.id })) : []),
    ...(editable('fog') ? level.fogRegions.map((f) => ({ kind: 'fog' as const, id: f.id })) : []),
  ];
  if (s.tool !== 'select') s.setTool('select');
  s.setSelection(items);
  if (items.length === 0) toast.info('No hay nada que seleccionar en este nivel');
  return true;
}

/**
 * Deletes the selection except locked elements and objects on locked layers (those stay selected).
 * Returns false when nothing was selected, so the key keeps its default behavior.
 */
function deleteUnlockedSelection(): boolean {
  const s = useEditorStore.getState();
  if (s.selection.length === 0) return false;
  const level = currentLevel();
  if (!level) return false;
  const locked = s.layerLocked;
  const isProtected = (item: SelectionItem): boolean => {
    switch (item.kind) {
      case 'element': {
        const el = level.elements.find((e) => e.id === item.id);
        return !!el && (el.locked || locked[el.layer]);
      }
      case 'wall':
        return locked.walls;
      case 'light':
        return locked.lighting;
      case 'fog':
        return locked.fog;
    }
  };
  const keep = s.selection.filter(isProtected);
  const remove = s.selection.filter((item) => !isProtected(item));
  if (remove.length === 0) {
    toast.warning(keep.length === 1 ? 'La selección está bloqueada' : 'Todo lo seleccionado está bloqueado', {
      description: 'Desbloquea el elemento o su capa para poder borrarlo.',
    });
    return true;
  }
  s.setSelection(remove);
  s.deleteSelection();
  if (keep.length > 0) {
    s.setSelection(keep);
    toast.info(keep.length === 1 ? 'Un objeto bloqueado no se ha borrado' : `${keep.length} objetos bloqueados no se han borrado`);
  }
  return true;
}

const toolBindings: Record<string, HotkeyHandler> = Object.fromEntries(
  EDITOR_TOOLS.map((t) => [
    t.key,
    guarded(() => {
      useEditorStore.getState().setTool(t.id);
    }),
  ]),
);

function nudge(dirX: -1 | 0 | 1, dirY: -1 | 0 | 1): HotkeyHandler {
  return guarded((e) => {
    const step = e.shiftKey ? currentGridSize() : 1;
    return nudgeSelection(dirX * step, dirY * step);
  });
}

const mapBindings: Record<string, HotkeyHandler> = {
  'mod+shift+z, mod+y': guarded(() => useEditorStore.getState().redo()),
  'mod+z': guarded(() => useEditorStore.getState().undo()),
  'mod+d': guarded(() => useEditorStore.getState().duplicateSelection()),
  'mod+a': guarded(() => selectAll()),
  'delete, backspace': guarded(() => deleteUnlockedSelection()),
  escape: guarded(() => {
    const s = useEditorStore.getState();
    if (s.tool === 'select' && s.selection.length === 0) return false;
    s.setTool('select');
    s.setSelection([]);
  }),
  'arrowup, shift+arrowup': nudge(0, -1),
  'arrowdown, shift+arrowdown': nudge(0, 1),
  'arrowleft, shift+arrowleft': nudge(-1, 0),
  'arrowright, shift+arrowright': nudge(1, 0),
  ...toolBindings,
};

const saveBindings: Record<string, HotkeyHandler> = {
  'mod+s': (e) => {
    // Always swallow Ctrl+S (never the browser "save page" dialog), even while typing.
    e.preventDefault();
    if (isAnyModalOpen()) return;
    const failed = () => toast.error('No se pudieron guardar los cambios', { description: currentSaveError() ?? undefined });
    if (hasSaveError()) {
      // Same as "Reintentar": zones and the campaign fields kept from a failed save.
      void retrySave().then((ok) => (ok ? toast.success('Cambios guardados') : failed()));
      return;
    }
    const nothingPending = !hasUnsavedWork();
    void useEditorStore
      .getState()
      .saveNow()
      .then(() => {
        if (hasSaveError()) failed();
        else if (nothingPending) toast.success('Todo está guardado', { duration: 1800 });
      });
  },
};

/**
 * Editor shortcuts: Ctrl+Z / Ctrl+Mayús+Z / Ctrl+Y, Supr/⌫, Ctrl+D, Ctrl+A, Ctrl+S, tool letters
 * (V H B L R E T M W I F D N S X), Esc (selection tool + clear selection) and arrow-key nudging
 * (1 px, Mayús: one grid cell). Letters and arrows never fire while typing in a field.
 */
export function useEditorHotkeys(opts: EditorHotkeysOptions = {}): void {
  const enabled = opts.enabled ?? true;
  useHotkeys(mapBindings, { enabled, preventDefault: false });
  useHotkeys(saveBindings, { enabled: true, allowInInputs: true, preventDefault: false });
}
