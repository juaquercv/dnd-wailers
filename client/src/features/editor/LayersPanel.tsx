import clsx from 'clsx';
import { Eye, EyeOff, Layers, Lock, LockOpen } from 'lucide-react';
import { LAYER_IDS, LAYER_LABELS, type LayerId, type ZoneLevel } from '@wailers/shared';
import { Button, EmptyState } from '../../components/ui';
import { useCurrentEditorZone, useEditorStore } from './editorStore';

/** Things drawn on each layer of a level (walls, lights and fog regions count on their own layer). */
function layerCounts(level: ZoneLevel): Record<LayerId, number> {
  const counts = Object.fromEntries(LAYER_IDS.map((l) => [l, 0])) as Record<LayerId, number>;
  for (const el of level.elements) if (el.layer in counts) counts[el.layer] += 1;
  counts.walls += level.walls.length;
  counts.lighting += level.lights.length;
  counts.fog += level.fogRegions.length;
  return counts;
}

const LAYER_HINTS: Partial<Record<LayerId, string>> = {
  walls: 'Paredes, puertas y ventanas',
  lighting: 'Fuentes de luz',
  fog: 'Regiones ocultas hasta que el DM las revela',
  notes: 'Solo las ve el DM',
};

/** Layer list: visibility, lock and the active layer for new drawings (top layers first). */
export function LayersPanel() {
  const { level } = useCurrentEditorZone();
  const visible = useEditorStore((s) => s.layerVisible);
  const locked = useEditorStore((s) => s.layerLocked);
  const activeLayer = useEditorStore((s) => s.toolOptions.activeLayer);
  const toggleVisible = useEditorStore((s) => s.toggleLayerVisible);
  const toggleLocked = useEditorStore((s) => s.toggleLayerLocked);
  const setToolOptions = useEditorStore((s) => s.setToolOptions);

  if (!level) {
    return <EmptyState compact icon={<Layers />} title="Sin nivel" description="Elige una zona para ver sus capas." />;
  }

  const counts = layerCounts(level);
  const ordered = [...LAYER_IDS].reverse();
  const hiddenCount = LAYER_IDS.filter((l) => !visible[l]).length;
  const lockedCount = LAYER_IDS.filter((l) => locked[l]).length;

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-[11px] leading-snug text-parchment-400">
        Las capas de arriba se dibujan encima. La <span className="text-gold-300">capa activa</span> recibe los nuevos dibujos,
        textos, marcadores e imágenes. Ocultar o bloquear una capa solo afecta al editor.
      </p>
      <div role="radiogroup" aria-label="Capa activa" className="flex flex-col gap-1">
        {ordered.map((layer) => {
          const isActive = activeLayer === layer;
          const isVisible = visible[layer];
          const isLocked = locked[layer];
          return (
            <div
              key={layer}
              className={clsx(
                'group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition',
                isActive ? 'border-gold-600/70 bg-gold-500/10' : 'border-ink-600/70 bg-ink-950/40 hover:border-ink-500',
                !isVisible && 'opacity-60',
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isActive}
                title="Usar como capa activa"
                onClick={() => setToolOptions({ activeLayer: layer })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={clsx(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition',
                    isActive ? 'border-gold-400 bg-gold-500/20' : 'border-ink-400 group-hover:border-parchment-400',
                  )}
                  aria-hidden
                >
                  {isActive && <span className="h-2 w-2 rounded-full bg-gold-300 shadow-[0_0_6px_rgba(243,213,138,0.8)]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block text-sm leading-tight', isActive ? 'font-semibold text-gold-100' : 'text-parchment-100')}>
                    {LAYER_LABELS[layer]}
                  </span>
                  {LAYER_HINTS[layer] && <span className="mt-0.5 block truncate text-[10px] text-parchment-400">{LAYER_HINTS[layer]}</span>}
                </span>
                <span
                  className={clsx(
                    'shrink-0 rounded-full px-1.5 text-[10px] font-bold leading-4 tabular-nums',
                    counts[layer] > 0 ? 'bg-ink-600 text-parchment-100' : 'bg-ink-800 text-parchment-400',
                  )}
                  title={`${counts[layer]} en esta capa`}
                >
                  {counts[layer]}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleVisible(layer)}
                aria-pressed={!isVisible}
                title={isVisible ? 'Ocultar capa en el editor' : 'Mostrar capa'}
                aria-label={isVisible ? `Ocultar ${LAYER_LABELS[layer]}` : `Mostrar ${LAYER_LABELS[layer]}`}
                className={clsx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition',
                  isVisible ? 'text-parchment-300 hover:bg-ink-700 hover:text-parchment-50' : 'bg-ink-700 text-blood-300',
                )}
              >
                {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => toggleLocked(layer)}
                aria-pressed={isLocked}
                title={isLocked ? 'Desbloquear capa' : 'Bloquear capa (no se puede seleccionar ni mover)'}
                aria-label={isLocked ? `Desbloquear ${LAYER_LABELS[layer]}` : `Bloquear ${LAYER_LABELS[layer]}`}
                className={clsx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition',
                  isLocked ? 'bg-gold-500/15 text-gold-300' : 'text-parchment-400 hover:bg-ink-700 hover:text-parchment-50',
                )}
              >
                {isLocked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
      {(hiddenCount > 0 || lockedCount > 0) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {hiddenCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Eye />}
              onClick={() => LAYER_IDS.forEach((l) => !visible[l] && toggleVisible(l))}
            >
              Mostrar todas
            </Button>
          )}
          {lockedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<LockOpen />}
              onClick={() => LAYER_IDS.forEach((l) => locked[l] && toggleLocked(l))}
            >
              Desbloquear todas
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
