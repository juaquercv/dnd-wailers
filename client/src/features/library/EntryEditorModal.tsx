import { ENTRY_KIND_LABELS, type EntryKind, type LibraryEntry, type LibraryEntryInput } from '@wailers/shared';
import { Modal } from '../../components/ui/Modal';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface EntryEditorModalProps {
  open: boolean;
  kind: EntryKind;
  entry?: LibraryEntry | null;
  defaults?: Partial<LibraryEntryInput>;
  onClose: () => void;
  onSaved: (entry: LibraryEntry) => void;
}

/** Placeholder — replaced by the library-client agent. */
export function EntryEditorModal(props: EntryEditorModalProps) {
  const title = props.entry ? `Editar «${props.entry.name}»` : `Nuevo: ${ENTRY_KIND_LABELS[props.kind].singular}`;
  return (
    <Modal open={props.open} onClose={props.onClose} title={title} size="lg">
      <UnderConstruction title="Editor de elementos" detail={props.defaults?.name} />
    </Modal>
  );
}
