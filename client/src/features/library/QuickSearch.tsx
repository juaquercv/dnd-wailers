import type { ReactNode } from 'react';
import type { EntryKind, LibraryEntry } from '@wailers/shared';
import { Modal } from '../../components/ui/Modal';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface QuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  run: () => void;
}

export interface QuickSearchProps {
  open: boolean;
  onClose: () => void;
  kinds?: EntryKind[];
  campaignId?: string;
  placeholder?: string;
  actionsFor: (entry: LibraryEntry) => QuickAction[];
}

/** Placeholder — replaced by the library-client agent (Ctrl+K palette). */
export function QuickSearch(props: QuickSearchProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Búsqueda rápida" size="lg">
      <UnderConstruction title="Búsqueda rápida" detail={props.placeholder} />
    </Modal>
  );
}
