import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface RollHistoryProps {
  compact?: boolean;
}

/** Placeholder — replaced by the dice agent. */
export function RollHistory(props: RollHistoryProps) {
  return <UnderConstruction title="Historial de tiradas" compact={props.compact} />;
}
