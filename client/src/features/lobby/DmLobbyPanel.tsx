import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CircleAlert, Eye, ListOrdered, Map as MapIcon, Settings2, Swords, Users, WifiOff } from 'lucide-react';
import { VISION_MODE_LABELS, type SessionPlayer } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/toast';
import { Toggle } from '../../components/ui/Toggle';
import { useSessionStore } from '../../stores/session';
import { uiSounds } from '../audio/uiSounds';
import { ENEMY_HP_LABELS, useSessionPlayers } from './lobbyUi';
import { TurnOrderEditor } from './TurnOrderEditor';

function names(list: SessionPlayer[]): string {
  return list.map((p) => p.name).join(', ');
}

/** DM side of the lobby: readiness, session options, initial visibility, turn order and the big start button. */
export function DmLobbyPanel() {
  const confirm = useConfirm();
  const players = useSessionPlayers();
  const visibility = useSessionStore((s) => s.view?.state.visibility.global ?? null);
  const tradeNeedsApproval = useSessionStore((s) => s.view?.state.options.tradeNeedsApproval ?? false);
  const resumed = useSessionStore((s) => !!s.view?.state.startedAt);
  const campaignId = useSessionStore((s) => s.view?.state.campaignId ?? null);
  // The DM receives every zone of the campaign on join (before the lobby renders).
  const noZones = useSessionStore((s) => s.campaign !== null && s.zones.length === 0);
  const [starting, setStarting] = useState(false);
  const [savingOption, setSavingOption] = useState(false);

  const noHero = players.filter((p) => !p.heroId);
  const notReady = players.filter((p) => p.heroId && !p.ready);
  const offline = players.filter((p) => !p.connected);
  const readyCount = players.filter((p) => p.ready && p.heroId).length;
  const allReady = players.length > 0 && readyCount === players.length;
  const pct = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0;

  const start = async () => {
    if (starting) return;
    if (noZones) {
      toast.warning('La campaña no tiene zonas', { description: 'Crea al menos una zona en el editor antes de iniciar.' });
      return;
    }
    if (players.length === 0) {
      const ok = await confirm({
        title: 'Nadie se ha unido todavía',
        message: 'No hay jugadores en la sala. ¿Quieres iniciar la campaña igualmente? Podrán unirse más tarde.',
        confirmLabel: 'Iniciar igualmente',
      });
      if (!ok) return;
    } else if (noHero.length > 0 || notReady.length > 0) {
      const ok = await confirm({
        title: 'No todos están listos',
        message: (
          <div className="space-y-1.5">
            {noHero.length > 0 && (
              <p>
                <strong className="text-parchment-100">Sin héroe:</strong> {names(noHero)}. No tendrán ficha en el mapa hasta que elijan uno y la coloques.
              </p>
            )}
            {notReady.length > 0 && (
              <p>
                <strong className="text-parchment-100">Sin confirmar:</strong> {names(notReady)}.
              </p>
            )}
            <p>¿Iniciar la campaña de todos modos?</p>
          </div>
        ),
        confirmLabel: 'Iniciar de todos modos',
        danger: true,
      });
      if (!ok) return;
    }
    setStarting(true);
    try {
      await emitAck('session:start', {});
      uiSounds.reveal();
    } catch (err) {
      toast.fromError(err, 'No se pudo iniciar la campaña');
    } finally {
      setStarting(false);
    }
  };

  const setTradeApproval = async (value: boolean) => {
    setSavingOption(true);
    try {
      await emitAck('session:setOptions', { patch: { tradeNeedsApproval: value } });
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar la opción');
    } finally {
      setSavingOption(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="panel flex flex-col overflow-hidden" aria-label="Preparación de la partida">
        <div className="panel-header">
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" aria-hidden />
            Preparación
          </span>
          <Badge tone={allReady ? 'emerald' : 'neutral'} size="xs">
            {readyCount}/{players.length} listos
          </Badge>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-parchment-200">
                <Users className="h-4 w-4 text-gold-400" aria-hidden />
                {players.length === 0
                  ? 'Esperando a los jugadores…'
                  : allReady
                    ? '¡Todo el grupo está listo!'
                    : `${readyCount} de ${players.length} aventureros listos`}
              </span>
              <span className="text-xs tabular-nums text-parchment-400">{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={clsx('h-full rounded-full transition-[width] duration-500', allReady ? 'bg-emerald-400' : 'bg-gold-sheen')}
                style={{ width: `${pct}%` }}
              />
            </div>
            {(noHero.length > 0 || notReady.length > 0 || offline.length > 0) && (
              <ul className="mt-3 space-y-1 text-xs text-parchment-300">
                {noHero.length > 0 && (
                  <li className="flex items-start gap-1.5">
                    <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />
                    <span>
                      <strong className="text-parchment-100">Sin héroe:</strong> {names(noHero)}
                    </span>
                  </li>
                )}
                {notReady.length > 0 && (
                  <li className="flex items-start gap-1.5">
                    <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden />
                    <span>
                      <strong className="text-parchment-100">Sin confirmar:</strong> {names(notReady)}
                    </span>
                  </li>
                )}
                {offline.length > 0 && (
                  <li className="flex items-start gap-1.5">
                    <WifiOff className="mt-px h-3.5 w-3.5 shrink-0 text-parchment-400" aria-hidden />
                    <span>
                      <strong className="text-parchment-100">Desconectados:</strong> {names(offline)}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-ink-600/80 bg-ink-950/40 p-3">
            <Toggle
              size="sm"
              checked={tradeNeedsApproval}
              disabled={savingOption}
              onChange={(v) => void setTradeApproval(v)}
              label="Los trueques entre jugadores requieren tu aprobación"
              description="Puedes cambiarlo también durante la partida."
            />
          </div>

          {visibility && (
            <div className="rounded-lg border border-ink-600/80 bg-ink-950/40 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-parchment-300">
                <Eye className="h-3.5 w-3.5 text-gold-400" aria-hidden />
                Ajustes de visibilidad iniciales
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="sky" size="xs">
                  {VISION_MODE_LABELS[visibility.visionMode]}
                </Badge>
                {(visibility.visionMode === 'vision' || visibility.visionMode === 'explored') && (
                  <Badge size="xs">
                    Visión {visibility.visionRadius} casillas{visibility.visionCone < 360 ? ` · cono ${visibility.visionCone}°` : ''}
                  </Badge>
                )}
                <Badge size="xs">PV enemigos: {ENEMY_HP_LABELS[visibility.enemyHp]}</Badge>
                <Badge size="xs" tone={visibility.canSeeInitiative ? 'emerald' : 'neutral'}>
                  {visibility.canSeeInitiative ? 'Iniciativa visible' : 'Iniciativa oculta'}
                </Badge>
                {visibility.sharedVision && <Badge size="xs">Visión compartida</Badge>}
                {visibility.canMoveOwnToken && <Badge size="xs">Mueven su ficha</Badge>}
                {visibility.canSeeOthersRolls && <Badge size="xs">Ven tiradas ajenas</Badge>}
                {visibility.canSeeEnemyDetails && <Badge size="xs">Ven fichas de enemigos</Badge>}
                {visibility.canSeeOverview && <Badge size="xs">Mapa general</Badge>}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-parchment-400">
                Vienen de la configuración de la campaña. Podrás ajustarlos (también por jugador) en cualquier momento durante la partida.
              </p>
            </div>
          )}

          <div className="mt-auto pt-1">
            {noZones && (
              <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-blood-500/50 bg-blood-500/10 p-3 text-sm text-parchment-200">
                <MapIcon className="mt-0.5 h-4 w-4 shrink-0 text-blood-300" aria-hidden />
                <div>
                  Esta campaña aún no tiene zonas: no hay mapa donde colocar a los héroes.{' '}
                  {campaignId && (
                    <Link to={`/campanas/${campaignId}/editor`} className="font-semibold text-gold-300 underline-offset-2 hover:underline">
                      Abrir el editor
                    </Link>
                  )}
                </div>
              </div>
            )}
            <Button
              variant="primary"
              size="lg"
              epic
              block
              icon={<Swords />}
              loading={starting}
              onClick={() => void start()}
              className={clsx('py-4 text-lg', allReady && 'animate-glow-pulse')}
            >
              {resumed ? 'Reanudar campaña' : 'Iniciar campaña'}
            </Button>
            <p className="mt-2 text-center text-[11px] text-parchment-400">
              {resumed
                ? 'Los héroes vuelven a sus posiciones guardadas.'
                : 'Las fichas de los héroes aparecerán en el punto de inicio de la campaña.'}
            </p>
          </div>
        </div>
      </section>

      <section className="panel flex flex-col overflow-hidden" aria-label="Orden de turnos">
        <div className="panel-header">
          <span className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" aria-hidden />
            Orden de turnos
          </span>
        </div>
        <div className="p-4">
          <TurnOrderEditor />
        </div>
      </section>
    </div>
  );
}
