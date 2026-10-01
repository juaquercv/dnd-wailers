import type { Campaign, UpdateCampaignRequest, Zone } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface CampaignSettingsPanelProps {
  campaign: Campaign;
  zones: Zone[];
  onChange: (patch: UpdateCampaignRequest) => void;
}

/** Placeholder — replaced by the editor-extras agent. */
export function CampaignSettingsPanel(props: CampaignSettingsPanelProps) {
  return (
    <div className="p-6">
      <UnderConstruction title="Ajustes de la campaña" detail={`${props.campaign.name} · ${props.zones.length} zonas`} />
    </div>
  );
}
