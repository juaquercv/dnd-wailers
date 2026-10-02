import { useState } from 'react';
import clsx from 'clsx';
import { Backpack, Coins, Gift, Hand, Shield } from 'lucide-react';
import { RARITY_INFO, type HeroSheet, type InventoryItem, type RuleSystem } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { formatGold, formatNumber } from '../../../lib/format';
import { ItemThumb } from '../InventoryList';
import { asksToConsume, ItemUseConfirm, sendItemUse } from '../panels/itemUse';
import { CostNotice } from './SpellsMenu';
import type { HeroEconomy } from './economy';

export interface ItemsMenuProps {
  hero: HeroSheet;
  rules: RuleSystem;
  eco: HeroEconomy;
  readOnly: boolean;
  /** Someone to give things to. */
  canGive: boolean;
  onGive: (item: InventoryItem) => void;
}

/** HUD backpack: use an item (logged, may spend a unit) or give it to a teammate (free). */
export function ItemsMenu({ hero, rules, eco, readOnly, canGive, onGive }: ItemsMenuProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const items = hero.data.inventory;
  const currencyShort = rules.currency.short || 'po';

  const use = async (item: InventoryItem) => {
    if (asksToConsume(item)) {
      setConfirming((cur) => (cur === item.id ? null : item.id));
      return;
    }
    setBusy(item.id);
    await sendItemUse(hero.id, item, false);
    setBusy(null);
  };

  return (
    <div>
      <CostNotice eco={eco} what="Usar un objeto" />
      {items.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <Backpack className="mx-auto mb-2 h-6 w-6 text-parchment-400" aria-hidden />
          <p className="text-sm font-semibold text-parchment-200">Tu mochila está vacía</p>
          <p className="mt-1 text-xs text-parchment-400">Recoge objetos del mapa o pide al DM que te los dé.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => {
            const open = expanded === item.id;
            const rarity = item.rarity ? RARITY_INFO[item.rarity] : null;
            const nameColor = rarity && item.rarity !== 'common' ? rarity.color : undefined;
            return (
              <li key={item.id} className={clsx('rounded-xl border transition', open || confirming === item.id ? 'border-gold-700/50 bg-ink-800' : 'border-ink-600/60 bg-ink-800/50 hover:border-ink-500')}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <ItemThumb item={item} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(open ? null : item.id)} aria-expanded={open} title="Ver detalles">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-parchment-50" style={nameColor ? { color: nameColor } : undefined}>
                        {item.name}
                      </span>
                      {item.quantity !== 1 && <span className="shrink-0 text-xs font-semibold tabular-nums text-parchment-300">×{formatNumber(item.quantity, 0)}</span>}
                      {item.equipped && <Shield className="h-3 w-3 shrink-0 text-gold-400" fill="currentColor" fillOpacity={0.25} aria-label="Equipado" />}
                    </span>
                    <span className="flex items-center gap-2 text-[10px] text-parchment-400">
                      {rarity && <span style={{ color: rarity.color }}>{rarity.label}</span>}
                      {rules.currency.enabled && item.value > 0 && <span>{formatGold(item.value, true, currencyShort)}</span>}
                      {eco.limited && <span className="text-blood-300">Usar: 1 acción</span>}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Hand />}
                    loading={busy === item.id}
                    disabled={readOnly || !!eco.actionBlock}
                    title={readOnly ? 'Vista previa: solo el jugador puede usarlo' : eco.actionBlock ?? 'Usar (queda registrado; el DM aplica el efecto)'}
                    onClick={() => void use(item)}
                  >
                    Usar
                  </Button>
                  {canGive && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Gift />}
                      disabled={readOnly}
                      title="Dárselo a un compañero (no gasta acción)"
                      onClick={() => onGive(item)}
                    >
                      Dar
                    </Button>
                  )}
                </div>
                {confirming === item.id && (
                  <div className="px-2 pb-2">
                    <ItemUseConfirm heroId={hero.id} item={item} onDone={() => setConfirming(null)} />
                  </div>
                )}
                {open && (
                  <div className="animate-fade-in space-y-1 border-t border-ink-600/60 px-3 py-2 text-xs leading-relaxed text-parchment-300">
                    {item.description ? <p className="whitespace-pre-line">{item.description}</p> : <p className="italic text-parchment-400">Sin descripción.</p>}
                    {item.notes && (
                      <p className="text-parchment-200">
                        <span className="font-semibold text-gold-300">Notas: </span>
                        {item.notes}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rules.currency.enabled && (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-gold-200">
          <Coins className="h-3.5 w-3.5 text-gold-400" aria-hidden />
          {formatGold(hero.data.gold, false, currencyShort)}
        </p>
      )}
    </div>
  );
}
