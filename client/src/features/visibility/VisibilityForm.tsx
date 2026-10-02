import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { Info, Link2, RotateCcw } from 'lucide-react';
import { defaultVisibility, type VisibilitySettings, type VisionMode } from '@wailers/shared';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { ENEMY_HP_OPTIONS, Segmented, SCREEN_TOGGLES } from './controls';
import { ModeIllustration } from './ModeIllustration';
import { useDraftNumber } from './useDraftNumber';
import { cellsLabel, coneLabel, isLimitedMode, VISION_HINTS, VISION_TITLES } from './visionText';

export interface VisibilityFormProps {
  /** Values to edit (complete settings, or a player's partial overrides). */
  value: Partial<VisibilitySettings>;
  /** Values shown for fields missing from `value` (the values everyone has). */
  base?: VisibilitySettings;
  /**
   * Receives only the changed field(s). With `allowInherit`, resetting a field to the inherited value is
   * reported as `{ [field]: undefined }` (key present, value undefined): the owner removes that override.
   */
  onChange: (patch: Partial<VisibilitySettings>) => void;
  /** Per-player mode: missing fields show "Como todos: …" and every personal field gets a reset button. */
  allowInherit?: boolean;
}

type Key = keyof VisibilitySettings;

const MODES: VisionMode[] = ['all', 'explored', 'vision', 'none'];

function describe(key: Key, v: VisibilitySettings[Key]): string {
  switch (key) {
    case 'visionMode':
      return VISION_TITLES[v as VisionMode];
    case 'visionRadius':
      return cellsLabel(v as number);
    case 'visionCone':
      return coneLabel(v as number);
    case 'enemyHp':
      return ENEMY_HP_OPTIONS.find((o) => o.value === v)?.label ?? String(v);
    case 'sceneImageUrl':
      return v ? 'Imagen de escena' : 'Pantalla negra';
    default:
      return v ? 'Sí' : 'No';
  }
}

/**
 * "Valores iniciales de los jugadores": what every player can do and see when a session starts
 * (campaign settings), or one player's personal values with `allowInherit`.
 */
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
  const limited = isLimitedMode(mode);

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
      {!allowInherit && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gold-700/40 bg-gold-500/[0.06] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" aria-hidden />
          <p className="text-xs leading-snug text-parchment-300">
            <strong className="font-semibold text-gold-200">Valores iniciales de los jugadores.</strong> Todos empiezan igual. Cada zona puede tener su
            propia visión (por ejemplo, una cueva oscura) y durante la partida puedes cambiar lo que ve y puede hacer cada jugador.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h4 className="label mb-0">Movimiento</h4>
        {row(
          'canMoveOwnToken',
          <Toggle
            checked={get('canMoveOwnToken')}
            onChange={(v) => set('canMoveOwnToken', v)}
            label="Pueden mover su ficha"
            description="Arrastrar su ficha, girarla y cambiar de zona por pasos y bordes. En la partida puedes quitárselo a todos o a uno."
          />,
        )}
      </section>

      <section className="space-y-3">
        <h4 className="label mb-0">Visión al empezar</h4>
        {row(
          'visionMode',
          <div role="radiogroup" aria-label="Visión al empezar" className="grid grid-cols-2 gap-2">
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
                  title={VISION_HINTS[m]}
                  className={clsx(
                    'group flex flex-col overflow-hidden rounded-lg border text-left transition',
                    active
                      ? 'border-gold-500/80 bg-gold-500/10 shadow-glow-gold'
                      : 'border-ink-500 bg-ink-800/60 hover:border-gold-700 hover:bg-ink-700/70',
                  )}
                >
                  <ModeIllustration mode={m} active={active} />
                  <span className={clsx('px-2 pb-1.5 pt-1 text-[11px] font-semibold leading-tight', active ? 'text-gold-200' : 'text-parchment-200')}>
                    {VISION_TITLES[m]}
                  </span>
                </button>
              );
            })}
          </div>,
        )}
        <p className="text-xs leading-snug text-parchment-400">
          {VISION_HINTS[mode]} {!allowInherit && 'Las zonas con visión propia la cambian mientras el héroe esté en ellas.'}
        </p>

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

        {limited && (
          <>
            {row(
              'visionRadius',
              <Slider
                label="Hasta dónde ven"
                value={radius.value}
                onChange={radius.change}
                onCommit={radius.flush}
                min={1}
                max={30}
                step={1}
                formatValue={cellsLabel}
              />,
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
                formatValue={coneLabel}
              />,
            )}
            <p className="-mt-1 text-xs leading-snug text-parchment-400">Los héroes con visión propia (p. ej. visión en la oscuridad) usan su radio.</p>
          </>
        )}
        {row(
          'sharedVision',
          <Toggle
            checked={get('sharedVision')}
            onChange={(v) => set('sharedVision', v)}
            label="Ven lo que ve el grupo"
            description="Además de lo suyo, cada jugador ve lo que ven sus compañeros."
          />,
        )}
      </section>

      <section className="space-y-3">
        <h4 className="label mb-0">Lo que ven en su pantalla</h4>
        {SCREEN_TOGGLES.filter((t) => t.key !== 'sharedVision').map((t) =>
          row(t.key, <Toggle checked={get(t.key)} onChange={(v) => set(t.key, v)} label={t.label} description={t.hint} />),
        )}
        {row(
          'enemyHp',
          <div>
            <span className="mb-1.5 block text-sm text-parchment-100">PV de enemigos</span>
            <Segmented
              ariaLabel="PV de enemigos"
              options={ENEMY_HP_OPTIONS}
              value={get('enemyHp')}
              onChange={(v) => {
                if (v !== get('enemyHp') || (allowInherit && !isSet('enemyHp'))) set('enemyHp', v);
              }}
            />
          </div>,
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
    <div className={clsx('rounded-lg border-l-2 pl-2.5 transition-colors', overridden ? 'border-gold-500/80' : 'border-ink-600', className)}>
      {children}
      <div className="mt-1 flex min-h-[1.25rem] items-center gap-2 text-[11px]">
        {overridden ? (
          <>
            <span className="font-semibold text-gold-300">Solo este jugador</span>
            <span className="text-parchment-400">· los demás: {inheritedText}</span>
            <button
              type="button"
              onClick={onReset}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-parchment-300 transition hover:bg-ink-700 hover:text-parchment-50"
              title="Volver a lo mismo que los demás"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Como todos
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-parchment-400">
            <Link2 className="h-3 w-3" aria-hidden />
            Como todos: {inheritedText}
          </span>
        )}
      </div>
    </div>
  );
}
