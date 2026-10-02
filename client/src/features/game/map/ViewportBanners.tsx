import { Crosshair, Radar, X } from 'lucide-react';
import { SPELL_ANIMATION_LABELS } from '@wailers/shared';
import { Kbd } from '../../../components/ui/Kbd';
import { useHeroEconomy } from '../hud/economy';
import { useGameUi } from './gameUi';
import { SPELL_COLORS } from './Indicators';

/** Hints shown on top of the map while choosing a spell target or while ping mode is on. */
export function ViewportBanners() {
  const cast = useGameUi((s) => s.cast);
  const pingMode = useGameUi((s) => s.pingMode);
  const economy = useHeroEconomy(cast?.heroId ?? null);

  if (cast) {
    const color = SPELL_COLORS[cast.animation];
    const costsAction = !!economy && !economy.unlimited && economy.limited;
    return (
      <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-3">
        <div
          role="status"
          className="pointer-events-auto flex max-w-full animate-slide-up items-center gap-3 rounded-2xl border bg-ink-950/90 py-2 pl-3 pr-2 shadow-modal backdrop-blur"
          style={{ borderColor: `${color}aa`, boxShadow: `0 0 0 1px ${color}55, 0 0 28px -6px ${color}` }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}26`, color }}>
            <Crosshair className="h-4 w-4 animate-spin-slow" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-parchment-50">
              Elige el objetivo de <span style={{ color }}>«{cast.spellName}»</span>
            </p>
            <p className="truncate text-[11px] text-parchment-400">
              Haz clic en el mapa o en una ficha · {costsAction ? 'gasta 1 acción de combate' : `animación: ${SPELL_ANIMATION_LABELS[cast.animation]}`} · <Kbd>Esc</Kbd> cancela
            </p>
          </div>
          <button
            type="button"
            onClick={() => useGameUi.getState().setCast(null)}
            className="flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-parchment-200 transition hover:bg-ink-700 hover:text-parchment-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (pingMode) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-3">
        <div role="status" className="pointer-events-auto flex animate-slide-up items-center gap-2 rounded-full border border-sky-500/50 bg-ink-950/90 py-1 pl-3 pr-1 text-xs text-parchment-100 shadow-panel backdrop-blur">
          <Radar className="h-4 w-4 text-sky-300" aria-hidden />
          <span>Modo ping: toca el mapa para señalar</span>
          <button
            type="button"
            onClick={() => useGameUi.getState().setPingMode(false)}
            className="flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-parchment-300 transition hover:bg-ink-700 hover:text-parchment-50"
            title="Salir del modo ping (P)"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Salir
          </button>
        </div>
      </div>
    );
  }

  return null;
}
