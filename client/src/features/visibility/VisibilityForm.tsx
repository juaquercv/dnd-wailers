import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link2, RotateCcw } from 'lucide-react';
import { defaultVisibility, VISION_MODE_LABELS, type VisibilitySettings, type VisionMode } from '@wailers/shared';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';

export interface VisibilityFormProps {
  /** Values to edit (complete settings, or a player's partial overrides). */
  value: Partial<VisibilitySettings>;
  /** Values shown for fields missing from `value` (the global settings). */
  base?: VisibilitySettings;
  /**
   * Receives only the changed field(s). With `allowInherit`, resetting a field to the inherited value is
   * reported as `{ [field]: undefined }` (key present, value undefined): the owner removes that override.
   */
  onChange: (patch: Partial<VisibilitySettings>) => void;
  /** Per-player mode: missing fields show "Heredado: …" and every overridden field gets a reset button. */
  allowInherit?: boolean;
}

type Key = keyof VisibilitySettings;

const MODES: VisionMode[] = ['all', 'explored', 'vision', 'none'];

const MODE_HINTS: Record<VisionMode, string> = {
  all: 'Ven el mapa completo de la zona.',
  explored: 'Lo visible ahora y, atenuado, lo que ya recorrieron.',
  vision: 'Solo lo que su ficha ve en este momento.',
  none: 'Pantalla negra o la imagen de escena que elijas.',
};

const ENEMY_HP_OPTIONS: { value: VisibilitySettings['enemyHp']; label: string }[] = [
  { value: 'exact', label: 'Exactos' },
  { value: 'bar', label: 'Barra aproximada' },
  { value: 'hidden', label: 'Ocultos' },
];

const PERMISSIONS: { key: Exclude<Key, 'visionMode' | 'visionRadius' | 'visionCone' | 'sharedVision' | 'sceneImageUrl' | 'enemyHp'>; label: string; description: string }[] = [
  { key: 'canSeeOverview', label: 'Ver mapa general', description: 'Pueden abrir el mapa general de la campaña.' },
  { key: 'canSeeOtherZones', label: 'Ver otras zonas', description: 'Pueden mirar zonas donde no está el grupo.' },
  { key: 'canSeeEnemyDetails', label: 'Ver ficha de enemigos', description: 'CA, ataques, rasgos y resistencias.' },
  { key: 'canSeeInitiative', label: 'Ver iniciativa', description: 'Orden de turnos visible.' },
  { key: 'canSeeOthersRolls', label: 'Ver tiradas de otros', description: 'Tiradas públicas del resto de jugadores.' },
  { key: 'canSeeOthersInventory', label: 'Ver inventarios de otros', description: 'Objetos y oro de los demás héroes.' },
  { key: 'canMoveOwnToken', label: 'Mover su propia ficha', description: 'Arrastrar, girar y usar pasos y bordes.' },
];

function describe(key: Key, v: VisibilitySettings[Key]): string {
  switch (key) {
    case 'visionMode':
      return VISION_MODE_LABELS[v as VisionMode];
    case 'visionRadius':
      return `${v as number} casillas`;
    case 'visionCone':
      return (v as number) >= 360 ? '360° (completa)' : `${v as number}°`;
    case 'enemyHp':
      return ENEMY_HP_OPTIONS.find((o) => o.value === v)?.label ?? String(v);
    case 'sceneImageUrl':
      return v ? 'Imagen de escena' : 'Pantalla negra';
    default:
      return v ? 'Sí' : 'No';
  }
}

/** Slider value kept locally while dragging; committed on release (or after a short pause). */
function useDraftNumber(value: number, commit: (v: number) => void) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const flush = (v: number) => {
    clear();
    setDraft(null);
    if (v !== valueRef.current) commitRef.current(v);
  };
  const change = (v: number) => {
    setDraft(v);
    clear();
    timer.current = window.setTimeout(() => flush(v), 600);
  };
  useEffect(() => () => clear(), []);
  return { value: draft ?? value, change, flush };
}

