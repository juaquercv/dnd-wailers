import type { EntryKind, LibraryEntry } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface LibraryBrowserProps {
  kinds?: EntryKind[];
  initialKind?: EntryKind;
  compact?: boolean;
  campaignId?: string;
  draggable?: boolean;
  onPick?: (entry: LibraryEntry) => void;
  pickLabel?: string;
  className?: string;
}

/** Placeholder — replaced by the library-client agent. */
export function LibraryBrowser(props: LibraryBrowserProps) {
  const kinds = props.kinds ?? (props.initialKind ? [props.initialKind] : []);
  return (
    <UnderConstruction
      title="Explorador de biblioteca"
      compact={props.compact}
      className={props.className}
      detail={kinds.length > 0 ? kinds.join(', ') : undefined}
    />
  );
}
