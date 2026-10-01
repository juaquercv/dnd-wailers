import clsx from 'clsx';
import { Check, Hourglass, Sparkles, UserX } from 'lucide-react';
import type { RuleSystem, SessionPlayer } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, withAlpha } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useCategories } from '../../stores/categories';
import { useSessionStore } from '../../stores/session';
import { HeroCard, heroRuleWarnings } from './HeroCard';

export interface PlayerCardProps {
  player: SessionPlayer;
  isMe: boolean;
  /** The viewer is the DM (shows "Expulsar" and rule notes). */
  viewerIsDm: boolean;
  rules: RuleSystem | null;
  onKick?: () => void;
  kicking?: boolean;
  /** Stagger index for the entrance animation. */
  index?: number;
}

/** Lobby seat: player identity + presence, chosen hero and ready state. */
export function PlayerCard({ player, isMe, viewerIsDm, rules, onKick, kicking = false, index = 0 }: PlayerCardProps) {
  const hero = useSessionStore((s) => (player.heroId ? s.view?.state.heroes[player.heroId] ?? null : null));
  const { byId } = useCategories('hero');
  const ready = player.ready && !!player.heroId;
  const warnings = hero && (viewerIsDm || isMe) ? heroRuleWarnings(hero, rules, byId) : [];

  return (
    <article
      className={clsx(
        'relative flex animate-slide-up flex-col gap-3 overflow-hidden rounded-xl border bg-ink-900/85 p-3.5 transition duration-300',
        ready
          ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.22),0_10px_30px_-14px_rgba(16,185,129,0.6)]'
          : isMe
            ? 'border-gold-600/60'
            : 'border-ink-600/80',
        !player.connected && 'opacity-75',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
      aria-label={`${player.name}${ready ? ', listo' : ''}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-60"
        style={{ background: `radial-gradient(ellipse 70% 100% at 15% 0%, ${withAlpha(player.color, 0.2)}, transparent 70%)` }}
      />
      <header className="relative flex items-center gap-2.5">
        <Avatar name={player.name} color={player.color} size="md" status={player.connected ? 'online' : 'offline'} ring={ready} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold text-parchment-50" style={{ color: player.color }}>
              {player.name}
            </span>
            {isMe && <span className="shrink-0 text-[11px] text-parchment-400">(tú)</span>}
          </div>
          <div className={clsx('text-[11px]', player.connected ? 'text-emerald-300/90' : 'text-parchment-400')}>
            {player.connected ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
        {ready ? (
          <Badge tone="emerald" size="sm" icon={<Check />} className="animate-pop">
            Listo
          </Badge>
        ) : (
          <Badge tone="outline" size="sm" icon={<Hourglass />}>
            {player.heroId ? 'Preparándose' : 'Eligiendo'}
          </Badge>
        )}
      </header>

      <div className="relative min-h-[3.5rem]">
        {hero ? (
          <HeroCard hero={hero} variant="compact" color={player.color} selected={ready} warnings={warnings} />
        ) : player.heroId ? (
          <div className="flex h-14 items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-3 text-sm text-parchment-300">
            <Sparkles className="h-4 w-4 text-gold-400" aria-hidden />
            Héroe elegido
          </div>
        ) : (
          <div className="flex h-14 items-center gap-2 rounded-lg border border-dashed border-ink-500 bg-ink-950/30 px-3 text-sm italic text-parchment-400">
            <Sparkles className="h-4 w-4 animate-pulse text-gold-500/70" aria-hidden />
            Eligiendo héroe…
          </div>
        )}
      </div>

      {viewerIsDm && onKick && (
        <footer className="relative -mb-1 flex justify-end border-t border-ink-700/80 pt-2">
          <Button variant="ghost" size="sm" icon={<UserX />} loading={kicking} onClick={onKick} className="text-blood-300 hover:bg-blood-600/20 hover:text-blood-200">
            Expulsar
          </Button>
        </footer>
      )}
    </article>
  );
}
