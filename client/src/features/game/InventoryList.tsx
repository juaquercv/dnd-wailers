import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface InventoryListProps {
  heroId?: string;
  tokenId?: string;
  readOnly?: boolean;
}

/** Placeholder — replaced by the game-panels agent. */
export function InventoryList(props: InventoryListProps) {
  return (
    <UnderConstruction
      title={props.tokenId ? 'Botín' : 'Inventario'}
      compact
      detail={props.readOnly ? 'Solo lectura' : props.heroId ?? props.tokenId}
    />
  );
}
