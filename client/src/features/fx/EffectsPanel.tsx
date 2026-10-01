import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Biohazard,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSunRain,
  Crosshair,
  EyeOff,
  Flame,
  Ghost,
  HeartPulse,
  Lightbulb,
  MapPin,
  MoonStar,
  RotateCcw,
  Snowflake,
  Sparkles,
  Sun,
  Sunset,
  Target,
  Vibrate,
  WandSparkles,
  Zap,
} from 'lucide-react';
import {
  LIGHTING_INFO,
  LIGHTING_PRESETS,
  SPELL_ANIMATION_LABELS,
  SPELL_ANIMATIONS,
  WEATHER_LABELS,
  WEATHER_TYPES,
  type C2SEvent,
  type C2SPayloads,
  type LightingPreset,
  type SessionZone,
  type SpellAnimation,
  type WeatherType,
  type ZoneLevel,
} from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Button } from '../../components/ui/Button';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { EmptyState } from '../../components/ui/EmptyState';
import { Slider } from '../../components/ui/Slider';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { toast } from '../../components/ui/toast';
import { useCurrentZone, useIsDm, useSessionStore } from '../../stores/session';
import { PanelSection } from '../audio/PanelSection';
import { BossSection } from './BossPicker';

async function send<E extends C2SEvent>(event: E, payload: C2SPayloads[E], errorMessage: string): Promise<boolean> {
  try {
    await emitAck(event, payload);
    return true;
  } catch (err) {
    toast.fromError(err, errorMessage);
    return false;
  }
}

/** DM effects sidebar: weather and lighting of the zone being viewed, screen effects, boss entrance and map animations. */
export function EffectsPanel() {
  const isDm = useIsDm();
  const { zone, levelId } = useCurrentZone();
  const level = zone ? zone.levels.find((l) => l.id === levelId) ?? zone.levels[0] ?? null : null;

  if (!isDm) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-4">
        <EmptyState icon={<Sparkles />} title="Efectos visuales" description="Solo el DM puede controlar el clima y los efectos." />
      </div>
    );
  }

  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-3">
      {zone && level ? (
        <div key={zone.id} className="flex flex-col gap-5">
          <ZoneBanner zone={zone} level={level} />
          <WeatherSection zone={zone} />
          <LightingSection zone={zone} />
        </div>
      ) : (
        <EmptyState compact icon={<MapPin />} title="Ninguna zona a la vista" description="Abre una zona para cambiar su clima e iluminación." />
      )}
      <ScreenSection />
      <BossSection />
      {zone && level && <SpellSection key={`${zone.id}:${level.id}`} zone={zone} level={level} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function ZoneBanner({ zone, level }: { zone: SessionZone; level: ZoneLevel }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-600/80 bg-gradient-to-b from-ink-800/90 to-ink-900/90 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-700/60 bg-gold-500/10 text-gold-300">
        <MapPin className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-parchment-400">Zona que estás viendo</div>
        <div className="truncate font-display text-sm font-semibold text-parchment-50">
          {zone.name}
          {zone.levels.length > 1 && <span className="font-sans font-normal text-parchment-300"> · {level.name}</span>}
        </div>
      </div>
    </div>
  );
}

interface TileProps {
  selected: boolean;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hint?: string;
  /** Optional preview strip under the label. */
  preview?: ReactNode;
  accent?: string;
}

