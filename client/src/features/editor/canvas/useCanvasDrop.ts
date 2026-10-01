import { useEffect, useMemo, type DragEvent as ReactDragEvent, type RefObject } from 'react';
import {
  IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  SIZE_INFO,
  type Point,
  type SceneElement,
} from '@wailers/shared';
import { api } from '../../../api/http';
import { toast } from '../../../components/ui/toast';
import { DND_ENTRY, hasDragType, peekEntryDrag, readEntryDrag, type EntryDragPayload } from '../../../lib/dnd';
import { preloadImage, type MapPoint, type MapStageHandle } from '../../../map';
import { useEditorStore } from '../editorStore';
import { useCanvasUi } from './canvasUiStore';
import { createImageElement, createTokenElement, fileBaseName } from './factories';
import { hasUsableGrid, snapPoint } from './geometry';
import { ensureLayerWritable, getCurrentScene } from './sceneAccess';

const PLACEABLE_ONLY = 'Solo puedes colocar enemigos, NPCs y objetos en el mapa';

function isPlaceable(kind: EntryDragPayload['kind']): kind is 'creature' | 'item' {
  return kind === 'creature' || kind === 'item';
}

function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.includes(file.type) || (!file.type && /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name));
}

function clearDragFeedback(): void {
  const s = useCanvasUi.getState();
  if (s.dropGhost || s.dragHint) useCanvasUi.setState({ dropGhost: null, dragHint: null });
}

/** Adds an element to a specific zone/level (the user may switch zones while an upload is running). */
function addElementTo(zoneId: string, levelId: string, el: SceneElement): void {
  const s = useEditorStore.getState();
  s.updateZone(zoneId, (zone) => {
    zone.levels.find((l) => l.id === levelId)?.elements.push(el);
  });
  const now = useEditorStore.getState();
  if (now.currentZoneId === zoneId && now.currentLevelId === levelId) now.setSelection([{ kind: 'element', id: el.id }]);
}

export interface CanvasDropHandlers {
  onDrop(e: DragEvent, world: MapPoint): void;
  onDragOver(e: DragEvent): void;
  onWrapperDragLeave(e: ReactDragEvent<HTMLDivElement>): void;
}

/**
 * HTML5 drops on the editor canvas: library creatures/items become design-time tokens, image files are
 * uploaded and placed as image elements. Also drives the drop preview (ghost + hint).
 */
