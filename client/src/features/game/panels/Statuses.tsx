import type { MouseEvent } from 'react';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { STATUSES, type StatusDef } from '@wailers/shared';
import { useContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu';
import { withAlpha } from '../../../components/ui/Badge';

const STATUS_BY_KEY = new Map(STATUSES.map((s) => [s.key, s]));

export function statusDef(key: string): StatusDef {
  return STATUS_BY_KEY.get(key) ?? { key, label: key, icon: '•', color: '#cdb98f' };
}

export interface StatusIconsProps {
  statuses: string[];
  size?: 'xs' | 'sm' | 'md';
  /** Show the label next to the icon. */
  labels?: boolean;
  /** Maximum icons before "+N". */
  max?: number;
  /** When set, clicking a status removes it (DM). */
  onRemove?: (status: string) => void;
  className?: string;
}

/** Status emojis with tooltips (same icons as on the map tokens). */
export function StatusIcons({ statuses, size = 'sm', labels = false, max, onRemove, className }: StatusIconsProps) {
  if (statuses.length === 0) return null;
  const shown = max !== undefined ? statuses.slice(0, max) : statuses;
  const rest = statuses.length - shown.length;
  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {shown.map((key) => {
        const def = statusDef(key);
        const content = (
          <>
            <span aria-hidden className={size === 'xs' ? 'text-[10px]' : size === 'sm' ? 'text-xs' : 'text-sm'}>
              {def.icon}
            </span>
            {labels && <span className="truncate">{def.label}</span>}
          </>
        );
        const cls = clsx(
          'inline-flex items-center gap-1 rounded-full border font-medium leading-none',
          labels ? 'px-1.5 py-0.5 text-[11px]' : size === 'xs' ? 'h-4 w-4 justify-center' : 'h-5 w-5 justify-center',
        );
        const style = { borderColor: withAlpha(def.color, 0.55), backgroundColor: withAlpha(def.color, 0.16), color: def.color };
        return onRemove ? (
          <button
            key={key}
            type="button"
            className={clsx(cls, 'transition hover:brightness-125 hover:line-through')}
            style={style}
            title={`${def.label} (clic para quitar)`}
            onClick={() => onRemove(key)}
          >
            {content}
          </button>
        ) : (
          <span key={key} className={cls} style={style} title={def.label}>
            {content}
          </span>
        );
      })}
      {rest > 0 && (
        <span
          className="inline-flex h-5 items-center rounded-full border border-ink-500 bg-ink-800 px-1.5 text-[10px] text-parchment-300"
          title={statuses.slice(shown.length).map((k) => statusDef(k).label).join(', ')}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/** Context-menu items toggling every known status (checked = active). */
export function statusMenuItems(active: string[], onToggle: (status: string, on: boolean) => void): ContextMenuItem[] {
  const items: ContextMenuItem[] = [{ heading: true, label: 'Estados' }];
  for (const s of STATUSES) {
    const on = active.includes(s.key);
    items.push({ label: `${s.icon}  ${s.label}`, checked: on, onClick: () => onToggle(s.key, !on) });
  }
  const unknown = active.filter((k) => !STATUS_BY_KEY.has(k));
  if (unknown.length > 0) {
    items.push({ separator: true });
    for (const k of unknown) items.push({ label: k, checked: true, onClick: () => onToggle(k, false) });
  }
  return items;
}

/** Small "+" button opening the status toggle menu (DM). */
export function StatusMenuButton({ active, onToggle, className }: { active: string[]; onToggle: (status: string, on: boolean) => void; className?: string }) {
  const menu = useContextMenu();
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    menu.openAt(r.left, r.bottom + 4, statusMenuItems(active, onToggle));
  };
  return (
    <button
      type="button"
      onClick={open}
      title="Añadir o quitar estados"
      aria-label="Estados"
      className={clsx(
        'inline-flex h-5 items-center gap-0.5 rounded-full border border-dashed border-ink-400 px-1.5 text-[10px] font-medium text-parchment-300 transition hover:border-gold-600 hover:text-gold-300',
        className,
      )}
    >
      <Plus className="h-3 w-3" />
      Estado
    </button>
  );
}
