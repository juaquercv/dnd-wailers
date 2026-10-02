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

function ToastCard({ item, maxWidth }: { item: ToastItem; maxWidth?: number }) {
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
      style={maxWidth !== undefined ? { maxWidth } : undefined}
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
/**
 * Side panels that may be drawn over the map: the sidebar and initiative drawers on narrow screens and the
 * token details panel. Only absolutely/fixed positioned ones that overlap the viewport count.
 */
const PANEL_SELECTOR = 'section[aria-label], aside[aria-label]';
const ANCHOR_MARGIN = 12;
const NARROW_MARGIN = 8;
/** Narrower free map areas use the small margin. */
const NARROW_AREA = 400;
/** Narrowest card that still reads well; with less free map than this the map counts as covered. */
const MIN_CARD_WIDTH = 200;
/** Default stack position outside the game: bottom-right, 1rem from the edges (cards are 22rem wide). */
const DEFAULT_OFFSET = 16;
const CARD_WIDTH = 352;
/** Text fields the default stack must not cover while the user types in them (e.g. the lobby chat). */
const FIELD_SELECTOR =
  'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"])';
/** Room above a focused field needed to raise the stack over it. */
const MIN_ROOM_ABOVE = 160;

interface ToastAnchor {
  /** Distance from the window top (top-right of the visible map during a game). */
  top?: number;
  /** Distance from the window bottom (stack raised above a focused text field). */
  bottom?: number;
  right: number;
  /** Widest a card may be at this position (px). */
  maxWidth?: number;
}

function sameAnchor(a: ToastAnchor, b: ToastAnchor): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.right === b.right && a.maxWidth === b.maxWidth;
}

/**
 * Top-right corner of the part of the game viewport that no panel covers. When a drawer hides the whole map
 * (phones), toasts go inside that drawer, below its header, so its "Ocultar panel" button stays clickable.
 */
function computeAnchor(viewport: HTMLElement, panels: readonly HTMLElement[]): ToastAnchor | null {
  const vp = viewport.getBoundingClientRect();
  if (vp.width <= 0 || vp.height <= 0) return null;
  const winWidth = document.documentElement.clientWidth || window.innerWidth;
  let left = Math.max(0, vp.left);
  let right = Math.min(winWidth, vp.right);
  // The panel hiding most of the map (used when no free map area is left).
  let cover: { el: HTMLElement; rect: DOMRect; overlap: number } | null = null;

  for (const el of panels) {
    if (!el.isConnected || viewport.contains(el) || el.contains(viewport)) continue;
    const rect = el.getBoundingClientRect();
    const overlapX = Math.min(rect.right, vp.right) - Math.max(rect.left, vp.left);
    const overlapY = Math.min(rect.bottom, vp.bottom) - Math.max(rect.top, vp.top);
    if (overlapX <= 1 || overlapY <= 1) continue;
    // Docked panels sit beside the viewport; only floating ones are drawn over it.
    const position = window.getComputedStyle(el).position;
    if (position !== 'absolute' && position !== 'fixed') continue;
    if (!cover || overlapX > cover.overlap) cover = { el, rect, overlap: overlapX };
    if (rect.right >= vp.right - 1) right = Math.min(right, rect.left);
    else if (rect.left <= vp.left + 1) left = Math.max(left, rect.right);
  }

  const free = right - left;
  const margin = free < NARROW_AREA ? NARROW_MARGIN : ANCHOR_MARGIN;
  if (free - 2 * margin >= MIN_CARD_WIDTH) {
    return {
      top: Math.round(vp.top) + margin,
      right: Math.max(0, Math.round(winWidth - right)) + margin,
      maxWidth: Math.floor(free - 2 * margin),
    };
  }

  // No usable map area: inside the covering panel below its header (or across the window top on tiny screens).
  let boxLeft = 0;
  let boxRight = winWidth;
  let boxTop = vp.top;
  if (cover) {
    boxLeft = Math.max(0, cover.rect.left);
    boxRight = Math.min(winWidth, cover.rect.right);
    const header = cover.el.querySelector(':scope > header');
    boxTop = Math.max(vp.top, header ? header.getBoundingClientRect().bottom : cover.rect.top);
  }
  return {
    top: Math.round(boxTop) + NARROW_MARGIN,
    right: Math.max(0, Math.round(winWidth - boxRight)) + NARROW_MARGIN,
    maxWidth: Math.max(0, Math.floor(boxRight - boxLeft - 2 * NARROW_MARGIN)),
  };
}

