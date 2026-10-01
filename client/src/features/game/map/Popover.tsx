import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Element the popover hangs from (kept open while clicking it toggles). */
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Width in px (default: anchor width, min 220). */
  width?: number;
  className?: string;
}

const MARGIN = 8;

/** Floating panel under an anchor (portal, fixed position): closes on outside click, Esc and resize. */
export function Popover({ open, onClose, anchorRef, children, align = 'start', width, className }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
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
      const w = Math.min(width ?? Math.max(220, r.width), window.innerWidth - MARGIN * 2);
      let left = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));
      const top = r.bottom + 6;
      setPos({ left, top, width: w, maxHeight: Math.max(160, window.innerHeight - top - MARGIN) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
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
      className={clsx(
        'scroll-thin fixed z-60 overflow-y-auto rounded-xl border border-ink-500 bg-ink-900/95 p-1.5 shadow-modal backdrop-blur',
        pos ? 'animate-scale-in' : 'invisible',
        className,
      )}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: pos?.width,
        maxHeight: pos?.maxHeight,
        transformOrigin: 'top center',
        animationDuration: '140ms',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
