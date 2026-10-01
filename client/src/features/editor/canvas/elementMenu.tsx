import { BoxSelect, BringToFront, Copy, Eye, EyeOff, Flag, Lock, LockOpen, Maximize, Pencil, SendToBack, SquareX, Trash2 } from 'lucide-react';
import type { SceneElement, SceneElementType } from '@wailers/shared';
import type { ContextMenuItem } from '../../../components/ui/ContextMenu';
import { formatHotkey } from '../../../lib/hotkeys';

export const ELEMENT_TYPE_LABELS: Record<SceneElementType, string> = {
  image: 'Imagen',
  shape: 'Forma',
  path: 'Trazo',
  text: 'Texto',
  marker: 'Marcador',
  token: 'Ficha',
  transition: 'Transición',
  note: 'Nota del DM',
};

/** Tokens hide through startHidden (the live token starts hidden); other elements through hidden. */
export function isHiddenFromPlayers(el: SceneElement): boolean {
  return el.type === 'token' ? el.startHidden || el.hidden : el.hidden;
}

export function hiddenPatch(el: SceneElement, hidden: boolean): Partial<SceneElement> {
  if (el.type === 'token') return { startHidden: hidden, hidden: false } as Partial<SceneElement>;
  return { hidden };
}

export function isInlineEditable(el: SceneElement): boolean {
  return el.type === 'text' || el.type === 'note' || el.type === 'marker';
}

export interface ElementMenuActions {
  edit?: () => void;
  setHidden: (hidden: boolean) => void;
  setLocked: (locked: boolean) => void;
  bringToFront: () => void;
  sendToBack: () => void;
  duplicate: () => void;
  remove: () => void;
}

/** Right-click menu for one or several scene elements. */
export function buildElementMenu(targets: SceneElement[], actions: ElementMenuActions): ContextMenuItem[] {
  const first = targets[0];
  if (!first) return [];
  const title = targets.length === 1 ? first.name.trim() || ELEMENT_TYPE_LABELS[first.type] : `${targets.length} elementos`;
  const allHidden = targets.every(isHiddenFromPlayers);
  const allLocked = targets.every((t) => t.locked);
  const onlyNotes = targets.every((t) => t.type === 'note');
  const items: ContextMenuItem[] = [{ heading: true, label: title }];
  if (actions.edit) {
    items.push({ label: first.type === 'marker' ? 'Editar etiqueta' : 'Editar texto', icon: <Pencil />, onClick: actions.edit, shortcut: 'Doble clic' });
  }
  if (!onlyNotes) {
    items.push({
      label: allHidden ? 'Mostrar a jugadores' : 'Ocultar a jugadores',
      icon: allHidden ? <Eye /> : <EyeOff />,
      onClick: () => actions.setHidden(!allHidden),
    });
  }
  items.push(
    {
      label: allLocked ? 'Desbloquear' : 'Bloquear',
      icon: allLocked ? <LockOpen /> : <Lock />,
      onClick: () => actions.setLocked(!allLocked),
    },
    { separator: true },
    { label: 'Traer al frente', icon: <BringToFront />, onClick: actions.bringToFront },
    { label: 'Enviar al fondo', icon: <SendToBack />, onClick: actions.sendToBack },
    { separator: true },
    { label: 'Duplicar', icon: <Copy />, onClick: actions.duplicate, shortcut: formatHotkey('mod+d') },
    { label: 'Eliminar', icon: <Trash2 />, onClick: actions.remove, danger: true, shortcut: formatHotkey('delete') },
  );
  return items;
}

export interface CanvasMenuActions {
  fit: () => void;
  selectAll: (() => void) | null;
  clearSelection: (() => void) | null;
  setSpawnHere: (() => void) | null;
}

/** Right-click menu on an empty part of the map. */
export function buildCanvasMenu(actions: CanvasMenuActions): ContextMenuItem[] {
  const items: ContextMenuItem[] = [{ label: 'Ajustar a la vista', icon: <Maximize />, onClick: actions.fit }];
  if (actions.selectAll) items.push({ label: 'Seleccionar todo', icon: <BoxSelect />, onClick: actions.selectAll });
  if (actions.clearSelection) items.push({ label: 'Quitar selección', icon: <SquareX />, onClick: actions.clearSelection, shortcut: 'Esc' });
  if (actions.setSpawnHere) {
    items.push({ separator: true }, { label: 'Fijar punto de aparición aquí', icon: <Flag />, onClick: actions.setSpawnHere });
  }
  return items;
}
