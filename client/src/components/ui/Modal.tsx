import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Icon shown before the title. */
  icon?: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  children?: ReactNode;
  /** Default true. */
  closeOnBackdrop?: boolean;
  /** Default true. */
  closeOnEsc?: boolean;
  /** Hide the X button in the header. */
  hideClose?: boolean;
  /** Element focused on open (default: [data-autofocus], first field, or the dialog). */
  initialFocus?: RefObject<HTMLElement>;
  /** Extra classes for the dialog panel. */
  className?: string;
  /** Extra classes for the scrollable body (e.g. "p-0" for edge-to-edge content). */
  bodyClassName?: string;
  /** Extra actions rendered in the header, left of the close button. */
  headerActions?: ReactNode;
  /** Stacking layer: 'modal' (default) or 'dialog' (above other modals, for confirmations). */
  layer?: 'modal' | 'dialog';
}

const SIZE: Record<ModalSize, string> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-lg',
  lg: 'w-full max-w-3xl',
  xl: 'w-full max-w-5xl',
  full: 'h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Open modals, innermost last: only the top one reacts to Esc / Tab. */
const modalStack: string[] = [];
let scrollLocks = 0;

function lockScroll(): () => void {
  scrollLocks += 1;
  const prev = document.body.style.overflow;
  if (scrollLocks === 1) document.body.style.overflow = 'hidden';
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = prev;
  };
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null,
  );
}

/** True when a modal (from this kit) is open; used by global hotkeys to stay quiet. */
export function isAnyModalOpen(): boolean {
  return modalStack.length > 0;
}

function ModalContent({
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideClose = false,
  initialFocus,
  className,
  bodyClassName,
  headerActions,
  layer = 'modal',
}: Omit<ModalProps, 'open'>) {
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pressStartedOnBackdrop = useRef(false);
  const closeOnEscRef = useRef(closeOnEsc);
  closeOnEscRef.current = closeOnEsc;

  useEffect(() => {
    modalStack.push(id);
    const unlock = lockScroll();
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    if (panel) {
      const target =
        initialFocus?.current ??
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])') ??
        panel;
      // Defer so the element is laid out (animations) before focusing.
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape' && closeOnEscRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const list = focusables(panelRef.current);
        if (list.length === 0) {
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = list[0]!;
        const last = list[list.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (!panelRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const idx = modalStack.lastIndexOf(id);
      if (idx >= 0) modalStack.splice(idx, 1);
      unlock();
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // Mount-only: the modal registers once per opening (latest callbacks are read through refs).
  }, []);

  const hasHeader = title !== undefined || subtitle !== undefined || !hideClose || headerActions !== undefined;

  return (
    <div
      className={clsx(
        'fixed inset-0 flex animate-fade-in items-center justify-center bg-black/65 p-4 backdrop-blur-[3px]',
        layer === 'dialog' ? 'z-80' : 'z-70',
      )}
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (closeOnBackdrop && pressStartedOnBackdrop.current && e.target === e.currentTarget) onCloseRef.current();
        pressStartedOnBackdrop.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          'panel flex max-h-[calc(100vh-2rem)] animate-scale-in flex-col overflow-hidden border-gold-700/40 bg-ink-900 shadow-modal',
          SIZE[size],
          className,
        )}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent"
        />
        {hasHeader && (
          <div className="flex shrink-0 items-start gap-3 border-b border-ink-600/70 px-5 py-3.5">
            {icon && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-700/50 bg-gold-500/10 text-gold-300 [&>svg]:h-4 [&>svg]:w-4">
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {title !== undefined && (
                <h2 id={titleId} className="truncate font-display text-lg font-semibold leading-7 text-gold-200">
                  {title}
                </h2>
              )}
              {subtitle !== undefined && <p className="mt-0.5 text-xs text-parchment-300">{subtitle}</p>}
            </div>
            {headerActions && <div className="flex shrink-0 items-center gap-1">{headerActions}</div>}
            {!hideClose && (
              <IconButton
                icon={<X />}
                title="Cerrar (Esc)"
                size="sm"
                className="-mr-1.5 shrink-0"
                onClick={() => onCloseRef.current()}
              />
            )}
          </div>
        )}
        <div className={clsx('scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink-600/70 bg-ink-950/40 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Portal dialog with Esc / backdrop close, light focus trap and scale-in animation. */
export function Modal({ open, ...rest }: ModalProps) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<ModalContent {...rest} />, document.body);
}
