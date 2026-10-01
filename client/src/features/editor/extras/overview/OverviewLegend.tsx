import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ZONE_TYPES } from '@wailers/shared';
import { LINK_STYLE_ORDER, LINK_STYLES, PIN_TYPE_STYLES, type LinkStyle } from './overviewStyles';

/** Small SVG sample of a route style. */
export function LinkSwatch({ style, width = 34, className }: { style: LinkStyle; width?: number; className?: string }) {
  const def = LINK_STYLES[style];
  const sw = Math.max(2, def.width * 0.6);
  const dash = def.dash ? def.dash.map((d) => Math.max(0.1, d * 0.6)).join(' ') : undefined;
  return (
    <svg width={width} height={12} viewBox={`0 0 ${width} 12`} className={clsx('shrink-0', className)} aria-hidden>
      <line x1={3} y1={6} x2={width - 3} y2={6} stroke={def.casing} strokeWidth={sw + 2} strokeDasharray={dash} strokeLinecap={def.lineCap} />
      <line x1={3} y1={6} x2={width - 3} y2={6} stroke={def.color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap={def.lineCap} />
    </svg>
  );
}

/** Collapsible map legend: route styles and pin colors by zone type. */
export function OverviewLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className={clsx(
        'pointer-events-auto rounded-xl border border-ink-600/80 bg-ink-900/90 text-xs text-parchment-200 shadow-panel backdrop-blur',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-300"
        aria-expanded={open}
      >
        Leyenda
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="grid animate-fade-in gap-3 border-t border-ink-600/70 px-3 py-2.5">
          <ul className="space-y-1.5">
            {LINK_STYLE_ORDER.map((style) => (
              <li key={style} className="flex items-center gap-2" title={LINK_STYLES[style].description}>
                <LinkSwatch style={style} />
                <span>{LINK_STYLES[style].label}</span>
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {ZONE_TYPES.map((type) => (
              <li key={type} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40" style={{ background: PIN_TYPE_STYLES[type].color }} />
                <span className="truncate">{PIN_TYPE_STYLES[type].label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
