import clsx from 'clsx';
import { Heart } from 'lucide-react';

export interface HpInfo {
  hp: number | null;
  maxHp: number | null;
  temp: number;
  ratio: number | null;
}

export interface HpBarProps {
  info: HpInfo;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Show "12 / 20" next to / inside the bar when numbers are known. Default true (except xs). */
  showText?: boolean;
  /** Text when nothing is known. Hidden for xs. */
  unknownLabel?: string;
  className?: string;
}

/** Hue from red (0) to green (1), matching the map token bars. */
export function hpColor(ratio: number): string {
  const r = Math.min(1, Math.max(0, ratio));
  const hue = Math.round(r * 120);
  const light = 44 + Math.round((1 - Math.abs(r - 0.5) * 2) * 6);
  return `hsl(${hue}, 78%, ${light}%)`;
}

/** Approximate wording for players who only get a ratio. */
export function hpWord(ratio: number): string {
  if (ratio <= 0) return 'Caído';
  if (ratio < 0.25) return 'Moribundo';
  if (ratio < 0.5) return 'Malherido';
  if (ratio < 0.75) return 'Herido';
  if (ratio < 1) return 'Rasguñado';
  return 'Ileso';
}

const HEIGHT: Record<NonNullable<HpBarProps['size']>, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

/**
 * HP bar respecting what the viewer is allowed to know: exact numbers, an approximate ratio
 * (players with enemyHp 'bar') or nothing at all.
 */
export function HpBar({ info, size = 'md', showText, unknownLabel = 'PV desconocidos', className }: HpBarProps) {
  const { hp, maxHp, temp, ratio } = info;
  const exact = hp !== null && maxHp !== null;
  const text = showText ?? size !== 'xs';

  if (ratio === null) {
    if (size === 'xs' || !text) return null;
    return (
      <div className={clsx('flex items-center gap-1.5 text-[11px] italic text-parchment-400', className)}>
        <Heart className="h-3 w-3 opacity-60" />
        {unknownLabel}
      </div>
    );
  }

  const pct = Math.round(ratio * 100);
  const tempPct = exact && maxHp > 0 && temp > 0 ? Math.min(100, Math.round((temp / maxHp) * 100)) : 0;
  const label = exact ? `${hp} / ${maxHp}${temp > 0 ? ` (+${temp})` : ''}` : hpWord(ratio);
  const title = exact ? `PV ${hp} de ${maxHp}${temp > 0 ? `, ${temp} temporales` : ''}` : `Estado aproximado: ${hpWord(ratio)}`;

  return (
    <div className={clsx('flex min-w-0 items-center gap-2', className)} title={title}>
      <div
        className={clsx('relative min-w-0 flex-1 overflow-hidden rounded-full border border-black/40 bg-ink-950/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]', HEIGHT[size])}
        role="meter"
        aria-label="Puntos de vida"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: hpColor(ratio),
            boxShadow: `0 0 8px ${hpColor(ratio)}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}
        />
        {tempPct > 0 && (
          <div
            className="absolute inset-y-0 right-0 bg-sky-400/70 transition-[width] duration-500"
            style={{ width: `${tempPct}%`, backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.25) 0 3px, transparent 3px 6px)' }}
            title={`${temp} PV temporales`}
          />
        )}
        {size === 'lg' && text && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-parchment-50 text-shadow">
            {label}
          </span>
        )}
      </div>
      {text && size !== 'lg' && (
        <span className={clsx('shrink-0 tabular-nums', size === 'md' ? 'text-xs font-semibold text-parchment-100' : 'text-[11px] text-parchment-200', !exact && 'italic')}>
          {label}
        </span>
      )}
    </div>
  );
}
