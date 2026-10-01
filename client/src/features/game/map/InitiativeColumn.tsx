import clsx from 'clsx';
import { PanelLeftClose, Swords } from 'lucide-react';
import { IconButton } from '../../../components/ui/IconButton';
import { useDisplayState } from '../../../stores/session';
import { InitiativePanel } from '../InitiativePanel';

export interface InitiativeColumnProps {
  open: boolean;
  /** Draw over the map (narrow screens). */
  overlay: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Left column of the game screen with the turn order (collapsible to a slim rail). */
export function InitiativeColumn({ open, overlay, onOpenChange }: InitiativeColumnProps) {
  const { state } = useDisplayState();
  const round = state?.turn.round ?? 0;
  const entries = state?.turn.order.length ?? 0;
  const current = state ? state.turn.order[state.turn.currentIndex] ?? null : null;

  return (
    <div className="relative flex h-full shrink-0">
      <nav aria-label="Iniciativa" className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-ink-600/80 bg-ink-950/95 py-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          title={open ? 'Ocultar la iniciativa' : 'Mostrar la iniciativa'}
          className={clsx(
            'group flex w-9 flex-col items-center gap-1 rounded-lg py-1.5 transition',
            open ? 'bg-gold-500/10 text-gold-200' : 'text-parchment-400 hover:bg-ink-800 hover:text-parchment-100',
          )}
        >
          <Swords className="h-[18px] w-[18px] transition-transform group-hover:scale-110" aria-hidden />
          {round > 0 && <span className="text-[9px] font-bold uppercase tracking-wide">R{round}</span>}
        </button>
        {!open && entries > 0 && (
          <span
            className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-parchment-400 [writing-mode:vertical-rl]"
            title={current ? `Turno de ${current.name}` : undefined}
          >
            {current ? current.name : `${entries} en combate`}
          </span>
        )}
      </nav>
      <section
        aria-label="Orden de turnos"
        className={clsx(
          'flex min-h-0 flex-col border-r border-ink-600/80 bg-ink-900/95 backdrop-blur',
          overlay ? 'absolute inset-y-0 left-full z-40 w-[min(19rem,calc(100vw-3rem))] shadow-modal' : 'relative w-64 xl:w-72',
          open ? (overlay ? 'animate-fade-in' : '') : 'hidden',
        )}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-600/70 px-3">
          <Swords className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
          <h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold uppercase tracking-[0.14em] text-gold-200">Iniciativa</h2>
          <IconButton icon={<PanelLeftClose />} title="Ocultar la iniciativa" size="sm" onClick={() => onOpenChange(false)} />
        </header>
        <div className="min-h-0 flex-1 p-3">
          <InitiativePanel />
        </div>
      </section>
    </div>
  );
}
