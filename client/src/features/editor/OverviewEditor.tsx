import type { Campaign, OverviewMap, Zone } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface OverviewEditorProps {
  campaign: Campaign;
  zones: Zone[];
  onChange: (overview: OverviewMap) => void;
  onOpenZone: (zoneId: string) => void;
}

/** Placeholder — replaced by the editor-extras agent. */
export function OverviewEditor(props: OverviewEditorProps) {
  return (
    <div className="p-6">
      <UnderConstruction title="Mapa general" detail={`${props.campaign.name} · ${props.zones.length} zonas`} />
    </div>
  );
}
