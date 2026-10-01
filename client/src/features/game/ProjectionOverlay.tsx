import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, Presentation, X } from 'lucide-react';
import type { Projection } from '@wailers/shared';
import { Button } from '../../components/ui/Button';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { useSessionStore } from '../../stores/session';
import { uiSounds } from '../audio/uiSounds';
import { send } from './map/actions';
import { ProjectionCard } from './map/ProjectionCard';
import { projectionTargetsLabel } from './map/projection';

/**
 * What the DM is showing ("Mostrar a jugadores"), inside the game viewport.
 * Targeted players get a big card they can minimize (it comes back when the projection changes);
 * the DM gets a pill with a preview and "Cerrar proyección".
 */
export function ProjectionOverlay() {
  const role = useSessionStore((s) => s.view?.role ?? null);
  const projection = useSessionStore((s) => s.view?.state.projection ?? null);
  if (!role || !projection) return null;
  return role === 'dm' ? <DmProjection projection={projection} /> : <PlayerProjection projection={projection} />;
}

function useEscape(active: boolean, onEscape: () => void): void {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isAnyModalOpen()) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/65 p-3 backdrop-blur-[3px] sm:p-6">
      {children}
    </div>
  );
}

const MINIMIZED_KEY = 'wailers.projection.minimized';

function readMinimized(): string | null {
  try {
    return sessionStorage.getItem(MINIMIZED_KEY);
  } catch {
    return null;
  }
}

function writeMinimized(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(MINIMIZED_KEY, id);
    else sessionStorage.removeItem(MINIMIZED_KEY);
  } catch {
    /* storage unavailable */
  }
}

function PlayerProjection({ projection }: { projection: Projection }) {
  // Remembered per tab so a reload does not pop the card open again.
  const [minimizedId, setMinimizedState] = useState<string | null>(readMinimized);
  const lastIdRef = useRef<string | null>(readMinimized());
  const minimized = minimizedId === projection.id;
  const setMinimizedId = (id: string | null) => {
    setMinimizedState(id);
    writeMinimized(id);
  };

  useEffect(() => {
    if (lastIdRef.current === projection.id) return;
    lastIdRef.current = projection.id;
    uiSounds.reveal();
  }, [projection.id]);

  useEscape(!minimized, () => setMinimizedId(projection.id));

  if (minimized) {
    return (
      <div className="pointer-events-none absolute left-3 top-3 z-30 w-max min-w-[9rem] max-w-[min(24rem,calc(50%-7rem))]">
        <button
          type="button"
          onClick={() => setMinimizedId(null)}
          className="pointer-events-auto flex w-full animate-pop items-center gap-2 rounded-xl border border-gold-500/70 bg-ink-900/90 py-1.5 pl-2.5 pr-1.5 text-left text-xs text-parchment-100 shadow-glow-gold backdrop-blur transition hover:bg-ink-800"
          title="Volver a ver lo que muestra el DM"
          aria-label={`Ver lo que muestra el DM: ${projection.title || 'una imagen'}`}
        >
          <Presentation className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400/90">El DM muestra</span>
            <span className="block truncate font-semibold text-gold-100">«{projection.title || 'una imagen'}»</span>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-200" aria-hidden>
            <Eye className="h-4 w-4" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <Backdrop>
      <ProjectionCard key={projection.id} projection={projection} eyebrow="El DM os muestra" onMinimize={() => setMinimizedId(projection.id)} />
    </Backdrop>
  );
}

function DmProjection({ projection }: { projection: Projection }) {
  const state = useSessionStore((s) => s.view?.state ?? null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const previewing = previewId === projection.id;
  const targets = projectionTargetsLabel(projection, state);

  useEscape(previewing, () => setPreviewId(null));

  const close = async () => {
    setClosing(true);
    await send('show:close', {}, 'No se pudo cerrar la proyección');
    setClosing(false);
    setPreviewId(null);
  };

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-30 w-max min-w-[9rem] max-w-[min(24rem,calc(50%-7rem))]">
        <div className="pointer-events-auto flex max-w-full animate-slide-up items-center gap-2 rounded-xl border border-gold-600/60 bg-ink-900/90 py-1.5 pl-2.5 pr-1.5 text-xs text-parchment-100 shadow-panel backdrop-blur">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
          </span>
          <span className="min-w-0 flex-1 leading-tight" title={`Proyectando «${projection.title || 'una imagen'}» a ${targets}`}>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400/90">Proyectando a {targets}</span>
            <span className="block truncate font-semibold text-gold-100">«{projection.title || 'una imagen'}»</span>
          </span>
          <button
            type="button"
            onClick={() => setPreviewId(previewing ? null : projection.id)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-parchment-200 transition hover:bg-ink-700 hover:text-parchment-50"
            title="Vista previa: ver lo que están viendo"
            aria-label="Vista previa de la proyección"
          >
            <Eye className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void close()}
            disabled={closing}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blood-600/25 text-blood-300 transition hover:bg-blood-600/40 hover:text-blood-200 disabled:opacity-50"
            title="Cerrar proyección"
            aria-label="Cerrar proyección"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {previewing && (
        <Backdrop>
          <ProjectionCard
            key={projection.id}
            projection={projection}
            eyebrow={`Vista previa · lo ven ${targets}`}
            onClose={() => setPreviewId(null)}
            actions={
              <Button variant="danger" size="sm" icon={<X />} loading={closing} onClick={() => void close()}>
                Cerrar proyección
              </Button>
            }
          />
        </Backdrop>
      )}
    </>
  );
}
