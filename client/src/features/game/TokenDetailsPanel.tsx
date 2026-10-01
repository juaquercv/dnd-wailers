import { X } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface TokenDetailsPanelProps {
  tokenId: string;
  onClose: () => void;
}

/** Placeholder — replaced by the game-panels agent. */
export function TokenDetailsPanel(props: TokenDetailsPanelProps) {
  return (
    <div className="relative">
      <UnderConstruction title="Detalles de la ficha" compact detail={props.tokenId} />
      <IconButton icon={<X />} title="Cerrar" size="xs" className="absolute right-2 top-2" onClick={props.onClose} />
    </div>
  );
}
