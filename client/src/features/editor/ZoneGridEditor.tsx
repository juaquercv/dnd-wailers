import type { Zone, ZoneNeighbors } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface ZoneGridEditorProps {
  zones: Zone[];
  onApply: (updates: { id: string; gridPos: Zone['gridPos']; neighbors: ZoneNeighbors }[]) => void;
  onOpenZone: (zoneId: string) => void;
}

/** Placeholder — replaced by the editor-extras agent. */
export function ZoneGridEditor(props: ZoneGridEditorProps) {
  return (
    <div className="p-6">
      <UnderConstruction title="Cuadrícula de zonas" detail={`${props.zones.length} zonas`} />
    </div>
  );
}
