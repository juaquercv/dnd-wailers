import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface ChatPanelProps {
  compact?: boolean;
}

/** Placeholder — replaced by the lobby agent. */
export function ChatPanel(props: ChatPanelProps) {
  return <UnderConstruction title="Chat" compact={props.compact} />;
}