/**
 * Outside the game the stack sits bottom-right; when the focused text field lies under it (the lobby chat input),
 * the stack is raised just above that field so the user still sees what they type. Null keeps the default.
 */
function computeFieldAnchor(): ToastAnchor | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.matches(FIELD_SELECTOR)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const winWidth = document.documentElement.clientWidth || window.innerWidth;
  const winHeight = document.documentElement.clientHeight || window.innerHeight;
  const columnRight = winWidth - DEFAULT_OFFSET;
  const columnLeft = columnRight - Math.min(CARD_WIDTH, winWidth - 2 * DEFAULT_OFFSET);
  const underStack = rect.right > columnLeft && rect.left < columnRight && rect.bottom > winHeight / 2;
  if (!underStack || rect.top < MIN_ROOM_ABOVE || rect.top >= winHeight) return null;
  return { bottom: Math.round(winHeight - rect.top) + NARROW_MARGIN, right: DEFAULT_OFFSET };
}

/** Where toasts go (null = default bottom-right corner). Only tracked while toasts show. */
function useToastAnchor(active: boolean): ToastAnchor | null {
  const [anchor, setAnchor] = useState<ToastAnchor | null>(null);

  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return;
    let viewport: HTMLElement | null = null;
    let panels: HTMLElement[] = [];
    let frame = 0;

    const measure = () => {
      if (viewport && viewport.isConnected) {
        const next = computeAnchor(viewport, panels);
        setAnchor((prev) => (prev && next && sameAnchor(prev, next) ? prev : next));
        return;
      }
      // Clicking a toast's own button focuses it: keep the stack where it is until it settles elsewhere.
      if (document.activeElement?.closest('[data-toaster]')) return;
      const next = computeFieldAnchor();
      setAnchor((prev) => (prev && next && sameAnchor(prev, next) ? prev : next));
    };
    // Focus moves and scrolling only matter for the field anchor; batch them per frame.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // Size changes of the viewport and of the panels (a drawer shown or hidden toggles its size from 0).
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const track = () => {
      const nextViewport = document.getElementById(GAME_VIEWPORT_ID);
      const nextPanels = nextViewport ? Array.from(document.querySelectorAll<HTMLElement>(PANEL_SELECTOR)) : [];
      const changed =
        nextViewport !== viewport || nextPanels.length !== panels.length || nextPanels.some((p, i) => p !== panels[i]);
      if (!changed) return;
      viewport = nextViewport;
      panels = nextPanels;
      if (resizeObserver) {
        resizeObserver.disconnect();
        if (viewport) resizeObserver.observe(viewport);
        for (const p of panels) resizeObserver.observe(p);
      }
      measure();
    };
    // Drawers slide in: measure again once they have settled.
    const onAnimationEnd = (e: AnimationEvent) => {
      if (e.target instanceof HTMLElement && panels.includes(e.target)) measure();
    };

    track();
    if (!viewport) measure();
    const mutationObserver = new MutationObserver(track);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('animationend', onAnimationEnd, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', schedule, { capture: true });
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      document.removeEventListener('animationend', onAnimationEnd, true);
      setAnchor(null);
    };
  }, [active]);

  return anchor;
}

/**
 * Mount once near the root: stacked toasts bottom-right (raised above a focused text field there), or top-right
 * of the visible map during a game.
 */
export function Toaster() {
  const items = useToasts();
  const anchor = useToastAnchor(items.length > 0);
  if (typeof document === 'undefined') return null;
  const style: CSSProperties | undefined = anchor
    ? { top: anchor.top, bottom: anchor.bottom, right: anchor.right }
    : undefined;
  return createPortal(
    <div
      aria-live="polite"
      data-toaster=""
      style={style}
      className={clsx(
        'pointer-events-none fixed z-100 flex flex-col items-end gap-2',
        !anchor && 'bottom-4 right-4',
      )}
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} maxWidth={anchor?.maxWidth} />
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
