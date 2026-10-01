import { Backpack, Coins, Infinity as InfinityIcon, LayoutGrid, Scale } from 'lucide-react';
import type { RuleSystem } from '@wailers/shared';
import { NumberInput } from '../../../../components/ui/NumberInput';
import { TextInput } from '../../../../components/ui/TextInput';
import { Toggle } from '../../../../components/ui/Toggle';
import { formatGold } from '../../../../lib/format';
import { RadioCards } from '../../../campaigns/RadioCards';
import { InfoNote, SettingsSection } from '../SettingsSection';
import type { RuleSectionProps } from './ruleUtils';

type InventoryMode = RuleSystem['inventory']['mode'];

/** Carrying limits (reference only: warnings, never enforced). */
export function InventorySection({ rules, update, id }: RuleSectionProps & { id: string }) {
  const inv = rules.inventory;
  return (
    <SettingsSection
      id={id}
      icon={<Backpack />}
      title="Inventario"
      description="Cómo se mide lo que carga cada héroe. Es solo una referencia: se avisa al pasarse del límite, nunca se bloquea."
    >
      <RadioCards<InventoryMode>
        aria-label="Límite del inventario"
        columns={3}
        size="sm"
        value={inv.mode}
        onChange={(mode) =>
          update((d) => {
            d.inventory.mode = mode;
          })
        }
        options={[
          { value: 'none', title: 'Sin límite', description: 'Cada héroe lleva todo lo que quiera.', icon: <InfinityIcon />, accent: '#a8946b' },
          { value: 'weight', title: 'Por peso', description: 'Suma el peso de los objetos (kg).', icon: <Scale />, accent: '#e9c063' },
          { value: 'slots', title: 'Por espacios', description: 'Cada objeto ocupa uno o más huecos.', icon: <LayoutGrid />, accent: '#38bdf8' },
        ]}
      />
      {inv.mode === 'weight' && (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
          <NumberInput
            label="Peso máximo"
            min={0}
            max={100000}
            step={5}
            value={inv.maxWeight}
            suffix="kg"
            hint="Por héroe. Se muestra una barra de carga en el inventario."
            onChange={(v) =>
              update((d) => {
                d.inventory.maxWeight = v;
              })
            }
          />
        </div>
      )}
      {inv.mode === 'slots' && (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
          <NumberInput
            label="Espacios máximos"
            integer
            min={0}
            max={1000}
            value={inv.maxSlots}
            hint="Por héroe. Cada objeto indica cuántos espacios ocupa."
            onChange={(v) =>
              update((d) => {
                d.inventory.maxSlots = v;
              })
            }
          />
        </div>
      )}
    </SettingsSection>
  );
}

/** Currency name and abbreviation. */
export function CurrencySection({ rules, update, id }: RuleSectionProps & { id: string }) {
  const cur = rules.currency;
  return (
    <SettingsSection
      id={id}
      icon={<Coins />}
      title="Moneda"
      description="La moneda que llevan los héroes. El DM la ajusta a mano; las tiradas nunca la cambian solas."
    >
      <Toggle
        checked={cur.enabled}
        onChange={(v) =>
          update((d) => {
            d.currency.enabled = v;
          })
        }
        label="Usar moneda"
        description="Si la desactivas, las hojas no muestran dinero."
      />
      {cur.enabled ? (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
          <TextInput
            label="Nombre"
            value={cur.name}
            maxLength={24}
            placeholder="Oro"
            onValueChange={(v) =>
              update((d) => {
                d.currency.name = v;
              })
            }
          />
          <TextInput
            label="Abreviatura"
            value={cur.short}
            maxLength={6}
            placeholder="po"
            onValueChange={(v) =>
              update((d) => {
                d.currency.short = v;
              })
            }
          />
          <div className="flex h-[38px] items-center gap-2 rounded-lg border border-gold-700/40 bg-gold-500/[0.07] px-3 text-sm">
            <Coins className="h-4 w-4 text-gold-400" />
            <span className="font-semibold tabular-nums text-gold-200">{formatGold(1250, false, cur.short.trim() || null)}</span>
          </div>
        </div>
      ) : (
        <InfoNote>Los héroes conservan su dinero guardado por si lo usas en otra campaña.</InfoNote>
      )}
    </SettingsSection>
  );
}
