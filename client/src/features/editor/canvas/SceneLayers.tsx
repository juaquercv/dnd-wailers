import { Fragment, memo, useMemo } from 'react';
import { LAYER_IDS, type LayerId, type SceneElement, type ZoneLevel } from '@wailers/shared';
import { CombinedLayer, FogRegionsLayer, LightsLayer, SceneElementsLayer, WallsLayer } from '../../../map';
import type { EditorTool, SelectionItem } from '../editorStore';
import { FogHitAreas } from './FogHitAreas';
import type { CanvasController } from './useCanvasController';

const NO_REVEALED: string[] = [];
const ALWAYS = () => true;

export interface SceneLayersProps {
  level: ZoneLevel;
  tool: EditorTool;
  selection: SelectionItem[];
  /** Element ids drawn with a selection outline (the transformer already frames single selections). */
  outlineIds: string[];
  layerVisible: Record<LayerId, boolean>;
  layerLocked: Record<LayerId, boolean>;
  controller: CanvasController;
}

/**
 * Everything editable of a level in one canvas, stacked in layer order: elements of each layer, with fog
 * regions, light gizmos and walls interleaved at their own layer. Locked layers and non-editing tools
 * render without listening so clicks fall through to the stage.
 */
export const SceneLayers = memo(function SceneLayers({ level, tool, selection, outlineIds, layerVisible, layerLocked, controller }: SceneLayersProps) {
  const interactiveTool = tool === 'select' || tool === 'erase';
  const canDrag = tool === 'select';

  // One pseudo-level per layer so each layer's elements render in their own slot of the stack.
  const levelsByLayer = useMemo(() => {
    const buckets = new Map<LayerId, SceneElement[]>(LAYER_IDS.map((id) => [id, []]));
    for (const el of level.elements) buckets.get(el.layer)?.push(el);
    const out = new Map<LayerId, ZoneLevel>();
    for (const id of LAYER_IDS) out.set(id, { ...level, elements: buckets.get(id) ?? [] });
    return out;
  }, [level]);

  const ids = useMemo(() => {
    const walls: string[] = [];
    const lights: string[] = [];
    const fog: string[] = [];
    for (const s of selection) {
      if (s.kind === 'wall') walls.push(s.id);
      else if (s.kind === 'light') lights.push(s.id);
      else if (s.kind === 'fog') fog.push(s.id);
    }
    return { walls, lights, fog };
  }, [selection]);

  const notesVisible = layerVisible.notes;

  return (
    <CombinedLayer>
      {LAYER_IDS.map((layer) => {
        if (!layerVisible[layer]) return null;
        const editable = interactiveTool && !layerLocked[layer];
        const layerLevel = levelsByLayer.get(layer) ?? level;
        return (
          <Fragment key={layer}>
            {layerLevel.elements.length > 0 && (
              <SceneElementsLayer
                level={layerLevel}
                layers={notesVisible && layer !== 'notes' ? [layer, 'notes'] : [layer]}
                showHidden
                selectedIds={outlineIds}
                interactive={editable}
                draggable={editable && canDrag ? ALWAYS : undefined}
                onElementMouseDown={controller.onElementMouseDown}
                onElementClick={controller.onElementClick}
                onElementDblClick={controller.onElementDblClick}
                onElementContextMenu={controller.onElementContextMenu}
                onElementDragMove={controller.onElementDragMove}
                onElementDragEnd={controller.onElementDragEnd}
                onElementTransformEnd={controller.onElementTransformEnd}
              />
            )}
            {layer === 'fog' && level.fogRegions.length > 0 && (
              <>
                <FogRegionsLayer regions={level.fogRegions} revealed={NO_REVEALED} mode="editor" selectedIds={ids.fog} />
                {editable && <FogHitAreas regions={level.fogRegions} onRegionClick={controller.onFogClick} />}
              </>
            )}
            {layer === 'lighting' && level.lights.length > 0 && (
              <LightsLayer
                lights={level.lights}
                selectedIds={ids.lights}
                interactive={editable}
                onLightClick={editable ? controller.onLightClick : undefined}
                onLightDragEnd={editable && canDrag ? controller.onLightDragEnd : undefined}
              />
            )}
            {layer === 'walls' && level.walls.length > 0 && (
              <WallsLayer walls={level.walls} interactive={editable} selectedIds={ids.walls} onWallClick={editable ? controller.onWallClick : undefined} />
            )}
          </Fragment>
        );
      })}
    </CombinedLayer>
  );
});
