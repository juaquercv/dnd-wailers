import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Ban, CircleDot, Hourglass, Pause, Play, Sparkles } from 'lucide-react';
import type { MagicMode, SessionPlayer, SessionStatus, SessionSummary, VisibilitySettings } from '@wailers/shared';
import { api } from '../../api/http';
import { getSocket } from '../../api/socket';
import { Badge, withAlpha, type BadgeTone } from '../../components/ui/Badge';
import { useSessionStore } from '../../stores/session';
import { useUsers } from '../../stores/users';

/** Shared bits for the session pages (host / join), the lobby and the chat. */

export interface SessionStatusInfo {
  label: string;
  /** Short label for the join list ("Sala de espera" / "En juego"). */
  short: string;
  tone: BadgeTone;
  icon: ReactNode;
  /** Pulsing dot (live sessions). */
  live: boolean;
}

export const SESSION_STATUS_INFO: Record<SessionStatus, SessionStatusInfo> = {
  lobby: { label: 'En la sala de espera', short: 'Sala de espera', tone: 'sky', icon: <Hourglass />, live: true },
  playing: { label: 'En juego', short: 'En juego', tone: 'emerald', icon: <Play />, live: true },
  paused: { label: 'En pausa', short: 'En pausa', tone: 'gold', icon: <Pause />, live: false },
  ended: { label: 'Terminada', short: 'Terminada', tone: 'neutral', icon: <Ban />, live: false },
};

