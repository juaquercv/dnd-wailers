import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, ListOrdered, Save, Users } from 'lucide-react';
import type { Campaign, SessionPlayer } from '@wailers/shared';
import { api } from '../../api/http';
import { emitAck } from '../../api/socket';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { ChatPanel } from '../chat/ChatPanel';
import { DmLobbyPanel } from './DmLobbyPanel';
import { HeroPicker } from './HeroPicker';
import { LobbyHeader, ResumedBanner } from './LobbyHeader';
import { markSelfExit, SectionTitle, useLiveSessionSummary, useSessionPlayers } from './lobbyUi';
import { PlayerCard } from './PlayerCard';
import { TurnOrderEditor } from './TurnOrderEditor';

/** Pre-game room: players pick heroes and get ready, the DM prepares the turn order and starts. */
export function LobbyScreen() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const sessionId = useSessionStore((s) => s.sessionId);
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? '');
  const sessionName = useSessionStore((s) => s.view?.state.name ?? 'Partida');
  const campaignId = useSessionStore((s) => s.view?.state.campaignId ?? '');
  const storeRules = useSessionStore((s) => s.campaign?.rules ?? null);
  const players = useSessionPlayers();
  const summary = useLiveSessionSummary(sessionId);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [kicking, setKicking] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  // Only the DM learns the campaign details before it starts.
  useEffect(() => {
    if (!isDm || !campaignId) {
      setCampaign(null);
      return;
    }
    let cancelled = false;
    api.campaigns
      .get(campaignId)
      .then((c) => {
        if (!cancelled) setCampaign(c);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isDm, campaignId]);

  const rules = storeRules ?? campaign?.rules ?? null;
  const readyCount = players.filter((p) => p.ready && p.heroId).length;

  const kick = async (player: SessionPlayer) => {
    const ok = await confirm({
      title: `Expulsar a ${player.name}`,
      message: 'Saldrá de la sala de espera y volverá al menú principal.',
      confirmLabel: 'Expulsar',
      danger: true,
    });
    if (!ok) return;
    setKicking(player.userId);
    try {
      await emitAck('lobby:kick', { userId: player.userId });
      toast.success(`${player.name} ha sido expulsado de la sala`);
    } catch (err) {
      toast.fromError(err, 'No se pudo expulsar al jugador');
    } finally {
      setKicking(null);
    }
  };

  const closeRoom = async () => {
    const ok = await confirm({
      title: 'Cerrar la sala',
      message: 'La partida se guardará en pausa y los jugadores volverán al menú. Podrás continuarla desde «Hostear partida».',
      confirmLabel: 'Guardar y cerrar',
    });
    if (!ok) return;
    setClosing(true);
    markSelfExit();
    try {
      await emitAck('session:pause', {});
      toast.success('Partida guardada. La sala se ha cerrado.');
      navigate('/hostear');
    } catch (err) {
      toast.fromError(err, 'No se pudo cerrar la sala');
    } finally {
      setClosing(false);
    }
  };

  const actions = isDm ? (
    <Button variant="ghost" size="sm" icon={<Save />} loading={closing} onClick={() => void closeRoom()} title="Guardar la partida en pausa y cerrar la sala">
      <span className="hidden sm:inline">Guardar y cerrar</span>
    </Button>
  ) : (
    <Button variant="ghost" size="sm" icon={<DoorOpen />} onClick={() => navigate('/unirse')} title="Salir de la sala de espera">
      <span className="hidden sm:inline">Salir de la sala</span>
    </Button>
  );

  return (
    <AppShell
      title={sessionName}
      subtitle={isDm ? 'Sala de espera · Eres el DM' : 'Sala de espera'}
      back={isDm ? '/hostear' : '/unirse'}
      actions={actions}
      fullBleed
    >
      <div className="scroll-thin h-full overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-4 p-3 sm:p-4 lg:h-full lg:flex-row">
          {/* Block flow (not a flex column): children must never shrink inside the constrained scroll area. */}
          <div className="scroll-thin min-w-0 flex-1 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <LobbyHeader campaign={campaign} campaignNameFallback={summary?.campaignName ?? null} hostConnected={summary ? summary.hostConnected : null} />
            <ResumedBanner />

            <section aria-label="Aventureros en la sala" className="flex flex-col gap-3">
              <SectionTitle
                icon={<Users />}
                aside={
                  players.length > 0 ? (
                    <span className="text-xs text-parchment-300">
                      <strong className="text-emerald-300">{readyCount}</strong> / {players.length} listos
                    </span>
                  ) : undefined
                }
              >
                Aventureros en la sala
              </SectionTitle>
              {players.length === 0 ? (
                <div className="panel">
                  <EmptyState
                    compact
                    icon={<Users />}
                    title="Esperando aventureros…"
                    description={
                      isDm
                        ? 'Los jugadores pueden entrar desde «Unirse a partida» en el menú principal.'
                        : 'Aún no ha entrado nadie más.'
                    }
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {players.map((p, i) => (
                    <PlayerCard
                      key={p.userId}
                      index={i}
                      player={p}
                      isMe={p.userId === meUserId}
                      viewerIsDm={isDm}
                      rules={rules}
                      kicking={kicking === p.userId}
                      onKick={isDm ? () => void kick(p) : undefined}
                    />
                  ))}
                </div>
              )}
            </section>

            {isDm ? (
              <DmLobbyPanel />
            ) : (
              <>
                <HeroPicker />
                <section className="panel overflow-hidden" aria-label="Orden de turnos">
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
              </>
            )}
          </div>

          <aside className="flex h-[30rem] min-h-0 shrink-0 flex-col lg:h-auto lg:w-[22rem] xl:w-[25rem]" aria-label="Chat">
            <div className="min-h-0 flex-1">
              <ChatPanel />
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
