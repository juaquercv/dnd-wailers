import { useEffect, useState } from 'react';
import { BookOpen, PackagePlus, PenLine } from 'lucide-react';
import type { LibraryEntry } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Tabs } from '../../../components/ui/Tabs';
import { LibraryBrowser } from '../../library/LibraryBrowser';
import { emptyItemDraft, ItemFields, type ItemDraft } from './ItemForm';

export interface AddItemModalProps {
  open: boolean;
  /** "Thorin", "Goblin (botín)"… */
  targetName: string;
  campaignId?: string;
  currencyShort: string;
  allowEquip?: boolean;
  onClose: () => void;
  /** Library item picked (quantity chosen in the dialog). Resolve true when added. */
  onAddEntry: (entry: LibraryEntry, quantity: number) => Promise<boolean>;
  /** Custom item. */
  onAddCustom: (draft: ItemDraft) => Promise<boolean>;
}

type Mode = 'library' | 'custom';

/** "Añadir objeto": pick from the shared library or type a custom item. */
export function AddItemModal({ open, targetName, campaignId, currencyShort, allowEquip, onClose, onAddEntry, onAddCustom }: AddItemModalProps) {
  const [mode, setMode] = useState<Mode>('library');
  const [quantity, setQuantity] = useState(1);
  const [draft, setDraft] = useState<ItemDraft>(emptyItemDraft);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setDraft(emptyItemDraft());
    setNameError(null);
    setBusy(false);
  }, [open]);

  const pick = async (entry: LibraryEntry) => {
    if (entry.kind !== 'item' || busy) return;
    setBusy(true);
    const ok = await onAddEntry(entry, quantity);
    setBusy(false);
    if (ok) onClose();
  };

  const addCustom = async () => {
    if (!draft.name.trim()) {
      setNameError('El objeto necesita un nombre');
      return;
    }
    setBusy(true);
    const ok = await onAddCustom({ ...draft, name: draft.name.trim() });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Añadir objeto"
      subtitle={`Para ${targetName}. Nada se aplica solo: tú decides qué entra.`}
      icon={<PackagePlus />}
      size={mode === 'library' ? 'lg' : 'md'}
      bodyClassName="flex flex-col gap-3"
      footer={
        mode === 'custom' ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" icon={<PackagePlus />} loading={busy} onClick={() => void addCustom()}>
              Añadir
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs<Mode>
          variant="pills"
          size="sm"
          value={mode}
          onChange={setMode}
          items={[
            { id: 'library', label: 'Biblioteca', icon: <BookOpen /> },
            { id: 'custom', label: 'Personalizado', icon: <PenLine /> },
          ]}
        />
        {mode === 'library' && (
          <NumberInput
            label="Cantidad"
            size="sm"
            integer
            min={1}
            max={999}
            value={quantity}
            onChange={setQuantity}
            containerClassName="w-28"
          />
        )}
      </div>
      {mode === 'library' ? (
        <div className="min-h-[22rem] flex-1">
          <LibraryBrowser kinds={['item']} initialKind="item" compact campaignId={campaignId} onPick={(e) => void pick(e)} pickLabel="Añadir" className="h-full" />
        </div>
      ) : (
        <ItemFields value={draft} onChange={setDraft} allowEquip={allowEquip} currencyShort={currencyShort} nameError={nameError} />
      )}
    </Modal>
  );
}
