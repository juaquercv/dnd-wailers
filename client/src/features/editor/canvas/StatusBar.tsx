import { memo } from 'react';
import clsx from 'clsx';
import { Crosshair, Grid3x3, Magnet, MousePointerClick, ZoomIn } from 'lucide-react';
import type { GridConfig } from '@wailers/shared';
import { useEditorStore } from '../editorStore';
import { useCanvasUi } from './canvasUiStore';
import { cellLabel, formatNumber, hasUsableGrid } from './geometry';
import { SNAPPING_TOOLS, toolHint } from './toolHints';

function Separator() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-ink-500/70" />;
}

function Coordinates({ grid }: { grid: GridConfig }) {
  const cursor = useCanvasUi((s) => s.cursor);
  const cell = cursor ? cellLabel(cursor, grid) : null;
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5 tabular-nums" title="Posición del cursor (píxeles del mapa)">
        <Crosshair className="h-3 w-3 text-parchment-400" aria-hidden />
        {cursor ? (
          <>
            <span>X {formatNumber(cursor.x)}</span>
            <span>Y {formatNumber(cursor.y)}</span>
          </>
        ) : (
          <span className="text-parchment-400">—</span>
        )}
      </span>
      {hasUsableGrid(grid) && (
        <>
          <Separator />
          <span className="hidden shrink-0 items-center gap-1.5 tabular-nums sm:flex" title="Casilla bajo el cursor (columna · fila)">
            <Grid3x3 className="h-3 w-3 text-parchment-400" aria-hidden />
            {grid.type === 'hex' ? 'Hex' : 'Casilla'} {cell ?? '—'}
          </span>
        </>
      )}
    </>
  );
}

function Zoom() {
  const scale = useCanvasUi((s) => s.view.scale);
  return (
    <span className="flex shrink-0 items-center gap-1.5 tabular-nums" title="Nivel de zoom">
      <ZoomIn className="h-3 w-3 text-parchment-400" aria-hidden />
      {Math.round(scale * 100)} %
    </span>
  );
}

function Hint() {
  const tool = useEditorStore((s) => s.tool);
  const wallKind = useEditorStore((s) => s.toolOptions.wallKind);
  const draft = useCanvasUi((s) => s.draft);
  const editing = useCanvasUi((s) => s.editing);
  const text = editing
    ? 'Escribe y pulsa Esc o haz clic fuera para terminar (Ctrl+Enter en textos de varias líneas).'
    : toolHint(tool, draft, wallKind);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5" title={text}>
      <MousePointerClick className="h-3 w-3 shrink-0 text-gold-500/80" aria-hidden />
      <span className="truncate text-parchment-200">{text}</span>
    </span>
  );
}

function Selection() {
  const count = useEditorStore((s) => s.selection.length);
  if (count === 0) return null;
  return (
    <>
      <span className="shrink-0 rounded-full bg-gold-500/15 px-2 py-px font-medium text-gold-300">
        {count === 1 ? '1 seleccionado' : `${count} seleccionados`}
      </span>
      <Separator />
    </>
  );
}

function Snap({ grid }: { grid: GridConfig }) {
  const tool = useEditorStore((s) => s.tool);
  if (!grid.snap || !hasUsableGrid(grid) || !SNAPPING_TOOLS.has(tool)) return null;
  return (
    <>
      <span className="hidden shrink-0 items-center gap-1 text-parchment-400 lg:flex" title="Mantén Alt para colocar sin ajustar a la cuadrícula">
        <Magnet className="h-3 w-3" aria-hidden />
        Ajuste activo · Alt para desactivar
      </span>
      <Separator />
    </>
  );
}

/** Subtle bottom bar: cursor position, grid cell, zoom and a hint for the active tool. */
export const StatusBar = memo(function StatusBar({ grid, className }: { grid: GridConfig; className?: string }) {
  return (
    <div
      className={clsx(
        'flex h-7 shrink-0 select-none items-center gap-3 overflow-hidden border-t border-ink-600/70 bg-ink-950/85 px-3 text-[11px] leading-none text-parchment-300',
        className,
      )}
      role="status"
      aria-live="off"
    >
      <Hint />
      <Selection />
      <Snap grid={grid} />
      <Coordinates grid={grid} />
      <Separator />
      <Zoom />
    </div>
  );
});
