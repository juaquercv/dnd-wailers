import { useMemo } from 'react';
import { MapPinned, Users } from 'lucide-react';
import { isOwnHeroToken, type OverviewPin } from '@wailers/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { useDisplayState, useSessionStore } from '../../stores/session';
import { LINK_STYLES } from '../editor/extras/overview/overviewStyles';
import { OverviewView } from './map/OverviewView';
import { usePartyMarkers } from './map/ProjectionCard';

export interface OverviewModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Campaign overview map: routes, zone pins and where the party is.
 * DM: clicking a pin opens that zone on the table. Players: read-only.
 */
export function OverviewModal({ open, onClose }: OverviewModalProps) {
  const campaignName = useSessionStore((s) => s.campaign?.name ?? null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<MapPinned />}
      title="Mapa general"
      subtitle={campaignName ?? undefined}
      bodyClassName="p-0"
    >
      {open && <OverviewBody onClose={onClose} />}
    </Modal>
  );
}

function OverviewBody({ onClose }: { onClose: () => void }) {
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? null);
  const overview = useSessionStore((s) => s.overview);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const setViewZone = useSessionStore((s) => s.setViewZone);
  const { state } = useDisplayState();
  const party = usePartyMarkers();

  const currentZoneId = useMemo(() => {
    if (isDm || !state || !meUserId) return viewZone?.zoneId ?? null;
    const own = Object.values(state.tokens).find((t) => isOwnHeroToken(state, t, meUserId));
    return own?.zoneId ?? viewZone?.zoneId ?? null;
  }, [isDm, state, meUserId, viewZone]);

  const partyRows = useMemo(
    () =>
      [...party.entries()]
        .map(([zoneId, heroes]) => ({ zoneId, name: zonesById[zoneId]?.name ?? 'Lugar desconocido', heroes }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [party, zonesById],
  );

  if (!overview || (!overview.imageUrl && overview.pins.length === 0)) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<MapPinned />}
          title="Aún no hay mapa general"
          description={isDm ? 'Dibuja el mapa general de la campaña en el editor (pestaña «Mapa general»).' : 'El DM todavía no ha preparado el mapa general.'}
        />
      </div>
    );
  }

  const onPin = (pin: OverviewPin) => {
    const zone = zonesById[pin.zoneId];
    if (!zone) {
      toast.warning('Esa zona ya no existe en la campaña');
      return;
    }
    setViewZone(zone.id);
    toast.info(`Mostrando ${zone.name}`);
    onClose();
  };

  const usedStyles = [...new Set(overview.links.map((l) => l.style))].filter((s) => isDm || s !== 'secret');

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="h-[min(70vh,46rem)] min-w-0 flex-1 bg-ink-950">
        <OverviewView
          overview={overview}
          zonesById={zonesById}
          party={party}
          currentZoneId={currentZoneId}
          onPinClick={isDm ? onPin : undefined}
          showSecret={isDm}
        />
      </div>
      <aside className="scroll-thin max-h-[min(70vh,46rem)] shrink-0 space-y-4 overflow-y-auto border-t border-ink-600/70 bg-ink-900/80 p-4 lg:w-64 lg:border-l lg:border-t-0">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-gold-300">
            <Users className="h-3.5 w-3.5" aria-hidden />
            El grupo
          </h3>
          {partyRows.length === 0 ? (
            <p className="text-xs text-parchment-400">Ningún héroe está en el mapa todavía.</p>
          ) : (
            <ul className="space-y-2">
              {partyRows.map((row) => (
                <li key={row.zoneId} className="rounded-lg border border-ink-600/70 bg-ink-800/50 px-2.5 py-2">
                  {isDm && zonesById[row.zoneId] ? (
                    <button
                      type="button"
                      className="truncate text-left text-sm font-semibold text-parchment-50 hover:text-gold-200"
                      onClick={() => {
                        setViewZone(row.zoneId);
                        onClose();
                      }}
                      title="Ir a esta zona"
                    >
                      {row.name}
                    </button>
                  ) : (
                    <p className="truncate text-sm font-semibold text-parchment-50">{row.name}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.heroes.map((h) => (
                      <span key={h.id} className="inline-flex items-center gap-1 rounded-full bg-ink-900/80 px-2 py-0.5 text-[11px] text-parchment-200">
                        <span className="h-2 w-2 rounded-full" style={{ background: h.color }} aria-hidden />
                        {h.name}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {usedStyles.length > 0 && (
          <section>
            <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-gold-300">Rutas</h3>
            <ul className="space-y-1.5">
              {usedStyles.map((s) => {
                const style = LINK_STYLES[s];
                return (
                  <li key={s} className="flex items-center gap-2 text-xs text-parchment-200">
                    <svg width="34" height="10" aria-hidden className="shrink-0">
                      <line x1="2" y1="5" x2="32" y2="5" stroke={style.casing} strokeWidth={style.width / 2 + 3} strokeLinecap="round" />
                      <line
                        x1="2"
                        y1="5"
                        x2="32"
                        y2="5"
                        stroke={style.color}
                        strokeWidth={style.width / 2 + 1}
                        strokeDasharray={style.dash ? style.dash.map((d) => d / 2).join(' ') : undefined}
                        strokeLinecap={style.lineCap}
                      />
                    </svg>
                    {style.label}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {isDm && <p className="text-[11px] leading-snug text-parchment-400">Haz clic en una chincheta para abrir esa zona en la mesa.</p>}
      </aside>
    </div>
  );
}
