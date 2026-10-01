import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, BookOpen, Crown, Map as MapIcon, Swords, Users, X } from 'lucide-react';
import type { SessionSummary } from '@wailers/shared';
import { api } from '../../api/http';
import { AppShell } from '../../components/layout/AppShell';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Kbd } from '../../components/ui/Kbd';
import { useHotkeys } from '../../lib/hotkeys';
import { formatRelative } from '../../lib/format';
import { useAuthStore } from '../../stores/auth';
import { clearLastSessionId, getLastSessionId } from '../../stores/session';

interface MenuCard {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
  bigIcon: ReactNode;
  /** Gradient art colors. */
  from: string;
  via: string;
  accent: string;
  glow: string;
}

const CARDS: MenuCard[] = [
  {
    to: '/hostear',
    title: 'Hostear partida (DM)',
    description: 'Crea o reanuda una partida de tus campañas y dirige la mesa como Dungeon Master.',
    icon: <Crown />,
    bigIcon: <Crown />,
    from: 'rgba(212,166,63,0.38)',
    via: 'rgba(125,93,29,0.18)',
    accent: 'text-gold-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(233,192,99,0.5),0_18px_50px_-12px_rgba(233,192,99,0.45)]',
  },
  {
    to: '/unirse',
    title: 'Unirse a partida',
    description: 'Entra en una partida activa con tu héroe y juega junto al resto del grupo.',
    icon: <Swords />,
    bigIcon: <Swords />,
    from: 'rgba(196,61,51,0.4)',
    via: 'rgba(110,31,25,0.2)',
    accent: 'text-blood-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(224,98,90,0.5),0_18px_50px_-12px_rgba(224,98,90,0.45)]',
  },
  {
    to: '/campanas',
    title: 'Crear / Editar campaña',
    description: 'Diseña zonas y mapas como diapositivas, reglas, ruletas y la visibilidad de los jugadores.',
    icon: <MapIcon />,
    bigIcon: <MapIcon />,
    from: 'rgba(138,99,240,0.4)',
    via: 'rgba(74,47,143,0.2)',
    accent: 'text-arcane-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(169,139,255,0.5),0_18px_50px_-12px_rgba(169,139,255,0.45)]',
  },
  {
    to: '/biblioteca',
    title: 'Biblioteca compartida',
    description: 'Enemigos, NPCs, objetos, hechizos, zonas, sonidos y héroes para todas las campañas.',
    icon: <BookOpen />,
    bigIcon: <BookOpen />,
    from: 'rgba(16,185,129,0.32)',
    via: 'rgba(6,78,59,0.2)',
    accent: 'text-emerald-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(52,211,153,0.45),0_18px_50px_-12px_rgba(52,211,153,0.4)]',
  },
];

function MenuCardLink({ card, index }: { card: MenuCard; index: number }) {
  return (
    <Link
      to={card.to}
      className={clsx(
        'group relative flex min-h-[13rem] animate-slide-up flex-col justify-end overflow-hidden rounded-2xl border border-ink-500/80 bg-ink-900 p-6 transition duration-300',
        'hover:-translate-y-1 hover:border-transparent focus-visible:-translate-y-1',
        card.glow,
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Gradient "art" */}
      <span
        aria-hidden
        className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          opacity: 0.85,
          background: `radial-gradient(ellipse 80% 90% at 85% 10%, ${card.from}, transparent 60%), radial-gradient(ellipse 70% 70% at 10% 100%, ${card.via}, transparent 70%), linear-gradient(160deg, rgba(28,25,21,0.2), rgba(11,10,8,0.85))`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(45deg,#f3ead6_0_1px,transparent_1px_14px)]"
      />
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none absolute -right-8 -top-10 opacity-[0.11] transition duration-500 group-hover:rotate-6 group-hover:scale-110 group-hover:opacity-20 [&>svg]:h-44 [&>svg]:w-44',
          card.accent,
        )}
      >
        {card.bigIcon}
      </span>
      <span className="absolute right-4 top-4 hidden sm:block">
        <Kbd>{index + 1}</Kbd>
      </span>
      <div className="relative">
        <span
          className={clsx(
            'mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-ink-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur [&>svg]:h-7 [&>svg]:w-7',
            card.accent,
          )}
        >
          {card.icon}
        </span>
        <h2 className="font-display text-2xl font-bold tracking-wide text-parchment-50 [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">
          {card.title}
        </h2>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-parchment-200/90">{card.description}</p>
        <span
          className={clsx(
            'mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition-all duration-300 group-hover:gap-3',
            card.accent,
          )}
        >
          Entrar <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

/** Main menu after choosing a user. */
export default function MainMenu() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [lastSession, setLastSession] = useState<SessionSummary | null>(null);

  useEffect(() => {
    setLastSession(null);
    const id = getLastSessionId(userId);
    if (!userId || !id) return;
    let cancelled = false;
    api.sessions
      .listActive()
      .then((list) => {
        if (cancelled) return;
        const found = list.find((s) => s.id === id) ?? null;
        // Only a table this user hosts or plays at.
        const mine = found !== null && (found.hostUserId === userId || found.players.some((p) => p.userId === userId));
        if (found && mine) setLastSession(found);
        else clearLastSessionId(userId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useHotkeys({
    '1': () => navigate(CARDS[0]!.to),
    '2': () => navigate(CARDS[1]!.to),
    '3': () => navigate(CARDS[2]!.to),
    '4': () => navigate(CARDS[3]!.to),
  });

  const isHost = lastSession && user ? lastSession.hostUserId === user.id : false;

  return (
    <AppShell title="Menú principal" subtitle={user ? `Bienvenido, ${user.name}. ¿Qué aventura os espera hoy?` : undefined}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        {lastSession && (
          <div className="relative flex animate-slide-up flex-col gap-3 overflow-hidden rounded-2xl border border-gold-600/60 bg-gradient-to-r from-gold-700/30 via-ink-900/90 to-ink-900/90 p-4 shadow-glow-gold sm:flex-row sm:items-center sm:p-5">
            <span aria-hidden className="absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 animate-glow-pulse rounded-full bg-gold-400/20 blur-3xl" />
            <div className="relative flex min-w-0 flex-1 items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold-500/50 bg-ink-950/60 text-gold-300">
                {isHost ? <Crown className="h-6 w-6" /> : <Swords className="h-6 w-6" />}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">Partida en curso</div>
                <div className="truncate font-display text-lg font-semibold text-parchment-50">{lastSession.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-parchment-300">
                  <span className="truncate">{lastSession.campaignName}</span>
                  <Badge tone={lastSession.status === 'playing' ? 'emerald' : 'sky'} size="xs" dot>
                    {lastSession.status === 'playing' ? 'Jugando' : 'En el lobby'}
                  </Badge>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {lastSession.players.length}
                  </span>
                  <span>· {formatRelative(lastSession.updatedAt)}</span>
                </div>
              </div>
            </div>
            <div className="relative flex shrink-0 items-center gap-2">
              <Button variant="primary" epic iconRight={<ArrowRight />} onClick={() => navigate(`/sesion/${lastSession.id}`)}>
                Volver a la partida «{lastSession.name}»
              </Button>
              <button
                type="button"
                className="rounded-md p-1.5 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100"
                title="Descartar"
                aria-label="Descartar aviso de partida"
                onClick={() => {
                  if (userId) clearLastSessionId(userId);
                  setLastSession(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {CARDS.map((card, i) => (
            <MenuCardLink key={card.to} card={card} index={i} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
