import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ImageOff, Map as MapIcon, Minimize2, X } from 'lucide-react';
import type { Projection } from '@wailers/shared';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useDisplayState, useSessionStore } from '../../../stores/session';
import { OverviewView, type PartyMarker } from './OverviewView';
import { entryKindLabel } from './projection';
import { findLevel, levelLabel } from './zoneTree';

export interface ProjectionCardProps {
  projection: Projection;
  /** Small caps line above the title. */
  eyebrow: string;
  onMinimize?: () => void;
  onClose?: () => void;
  /** Extra footer actions (DM). */
  actions?: ReactNode;
}

function FramedImage({ url, alt, fit = 'contain', className }: { url: string | null; alt: string; fit?: 'contain' | 'cover'; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(url ? 'loading' : 'error');
  useEffect(() => setState(url ? 'loading' : 'error'), [url]);
  if (!url || state === 'error') {
    return (
      <div className={clsx('flex flex-col items-center justify-center gap-2 bg-ink-950/70 text-parchment-400', className)}>
        <ImageOff className="h-8 w-8" aria-hidden />
        <span className="text-xs">{url ? 'No se pudo cargar la imagen' : 'Sin imagen'}</span>
      </div>
    );
  }
  return (
    <div className={clsx('relative overflow-hidden bg-ink-950/70', className)}>
      {state === 'loading' && <div className="skeleton absolute inset-0" aria-hidden />}
      <img
        src={url}
        alt={alt}
        draggable={false}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        className={clsx(
          'h-full w-full transition-opacity duration-500',
          fit === 'contain' ? 'object-contain' : 'object-cover',
          state === 'ok' ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

/** Image at its natural aspect ratio, as large as the card allows (zone backgrounds, handouts). */
function StageImage({ url, alt }: { url: string | null; alt: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(url ? 'loading' : 'error');
  useEffect(() => setState(url ? 'loading' : 'error'), [url]);
  if (!url || state === 'error') {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg bg-ink-950/70 text-parchment-400">
        <ImageOff className="h-8 w-8" aria-hidden />
        <span className="text-xs">{url ? 'No se pudo cargar la imagen' : 'Sin imagen'}</span>
      </div>
    );
  }
  return (
    <div className={clsx('relative flex items-center justify-center overflow-hidden rounded-lg bg-ink-950/70', state === 'loading' && 'min-h-[14rem]')}>
      {state === 'loading' && <div className="skeleton absolute inset-0" aria-hidden />}
      <img
        src={url}
        alt={alt}
        draggable={false}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        className={clsx(
          'block max-h-[min(64vh,44rem)] w-auto max-w-full object-contain transition-opacity duration-500',
          state === 'ok' ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

/** Party heroes grouped by zone (for overview markers). */
export function usePartyMarkers(): Map<string, PartyMarker[]> {
  const { state } = useDisplayState();
  return useMemo(() => {
    const out = new Map<string, PartyMarker[]>();
    if (!state) return out;
    for (const t of Object.values(state.tokens)) {
      if (t.kind !== 'hero') continue;
      const hero = t.heroId ? state.heroes[t.heroId] : undefined;
      const marker: PartyMarker = { id: t.id, name: hero?.name ?? t.name, color: t.color, imageUrl: hero?.imageUrl ?? t.imageUrl };
      out.set(t.zoneId, [...(out.get(t.zoneId) ?? []), marker]);
    }
    return out;
  }, [state]);
}

/** Big card with whatever the DM is showing (zone, image, library entry or the overview map). */
export function ProjectionCard({ projection, eyebrow, onMinimize, onClose, actions }: ProjectionCardProps) {
  const zonesById = useSessionStore((s) => s.zonesById);
  const overview = useSessionStore((s) => s.overview);
  const party = usePartyMarkers();

  let body: ReactNode;
  let subtitle: string | null = null;
  /** 'natural': sized by its image; 'fixed': needs a definite height (SVG map); 'entry': portrait + text. */
  let layout: 'natural' | 'fixed' | 'entry' = 'natural';

  if (projection.kind === 'zone') {
    const zone = projection.zoneId ? zonesById[projection.zoneId] ?? null : null;
    const level = zone ? findLevel(zone, projection.levelId) : null;
    const url = level?.background.url ?? projection.imageUrl;
    if (zone) {
      const parts = [zone.name !== projection.title ? zone.name : null, zone.levels.length > 1 && level ? levelLabel(level) : null].filter(Boolean);
      subtitle = parts.length > 0 ? parts.join(' · ') : null;
    }
    body = url ? (
      <StageImage url={url} alt={projection.title} />
    ) : (
      <div
        className="flex h-56 w-full flex-col items-center justify-center gap-3 rounded-lg text-parchment-300"
        style={{ background: level?.background.color ?? '#1c1915' }}
      >
        <MapIcon className="h-10 w-10 text-gold-400/80" aria-hidden />
        <span className="font-display text-lg tracking-wide">{zone?.name ?? projection.title}</span>
      </div>
    );
  } else if (projection.kind === 'image') {
    body = <StageImage url={projection.imageUrl} alt={projection.title || 'Imagen'} />;
  } else if (projection.kind === 'overview') {
    if (overview) {
      layout = 'fixed';
      body = (
        <div className="h-full w-full overflow-hidden rounded-lg border border-ink-600/70 bg-ink-950">
          <OverviewView overview={overview} zonesById={zonesById} party={party} />
        </div>
      );
    } else {
      body = <StageImage url={projection.imageUrl} alt={projection.title || 'Mapa general'} />;
    }
  } else {
    layout = 'entry';
    const entry = projection.entry;
    body = entry ? (
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative w-48 shrink-0 self-center sm:w-64 sm:self-start">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-b from-gold-400/40 via-gold-700/20 to-transparent blur-sm" aria-hidden />
          <FramedImage url={entry.imageUrl} alt={entry.name} fit="cover" className="relative aspect-[3/4] w-full rounded-xl border border-gold-600/60" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Badge tone="gold" size="sm">
            {entryKindLabel(entry.kind)}
          </Badge>
          {entry.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-parchment-100">{entry.description}</p>
          ) : (
            entry.details.length === 0 && <p className="text-sm italic text-parchment-400">Observad con atención…</p>
          )}
          {entry.details.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-ink-600/70 bg-ink-950/50 p-3 text-sm sm:grid-cols-2">
              {entry.details.map((d, i) => (
                <div key={`${d.label}-${i}`} className={clsx('min-w-0', d.value.length > 40 && 'sm:col-span-2')}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-400/90">{d.label}</dt>
                  <dd className="whitespace-pre-line text-parchment-100">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    ) : (
      <StageImage url={projection.imageUrl} alt={projection.title} />
    );
  }

  return (
    <div
      className={clsx(
        'panel relative flex max-h-full w-full animate-scale-in flex-col overflow-hidden border-gold-600/50 bg-ink-900/95 shadow-modal',
        layout === 'entry' ? 'max-w-3xl' : 'max-w-5xl',
      )}
      role="dialog"
      aria-label={projection.title || 'Proyección del DM'}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/80 to-transparent" />
      <header className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold-400/80">{eyebrow}</p>
          <h2 className="title-epic line-clamp-2 break-words text-2xl leading-tight xl:text-3xl">{projection.title || 'Sin título'}</h2>
          {subtitle && <p className="mt-0.5 truncate font-display text-sm tracking-wide text-parchment-300">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onMinimize && (
            <Button size="sm" variant="secondary" icon={<Minimize2 />} onClick={onMinimize}>
              Minimizar
            </Button>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" icon={<X />} onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </header>
      <div
        className={clsx(
          'min-h-0 shrink px-5',
          actions ? 'pb-3' : 'pb-5',
          layout === 'fixed' && 'h-[min(64vh,44rem)]',
          layout === 'natural' && 'scroll-thin overflow-y-auto',
          layout === 'entry' && 'scroll-thin max-h-[min(68vh,40rem)] overflow-y-auto',
        )}
      >
        {body}
      </div>
      {actions && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink-600/70 bg-ink-950/40 px-5 py-3">{actions}</footer>}
    </div>
  );
}
