import { useMemo, useRef } from 'react';
import { Layer } from 'react-konva';
import { Map as MapIcon } from 'lucide-react';
import type { SceneElement, ZoneLevel } from '@wailers/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { useUiEvent } from '../../lib/uiEvents';
import { CombinedLayer, GridLayer, LevelBackground, LevelStack, MapStage, type MapStageHandle } from '../../map';
import { useCurrentEditorZone, useEditorStore } from './editorStore';
import { DraftPreview } from './canvas/DraftPreview';
import { DropOverlay } from './canvas/DropOverlay';
import { InlineTextEditor } from './canvas/InlineTextEditor';
import { SceneLayers } from './canvas/SceneLayers';
import { SelectionTransformer, TRANSFORMABLE_TYPES } from './canvas/SelectionTransformer';
import { SpawnFlag } from './canvas/SpawnFlag';
import { StatusBar } from './canvas/StatusBar';
import { useCanvasUi } from './canvas/canvasUiStore';
import { useCanvasController } from './canvas/useCanvasController';
import { VertexHandles } from './canvas/VertexHandles';

const NO_OFFSET = { x: 0, y: 0 };
const NO_ELEMENTS: SceneElement[] = [];

/**
 * Interactive canvas of the campaign editor: draws the current zone level with the shared map primitives and
 * implements every editor tool (selection, transform, drawing, walls, lights, fog, transitions, notes, spawn,
 * erase, library / image drops). Reads and writes everything through the editor store.
 */
export function EditorCanvas() {
  const { zone, level } = useCurrentEditorZone();
  const loading = useEditorStore((s) => s.loading);
  const tool = useEditorStore((s) => s.tool);
  const selection = useEditorStore((s) => s.selection);
  const layerVisible = useEditorStore((s) => s.layerVisible);
  const layerLocked = useEditorStore((s) => s.layerLocked);
  const spawn = useEditorStore((s) => s.campaign?.spawn ?? null);
  const editingId = useCanvasUi((s) => s.editing?.id ?? null);

  const mapRef = useRef<MapStageHandle>(null);
  const controller = useCanvasController(mapRef);
  useUiEvent('editor-fit', () => mapRef.current?.fitToView());

  const elements = level?.elements ?? NO_ELEMENTS;

  // Selected elements, and the subset that can currently be edited with the mouse.
  const selected = useMemo(() => {
    const ids = new Set(selection.filter((s) => s.kind === 'element').map((s) => s.id));
    return ids.size ? elements.filter((el) => ids.has(el.id)) : NO_ELEMENTS;
  }, [selection, elements]);

  const editableSelected = useMemo(
    () => selected.filter((el) => !el.locked && layerVisible[el.layer] && !layerLocked[el.layer]),
    [selected, layerVisible, layerLocked],
  );

  // While a text/note/marker is edited in place, its HTML editor replaces the transformer and outline.
  const transformerElements = tool === 'select' && !editingId ? editableSelected : NO_ELEMENTS;
  const singleFramed =
    tool === 'select' && selected.length === 1 && transformerElements.length === 1 && TRANSFORMABLE_TYPES.has(transformerElements[0]!.type);
  const outlineIds = useMemo(
    () => (singleFramed ? [] : selected.filter((el) => el.id !== editingId).map((el) => el.id)),
    [singleFramed, selected, editingId],
  );

  // Hiding the "Fondo" layer also hides the level background image (its color stays as the sheet).
  const backgroundLevel = useMemo<Pick<ZoneLevel, 'background'> | null>(() => {
    if (!level) return null;
    return layerVisible.background ? level : { background: { ...level.background, url: null } };
  }, [level, layerVisible.background]);

  // Vertex editing for a single selected wall / fog region.
  const vertexTarget = useMemo(() => {
    if (!level || tool !== 'select' || selection.length !== 1) return null;
    const item = selection[0]!;
    if (item.kind === 'wall' && layerVisible.walls && !layerLocked.walls) {
      const wall = level.walls.find((w) => w.id === item.id);
      return wall ? { target: 'wall' as const, id: wall.id, points: wall.points, closed: false } : null;
    }
    if (item.kind === 'fog' && layerVisible.fog && !layerLocked.fog) {
      const fog = level.fogRegions.find((f) => f.id === item.id);
      return fog ? { target: 'fog' as const, id: fog.id, points: fog.points, closed: true } : null;
    }
    return null;
  }, [level, tool, selection, layerVisible, layerLocked]);

  if (!zone || !level || !backgroundLevel) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-950 p-6">
        {loading ? (
          <Spinner size="lg" label="Cargando zona…" showLabel />
        ) : (
          <EmptyState
            icon={<MapIcon />}
            title={zone ? 'Esta zona no tiene niveles' : 'Ninguna zona seleccionada'}
            description={
              zone
                ? 'Añade un nivel desde el panel de niveles para empezar a dibujar el mapa.'
                : 'Crea una zona o elige una en el panel de diapositivas para empezar a dibujar su mapa.'
            }
          />
        )}
      </div>
    );
  }

  const spawnHere = spawn && spawn.zoneId === zone.id && spawn.levelId === level.id ? spawn : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-ink-950">
      <div className="relative min-h-0 flex-1 overflow-hidden" onMouseLeave={controller.onWrapperMouseLeave} onDragLeave={controller.onWrapperDragLeave}>
        <MapStage
          ref={mapRef}
          worldWidth={level.background.width}
          worldHeight={level.background.height}
          initialFit
          fitKey={`${zone.id}:${level.id}`}
          panMode={tool === 'pan'}
          panWithRightButton
          onStageMouseDown={controller.onStageMouseDown}
          onStageMouseMove={controller.onStageMouseMove}
          onStageClick={controller.onStageClick}
          onStageDblClick={controller.onStageDblClick}
          onStageContextMenu={controller.onStageContextMenu}
          onDrop={controller.onDrop}
          onDragOver={controller.onDragOver}
          onViewChange={controller.onViewChange}
        >
          <CombinedLayer listening={false}>
            <LevelStack zone={zone} currentLevelId={level.id} viewOffset={NO_OFFSET} />
            <LevelBackground level={backgroundLevel} />
            <GridLayer level={level} />
          </CombinedLayer>
          <SceneLayers
            level={level}
            tool={tool}
            selection={selection}
            outlineIds={outlineIds}
            layerVisible={layerVisible}
            layerLocked={layerLocked}
            controller={controller}
          />
          <Layer>
            <DraftPreview grid={level.grid} />
            {spawnHere && (
              <SpawnFlag
                x={spawnHere.x}
                y={spawnHere.y}
                grid={level.grid}
                draggable={tool === 'select'}
                interactive={tool === 'erase'}
                snap={controller.snapSpawn}
                onMouseDown={controller.onSpawnMouseDown}
                onClick={controller.onSpawnClick}
                onDragEnd={controller.onSpawnDragEnd}
              />
            )}
            {vertexTarget && (
              <VertexHandles
                target={vertexTarget.target}
                id={vertexTarget.id}
                points={vertexTarget.points}
                closed={vertexTarget.closed}
                snap={controller.snapVertex}
                onPreview={controller.onVertexPreview}
                onCommit={controller.onVertexCommit}
                onHandleMouseDown={controller.onHandleMouseDown}
              />
            )}
            {tool === 'select' && <SelectionTransformer elements={transformerElements} version={level} />}
          </Layer>
        </MapStage>
        <InlineTextEditor level={level} mapRef={mapRef} onCommit={controller.commitInlineEdit} />
        <DropOverlay />
      </div>
      <StatusBar grid={level.grid} />
    </div>
  );
}
