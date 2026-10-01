import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { ArrowRightLeft, CircleCheck, Grid3x3, Info, Inbox, Plus, Scissors, TriangleAlert, WandSparkles } from 'lucide-react';
import type { Zone, ZoneNeighbors } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/toast';
import { plural } from '../../lib/format';
import { ConnectionSwatch, GridConnections } from './extras/grid/GridConnections';
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DIRECTIONS,
  adjacentPairs,
  buildLayout,
  changedUpdates,
  computeAutoNeighbors,
  directionStatus,
  placedPositions,
  posKey,
  type Direction,
  type GridLayout,
  type GridPos,
  type GridUpdate,
} from './extras/grid/gridModel';
import { ZoneGridCard, ZoneTrayItem, type DirStatus } from './extras/grid/ZoneGridCard';

export interface ZoneGridEditorProps {
  zones: Zone[];
  onApply: (updates: { id: string; gridPos: Zone['gridPos']; neighbors: ZoneNeighbors }[]) => void;
  onOpenZone: (zoneId: string) => void;
}

const CELL_W = 156;
const CELL_H = 112;
const GAP = 36;
const TRAY_ID = 'tray';
const CLICK_SUPPRESS_MS = 300;

function cellId(x: number, y: number): string {
  return `cell:${x}:${y}`;
}

