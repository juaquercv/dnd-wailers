import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Crown, History, RefreshCw, Swords, TriangleAlert, Users } from 'lucide-react';
import type { SessionSummary } from '@wailers/shared';
import { api } from '../../api/http';
import { getSocket } from '../../api/socket';
import { AppShell } from '../../components/layout/AppShell';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Kbd } from '../../components/ui/Kbd';
import { formatRelative } from '../../lib/format';
import { useHotkeys } from '../../lib/hotkeys';
import { useAuthStore } from '../../stores/auth';
import { SessionStatusBadge, useUserDirectory, type UserLookup } from '../lobby/lobbyUi';

const MAX_PLAYERS_SHOWN = 5;

function SessionCard({ session, meUserId, lookup, index }: { session: SessionSummary; meUserId: string; lookup: UserLookup; index: number }) {
  const navigate = useNavigate();
  const isHost = session.hostUserId === meUserId;
  const amPlayer = session.players.some((p) => p.userId === meUserId);
  const host = lookup(session.hostUserId, session.hostName);
  const playing = session.status === 'playing';
  const label = isHost ? 'Entrar como DM' : amPlayer ? 'Volver a la partida' : 'Unirse';
  const go = () => navigate(`/sesion/${session.id}`);
  const shown = session.players.slice(0, MAX_PLAYERS_SHOWN);

  return (
    <article
      className={clsx(
        'group relative flex animate-slide-up flex-col overflow-hidden rounded-2xl border bg-ink-900 transition duration-300 hover:-translate-y-1',
        isHost || amPlayer
          ? 'border-gold-600/60 hover:shadow-glow-gold'
          : playing
            ? 'border-ink-500/80 hover:border-emerald-500/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.4),0_18px_50px_-14px_rgba(16,185,129,0.45)]'
            : 'border-ink-500/80 hover:border-sky-500/60 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.4),0_18px_50px_-14px_rgba(56,189,248,0.4)]',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-80 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: playing
            ? 'radial-gradient(ellipse 80% 100% at 85% 0%, rgba(16,185,129,0.22), transparent 70%), radial-gradient(ellipse 60% 80% at 0% 0%, rgba(196,61,51,0.16), transparent 70%)'
            : 'radial-gradient(ellipse 80% 100% at 85% 0%, rgba(56,189,248,0.2), transparent 70%), radial-gradient(ellipse 60% 80% at 0% 0%, rgba(138,99,240,0.16), transparent 70%)',
        }}
      />
      <div className="relative flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400" title={session.campaignName}>
              {session.campaignName}
            </div>
            <h3 className="mt-0.5 line-clamp-2 break-words font-display text-xl font-semibold leading-snug text-parchment-50" title={session.name}>
              {session.name}
            </h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SessionStatusBadge status={session.status} short />
            {session.hasStarted && session.status === 'lobby' && (
              <Badge tone="outline" size="xs" icon={<History />}>
                Partida guardada
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-ink-600/80 bg-ink-950/50 px-3 py-2">
          <Avatar name={host.name} color={host.color} size="md" status={session.hostConnected ? 'online' : 'offline'} ring={session.hostConnected} />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-400">
              <Crown className="h-3 w-3" aria-hidden />
              DM
            </div>
            <div className="truncate text-sm font-semibold text-parchment-50">
              {host.name}
              {isHost && <span className="ml-1 text-xs font-normal text-parchment-400">(tú)</span>}
            </div>
          </div>
          <span className={clsx('ml-auto shrink-0 text-xs font-medium', session.hostConnected ? 'text-emerald-300' : 'text-parchment-400')}>
            {session.hostConnected ? 'DM conectado' : 'DM desconectado'}
          </span>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-parchment-300">
            <Users className="h-3.5 w-3.5 text-gold-400" aria-hidden />
            {session.players.length === 0 ? 'Sin jugadores todavía' : `${session.players.length} ${session.players.length === 1 ? 'jugador' : 'jugadores'}`}
          </div>
          {shown.length > 0 && (
            <ul className="space-y-1.5">
              {shown.map((p) => {
                const look = lookup(p.userId, p.name);
                return (
                  <li key={p.userId} className="flex min-w-0 items-center gap-2 text-sm">
                    <Avatar name={p.name} color={look.color} size="xs" status={p.connected ? 'online' : 'offline'} />
                    <span className={clsx('truncate font-medium', p.userId === meUserId ? 'text-gold-200' : 'text-parchment-100')}>
                      {p.name}
                      {p.userId === meUserId && <span className="ml-1 text-xs font-normal text-parchment-400">(tú)</span>}
                    </span>
                    <span className="truncate text-xs text-parchment-400">{p.heroName ? `— ${p.heroName}` : '— sin héroe'}</span>
                  </li>
                );
              })}
              {session.players.length > MAX_PLAYERS_SHOWN && (
                <li className="pl-7 text-xs text-parchment-400">y {session.players.length - MAX_PLAYERS_SHOWN} más…</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <footer className="relative flex items-center gap-3 border-t border-ink-600/70 bg-ink-950/40 px-5 py-3">
        <span className="min-w-0 flex-1 truncate text-xs text-parchment-400" title={session.updatedAt}>
          {playing ? 'En juego' : 'Abierta'} · {formatRelative(session.updatedAt)}
        </span>
        <Button variant={isHost || amPlayer ? 'primary' : 'secondary'} epic iconRight={isHost ? <Crown /> : <ArrowRight />} onClick={go}>
          {label}
        </Button>
      </footer>
    </article>
  );
}

function sortSessions(list: SessionSummary[], meUserId: string): SessionSummary[] {
  const rank = (s: SessionSummary) => (s.hostUserId === meUserId || s.players.some((p) => p.userId === meUserId) ? 0 : 1);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.status === b.status ? 0 : a.status === 'lobby' ? -1 : 1) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Route /unirse — live list of active sessions to join as a player (or as DM for your own). */
export default function JoinPage() {
  const user = useAuthStore((s) => s.user);
  const meUserId = user?.id ?? '';
  const lookup = useUserDirectory();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(() => getSocket().connected);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await api.sessions.listActive();
      setSessions(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las partidas');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const socket = getSocket();
    const onList = (list: SessionSummary[]) => {
      setSessions(list);
      setError(null);
    };
    const onConnect = () => {
      setLive(true);
      void load();
    };
    const onDisconnect = () => setLive(false);
    socket.on('sessions:list', onList);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setLive(socket.connected);
    return () => {
      socket.off('sessions:list', onList);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [load]);

  useHotkeys({ r: () => void load() });

  const sorted = useMemo(() => (sessions ? sortSessions(sessions, meUserId) : null), [sessions, meUserId]);

  return (
    <AppShell
      title="Unirse a partida"
      subtitle="Elige una partida activa"
      back="/menu"
      actions={
        <Button variant="secondary" size="sm" icon={<RefreshCw className={clsx(refreshing && 'animate-spin')} />} onClick={() => void load()} title="Actualizar (R)">
          <span className="hidden sm:inline">Actualizar</span>
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <h2 className="title-epic text-3xl">Partidas activas</h2>
            <p className="mt-1 text-sm text-parchment-300">Únete a una mesa con tu héroe. La lista se actualiza sola.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-parchment-400">
            <span className="inline-flex items-center gap-1.5" title={live ? 'Recibiendo cambios en tiempo real' : 'Sin conexión en tiempo real'}>
              <span className={clsx('h-2 w-2 rounded-full', live ? 'animate-pulse bg-emerald-400' : 'bg-ink-400')} aria-hidden />
              {live ? 'En vivo' : 'Sin conexión'}
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Kbd>R</Kbd> actualizar
            </span>
          </div>
        </div>

        {error && !sorted ? (
          <div className="panel">
            <EmptyState
              icon={<TriangleAlert />}
              title="No se pudieron cargar las partidas"
              description={error}
              action={
                <Button variant="primary" icon={<RefreshCw />} loading={refreshing} onClick={() => void load()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : sorted === null ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-72 rounded-2xl" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<Swords />}
              title="No hay partidas activas."
              description="Pide a tu DM que cree una. Aparecerá aquí en cuanto abra la sala de espera."
              action={
                <>
                  <Button variant="primary" icon={<RefreshCw />} loading={refreshing} onClick={() => void load()}>
                    Actualizar
                  </Button>
                  <Link to="/hostear" className="btn btn-ghost">
                    <Crown className="h-4 w-4" aria-hidden />
                    Hostear una partida
                  </Link>
                </>
              }
            />
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((s, i) => (
              <SessionCard key={s.id} session={s} meUserId={meUserId} lookup={lookup} index={i} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
