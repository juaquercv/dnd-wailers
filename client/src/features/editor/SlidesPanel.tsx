import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  Copy,
  Ellipsis,
  FilePlus2,
  Flag,
  FolderPlus,
  Layers,
  LayoutTemplate,
  PanelLeftClose,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ZONE_TYPE_LABELS, type Zone } from '@wailers/shared';
import { Button, IconButton, toast, useContextMenu, type ContextMenuItem, type MenuAnchorEvent } from '../../components/ui';
import { plural } from '../../lib/format';
import { useEditorStore } from './editorStore';
import { InlineEdit } from './shell/InlineEdit';
import { SaveTemplateModal, TemplatePickerModal } from './shell/TemplateModals';
import { useZoneActions } from './shell/zoneActions';
import { buildZoneTree, flattenZoneTree, orderedZoneIds, type ZoneNode } from './shell/zoneTree';

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

function SlideThumbnail({ zone, compact }: { zone: Zone; compact: boolean }) {
  const level = zone.levels.find((l) => l.id === zone.defaultLevelId) ?? zone.levels[0] ?? null;
  const url = level?.background.url ?? null;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const color = level?.background.color ?? '#2b2a24';

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-2 text-center"
      style={{
        backgroundColor: color,
        backgroundImage:
          'radial-gradient(ellipse at 30% 20%, rgba(243,213,138,0.16), transparent 60%), repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0 6px, transparent 6px 12px)',
      }}
    >
      <span
        className={clsx(
          'line-clamp-2 font-display font-semibold leading-tight text-parchment-100 text-shadow',
          compact ? 'text-[10px]' : 'text-xs',
        )}
      >
        {zone.name || 'Zona sin nombre'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide card
// ---------------------------------------------------------------------------

interface DragBindings {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

interface SlideCardProps {
  node: ZoneNode;
  number: string;
  current: boolean;
  dirty: boolean;
  hasSpawn: boolean;
  childCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: () => void;
  /** Opens the slide menu at the pointer, or under `anchor` when given. */
  onMenu: (e: MenuAnchorEvent, anchor?: HTMLElement) => void;
  onRename: (name: string) => void;
  drag?: DragBindings;
  dragging?: boolean;
}

function SlideCard({
  node,
  number,
  current,
  dirty,
  hasSpawn,
  childCount,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onMenu,
  onRename,
  drag,
  dragging,
}: SlideCardProps) {
  const { zone, depth } = node;
  const compact = depth > 0;
  const dndKeyDown = drag?.listeners?.onKeyDown as ((e: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  const restListeners = { ...(drag?.listeners ?? {}) };
  delete restListeners.onKeyDown;

  return (
    <div
      data-zone-id={zone.id}
      className={clsx('group/slide relative flex gap-1.5 py-1.5 pr-2', compact ? 'pl-1' : 'pl-1.5')}
      style={compact ? { paddingLeft: `${0.4 + depth * 0.9}rem` } : undefined}
      onContextMenu={(e) => onMenu(e)}
    >
      <div
        className={clsx(
          'w-6 shrink-0 pt-1 text-right font-semibold tabular-nums',
          compact ? 'text-[10px] text-parchment-400/80' : 'text-[11px]',
          current ? 'text-gold-300' : 'text-parchment-400',
        )}
      >
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <div
          {...(drag?.attributes ?? {})}
          {...restListeners}
          role="button"
          tabIndex={0}
          aria-label={`${zone.name || 'Zona sin nombre'}${current ? ' (abierta)' : ''}`}
          aria-current={current ? 'true' : undefined}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget) {
              e.preventDefault();
              onSelect();
              return;
            }
            if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && e.target === e.currentTarget) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              onMenu({ clientX: r.left + 12, clientY: r.bottom - 8 });
              return;
            }
            dndKeyDown?.(e);
          }}
          className={clsx(
            'relative block w-full overflow-hidden rounded-md border-2 bg-ink-950 outline-none transition duration-150',
            compact ? 'aspect-[16/9]' : 'aspect-[16/10]',
            current
              ? 'border-gold-400 shadow-[0_0_0_1px_rgba(233,192,99,0.35),0_0_18px_-4px_rgba(233,192,99,0.6)]'
              : 'border-ink-600 hover:border-ink-400 focus-visible:border-gold-600',
            drag && 'cursor-grab active:cursor-grabbing',
            dragging && 'opacity-80 shadow-modal',
          )}
        >
          <SlideThumbnail zone={zone} compact={compact} />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1">
            <span
              className="inline-flex items-center gap-0.5 rounded bg-black/65 px-1 text-[10px] font-semibold leading-4 text-parchment-100"
              title={plural(zone.levels.length, 'nivel', 'niveles')}
            >
              <Layers className="h-2.5 w-2.5" aria-hidden />
              {zone.levels.length}
            </span>
            {hasSpawn && (
              <span className="inline-flex items-center rounded bg-emerald-600/80 px-1 leading-4 text-parchment-50" title="Punto de aparición">
                <Flag className="h-2.5 w-2.5" aria-hidden />
              </span>
            )}
          </span>
          {dirty && (
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold-400 shadow-[0_0_6px_rgba(233,192,99,0.9)]"
              title="Cambios sin guardar"
            />
          )}
        </div>
        <div className="mt-1 flex items-center gap-0.5">
          {childCount > 0 && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={collapsed ? `Mostrar ${plural(childCount, 'sub-zona', 'sub-zonas')}` : 'Ocultar sub-zonas'}
              aria-label={collapsed ? 'Mostrar sub-zonas' : 'Ocultar sub-zonas'}
              aria-expanded={!collapsed}
              className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-50"
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={zone.name}
              onCommit={onRename}
              label="Nombre de la zona"
              trigger="dblclick"
              showIcon={false}
              className={clsx(
                '-ml-1.5 max-w-full',
                compact ? 'text-[11px]' : 'text-xs',
                current ? 'font-semibold text-gold-100' : 'text-parchment-200',
              )}
            />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e, e.currentTarget);
            }}
            title="Opciones de la zona"
            aria-label={`Opciones de ${zone.name}`}
            aria-haspopup="menu"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-parchment-400 opacity-0 transition hover:bg-ink-700 hover:text-parchment-50 focus-visible:opacity-100 group-hover/slide:opacity-100"
          >
            <Ellipsis className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-parchment-400">
          <span className="truncate">{ZONE_TYPE_LABELS[zone.zoneType] ?? zone.zoneType}</span>
          {collapsed && childCount > 0 && <span className="shrink-0 text-gold-400/80">· {plural(childCount, 'sub-zona', 'sub-zonas')}</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable top-level group (a slide and its sub-zones travel together)
// ---------------------------------------------------------------------------

interface GroupRenderProps {
  renderCard: (node: ZoneNode, number: string, drag?: DragBindings, dragging?: boolean) => ReactNode;
  renderChildren: (node: ZoneNode, number: string) => ReactNode;
}

function SortableGroup({ node, number, renderCard, renderChildren }: { node: ZoneNode; number: string } & GroupRenderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.zone.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition,
        zIndex: isDragging ? 20 : undefined,
        position: 'relative',
      }}
      className={clsx(isDragging && 'rounded-lg bg-ink-800/80')}
    >
      {renderCard(node, number, { attributes, listeners }, isDragging)}
      {renderChildren(node, number)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface SlidesPanelProps {
  /** Shows a collapse button in the header. */
  onCollapse?: () => void;
}

/** Google-Slides-like vertical list of zones with sub-zones, drag-to-reorder and per-slide menu. */
export function SlidesPanel({ onCollapse }: SlidesPanelProps) {
  const zones = useEditorStore((s) => s.zones);
  const currentZoneId = useEditorStore((s) => s.currentZoneId);
  const dirtyIds = useEditorStore((s) => s.dirtyZoneIds);
  const spawnZoneId = useEditorStore((s) => s.campaign?.spawn?.zoneId ?? null);
  const selectZone = useEditorStore((s) => s.selectZone);
  const reorderZones = useEditorStore((s) => s.reorderZones);
  const actions = useZoneActions();
  const menu = useContextMenu();

  const tree = useMemo(() => buildZoneTree(zones), [zones]);
  const nameById = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [templateZone, setTemplateZone] = useState<Zone | null>(null);
  const [picker, setPicker] = useState<{ parentZoneId: string | null } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  // Reveal the open zone: expand its collapsed ancestors and scroll it into view.
  useEffect(() => {
    if (!currentZoneId) return;
    const flat = flattenZoneTree(tree);
    const byId = new Map(flat.map((n) => [n.zone.id, n]));
    const ancestors: string[] = [];
    let cur = byId.get(currentZoneId)?.zone.parentZoneId ?? null;
    const guard = new Set<string>();
    while (cur && byId.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      ancestors.push(cur);
      cur = byId.get(cur)?.zone.parentZoneId ?? null;
    }
    if (ancestors.some((a) => collapsed.has(a))) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.delete(a);
        return next;
      });
    }
    const raf = requestAnimationFrame(() => {
      const cards = listRef.current?.querySelectorAll<HTMLElement>('[data-zone-id]') ?? [];
      const el = Array.from(cards).find((c) => c.dataset.zoneId === currentZoneId);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [currentZoneId, tree]);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const zoneMenuItems = (zone: Zone): ContextMenuItem[] => [
    { heading: true, label: zone.name || 'Zona sin nombre' },
    { label: 'Duplicar', icon: <Copy />, onClick: () => void actions.duplicate(zone) },
    {
      label: 'Añadir sub-zona',
      icon: <FolderPlus />,
      onClick: () => {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(zone.id);
          return next;
        });
        void actions.createBlank(zone.id);
      },
    },
    { label: 'Guardar como plantilla', icon: <BookMarked />, onClick: () => setTemplateZone(zone) },
    { separator: true },
    { label: 'Eliminar', icon: <Trash2 />, danger: true, onClick: () => void actions.remove(zone) },
  ];

  const openZoneMenu = (zone: Zone) => (e: MenuAnchorEvent, anchor?: HTMLElement) => {
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      menu.openAt(r.left, r.bottom + 4, zoneMenuItems(zone));
    } else {
      menu.open(e, zoneMenuItems(zone));
    }
  };

  const openNewMenu = (anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    const current = zones.find((z) => z.id === currentZoneId) ?? null;
    menu.openAt(r.left, r.bottom + 4, [
      { heading: true, label: 'Nueva zona' },
      { label: 'En blanco', icon: <FilePlus2 />, onClick: () => void actions.createBlank(null) },
      { label: 'Desde plantilla…', icon: <LayoutTemplate />, onClick: () => setPicker({ parentZoneId: null }) },
      { separator: true },
      {
        label: current ? `Sub-zona de «${current.name}»` : 'Sub-zona de la actual',
        icon: <FolderPlus />,
        disabled: !current,
        onClick: () => current && void actions.createBlank(current.id),
      },
      {
        label: 'Sub-zona desde plantilla…',
        icon: <LayoutTemplate />,
        disabled: !current,
        onClick: () => current && setPicker({ parentZoneId: current.id }),
      },
    ]);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const rootIds = tree.map((n) => n.zone.id);
    const from = rootIds.indexOf(String(active.id));
    const to = rootIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const ordered = orderedZoneIds(arrayMove(tree, from, to));
    reorderZones(ordered).catch((err: unknown) => {
      toast.fromError(err, 'No se pudo cambiar el orden de las zonas');
      void useEditorStore.getState().refreshZones();
    });
  };

  const zoneName = (id: UniqueIdentifier) => `«${nameById.get(String(id)) ?? 'zona'}»`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Has cogido la zona ${zoneName(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `La zona ${zoneName(active.id)} está sobre la posición de ${zoneName(over.id)}.` : `La zona ${zoneName(active.id)} no está sobre ninguna posición.`,
    onDragEnd: ({ active, over }) =>
      over ? `Zona ${zoneName(active.id)} colocada en la posición de ${zoneName(over.id)}.` : `Zona ${zoneName(active.id)} soltada.`,
    onDragCancel: ({ active }) => `Se ha cancelado mover la zona ${zoneName(active.id)}.`,
  };

  const renderCard = (node: ZoneNode, number: string, drag?: DragBindings, dragging?: boolean) => {
    const z = node.zone;
    const childCount = flattenZoneTree(node.children).length;
    return (
      <SlideCard
        node={node}
        number={number}
        current={z.id === currentZoneId}
        dirty={dirtyIds.includes(z.id)}
        hasSpawn={spawnZoneId === z.id}
        childCount={childCount}
        collapsed={collapsed.has(z.id)}
        onToggleCollapsed={() => toggleCollapsed(z.id)}
        onSelect={() => z.id !== currentZoneId && selectZone(z.id)}
        onMenu={openZoneMenu(z)}
        onRename={(name) => actions.rename(z, name)}
        drag={drag}
        dragging={dragging}
      />
    );
  };

  const renderChildren = (node: ZoneNode, number: string): ReactNode => {
    if (node.children.length === 0 || collapsed.has(node.zone.id)) return null;
    return (
      <div className="relative">
        <span aria-hidden className="absolute bottom-3 top-0 w-px bg-ink-600" style={{ left: `${1.15 + node.depth * 0.9}rem` }} />
        {node.children.map((child, i) => {
          const childNumber = `${number}.${i + 1}`;
          return (
            <div key={child.zone.id}>
              {renderCard(child, childNumber)}
              {renderChildren(child, childNumber)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-ink-700/80 px-3">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-300">Zonas</span>
        <span className="rounded-full bg-ink-700 px-1.5 text-[10px] font-bold leading-4 text-parchment-200">{zones.length}</span>
        <span className="flex-1" />
        {onCollapse && <IconButton icon={<PanelLeftClose />} title="Ocultar panel de zonas" size="xs" onClick={onCollapse} />}
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1.5" aria-label="Zonas de la campaña">
        {tree.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-parchment-400">Todavía no hay zonas. Crea la primera con el botón de abajo.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              announcements,
              screenReaderInstructions: {
                draggable:
                  'Para mover una zona, pulsa Espacio. Usa las flechas para cambiarla de posición, Espacio o Intro para soltarla y Escape para cancelar.',
              },
            }}
          >
            <SortableContext items={tree.map((n) => n.zone.id)} strategy={verticalListSortingStrategy}>
              {tree.map((node, i) => (
                <SortableGroup key={node.zone.id} node={node} number={String(i + 1)} renderCard={renderCard} renderChildren={renderChildren} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="shrink-0 border-t border-ink-700/80 p-2">
        <Button
          block
          variant="secondary"
          icon={<Plus />}
          iconRight={<ChevronDown />}
          onClick={(e) => openNewMenu(e.currentTarget)}
          aria-haspopup="menu"
        >
          Nueva zona
        </Button>
      </div>

      <SaveTemplateModal zone={templateZone} onClose={() => setTemplateZone(null)} />
      <TemplatePickerModal open={picker !== null} parentZoneId={picker?.parentZoneId ?? null} onClose={() => setPicker(null)} />
    </div>
  );
}
