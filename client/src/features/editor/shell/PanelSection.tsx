import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

/** Remembers open/closed sections while the editor is open (survives tab switches). */
const openMemory = new Map<string, boolean>();

export interface PanelSectionProps {
  /** Stable id used to remember the collapsed state. */
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  /** Small element on the right of the header (count, action…). */
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  className?: string;
  bodyClassName?: string;
}

/** Titled, collapsible block used by the editor side panels. */
export function PanelSection({
  id,
  title,
  icon,
  aside,
  children,
  defaultOpen = true,
  collapsible = true,
  className,
  bodyClassName,
}: PanelSectionProps) {
  const [open, setOpen] = useState(() => openMemory.get(id) ?? defaultOpen);
  const toggle = () => {
    const next = !open;
    openMemory.set(id, next);
    setOpen(next);
  };
  const expanded = !collapsible || open;
  return (
    <section className={clsx('border-b border-ink-700/80 last:border-b-0', className)}>
      <div className="flex items-center gap-2 px-3 py-2">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className="group flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <ChevronDown
              className={clsx('h-3.5 w-3.5 shrink-0 text-parchment-400 transition-transform', !expanded && '-rotate-90')}
              aria-hidden
            />
            {icon && <span className="shrink-0 text-gold-400 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
            <span className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300 group-hover:text-gold-200">
              {title}
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {icon && <span className="shrink-0 text-gold-400 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
            <span className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">{title}</span>
          </div>
        )}
        {aside && <div className="flex shrink-0 items-center gap-1 text-xs text-parchment-400">{aside}</div>}
      </div>
      {expanded && <div className={clsx('flex flex-col gap-3 px-3 pb-3', bodyClassName)}>{children}</div>}
    </section>
  );
}
