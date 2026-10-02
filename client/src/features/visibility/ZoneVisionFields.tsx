import clsx from 'clsx';
import { Link2 } from 'lucide-react';
import type { ZoneVision } from '@wailers/shared';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { ModeIllustration } from './ModeIllustration';
import { useDraftNumber } from './useDraftNumber';
import { cellsLabel, coneLabel, DEFAULT_ZONE_RADIUS, VISION_HINTS } from './visionText';

type ZoneMode = ZoneVision['mode'];

const ZONE_MODES: { mode: ZoneMode; label: string }[] = [
  { mode: 'all', label: 'Todo visible' },
  { mode: 'explored', label: 'Explorado (recuerda lo visto)' },
  { mode: 'vision', label: 'Poca visión' },
];

const DEFAULT_CONE = 90;

export interface ZoneVisionFieldsProps {
  value: ZoneVision | null;
  onChange: (vision: ZoneVision | null) => void;
  /** Adds a first option meaning "no vision of its own" (value null). */
  inheritOption?: { label: string; hint: string };
  /** Mode drawn as "in use" when value is null (the starting value players fall back to). */
  fallbackMode?: ZoneMode | null;
  /** Radius used when switching to a limited mode for the first time. */
  defaultRadius?: number;
  disabled?: boolean;
}

/** Vision presets of a zone (Todo visible / Explorado / Poca visión) with radius and optional cone. */
export function ZoneVisionFields({ value, onChange, inheritOption, fallbackMode = null, defaultRadius = DEFAULT_ZONE_RADIUS, disabled }: ZoneVisionFieldsProps) {
  const radius = useDraftNumber(value?.radius ?? defaultRadius, (r) => {
    if (value) onChange({ ...value, radius: r });
  });
  const cone = useDraftNumber(value && value.cone < 360 ? value.cone : DEFAULT_CONE, (c) => {
    if (value) onChange({ ...value, cone: c });
  });

  const pick = (mode: ZoneMode) => {
    onChange({ mode, radius: value?.radius ?? defaultRadius, cone: value?.cone ?? 360 });
  };

  const limited = value !== null && value.mode !== 'all';
  const shownMode: ZoneMode | null = value?.mode ?? (inheritOption ? null : fallbackMode);

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Visión de la zona" className={clsx('grid gap-1.5', inheritOption ? 'grid-cols-2' : 'grid-cols-3')}>
        {inheritOption && (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            disabled={disabled}
            title={inheritOption.hint}
            onClick={() => {
              if (value !== null) onChange(null);
            }}
            className={clsx(
              'group flex flex-col overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-50',
              value === null ? 'border-gold-500/80 bg-gold-500/10 shadow-glow-gold' : 'border-ink-500 bg-ink-800/60 hover:border-gold-700 hover:bg-ink-700/70',
            )}
          >
            <span className="flex aspect-[96/56] w-full items-center justify-center bg-ink-950/70">
              <Link2 className={clsx('h-6 w-6', value === null ? 'text-gold-300' : 'text-parchment-400')} aria-hidden />
            </span>
            <span className={clsx('px-2 pb-1.5 pt-1 text-[11px] font-semibold leading-tight', value === null ? 'text-gold-200' : 'text-parchment-200')}>
              {inheritOption.label}
            </span>
          </button>
        )}
        {ZONE_MODES.map((m) => {
          const active = shownMode === m.mode;
          const implicit = active && value === null;
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={active && !implicit}
              disabled={disabled}
              title={VISION_HINTS[m.mode]}
              onClick={() => {
                if (!active || implicit) pick(m.mode);
              }}
              className={clsx(
                'group relative flex flex-col overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                active && !implicit && 'border-gold-500/80 bg-gold-500/10 shadow-glow-gold',
                implicit && 'border-dashed border-gold-600/60 bg-ink-800/60',
                !active && 'border-ink-500 bg-ink-800/60 hover:border-gold-700 hover:bg-ink-700/70',
              )}
            >
              <ModeIllustration mode={m.mode} active={active} />
              <span className={clsx('px-2 pb-1.5 pt-1 text-[11px] font-semibold leading-tight', active ? 'text-gold-200' : 'text-parchment-200')}>
                {m.label}
              </span>
              {implicit && (
                <span className="absolute right-1 top-1 rounded bg-ink-950/85 px-1 text-[9px] font-semibold uppercase tracking-wide text-gold-300">
                  Inicial
                </span>
              )}
            </button>
          );
        })}
      </div>

      {value ? (
        <p className="text-xs leading-snug text-parchment-400">{VISION_HINTS[value.mode]}</p>
      ) : (
        inheritOption && <p className="text-xs leading-snug text-parchment-400">{inheritOption.hint}</p>
      )}

      {limited && (
        <div className="space-y-3 rounded-lg border border-ink-600/70 bg-ink-950/40 p-2.5">
          <Slider
            label="Hasta dónde ven"
            value={radius.value}
            onChange={radius.change}
            onCommit={radius.flush}
            min={1}
            max={30}
            step={1}
            disabled={disabled}
            formatValue={cellsLabel}
          />
          <Toggle
            size="sm"
            checked={value.cone < 360}
            disabled={disabled}
            onChange={(on) => onChange({ ...value, cone: on ? DEFAULT_CONE : 360 })}
            label="Solo hacia donde miran (cono)"
            description="Como una linterna: ven en la dirección a la que mira su ficha."
          />
          {value.cone < 360 && (
            <Slider
              label="Apertura del cono"
              value={cone.value}
              onChange={cone.change}
              onCommit={cone.flush}
              min={30}
              max={330}
              step={15}
              disabled={disabled}
              formatValue={coneLabel}
            />
          )}
          <p className="text-[11px] leading-snug text-parchment-400">
            Los héroes con visión propia (p. ej. visión en la oscuridad) usan su radio.
          </p>
        </div>
      )}
    </div>
  );
}
