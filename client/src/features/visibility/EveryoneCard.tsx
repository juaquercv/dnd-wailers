import { useMemo } from 'react';
import { RotateCcw, Users } from 'lucide-react';
import { effectiveVisibility, type LiveState, type VisibilitySettings } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { Slider } from '../../components/ui/Slider';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { MoveSwitch, ScreenToggles, VisionChoicePicker, type ScreenKey } from './controls';
import {
  overrideCount,
  personalChoice,
  playerIds,
  playerVisionInfo,
  resetEveryone,
  setForEveryone,
  setPersonalForEveryone,
  setVisionForEveryone,
} from './playerVisibility';
import { useDraftNumber } from './useDraftNumber';
import { cellsLabel, isLimitedMode, plural, type VisionChoice } from './visionText';

function EveryoneRadius({ value }: { value: number }) {
  const radius = useDraftNumber(value, (v) => void setPersonalForEveryone({ visionRadius: v }));
  return (
    <Slider
      label="Hasta dónde ven"
      value={radius.value}
      onChange={radius.change}
      onCommit={radius.flush}
      min={1}
      max={30}
      step={1}
      formatValue={cellsLabel}
    />
  );
}

/** Controls that apply to every player at once (and drop the personal values of what they change). */
export function EveryoneCard({ state }: { state: LiveState }) {
  const zonesById = useSessionStore((s) => s.zonesById);
  const confirm = useConfirm();
  const global = state.visibility.global;
  const ids = useMemo(() => playerIds(state), [state]);
  const n = ids.length;

  const effs = useMemo(() => ids.map((id) => effectiveVisibility(state, id)), [ids, state]);
  const canMove = effs.filter((e) => e.canMoveOwnToken).length;
  const allCanMove = n > 0 ? canMove === n : global.canMoveOwnToken;
  const moveNote =
    n === 0
      ? undefined
      : canMove === n
        ? 'Todos pueden arrastrar su ficha y cambiar de zona'
        : canMove === 0
          ? 'Nadie puede mover su ficha'
          : `Solo ${canMove} de ${n} pueden moverse`;

  const choices = ids.map((id) => personalChoice(state, id));
  const common: VisionChoice | null = n === 0 ? 'follow' : choices.every((c) => c === choices[0]) ? choices[0]! : null;
  const firstId = ids[0];
  const firstInfo = firstId ? playerVisionInfo(state, firstId, (id) => zonesById[id]?.name ?? null) : null;
  const withPersonal = ids.filter((id) => overrideCount(state.visibility.perPlayer[id]) > 0).length;

  const differs = (key: ScreenKey | 'enemyHp') => effs.filter((e) => e[key] !== global[key]).length;

  const changeScreen = <K extends ScreenKey | 'enemyHp'>(key: K, value: VisibilitySettings[K]) => {
    void setForEveryone(key, value);
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Quitar los ajustes personales',
      message: 'Todos los jugadores volverán a ver lo mismo y su visión seguirá a la zona donde está su héroe.',
      confirmLabel: 'Quitar ajustes',
    });
    if (!ok) return;
    if (await resetEveryone()) toast.success('Todos los jugadores ven igual otra vez');
  };

  return (
    <article className="overflow-hidden rounded-xl border border-gold-700/60 bg-gradient-to-b from-gold-500/[0.07] to-ink-900/80 shadow-panel">
      <header className="flex items-center gap-2 px-3 pt-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-300" aria-hidden>
          <Users className="h-4 w-4" />
        </span>
        <h3 className="min-w-0 flex-1 truncate font-display text-sm font-semibold tracking-wide text-gold-200">Todos los jugadores</h3>
        <Badge size="xs">{plural(n, 'jugador', 'jugadores')}</Badge>
      </header>
      <p className="px-3 pt-1 text-[11px] leading-snug text-parchment-400">
        Lo que cambies aquí se aplica a todos a la vez y sustituye lo que hubieras ajustado a cada uno.
      </p>

      <div className="space-y-3 p-3">
        <MoveSwitch label="Pueden moverse" checked={allCanMove} note={moveNote} onChange={(v) => void setForEveryone('canMoveOwnToken', v)} />

        <div className="space-y-2">
          <h5 className="label mb-0">Visión de todos</h5>
          <VisionChoicePicker value={common} onChange={(c) => void setVisionForEveryone(c)} disabled={n === 0} ariaLabel="Visión de todos los jugadores" />
          <p className="text-[11px] leading-snug text-parchment-400">
            {n === 0
              ? 'Cuando se unan jugadores podrás cambiar su visión.'
              : common === null
                ? 'Cada jugador tiene una visión distinta: elige una opción para igualarlos.'
                : common === 'follow'
                  ? 'Cada uno ve según la zona en la que está su héroe (todo visible salvo en zonas como cuevas oscuras).'
                  : 'Todos tienen la misma visión, estén en la zona que estén.'}
          </p>
          {common !== null && common !== 'follow' && isLimitedMode(common) && firstInfo && <EveryoneRadius value={firstInfo.radius} />}
          {common === 'none' && firstInfo && (
            <ImageUpload
              label="Imagen de escena para todos"
              hint="Opcional: sin imagen verán una pantalla negra."
              value={firstInfo.eff.sceneImageUrl}
              onChange={(url) => void setPersonalForEveryone({ sceneImageUrl: url })}
              aspect="video"
            />
          )}
        </div>

        <div className="space-y-2">
          <h5 className="label mb-0">Lo que ven en su pantalla</h5>
          <ScreenToggles value={global} onChange={changeScreen} differs={differs} />
        </div>

        {withPersonal > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-gold-700/40 bg-ink-950/50 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-parchment-300">
              {withPersonal === 1 ? '1 jugador tiene ajustes personales.' : `${withPersonal} jugadores tienen ajustes personales.`}
            </span>
            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void resetAll()}>
              Igualar a todos
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
