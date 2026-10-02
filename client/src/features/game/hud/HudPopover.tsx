import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

export interface HudPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Button the panel rises from (clicks on it are left to its own toggle). */
  anchorRef: RefObject<HTMLElement>;
  title: ReactNode;
  icon?: ReactNode;
  /** Short line under the title (e.g. what the action costs). */
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}

const MARGIN = 8;
const GAP = 10;

/** Panel that opens upwards from a HUD button (portal, fixed): closes on outside click and Esc. */
export function HudPopover({ open, onClose, anchorRef, title, icon, subtitle, children, width = 340, footer }: HudPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number; maxHeight: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - MARGIN * 2);
      const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - MARGIN));
      const bottom = Math.max(MARGIN, window.innerHeight - r.top + GAP);
      setPos({ left, bottom, width: w, maxHeight: Math.max(180, r.top - GAP - MARGIN) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      // Dialogs and menus opened from the panel live in their own portals.
      if (t instanceof Element && t.closest('[role="dialog"], [data-context-menu]')) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={false}
      className={clsx(
        'fixed z-60 flex flex-col overflow-hidden rounded-2xl border border-gold-700/50 bg-ink-900/95 shadow-modal backdrop-blur',
        pos ? 'animate-scale-in' : 'invisible',
      )}
      style={{
        left: pos?.left ?? 0,
        bottom: pos?.bottom ?? 0,
        width: pos?.width,
        maxHeight: pos?.maxHeight,
        transformOrigin: 'bottom center',
        animationDuration: '150ms',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-ink-600/70 bg-gradient-to-b from-ink-800/80 to-transparent px-3 py-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-gold-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-semibold uppercase tracking-[0.12em] text-gold-100">{title}</h3>
          {subtitle && <div className="mt-0.5 text-[11px] leading-snug text-parchment-400">{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-50"
          title="Cerrar (Esc)"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      {footer && <footer className="shrink-0 border-t border-ink-600/70 px-3 py-2">{footer}</footer>}
    </div>,
    document.body,
  );
}
