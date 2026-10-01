import clsx from 'clsx';
import { Magnet, Maximize } from 'lucide-react';
import { LAYER_IDS, LAYER_LABELS, type LayerId, type TransitionType, type Wall } from '@wailers/shared';
import { Kbd, Select, Slider, Tooltip } from '../../components/ui';
import { emitUiEvent } from '../../lib/uiEvents';
import { useCurrentEditorZone, useEditorStore, type EditorTool } from './editorStore';
import { ColorSwatch } from './shell/ColorSwatch';
import { Segmented, ToolbarField } from './shell/controls';
import { EmojiButton } from './shell/EmojiPicker';
import {
  LIGHT_PALETTE,
  TRANSITION_TYPE_ICONS,
  TRANSITION_TYPE_LABELS,
  TRANSITION_TYPES,
  WALL_KIND_INFO,
  WALL_KINDS,
} from './shell/labels';
import { EDITOR_TOOLS, LAYERED_TOOLS, TOOL_BY_ID, TOOL_GROUPS, type ToolDef } from './shell/tools';

const LAYER_OPTIONS = LAYER_IDS.map((id) => ({ value: id, label: LAYER_LABELS[id] }));
const TRANSITION_OPTIONS = TRANSITION_TYPES.map((t) => ({ value: t, label: `${TRANSITION_TYPE_ICONS[t]} ${TRANSITION_TYPE_LABELS[t]}` }));

const percent = (v: number) => `${Math.round(v * 100)}%`;
const px = (v: number) => `${Math.round(v)}px`;

