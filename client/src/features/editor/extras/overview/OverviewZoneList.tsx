import { useMemo, type DragEvent } from 'react';
import clsx from 'clsx';
import { CornerDownRight, Crosshair, GripVertical, MapPin, MapPinOff, MousePointerClick, X } from 'lucide-react';
import type { OverviewPin, Zone } from '@wailers/shared';
import { Button } from '../../../../components/ui/Button';
import { IconButton } from '../../../../components/ui/IconButton';
import { DND_ZONE, PIN_TYPE_STYLES, type ZoneDragPayload } from './overviewStyles';

export interface OverviewZoneListProps {
  zones: Zone[];
  pinsByZone: Map<string, OverviewPin>;
  placingZoneId: string | null;
  selectedZoneId: string | null;
  orphanPinCount: number;
  onPlace: (zoneId: string) => void;
  onLocate: (zoneId: string) => void;
  onRemove: (zoneId: string) => void;
  onOpenZone: (zoneId: string) => void;
  onRemoveOrphans: () => void;
}

interface Row {
  zone: Zone;
  depth: number;
}

/** Top-level zones in slide order, each followed by its sub-zones (any depth). */
function buildRows(zones: Zone[]): Row[] {
  const ids = new Set(zones.map((z) => z.id));
  const children = new Map<string | null, Zone[]>();
  for (const z of zones) {
    const parent = z.parentZoneId && ids.has(z.parentZoneId) ? z.parentZoneId : null;
    const list = children.get(parent) ?? [];
    list.push(z);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order);
  const rows: Row[] = [];
  const seen = new Set<string>();
  const visit = (z: Zone, depth: number) => {
    if (seen.has(z.id)) return;
    seen.add(z.id);
    rows.push({ zone: z, depth });
    for (const child of children.get(z.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  return rows;
}

/** Side list of the campaign zones with their placement on the overview map. */
export function OverviewZoneList({
  zones,
  pinsByZone,
  placingZoneId,
  selectedZoneId,
  orphanPinCount,
  onPlace,
  onLocate,
  onRemove,
  onOpenZone,
  onRemoveOrphans,
}: OverviewZoneListProps) {
  const rows = useMemo(() => buildRows(zones), [zones]);
  const placedCount = rows.filter((r) => pinsByZone.has(r.zone.id)).length;

  const onDragStart = (e: DragEvent<HTMLLIElement>, zone: Zone) => {
    const payload: ZoneDragPayload = { zoneId: zone.id };
    e.dataTransfer.setData(DND_ZONE, JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', zone.name);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="panel-header shrink-0 rounded-none">
        <span>Zonas</span>
        <span className="font-sans text-[11px] font-medium normal-case tracking-normal text-parchment-300">
          {placedCount}/{rows.length} en el mapa
        </span>
      </div>
      <p className="shrink-0 px-4 pt-2.5 text-xs leading-snug text-parchment-400">
        Arrastra una zona al mapa o pulsa <span className="text-parchment-200">Colocar</span>. Doble clic en un pin abre su zona.
      </p>
      {orphanPinCount > 0 && (
        <div className="mx-3 mt-2.5 flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
          <MapPinOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {orphanPinCount === 1 ? 'Un pin apunta' : `${orphanPinCount} pines apuntan`} a zonas eliminadas.
          </span>
          <Button size="sm" variant="ghost" onClick={onRemoveOrphans} className="text-amber-100">
            Quitar
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <MapPin className="h-8 w-8 text-gold-600" />
          <p className="font-display text-sm text-parchment-100">Esta campaña aún no tiene zonas</p>
          <p className="text-xs text-parchment-400">Crea zonas en el panel de diapositivas y colócalas aquí sobre el mapa general.</p>
        </div>
      ) : (
        <ul className="scroll-thin mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {rows.map(({ zone, depth }) => {
            const pin = pinsByZone.get(zone.id);
            const placing = placingZoneId === zone.id;
            const selected = selectedZoneId === zone.id;
            const type = PIN_TYPE_STYLES[zone.zoneType] ?? PIN_TYPE_STYLES.exterior;
            return (
              <li
                key={zone.id}
                draggable
                onDragStart={(e) => onDragStart(e, zone)}
                onDoubleClick={() => onOpenZone(zone.id)}
                onClick={() => {
                  if (pin) onLocate(zone.id);
                }}
                title={pin ? 'Clic: ver en el mapa · Doble clic: abrir la zona' : 'Arrástrala al mapa · Doble clic: abrir la zona'}
                className={clsx(
                  'group flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 transition active:cursor-grabbing',
                  placing
                    ? 'border-gold-500/70 bg-gold-500/10 shadow-glow-gold'
                    : selected
                      ? 'border-gold-700/60 bg-ink-700/70'
                      : 'border-transparent hover:border-ink-500 hover:bg-ink-800/80',
                )}
                style={{ marginLeft: depth * 14 }}
              >
                {depth > 0 ? (
                  <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                ) : (
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-ink-400 transition group-hover:text-parchment-400" aria-hidden />
                )}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm"
                  style={{ borderColor: `${type.color}88`, background: `${type.color}22` }}
                  aria-hidden
                >
                  {pin?.icon?.trim() || type.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-parchment-100">{zone.name}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-parchment-400">
                    <span className="truncate">{type.label}</span>
                    <span aria-hidden>·</span>
                    {pin ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        En el mapa
                      </span>
                    ) : placing ? (
                      <span className="inline-flex items-center gap-1 text-gold-300">
                        <MousePointerClick className="h-3 w-3" />
                        Haz clic en el mapa
                      </span>
                    ) : (
                      <span>Sin colocar</span>
                    )}
                  </span>
                </span>
                {pin ? (
                  <span className="flex shrink-0 items-center opacity-70 transition group-hover:opacity-100">
                    <IconButton
                      icon={<Crosshair />}
                      title="Ver en el mapa"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLocate(zone.id);
                      }}
                    />
                    <IconButton
                      icon={<X />}
                      title="Quitar del mapa"
                      size="xs"
                      variant="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(zone.id);
                      }}
                    />
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={placing ? 'primary' : 'secondary'}
                    className="shrink-0 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlace(zone.id);
                    }}
                  >
                    {placing ? 'Cancelar' : 'Colocar'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
