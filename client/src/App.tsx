import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Compass, RefreshCw } from 'lucide-react';
import { ContextMenuProvider } from './components/ui/ContextMenu';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { Toaster } from './components/ui/toast';
import { Button } from './components/ui/Button';
import { EmptyState } from './components/ui/EmptyState';
import { FullScreenLoader } from './components/layout/FullScreenLoader';
import { RequireAuth } from './components/layout/RequireAuth';
import { bindAuthNavigator, useAuthStore } from './stores/auth';
import LoginPage from './features/auth/LoginPage';
import MainMenu from './features/menu/MainMenu';
import HostPage from './features/sessions/HostPage';
import JoinPage from './features/sessions/JoinPage';
import CampaignListPage from './features/campaigns/CampaignListPage';

// Heavy pages are split into their own chunks.
const EditorPage = lazy(() => import('./features/editor/EditorPage'));
const LibraryPage = lazy(() => import('./features/library/LibraryPage'));
const SessionPage = lazy(() => import('./features/sessions/SessionPage'));

/** Lets stores (auth) navigate without hooks. */
function NavigatorBinder() {
  const navigate = useNavigate();
  useEffect(() => {
    bindAuthNavigator((to, opts) => navigate(to, opts));
    return () => bindAuthNavigator(null);
  }, [navigate]);
  return null;
}

/** Restores the claimed user once, showing a themed loader meanwhile. */
function BootGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    void useAuthStore.getState().restore();
  }, []);
  if (status === 'idle' || status === 'restoring') return <FullScreenLoader label="Despertando la mesa…" />;
  return <>{children}</>;
}

interface BoundaryState {
  error: Error | null;
}

/** Last-resort error screen (also catches failed lazy chunk loads). */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="panel max-w-lg">
          <EmptyState
            icon={<RefreshCw />}
            title="Algo salió mal"
            description={
              <>
                Se produjo un error inesperado en la interfaz.
                <span className="mt-2 block font-mono text-[11px] text-parchment-400">{this.state.error.message}</span>
              </>
            }
            action={
              <>
                <Button variant="primary" icon={<RefreshCw />} onClick={() => window.location.reload()}>
                  Recargar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    this.setState({ error: null });
                    window.location.assign('/menu');
                  }}
                >
                  Ir al menú
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }
}

function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="panel max-w-md">
        <EmptyState
          icon={<Compass />}
          title="Te has perdido en la niebla"
          description="Esta página no existe. Vuelve al menú para seguir la aventura."
          action={
            <Link to="/menu" className="btn btn-primary">
              Volver al menú
            </Link>
          }
        />
      </div>
    </div>
  );
}

function PageLoader() {
  return <FullScreenLoader label="Preparando…" />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavigatorBinder />
      <ContextMenuProvider>
        <ConfirmProvider>
          <ErrorBoundary>
            <BootGate>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<LoginPage />} />
                  <Route element={<RequireAuth />}>
                    <Route path="/menu" element={<MainMenu />} />
                    <Route path="/hostear" element={<HostPage />} />
                    <Route path="/unirse" element={<JoinPage />} />
                    <Route path="/sesion/:sessionId" element={<SessionPage />} />
                    <Route path="/campanas" element={<CampaignListPage />} />
                    <Route path="/campanas/:campaignId/editor" element={<EditorPage />} />
                    <Route path="/biblioteca" element={<LibraryPage />} />
                    <Route path="/biblioteca/:kind" element={<LibraryPage />} />
                  </Route>
                  <Route path="/login" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BootGate>
          </ErrorBoundary>
          <Toaster />
        </ConfirmProvider>
      </ContextMenuProvider>
    </BrowserRouter>
  );
}
