import { isAnyModalOpen, toast } from '../../components/ui';
import { useHotkeys, type HotkeyHandler } from '../../lib/hotkeys';
import { useEditorStore } from './editorStore';
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

function currentGridSize(): number {
  const s = useEditorStore.getState();
  const zone = s.zones.find((z) => z.id === s.currentZoneId);
  const level = zone?.levels.find((l) => l.id === s.currentLevelId) ?? zone?.levels[0];
  return Math.max(1, Math.round(level?.grid.size ?? 70));
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
  'delete, backspace': guarded(() => {
    const s = useEditorStore.getState();
    if (s.selection.length === 0) return false;
    s.deleteSelection();
  }),
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
    const s = useEditorStore.getState();
    const nothingPending = s.dirtyZoneIds.length === 0 && s.saveState === 'saved';
    void s.saveNow().then(() => {
      if (useEditorStore.getState().saveState === 'error') toast.error('No se pudieron guardar los cambios');
      else if (nothingPending) toast.success('Todo está guardado', { duration: 1800 });
    });
  },
};

/**
 * Editor shortcuts: Ctrl+Z / Ctrl+Mayús+Z / Ctrl+Y, Supr/⌫, Ctrl+D, Ctrl+S, tool letters
 * (V H B L R E T M W I F D N S X), Esc (selection tool + clear selection) and arrow-key nudging
 * (1 px, Mayús: one grid cell). Letters and arrows never fire while typing in a field.
 */
export function useEditorHotkeys(opts: EditorHotkeysOptions = {}): void {
  const enabled = opts.enabled ?? true;
  useHotkeys(mapBindings, { enabled, preventDefault: false });
  useHotkeys(saveBindings, { enabled: true, allowInInputs: true, preventDefault: false });
}
