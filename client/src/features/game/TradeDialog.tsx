import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Coins, Handshake, Info, Send } from 'lucide-react';
import { RARITY_INFO } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NumberInput } from '../../components/ui/NumberInput';
import { Select } from '../../components/ui/Select';
import { TextArea } from '../../components/ui/TextArea';
import { formatGold } from '../../lib/format';
import { send } from './panels/actions';
import { usePanelContext } from './panels/context';
import { composeTradeNote, TRADE_NOTE_TEXT_MAX } from './panels/tradeUtils';

export interface TradeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select an item of my inventory. */
  initialItemId?: string | null;
  /** Pre-select the receiving player. */
  initialTargetUserId?: string | null;
}

/**
 * Player → player trade offer: items (with quantities) from my inventory and gold, plus a note.
 * The receiver accepts or rejects; the DM may have to approve (session option).
 */
export function TradeDialog({ open, onClose, initialItemId = null, initialTargetUserId = null }: TradeDialogProps) {
  const ctx = usePanelContext();
  const { state, rules } = ctx;
  const meId = ctx.viewerId;
  const myHeroId = state && meId ? state.players[meId]?.heroId ?? null : null;
  const myHero = state && myHeroId ? state.heroes[myHeroId] ?? null : null;
  const currencyShort = rules.currency.short || 'po';

  const targets = useMemo(() => {
    if (!state || !meId) return [];
    return Object.values(state.players)
      .filter((p) => p.userId !== meId && p.heroId && p.heroId !== myHeroId && state.heroes[p.heroId])
      .map((p) => ({ player: p, hero: state.heroes[p.heroId!]! }));
  }, [state, meId, myHeroId]);

  const [targetId, setTargetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [gold, setGold] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialTarget = targets.find((t) => t.player.userId === initialTargetUserId) ?? (targets.length === 1 ? targets[0] : undefined);
    setTargetId(initialTarget?.player.userId ?? null);
    const item = initialItemId ? myHero?.data.inventory.find((i) => i.id === initialItemId) : undefined;
    setSelected(item ? { [item.id]: 1 } : {});
    setGold(0);
    setNote('');
    setBusy(false);
    // Initialise only when the dialog opens.
  }, [open]);

  const inventory = myHero?.data.inventory ?? [];
  const myGold = myHero?.data.gold ?? 0;
  const currencyOn = rules.currency.enabled;
  const chosen = inventory.filter((i) => (selected[i.id] ?? 0) > 0);
  const effectiveGold = currencyOn ? Math.min(gold, myGold) : 0;
  const canSubmit = !!targetId && (chosen.length > 0 || effectiveGold > 0) && !busy;
  const target = targets.find((t) => t.player.userId === targetId) ?? null;

  const toggle = (itemId: string, on: boolean) =>
    setSelected((s) => {
      const next = { ...s };
      if (on) next[itemId] = 1;
      else delete next[itemId];
      return next;
    });

  const submit = async () => {
    if (!targetId || !canSubmit) return;
    const items = chosen.map((i) => ({ itemId: i.id, quantity: Math.min(i.quantity, Math.max(1, selected[i.id] ?? 1)) }));
    const parts = chosen.map((i) => {
      const q = Math.min(i.quantity, Math.max(1, selected[i.id] ?? 1));
      return q > 1 ? `${i.name} ×${q}` : i.name;
    });
    if (effectiveGold > 0) parts.push(formatGold(effectiveGold, false, currencyShort));
    setBusy(true);
    const ok = await send(
      'trade:offer',
      { toUserId: targetId, items, gold: effectiveGold, note: composeTradeNote(note, parts.join(', ')) },
      { success: `Oferta enviada a ${target?.player.name ?? 'su destinatario'}` },
    );
    setBusy(false);
    if (ok) onClose();
  };

  const body = () => {
    if (!state || !myHero) {
      return <EmptyState compact icon={<Handshake />} title="Sin héroe" description="Necesitas un héroe en la partida para comerciar." />;
    }
    if (targets.length === 0) {
      return <EmptyState compact icon={<Handshake />} title="Nadie con quien comerciar" description="No hay otros jugadores con héroe en la sesión." />;
    }
    return (
      <div className="space-y-4">
        <Select<string | null>
          label="Para"
          value={targetId}
          placeholder="Elige un compañero…"
          options={targets.map((t) => ({ value: t.player.userId, label: `${t.hero.name} (${t.player.name})` }))}
          onChange={setTargetId}
        />
        {target && (
          <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-3 py-2">
            <Avatar name={target.hero.name} imageUrl={target.hero.imageUrl} color={target.player.color} size="sm" ring />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-parchment-50">{target.hero.name}</div>
              <div className="text-[11px]" style={{ color: target.player.color }}>
                {target.player.name}
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="label">Objetos que ofreces</div>
          {inventory.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-500 px-3 py-3 text-center text-xs text-parchment-400">Tu inventario está vacío.</p>
          ) : (
            <ul className="scroll-thin max-h-60 space-y-1 overflow-y-auto pr-1">
              {inventory.map((item) => {
                const on = (selected[item.id] ?? 0) > 0;
                const color = item.rarity && item.rarity !== 'common' ? RARITY_INFO[item.rarity].color : undefined;
                return (
                  <li
                    key={item.id}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg border px-2 py-1.5 transition',
                      on ? 'border-gold-600/60 bg-gold-500/10' : 'border-ink-600/70 bg-ink-800/50',
                    )}
                  >
                    <Checkbox
                      checked={on}
                      onChange={(v) => toggle(item.id, v)}
                      label={
                        <span className="truncate" style={color ? { color } : undefined}>
                          {item.name}
                          {item.equipped && <span className="ml-1 text-[10px] text-gold-400">(equipado)</span>}
                        </span>
                      }
                      className="min-w-0 flex-1"
                    />
                    {item.quantity > 1 &&
                      (on ? (
                        <NumberInput
                          size="sm"
                          integer
                          min={1}
                          max={item.quantity}
                          value={selected[item.id] ?? 1}
                          onChange={(v) => setSelected((s) => ({ ...s, [item.id]: v }))}
                          suffix={`/${item.quantity}`}
                          containerClassName="w-20"
                          aria-label={`Cantidad de ${item.name}`}
                        />
                      ) : (
                        <span className="text-xs tabular-nums text-parchment-400">×{item.quantity}</span>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {currencyOn && (
          <NumberInput
            label={rules.currency.name || 'Oro'}
            integer
            min={0}
            max={myGold}
            value={Math.min(gold, myGold)}
            onChange={setGold}
            suffix={currencyShort}
            disabled={myGold <= 0}
            hint={`Tienes ${formatGold(myGold, false, currencyShort)}.`}
          />
        )}

        <TextArea
          label="Nota (opcional)"
          rows={2}
          autoResize
          maxRows={5}
          maxLength={TRADE_NOTE_TEXT_MAX}
          value={note}
          placeholder="Por la poción que me diste en la cripta…"
          hint={`${note.length}/${TRADE_NOTE_TEXT_MAX}`}
          onValueChange={setNote}
        />

        {state.options.tradeNeedsApproval && (
          <p className="flex items-start gap-2 rounded-lg border border-gold-700/40 bg-gold-500/5 px-3 py-2 text-xs text-gold-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Si tu compañero acepta, el DM tendrá que aprobar el intercambio.
          </p>
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ofrecer intercambio"
      subtitle={myHero ? `Desde el inventario de ${myHero.name} · no gasta acción ni movimiento` : undefined}
      icon={<Handshake />}
      size="md"
      footer={
        <>
          {currencyOn && effectiveGold > 0 && (
            <span className="mr-auto flex items-center gap-1 text-xs text-gold-300">
              <Coins className="h-3.5 w-3.5" />
              {formatGold(effectiveGold, false, currencyShort)}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Send />} loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            Enviar oferta
          </Button>
        </>
      }
    >
      {body()}
    </Modal>
  );
}