export interface SessionStatusBadgeProps {
  status: SessionStatus;
  /** Use the short label ("Sala de espera"). */
  short?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/** Colored status pill; live statuses get a pulsing dot. */
export function SessionStatusBadge({ status, short = false, size = 'sm', className }: SessionStatusBadgeProps) {
  const info = SESSION_STATUS_INFO[status];
  return (
    <Badge
      tone={info.tone}
      size={size}
      className={clsx('uppercase tracking-wider', className)}
      icon={
        info.live ? (
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
        ) : (
          info.icon
        )
      }
    >
      {short ? info.short : info.label}
    </Badge>
  );
}

/** Generic wording: the campaign's own resource name is only known once its rules are loaded. */
export const MAGIC_MODE_INFO: Record<MagicMode, { label: string; tone: BadgeTone; icon: ReactNode }> = {
  mana: { label: 'Puntos de recurso', tone: 'arcane', icon: <Sparkles /> },
  slots: { label: 'Espacios de conjuro', tone: 'arcane', icon: <CircleDot /> },
  uses: { label: 'Usos limitados', tone: 'sky', icon: <CircleDot /> },
  none: { label: 'Sin magia', tone: 'neutral', icon: <Ban /> },
};

/** Label for the magic mode; with mana rules the campaign's resource name is used when known. */
export function magicModeLabel(mode: MagicMode, manaName?: string | null): string {
  if (mode === 'mana' && manaName && manaName.trim()) return `Recurso: ${manaName.trim()}`;
  return MAGIC_MODE_INFO[mode].label;
}

export const ENEMY_HP_LABELS: Record<VisibilitySettings['enemyHp'], string> = {
  exact: 'PV exactos',
  bar: 'Barra aproximada',
  hidden: 'Ocultos',
};

export const FALLBACK_COLOR = '#d4a63f';

/**
 * Public summary of a session (host presence, campaign name) kept fresh with `sessions:list` pushes.
 * Null until found among the active sessions.
 */
export function useLiveSessionSummary(sessionId: string | null): SessionSummary | null {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  useEffect(() => {
    setSummary(null);
    if (!sessionId) return;
    let cancelled = false;
    const pick = (list: SessionSummary[]) => {
      if (cancelled) return;
      const found = list.find((s) => s.id === sessionId);
      if (found) setSummary(found);
    };
    api.sessions
      .listActive()
      .then(pick)
      .catch(() => undefined);
    const socket = getSocket();
    socket.on('sessions:list', pick);
    return () => {
      cancelled = true;
      socket.off('sessions:list', pick);
    };
  }, [sessionId]);
  return summary;
}

/**
 * The local user is closing the session on purpose (DM pause/end): SessionPage skips the
 * "session ended" modal for a few seconds because the initiator navigates by itself.
 */
let selfExitUntil = 0;
export function markSelfExit(ms = 6000): void {
  selfExitUntil = Date.now() + ms;
}
export function isSelfExit(): boolean {
  return Date.now() < selfExitUntil;
}

export interface UserLook {
  name: string;
  color: string;
}

/** Primitive signature of the session players (selectors return it so components only re-render on real changes). */
function playersSignature(players: Record<string, SessionPlayer> | undefined, hostUserId: string | undefined): string {
  if (!players) return '';
  const parts = Object.values(players).map((p) => [p.userId, p.name, p.color, p.heroId ?? '', p.ready ? 1 : 0, p.connected ? 1 : 0, p.joinedAt].join('|'));
  return `${hostUserId ?? ''}#${parts.sort().join(';')}`;
}

/** Session players (host excluded) in join order; stable across unrelated state broadcasts. */
export function useSessionPlayers(): SessionPlayer[] {
  const sig = useSessionStore((s) => playersSignature(s.view?.state.players, s.view?.state.hostUserId));
  return useMemo(() => {
    const state = useSessionStore.getState().view?.state;
    if (!state) return [];
    return Object.values(state.players)
      .filter((p) => p.userId !== state.hostUserId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.name.localeCompare(b.name, 'es'));
    // The signature captures every field used from the players record.
  }, [sig]);
}

export type UserLookup = (userId: string | null | undefined, fallbackName?: string | null) => UserLook;

/**
 * Resolves display name + color for any user id: session players first, then the global users list
 * (the DM is not a session player). Loads the users list on first use.
 */
export function useUserDirectory(): UserLookup {
  const { users } = useUsers();
  const players = useSessionPlayers();
  return useMemo(() => {
    const byId = new Map<string, UserLook>();
    for (const u of users) byId.set(u.id, { name: u.name, color: u.color });
    for (const p of players) byId.set(p.userId, { name: p.name, color: p.color || byId.get(p.userId)?.color || FALLBACK_COLOR });
    return (userId, fallbackName) => {
      const found = userId ? byId.get(userId) : undefined;
      if (found) return found;
      return { name: fallbackName || userId || 'Desconocido', color: FALLBACK_COLOR };
    };
  }, [users, players]);
}

export interface PortraitProps {
  name: string;
  imageUrl: string | null | undefined;
  /** Tint for the initials fallback. */
  color?: string | null;
  size?: number;
  /** Rounded square (cards) or circle. */
  shape?: 'square' | 'circle';
  className?: string;
  /** Gold glowing frame. */
  glow?: boolean;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/** Hero / entry portrait with an initials fallback when there is no (loadable) image. */
export function Portrait({ name, imageUrl, color, size = 56, shape = 'square', className, glow = false }: PortraitProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [imageUrl]);
  const tint = color || FALLBACK_COLOR;
  const showImage = !!imageUrl && !broken;
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden border',
        shape === 'circle' ? 'rounded-full' : 'rounded-xl',
        glow ? 'border-gold-400/80 shadow-glow-gold' : 'border-ink-500/80',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: showImage
          ? '#1c1915'
          : `radial-gradient(circle at 30% 25%, ${withAlpha(tint, 0.9)}, ${withAlpha(tint, 0.45)} 60%, ${withAlpha(tint, 0.2)} 100%)`,
      }}
      role="img"
      aria-label={name}
      title={name}
    >
      {showImage ? (
        <img src={imageUrl ?? undefined} alt="" draggable={false} className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span
          className="font-display font-bold leading-none text-ink-950 [text-shadow:0_1px_0_rgba(255,255,255,0.35)]"
          style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
        >
          {initialsOf(name)}
        </span>
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_12px_rgba(0,0,0,0.55)]" />
    </span>
  );
}

/** Small uppercase section title with a gold rule. */
export function SectionTitle({ icon, children, aside, className }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      {icon && <span className="text-gold-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-gold-300">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-gold-700/60 to-transparent" />
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}
