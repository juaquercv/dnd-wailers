import { useEffect, useState, type DragEvent } from 'react';
import {
  DND_ENTRY,
  DND_ITEM,
  hasDragType,
  peekEntryDrag,
  peekItemDrag,
  readEntryDrag,
  readItemDrag,
  type ItemDragPayload,
} from '../../../lib/dnd';
import { send } from './actions';

export interface ItemDropTarget {
  heroId?: string;
  tokenId?: string;
}

function sameOwner(a: ItemDragPayload['from'], b: ItemDropTarget): boolean {
  return (!!a.heroId && a.heroId === b.heroId) || (!!a.tokenId && a.tokenId === b.tokenId);
}

/** Accepts the drag in progress? (data is not readable during dragover, so peek at local drags). */
function accepts(e: DragEvent, target: ItemDropTarget): boolean {
  if (hasDragType(e, DND_ITEM)) {
    const item = peekItemDrag();
    return !item || !sameOwner(item.from, target);
  }
  if (hasDragType(e, DND_ENTRY)) {
    const entry = peekEntryDrag();
    return !entry || entry.kind === 'item';
  }
  return false;
}

/**
 * Drop zone for inventories (hero) and loot (token), DM only:
 *  - library item entry → inventory:add / loot:add
 *  - inventory/loot item from elsewhere → inventory:transfer (whole stack; Shift while dropping = 1 unit)
 */
export function useItemDropTarget(target: ItemDropTarget, enabled: boolean) {
  const [over, setOver] = useState(false);

  // A drop handled by a nested target (or a cancelled drag) never sends dragleave here.
  useEffect(() => {
    if (!over) return;
    const clear = () => setOver(false);
    window.addEventListener('drop', clear, true);
    window.addEventListener('dragend', clear, true);
    return () => {
      window.removeEventListener('drop', clear, true);
      window.removeEventListener('dragend', clear, true);
    };
  }, [over]);

  const onDragEnter = (e: DragEvent) => {
    if (!enabled || !accepts(e, target)) return;
    e.preventDefault();
    setOver(true);
  };

  const onDragOver = (e: DragEvent) => {
    if (!enabled || !accepts(e, target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = hasDragType(e, DND_ITEM) ? 'move' : 'copy';
    if (!over) setOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    if (!enabled) return;
    // Moving onto a child element also fires dragleave: ignore it.
    if (e.currentTarget instanceof Node && e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setOver(false);
  };

  const onDrop = (e: DragEvent) => {
    if (!enabled) return;
    const item = hasDragType(e, DND_ITEM) ? readItemDrag(e) : null;
    const entry = !item && hasDragType(e, DND_ENTRY) ? readEntryDrag(e) : null;
    if (!item && !entry) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    if (item) {
      if (sameOwner(item.from, target)) return;
      void send('inventory:transfer', {
        from: item.from,
        to: target.heroId ? { heroId: target.heroId } : { tokenId: target.tokenId },
        itemId: item.itemId,
        quantity: e.shiftKey ? 1 : undefined,
      });
      return;
    }
    if (entry) {
      if (entry.kind !== 'item') return;
      if (target.heroId) void send('inventory:add', { heroId: target.heroId, entryId: entry.id, quantity: 1 }, { success: `${entry.name} añadido` });
      else if (target.tokenId) void send('loot:add', { tokenId: target.tokenId, entryId: entry.id, quantity: 1 }, { success: `${entry.name} registrado como botín` });
    }
  };

  return {
    over: enabled && over,
    dropProps: enabled ? { onDragEnter, onDragOver, onDragLeave, onDrop } : {},
  };
}
