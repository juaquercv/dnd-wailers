import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CircleX, Crown, DoorOpen, Flag, Hourglass, Pause, Play, RefreshCw, Swords, UserX, WifiOff } from 'lucide-react';
import { APP_NAME } from '@wailers/shared';
import { api } from '../../api/http';
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

async function enterSession(sessionId: string, force = false): Promise<void> {
  const current = useSessionStore.getState();
  if (current.sessionId && current.sessionId !== sessionId) await current.leave();
  const s = useSessionStore.getState();
  if (!force && s.sessionId === sessionId && s.status === 'joined') return;
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

/** How long a DM keeps seeing the table after the session closes (the initiator usually navigates away first). */
const CLOSED_PANEL_DELAY_MS = 1500;

type ExitKind = 'kicked' | 'paused' | 'ended';

interface ExitNotice {
  kind: ExitKind;
  reason: string;
}

const EXIT_COPY: Record<ExitKind, { title: string; fallback: string }> = {
  kicked: { title: 'Has sido expulsado', fallback: 'El DM te ha sacado de la partida.' },
  paused: { title: 'Partida en pausa', fallback: 'El DM ha pausado la partida. Podrás volver cuando la reanude.' },
  ended: { title: 'La partida ha terminado', fallback: 'El DM ha cerrado la partida.' },
};

/** 'sessionEnded' covers pause, end and deletion; the server reason tells a pause apart. */
function endedKind(reason: string): ExitKind {
  return /paus/i.test(reason) ? 'paused' : 'ended';
}

/**
 * Stop the store from silently rejoining (socket reconnection) once the server has thrown us out,
 * while keeping the last view on screen behind the notice.
 */
function freezeSession(sessionId: string): void {
  const s = useSessionStore.getState();
  if (s.sessionId === sessionId && s.status === 'joined') useSessionStore.setState({ status: 'idle' });
}

function ExitIcon({ kind }: { kind: ExitKind }) {
  if (kind === 'kicked') return <UserX />;
  if (kind === 'paused') return <Pause />;
  return <Crown />;
}

/** Shown to the DM when the session is paused / ended while the page is still open (or was entered that way). */
function ClosedSessionPanel({
  status,
  sessionId,
  sessionName,
  isDm,
  onMenu,
  onHost,
}: {
  status: 'paused' | 'ended';
  sessionId: string;
  sessionName: string;
  isDm: boolean;
  onMenu: () => void;
  onHost: () => void;
}) {
  const [resuming, setResuming] = useState(false);
  const paused = status === 'paused';

  const resume = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      await api.sessions.resume(sessionId);
      toast.success('Partida reanudada', { description: 'La sala de espera vuelve a estar abierta para los jugadores.' });
      // The session may have been unloaded from memory: join again to receive the fresh lobby state.
      await enqueue(() => enterSession(sessionId, true));
    } catch (err) {
      toast.fromError(err, 'No se pudo reanudar la partida');
      setResuming(false);
    }
  };

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: paused
            ? 'radial-gradient(ellipse 60% 50% at 50% 35%, rgba(212,166,63,0.14), transparent 70%)'
            : 'radial-gradient(ellipse 60% 50% at 50% 35%, rgba(196,61,51,0.12), transparent 70%)',
        }}
      />
      <div className="panel relative w-full max-w-lg animate-scale-in">
        <EmptyState
          icon={paused ? <Hourglass /> : <Flag />}
          title={paused ? 'Partida en pausa' : 'Partida terminada'}
          description={
            <>
              <span className="block font-display text-base text-gold-200">«{sessionName}»</span>
              <span className="mt-2 block">
                {isDm
                  ? 'La partida está guardada. Si la reanudas volverá a la sala de espera y se conservarán héroes, posiciones e inventarios.'
                  : 'El DM ha cerrado la partida. Podrás volver a entrar cuando la reanude.'}
              </span>
            </>
          }
          action={
            <>
              {isDm && (
                <Button variant="primary" epic icon={<Play />} loading={resuming} onClick={() => void resume()}>
                  Reanudar partida
                </Button>
              )}
              {isDm && (
                <Button variant="secondary" icon={<Swords />} disabled={resuming} onClick={onHost}>
                  Hostear partida
                </Button>
              )}
              <Button variant="ghost" icon={<DoorOpen />} disabled={resuming} onClick={onMenu}>
                Volver al menú
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
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
  /** Session id whose lobby/game was seen active on this page (a later pause is shown with a delay). */
  const [activeSeen, setActiveSeen] = useState<string | null>(null);
  const [closedShown, setClosedShown] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setNotice(null);
    setClosedShown(false);
    void enqueue(() => enterSession(sessionId));
    return () => {
      if (!unloading) void enqueue(exitSession);
    };
  }, [sessionId]);

  useSessionEvent('toast', (e) => {
    toast.show(e.level, e.text);
  });
  useSessionEvent('kicked', (e) => {
    freezeSession(sessionId);
    uiSounds.notify();
    setNotice({ kind: 'kicked', reason: e.reason });
  });
  useSessionEvent('sessionEnded', (e) => {
    if (isSelfExit()) return;
    freezeSession(sessionId);
    uiSounds.notify();
    setNotice({ kind: endedKind(e.reason), reason: e.reason });
  });

  const frozen = notice !== null;
  const joined = storeSessionId === sessionId && hasView && (status === 'joined' || frozen);
  const live = joined && !frozen;

  // Short grace period so brief network hiccups do not flash the banner.
  useEffect(() => {
    if (connected || !live) {
      setShowReconnect(false);
      return;
    }
    const timer = setTimeout(() => setShowReconnect(true), 700);
    return () => clearTimeout(timer);
  }, [connected, live]);

  const closedStatus = joined && (gameStatus === 'paused' || gameStatus === 'ended') ? gameStatus : null;
  const sawActive = activeSeen === sessionId;

  useEffect(() => {
    if (joined && (gameStatus === 'lobby' || gameStatus === 'playing')) setActiveSeen(sessionId);
  }, [joined, gameStatus, sessionId]);

  useEffect(() => {
    if (!closedStatus || frozen) {
      setClosedShown(false);
      return;
    }
    const timer = setTimeout(() => setClosedShown(true), sawActive ? CLOSED_PANEL_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [closedStatus, frozen, sawActive]);

  useEffect(() => {
    if (!sessionName) return;
    const prev = document.title;
    document.title = `${sessionName} · ${APP_NAME}`;
    return () => {
      document.title = prev;
    };
  }, [sessionName]);

  if (!sessionId) return <Navigate to="/menu" replace />;

  const goTo = (path: string) => {
    void enqueue(exitSession);
    navigate(path);
  };
  const goMenu = () => goTo('/menu');

  if (!frozen && storeSessionId === sessionId && status === 'error') {
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
                <Button variant="ghost" icon={<RefreshCw />} onClick={() => void enqueue(() => enterSession(sessionId, true))}>
                  Reintentar
                </Button>
                <Button variant="ghost" icon={<Swords />} onClick={() => goTo('/unirse')}>
                  Ver partidas activas
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  if (!joined) return <FullScreenLoader label="Entrando en la partida…" />;

  // A session entered while closed shows the panel at once; one closed in front of us waits a moment.
  const showClosed = closedStatus !== null && !frozen && (closedShown || !sawActive);
  const inLobby = gameStatus === 'lobby';
  const screenKey = showClosed ? 'closed' : inLobby ? 'lobby' : 'game';
  const exitCopy = notice ? EXIT_COPY[notice.kind] : null;

  return (
    <div className="relative h-full min-h-0">
      {/*
       * Portaled to <body>: #root is an isolated stacking context, so an in-tree banner would sit
       * below every portaled modal / drawer. The flex wrapper centres it (the slide-up animation
       * owns `transform`, which would cancel a translate-based centring).
       */}
      {showReconnect &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-2 z-90 flex justify-center px-4">
            <div
              role="status"
              aria-live="assertive"
              className="flex animate-slide-up items-center gap-2.5 rounded-full border border-gold-500/60 bg-ink-950/95 px-4 py-2 text-sm font-semibold text-gold-200 shadow-glow-gold backdrop-blur"
            >
              <WifiOff className="h-4 w-4 text-gold-400" aria-hidden />
              Reconectando…
              <Spinner size="xs" label="Reconectando con el servidor" />
            </div>
          </div>,
          document.body,
        )}

      <div key={screenKey} className="h-full min-h-0 animate-fade-in">
        {showClosed && closedStatus ? (
          <ClosedSessionPanel
            status={closedStatus}
            sessionId={sessionId}
            sessionName={sessionName ?? 'Partida'}
            isDm={role === 'dm'}
            onMenu={goMenu}
            onHost={() => goTo('/hostear')}
          />
        ) : inLobby ? (
          <LobbyScreen />
        ) : (
          <GameScreen />
        )}
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
        icon={notice ? <ExitIcon kind={notice.kind} /> : undefined}
        title={exitCopy?.title}
        footer={
          <>
            {role === 'dm' && notice?.kind !== 'kicked' && (
              <Button variant="ghost" onClick={() => goTo('/hostear')}>
                Ir a «Hostear partida»
              </Button>
            )}
            {role !== 'dm' && (
              <Button variant="ghost" onClick={() => goTo('/unirse')}>
                Ver partidas activas
              </Button>
            )}
            <Button variant="primary" icon={<DoorOpen />} onClick={goMenu} data-autofocus>
              Volver al menú
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-parchment-200">{notice?.reason.trim() || exitCopy?.fallback}</p>
        {notice && notice.kind !== 'kicked' && role !== 'dm' && (
          <p className="mt-2 text-xs text-parchment-400">Tu héroe conserva su progreso: inventario, oro y experiencia quedan guardados.</p>
        )}
      </Modal>
    </div>
  );
}
