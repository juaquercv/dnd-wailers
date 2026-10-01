import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CircleX, Crown, DoorOpen, RefreshCw, UserX, WifiOff } from 'lucide-react';
import { APP_NAME } from '@wailers/shared';
import { FullScreenLoader } from '../../components/layout/FullScreenLoader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/toast';
import { useSessionEvent } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';
import { AudioController } from '../audio/AudioController';
import { uiSounds } from '../audio/uiSounds';
import { DiceOverlay } from '../dice/DiceOverlay';
import { InitiativeDrawOverlay } from '../dice/InitiativeDrawOverlay';
import { RollPrompts } from '../dice/RollPrompts';
import { GameScreen } from '../game/GameScreen';
import { LobbyScreen } from '../lobby/LobbyScreen';
import { isSelfExit } from '../lobby/lobbyUi';

/*
 * Join/leave are serialized: leaving one session (route change / unmount) must finish before the
 * next join starts, otherwise the store reset of `leave()` could wipe the freshly joined session.
 */
let lifecycle: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  lifecycle = lifecycle.then(task).catch(() => undefined);
  return lifecycle;
}

async function enterSession(sessionId: string): Promise<void> {
  const current = useSessionStore.getState();
  if (current.sessionId && current.sessionId !== sessionId) await current.leave();
  const s = useSessionStore.getState();
  if (s.sessionId === sessionId && s.status === 'joined') return;
  // join() stores the Spanish error message in the store (status 'error').
  await s.join(sessionId).catch(() => undefined);
}

async function exitSession(): Promise<void> {
  const s = useSessionStore.getState();
  if (s.sessionId) await s.leave();
}

/* A page unload (reload / tab close) must not leave the session: the client rejoins after reloading. */
let unloading = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    unloading = true;
  });
  window.addEventListener('pageshow', () => {
    unloading = false;
  });
}

interface ExitNotice {
  kind: 'kicked' | 'ended';
  reason: string;
}

/** Route /sesion/:sessionId — joins the live session and shows the lobby or the game table. */
export default function SessionPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const storeSessionId = useSessionStore((s) => s.sessionId);
  const status = useSessionStore((s) => s.status);
  const error = useSessionStore((s) => s.error);
  const hasView = useSessionStore((s) => s.view !== null && s.view.state.sessionId === sessionId);
  const gameStatus = useSessionStore((s) => s.view?.state.status ?? null);
  const role = useSessionStore((s) => s.view?.role ?? null);
  const sessionName = useSessionStore((s) => s.view?.state.name ?? null);
  const connected = useSessionStore((s) => s.socketConnected);

  const [notice, setNotice] = useState<ExitNotice | null>(null);
  const [showReconnect, setShowReconnect] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setNotice(null);
    void enqueue(() => enterSession(sessionId));
    return () => {
      if (!unloading) void enqueue(exitSession);
    };
  }, [sessionId]);

  useSessionEvent('toast', (e) => {
    toast.show(e.level, e.text);
  });
  useSessionEvent('kicked', (e) => {
    uiSounds.notify();
    setNotice({ kind: 'kicked', reason: e.reason });
  });
  useSessionEvent('sessionEnded', (e) => {
    if (isSelfExit()) return;
    uiSounds.notify();
    setNotice({ kind: 'ended', reason: e.reason });
  });

  const joined = storeSessionId === sessionId && status === 'joined' && hasView;

  // Short grace period so brief network hiccups do not flash the banner.
  useEffect(() => {
    if (connected || !joined) {
      setShowReconnect(false);
      return;
    }
    const timer = setTimeout(() => setShowReconnect(true), 700);
    return () => clearTimeout(timer);
  }, [connected, joined]);

  useEffect(() => {
    if (!sessionName) return;
    const prev = document.title;
    document.title = `${sessionName} · ${APP_NAME}`;
    return () => {
      document.title = prev;
    };
  }, [sessionName]);

  if (!sessionId) return <Navigate to="/menu" replace />;

  const goMenu = () => {
    void enqueue(exitSession);
    navigate('/menu');
  };

  if (storeSessionId === sessionId && status === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="panel w-full max-w-md animate-scale-in">
          <EmptyState
            icon={<CircleX />}
            title="No se pudo entrar en la partida"
            description={error ?? 'Ocurrió un error inesperado al unirse a la partida.'}
            action={
              <>
                <Button variant="primary" icon={<DoorOpen />} onClick={goMenu}>
                  Volver al menú
                </Button>
                <Button variant="ghost" icon={<RefreshCw />} onClick={() => void enqueue(() => enterSession(sessionId))}>
                  Reintentar
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  if (!joined) return <FullScreenLoader label="Entrando en la partida…" />;

  const inLobby = gameStatus === 'lobby';

  return (
    <div className="relative h-full min-h-0">
      {showReconnect && (
        <div
          role="status"
          aria-live="assertive"
          className="pointer-events-none fixed left-1/2 top-2 z-90 flex -translate-x-1/2 animate-slide-up items-center gap-2.5 rounded-full border border-gold-500/60 bg-ink-950/95 px-4 py-2 text-sm font-semibold text-gold-200 shadow-glow-gold backdrop-blur"
        >
          <WifiOff className="h-4 w-4 text-gold-400" aria-hidden />
          Reconectando…
          <Spinner size="xs" label="Reconectando con el servidor" />
        </div>
      )}

      <div key={inLobby ? 'lobby' : 'game'} className="h-full min-h-0 animate-fade-in">
        {inLobby ? <LobbyScreen /> : <GameScreen />}
      </div>

      <AudioController />
      <DiceOverlay />
      <InitiativeDrawOverlay />
      <RollPrompts />

      <Modal
        open={notice !== null}
        onClose={() => undefined}
        closeOnBackdrop={false}
        closeOnEsc={false}
        hideClose
        size="sm"
        layer="dialog"
        icon={notice?.kind === 'kicked' ? <UserX /> : <Crown />}
        title={notice?.kind === 'kicked' ? 'Has sido expulsado' : 'La partida ha terminado'}
        footer={
          <>
            {role === 'dm' && notice?.kind === 'ended' && (
              <Button
                variant="ghost"
                onClick={() => {
                  void enqueue(exitSession);
                  navigate('/hostear');
                }}
              >
                Ir a «Hostear partida»
              </Button>
            )}
            <Button variant="primary" icon={<DoorOpen />} onClick={goMenu} data-autofocus>
              Volver al menú
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-parchment-200">
          {notice?.reason?.trim() ||
            (notice?.kind === 'kicked' ? 'El DM te ha sacado de la partida.' : 'El DM ha cerrado la partida.')}
        </p>
        {notice?.kind === 'ended' && role !== 'dm' && (
          <p className="mt-2 text-xs text-parchment-400">Tu héroe conserva su progreso: inventario, oro y experiencia quedan guardados.</p>
        )}
      </Modal>
    </div>
  );
}
