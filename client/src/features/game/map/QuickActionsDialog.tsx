import { Zap } from 'lucide-react';
import { ENTRY_KIND_LABELS, type LibraryEntry } from '@wailers/shared';
import { Avatar } from '../../../components/ui/Avatar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { buildQuickActions } from './quickActions';

export interface QuickActionsDialogProps {
  entry: LibraryEntry | null;
  onClose: () => void;
}

/** Touch-friendly list of the DM quick actions for a library entry (same actions as Ctrl+K). */
export function QuickActionsDialog({ entry, onClose }: QuickActionsDialogProps) {
  const actions = entry ? buildQuickActions(entry) : [];
  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      size="sm"
      icon={<Zap />}
      title={entry?.name ?? ''}
      subtitle={entry ? ENTRY_KIND_LABELS[entry.kind].singular : undefined}
    >
      {entry && (
        <div className="space-y-3">
          {(entry.imageUrl || entry.description) && (
            <div className="flex items-start gap-3">
              <Avatar name={entry.name} imageUrl={entry.imageUrl} size="lg" />
              {entry.description && <p className="line-clamp-4 text-xs leading-relaxed text-parchment-300">{entry.description}</p>}
            </div>
          )}
          {actions.length === 0 ? (
            <EmptyState compact title="Sin acciones rápidas" description="Arrastra el elemento al mapa o úsalo desde su panel." />
          ) : (
            <div className="flex flex-col gap-1.5">
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-ink-600 bg-ink-800/70 px-3 py-2.5 text-left text-sm text-parchment-100 transition hover:border-gold-700 hover:bg-ink-700 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-gold-400"
                  onClick={() => {
                    onClose();
                    a.run();
                  }}
                >
                  {a.icon}
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