/** Visibility settings editor (global settings or per-player overrides). */
export function VisibilityForm({ value, base, onChange, allowInherit = false }: VisibilityFormProps) {
  const baseline = useMemo(() => base ?? defaultVisibility(), [base]);

  const isSet = (k: Key): boolean => {
    if (!(k in value)) return false;
    const v = value[k];
    if (v === undefined) return false;
    if (v === null) return k === 'sceneImageUrl';
    return true;
  };
  const get = <K extends Key>(k: K): VisibilitySettings[K] => (isSet(k) ? (value[k] as VisibilitySettings[K]) : baseline[k]);
  const set = <K extends Key>(k: K, v: VisibilitySettings[K]) => onChange({ [k]: v } as Partial<VisibilitySettings>);
  const reset = (k: Key) => onChange({ [k]: undefined } as Partial<VisibilitySettings>);

  const mode = get('visionMode');
  const radius = useDraftNumber(get('visionRadius'), (v) => set('visionRadius', v));
  const cone = useDraftNumber(get('visionCone'), (v) => set('visionCone', v));
  const visionMatters = mode === 'vision' || mode === 'explored';

  const row = (k: Key, children: ReactNode, className?: string) => (
    <InheritRow
      key={k}
      enabled={allowInherit}
      overridden={isSet(k)}
      inheritedText={describe(k, baseline[k])}
      onReset={() => reset(k)}
      className={className}
    >
      {children}
    </InheritRow>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="label mb-0">Visión</h4>
        {row(
          'visionMode',
          <div role="radiogroup" aria-label="Modo de visión" className="grid grid-cols-2 gap-2">
            {MODES.map((m) => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (!active || (allowInherit && !isSet('visionMode'))) set('visionMode', m);
                  }}
                  title={MODE_HINTS[m]}
                  className={clsx(
                    'group flex flex-col overflow-hidden rounded-lg border text-left transition',
                    active
                      ? 'border-gold-500/80 bg-gold-500/10 shadow-glow-gold'
                      : 'border-ink-500 bg-ink-800/60 hover:border-gold-700 hover:bg-ink-700/70',
                  )}
                >
                  <ModeIllustration mode={m} active={active} />
                  <span className={clsx('px-2 pb-1.5 pt-1 text-[11px] font-semibold leading-tight', active ? 'text-gold-200' : 'text-parchment-200')}>
                    {VISION_MODE_LABELS[m]}
                  </span>
                </button>
              );
            })}
          </div>,
        )}
        <p className="text-xs leading-snug text-parchment-400">{MODE_HINTS[mode]}</p>

        {mode === 'none' &&
          row(
            'sceneImageUrl',
            <ImageUpload
              label="Imagen de escena"
              hint="Opcional: sin imagen verán una pantalla negra."
              value={get('sceneImageUrl')}
              onChange={(url) => set('sceneImageUrl', url)}
              aspect="video"
            />,
          )}

        {row(
          'visionRadius',
          <Slider
            label="Radio de visión"
            value={radius.value}
            onChange={radius.change}
            onCommit={radius.flush}
            min={1}
            max={30}
            step={1}
            formatValue={(v) => `${v} ${v === 1 ? 'casilla' : 'casillas'}`}
          />,
          clsx(!visionMatters && 'opacity-60'),
        )}
        {row(
          'visionCone',
          <Slider
            label="Cono de visión"
            value={cone.value}
            onChange={cone.change}
            onCommit={cone.flush}
            min={60}
            max={360}
            step={15}
            formatValue={(v) => (v >= 360 ? '360° (completa)' : `${v}°`)}
          />,
          clsx(!visionMatters && 'opacity-60'),
        )}
        {!visionMatters && (
          <p className="-mt-1 text-[11px] text-parchment-400">El radio y el cono solo afectan a los modos «Solo lo explorado» y «Solo lo que tiene delante».</p>
        )}
        {row(
          'sharedVision',
          <Toggle
            checked={get('sharedVision')}
            onChange={(v) => set('sharedVision', v)}
            label="Visión compartida del grupo"
            description="Cada jugador ve lo que ve cualquier miembro del grupo."
          />,
        )}
      </section>

      <section className="space-y-3">
        <h4 className="label mb-0">Permisos</h4>
        {PERMISSIONS.slice(0, 3).map((p) =>
          row(p.key, <Toggle checked={get(p.key)} onChange={(v) => set(p.key, v)} label={p.label} description={p.description} />),
        )}
        {row(
          'enemyHp',
          <div>
            <span className="mb-1.5 block text-sm text-parchment-100">PV de enemigos</span>
            <div role="radiogroup" aria-label="PV de enemigos" className="flex gap-1 rounded-lg border border-ink-600 bg-ink-950/60 p-1">
              {ENEMY_HP_OPTIONS.map((o) => {
                const active = get('enemyHp') === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      if (!active || (allowInherit && !isSet('enemyHp'))) set('enemyHp', o.value);
                    }}
                    className={clsx(
                      'flex-1 rounded-md px-2 py-1 text-xs font-medium transition',
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
          </div>,
        )}
        {PERMISSIONS.slice(3).map((p) =>
          row(p.key, <Toggle checked={get(p.key)} onChange={(v) => set(p.key, v)} label={p.label} description={p.description} />),
        )}
      </section>
    </div>
  );
}

function InheritRow({
  enabled,
  overridden,
  inheritedText,
  onReset,
  className,
  children,
}: {
  enabled: boolean;
  overridden: boolean;
  inheritedText: string;
  onReset: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!enabled) return <div className={className}>{children}</div>;
  return (
    <div
      className={clsx(
        'rounded-lg border-l-2 pl-2.5 transition-colors',
        overridden ? 'border-gold-500/80' : 'border-ink-600',
        className,
      )}
    >
      {children}
      <div className="mt-1 flex min-h-[1.25rem] items-center gap-2 text-[11px]">
        {overridden ? (
          <>
            <span className="font-semibold text-gold-300">Personalizado</span>
            <span className="text-parchment-400">· global: {inheritedText}</span>
            <button
              type="button"
              onClick={onReset}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-parchment-300 transition hover:bg-ink-700 hover:text-parchment-50"
              title="Volver al valor global"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Heredar
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-parchment-400">
            <Link2 className="h-3 w-3" aria-hidden />
            Heredado: {inheritedText}
          </span>
        )}
      </div>
    </div>
  );
}

/** Tiny map illustration for each vision mode. */
function ModeIllustration({ mode, active }: { mode: VisionMode; active: boolean }) {
  const uid = useId().replace(/:/g, '');
  const soft = `vf-soft-${uid}`;
  const visionMask = `vf-vision-${uid}`;
  const unexploredMask = `vf-unexp-${uid}`;
  const dimMask = `vf-dim-${uid}`;
  const explored = 'M0 0 H58 C 66 18, 52 36, 62 56 H0 Z';
  return (
    <svg viewBox="0 0 96 56" className={clsx('block h-auto w-full transition', active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100')} aria-hidden>
      <defs>
        <radialGradient id={soft}>
          <stop offset="0.6" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </radialGradient>
        <mask id={visionMask}>
          <rect width="96" height="56" fill="#fff" />
          <circle cx="40" cy="28" r="17" fill={`url(#${soft})`} />
        </mask>
        <mask id={unexploredMask}>
          <rect width="96" height="56" fill="#fff" />
          <path d={explored} fill="#000" />
          <circle cx="40" cy="28" r="17" fill={`url(#${soft})`} />
        </mask>
        <mask id={dimMask}>
          <path d={explored} fill="#fff" />
          <circle cx="40" cy="28" r="17" fill={`url(#${soft})`} />
        </mask>
      </defs>
      {mode !== 'none' && (
        <g>
          <rect width="96" height="56" fill="#3a3527" />
          <path d="M0 40 C 20 34, 30 46, 50 40 S 80 30, 96 36 L96 45 C 80 40, 70 52, 50 49 S 18 43, 0 49 Z" fill="#2f5d7a" opacity="0.9" />
          <circle cx="12" cy="13" r="6" fill="#3f6b3a" />
          <circle cx="21" cy="9" r="5" fill="#4a7a43" />
          <circle cx="79" cy="15" r="7" fill="#3f6b3a" />
          <circle cx="87" cy="22" r="5" fill="#4a7a43" />
          <rect x="57" y="7" width="12" height="10" fill="#8a6a45" />
          <path d="M55 8 L63 2 L71 8 Z" fill="#a8463c" />
          <path d="M26 20 L36 26 L30 34" stroke="#cdb98f" strokeWidth="1.2" fill="none" strokeDasharray="2 2" />
          <circle cx="68" cy="36" r="3.2" fill="#c43d33" stroke="#13110e" strokeWidth="1" />
          <circle cx="40" cy="28" r="4" fill="#e9c063" stroke="#13110e" strokeWidth="1.5" />
        </g>
      )}
      {mode === 'vision' && <rect width="96" height="56" fill="#000" mask={`url(#${visionMask})`} />}
      {mode === 'explored' && (
        <>
          <rect width="96" height="56" fill="#000" mask={`url(#${unexploredMask})`} />
          <rect width="96" height="56" fill="#000" opacity="0.55" mask={`url(#${dimMask})`} />
        </>
      )}
      {mode === 'none' && (
        <g>
          <rect width="96" height="56" fill="#050505" />
          <path d="M52 18 A 11 11 0 1 0 58 36 A 9 9 0 1 1 52 18 Z" fill="#cdb98f" opacity="0.55" />
          <circle cx="24" cy="14" r="0.8" fill="#cdb98f" opacity="0.6" />
          <circle cx="72" cy="40" r="0.8" fill="#cdb98f" opacity="0.5" />
          <circle cx="80" cy="12" r="0.6" fill="#cdb98f" opacity="0.5" />
        </g>
      )}
    </svg>
  );
}
