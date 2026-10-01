import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, LayoutGrid, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useSessionStore } from '../../stores/session';
import { useConfirm } from '../ui/ConfirmDialog';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Logo } from './Logo';

export interface AppShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Page actions shown in the top bar. */
  actions?: ReactNode;
  children: ReactNode;
  /** Path for the back arrow (hidden when omitted). */
  back?: string;
  /** Extra classes for the content area (defaults to a scrollable area). */
  contentClassName?: string;
  /** Content handles its own scrolling / full-bleed layout (editor, game). */
  fullBleed?: boolean;
}

/** Page frame: top bar with logo, title, actions and the current user; full-height content below. */
export function AppShell({ title, subtitle, actions, children, back, contentClassName, fullBleed = false }: AppShellProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [leaving, setLeaving] = useState(false);
  const inSession = useSessionStore((s) => s.sessionId !== null);
  const confirm = useConfirm();
  const onMenu = location.pathname === '/menu';

  const onLogout = async () => {
    if (inSession) {
      const ok = await confirm({
        title: 'Cerrar sesión',
        message: 'Saldrás de la partida en curso y tu usuario quedará libre para otra persona.',
        confirmLabel: 'Cerrar sesión',
        danger: true,
      });
      if (!ok) return;
    }
    setLeaving(true);
    try {
      await logout();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-ink-600/80 bg-ink-900/90 px-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.9)] backdrop-blur sm:px-4">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
        />
        {back && (
          <IconButton icon={<ArrowLeft />} title="Volver" size="sm" onClick={() => navigate(back)} className="-ml-1" />
        )}
        <Link to="/menu" className="shrink-0 rounded-md" title="Ir al menú principal">
          <Logo size="sm" iconOnly className="sm:hidden" />
          <Logo size="sm" className="hidden sm:inline-flex" />
        </Link>
        <span className="divider-vertical hidden sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-semibold leading-5 tracking-wide text-parchment-50">{title}</h1>
          {subtitle && <p className="truncate text-xs leading-4 text-parchment-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        {user && (
          <div className="flex shrink-0 items-center gap-1.5 border-l border-ink-600/80 pl-3">
            <div className="hidden items-center gap-2 pr-1 md:flex" title={`Jugando como ${user.name}`}>
              <Avatar name={user.name} color={user.color} size="sm" status="online" />
              <span className="max-w-[8rem] truncate text-sm font-medium text-parchment-100">{user.name}</span>
            </div>
            <Avatar name={user.name} color={user.color} size="sm" className="md:hidden" />
            {!onMenu && (
              <Button variant="ghost" size="sm" icon={<LayoutGrid />} onClick={() => navigate('/menu')} title="Menú principal">
                <span className="hidden lg:inline">Menú</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut />}
              loading={leaving}
              title="Cerrar sesión y liberar tu usuario"
              onClick={() => void onLogout()}
              className="hover:text-blood-300"
            >
              <span className="hidden lg:inline">Cerrar sesión</span>
            </Button>
          </div>
        )}
      </header>
      <main
        className={clsx(
          'relative min-h-0 flex-1',
          fullBleed ? 'overflow-hidden' : 'scroll-thin overflow-y-auto',
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
