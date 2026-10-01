import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { FullScreenLoader } from './FullScreenLoader';

/**
 * Route guard: renders children (or the nested <Outlet/>) only with a claimed user.
 * While the claim is being restored a loader is shown; anonymous visitors go to the login screen.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (status === 'idle' || status === 'restoring') return <FullScreenLoader label="Recuperando tu aventurero…" />;
  if (status !== 'ready' || !user) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <>{children ?? <Outlet />}</>;
}