function ToolButton({ def, active, onSelect }: { def: ToolDef; active: boolean; onSelect: () => void }) {
  const Icon = def.icon;
  const key = def.key.toUpperCase();
  return (
    <Tooltip
      side="bottom"
      content={
        <span className="flex items-center gap-2">
          {def.label}
          <Kbd>{key}</Kbd>
        </span>
      }
    >
      <button
        type="button"
        aria-label={`${def.label} (${key})`}
        aria-pressed={active}
        onClick={onSelect}
        className={clsx(
          'relative flex h-8 w-8 items-center justify-center rounded-md transition duration-150 active:scale-95',
          active
            ? 'bg-gold-500/20 text-gold-200 shadow-[inset_0_0_0_1px_rgba(233,192,99,0.55),0_0_14px_-4px_rgba(233,192,99,0.6)]'
            : 'text-parchment-300 hover:bg-ink-700 hover:text-parchment-50',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    </Tooltip>
  );
}

function ToolOptionsRow({ tool, gridSize }: { tool: EditorTool; gridSize: number }) {
  const o = useEditorStore((s) => s.toolOptions);
  const set = useEditorStore((s) => s.setToolOptions);
  const def = TOOL_BY_ID[tool];
  const Icon = def.icon;

  return (
    <div className="flex min-h-[2.5rem] flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-700/70 bg-ink-950/35 px-3 py-1.5">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-gold-200">
        <Icon className="h-3.5 w-3.5 text-gold-400" aria-hidden />
        {def.label}
      </span>

      {LAYERED_TOOLS.has(tool) && (
        <ToolbarField label="Capa">
          <Select<LayerId>
            value={o.activeLayer}
            options={LAYER_OPTIONS}
            onChange={(activeLayer) => set({ activeLayer })}
            size="sm"
            aria-label="Capa activa para los nuevos elementos"
            containerClassName="w-44"
          />
        </ToolbarField>
      )}

      {(tool === 'rect' || tool === 'ellipse') && (
        <ToolbarField label="Relleno">
          <ColorSwatch label="Color de relleno" value={o.fill} onChange={(fill) => set({ fill })} size="sm" />
        </ToolbarField>
      )}

      {(tool === 'draw' || tool === 'line' || tool === 'rect' || tool === 'ellipse') && (
        <>
          <ToolbarField label={tool === 'rect' || tool === 'ellipse' ? 'Borde' : 'Trazo'}>
            <ColorSwatch label="Color del trazo" value={o.stroke} onChange={(stroke) => set({ stroke })} size="sm" />
          </ToolbarField>
          <ToolbarField label="Grosor">
            <Slider
              value={o.strokeWidth}
              onChange={(strokeWidth) => set({ strokeWidth })}
              min={tool === 'rect' || tool === 'ellipse' ? 0 : 1}
              max={40}
              step={1}
              formatValue={px}
              aria-label="Grosor del trazo"
              className="w-32"
            />
          </ToolbarField>
          <ToolbarField label="Opacidad">
            <Slider
              value={o.opacity}
              onChange={(opacity) => set({ opacity })}
              min={0.05}
              max={1}
              step={0.05}
              formatValue={percent}
              aria-label="Opacidad"
              className="w-28"
            />
          </ToolbarField>
        </>
      )}

      {tool === 'text' && (
        <>
          <ToolbarField label="Color">
            <ColorSwatch label="Color del texto" value={o.stroke} onChange={(stroke) => set({ stroke })} size="sm" />
          </ToolbarField>
          <ToolbarField label="Tamaño">
            <Slider
              value={o.fontSize}
              onChange={(fontSize) => set({ fontSize })}
              min={8}
              max={160}
              step={1}
              formatValue={px}
              aria-label="Tamaño de letra"
              className="w-32"
            />
          </ToolbarField>
        </>
      )}

      {tool === 'marker' && (
        <>
          <ToolbarField label="Icono">
            <EmojiButton label="Icono del marcador" value={o.markerIcon} onChange={(markerIcon) => set({ markerIcon })} size="sm" />
          </ToolbarField>
          <ToolbarField label="Color">
            <ColorSwatch label="Color del marcador" value={o.markerColor} onChange={(markerColor) => set({ markerColor })} size="sm" />
          </ToolbarField>
        </>
      )}

      {tool === 'wall' && (
        <ToolbarField label="Tipo">
          <Segmented<Wall['kind']>
            value={o.wallKind}
            onChange={(wallKind) => set({ wallKind })}
            size="sm"
            aria-label="Tipo de pared"
            options={WALL_KINDS.map((k) => {
              const KindIcon = WALL_KIND_INFO[k].icon;
              return { value: k, label: WALL_KIND_INFO[k].label, icon: <KindIcon aria-hidden />, title: WALL_KIND_INFO[k].description };
            })}
          />
        </ToolbarField>
      )}

      {tool === 'light' && (
        <>
          <ToolbarField label="Radio">
            <Slider
              value={o.lightRadius}
              onChange={(lightRadius) => set({ lightRadius })}
              min={35}
              max={1400}
              step={5}
              formatValue={px}
              aria-label="Radio de la luz"
              title={`${(o.lightRadius / Math.max(1, gridSize)).toFixed(1).replace('.', ',')} casillas`}
              className="w-36"
            />
          </ToolbarField>
          <ToolbarField label="Color">
            <ColorSwatch
              label="Color de la luz"
              value={o.lightColor}
              onChange={(lightColor) => set({ lightColor })}
              palette={LIGHT_PALETTE}
              size="sm"
            />
          </ToolbarField>
        </>
      )}

      {tool === 'transition' && (
        <ToolbarField label="Tipo">
          <Select<TransitionType>
            value={o.transitionType}
            options={TRANSITION_OPTIONS}
            onChange={(transitionType) => set({ transitionType })}
            size="sm"
            aria-label="Tipo de transición"
            containerClassName="w-40"
          />
        </ToolbarField>
      )}

      <p className="min-w-[12rem] flex-1 text-[11px] leading-snug text-parchment-400">{def.hint}</p>
    </div>
  );
}

/** Tool palette (with shortcuts), contextual tool options, snap toggle and "fit to view". */
export function EditorToolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const updateLevel = useEditorStore((s) => s.updateLevel);
  const { level } = useCurrentEditorZone();
  const snap = level?.grid.snap ?? false;

  return (
    <div className="relative z-20 shrink-0 border-b border-ink-600/80 bg-ink-900/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
        {TOOL_GROUPS.map((g) => (
          <div
            key={g.id}
            role="group"
            aria-label={g.label}
            className="flex items-center gap-0.5 rounded-lg border border-ink-600/70 bg-ink-950/50 p-0.5"
          >
            {EDITOR_TOOLS.filter((t) => t.group === g.id).map((t) => (
              <ToolButton key={t.id} def={t} active={tool === t.id} onSelect={() => setTool(t.id)} />
            ))}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip side="bottom" content={snap ? 'Ajuste a la cuadrícula: activado' : 'Ajuste a la cuadrícula: desactivado'}>
            <button
              type="button"
              disabled={!level}
              aria-pressed={snap}
              aria-label="Ajustar a la cuadrícula"
              onClick={() =>
                updateLevel((l) => {
                  l.grid.snap = !l.grid.snap;
                })
              }
              className={clsx(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition disabled:opacity-40',
                snap
                  ? 'border-gold-600/70 bg-gold-500/15 text-gold-200'
                  : 'border-ink-600 bg-ink-950/50 text-parchment-300 hover:border-ink-500 hover:text-parchment-100',
              )}
            >
              <Magnet className="h-4 w-4" aria-hidden />
              <span className="hidden 2xl:inline">Ajustar</span>
            </button>
          </Tooltip>
          <Tooltip side="bottom" content="Ajustar a la vista">
            <button
              type="button"
              aria-label="Ajustar a la vista"
              onClick={() => emitUiEvent('editor-fit', {})}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-600 bg-ink-950/50 text-parchment-300 transition hover:border-ink-500 hover:text-parchment-50"
            >
              <Maximize className="h-4 w-4" aria-hidden />
            </button>
          </Tooltip>
        </div>
      </div>
      <ToolOptionsRow tool={tool} gridSize={level?.grid.size ?? 70} />
    </div>
  );
}
