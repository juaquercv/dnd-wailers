import { useState, type MouseEvent } from 'react';
import clsx from 'clsx';
import { Bird, Footprints, Settings2, Swords } from 'lucide-react';
import { actionBudget, heroMoveCells, isCombatActive, moveBudget, sessionOptionsOf, usageOf, type LiveState, type SessionOptions } from '@wailers/shared';
import { useContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu';
import { IconButton } from '../../../components/ui/IconButton';
import { toast } from '../../../components/ui/toast';
import { send } from './actions';
import { usePanelContext } from './context';

/** DM menu with the turn rules of the session (turn economy, free actions). */
function useTurnRulesMenu(state: LiveState | null) {
  const menu = useContextMenu();
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (!state) return;
    const o = sessionOptionsOf(state);
    const set = (patch: Partial<SessionOptions>, text: string) => void send('session:setOptions', { patch }, { success: text, error: 'No se pudo cambiar la opción' });
    const r = e.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem[] = [
      { heading: true, label: 'Reglas del turno' },
      {
        label: 'Limitar movimiento y acciones en combate',
        checked: o.turnEconomy,
        onClick: () => set({ turnEconomy: !o.turnEconomy }, o.turnEconomy ? 'Combate sin límites de turno' : 'En combate cada héroe se mueve y actúa solo en su turno'),
      },
      {
        label: 'Los jugadores pueden recoger objetos',
        checked: o.playersCanPickUp,
        onClick: () => set({ playersCanPickUp: !o.playersCanPickUp }, o.playersCanPickUp ? 'Solo el DM reparte los objetos del mapa' : 'Los jugadores pueden recoger objetos (gratis)'),
      },
      {
        label: 'Los jugadores pueden abrir y cerrar puertas',
        checked: o.playersCanUseDoors,
        onClick: () => set({ playersCanUseDoors: !o.playersCanUseDoors }, o.playersCanUseDoors ? 'Solo el DM abre las puertas' : 'Los jugadores pueden usar las puertas (gratis)'),
      },
    ];
    menu.openAt(Math.max(8, r.right - 280), r.bottom + 4, items);
  };
}

/**
 * Combat on/off. DM: big toggle + turn rules; players: a status line. In combat each hero moves and acts
 * only on its own turn (when the turn economy option is on); exploration is free.
 */
