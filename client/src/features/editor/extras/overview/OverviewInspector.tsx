import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ExternalLink, Route, Spline, Trash2, X } from 'lucide-react';
import type { OverviewLink, OverviewMap, OverviewPin, Zone } from '@wailers/shared';
import { Button } from '../../../../components/ui/Button';
import { IconButton } from '../../../../components/ui/IconButton';
import { TextInput } from '../../../../components/ui/TextInput';
import { LinkSwatch } from './OverviewLegend';
import type { OverviewSelection } from './OverviewMapLayer';
import { LINK_STYLE_ORDER, LINK_STYLES, PIN_ICON_CHOICES, pinLabel, pinStyleFor, type LinkStyle } from './overviewStyles';

export interface OverviewInspectorProps {
  selection: OverviewSelection;
  overview: OverviewMap;
  zonesById: Map<string, Zone>;
  onUpdatePin: (pinId: string, patch: Partial<Pick<OverviewPin, 'label' | 'icon'>>) => void;
  onRemovePin: (pinId: string) => void;
  onUpdateLink: (linkId: string, style: LinkStyle) => void;
  onRemoveLink: (linkId: string) => void;
  onOpenZone: (zoneId: string) => void;
  onStartConnect: (pinId: string) => void;
  onClose: () => void;
}

/** Properties of the selected pin or route. */
export function OverviewInspector(props: OverviewInspectorProps) {
  const { selection, overview, onClose } = props;
  const pin = selection.kind === 'pin' ? overview.pins.find((p) => p.id === selection.id) : undefined;
  const link = selection.kind === 'link' ? overview.links.find((l) => l.id === selection.id) : undefined;
  if (!pin && !link) return null;
  return (
    <div className="shrink-0 animate-fade-in border-b border-ink-600/70 bg-ink-950/30">
      <div className="panel-header">
        <span className="flex items-center gap-2">
          {pin ? 'Pin seleccionado' : 'Ruta seleccionada'}
        </span>
        <IconButton icon={<X />} title="Deseleccionar (Esc)" size="xs" onClick={onClose} />
      </div>
      <div className="space-y-3 px-4 py-3">
        {pin && <PinInspector pin={pin} {...props} />}
        {link && <LinkInspector link={link} {...props} />}
      </div>
    </div>
  );
}

function PinInspector({
  pin,
  zonesById,
  onUpdatePin,
  onRemovePin,
  onOpenZone,
  onStartConnect,
}: OverviewInspectorProps & { pin: OverviewPin }) {
  const zone = zonesById.get(pin.zoneId);
  const style = pinStyleFor(zone);
  const [label, setLabel] = useState(pin.label ?? '');
  const [customIcon, setCustomIcon] = useState('');

  useEffect(() => {
    setLabel(pin.label ?? '');
    setCustomIcon('');
  }, [pin.id, pin.label]);

  const currentIcon = pin.icon?.trim() || null;

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg"
          style={{ borderColor: `${style.color}99`, background: `${style.color}26` }}
        >
          {currentIcon ?? style.icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-parchment-50">{pinLabel(pin, zone)}</div>
          <div className="truncate text-[11px] text-parchment-400">
            {zone ? `${style.label} · ${zone.name}` : 'La zona de este pin ya no existe'}
          </div>
        </div>
      </div>

      <TextInput
        size="sm"
        label="Etiqueta en el mapa"
        value={label}
        placeholder={zone?.name ?? 'Etiqueta'}
        maxLength={60}
        hint="Vacía = nombre de la zona"
        onValueChange={(v) => {
          setLabel(v);
          onUpdatePin(pin.id, { label: v.trim() ? v : null });
        }}
      />

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">Icono</span>
          <button
            type="button"
            className={clsx('text-[11px] transition', currentIcon ? 'text-parchment-400 hover:text-gold-300' : 'text-gold-300')}
            onClick={() => onUpdatePin(pin.id, { icon: null })}
          >
            Por defecto ({style.icon})
          </button>
        </div>
        <div className="grid grid-cols-10 gap-0.5 rounded-lg border border-ink-600 bg-ink-950/50 p-1">
          {PIN_ICON_CHOICES.map((icon) => (
            <button
              key={icon}
              type="button"
              title={icon}
              onClick={() => onUpdatePin(pin.id, { icon })}
              className={clsx(
                'flex aspect-square items-center justify-center rounded text-base transition hover:bg-ink-700',
                currentIcon === icon && 'bg-gold-500/20 ring-1 ring-gold-500/70',
              )}
            >
              {icon}
            </button>
          ))}
        </div>
        <form
          className="mt-1.5 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const value = customIcon.trim();
            if (!value) return;
            onUpdatePin(pin.id, { icon: Array.from(value).slice(0, 4).join('') });
            setCustomIcon('');
          }}
        >
          <input
            value={customIcon}
            onChange={(e) => setCustomIcon(e.target.value)}
            placeholder="Otro emoji…"
            aria-label="Otro emoji para el pin"
            className="input input-sm flex-1"
            maxLength={8}
          />
          <Button size="sm" type="submit" disabled={!customIcon.trim()}>
            Usar
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {zone && (
          <Button size="sm" variant="primary" icon={<ExternalLink />} onClick={() => onOpenZone(zone.id)}>
            Abrir zona
          </Button>
        )}
        <Button size="sm" icon={<Spline />} onClick={() => onStartConnect(pin.id)} title="Trazar una ruta desde este pin">
          Conectar
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 />} className="text-blood-300 hover:text-blood-200" onClick={() => onRemovePin(pin.id)}>
          Quitar
        </Button>
      </div>
    </>
  );
}

function LinkInspector({
  link,
  overview,
  zonesById,
  onUpdateLink,
  onRemoveLink,
}: OverviewInspectorProps & { link: OverviewLink }) {
  const from = overview.pins.find((p) => p.id === link.fromPinId);
  const to = overview.pins.find((p) => p.id === link.toPinId);
  const fromName = from ? pinLabel(from, zonesById.get(from.zoneId)) : '—';
  const toName = to ? pinLabel(to, zonesById.get(to.zoneId)) : '—';
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-parchment-100">
        <Route className="h-4 w-4 shrink-0 text-gold-400" />
        <span className="min-w-0 truncate">
          {fromName} <span className="text-parchment-400">↔</span> {toName}
        </span>
      </div>
      <div role="radiogroup" aria-label="Tipo de ruta" className="space-y-1">
        {LINK_STYLE_ORDER.map((style) => {
          const active = link.style === style;
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onUpdateLink(link.id, style)}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-sm transition',
                active ? 'border-gold-600/70 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-parchment-200 hover:border-ink-400 hover:bg-ink-800',
              )}
            >
              <LinkSwatch style={style} width={40} />
              <span className="flex-1">
                <span className="block font-medium">{LINK_STYLES[style].label}</span>
                <span className="block text-[11px] text-parchment-400">{LINK_STYLES[style].description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <Button size="sm" variant="ghost" icon={<Trash2 />} className="text-blood-300 hover:text-blood-200" onClick={() => onRemoveLink(link.id)}>
        Eliminar ruta
      </Button>
    </>
  );
}
