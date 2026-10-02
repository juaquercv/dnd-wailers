import { useState } from 'react';
import { Hand } from 'lucide-react';
import { normalizeText, type InventoryItem } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { send } from './actions';

const CONSUMABLE_WORDS = [
  'pocion',
  'elixir',
  'pergamino',
  'racion',
  'flecha',
  'virote',
  'saeta',
  'dardo',
  'bala',
  'municion',
  'bomba',
  'granada',
  'antidoto',
  'venda',
  'vendaje',
  'botiquin',
  'aceite',
  'frasco',
  'vial',
  'tonico',
  'brebaje',
  'balsamo',
  'unguento',
  'hierba',
  'comida',
  'cerveza',
  'vino',
  'agua bendita',
  'antorcha',
  'cartucho',
  'carga',
  'tinte',
  'polvora',
  'pocima',
  'remedio',
];

/** Items that are normally spent when used (potions, scrolls, ammunition, rations...). */
export function isConsumableItem(item: Pick<InventoryItem, 'name' | 'description'>): boolean {
  const name = normalizeText(item.name);
  return CONSUMABLE_WORDS.some((w) => name.includes(w));
}

/** Using it may spend a unit: consumables and stacks. */
export function asksToConsume(item: InventoryItem): boolean {
  return item.quantity > 1 || isConsumableItem(item);
}

/** item:use with a toast. Never applies effects: only the log, the combat action and (optionally) one unit. */
export function sendItemUse(heroId: string, item: InventoryItem, consume: boolean, heroName?: string): Promise<boolean> {
  const left = item.quantity - 1;
  const what = heroName ? `${heroName} usa ${item.name}` : `Usas ${item.name}`;
  const success = consume ? (left > 0 ? `${what} (${heroName ? 'quedan' : 'te quedan'} ${left})` : `${what} (era el último)`) : what;
  return send('item:use', { heroId, itemId: item.id, consume }, { success, error: 'No se pudo usar el objeto' });
}

export interface ItemUseConfirmProps {
  heroId: string;
  item: InventoryItem;
  /** Text under the toggle about the turn cost (e.g. "Gasta 1 acción de combate"). */
  costNote?: string | null;
  /** Third-person wording in the toast (DM using an item for a hero). */
  heroName?: string;
  onDone: () => void;
}

/** Inline "¿Gastar una unidad?" confirmation for consumables and stacks. */
export function ItemUseConfirm({ heroId, item, costNote, heroName, onDone }: ItemUseConfirmProps) {
  const [consume, setConsume] = useState(() => isConsumableItem(item));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const ok = await sendItemUse(heroId, item, consume, heroName);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="animate-fade-in space-y-2 rounded-lg border border-gold-700/40 bg-gold-500/5 px-2.5 py-2">
      <Toggle
        size="sm"
        checked={consume}
        onChange={setConsume}
        label="¿Gastar una unidad?"
        description={
          consume
            ? item.quantity > 1
              ? `Quedarán ${item.quantity - 1}`
              : 'Es el último: desaparecerá de la mochila'
            : 'El objeto se queda en la mochila'
        }
      />
      {costNote && <p className="text-[11px] leading-snug text-parchment-400">{costNote}</p>}
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" variant="primary" icon={<Hand />} loading={busy} onClick={() => void run()}>
          Usar
        </Button>
      </div>
    </div>
  );
}
