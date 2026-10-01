import { useMemo, type CSSProperties } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Lock, RefreshCw, WifiOff } from 'lucide-react';
import { DEFAULT_USER_RELEASE_SECONDS, type UserStatusDTO } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Kbd } from '../../components/ui/Kbd';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/toast';
import { D20Icon } from '../../components/layout/Logo';
import { ApiRequestError } from '../../api/http';
import { useHotkeys } from '../../lib/hotkeys';
import { useAuthStore } from '../../stores/auth';
import { useUsers } from '../../stores/users';

/** Deterministic pseudo-random in [0, 1) so the embers do not jump between renders. */
function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function Embers({ count = 34 }: { count?: number }) {
  const embers = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const size = 2 + rand(i + 1) * 4;
        return {
          left: `${rand(i + 11) * 100}%`,
          size,
          delay: `${-rand(i + 23) * 12}s`,
          duration: `${7 + rand(i + 37) * 9}s`,
          drift: `${(rand(i + 51) - 0.5) * 160}px`,
          hue: rand(i + 67) > 0.7 ? '#ffb347' : '#f3d58a',
        };
      }),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {embers.map((e, i) => (
        <span
          key={i}
          className="absolute -bottom-3 animate-ember rounded-full"
          style={
            {
              left: e.left,
              width: e.size,
              height: e.size,
              background: e.hue,
              boxShadow: `0 0 ${e.size * 3}px ${e.size}px ${e.hue}66`,
              animationDelay: e.delay,
              animationDuration: e.duration,
              '--ember-drift': e.drift,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

interface UserCardProps {
  user: UserStatusDTO;
  index: number;
  claiming: boolean;
  disabled: boolean;
  onPick: (user: UserStatusDTO) => void;
}

function UserCard({ user, index, claiming, disabled, onPick }: UserCardProps) {
  const inUse = user.status === 'in_use';
  return (
    <button
      type="button"
      disabled={inUse || disabled}
      onClick={() => onPick(user)}
      aria-label={inUse ? `${user.name} (en uso)` : `Jugar como ${user.name}`}
      className={clsx(
        'group relative flex animate-slide-up flex-col items-center gap-3 overflow-hidden rounded-2xl border px-4 pb-5 pt-6 text-center transition duration-300',
        inUse
          ? 'cursor-not-allowed border-ink-600/60 bg-ink-900/50 grayscale'
          : 'border-ink-500/80 bg-ink-900/80 hover:-translate-y-1.5 hover:border-gold-500/70 hover:bg-ink-800/90 hover:shadow-glow-gold focus-visible:-translate-y-1.5',
        disabled && !inUse && !claiming && 'opacity-60',
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {!inUse && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
          style={{ background: `radial-gradient(circle at 50% 30%, ${user.color}33, transparent 65%)` }}
        />
      )}
      <span className="absolute left-2.5 top-2.5 hidden sm:block">
        <Kbd>{index + 1}</Kbd>
      </span>
      <div className={clsx('relative transition duration-300', !inUse && 'group-hover:scale-105')}>
        <Avatar name={user.name} color={user.color} size="2xl" ring={!inUse} />
        {inUse && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink-950/60">
            <Lock className="h-8 w-8 text-parchment-300" />
          </span>
        )}
        {claiming && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink-950/50">
            <Spinner size="lg" label={`Reclamando a ${user.name}…`} />
          </span>
        )}
      </div>
      <div className="relative">
        <div
          className={clsx(
            'font-display text-xl font-bold tracking-wide transition',
            inUse ? 'text-parchment-400' : 'text-parchment-50 group-hover:text-gold-200',
          )}
        >
          {user.name}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium">
          {inUse ? (
            <>
              <Lock className="h-3 w-3 text-parchment-400" />
              <span className="uppercase tracking-wider text-parchment-400">En uso</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="uppercase tracking-wider text-emerald-300/90">Disponible</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/** Title screen: choose one of the five adventurers (no passwords). */
export default function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const claimingUserId = useAuthStore((s) => s.claimingUserId);
  const claim = useAuthStore((s) => s.claim);
  const { users, loading, loaded, error, load } = useUsers();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const pick = async (user: UserStatusDTO) => {
    if (user.status === 'in_use' || claimingUserId) return;
    try {
      await claim(user.id);
      toast.success(`¡Bienvenido, ${user.name}!`);
      navigate(from && from !== '/' ? from : '/menu', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) toast.error(`${user.name} ya está en uso por otra persona`);
      else toast.fromError(err, 'No se pudo elegir ese aventurero');
    }
  };

  useHotkeys(
    Object.fromEntries(
      users.slice(0, 9).map((u, i) => [
        String(i + 1),
        () => {
          void pick(u);
        },
      ]),
    ),
    { enabled: status === 'anonymous' },
  );

  if (status === 'ready') return <Navigate to={from && from !== '/' ? from : '/menu'} replace />;

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 22%, rgba(212,166,63,0.16), transparent 70%), radial-gradient(ellipse 90% 60% at 50% 110%, rgba(196,61,51,0.12), transparent 70%)',
        }}
      />
      <Embers />
      <div className="relative z-10 mx-auto flex min-h-full max-w-6xl flex-col items-center justify-center px-5 py-12">
        <div className="flex animate-fade-in flex-col items-center text-center">
          <D20Icon size={84} className="animate-float drop-shadow-[0_0_24px_rgba(233,192,99,0.55)]" />
          <h1 className="title-epic mt-5 animate-glow-pulse text-5xl leading-tight sm:text-7xl">D&amp;D Wailers</h1>
          <div className="divider mx-auto mt-4 w-72 max-w-full" />
          <p className="mt-1 font-display text-sm uppercase tracking-[0.35em] text-parchment-200 sm:text-base">
            Elige tu aventurero
          </p>
        </div>

        <div className="mt-10 w-full">
          {error && !loaded ? (
            <div className="panel mx-auto max-w-md">
              <EmptyState
                icon={<WifiOff />}
                title="No se pudo conectar con el servidor"
                description={error}
                action={
                  <Button variant="primary" icon={<RefreshCw />} loading={loading} onClick={() => void load()}>
                    Reintentar
                  </Button>
                }
              />
            </div>
          ) : !loaded ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-56 rounded-2xl" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="No hay aventureros disponibles" description="El servidor no devolvió ningún usuario." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {users.map((u, i) => (
                <UserCard
                  key={u.id}
                  user={u}
                  index={i}
                  claiming={claimingUserId === u.id}
                  disabled={!!claimingUserId}
                  onPick={(user) => void pick(user)}
                />
              ))}
            </div>
          )}
        </div>

        <p className="mt-10 max-w-lg text-center text-xs leading-relaxed text-parchment-400">
          Sin contraseñas: cada pestaña juega como un aventurero. Un usuario queda libre al cerrar sesión o{' '}
          {DEFAULT_USER_RELEASE_SECONDS} segundos después de desconectarse.
        </p>
      </div>
    </div>
  );
}
