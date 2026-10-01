import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface PanelSectionProps {
  title: ReactNode;
  icon?: ReactNode;
  /** Element at the right of the title (small actions, badges). */
  aside?: ReactNode;
  /** Muted helper text under the title. */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Titled block used inside the audio and effects sidebars. */
export function PanelSection({ title, icon, aside, description, children, className }: PanelSectionProps) {
  return (
    <section className={clsx('flex flex-col gap-2.5', className)}>
      <header className="flex min-h-[1.5rem] items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-gold-300 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {aside && <div className="flex shrink-0 items-center gap-1">{aside}</div>}
      </header>
      {description && <p className="-mt-1 text-xs leading-snug text-parchment-400">{description}</p>}
      {children}
    </section>
  );
}
