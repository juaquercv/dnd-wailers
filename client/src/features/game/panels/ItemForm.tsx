import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { RARITIES, RARITY_INFO, type InventoryItem, type Rarity } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { ImageUpload } from '../../../components/ui/ImageUpload';
import { Modal } from '../../../components/ui/Modal';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { TextArea } from '../../../components/ui/TextArea';
import { TextInput } from '../../../components/ui/TextInput';
import { Toggle } from '../../../components/ui/Toggle';

/** Editable subset of an inventory item. */
export type ItemDraft = Pick<InventoryItem, 'name' | 'imageUrl' | 'quantity' | 'weight' | 'value' | 'slots' | 'rarity' | 'description' | 'equipped' | 'notes'>;

export function emptyItemDraft(): ItemDraft {
  return { name: '', imageUrl: null, quantity: 1, weight: 0, value: 0, slots: 1, rarity: null, description: '', equipped: false, notes: '' };
}

export function draftFromItem(item: InventoryItem): ItemDraft {
  return {
    name: item.name,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    weight: item.weight,
    value: item.value,
    slots: item.slots,
    rarity: item.rarity,
    description: item.description,
    equipped: item.equipped,
    notes: item.notes,
  };
}

const RARITY_OPTIONS: SelectOption<Rarity | null>[] = [
  { value: null, label: 'Sin rareza' },
  ...RARITIES.map((r) => ({ value: r, label: RARITY_INFO[r].label })),
];

export interface ItemFieldsProps {
  value: ItemDraft;
  onChange: (next: ItemDraft) => void;
  /** Show the "equipado" toggle (hero inventories). */
  allowEquip?: boolean;
  currencyShort: string;
  nameError?: string | null;
}

/** Fields of a custom / edited inventory item. */
export function ItemFields({ value, onChange, allowEquip = false, currencyShort, nameError }: ItemFieldsProps) {
  const set = <K extends keyof ItemDraft>(key: K, v: ItemDraft[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-3">
      <div className="row-span-2">
        <ImageUpload value={value.imageUrl} onChange={(url) => set('imageUrl', url)} aspect="square" allowUrl={false} label="Imagen" />
      </div>
      <TextInput
        label="Nombre"
        required
        value={value.name}
        error={nameError ?? undefined}
        placeholder="Cuerda de cáñamo, llave oxidada…"
        onValueChange={(v) => set('name', v)}
        data-autofocus
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Cantidad" integer min={1} max={9999} value={value.quantity} onChange={(v) => set('quantity', v)} />
        <Select<Rarity | null> label="Rareza" value={value.rarity} options={RARITY_OPTIONS} onChange={(v) => set('rarity', v)} />
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-2">
        <NumberInput label="Peso" min={0} max={100000} value={value.weight} suffix="kg" onChange={(v) => set('weight', v)} />
        <NumberInput label="Valor" min={0} max={100000000} value={value.value} suffix={currencyShort} onChange={(v) => set('value', v)} />
        <NumberInput label="Espacios" integer min={0} max={999} value={value.slots} onChange={(v) => set('slots', v)} />
      </div>
      <TextArea
        containerClassName="col-span-2"
        label="Descripción"
        rows={3}
        autoResize
        maxRows={8}
        value={value.description}
        onValueChange={(v) => set('description', v)}
      />
      <TextInput
        containerClassName="col-span-2"
        label="Notas"
        placeholder="Grabado con runas, prestado por el gremio…"
        value={value.notes}
        onValueChange={(v) => set('notes', v)}
      />
      {allowEquip && (
        <Toggle className="col-span-2" checked={value.equipped} onChange={(v) => set('equipped', v)} label="Equipado" description="Se muestra marcado en la ficha." />
      )}
    </div>
  );
}

export interface ItemFormModalProps {
  open: boolean;
  title: string;
  initial: ItemDraft;
  allowEquip?: boolean;
  currencyShort: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (draft: ItemDraft) => Promise<boolean>;
}

/** Modal to edit an inventory / loot item. */
export function ItemFormModal({ open, title, initial, allowEquip, currencyShort, confirmLabel = 'Guardar', onClose, onSubmit }: ItemFormModalProps) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setNameError(null);
      setBusy(false);
    }
    // Reset only when the dialog opens.
  }, [open]);

  const submit = async () => {
    if (!draft.name.trim()) {
      setNameError('El objeto necesita un nombre');
      return;
    }
    setBusy(true);
    const ok = await onSubmit({ ...draft, name: draft.name.trim() });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<Package />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <ItemFields value={draft} onChange={setDraft} allowEquip={allowEquip} currencyShort={currencyShort} nameError={nameError} />
    </Modal>
  );
}
