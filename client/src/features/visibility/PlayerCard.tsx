import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Eye, RotateCcw, ScanEye } from 'lucide-react';
import type { LiveState, VisibilitySettings } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { Slider } from '../../components/ui/Slider';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { MoveSwitch, ScreenToggles, VisionChoicePicker, type ScreenKey } from './controls';
import {
  hasOverride,
  overrideCount,
  personalChoice,
  playerVisionInfo,
  resetPlayer,
  setPlayerSetting,
  setPlayerVision,
  updatePlayer,
  type PlayerVisionInfo,
} from './playerVisibility';
import { useDraftNumber } from './useDraftNumber';
import { cellsLabel, isLimitedMode } from './visionText';

const SOURCE_TONE: Record<PlayerVisionInfo['source'], string> = {
  personal: 'text-gold-300',
  zone: 'text-sky-300',
  start: 'text-parchment-300',
  offmap: 'text-parchment-400',
};

/** "Ahora ve: … / Por la zona «…»" — what a player sees right now and why. */
export function NowSees({ info, className }: { info: PlayerVisionInfo; className?: string }) {
  return (
    <div className={clsx('flex items-start gap-2 rounded-lg border border-ink-600/60 bg-ink-950/50 px-2.5 py-2', className)}>
      <Eye className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0', SOURCE_TONE[info.source])} aria-hidden />
      <p className="min-w-0 flex-1 text-xs leading-snug text-parchment-200">
        <span className="text-parchment-400">Ahora ve: </span>
        <strong className="font-semibold text-parchment-50">{info.phrase}</strong>
        <span className={clsx('mt-0.5 block text-[11px]', SOURCE_TONE[info.source])}>
          {info.reason}
          {info.radiusNote && <span className="text-parchment-400"> · {info.radiusNote}</span>}
        </span>
      </p>
    </div>
  );
}

function PersonalRadius({ userId, info, personal }: { userId: string; info: PlayerVisionInfo; personal: boolean }) {
  const radius = useDraftNumber(info.radius, (v) => void updatePlayer(userId, { visionRadius: v }));
  return (
    <div className="space-y-1">
      <Slider
        label="Hasta dónde ve"
        value={radius.value}
        onChange={radius.change}
        onCommit={radius.flush}
        min={1}
        max={30}
        step={1}
        formatValue={cellsLabel}
      />
      {personal && (
        <button
          type="button"
          onClick={() => void updatePlayer(userId, {}, ['visionRadius'])}
          className="inline-flex items-center gap-1 rounded px-1 text-[11px] text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100"
          title="Usar el radio de la zona o la visión propia del héroe"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Usar el radio de la zona / del héroe
        </button>
      )}
    </div>
  );
}

/** One player: can move, vision (follows the zone or personal) and what their screen shows. */
export function PlayerCard({ state, userId, defaultOpen = false }: { state: LiveState; userId: string; defaultOpen?: boolean }) {
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const setViewAs = useSessionStore((s) => s.setViewAs);
  const [open, setOpen] = useState(defaultOpen);

  const player = state.players[userId];
  if (!player) return null;
  const hero = player.heroId ? state.heroes[player.heroId] ?? null : null;
  const own = state.visibility.perPlayer[userId];
  const info = playerVisionInfo(state, userId, (id) => zonesById[id]?.name ?? null);
  const eff = info.eff;
  const choice = personalChoice(state, userId);
  const personalCount = overrideCount(own);
  const previewing = viewAsUserId === userId;

  const changeScreen = <K extends ScreenKey | 'enemyHp'>(key: K, value: VisibilitySettings[K]) => {
    void setPlayerSetting(userId, key, value);
  };

  const reset = () => {
    void resetPlayer(userId).then((ok) => {
      if (ok) toast.success(`${player.name} vuelve a ver como todos`, { description: 'Su visión sigue a la zona donde está su héroe.' });
    });
  };

  return (
    <article
      className={clsx(
        'overflow-hidden rounded-xl border bg-ink-900/70 transition-colors',
        previewing ? 'border-arcane-500/70 shadow-glow-arcane' : 'border-ink-600/80',
      )}
    >
      <span aria-hidden className="block h-0.5" style={{ background: player.color }} />
      <header className="flex items-center gap-2.5 px-3 pt-2.5">
        <Avatar name={player.name} color={player.color} imageUrl={hero?.imageUrl ?? null} size="sm" status={player.connected ? 'online' : 'offline'} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-parchment-50">{player.name}</span>
            {personalCount > 0 && (
              <Badge tone="gold" size="xs" title={`${personalCount} ajustes solo para este jugador`}>
                Personal
              </Badge>
            )}
          </div>
          <span className="block truncate text-[11px] text-parchment-400">
            {hero ? hero.name : 'Sin héroe'}
            {info.zoneName ? ` · en ${info.zoneName}` : ''}
            {!player.connected && ' · desconectado'}
          </span>
        </div>
        <IconButton
          icon={<ScanEye />}
          size="sm"
          variant={previewing ? 'primary' : 'ghost'}
          title={previewing ? 'Volver a la vista del DM' : `Ver la partida como ${player.name}`}
          onClick={() => setViewAs(previewing ? null : userId)}
        />
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <MoveSwitch
          label="Puede moverse"
          checked={eff.canMoveOwnToken}
          personal={hasOverride(own, 'canMoveOwnToken')}
          onChange={(v) => void setPlayerSetting(userId, 'canMoveOwnToken', v)}
        />
        <NowSees info={info} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-medium text-parchment-300 transition hover:bg-ink-800 hover:text-parchment-50"
        >
          <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
          Cambiar su visión y su pantalla
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-600/60 px-3 py-3 animate-fade-in">
          <div className="space-y-2">
            <h5 className="label mb-0">Visión</h5>
            <VisionChoicePicker value={choice} onChange={(c) => void setPlayerVision(userId, c)} ariaLabel={`Visión de ${player.name}`} />
            {choice === 'follow' ? (
              <p className="text-[11px] leading-snug text-parchment-400">
                Ve lo que marque la zona en la que está su héroe: si entra en una cueva oscura pierde visión y al salir la recupera.
              </p>
            ) : (
              <p className="text-[11px] leading-snug text-gold-300/90">Visión personal: no cambia al moverse entre zonas.</p>
            )}
            {choice !== 'follow' && isLimitedMode(choice) && (
              <PersonalRadius key={userId} userId={userId} info={info} personal={hasOverride(own, 'visionRadius')} />
            )}
            {choice === 'none' && (
              <ImageUpload
                label="Imagen de escena"
                hint="Opcional: sin imagen verá una pantalla negra."
                value={eff.sceneImageUrl}
                onChange={(url) => void updatePlayer(userId, { sceneImageUrl: url })}
                aspect="video"
              />
            )}
          </div>

          <div className="space-y-2">
            <h5 className="label mb-0">Lo que ve en su pantalla</h5>
            <ScreenToggles value={eff} onChange={changeScreen} personal={(k) => hasOverride(own, k)} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant={previewing ? 'primary' : 'secondary'} icon={<ScanEye />} onClick={() => setViewAs(previewing ? null : userId)}>
              {previewing ? 'Salir de su vista' : 'Ver como este jugador'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw />}
              disabled={personalCount === 0}
              onClick={reset}
              title="Quita todos sus ajustes personales: vuelve a seguir la zona y a ver lo mismo que los demás"
            >
              Restablecer
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
