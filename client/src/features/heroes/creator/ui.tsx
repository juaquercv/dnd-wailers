import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Check, Info } from 'lucide-react';
import type { CategoryNode } from '@wailers/shared';
import { withAlpha } from '../../../components/ui/Badge';

/** Category icons are emojis; plain identifiers (icon names) are not rendered as text. */
export function categoryEmoji(icon: string | null | undefined): string | null {
  return icon && !/^[a-z0-9_-]+$/i.test(icon) ? icon : null;
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div
      className={clsx(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed text-parchment-200',
        tone === 'info' ? 'border-sky-500/25 bg-sky-500/[0.06]' : 'border-gold-600/40 bg-gold-500/[0.07]',
      )}
    >
      <Info className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0', tone === 'info' ? 'text-sky-300' : 'text-gold-300')} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StepIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="font-display text-xl font-semibold tracking-wide text-gold-200">{title}</h3>
      {children && <p className="mt-1 text-sm leading-relaxed text-parchment-300">{children}</p>}
    </div>
  );
}

export function IssueList({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul role="alert" className="mb-4 flex flex-col gap-1 rounded-lg border border-blood-500/50 bg-blood-500/10 px-3 py-2 text-sm text-blood-200">
      {messages.map((m) => (
        <li key={m} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blood-400" />
          {m}
        </li>
      ))}
    </ul>
  );
}

export interface OptionGridProps {
  options: CategoryNode[];
  value: string | null;
  onSelect: (id: string | null) => void;
  /** Fallback accent when an option has no color. */
  accent: string;
  /** Small caption under the name ("2 subclases"). */
  caption?: (node: CategoryNode) => string | null;
  size?: 'md' | 'sm';
  className?: string;
  'aria-label'?: string;
}

/** Big selectable cards (single choice; clicking the selected one clears it). */
export function OptionGrid({ options, value, onSelect, accent, caption, size = 'md', className, 'aria-label': ariaLabel }: OptionGridProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(
        'grid gap-2',
        size === 'md' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.id === value;
        const color = o.color ?? accent;
        const emoji = categoryEmoji(o.icon);
        const sub = caption?.(o) ?? null;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(active ? null : o.id)}
            className={clsx(
              'group relative flex items-center gap-2.5 overflow-hidden rounded-xl border text-left transition duration-150 active:scale-[0.98]',
              size === 'md' ? 'px-3 py-2.5' : 'px-2.5 py-1.5',
              !active && 'border-ink-600 bg-ink-950/40 hover:-translate-y-px hover:border-ink-400 hover:bg-ink-800/70',
            )}
            style={
              active
                ? {
                    borderColor: withAlpha(color, 0.8),
                    background: `radial-gradient(circle at 15% 50%, ${withAlpha(color, 0.25)}, ${withAlpha(color, 0.06)} 70%)`,
                    boxShadow: `0 0 22px -8px ${color}`,
                  }
                : undefined
            }
          >
            <span
              className={clsx(
                'flex shrink-0 items-center justify-center rounded-lg border leading-none',
                size === 'md' ? 'h-10 w-10 text-2xl' : 'h-7 w-7 text-base',
              )}
              style={{ borderColor: withAlpha(color, 0.4), backgroundColor: withAlpha(color, 0.12) }}
              aria-hidden
            >
              {emoji ?? <span className="font-display text-sm font-bold" style={{ color }}>{o.name.charAt(0).toUpperCase()}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className={clsx('block truncate font-medium', active ? 'text-parchment-50' : 'text-parchment-100', size === 'md' ? 'text-sm' : 'text-xs')}>
                {o.name}
              </span>
              {sub && <span className="block truncate text-[10px] text-parchment-400">{sub}</span>}
            </span>
            {active && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full animate-pop" style={{ backgroundColor: color }}>
                <Check className="h-3 w-3 text-ink-950" strokeWidth={3.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ChipChoiceProps {
  options: CategoryNode[];
  selected: string[];
  onToggle: (id: string) => void;
  accent: string;
  multi?: boolean;
  'aria-label'?: string;
}

/** Compact chips (subrace, subclass, group roles). */
export function ChipChoice({ options, selected, onToggle, accent, multi = false, 'aria-label': ariaLabel }: ChipChoiceProps) {
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o.id);
        const color = o.color ?? accent;
        const emoji = categoryEmoji(o.icon);
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => onToggle(o.id)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95',
              !active && 'border-ink-500 bg-ink-800/70 text-parchment-200 hover:border-ink-400 hover:text-parchment-50',
            )}
            style={active ? { color: '#fbf6ea', borderColor: withAlpha(color, 0.75), backgroundColor: withAlpha(color, 0.22), boxShadow: `0 0 14px -6px ${color}` } : undefined}
          >
            {emoji && <span aria-hidden>{emoji}</span>}
            {o.name}
            {active && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
