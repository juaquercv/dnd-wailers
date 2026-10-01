import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface RollerManagerProps {
  campaignId: string;
  live?: boolean;
}

/** Placeholder — replaced by the dice agent. */
export function RollerManager(props: RollerManagerProps) {
  return <UnderConstruction title="Dados y ruletas" detail={props.live ? 'Edición en vivo' : props.campaignId} />;
}
