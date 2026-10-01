import type { EntryKind } from '@wailers/shared';
import { ENTRY_KINDS } from '@wailers/shared';

/** HTML5 drag & drop data types shared across features. */
export const DND_ENTRY = 'application/x-wailers-entry';
export const DND_ITEM = 'application/x-wailers-item';

export type DragDataType = typeof DND_ENTRY | typeof DND_ITEM;

/** Library entry being dragged (library browser → map, inventory, turn order…). */
export interface EntryDragPayload {
  id: string;
  kind: EntryKind;
  name: string;
  imageUrl: string | null;
}

/** Inventory / loot item being dragged between heroes and tokens. */
export interface ItemDragPayload {
  itemId: string;
  from: { heroId?: string; tokenId?: string };
}

/** Anything carrying a DataTransfer: native DragEvent or React.DragEvent. */
export interface DragLike {
  dataTransfer: DataTransfer | null;
}

interface ActiveDrag {
  type: DragDataType;
  payload: EntryDragPayload | ItemDragPayload;
}

/** Data is not readable during dragover, so the current payload is mirrored here for previews. */
let activeDrag: ActiveDrag | null = null;
let clearBound = false;

function bindClear(): void {
  if (clearBound || typeof window === 'undefined') return;
  clearBound = true;
  const clear = () => {
    activeDrag = null;
  };
  window.addEventListener('dragend', clear, true);
  window.addEventListener('drop', () => setTimeout(clear, 0), true);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isEntryKind(v: unknown): v is EntryKind {
  return typeof v === 'string' && (ENTRY_KINDS as readonly string[]).includes(v);
}

function toEntryPayload(v: unknown): EntryDragPayload | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string' || !isEntryKind(v.kind) || typeof v.name !== 'string') return null;
  return { id: v.id, kind: v.kind, name: v.name, imageUrl: typeof v.imageUrl === 'string' ? v.imageUrl : null };
}

function toItemPayload(v: unknown): ItemDragPayload | null {
  if (!isRecord(v) || typeof v.itemId !== 'string' || !isRecord(v.from)) return null;
  const from: ItemDragPayload['from'] = {};
  if (typeof v.from.heroId === 'string') from.heroId = v.from.heroId;
  if (typeof v.from.tokenId === 'string') from.tokenId = v.from.tokenId;
  return { itemId: v.itemId, from };
}

/** Start dragging a library entry. Also sets text/plain so external targets get the name. */
export function setEntryDrag(e: DragLike, payload: EntryDragPayload): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(DND_ENTRY, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', payload.name);
  e.dataTransfer.effectAllowed = 'copyMove';
  bindClear();
  activeDrag = { type: DND_ENTRY, payload };
}

export function readEntryDrag(e: DragLike): EntryDragPayload | null {
  const raw = e.dataTransfer?.getData(DND_ENTRY);
  if (raw) return toEntryPayload(parse(raw));
  return activeDrag?.type === DND_ENTRY ? (activeDrag.payload as EntryDragPayload) : null;
}

/** Start dragging an inventory/loot item. */
export function setItemDrag(e: DragLike, payload: ItemDragPayload): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(DND_ITEM, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', payload.itemId);
  e.dataTransfer.effectAllowed = 'move';
  bindClear();
  activeDrag = { type: DND_ITEM, payload };
}

export function readItemDrag(e: DragLike): ItemDragPayload | null {
  const raw = e.dataTransfer?.getData(DND_ITEM);
  if (raw) return toItemPayload(parse(raw));
  return activeDrag?.type === DND_ITEM ? (activeDrag.payload as ItemDragPayload) : null;
}

/** True while dragging data of `type` (usable in dragenter/dragover, where data is not readable). */
export function hasDragType(e: DragLike, type: string): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(type);
}

/** Payload of the drag in progress started inside this window (null for external drags). */
export function peekEntryDrag(): EntryDragPayload | null {
  return activeDrag?.type === DND_ENTRY ? (activeDrag.payload as EntryDragPayload) : null;
}

export function peekItemDrag(): ItemDragPayload | null {
  return activeDrag?.type === DND_ITEM ? (activeDrag.payload as ItemDragPayload) : null;
}
