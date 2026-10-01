import { useEffect, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import { ExternalLink, Layers, TriangleAlert } from 'lucide-react';
import type { Zone } from '@wailers/shared';
import { PIN_TYPE_STYLES } from '../overview/overviewStyles';
import { DIRECTION_LABELS, DIRECTIONS, type Direction } from './gridModel';

export type DirStatus = 'match' | 'mismatch' | 'none';

export function zoneThumbUrl(zone: Zone): string | null {
  const level = zone.levels.find((l) => l.id === zone.defaultLevelId) ?? zone.levels[0];
  return level?.background.url ?? null;
}

function zoneBackgroundColor(zone: Zone): string {
  const level = zone.levels.find((l) => l.id === zone.defaultLevelId) ?? zone.levels[0];
  return level?.background.color ?? '#2b2a24';
}

/** Zone thumbnail: default level background image, or its color with the zone type emblem. */
export function ZoneThumb({ zone, className }: { zone: Zone; className?: string }) {
  const url = zoneThumbUrl(zone);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const type = PIN_TYPE_STYLES[zone.zoneType] ?? PIN_TYPE_STYLES.exterior;
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        loading="lazy"
        onError={() => setBroken(true)}
        className={clsx('object-cover', className)}
      />
    );
  }
  const style: CSSProperties = {
    background: `radial-gradient(circle at 30% 25%, ${type.color}55, transparent 60%), ${zoneBackgroundColor(zone)}`,
  };
  return (
    <div className={clsx('flex items-center justify-center', className)} style={style} aria-hidden>
      <span className="text-2xl opacity-60">{type.icon}</span>
    </div>
  );
}

export interface ZoneGridCardProps {
  zone: Zone;
  dirStatus: Record<Direction, DirStatus>;
  /** Neighbor names per direction (tooltip). */
  neighborNames: Record<Direction, string | null>;
  conflict?: boolean;
  /** Source card while it is being dragged (ghosted). */
  ghost?: boolean;
  /** Rendered inside the DragOverlay. */
  lifted?: boolean;
  onOpen?: () => void;
}

const EDGE_CLASS: Record<Direction, string> = {
  up: 'left-1/2 top-0 h-[3px] w-10 -translate-x-1/2',
  down: 'bottom-0 left-1/2 h-[3px] w-10 -translate-x-1/2',
  left: 'left-0 top-1/2 h-10 w-[3px] -translate-y-1/2',
  right: 'right-0 top-1/2 h-10 w-[3px] -translate-y-1/2',
};

function neighborsTooltip(names: Record<Direction, string | null>, status: Record<Direction, DirStatus>): string {
  const parts = DIRECTIONS.filter((d) => names[d]).map(
    (d) => `${DIRECTION_LABELS[d]}: ${names[d]}${status[d] === 'mismatch' ? ' (no coincide con la cuadrícula)' : ''}`,
  );
  return parts.length ? `Vecinas — ${parts.join(' · ')}` : 'Sin zonas vecinas';
}

/** Board card of a zone (thumbnail, name, neighbor edges). */
export function ZoneGridCard({ zone, dirStatus, neighborNames, conflict = false, ghost = false, lifted = false, onOpen }: ZoneGridCardProps) {
  const type = PIN_TYPE_STYLES[zone.zoneType] ?? PIN_TYPE_STYLES.exterior;
  const levels = zone.levels.length;
  return (
    <div
      className={clsx(
        'group/card relative h-full w-full select-none overflow-hidden rounded-xl border bg-ink-900 transition duration-150',
        lifted
          ? 'rotate-[1.5deg] scale-[1.04] border-gold-400 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9),0_0_0_1px_rgba(233,192,99,0.5)]'
          : 'border-ink-500 shadow-panel hover:-translate-y-0.5 hover:border-gold-600/80 hover:shadow-glow-gold',
        ghost && 'opacity-30',
      )}
      title={neighborsTooltip(neighborNames, dirStatus)}
    >
      <ZoneThumb zone={zone} className="absolute inset-0 h-full w-full" />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/35 to-ink-950/10" />
      <span
        className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border text-xs backdrop-blur-sm"
        style={{ borderColor: `${type.color}99`, background: `${type.color}33` }}
        title={type.label}
      >
        {type.icon}
      </span>
      {onOpen && (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-ink-500/80 bg-ink-950/70 text-parchment-200 opacity-0 transition hover:border-gold-600 hover:text-gold-200 focus-visible:opacity-100 group-hover/card:opacity-100"
          title="Abrir la zona"
          aria-label={`Abrir la zona ${zone.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="absolute inset-x-2 bottom-1.5">
        <div className="line-clamp-2 text-[13px] font-semibold leading-tight text-parchment-50 text-shadow">{zone.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-parchment-300">
          {levels > 1 && (
            <span className="inline-flex items-center gap-0.5">
              <Layers className="h-3 w-3" />
              {levels} pisos
            </span>
          )}
          {conflict && (
            <span className="inline-flex items-center gap-0.5 text-amber-300">
              <TriangleAlert className="h-3 w-3" />
              Posición repetida
            </span>
          )}
        </div>
      </div>
      {DIRECTIONS.map((dir) =>
        dirStatus[dir] === 'none' ? null : (
          <span
            key={dir}
            aria-hidden
            className={clsx(
              'absolute rounded-full',
              EDGE_CLASS[dir],
              dirStatus[dir] === 'match' ? 'bg-gold-400 shadow-[0_0_8px_rgba(233,192,99,0.8)]' : 'bg-amber-500',
            )}
          />
        ),
      )}
    </div>
  );
}

/** Compact tray row of an unplaced zone. */
export function ZoneTrayItem({ zone, conflict = false, ghost = false }: { zone: Zone; conflict?: boolean; ghost?: boolean }) {
  const type = PIN_TYPE_STYLES[zone.zoneType] ?? PIN_TYPE_STYLES.exterior;
  return (
    <div
      className={clsx(
        'flex select-none items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-800/80 p-1.5 pr-2.5 transition hover:border-gold-700 hover:bg-ink-700/80',
        ghost && 'opacity-30',
      )}
    >
      <ZoneThumb zone={zone} className="h-10 w-14 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-parchment-100">{zone.name}</div>
        <div className="flex items-center gap-1 text-[11px] text-parchment-400">
          <span>{type.icon}</span>
          <span className="truncate">{type.label}</span>
          {conflict && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-300" title="Su posición coincide con la de otra zona">
              <TriangleAlert className="h-3 w-3" />
              Repetida
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
