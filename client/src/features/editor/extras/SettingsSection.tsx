import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface SettingsSectionProps {
  /** DOM id (anchor for the section navigation). */
  id?: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons at the right of the header. */
  actions?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
  children: ReactNode;
}

/** Titled card used by the rules and settings forms. */
export function SettingsSection({ id, icon, title, description, actions, tone = 'default', className, children }: SettingsSectionProps) {
  const danger = tone === 'danger';
  return (
    <section
      id={id}
      className={clsx('panel scroll-mt-4 overflow-hidden p-0', danger && 'border-blood-600/50 bg-blood-800/10', className)}
    >
      <header
        className={clsx(
          'flex flex-wrap items-start gap-3 border-b px-5 py-4',
          danger ? 'border-blood-600/40' : 'border-ink-600/70',
        )}
      >
        {icon && (
          <span
            className={clsx(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:h-[18px] [&>svg]:w-[18px]',
              danger ? 'border-blood-500/50 bg-blood-500/15 text-blood-300' : 'border-gold-700/50 bg-gold-500/10 text-gold-300',
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className={clsx('font-display text-base font-semibold tracking-wide', danger ? 'text-blood-300' : 'text-gold-200')}>
            {title}
          </h3>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-parchment-300">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </section>
  );
}

/** Small subheading inside a section. */
export function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-parchment-300">{children}</h4>
      <span aria-hidden className="h-px flex-1 bg-ink-600/70" />
      {aside}
    </div>
  );
}

/** Muted info box with an icon. */
export function InfoNote({ icon, children, tone = 'info' }: { icon?: ReactNode; children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div
      className={clsx(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
        tone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-ink-500/70 bg-ink-950/50 text-parchment-300',
      )}
    >
      {icon && <span className="mt-px shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
