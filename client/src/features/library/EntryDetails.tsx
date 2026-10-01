import type { LibraryEntry } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface EntryDetailsProps {
  entry: LibraryEntry;
  compact?: boolean;
}

/** Placeholder — replaced by the library-client agent. */
export function EntryDetails(props: EntryDetailsProps) {
  return <UnderConstruction title={props.entry.name} compact={props.compact} detail="Ficha del elemento" />;
}
