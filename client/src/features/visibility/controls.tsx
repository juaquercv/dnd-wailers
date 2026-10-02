import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  Backpack,
  Check,
  Dices,
  EyeOff,
  Footprints,
  Layers,
  ListOrdered,
  Lock,
  Map as MapIcon,
  MapPinned,
  Moon,
  ScanEye,
  Skull,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { VisibilitySettings } from '@wailers/shared';
import { Toggle } from '../../components/ui/Toggle';
import { VISION_CHOICES, type VisionChoice } from './visionText';

type BoolKey = {
  [K in keyof VisibilitySettings]: VisibilitySettings[K] extends boolean ? K : never;
}[keyof VisibilitySettings];

export type ScreenKey = Exclude<BoolKey, 'canMoveOwnToken'>;

export const SCREEN_TOGGLES: { key: ScreenKey; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'canSeeOverview', label: 'Mapa general', hint: 'Puede abrir el mapa general de la campaña.', icon: MapIcon },
  { key: 'canSeeOtherZones', label: 'Otras zonas', hint: 'Puede mirar zonas donde no está su héroe.', icon: Layers },
  { key: 'canSeeInitiative', label: 'Iniciativa', hint: 'Ve el orden de turnos.', icon: ListOrdered },
  { key: 'canSeeOthersRolls', label: 'Tiradas de otros', hint: 'Ve las tiradas públicas del resto del grupo.', icon: Dices },
  { key: 'canSeeOthersInventory', label: 'Inventarios de otros', hint: 'Ve los objetos y monedas de los demás héroes.', icon: Backpack },
  { key: 'canSeeEnemyDetails', label: 'Ficha de enemigos', hint: 'CA, ataques, rasgos y resistencias de los enemigos.', icon: Skull },
  { key: 'sharedVision', label: 'Lo que ve el grupo', hint: 'Además de lo suyo, ve lo que ven sus compañeros.', icon: Users },
];

export const ENEMY_HP_OPTIONS: { value: VisibilitySettings['enemyHp']; label: string; hint: string }[] = [
  { value: 'exact', label: 'Exactos', hint: 'Ve los puntos de vida exactos de los enemigos.' },
  { value: 'bar', label: 'Barra', hint: 'Ve una barra aproximada, sin números.' },
  { value: 'hidden', label: 'Ocultos', hint: 'No ve la vida de los enemigos.' },
];

const CHOICE_ICONS: Record<VisionChoice, LucideIcon> = {
  follow: MapPinned,
  all: Sun,
  explored: Footprints,
  vision: ScanEye,
  none: Moon,
};

/** "Sigue la zona | Todo | Explorado | Limitada | Nada". `value` null = players differ (nothing highlighted). */
export function VisionChoicePicker({
  value,
  onChange,
  disabled,
  ariaLabel = 'Visión',
}: {
  value: VisionChoice | null;
  onChange: (choice: VisionChoice) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-5 gap-1 rounded-lg border border-ink-600 bg-ink-950/60 p-1">
      {VISION_CHOICES.map((c) => {
        const active = c.value === value;
        const Icon = CHOICE_ICONS[c.value];
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={c.hint}
            onClick={() => {
              if (!active) onChange(c.value);
            }}
            className={clsx(
              'flex min-w-0 flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 text-center text-[10px] font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? c.value === 'follow'
                  ? 'bg-emerald-500/15 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.45)]'
                  : 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[0_0_0_1px_rgba(176,133,43,0.55)]'
                : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="w-full break-words">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small segmented control (one row of short options). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1 rounded-lg border border-ink-600 bg-ink-950/60 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={o.hint}
            onClick={() => {
              if (!active) onChange(o.value);
            }}
            className={clsx(
              'flex-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[0_0_0_1px_rgba(176,133,43,0.45)]'
                : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Big "can move their token" switch. `note` explains a mixed state ("3 de 4 pueden"). */
export function MoveSwitch({
  checked,
  onChange,
  label,
  note,
  personal,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  note?: ReactNode;
  personal?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
        checked ? 'border-emerald-600/40 bg-emerald-500/[0.07]' : 'border-blood-500/50 bg-blood-500/10',
      )}
    >
      <span
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          checked ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blood-500/20 text-blood-300',
        )}
        aria-hidden
      >
        {checked ? <Footprints className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-parchment-50">{label}</span>
        <span className={clsx('block text-[11px] leading-snug', checked ? 'text-emerald-200/80' : 'text-blood-300')}>
          {note ?? (checked ? 'Puede arrastrar su ficha y cambiar de zona' : 'Su ficha está bloqueada')}
          {personal && <span className="text-gold-300"> · solo para este jugador</span>}
        </span>
      </div>
      <Toggle checked={checked} onChange={onChange} title={checked ? 'Quitar el movimiento' : 'Permitir el movimiento'} />
    </div>
  );
}

/**
 * "What they see on their screen": compact on/off chips and the enemy HP mode.
 * `personal` marks values set only for this player; `differs` counts players with another value.
 */
export function ScreenToggles({
  value,
  onChange,
  personal,
  differs,
}: {
  value: Pick<VisibilitySettings, ScreenKey | 'enemyHp'>;
  onChange: <K extends ScreenKey | 'enemyHp'>(key: K, value: VisibilitySettings[K]) => void;
  personal?: (key: ScreenKey | 'enemyHp') => boolean;
  differs?: (key: ScreenKey | 'enemyHp') => number;
}) {
  const marker = (key: ScreenKey | 'enemyHp') => {
    if (personal?.(key)) {
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400 shadow-[0_0_6px_rgba(233,192,99,0.8)]" title="Ajuste solo para este jugador" />;
    }
    const n = differs?.(key) ?? 0;
    if (n > 0) {
      return (
        <span
          className="shrink-0 rounded-full bg-gold-500/20 px-1 text-[9px] font-bold leading-4 text-gold-300"
          title={`${n} ${n === 1 ? 'jugador tiene' : 'jugadores tienen'} otro valor`}
        >
          {n}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {SCREEN_TOGGLES.map((t) => {
          const on = value[t.key];
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              title={t.hint}
              onClick={() => onChange(t.key, !on)}
              className={clsx(
                'flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium leading-tight transition',
                on
                  ? 'border-gold-600/50 bg-gold-500/10 text-parchment-50 hover:border-gold-500'
                  : 'border-ink-600 bg-ink-900/60 text-parchment-400 hover:border-ink-500 hover:text-parchment-200',
              )}
            >
              <t.icon className={clsx('h-3.5 w-3.5 shrink-0', on ? 'text-gold-300' : 'text-parchment-400')} aria-hidden />
              <span className={clsx('min-w-0 flex-1', !on && 'line-through decoration-parchment-400/50')}>{t.label}</span>
              {marker(t.key)}
              {on ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
              ) : (
                <EyeOff className="h-3.5 w-3.5 shrink-0 text-parchment-400/70" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-parchment-300">
          PV de enemigos
          {marker('enemyHp')}
        </div>
        <Segmented ariaLabel="PV de enemigos" options={ENEMY_HP_OPTIONS} value={value.enemyHp} onChange={(v) => onChange('enemyHp', v)} />
      </div>
    </div>
  );
}
