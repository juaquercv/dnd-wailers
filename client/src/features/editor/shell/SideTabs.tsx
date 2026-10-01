import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';

export interface SideTab<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
  /** Small counter (hidden when 0 / undefined). */
  badge?: number;
}

export interface SideTabsProps<T extends string> {
  items: SideTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Compact tab strip for narrow side panels: the active tab shows its label, the others only
 * their icon (with a tooltip); counters are drawn as a bubble on the icon. Arrow keys / Home / End move between tabs.
 */
export function SideTabs<T extends string>({ items, value, onChange, className, 'aria-label': ariaLabel }: SideTabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const pos = items.findIndex((it) => it.id === value);
    let next = pos;
    if (e.key === 'ArrowRight') next = (pos + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (pos - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else next = items.length - 1;
    const target = items[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={clsx('flex min-w-0 items-stretch', className)}>
      {items.map((item, i) => {
        const active = item.id === value;
        const badge = item.badge && item.badge > 0 ? (item.badge > 99 ? '99+' : String(item.badge)) : null;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={badge ? `${item.label} (${badge})` : item.label}
            tabIndex={active ? 0 : -1}
            title={active ? undefined : item.label}
            onClick={() => onChange(item.id)}
            className={clsx(
              'group relative inline-flex h-9 items-center justify-center gap-1.5 rounded-t-md px-2 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold-500/40',
              active
                ? 'min-w-0 shrink bg-gradient-to-b from-gold-500/[0.08] to-transparent text-gold-200'
                : 'w-8 shrink-0 text-parchment-400 hover:bg-ink-800/70 hover:text-parchment-100',
            )}
          >
            <span className={clsx('relative inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4', active && badge && 'mr-1.5')} aria-hidden>
              {item.icon}
              {badge && (
                <span className="absolute -right-2 -top-1.5 min-w-[0.95rem] rounded-full bg-gold-500 px-1 text-center text-[9px] font-bold leading-[0.95rem] text-ink-950 shadow-[0_0_6px_rgba(233,192,99,0.6)]">
                  {badge}
                </span>
              )}
            </span>
            {active && <span className="truncate">{item.label}</span>}
            <span
              aria-hidden
              className={clsx(
                'pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full transition-all duration-200',
                active ? 'bg-gold-400 shadow-[0_0_8px_rgba(233,192,99,0.7)]' : 'bg-transparent group-hover:bg-ink-500',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