function parseCellId(id: UniqueIdentifier): GridPos | null {
  const m = /^cell:(\d+):(\d+)$/.exec(String(id));
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

function zoneDragId(zoneId: string): string {
  return `zone:${zoneId}`;
}

function parseZoneDragId(id: UniqueIdentifier): string | null {
  const s = String(id);
  return s.startsWith('zone:') ? s.slice(5) : null;
}

function containsPoint(rect: DOMRect, p: { x: number; y: number }): boolean {
  return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
}

/**
 * Pointer first (precise for cells), rectangles for keyboard dragging. The tray always wins, and cells
 * scrolled out of the board viewport (clipped, but still measured by dnd-kit) never catch the pointer.
 */
function makeCollisionDetection(board: RefObject<HTMLElement>): CollisionDetection {
  return (args) => {
    const pointer = args.pointerCoordinates;
    const hits = pointerWithin(args);
    const trayHit = hits.find((h) => h.id === TRAY_ID);
    if (trayHit) return [trayHit];
    const boardRect = board.current?.getBoundingClientRect();
    if (pointer && boardRect && !containsPoint(boardRect, pointer)) return [];
    return hits.length > 0 ? hits : rectIntersection(args);
  };
}

/**
 * Zone grid: top-level zones laid out in cells. Adjacent zones become neighbors ("Aplicar vecinas"),
 * which lets players walk off the edge of one zone into the next during play.
 */
export function ZoneGridEditor({ zones, onApply, onOpenZone }: ZoneGridEditorProps) {
  const confirm = useConfirm();
  const layout = useMemo(() => buildLayout(zones), [zones]);
  const positions = useMemo(() => placedPositions(layout), [layout]);
  const pairs = useMemo(() => adjacentPairs(layout), [layout]);
  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const subZoneCount = zones.length - layout.topZones.length;

  const [extra, setExtra] = useState({ cols: 0, rows: 0 });
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const suppressClickUntil = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const collisionDetection = useMemo(() => makeCollisionDetection(boardRef), []);

  const cols = Math.max(DEFAULT_COLS, layout.maxX + 2) + extra.cols;
  const rows = Math.max(DEFAULT_ROWS, layout.maxY + 2) + extra.rows;

  const pendingUpdates = useMemo(() => changedUpdates(zones, computeAutoNeighbors(layout)), [zones, layout]);
  const placedCount = layout.cells.size;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const dirInfo = (zone: Zone) => {
    const pos = positions.get(zone.id);
    const status = {} as Record<Direction, DirStatus>;
    const names = {} as Record<Direction, string | null>;
    for (const dir of DIRECTIONS) {
      status[dir] = directionStatus(zone, dir, pos, layout);
      const target = zone.neighbors[dir];
      names[dir] = target ? zonesById.get(target)?.name ?? 'Zona desconocida' : null;
    }
    return { status, names };
  };

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  const onDragStart = (e: DragStartEvent) => setActiveZoneId(parseZoneDragId(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveZoneId(null);
    suppressClickUntil.current = performance.now() + CLICK_SUPPRESS_MS;
    const zoneId = parseZoneDragId(e.active.id);
    const zone = zoneId ? zonesById.get(zoneId) : undefined;
    if (!zone || !e.over) return;
    const from = positions.get(zone.id) ?? null;

    if (e.over.id === TRAY_ID) {
      if (!from && !zone.gridPos) return;
      onApply([{ id: zone.id, gridPos: null, neighbors: zone.neighbors }]);
      return;
    }
    const target = parseCellId(e.over.id);
    if (!target) return;
    if (from && from.x === target.x && from.y === target.y) return;
    const updates: GridUpdate[] = [{ id: zone.id, gridPos: target, neighbors: zone.neighbors }];
    const occupant = layout.cells.get(posKey(target.x, target.y));
    if (occupant && occupant.id !== zone.id) {
      // Swap: the occupant takes the dragged zone's old cell (or goes to the tray).
      updates.push({ id: occupant.id, gridPos: from, neighbors: occupant.neighbors });
    }
    onApply(updates);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Has cogido la zona ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} está sobre ${describeTarget(over.id)}.` : `${nameOf(active.id)} no está sobre ninguna casilla.`),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} soltada en ${describeTarget(over.id)}.` : `${nameOf(active.id)} soltada fuera de la cuadrícula.`),
    onDragCancel: ({ active }) => `Movimiento de ${nameOf(active.id)} cancelado.`,
  };

  function nameOf(id: UniqueIdentifier): string {
    const zid = parseZoneDragId(id);
    return (zid && zonesById.get(zid)?.name) || 'zona';
  }

  function describeTarget(id: UniqueIdentifier): string {
    if (id === TRAY_ID) return 'la bandeja de zonas sin colocar';
    const pos = parseCellId(id);
    if (!pos) return 'una casilla';
    const occupant = layout.cells.get(posKey(pos.x, pos.y));
    return `la columna ${pos.x + 1}, fila ${pos.y + 1}${occupant ? ` (ocupada por ${occupant.name})` : ''}`;
  }

  // ---------------------------------------------------------------------------
  // Board actions
  // ---------------------------------------------------------------------------

  const shiftAll = (dx: number, dy: number) => {
    const updates: GridUpdate[] = [];
    for (const [id, pos] of positions) {
      const zone = zonesById.get(id);
      if (zone) updates.push({ id, gridPos: { x: pos.x + dx, y: pos.y + dy }, neighbors: zone.neighbors });
    }
    if (updates.length > 0) onApply(updates);
    else setExtra((e) => ({ cols: e.cols + dx, rows: e.rows + dy }));
  };

  const applyAuto = async () => {
    if (pendingUpdates.length === 0) {
      toast.info('Las vecinas ya coinciden con la cuadrícula');
      return;
    }
    const conflictCount = layout.conflicts.size;
    const ok = await confirm({
      title: 'Aplicar vecinas automáticamente',
      message: (
        <>
          Se recalcularán las vecinas de {plural(pendingUpdates.length, 'zona', 'zonas')} según su posición: cada zona quedará unida a
          las que tenga arriba, abajo, a la izquierda y a la derecha.
          {layout.tray.length > 0 && (
            <span className="mt-2 block">Las zonas sin colocar se quedarán sin vecinas.</span>
          )}
          {conflictCount > 0 && (
            <span className="mt-2 block text-amber-300">
              {plural(conflictCount, 'zona con la posición repetida pasará', 'zonas con la posición repetida pasarán')} a la bandeja.
            </span>
          )}
        </>
      ),
      confirmLabel: 'Aplicar',
      icon: <WandSparkles className="h-5 w-5" />,
    });
    if (!ok) return;
    onApply(pendingUpdates);
    toast.success('Vecinas actualizadas', { description: `${plural(pendingUpdates.length, 'zona actualizada', 'zonas actualizadas')}` });
  };

  const activeZone = activeZoneId ? zonesById.get(activeZoneId) ?? null : null;

  const cellsList: ReactNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const zone = layout.cells.get(posKey(x, y)) ?? null;
      cellsList.push(
        <BoardCell key={posKey(x, y)} x={x} y={y} occupied={!!zone} dragging={activeZoneId !== null}>
          {zone && (
            <DraggableZone zoneId={zone.id} label={zone.name} fill>
              {(isDragging) => {
                const info = dirInfo(zone);
                return (
                  <div
                    className="h-full w-full cursor-grab active:cursor-grabbing"
                    onClick={() => {
                      if (performance.now() < suppressClickUntil.current) return;
                      onOpenZone(zone.id);
                    }}
                  >
                    <ZoneGridCard
                      zone={zone}
                      dirStatus={info.status}
                      neighborNames={info.names}
                      ghost={isDragging}
                      onOpen={() => onOpenZone(zone.id)}
                    />
                  </div>
                );
              }}
            </DraggableZone>
          )}
        </BoardCell>,
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={{ threshold: { x: 0.1, y: 0.12 } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveZoneId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Pulsa espacio o intro para coger la zona. Muévela con las flechas y suéltala con espacio o intro. Escape cancela.',
        },
      }}
    >
      <div className="flex h-full min-h-0 w-full bg-ink-950">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-600/80 bg-ink-900/95 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-700/50 bg-gold-500/10 text-gold-300">
                <Grid3x3 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-display text-sm font-semibold tracking-wide text-gold-200">Cuadrícula de zonas</h2>
                <p className="truncate text-[11px] text-parchment-400">
                  {plural(placedCount, 'colocada', 'colocadas')} · {plural(layout.tray.length, 'sin colocar', 'sin colocar')}
                </p>
              </div>
            </div>
            {pendingUpdates.length > 0 ? (
              <Badge tone="gold" icon={<TriangleAlert />} title="Pulsa «Aplicar vecinas automáticamente» para sincronizarlas">
                {plural(pendingUpdates.length, 'zona con vecinas pendientes', 'zonas con vecinas pendientes')}
              </Badge>
            ) : (
              placedCount > 0 && (
                <Badge tone="emerald" icon={<CircleCheck />}>
                  Vecinas al día
                </Badge>
              )
            )}
            <span className="flex-1" />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setExtra((e) => ({ ...e, rows: e.rows + 1 }))}>
                Fila
              </Button>
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setExtra((e) => ({ ...e, cols: e.cols + 1 }))}>
                Columna
              </Button>
              {(extra.cols > 0 || extra.rows > 0) && (
                <Button size="sm" variant="ghost" icon={<Scissors />} onClick={() => setExtra({ cols: 0, rows: 0 })} title="Quitar las filas y columnas vacías añadidas">
                  Recortar
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                icon={<WandSparkles />}
                onClick={() => void applyAuto()}
                disabled={layout.topZones.length === 0}
                title="Calcula las vecinas de cada zona según las casillas adyacentes"
              >
                Aplicar vecinas automáticamente
              </Button>
            </div>
          </div>

          {/* Board */}
          <div ref={boardRef} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
            {layout.topZones.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <Grid3x3 className="h-10 w-10 text-gold-600" />
                <p className="font-display text-base text-parchment-100">Todavía no hay zonas que ordenar</p>
                <p className="max-w-sm text-sm text-parchment-400">
                  Crea zonas en el panel de diapositivas; después colócalas aquí para decidir qué zona queda al lado de cuál.
                </p>
              </div>
            ) : (
              <div className="inline-flex min-w-full flex-col items-start p-6">
                <EdgeButton orientation="h" label="Añadir una fila arriba" onClick={() => shiftAll(0, 1)} width={cols * (CELL_W + GAP) - GAP} offset={28} />
                <div className="flex items-stretch">
                  <EdgeButton orientation="v" label="Añadir una columna a la izquierda" onClick={() => shiftAll(1, 0)} height={rows * (CELL_H + GAP) - GAP} />
                  <div
                    className="relative mx-1"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
                      gridAutoRows: `${CELL_H}px`,
                      gap: GAP,
                    }}
                  >
                    {cellsList}
                    <GridConnections pairs={pairs} cols={cols} rows={rows} cellW={CELL_W} cellH={CELL_H} gap={GAP} />
                  </div>
                  <EdgeButton
                    orientation="v"
                    label="Añadir una columna a la derecha"
                    onClick={() => setExtra((e) => ({ ...e, cols: e.cols + 1 }))}
                    height={rows * (CELL_H + GAP) - GAP}
                  />
                </div>
                <EdgeButton
                  orientation="h"
                  label="Añadir una fila abajo"
                  onClick={() => setExtra((e) => ({ ...e, rows: e.rows + 1 }))}
                  width={cols * (CELL_W + GAP) - GAP}
                  offset={28}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tray + legend */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-ink-600/80 bg-ink-900/95">
          <Tray layout={layout} activeZoneId={activeZoneId} subZoneCount={subZoneCount} />
          <Legend />
        </aside>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {activeZone ? (
          <div style={{ width: CELL_W, height: CELL_H }}>
            <ZoneGridCard zone={activeZone} {...overlayInfo(activeZone, layout, positions, zonesById)} lifted />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function overlayInfo(
  zone: Zone,
  layout: GridLayout,
  positions: Map<string, GridPos>,
  zonesById: Map<string, Zone>,
): { dirStatus: Record<Direction, DirStatus>; neighborNames: Record<Direction, string | null> } {
  const pos = positions.get(zone.id);
  const dirStatus = {} as Record<Direction, DirStatus>;
  const neighborNames = {} as Record<Direction, string | null>;
  for (const dir of DIRECTIONS) {
    dirStatus[dir] = directionStatus(zone, dir, pos, layout);
    const target = zone.neighbors[dir];
    neighborNames[dir] = target ? zonesById.get(target)?.name ?? null : null;
  }
  return { dirStatus, neighborNames };
}

function DraggableZone({
  zoneId,
  label,
  fill = false,
  children,
}: {
  zoneId: string;
  label: string;
  /** Fill the parent (board cells); tray rows keep their natural height. */
  fill?: boolean;
  children: (isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: zoneDragId(zoneId) });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Zona ${label}`}
      className={clsx(
        'touch-none outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        fill ? 'h-full w-full rounded-xl' : 'rounded-lg',
      )}
    >
      {children(isDragging)}
    </div>
  );
}

function BoardCell({
  x,
  y,
  occupied,
  dragging,
  children,
}: {
  x: number;
  y: number;
  occupied: boolean;
  dragging: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(x, y) });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'group/cell relative rounded-xl transition duration-150',
        !occupied && 'border border-dashed',
        !occupied && (isOver ? 'border-gold-400 bg-gold-500/10 shadow-glow-gold' : dragging ? 'border-ink-400/80 bg-ink-900/60' : 'border-ink-600/70 bg-ink-900/30'),
        occupied && isOver && 'ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-950',
      )}
    >
      {children}
      {!occupied && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] tabular-nums text-parchment-400/0 transition group-hover/cell:text-parchment-400/70">
          {x + 1} · {y + 1}
        </span>
      )}
      {occupied && isOver && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-ink-950/60 text-xs font-semibold text-gold-200">
          <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
          Intercambiar
        </span>
      )}
    </div>
  );
}

function EdgeButton({
  orientation,
  label,
  onClick,
  width,
  height,
  offset = 0,
}: {
  orientation: 'h' | 'v';
  label: string;
  onClick: () => void;
  width?: number;
  height?: number;
  offset?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'group/edge flex shrink-0 items-center justify-center rounded-lg border border-dashed border-transparent text-parchment-400/40 transition hover:border-gold-600/70 hover:bg-gold-500/5 hover:text-gold-300',
        orientation === 'h' ? 'my-1.5 h-6' : 'w-6',
      )}
      style={orientation === 'h' ? { width, marginLeft: offset } : { height }}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function Tray({ layout, activeZoneId, subZoneCount }: { layout: GridLayout; activeZoneId: string | null; subZoneCount: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID });
  const draggingPlaced = activeZoneId !== null && !layout.tray.some((z) => z.id === activeZoneId);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="panel-header">
        <span className="flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Sin colocar
        </span>
        <Badge size="xs">{layout.tray.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          'scroll-thin m-2 min-h-[6rem] flex-1 space-y-1.5 overflow-y-auto rounded-xl border-2 border-dashed p-2 transition',
          isOver ? 'border-gold-400 bg-gold-500/10' : draggingPlaced ? 'border-ink-400' : 'border-transparent',
        )}
      >
        {layout.tray.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-parchment-400">
            {draggingPlaced ? 'Suelta aquí para sacar la zona de la cuadrícula.' : 'Todas las zonas están en la cuadrícula.'}
          </p>
        ) : (
          layout.tray.map((zone) => (
            <DraggableZone key={zone.id} zoneId={zone.id} label={zone.name}>
              {(isDragging) => (
                <div className="cursor-grab active:cursor-grabbing">
                  <ZoneTrayItem zone={zone} conflict={layout.conflicts.has(zone.id)} ghost={isDragging} />
                </div>
              )}
            </DraggableZone>
          ))
        )}
      </div>
      {subZoneCount > 0 && (
        <p className="px-4 pb-2 text-[11px] leading-snug text-parchment-400">
          {subZoneCount === 1 ? 'La sub-zona no aparece' : `Las ${subZoneCount} sub-zonas no aparecen`} aquí: se entra en ellas desde
          puertas y transiciones de su zona.
        </p>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="shrink-0 space-y-2.5 border-t border-ink-600/70 px-4 py-3 text-xs text-parchment-300">
      <div className="flex items-start gap-2 text-parchment-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-400" />
        <p className="leading-relaxed">
          Durante la partida, al cruzar el borde de una zona se pasa a la zona adyacente: la de arriba, abajo, izquierda o derecha.
        </p>
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <ConnectionSwatch state="linked" />
          Vecinas conectadas
        </li>
        <li className="flex items-center gap-2">
          <ConnectionSwatch state="oneway" />
          Solo en un sentido
        </li>
        <li className="flex items-center gap-2">
          <ConnectionSwatch state="pending" />
          Juntas pero sin conectar (pulsa Aplicar)
        </li>
        <li className="flex items-center gap-2">
          <span className="ml-1 inline-flex w-[26px] justify-center">
            <span className="h-[3px] w-4 rounded-full bg-amber-500" />
          </span>
          Vecina que no coincide con la cuadrícula
        </li>
      </ul>
      <p className="text-[11px] text-parchment-400">Arrastra las tarjetas para moverlas. Clic en una tarjeta abre la zona.</p>
    </div>
  );
}
