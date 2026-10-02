import clsx from 'clsx';
import { Compass, Footprints, Hourglass, Lock, Swords } from 'lucide-react';
import type { Budget } from '@wailers/shared';
import { cellsText, type HeroEconomy } from './economy';

/** Remaining movement this turn: one segment per cell (continuous bar for long moves). */
export function MoveMeter({ budget, dim = false, compact = false }: { budget: Budget; dim?: boolean; compact?: boolean }) {
  const { max, left } = budget;
  const segmented = max > 0 && max <= 12;
  return (
    <div className={clsx('min-w-0', dim && 'opacity-55')} title={`Te ${left === 1 ? 'queda' : 'quedan'} ${cellsText(left)} de ${max} este turno`}>
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
        <span className="flex items-center gap-1 text-sky-300">
          <Footprints className="h-3 w-3" aria-hidden />
          Movimiento
        </span>
        <span className="tabular-nums normal-case tracking-normal text-parchment-100">
          <strong className={clsx('text-xs', left === 0 ? 'text-blood-300' : 'text-parchment-50')}>{left}</strong>
          <span className="text-parchment-400"> / {max}</span>
          {!compact && <span className="ml-1 font-normal text-parchment-400">{max === 1 ? 'casilla' : 'casillas'}</span>}
        </span>
      </div>
      {segmented ? (
        <div className="flex gap-0.5" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={left} aria-label="Movimiento restante">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={clsx(
                'h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-300',
                i < left ? 'bg-gradient-to-r from-sky-500 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.45)]' : 'bg-ink-700',
              )}
            />
          ))}
        </div>
      ) : (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-700" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={left} aria-label="Movimiento restante">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300 transition-[width] duration-300"
            style={{ width: `${max > 0 ? Math.round((left / max) * 100) : 0}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Combat actions left this turn as pips (filled = available). */
export function ActionPips({ budget, dim = false }: { budget: Budget; dim?: boolean }) {
  const { max, left } = budget;
  return (
    <div className={clsx('min-w-0', dim && 'opacity-55')} title={`Te ${left === 1 ? 'queda' : 'quedan'} ${left} de ${max} ${max === 1 ? 'acción' : 'acciones'} de combate este turno`}>
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
        <span className="flex items-center gap-1 text-blood-300">
          <Swords className="h-3 w-3" aria-hidden />
          Acciones
        </span>
        <span className="tabular-nums normal-case tracking-normal">
          <strong className={clsx('text-xs', left === 0 ? 'text-blood-300' : 'text-parchment-50')}>{left}</strong>
          <span className="text-parchment-400"> / {max}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={left} aria-label="Acciones de combate restantes">
        {max === 0 ? (
          <span className="text-[10px] italic text-parchment-400">Sin acciones</span>
        ) : (
          Array.from({ length: Math.min(max, 8) }, (_, i) => (
            <span
              key={i}
              className={clsx(
                'h-2.5 w-2.5 rotate-45 rounded-[2px] border transition-colors duration-300',
                i < left ? 'border-blood-300 bg-gradient-to-br from-blood-300 to-blood-500 shadow-[0_0_6px_rgba(224,98,90,0.6)]' : 'border-ink-500 bg-ink-800',
              )}
            />
          ))
        )}
      </div>
    </div>
  );
}

export type TurnTone = 'explore' | 'mine' | 'other' | 'locked';

/** Turn status of the hero in a few words. */
export function turnStatus(eco: HeroEconomy, canMove: boolean): { tone: TurnTone; text: string; hint: string } {
  if (!eco.combat) {
    if (!canMove) return { tone: 'locked', text: 'Movimiento bloqueado', hint: 'El DM ha bloqueado el movimiento de tu ficha por ahora.' };
    return { tone: 'explore', text: 'Exploración libre', hint: 'Fuera de combate puedes moverte y actuar sin límites de turno.' };
  }
  if (eco.myTurn) {
    return {
      tone: 'mine',
      text: '¡Es tu turno!',
      hint: eco.limited ? 'Muévete, usa tus acciones de combate y pulsa «Terminar turno» al acabar.' : 'Combate sin límites de movimiento ni acciones.',
    };
  }
  return {
    tone: 'other',
    text: eco.currentName ? `Turno de ${eco.currentName}` : 'Combate en curso',
    hint: eco.limited ? 'Espera tu turno para moverte o usar acciones de combate. Hablar, intercambiar y tirar dados siempre se puede.' : 'Combate en curso.',
  };
}

const TONE_CLASS: Record<TurnTone, string> = {
  explore: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  mine: 'animate-glow-pulse border-gold-400/80 bg-gold-500/20 text-gold-100 shadow-glow-gold',
  other: 'border-blood-500/50 bg-blood-600/15 text-blood-200',
  locked: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
};

const TONE_ICON: Record<TurnTone, typeof Compass> = { explore: Compass, mine: Swords, other: Hourglass, locked: Lock };

export function TurnStatusPill({ tone, text, hint, className }: { tone: TurnTone; text: string; hint?: string; className?: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      role="status"
      title={hint}
      className={clsx(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider',
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

/** Movement + actions of the current turn, with a line saying why something is blocked. */
export function EconomyMeters({ eco, className }: { eco: HeroEconomy; className?: string }) {
  if (!eco.combat) return null;
  if (!eco.limited) {
    return <p className={clsx('text-[11px] italic text-parchment-400', className)}>Combate sin límites: el DM no cuenta movimiento ni acciones.</p>;
  }
  const dim = !eco.myTurn;
  return (
    <div className={clsx('space-y-1', className)}>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
        <MoveMeter budget={eco.move} dim={dim} />
        <ActionPips budget={eco.actions} dim={dim} />
      </div>
      {dim && <p className="text-[10px] leading-snug text-parchment-400">Se recargan al empezar tu turno.</p>}
    </div>
  );
}
