import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { CircleAlert, CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';

export type ToastLevel = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** Auto-dismiss delay in ms (0 = sticky). Defaults: 4s, errors 6s. */
  duration?: number;
  /** Optional secondary line. */
  description?: string;
  /** Optional action button. */
  action?: { label: string; onClick: () => void };
  /** Custom icon (overrides the level icon). */
  icon?: ReactNode;
}

export interface ToastItem extends ToastOptions {
  id: number;
  level: ToastLevel;
  text: string;
  count: number;
  createdAt: number;
}

const MAX_TOASTS = 5;
let nextId = 1;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

function push(level: ToastLevel, text: string, opts: ToastOptions = {}): number {
  // Toasts with an action (e.g. "Deshacer") are never merged: each one acts on its own event.
  const existing = opts.action
    ? undefined
    : toasts.find((t) => !t.action && t.level === level && t.text === text && t.description === opts.description);
  if (existing) {
    // Same message again: bump the counter and restart its timer.
    toasts = toasts.map((t) => (t.id === existing.id ? { ...t, ...opts, count: t.count + 1, createdAt: Date.now() } : t));
    emit();
    return existing.id;
  }
  const item: ToastItem = { id: nextId++, level, text, count: 1, createdAt: Date.now(), ...opts };
  toasts = [...toasts, item].slice(-MAX_TOASTS);
  emit();
  return item.id;
}

function dismiss(id?: number): void {
  toasts = id === undefined ? [] : toasts.filter((t) => t.id !== id);
  emit();
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/** Global toast API (usable outside React). */
export const toast = {
  success: (text: string, opts?: ToastOptions) => push('success', text, opts),
  error: (text: string, opts?: ToastOptions) => push('error', text, opts),
  info: (text: string, opts?: ToastOptions) => push('info', text, opts),
  warning: (text: string, opts?: ToastOptions) => push('warning', text, opts),
  show: (level: ToastLevel, text: string, opts?: ToastOptions) => push(level, text, opts),
  /** Error toast from an unknown thrown value (uses its Spanish message when available). */
  fromError: (err: unknown, fallback = 'Algo salió mal', opts?: ToastOptions) => push('error', errorText(err, fallback), opts),
  dismiss,
};

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const LEVEL_STYLE: Record<ToastLevel, { icon: ReactNode; ring: string; iconColor: string; bar: string }> = {
  success: {
    icon: <CircleCheck className="h-5 w-5" aria-hidden />,
    ring: 'border-emerald-500/40',
    iconColor: 'text-emerald-400',
    bar: 'bg-emerald-400/70',
  },
  error: {
    icon: <CircleX className="h-5 w-5" aria-hidden />,
    ring: 'border-blood-500/50',
    iconColor: 'text-blood-400',
    bar: 'bg-blood-400/70',
  },
  info: {
    icon: <Info className="h-5 w-5" aria-hidden />,
    ring: 'border-sky-500/40',
    iconColor: 'text-sky-400',
    bar: 'bg-sky-400/70',
  },
  warning: {
    icon: <TriangleAlert className="h-5 w-5" aria-hidden />,
    ring: 'border-gold-500/50',
    iconColor: 'text-gold-400',
    bar: 'bg-gold-400/70',
  },
};

function defaultDuration(level: ToastLevel): number {
  return level === 'error' ? 6000 : level === 'warning' ? 5000 : 4000;
}

function ToastCard({ item }: { item: ToastItem }) {
  const duration = item.duration ?? defaultDuration(item.level);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(Date.now());
  const style = LEVEL_STYLE[item.level];

  // Restart the countdown when the same message is pushed again.
  useEffect(() => {
    remaining.current = duration;
    startedAt.current = Date.now();
  }, [item.createdAt, duration]);

  useEffect(() => {
    if (duration <= 0 || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, duration, item.id, item.createdAt]);

  return (
    <div
      role={item.level === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={clsx(
        'pointer-events-auto relative flex w-[22rem] max-w-[calc(100vw-2rem)] animate-slide-in-right items-start gap-3 overflow-hidden rounded-xl border bg-ink-900/95 px-4 py-3 shadow-modal backdrop-blur',
        style.ring,
      )}
    >
      <span className={clsx('mt-0.5 shrink-0', style.iconColor)}>{item.icon ?? style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5 text-parchment-50">
          {item.text}
          {item.count > 1 && (
            <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-ink-700 px-1.5 text-[10px] font-bold text-parchment-200">
              ×{item.count}
            </span>
          )}
        </p>
        {item.description && <p className="mt-0.5 text-xs leading-4 text-parchment-300">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            className="mt-2 text-xs font-semibold uppercase tracking-wider text-gold-300 hover:text-gold-200"
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100"
        onClick={() => dismiss(item.id)}
      >
        <X className="h-4 w-4" />
      </button>
      {duration > 0 && (
        <span
          key={item.createdAt}
          aria-hidden
          className={clsx('absolute bottom-0 left-0 h-0.5 w-full origin-left animate-progress-shrink', style.bar)}
          style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
        />
      )}
    </div>
  );
}

/** Element of the game table that toasts must stay inside (the right sidebar holds the chat and dice controls). */
const GAME_VIEWPORT_ID = 'game-viewport';
const ANCHOR_MARGIN = 12;

interface ToastAnchor {
  top: number;
  right: number;
}

/** Top-right corner of the game viewport while it is on screen (null elsewhere). Only tracked while toasts show. */
function useGameViewportAnchor(active: boolean): ToastAnchor | null {
  const [anchor, setAnchor] = useState<ToastAnchor | null>(null);

  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return;
    let el: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      if (!el || !el.isConnected) {
        setAnchor(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const next = {
        top: Math.round(rect.top) + ANCHOR_MARGIN,
        right: Math.max(0, Math.round(window.innerWidth - rect.right)) + ANCHOR_MARGIN,
      };
      setAnchor((prev) => (prev && prev.top === next.top && prev.right === next.right ? prev : next));
    };
    const track = () => {
      const next = document.getElementById(GAME_VIEWPORT_ID);
      if (next === el) return;
      resizeObserver?.disconnect();
      resizeObserver = null;
      el = next;
      if (el && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(el);
      }
      measure();
    };

    track();
    const mutationObserver = new MutationObserver(track);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      setAnchor(null);
    };
  }, [active]);

  return anchor;
}

/** Mount once near the root: stacked toasts bottom-right (top-right of the map during a game). */
export function Toaster() {
  const items = useToasts();
  const anchor = useGameViewportAnchor(items.length > 0);
  if (typeof document === 'undefined') return null;
  const style: CSSProperties | undefined = anchor ? { top: anchor.top, right: anchor.right } : undefined;
  return createPortal(
    <div
      aria-live="polite"
      style={style}
      className={clsx(
        'pointer-events-none fixed z-100 flex flex-col items-end gap-2',
        !anchor && 'bottom-4 right-4',
      )}
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>,
    document.body,
  );
}

/** Icon used by inline alert boxes elsewhere. */
export function AlertIcon({ level, className }: { level: ToastLevel; className?: string }) {
  const Icon = level === 'success' ? CircleCheck : level === 'error' ? CircleAlert : level === 'warning' ? TriangleAlert : Info;
  return <Icon className={clsx('h-4 w-4', LEVEL_STYLE[level].iconColor, className)} aria-hidden />;
}
