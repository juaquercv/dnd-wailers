import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Element the popover is attached to (clicks on it do not count as "outside"). */
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end';
  className?: string;
  /** Accessible name of the floating panel. */
  label?: string;
}

const MARGIN = 8;
const GAP = 6;

/**
 * Floating panel rendered in a portal (never clipped by scroll containers), positioned under its
 * anchor and flipped above when there is no room. Closes on outside pointer down and on Esc
 * (Esc is consumed so editor shortcuts do not also react).
 */
export function Popover({ open, onClose, anchorRef, children, placement = 'bottom-start', className, label }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    let frame = 0;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = placement === 'bottom-end' ? anchor.right - w : anchor.left;
      left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
      let top = anchor.bottom + GAP;
      if (top + h > vh - MARGIN) {
        const above = anchor.top - h - GAP;
        top = above >= MARGIN ? above : Math.max(MARGIN, vh - h - MARGIN);
      }
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
    };
  }, [open, placement, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      onContextMenu={(e) => e.stopPropagation()}
      className={clsx(
        'fixed z-90 rounded-xl border border-gold-700/40 bg-ink-900/95 p-3 shadow-modal backdrop-blur',
        pos ? 'animate-scale-in' : 'invisible',
        className,
      )}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, transformOrigin: 'top left', animationDuration: '140ms' }}
    >
      {children}
    </div>,
    document.body,
  );
}
