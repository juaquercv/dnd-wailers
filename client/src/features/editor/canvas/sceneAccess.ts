import { LAYER_LABELS, type LayerId, type SceneElement, type Zone, type ZoneLevel } from '@wailers/shared';
import { toast } from '../../../components/ui/toast';
import { useEditorStore, type EditorTool } from '../editorStore';

export interface CurrentScene {
  zone: Zone;
  level: ZoneLevel;
}

/** Current zone + level read imperatively (same resolution as useCurrentEditorZone). */
export function getCurrentScene(): CurrentScene | null {
  const s = useEditorStore.getState();
  const zone = s.zones.find((z) => z.id === s.currentZoneId) ?? null;
  if (!zone) return null;
  const level = zone.levels.find((l) => l.id === s.currentLevelId) ?? zone.levels[0] ?? null;
  return level ? { zone, level } : null;
}

/** Layer that receives what a tool creates. */
export function layerForTool(tool: EditorTool, activeLayer: LayerId): LayerId {
  switch (tool) {
    case 'wall':
      return 'walls';
    case 'light':
      return 'lighting';
    case 'fog':
      return 'fog';
    case 'transition':
      return 'objects';
    case 'note':
      return 'notes';
    default:
      return activeLayer;
  }
}

/**
 * Checks that new content can go to `layer`: a locked layer blocks creation (warning toast); a hidden
 * layer is shown again so the new content is not invisible.
 */
export function ensureLayerWritable(layer: LayerId): boolean {
  const s = useEditorStore.getState();
  if (s.layerLocked[layer]) {
    toast.warning(`La capa «${LAYER_LABELS[layer]}» está bloqueada`, {
      description: 'Desbloquéala en el panel de capas para añadir contenido.',
    });
    return false;
  }
  if (!s.layerVisible[layer]) {
    s.toggleLayerVisible(layer);
    toast.info(`Se ha vuelto a mostrar la capa «${LAYER_LABELS[layer]}»`);
  }
  return true;
}

/** An element can be picked with the mouse (not locked, layer visible and unlocked). */
export function isElementSelectable(el: SceneElement): boolean {
  const s = useEditorStore.getState();
  return !el.locked && s.layerVisible[el.layer] && !s.layerLocked[el.layer];
}

export function isLayerEditable(layer: LayerId): boolean {
  const s = useEditorStore.getState();
  return s.layerVisible[layer] && !s.layerLocked[layer];
}
