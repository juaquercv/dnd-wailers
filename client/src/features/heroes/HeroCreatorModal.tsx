import type { LibraryEntry, RuleSystem } from '@wailers/shared';
import { Modal } from '../../components/ui/Modal';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface HeroCreatorModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (hero: LibraryEntry<'hero'>) => void;
  rules: RuleSystem | null;
  ownerId: string;
  campaignId?: string;
}

/** Placeholder — replaced by the library-client agent. */
export function HeroCreatorModal(props: HeroCreatorModalProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Crear héroe" size="lg">
      <UnderConstruction
        title="Creador de héroes"
        detail={props.rules ? `Nivel inicial ${props.rules.heroCreation.startingLevel}` : props.ownerId}
      />
    </Modal>
  );
}
