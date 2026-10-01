import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Counter or small element shown after the label. */
  badge?: ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** 'underline' (default) for page sections, 'pills' for compact toggles. */
  variant?: 'underline' | 'pills';
  size?: 'sm' | 'md';
  /** Stretch tabs to fill the width. */
  fill?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Controlled tab bar (arrow keys move between tabs). */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  fill = false,
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const enabled = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.disabled);
    if (enabled.length === 0) return;
    const pos = enabled.findIndex(({ it }) => it.id === value);
    let next = pos;
    if (e.key === 'ArrowRight') next = (pos + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (pos - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.it.id);
    refs.current[target.i]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={clsx(
        'flex items-center',
        variant === 'underline' ? 'gap-1 border-b border-ink-600/80' : 'gap-1 rounded-lg border border-ink-600 bg-ink-950/60 p-1',
        fill ? 'w-full' : 'max-w-full overflow-x-auto no-scrollbar',
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            onClick={() => onChange(item.id)}
            className={clsx(
              'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
              fill && 'flex-1',
              size === 'sm' ? 'text-xs [&_svg]:h-3.5 [&_svg]:w-3.5' : 'text-sm [&_svg]:h-4 [&_svg]:w-4',
              variant === 'underline'
                ? clsx(
                    size === 'sm' ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5',
                    '-mb-px border-b-2',
                    active
                      ? 'border-gold-400 text-gold-200'
                      : 'border-transparent text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
                  )
                : clsx(
                    size === 'sm' ? 'rounded-md px-2.5 py-1' : 'rounded-md px-3 py-1.5',
                    active
                      ? 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[inset_0_1px_0_rgba(243,234,214,0.08),0_0_0_1px_rgba(176,133,43,0.45)]'
                      : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
                  ),
            )}
          >
            {item.icon && <span className="inline-flex shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== null && item.badge !== false && (
              <span
                className={clsx(
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-4',
                  active ? 'bg-gold-500/25 text-gold-200' : 'bg-ink-600 text-parchment-200',
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
