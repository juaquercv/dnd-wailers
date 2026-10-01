import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Hammer } from 'lucide-react';

export interface UnderConstructionProps {
  /** Name of the feature, e.g. "Biblioteca". */
  title: string;
  /** Optional detail line (props received, context…). */
  detail?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Small "En construcción…" panel used by placeholder components until their feature lands. */
export function UnderConstruction({ title, detail, compact = false, className }: UnderConstructionProps) {
  return (
    <div
      className={clsx(
        'panel flex items-center gap-3 border-dashed border-gold-700/50',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        className,
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400">
        <Hammer className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate font-display text-sm font-semibold text-gold-200">{title}</div>
        <div className="text-xs text-parchment-400">En construcción…</div>
        {detail && <div className="mt-0.5 truncate text-[11px] text-parchment-400/80">{detail}</div>}
      </div>
    </div>
  );
}