function Tile({ selected, pending, disabled, onClick, icon, label, hint, preview, accent }: TileProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      className={clsx(
        'group relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border px-1.5 py-2 text-center transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed',
        selected
          ? 'border-gold-400/80 bg-gold-500/15 shadow-glow-gold'
          : 'border-ink-500 bg-ink-800/80 hover:border-gold-700 hover:bg-ink-700 disabled:opacity-60 disabled:hover:border-ink-500 disabled:hover:bg-ink-800/80',
      )}
    >
      <span
        className={clsx('flex h-5 items-center [&>svg]:h-[18px] [&>svg]:w-[18px]', selected ? 'text-gold-300' : 'text-parchment-300 group-hover:text-parchment-100')}
        style={accent && !selected ? { color: accent } : undefined}
      >
        {pending ? <Spinner size="xs" label="Aplicando…" /> : icon}
      </span>
      <span className={clsx('line-clamp-2 text-[11px] font-medium leading-tight', selected ? 'text-gold-100' : 'text-parchment-200')}>{label}</span>
      {hint && <span className="line-clamp-1 text-[10px] leading-none text-parchment-400">{hint}</span>}
      {preview}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

const WEATHER_ICONS: Record<WeatherType, ReactNode> = {
  none: <Sun />,
  rain: <CloudRain />,
  storm: <CloudLightning />,
  snow: <Snowflake />,
  fog: <CloudFog />,
  embers: <Flame />,
};

function WeatherSection({ zone }: { zone: SessionZone }) {
  const override = useSessionStore((s) => s.view?.state.zoneStates[zone.id]?.weather ?? null);
  const [pending, setPending] = useState<{ value: WeatherType | null } | null>(null);
  const effective = override ?? zone.weather;

  const choose = async (value: WeatherType | null) => {
    if (pending || value === override) return;
    setPending({ value });
    await send('fx:weather', { zoneId: zone.id, weather: value }, 'No se pudo cambiar el clima');
    setPending(null);
  };

  return (
    <PanelSection
      title="Clima"
      icon={<CloudSunRain />}
      aside={<NowChip label={WEATHER_LABELS[effective]} forced={override !== null} />}
      description="Partículas sobre el mapa para quien esté viendo esta zona."
    >
      <div role="radiogroup" aria-label="Clima" className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1.5">
        <Tile
          selected={override === null}
          pending={pending?.value === null}
          disabled={!!pending}
          onClick={() => void choose(null)}
          icon={<RotateCcw />}
          label="Por defecto"
          hint={WEATHER_LABELS[zone.weather]}
        />
        {WEATHER_TYPES.map((w) => (
          <Tile
            key={w}
            selected={override === w}
            pending={pending?.value === w}
            disabled={!!pending}
            onClick={() => void choose(w)}
            icon={WEATHER_ICONS[w]}
            label={WEATHER_LABELS[w]}
          />
        ))}
      </div>
    </PanelSection>
  );
}

function NowChip({ label, forced }: { label: string; forced: boolean }) {
  return (
    <span
      className={clsx(
        'max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        forced ? 'border-gold-600/60 bg-gold-500/15 text-gold-200' : 'border-ink-500 bg-ink-800 text-parchment-300',
      )}
      title={forced ? 'Impuesto por el DM' : 'Valor por defecto de la zona'}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const LIGHTING_ICONS: Record<LightingPreset, ReactNode> = {
  day: <Sun />,
  dusk: <Sunset />,
  night: <MoonStar />,
  dark: <EyeOff />,
};

function DarknessPreview({ preset }: { preset: LightingPreset }) {
  const info = LIGHTING_INFO[preset];
  return (
    <span aria-hidden className="relative mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-parchment-200 to-gold-400">
      <span className="absolute inset-0" style={{ background: info.tint, opacity: info.darkness }} />
    </span>
  );
}

function LightingSection({ zone }: { zone: SessionZone }) {
  const override = useSessionStore((s) => s.view?.state.zoneStates[zone.id]?.lighting ?? null);
  const [pending, setPending] = useState<{ value: LightingPreset | null } | null>(null);
  const effective = override ?? zone.lighting;

  const choose = async (value: LightingPreset | null) => {
    if (pending || value === override) return;
    setPending({ value });
    await send('fx:lighting', { zoneId: zone.id, lighting: value }, 'No se pudo cambiar la iluminación');
    setPending(null);
  };

  return (
    <PanelSection
      title="Iluminación"
      icon={<Lightbulb />}
      aside={<NowChip label={LIGHTING_INFO[effective].label} forced={override !== null} />}
      description="Oscuridad ambiental de la zona; las antorchas y luces siguen alumbrando."
    >
      <div role="radiogroup" aria-label="Iluminación" className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1.5">
        <Tile
          selected={override === null}
          pending={pending?.value === null}
          disabled={!!pending}
          onClick={() => void choose(null)}
          icon={<RotateCcw />}
          label="Por defecto"
          hint={LIGHTING_INFO[zone.lighting].label}
          preview={<DarknessPreview preset={zone.lighting} />}
        />
        {LIGHTING_PRESETS.map((p) => (
          <Tile
            key={p}
            selected={override === p}
            pending={pending?.value === p}
            disabled={!!pending}
            onClick={() => void choose(p)}
            icon={LIGHTING_ICONS[p]}
            label={LIGHTING_INFO[p].label}
            preview={<DarknessPreview preset={p} />}
          />
        ))}
      </div>
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Screen effects: shake + flash
// ---------------------------------------------------------------------------

const FLASH_COLORS = ['#ffffff', '#f3d58a', '#ff9b2f', '#e0625a', '#a98bff', '#7fd6ff', '#5fd07a', '#000000'];

type FlashLength = 'short' | 'normal' | 'long';
const FLASH_MS: Record<FlashLength, number> = { short: 350, normal: 750, long: 1600 };

function shakeLabel(v: number): string {
  if (v < 0.34) return 'Suave';
  if (v < 0.67) return 'Fuerte';
  return 'Brutal';
}

function ScreenSection() {
  const [intensity, setIntensity] = useState(0.5);
  const [color, setColor] = useState('#ffffff');
  const [length, setLength] = useState<FlashLength>('normal');
  const [busy, setBusy] = useState<'shake' | 'flash' | null>(null);

  const shake = async () => {
    if (busy) return;
    setBusy('shake');
    const value = Math.round(intensity * 100) / 100;
    await send(
      'fx:trigger',
      { fx: { kind: 'shake', intensity: value, durationMs: Math.round(350 + 1050 * value) } },
      'No se pudo sacudir la pantalla',
    );
    setBusy(null);
  };

  const flash = async () => {
    if (busy) return;
    setBusy('flash');
    await send('fx:trigger', { fx: { kind: 'flash', color, durationMs: FLASH_MS[length] } }, 'No se pudo lanzar el destello');
    setBusy(null);
  };

  return (
    <PanelSection title="Pantalla" icon={<Vibrate />} description="Se ve en la pantalla de todos los jugadores, estén donde estén.">
      <div className="flex flex-col gap-2.5 rounded-lg border border-ink-600/70 bg-ink-950/40 p-2.5">
        <Slider
          label="Intensidad de la sacudida"
          min={0.1}
          max={1}
          step={0.05}
          value={intensity}
          onChange={setIntensity}
          formatValue={shakeLabel}
        />
        <Button variant="secondary" size="sm" block icon={<Vibrate />} loading={busy === 'shake'} onClick={() => void shake()}>
          Sacudir pantalla
        </Button>
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-ink-600/70 bg-ink-950/40 p-2.5">
        <ColorPicker label="Color del destello" size="sm" palette={FLASH_COLORS} value={color} onChange={setColor} />
        <Tabs<FlashLength>
          variant="pills"
          size="sm"
          fill
          value={length}
          onChange={setLength}
          aria-label="Duración del destello"
          items={[
            { id: 'short', label: 'Breve' },
            { id: 'normal', label: 'Normal' },
            { id: 'long', label: 'Largo' },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          block
          icon={<Zap style={{ color: color.toLowerCase() === '#000000' ? undefined : color }} />}
          loading={busy === 'flash'}
          onClick={() => void flash()}
        >
          {color.toLowerCase() === '#000000' ? 'Fundido a negro' : 'Destello'}
        </Button>
      </div>
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Map animations (spells, gadgets, explosions…)
// ---------------------------------------------------------------------------

const SPELL_STYLE: Record<SpellAnimation, { icon: ReactNode; color: string }> = {
  fire: { icon: <Flame />, color: '#ff8a3d' },
  ice: { icon: <Snowflake />, color: '#7fd6ff' },
  lightning: { icon: <Zap />, color: '#cfe6ff' },
  heal: { icon: <HeartPulse />, color: '#5fd07a' },
  arcane: { icon: <Sparkles />, color: '#a98bff' },
  poison: { icon: <Biohazard />, color: '#9be15d' },
  holy: { icon: <Sun />, color: '#f3d58a' },
  shadow: { icon: <Ghost />, color: '#b48cff' },
};

function SpellSection({ zone, level }: { zone: SessionZone; level: ZoneLevel }) {
  const [animation, setAnimation] = useState<SpellAnimation>('fire');
  const [busy, setBusy] = useState<'center' | 'token' | null>(null);
  const selectedToken = useSessionStore((s) => {
    const id = s.selectedTokenIds[0];
    const token = id ? s.view?.state.tokens[id] : undefined;
    return token && token.zoneId === zone.id && token.levelId === level.id ? token : null;
  });

  const cast = async (target: 'center' | 'token', x: number, y: number) => {
    if (busy) return;
    setBusy(target);
    await send(
      'fx:trigger',
      {
        fx: {
          kind: 'spell',
          animation,
          zoneId: zone.id,
          levelId: level.id,
          x,
          y,
          fromX: null,
          fromY: null,
          radius: Math.max(16, level.grid.size * 2),
          label: null,
        },
      },
      'No se pudo lanzar la animación',
    );
    setBusy(null);
  };

  return (
    <PanelSection
      title="Animación en el mapa"
      icon={<WandSparkles />}
      description="Solo la ven quienes estén mirando este nivel. Es puramente visual: no aplica ningún efecto."
    >
      <div role="radiogroup" aria-label="Animación" className="grid grid-cols-4 gap-1.5">
        {SPELL_ANIMATIONS.map((a) => (
          <Tile
            key={a}
            selected={animation === a}
            pending={false}
            onClick={() => setAnimation(a)}
            icon={SPELL_STYLE[a].icon}
            label={SPELL_ANIMATION_LABELS[a]}
            accent={SPELL_STYLE[a].color}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          block
          icon={<Crosshair />}
          loading={busy === 'center'}
          onClick={() => void cast('center', level.background.width / 2, level.background.height / 2)}
        >
          Lanzar en el centro del nivel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          block
          icon={<Target />}
          disabled={!selectedToken}
          loading={busy === 'token'}
          title={selectedToken ? undefined : 'Selecciona una ficha de este nivel en el mapa'}
          onClick={() => {
            if (selectedToken) void cast('token', selectedToken.x, selectedToken.y);
          }}
        >
          {selectedToken ? `Lanzar sobre ${selectedToken.name}` : 'Lanzar sobre la ficha seleccionada'}
        </Button>
      </div>
    </PanelSection>
  );
}
