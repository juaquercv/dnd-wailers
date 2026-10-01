import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface TurnOrderEditorProps {
  compact?: boolean;
}

/** Placeholder — replaced by the lobby agent. */
export function TurnOrderEditor(props: TurnOrderEditorProps) {
  return <UnderConstruction title="Orden de turnos" compact={props.compact} />;
}