export function CombatBar({ className }: { className?: string }) {
  const ctx = usePanelContext();
  const { state } = ctx;
  const openRules = useTurnRulesMenu(state);
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const combat = isCombatActive(state);
  const economy = sessionOptionsOf(state).turnEconomy;

  if (!ctx.canManage) {
    if (!combat) return null;
    return (
      <div className={clsx('flex items-center gap-2 rounded-lg border border-blood-500/50 bg-blood-600/15 px-2.5 py-1.5 text-xs text-blood-100', className)}>
        <Swords className="h-3.5 w-3.5 shrink-0 text-blood-300" aria-hidden />
        <span className="font-display font-semibold uppercase tracking-wider">Combate en curso</span>
      </div>
    );
  }

  const toggle = async () => {
    setBusy(true);
    const next = !combat;
    const ok = await send('combat:set', { active: next }, { error: next ? 'No se pudo iniciar el combate' : 'No se pudo terminar el combate' });
    setBusy(false);
    if (!ok) return;
    if (next) {
      toast.success('¡Comienza el combate!', {
        description: economy ? 'Cada héroe se mueve y actúa solo en su turno.' : 'Sin límites de movimiento ni acciones.',
      });
      if (state.turn.order.length === 0) toast.info('La iniciativa está vacía: sincroniza a los jugadores y añade a las criaturas.');
    } else {
      toast.success('Fin del combate: exploración libre');
    }
  };

  return (
    <div
      className={clsx(
        'rounded-xl border px-2.5 py-2 transition-colors',
        combat ? 'border-blood-500/60 bg-gradient-to-r from-blood-700/40 via-ink-800/80 to-blood-700/30 shadow-glow-blood' : 'border-ink-600/80 bg-ink-800/60',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={clsx(
            'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 font-display text-sm font-bold uppercase tracking-wider transition disabled:opacity-60',
            combat
              ? 'border-emerald-500/60 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30'
              : 'border-blood-400/70 bg-gradient-to-b from-blood-500 to-blood-600 text-parchment-50 shadow-[0_0_18px_-6px_rgba(224,98,90,0.9)] hover:brightness-110',
          )}
          title={combat ? 'Volver a la exploración libre (sin límites de turno)' : 'Activar los turnos: cada héroe se mueve y actúa en su turno'}
        >
          {combat ? <Bird className="h-4 w-4 shrink-0" aria-hidden /> : <Swords className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="truncate">{combat ? 'Terminar combate' : 'Iniciar combate'}</span>
        </button>
        <IconButton icon={<Settings2 />} title="Reglas del turno" size="sm" variant="secondary" onClick={openRules} />
      </div>
      <p className={clsx('mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug', combat ? 'text-blood-100' : 'text-parchment-400')}>
        {combat ? <Swords className="mt-px h-3 w-3 shrink-0 text-blood-300" aria-hidden /> : <Footprints className="mt-px h-3 w-3 shrink-0" aria-hidden />}
        {combat
          ? economy
            ? `Combate · ronda ${state.turn.round}: cada héroe se mueve y actúa solo en su turno.`
            : `Combate · ronda ${state.turn.round}: sin límites de movimiento ni acciones.`
          : 'Exploración: los jugadores se mueven libremente (si les dejas).'}
      </p>
    </div>
  );
}

export interface UsageChipProps {
  state: LiveState;
  heroId: string;
  heroName: string;
  /** DM: click opens the adjustments. */
  manage: boolean;
  /** It is this hero's turn (highlight). */
  current?: boolean;
  className?: string;
}

/** "Mov 4/6 · Acc 1/1" (what is LEFT this turn). DM: click to reset or grant extra movement / actions. */
export function UsageChip({ state, heroId, heroName, manage, current = false, className }: UsageChipProps) {
  const menu = useContextMenu();
  const move = moveBudget(state, heroId);
  const actions = actionBudget(state, heroId);
  const usage = usageOf(state, heroId);
  const hero = state.heroes[heroId];
  const fullMove = hero ? heroMoveCells(hero.data) : move.max;
  const title = `${heroName}: le ${move.left === 1 ? 'queda' : 'quedan'} ${move.left} de ${move.max} casillas y ${actions.left} de ${actions.max} ${actions.max === 1 ? 'acción' : 'acciones'} este turno`;

  const adjust = (patch: { reset?: boolean; movedDelta?: number; actionsDelta?: number; bonusMoveDelta?: number; bonusActionsDelta?: number }, text: string) =>
    void send('usage:adjust', { heroId, ...patch }, { success: text, error: 'No se pudo ajustar el turno' });

  const open = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem[] = [
      { heading: true, label: `Turno de ${heroName}` },
      { label: 'Reiniciar movimiento y acciones', onClick: () => adjust({ reset: true }, `${heroName}: turno reiniciado`) },
      { separator: true },
      { label: '+1 acción de combate', onClick: () => adjust({ bonusActionsDelta: 1 }, `${heroName}: +1 acción`) },
      { label: '+1 casilla', onClick: () => adjust({ bonusMoveDelta: 1 }, `${heroName}: +1 casilla`) },
      { label: '+3 casillas', onClick: () => adjust({ bonusMoveDelta: 3 }, `${heroName}: +3 casillas`) },
      { label: `+${fullMove} casillas (correr)`, onClick: () => adjust({ bonusMoveDelta: fullMove }, `${heroName}: +${fullMove} casillas`) },
      { separator: true },
      { label: 'Gastar 1 acción', disabled: actions.left <= 0, onClick: () => adjust({ actionsDelta: 1 }, `${heroName}: −1 acción`) },
      { label: 'Devolver 1 acción', disabled: usage.actions <= 0, onClick: () => adjust({ actionsDelta: -1 }, `${heroName}: acción devuelta`) },
      { label: 'Devolver 1 casilla', disabled: usage.moved <= 0, onClick: () => adjust({ movedDelta: -1 }, `${heroName}: casilla devuelta`) },
    ];
    if (usage.bonusMove > 0 || usage.bonusActions > 0) {
      items.push({
        label: 'Quitar los extras concedidos',
        danger: true,
        onClick: () => adjust({ bonusMoveDelta: -usage.bonusMove, bonusActionsDelta: -usage.bonusActions }, `${heroName}: extras retirados`),
      });
    }
    menu.openAt(Math.max(8, r.left), r.bottom + 4, items);
  };

  const body = (
    <>
      <span className={clsx('inline-flex items-center gap-0.5', move.left === 0 ? 'text-parchment-400' : 'text-sky-200')}>
        <Footprints className="h-3 w-3" aria-hidden />
        <span className="tabular-nums">
          {move.left}/{move.max}
        </span>
      </span>
      <span aria-hidden className="text-parchment-400/60">·</span>
      <span className={clsx('inline-flex items-center gap-0.5', actions.left === 0 ? 'text-parchment-400' : 'text-blood-200')}>
        <Swords className="h-3 w-3" aria-hidden />
        <span className="tabular-nums">
          {actions.left}/{actions.max}
        </span>
      </span>
    </>
  );
  const classes = clsx(
    'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold',
    current ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-500 bg-ink-900/70',
    className,
  );

  if (!manage) {
    return (
      <span className={classes} title={title}>
        {body}
      </span>
    );
  }
  return (
    <button type="button" onClick={open} className={clsx(classes, 'transition hover:border-gold-500 hover:bg-ink-800')} title={`${title} · clic para ajustar`}>
      {body}
    </button>
  );
}
