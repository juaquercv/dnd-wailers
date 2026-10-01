import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Check, ChevronRight } from 'lucide-react';

export interface ContextMenuItem {
  label?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Submenu. */
  children?: ContextMenuItem[];
  /** Renders a divider line (other fields ignored). */
  separator?: boolean;
  /** Right-aligned hint, e.g. "Supr" or "Ctrl+D". */
  shortcut?: string;
  /** Shows a check mark in the icon slot. */
  checked?: boolean;
  /** Non-interactive section title. */
  heading?: boolean;
}

/** Anything with client coordinates: React or native MouseEvent, Konva's `e.evt`, or a plain point. */
export interface MenuAnchorEvent {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface ContextMenuApi {
  /** Open at the pointer position. Calls preventDefault on the event (suppresses the browser menu). */
  open: (event: MenuAnchorEvent, items: ContextMenuItem[]) => void;
  /** Open at viewport coordinates. */
  openAt: (x: number, y: number, items: ContextMenuItem[]) => void;
  close: () => void;
  isOpen: boolean;
}

interface MenuState {
  key: number;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

const ContextMenuContext = createContext<ContextMenuApi | null>(null);
const MARGIN = 8;

/** Mount once near the root; then use useContextMenu() anywhere. */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const seq = useRef(0);

  const close = useCallback(() => setMenu(null), []);
  const openAt = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    const visible = items.filter((i) => i && (i.separator || i.label !== undefined));
    if (visible.length === 0) return;
    seq.current += 1;
    setMenu({ key: seq.current, x, y, items: visible });
  }, []);
  const open = useCallback(
    (event: MenuAnchorEvent, items: ContextMenuItem[]) => {
      event.preventDefault?.();
      openAt(event.clientX, event.clientY, items);
    },
    [openAt],
  );

  const api = useMemo<ContextMenuApi>(() => ({ open, openAt, close, isOpen: menu !== null }), [open, openAt, close, menu]);

  return (
    <ContextMenuContext.Provider value={api}>
      {children}
      {menu && typeof document !== 'undefined' &&
        createPortal(<RootMenu key={menu.key} state={menu} onClose={close} />, document.body)}
    </ContextMenuContext.Provider>
  );
}

/** Access the context menu API. Requires <ContextMenuProvider>. */
export function useContextMenu(): ContextMenuApi {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu requiere <ContextMenuProvider>');
  return ctx;
}

function RootMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const isInside = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[data-context-menu]');
    const onPointerDown = (e: Event) => {
      if (!isInside(e.target)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    const onScroll = (e: Event) => {
      if (!isInside(e.target)) onCloseRef.current();
    };
    const onBlur = () => onCloseRef.current();
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onBlur);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onBlur);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return <MenuList items={state.items} anchor={{ x: state.x, y: state.y, flipX: state.x }} onCloseAll={onClose} autoFocus />;
}

interface Anchor {
  /** Preferred left edge. */
  x: number;
  y: number;
  /** Right edge used when the menu does not fit on the right (flips to the left). */
  flipX: number;
}

interface MenuListProps {
  items: ContextMenuItem[];
  anchor: Anchor;
  onCloseAll: () => void;
  /** Close this (sub)menu only, returning focus to the parent item. */
  onCloseSelf?: () => void;
  autoFocus?: boolean;
}

function MenuList({ items, anchor, onCloseAll, onCloseSelf, autoFocus = false }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sub, setSub] = useState<{ index: number; anchor: Anchor; focus: boolean } | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x;
    if (left + width > vw - MARGIN) left = anchor.flipX - width;
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
    let top = anchor.y;
    if (top + height > vh - MARGIN) top = Math.max(MARGIN, vh - height - MARGIN);
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [anchor.x, anchor.y, anchor.flipX, items]);

  useEffect(() => {
    if (pos && autoFocus) {
      const first = itemRefs.current.find((b) => b && !b.disabled);
      (first ?? ref.current)?.focus({ preventScroll: true });
    }
  }, [pos, autoFocus]);

  const enabledButtons = () => itemRefs.current.filter((b): b is HTMLButtonElement => !!b && !b.disabled);

  const openSubmenu = (index: number, focus: boolean) => {
    const btn = itemRefs.current[index];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setSub({ index, anchor: { x: r.right - 2, y: r.top - 5, flipX: r.left + 2 }, focus });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = enabledButtons();
    const current = buttons.findIndex((b) => b === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (buttons.length === 0) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = current < 0 ? (delta > 0 ? 0 : buttons.length - 1) : (current + delta + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      (e.key === 'Home' ? buttons[0] : buttons[buttons.length - 1])?.focus();
    } else if (e.key === 'ArrowRight') {
      e.stopPropagation();
      const idx = itemRefs.current.findIndex((b) => b === document.activeElement);
      if (idx >= 0 && items[idx]?.children?.length) {
        e.preventDefault();
        openSubmenu(idx, true);
      }
    } else if (e.key === 'ArrowLeft') {
      e.stopPropagation();
      if (onCloseSelf) {
        e.preventDefault();
        onCloseSelf();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <>
      <div
        ref={ref}
        data-context-menu
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className={clsx(
          'scroll-thin fixed z-90 max-h-[calc(100vh-16px)] min-w-[12rem] max-w-[20rem] overflow-y-auto rounded-lg border border-ink-500 bg-ink-900/95 p-1 shadow-modal backdrop-blur',
          pos ? 'animate-scale-in' : 'invisible',
        )}
        style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, transformOrigin: 'top left', animationDuration: '120ms' }}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={`sep-${i}`} role="separator" className="mx-1 my-1 h-px bg-ink-600" />;
          }
          if (item.heading) {
            return (
              <div
                key={`h-${i}`}
                className="truncate px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-400/80"
              >
                {item.label}
              </div>
            );
          }
          const hasChildren = !!item.children && item.children.length > 0;
          const isSubOpen = sub?.index === i;
          return (
            <button
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? isSubOpen : undefined}
              disabled={item.disabled}
              onMouseEnter={(e) => {
                if (hasChildren) openSubmenu(i, false);
                else if (sub) setSub(null);
                e.currentTarget.focus({ preventScroll: true });
              }}
              onClick={() => {
                if (item.disabled) return;
                if (hasChildren) {
                  openSubmenu(i, true);
                  return;
                }
                onCloseAll();
                item.onClick?.();
              }}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors duration-75',
                'disabled:cursor-not-allowed disabled:opacity-40',
                item.danger
                  ? 'text-blood-400 hover:bg-blood-600/25 focus:bg-blood-600/25 focus:text-blood-300'
                  : 'text-parchment-100 hover:bg-ink-700 focus:bg-ink-700',
                isSubOpen && 'bg-ink-700',
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-parchment-300 [&>svg]:h-4 [&>svg]:w-4">
                {item.checked ? <Check className="text-gold-400" /> : item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <span className="ml-3 shrink-0 text-[11px] text-parchment-400">{item.shortcut}</span>}
              {hasChildren && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-parchment-400" />}
            </button>
          );
        })}
      </div>
      {sub && items[sub.index]?.children && (
        <MenuList
          key={sub.index}
          items={items[sub.index]!.children!}
          anchor={sub.anchor}
          onCloseAll={onCloseAll}
          autoFocus={sub.focus}
          onCloseSelf={() => {
            const idx = sub.index;
            setSub(null);
            itemRefs.current[idx]?.focus();
          }}
        />
      )}
    </>
  );
}
