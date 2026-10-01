import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import { Popover } from './Popover';

export interface MenuPopoverItem {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface MenuPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  title: string;
  items: MenuPopoverItem[];
  placement?: 'bottom-start' | 'bottom-end';
  className?: string;
}

/**
 * Rich action menu (icon, label and a short description per item) anchored to a button.
 * Flips above the anchor when there is no room below. ↑/↓/Home/End move, Enter selects, Esc closes.
 */
export function MenuPopover({ open, onClose, anchorRef, title, items, placement = 'bottom-start', className }: MenuPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // After the popover has been positioned (it is invisible until then).
    const timer = window.setTimeout(() => {
      listRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []);
    if (buttons.length === 0) return;
    e.preventDefault();
    const pos = buttons.findIndex((b) => b === document.activeElement);
    let next = 0;
    if (e.key === 'ArrowDown') next = pos < 0 ? 0 : (pos + 1) % buttons.length;
    else if (e.key === 'ArrowUp') next = pos < 0 ? buttons.length - 1 : (pos - 1 + buttons.length) % buttons.length;
    else if (e.key === 'End') next = buttons.length - 1;
    buttons[next]?.focus();
  };

  const close = () => {
    onClose();
    anchorRef.current?.focus();
  };

  return (
    <Popover open={open} onClose={close} anchorRef={anchorRef} label={title} placement={placement} className={clsx('w-72 p-1.5', className)}>
      <div ref={listRef} role="menu" aria-label={title} onKeyDown={onKeyDown}>
        <div className="px-2 pb-1.5 pt-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-400/90">{title}</div>
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore && <div className="mx-2 my-1 h-px bg-ink-600/80" role="separator" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left outline-none transition hover:bg-ink-700/80 focus-visible:bg-ink-700/80 disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gold-700/40 bg-gold-500/10 text-gold-300 transition group-hover:border-gold-600/70 group-hover:text-gold-200 group-focus-visible:border-gold-600/70 [&>svg]:h-4 [&>svg]:w-4">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-parchment-50">{item.label}</span>
                {item.description && <span className="block text-[11px] leading-snug text-parchment-400">{item.description}</span>}
              </span>
            </button>
          </div>
        ))}
      </div>
    </Popover>
  );
}