export function useCanvasDrop(mapRef: RefObject<MapStageHandle>): CanvasDropHandlers {
  const handlers = useMemo<CanvasDropHandlers>(() => {
    const clientToWorld = (clientX: number, clientY: number): Point | null => {
      const handle = mapRef.current;
      const stage = handle?.getStage();
      if (!handle || !stage) return null;
      const rect = stage.container().getBoundingClientRect();
      return handle.screenToWorld({ x: clientX - rect.left, y: clientY - rect.top });
    };

    const placeEntry = async (entry: EntryDragPayload, world: Point) => {
      if (!isPlaceable(entry.kind)) {
        toast.warning(PLACEABLE_ONLY);
        return;
      }
      const scene = getCurrentScene();
      const campaignId = useEditorStore.getState().campaignId;
      if (!scene || !ensureLayerWritable('tokens')) return;
      const zoneId = scene.zone.id;
      const levelId = scene.level.id;
      const grid = scene.level.grid;
      try {
        let cells = 1;
        let name = entry.name;
        let imageUrl = entry.imageUrl;
        if (entry.kind === 'creature') {
          const full = await api.library.get<'creature'>(entry.id);
          cells = full.data?.tokenCells ?? (full.size ? SIZE_INFO[full.size].cells : 1);
          name = full.name;
          imageUrl = full.imageUrl;
        } else {
          const full = await api.library.get<'item'>(entry.id);
          name = full.name;
          imageUrl = full.imageUrl;
        }
        const pos = grid.snap && hasUsableGrid(grid) ? snapPoint(world, grid, 'token', cells) : world;
        addElementTo(zoneId, levelId, createTokenElement(pos, { id: entry.id, name, imageUrl, kind: entry.kind }, cells));
        void api.library.markUsed(entry.id, campaignId ?? undefined).catch(() => undefined);
      } catch (err) {
        toast.fromError(err, `No se pudo colocar «${entry.name}»`);
      }
    };

    const dropImages = async (files: File[], world: Point) => {
      const images = files.filter(isImageFile);
      if (images.length === 0) {
        toast.warning('Solo puedes soltar imágenes en el lienzo', { description: 'Formatos admitidos: PNG, JPG, WEBP, GIF y SVG.' });
        return;
      }
      if (images.length < files.length) toast.info('Se han ignorado los archivos que no son imágenes');
      const scene = getCurrentScene();
      if (!scene) return;
      const layer = useEditorStore.getState().toolOptions.activeLayer;
      if (!ensureLayerWritable(layer)) return;
      const zoneId = scene.zone.id;
      const levelId = scene.level.id;
      const grid = scene.level.grid;
      await Promise.all(
        images.map(async (file, index) => {
          if (file.size > MAX_UPLOAD_BYTES) {
            toast.error(`«${file.name}» supera el límite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`);
            return;
          }
          useCanvasUi.setState((s) => ({ uploads: s.uploads + 1 }));
          try {
            const uploaded = await api.uploads.upload(file);
            let naturalWidth = 0;
            let naturalHeight = 0;
            try {
              const img = await preloadImage(uploaded.url);
              naturalWidth = img.naturalWidth || img.width;
              naturalHeight = img.naturalHeight || img.height;
            } catch {
              // Unknown size (e.g. SVG without dimensions): a default square is used.
            }
            const probe = createImageElement({ x: 0, y: 0 }, { url: uploaded.url, naturalWidth, naturalHeight, name: fileBaseName(file.name) }, layer);
            const offset = index * 30;
            let topLeft: Point = { x: world.x - probe.width / 2 + offset, y: world.y - probe.height / 2 + offset };
            if (grid.snap && hasUsableGrid(grid)) topLeft = snapPoint(topLeft, grid, 'point');
            addElementTo(zoneId, levelId, { ...probe, x: Math.round(topLeft.x), y: Math.round(topLeft.y) });
          } catch (err) {
            toast.fromError(err, `No se pudo subir «${file.name}»`);
          } finally {
            useCanvasUi.setState((s) => ({ uploads: Math.max(0, s.uploads - 1) }));
          }
        }),
      );
    };

    return {
      onDragOver(e) {
        const world = clientToWorld(e.clientX, e.clientY);
        const scene = getCurrentScene();
        if (!world || !scene) return;
        const entry = peekEntryDrag();
        const ui = useCanvasUi.getState();
        if (entry || hasDragType(e, DND_ENTRY)) {
          const allowed = entry ? isPlaceable(entry.kind) : true;
          if (e.dataTransfer) e.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
          const grid = scene.level.grid;
          const p = grid.snap && hasUsableGrid(grid) ? snapPoint(world, grid, 'token', 1) : world;
          const radius = hasUsableGrid(grid) ? grid.size / 2 : 35;
          const ghost = ui.dropGhost;
          if (!ghost || ghost.x !== p.x || ghost.y !== p.y || ghost.allowed !== allowed || ghost.radius !== radius) {
            useCanvasUi.setState({ dropGhost: { x: p.x, y: p.y, radius, allowed } });
          }
          const text = !allowed ? PLACEABLE_ONLY : entry ? `Suelta para colocar «${entry.name}»` : 'Suelta para colocar en el mapa';
          if (ui.dragHint?.text !== text) useCanvasUi.setState({ dragHint: { text, tone: allowed ? 'ok' : 'error' } });
          return;
        }
        if (hasDragType(e, 'Files')) {
          if (ui.dropGhost) useCanvasUi.setState({ dropGhost: null });
          const text = 'Suelta para añadir la imagen al mapa';
          if (ui.dragHint?.text !== text) useCanvasUi.setState({ dragHint: { text, tone: 'ok' } });
        }
      },

      onDrop(e, world) {
        clearDragFeedback();
        const entry = readEntryDrag(e);
        if (entry) {
          void placeEntry(entry, world);
          return;
        }
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) void dropImages(files, world);
      },

      onWrapperDragLeave(e) {
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        clearDragFeedback();
      },
    };
  }, [mapRef]);

  useEffect(() => {
    const clear = () => clearDragFeedback();
    window.addEventListener('dragend', clear, true);
    window.addEventListener('drop', clear, true);
    return () => {
      window.removeEventListener('dragend', clear, true);
      window.removeEventListener('drop', clear, true);
    };
  }, []);

  return handlers;
}
