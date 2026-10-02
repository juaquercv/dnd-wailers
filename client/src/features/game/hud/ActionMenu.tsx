import { useState, type FormEvent } from 'react';
import { DoorOpen, EyeOff, Hand, HandHelping, Handshake, MessageSquare, Send, Shield, Sword } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { send } from '../panels/actions';
import { CostNotice } from './SpellsMenu';
import type { HeroEconomy } from './economy';

const PRESETS: { label: string; icon: typeof Sword; hint: string }[] = [
  { label: 'Ataque', icon: Sword, hint: 'Atacas a un enemigo (después tira los dados)' },
  { label: 'Esquivar', icon: Shield, hint: 'Te pones a la defensiva hasta tu próximo turno' },
  { label: 'Ayudar', icon: HandHelping, hint: 'Ayudas a un compañero en su próxima tirada' },
  { label: 'Esconderse', icon: EyeOff, hint: 'Intentas ocultarte de tus enemigos' },
];

export interface ActionMenuProps {
  heroId: string;
  eco: HeroEconomy;
  readOnly: boolean;
  onDone: () => void;
}

/** Announce a combat action (spends one in combat; outside combat it is only logged). */
export function ActionMenu({ heroId, eco, readOnly, onDone }: ActionMenuProps) {
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const blocked = readOnly || !!eco.actionBlock;
  const title = readOnly ? 'Vista previa: solo el jugador puede actuar' : eco.actionBlock ?? undefined;

  const act = async (label: string) => {
    const text = label.trim();
    if (!text || blocked) return;
    setBusy(text);
    const ok = await send('action:use', { heroId, label: text }, { success: eco.limited ? `${text}: acción de combate gastada` : `${text}: anotado en el registro`, error: 'No se pudo usar la acción' });
    setBusy(null);
    if (ok) {
      setOther('');
      onDone();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act(other);
  };

  return (
    <div className="space-y-3">
      <div>
        <CostNotice eco={eco} what="Cada acción" />
        {!eco.limited && !eco.actionBlock && (
          <p className="mb-2 px-1 text-[11px] leading-snug text-parchment-400">Fuera de combate no gasta nada: queda anotado en el registro para el DM.</p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={blocked || busy !== null}
              title={title ?? p.hint}
              onClick={() => void act(p.label)}
              className="group flex items-center gap-2 rounded-xl border border-ink-500 bg-ink-800/80 px-2.5 py-2 text-left text-sm font-semibold text-parchment-100 transition hover:border-blood-400/70 hover:bg-blood-600/15 hover:text-parchment-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-ink-500 disabled:hover:bg-ink-800/80"
            >
              <p.icon className="h-4 w-4 shrink-0 text-blood-300 transition-transform group-hover:scale-110" aria-hidden />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-1.5 flex gap-1.5">
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={80}
            disabled={blocked}
            placeholder="Otra acción… (p. ej. Empujar la mesa)"
            aria-label="Otra acción"
            className="input h-9 min-w-0 flex-1 text-sm"
          />
          <Button type="submit" size="sm" variant="primary" icon={<Send />} disabled={blocked || !other.trim()} loading={busy !== null && busy === other.trim()} title={title}>
            Hacer
          </Button>
        </form>
      </div>

      <div className="rounded-xl border border-emerald-600/30 bg-emerald-500/5 px-2.5 py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">Gratis · no gastan acción ni movimiento</p>
        <ul className="space-y-0.5 text-[11px] leading-snug text-parchment-300">
          <li className="flex items-center gap-1.5">
            <Hand className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden />
            Recoger un objeto que tengas al lado
          </li>
          <li className="flex items-center gap-1.5">
            <DoorOpen className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden />
            Abrir o cerrar una puerta junto a ti
          </li>
          <li className="flex items-center gap-1.5">
            <Handshake className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden />
            Dar e intercambiar objetos
          </li>
          <li className="flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden />
            Hablar, señalar en el mapa y tirar dados
          </li>
        </ul>
      </div>
    </div>
  );
}
