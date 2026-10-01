import { SlidersHorizontal } from 'lucide-react';
import { EmptyState } from '../../components/ui';
import { useCurrentEditorZone, useEditorStore } from './editorStore';
import { resolveSelection } from './shell/properties/common';
import { ElementProperties } from './shell/properties/ElementProperties';
import { LevelProperties } from './shell/properties/LevelProperties';
import { FogProperties, LightProperties, WallProperties } from './shell/properties/MapObjectProperties';
import { MultiSelectionProperties } from './shell/properties/MultiSelectionProperties';

/**
 * Right-panel "Propiedades": level background and grid when nothing is selected, a typed editor
 * for one selected element / wall / light / fog region, or bulk actions for a multi-selection.
 */
export function PropertiesPanel() {
  const { zone, level } = useCurrentEditorZone();
  const selection = useEditorStore((s) => s.selection);

  if (!zone || !level) {
    return (
      <EmptyState compact icon={<SlidersHorizontal />} title="Nada que editar" description="Elige o crea una zona para ver sus propiedades." />
    );
  }

  const items = resolveSelection(level, selection);
  if (items.length === 0) return <LevelProperties key={level.id} zone={zone} level={level} />;
  if (items.length > 1) return <MultiSelectionProperties items={items} />;

  const item = items[0]!;
  switch (item.kind) {
    case 'element':
      return <ElementProperties key={item.id} el={item.element} zone={zone} level={level} />;
    case 'wall':
      return <WallProperties key={item.id} wall={item.wall} gridSize={level.grid.size} />;
    case 'light':
      return <LightProperties key={item.id} light={item.light} gridSize={level.grid.size} />;
    case 'fog':
      return <FogProperties key={item.id} fog={item.fog} />;
  }
}
