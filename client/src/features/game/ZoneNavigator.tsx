import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, Layers, Search, Users } from 'lucide-react';
import { normalizeText } from '@wailers/shared';
import { useDisplayState, useSessionStore } from '../../stores/session';
import { Popover } from './map/Popover';
import { levelLabel, sortedLevels, ZONE_TYPE_ICONS, zoneTree, zoneTypeLabel } from './map/zoneTree';

/**
 * Zone / level switcher of the game top bar.
 * DM: any zone (tree with sub-zones) and any level. Players: current zone, levels where the party
 * stands, and other zones when allowed (canSeeOtherZones) or, with shared vision, the zones where other
 * heroes of the party stand.
 */
export function ZoneNavigator({ className }: { className?: string }) {
  const role = useSessionStore((s) => s.view?.role ?? null);
  const campaignName = useSessionStore((s) => s.campaign?.name ?? null);
  const zones = useSessionStore((s) => s.zones);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const setViewZone = useSessionStore((s) => s.setViewZone);
  const { state, effective } = useDisplayState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);

  const isDm = role === 'dm';
  const zone = viewZone ? zonesById[viewZone.zoneId] ?? null : null;
  const seeOtherZones = isDm || !!effective?.canSeeOtherZones;
  // Shared vision: players may look at the zones where other heroes of the party stand.
  const canPickZone = seeOtherZones || !!effective?.sharedVision;
  const allLevels = seeOtherZones;

  const heroCounts = useMemo(() => {
    const byZone = new Map<string, number>();
    const byLevel = new Map<string, number>();
    if (state) {
      for (const t of Object.values(state.tokens)) {
        if (t.kind !== 'hero') continue;
        byZone.set(t.zoneId, (byZone.get(t.zoneId) ?? 0) + 1);
        const key = `${t.zoneId}:${t.levelId}`;
        byLevel.set(key, (byLevel.get(key) ?? 0) + 1);
      }
    }
    return { byZone, byLevel };
  }, [state]);

  const currentZoneId = viewZone?.zoneId ?? null;
  const pickable = useMemo(
    () => (seeOtherZones ? zones : zones.filter((z) => z.id === currentZoneId || (heroCounts.byZone.get(z.id) ?? 0) > 0)),
    [seeOtherZones, zones, currentZoneId, heroCounts],
  );

  const tree = useMemo(() => {
    const items = zoneTree(pickable);
    const q = normalizeText(query.trim());
    if (!q) return items;
    return items.filter(({ zone: z }) => normalizeText(z.name).includes(q));
  }, [pickable, query]);

  if (!zone || !viewZone) {
    return (
      <span className={clsx('truncate font-display text-sm tracking-wide text-parchment-300', className)}>
        {isDm ? 'Sin zona' : campaignName ?? 'Explorando…'}
      </span>
    );
  }

  const levels = sortedLevels(zone.levels).filter(
    (l) => allLevels || l.id === viewZone.levelId || (heroCounts.byLevel.get(`${zone.id}:${l.id}`) ?? 0) > 0,
  );
  const TypeIcon = ZONE_TYPE_ICONS[zone.zoneType] ?? Layers;

  const zoneLabel = (
    <>
      <TypeIcon className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
      <span className="min-w-0 truncate font-display text-sm font-semibold tracking-wide text-parchment-50">{zone.name}</span>
    </>
  );

  return (
    <div className={clsx('flex min-w-0 items-center gap-2', className)}>
      {canPickZone && pickable.length > 1 ? (
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Cambiar de zona"
          className={clsx(
            'flex min-w-0 max-w-[16rem] items-center gap-2 rounded-lg border px-2.5 py-1.5 transition',
            open ? 'border-gold-600/70 bg-ink-700' : 'border-ink-500 bg-ink-800/80 hover:border-gold-700 hover:bg-ink-700',
          )}
        >
          {zoneLabel}
          <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 text-parchment-400 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      ) : (
        <div className="flex min-w-0 max-w-[16rem] items-center gap-2 px-1" title={zoneTypeLabel(zone.zoneType)}>
          {zoneLabel}
        </div>
      )}

      {levels.length > 1 && (
        <div
          role="tablist"
          aria-label="Niveles de la zona"
          className="no-scrollbar flex max-w-[22rem] items-center gap-0.5 overflow-x-auto rounded-lg border border-ink-600 bg-ink-950/60 p-0.5"
        >
          {levels.map((l) => {
            const active = l.id === viewZone.levelId;
            const heroes = heroCounts.byLevel.get(`${zone.id}:${l.id}`) ?? 0;
            return (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setViewZone(zone.id, l.id)}
                title={`${levelLabel(l)}${heroes > 0 ? ` · ${heroes} ${heroes === 1 ? 'héroe' : 'héroes'}` : ''}`}
                className={clsx(
                  'relative flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition',
                  active
                    ? 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[0_0_0_1px_rgba(176,133,43,0.45)]'
                    : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
                )}
              >
                {levelLabel(l)}
                {heroes > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={300}>
        {pickable.length > 6 && (
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-parchment-400" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar zona…"
              className="input input-sm pl-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tree[0]) {
                  setViewZone(tree[0].zone.id);
                  setOpen(false);
                  setQuery('');
                }
              }}
            />
          </div>
        )}
        <ul role="listbox" aria-label="Zonas" className="flex flex-col gap-0.5">
          {tree.length === 0 && <li className="px-3 py-4 text-center text-xs text-parchment-400">Ninguna zona coincide</li>}
          {tree.map(({ zone: z, depth }) => {
            const Icon = ZONE_TYPE_ICONS[z.zoneType] ?? Layers;
            const current = z.id === zone.id;
            const heroes = heroCounts.byZone.get(z.id) ?? 0;
            return (
              <li key={z.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={current}
                  onClick={() => {
                    setViewZone(z.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition',
                    current ? 'bg-gold-500/10 text-gold-200' : 'text-parchment-100 hover:bg-ink-700',
                  )}
                  style={{ paddingLeft: 8 + depth * 16 }}
                  title={`${zoneTypeLabel(z.zoneType)}${z.levels.length > 1 ? ` · ${z.levels.length} niveles` : ''}`}
                >
                  <Icon className={clsx('h-4 w-4 shrink-0', current ? 'text-gold-400' : 'text-parchment-400')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{z.name}</span>
                  {z.levels.length > 1 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-parchment-400" title={`${z.levels.length} niveles`}>
                      <Layers className="h-3 w-3" aria-hidden />
                      {z.levels.length}
                    </span>
                  )}
                  {heroes > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-emerald-300" title="Héroes en esta zona">
                      <Users className="h-3 w-3" aria-hidden />
                      {heroes}
                    </span>
                  )}
                  {current && <Check className="h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}
