import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Eraser, Info, Maximize, MousePointer2, PanelRightClose, PanelRightOpen, Spline, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { Layer, Line, Text } from 'react-konva';
import {
  IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  newId,
  type Campaign,
  type OverviewLink,
  type OverviewMap,
  type OverviewPin,
  type Zone,
} from '@wailers/shared';
import { uploadFile } from '../../components/ui/FileUpload';
import { IconButton } from '../../components/ui/IconButton';
import { Kbd } from '../../components/ui/Kbd';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { useUiEvent } from '../../lib/uiEvents';
import { FONT_DISPLAY, FONT_SANS, LevelBackground, MapStage, type MapStageHandle, type MapPoint } from '../../map';
import { OverviewImageMenu } from './extras/overview/OverviewImageMenu';
import { OverviewInspector } from './extras/overview/OverviewInspector';
import { LinkSwatch, OverviewLegend } from './extras/overview/OverviewLegend';
import { OverviewMapLayer, type OverviewSelection, type OverviewTool } from './extras/overview/OverviewMapLayer';
import { OverviewZoneList } from './extras/overview/OverviewZoneList';
import {
  DND_ZONE,
  LINK_STYLE_ORDER,
  LINK_STYLES,
  OVERVIEW_MAX_SIZE,
  OVERVIEW_MIN_SIZE,
  clampToWorld,
  cloneOverview,
  pinLabel,
  readImageSize,
  readZoneDrag,
  type LinkStyle,
} from './extras/overview/overviewStyles';
import { createPointerStore, createValueStore, useValueStore, type ValueStore } from './extras/overview/valueStore';
import { useSyncedValue } from './extras/useSyncedValue';

export interface OverviewEditorProps {
  campaign: Campaign;
  zones: Zone[];
  onChange: (overview: OverviewMap) => void;
  onOpenZone: (zoneId: string) => void;
}

const MAP_BACKGROUND = '#1f1b16';

/** Drops links whose pins no longer exist. */
function normalize(overview: OverviewMap): OverviewMap {
  const ids = new Set(overview.pins.map((p) => p.id));
  overview.links = overview.links.filter((l) => ids.has(l.fromPinId) && ids.has(l.toPinId) && l.fromPinId !== l.toPinId);
  return overview;
}

function clampSize(n: number): number {
  return Math.round(Math.min(OVERVIEW_MAX_SIZE, Math.max(OVERVIEW_MIN_SIZE, n)));
}

/**
 * Campaign overview map ("mapa general"): an image with one pin per zone and routes between pins.
 * Every change is reported with onChange(nextOverview); the parent persists it.
 */
export function OverviewEditor({ campaign, zones, onChange, onOpenZone }: OverviewEditorProps) {
  const synced = useSyncedValue(campaign.overview, onChange);
  const overview = synced.value;
  const { latest: latestOverview, commit: commitOverview } = synced;
  const stageRef = useRef<MapStageHandle>(null);

  const [tool, setTool] = useState<OverviewTool>('select');
  const [linkStyle, setLinkStyle] = useState<LinkStyle>('road');
  const [selection, setSelection] = useState<OverviewSelection | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [placingZoneId, setPlacingZoneId] = useState<string | null>(null);
  const [dropKind, setDropKind] = useState<'zone' | 'file' | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const pointer = useMemo(() => createPointerStore(), []);
  const zoomStore = useMemo(() => createValueStore(100), []);

  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const pinsByZone = useMemo(() => {
    const map = new Map<string, OverviewPin>();
    for (const p of overview.pins) if (!map.has(p.zoneId)) map.set(p.zoneId, p);
    return map;
  }, [overview.pins]);
  const orphanPins = useMemo(() => overview.pins.filter((p) => !zonesById.has(p.zoneId)), [overview.pins, zonesById]);

  // Selection / connect source may vanish after external changes (undo, another tab).
  const validSelection =
    selection &&
    (selection.kind === 'pin'
      ? overview.pins.some((p) => p.id === selection.id)
      : overview.links.some((l) => l.id === selection.id))
      ? selection
      : null;
  const validConnectFrom = connectFrom && overview.pins.some((p) => p.id === connectFrom) ? connectFrom : null;
  const placingZone = placingZoneId ? zonesById.get(placingZoneId) ?? null : null;
  const selectedZoneId = validSelection?.kind === 'pin' ? overview.pins.find((p) => p.id === validSelection.id)?.zoneId ?? null : null;

  /** Immutable update: recipe mutates a deep copy which is then emitted. */
  const commit = useCallback((recipe: (draft: OverviewMap) => void) => {
    const draft = cloneOverview(latestOverview());
    recipe(draft);
    commitOverview(normalize(draft));
  }, [latestOverview, commitOverview]);

  // ---------------------------------------------------------------------------
  // Pins & links
  // ---------------------------------------------------------------------------

  const placePin = useCallback(
    (zoneId: string, at: MapPoint) => {
      const zone = zonesById.get(zoneId);
      if (!zone) return;
      const pos = clampToWorld(latestOverview(), at.x, at.y);
      let pinId = '';
      commit((o) => {
        const existing = o.pins.find((p) => p.zoneId === zoneId);
        if (existing) {
          existing.x = pos.x;
          existing.y = pos.y;
          pinId = existing.id;
        } else {
          pinId = newId('pin');
          o.pins.push({ id: pinId, zoneId, x: pos.x, y: pos.y, label: null, icon: null });
        }
      });
      setPlacingZoneId(null);
      setSelection({ kind: 'pin', id: pinId });
    },
    [commit, zonesById],
  );

  const removePins = useCallback(
    (pinIds: string[], announce = true) => {
      const ids = new Set(pinIds);
      const removedPins = latestOverview().pins.filter((p) => ids.has(p.id));
      if (removedPins.length === 0) return;
      const removedLinks = latestOverview().links.filter((l) => ids.has(l.fromPinId) || ids.has(l.toPinId));
      commit((o) => {
        o.pins = o.pins.filter((p) => !ids.has(p.id));
      });
      setSelection(null);
      setConnectFrom((c) => (c && ids.has(c) ? null : c));
      if (!announce) return;
      const first = removedPins[0]!;
      toast.info(removedPins.length === 1 ? `«${pinLabel(first, zonesById.get(first.zoneId))}» quitado del mapa` : 'Pines quitados del mapa', {
        action: {
          label: 'Deshacer',
          onClick: () =>
            commit((o) => {
              const present = new Set(o.pins.map((p) => p.id));
              const zonesPlaced = new Set(o.pins.map((p) => p.zoneId));
              for (const p of removedPins) {
                if (!present.has(p.id) && !zonesPlaced.has(p.zoneId)) o.pins.push({ ...p });
              }
              const linkIds = new Set(o.links.map((l) => l.id));
              for (const l of removedLinks) if (!linkIds.has(l.id)) o.links.push({ ...l });
            }),
        },
      });
    },
    [commit, zonesById],
  );

  const removeLink = useCallback(
    (linkId: string) => {
      const removed = latestOverview().links.find((l) => l.id === linkId);
      if (!removed) return;
      commit((o) => {
        o.links = o.links.filter((l) => l.id !== linkId);
      });
      setSelection((s) => (s?.kind === 'link' && s.id === linkId ? null : s));
      toast.info(`${LINK_STYLES[removed.style].label} eliminado`, {
        action: {
          label: 'Deshacer',
          onClick: () =>
            commit((o) => {
              if (!o.links.some((l) => l.id === removed.id)) o.links.push({ ...removed });
            }),
        },
      });
    },
    [commit],
  );

  const connectPins = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const existing = latestOverview().links.find(
        (l) => (l.fromPinId === fromId && l.toPinId === toId) || (l.fromPinId === toId && l.toPinId === fromId),
      );
      if (existing) {
        if (existing.style !== linkStyle) {
          commit((o) => {
            const l = o.links.find((x) => x.id === existing.id);
            if (l) l.style = linkStyle;
          });
          toast.info(`Ruta cambiada a «${LINK_STYLES[linkStyle].label}»`);
        } else {
          toast.info('Estos lugares ya están conectados');
        }
        return;
      }
      const link: OverviewLink = { id: newId('link'), fromPinId: fromId, toPinId: toId, style: linkStyle };
      commit((o) => {
        o.links.push(link);
      });
    },
    [commit, linkStyle],
  );

  // ---------------------------------------------------------------------------
  // Image
  // ---------------------------------------------------------------------------

  const fitSoon = () => requestAnimationFrame(() => stageRef.current?.fitToView());

  const setImage = useCallback(
    async (url: string | null) => {
      if (!url) {
        commit((o) => {
          o.imageUrl = null;
        });
        return;
      }
      setImageBusy(true);
      const size = await readImageSize(url);
      setImageBusy(false);
      let rescaled = false;
      commit((o) => {
        o.imageUrl = url;
        if (!size) return;
        const width = clampSize(size.width);
        const height = clampSize(size.height);
        if (width !== o.width || height !== o.height) {
          if (o.pins.length > 0 && o.width > 0 && o.height > 0) {
            const sx = width / o.width;
            const sy = height / o.height;
            for (const p of o.pins) {
              p.x = Math.round(p.x * sx);
              p.y = Math.round(p.y * sy);
            }
            rescaled = true;
          }
          o.width = width;
          o.height = height;
        }
      });
      if (!size) toast.warning('No se pudo leer el tamaño de la imagen: se mantiene el tamaño del lienzo');
      else if (rescaled) toast.info('Imagen actualizada: los pines se han reajustado al nuevo tamaño');
      else toast.success('Imagen del mapa general actualizada');
      fitSoon();
    },
    [commit],
  );

  const resizeCanvas = useCallback(
    (width: number, height: number) => {
      const w = clampSize(width);
      const h = clampSize(height);
      // Pins keep their position (values are emitted while typing, clamping here would be destructive).
      commit((o) => {
        o.width = w;
        o.height = h;
      });
    },
    [commit],
  );

  const bringPinsInside = useCallback(() => {
    commit((o) => {
      for (const p of o.pins) {
        const pos = clampToWorld(o, p.x, p.y);
        p.x = pos.x;
        p.y = pos.y;
      }
    });
  }, [commit]);

  const uploadDroppedImage = async (file: File) => {
    setImageBusy(true);
    try {
      const res = await uploadFile(file, { mimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_UPLOAD_BYTES });
      setImageBusy(false);
      await setImage(res.url);
    } catch (err) {
      setImageBusy(false);
      toast.fromError(err, 'No se pudo subir la imagen');
    }
  };

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  const chooseTool = (next: OverviewTool) => {
    setTool(next);
    setConnectFrom(null);
    setPlacingZoneId(null);
    pointer.set(null);
    if (next !== 'select') setSelection(null);
  };

  const cancelAll = () => {
    if (placingZoneId) setPlacingZoneId(null);
    else if (validConnectFrom) setConnectFrom(null);
    else if (validSelection) setSelection(null);
    else if (tool !== 'select') setTool('select');
  };

  const onPinClick = (pin: OverviewPin) => {
    if (tool === 'erase') {
      removePins([pin.id]);
      return;
    }
    if (tool === 'connect') {
      if (!validConnectFrom) setConnectFrom(pin.id);
      else if (validConnectFrom === pin.id) setConnectFrom(null);
      else {
        connectPins(validConnectFrom, pin.id);
        // Keep chaining from the last pin to draw multi-stop routes.
        setConnectFrom(pin.id);
      }
      return;
    }
    setSelection({ kind: 'pin', id: pin.id });
  };

  const onLinkClick = (link: OverviewLink) => {
    if (tool === 'erase') {
      removeLink(link.id);
      return;
    }
    if (tool === 'connect') setConnectFrom(null);
    setSelection({ kind: 'link', id: link.id });
  };

  const onBackgroundClick = (world: MapPoint) => {
    if (placingZoneId) {
      placePin(placingZoneId, world);
      return;
    }
    if (validConnectFrom) {
      setConnectFrom(null);
      return;
    }
    setSelection(null);
  };

  const locateZone = (zoneId: string) => {
    const pin = pinsByZone.get(zoneId);
    if (!pin) return;
    setSelection({ kind: 'pin', id: pin.id });
    const stage = stageRef.current;
    if (stage) stage.centerOn(pin.x, pin.y, Math.max(stage.getScale(), 0.6));
  };

  const togglePlacing = (zoneId: string) => {
    setConnectFrom(null);
    if (tool !== 'select') setTool('select');
    setPlacingZoneId((cur) => (cur === zoneId ? null : zoneId));
  };

  const needsPointer = !!placingZoneId || (tool === 'connect' && !!validConnectFrom);
  useEffect(() => {
    if (!needsPointer) pointer.set(null);
  }, [needsPointer, pointer]);

  useHotkeys({
    v: () => !isAnyModalOpen() && chooseTool('select'),
    c: () => !isAnyModalOpen() && chooseTool('connect'),
    e: () => !isAnyModalOpen() && chooseTool('erase'),
    'delete, backspace': () => {
      if (isAnyModalOpen() || !validSelection) return;
      if (validSelection.kind === 'pin') removePins([validSelection.id]);
      else removeLink(validSelection.id);
    },
    escape: () => !isAnyModalOpen() && cancelAll(),
  });

  useUiEvent('editor-fit', () => stageRef.current?.fitToView());

  // ---------------------------------------------------------------------------
  // HTML5 drops (zones from the list, image files)
  // ---------------------------------------------------------------------------

  const dragKindOf = (dt: DataTransfer | null): 'zone' | 'file' | null => {
    const types = dt ? Array.from(dt.types) : [];
    if (types.includes(DND_ZONE)) return 'zone';
    if (types.includes('Files')) return 'file';
    return null;
  };

  const onWrapperDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    const kind = dragKindOf(e.dataTransfer);
    if (kind !== dropKind) setDropKind(kind);
  };

  const onWrapperDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget;
    if (related instanceof Node && e.currentTarget.contains(related)) return;
    setDropKind(null);
  };

  const onMapDrop = (e: DragEvent, world: MapPoint) => {
    setDropKind(null);
    const payload = readZoneDrag(e.dataTransfer);
    if (payload) {
      placePin(payload.zoneId, world);
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) void uploadDroppedImage(file);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hint = (() => {
    if (placingZone) return <>Haz clic en el mapa para colocar «{placingZone.name}» · <Kbd>Esc</Kbd> cancela</>;
    if (tool === 'connect') {
      if (!validConnectFrom) return <>Conectar: haz clic en el pin de origen de la ruta</>;
      const from = overview.pins.find((p) => p.id === validConnectFrom);
      return (
        <>
          Elige el destino desde «{from ? pinLabel(from, zonesById.get(from.zoneId)) : ''}» · <Kbd>Esc</Kbd> termina
        </>
      );
    }
    if (tool === 'erase') return <>Haz clic en un pin o en una ruta para quitarlos</>;
    if (overview.pins.length === 0 && zones.length > 0) return <>Arrastra zonas desde la lista o pulsa «Colocar»</>;
    return null;
  })();

  const worldW = Math.max(1, overview.width);
  const worldH = Math.max(1, overview.height);

  return (
    <div className="flex h-full min-h-0 w-full bg-ink-950">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="relative z-20 flex h-12 shrink-0 items-center gap-1.5 border-b border-ink-600/80 bg-ink-900/95 px-2 sm:px-3">
          <div className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-950/60 p-1" role="toolbar" aria-label="Herramientas del mapa general">
            <ToolButton icon={<MousePointer2 />} label="Seleccionar" combo="V" active={tool === 'select'} onClick={() => chooseTool('select')} />
            <ToolButton icon={<Spline />} label="Conectar" combo="C" active={tool === 'connect'} onClick={() => chooseTool('connect')} />
            <ToolButton icon={<Eraser />} label="Eliminar" combo="E" active={tool === 'erase'} danger onClick={() => chooseTool('erase')} />
          </div>
          {tool === 'connect' && (
            <div className="flex animate-fade-in items-center gap-2 pl-1">
              <LinkSwatch style={linkStyle} />
              <Select<LinkStyle>
                size="sm"
                aria-label="Tipo de ruta"
                value={linkStyle}
                onChange={setLinkStyle}
                options={LINK_STYLE_ORDER.map((s) => ({ value: s, label: LINK_STYLES[s].label }))}
                className="w-32"
              />
            </div>
          )}
          <span className="divider-vertical" aria-hidden />
          <OverviewImageMenu
            overview={overview}
            busy={imageBusy}
            onImage={(url) => void setImage(url)}
            onResize={resizeCanvas}
            onBringPinsInside={bringPinsInside}
          />
          <span className="flex-1" />
          <span className="hidden whitespace-nowrap text-xs text-parchment-400 2xl:inline">
            {overview.pins.length} {overview.pins.length === 1 ? 'pin' : 'pines'} · {overview.links.length}{' '}
            {overview.links.length === 1 ? 'ruta' : 'rutas'}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => stageRef.current?.fitToView()} title="Ajustar vista al mapa">
            <Maximize className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Ajustar vista</span>
          </button>
          <IconButton
            icon={panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
            title={panelOpen ? 'Ocultar la lista de zonas' : 'Mostrar la lista de zonas'}
            size="sm"
            active={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
          />
        </div>

        {/* Map */}
        <div
          className="relative min-h-0 flex-1"
          onDragOver={onWrapperDragOver}
          onDragLeave={onWrapperDragLeave}
          onDrop={() => setDropKind(null)}
        >
          <MapStage
            ref={stageRef}
            worldWidth={worldW}
            worldHeight={worldH}
            initialFit
            fitKey={`overview:${campaign.id}`}
            panWithRightButton
            background="#0b0a08"
            onStageClick={() => {
              // Clicks outside the map sheet (the catch area handles clicks on it).
              if (placingZoneId) return;
              if (validConnectFrom) setConnectFrom(null);
              else setSelection(null);
            }}
            onStageMouseMove={(_e, world) => {
              if (needsPointer) pointer.set({ x: Math.round(world.x), y: Math.round(world.y) });
            }}
            onDrop={onMapDrop}
            onViewChange={(v) => zoomStore.set(Math.round(v.scale * 100))}
          >
            <LevelBackground level={{ background: { url: overview.imageUrl, width: worldW, height: worldH, color: MAP_BACKGROUND } }} />
            {!overview.imageUrl && <EmptyMapLayer width={worldW} height={worldH} />}
            <OverviewMapLayer
              overview={overview}
              zonesById={zonesById}
              tool={tool}
              selection={validSelection}
              connectFrom={validConnectFrom}
              linkStyle={linkStyle}
              placingZone={placingZone}
              pointer={pointer}
              onBackgroundClick={onBackgroundClick}
              onPinClick={onPinClick}
              onPinDblClick={(pin) => {
                if (zonesById.has(pin.zoneId)) onOpenZone(pin.zoneId);
              }}
              onPinDragEnd={(pin, x, y) => {
                const pos = clampToWorld(latestOverview(), x, y);
                commit((o) => {
                  const p = o.pins.find((q) => q.id === pin.id);
                  if (p) {
                    p.x = pos.x;
                    p.y = pos.y;
                  }
                });
              }}
              onLinkClick={onLinkClick}
            />
          </MapStage>

          {hint && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
              <div className="flex animate-slide-up items-center gap-2 rounded-full border border-gold-700/50 bg-ink-900/90 px-4 py-1.5 text-xs text-parchment-100 shadow-panel backdrop-blur">
                <Info className="h-3.5 w-3.5 shrink-0 text-gold-400" />
                <span>{hint}</span>
              </div>
            </div>
          )}

          {dropKind && (
            <div className="pointer-events-none absolute inset-2 z-10 flex animate-fade-in items-center justify-center rounded-xl border-2 border-dashed border-gold-400/80 bg-gold-500/5">
              <span className="flex items-center gap-2 rounded-full bg-ink-900/90 px-4 py-2 text-sm text-gold-200 shadow-panel">
                <Upload className="h-4 w-4" />
                {dropKind === 'zone' ? 'Suelta para colocar la zona aquí' : 'Suelta la imagen para usarla como mapa general'}
              </span>
            </div>
          )}

          <OverviewLegend className="absolute bottom-3 left-3 z-10 w-48" />

          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-xl border border-ink-600/80 bg-ink-900/90 p-1 shadow-panel backdrop-blur">
            <IconButton icon={<ZoomOut />} title="Alejar" size="sm" onClick={() => stageRef.current?.zoomBy(1 / 1.25)} />
            <ZoomLabel store={zoomStore} />
            <IconButton icon={<ZoomIn />} title="Acercar" size="sm" onClick={() => stageRef.current?.zoomBy(1.25)} />
            <IconButton icon={<Maximize />} title="Ajustar vista" size="sm" onClick={() => stageRef.current?.fitToView()} />
          </div>
        </div>
      </div>

      {panelOpen && (
        <aside className="flex w-80 shrink-0 animate-slide-in-right flex-col border-l border-ink-600/80 bg-ink-900/95">
          {validSelection && (
            <OverviewInspector
              selection={validSelection}
              overview={overview}
              zonesById={zonesById}
              onClose={() => setSelection(null)}
              onUpdatePin={(pinId, patch) =>
                commit((o) => {
                  const p = o.pins.find((q) => q.id === pinId);
                  if (p) Object.assign(p, patch);
                })
              }
              onRemovePin={(pinId) => removePins([pinId])}
              onUpdateLink={(linkId, style) =>
                commit((o) => {
                  const l = o.links.find((q) => q.id === linkId);
                  if (l) l.style = style;
                })
              }
              onRemoveLink={removeLink}
              onOpenZone={onOpenZone}
              onStartConnect={(pinId) => {
                setTool('connect');
                setPlacingZoneId(null);
                setSelection(null);
                setConnectFrom(pinId);
              }}
            />
          )}
          <OverviewZoneList
            zones={zones}
            pinsByZone={pinsByZone}
            placingZoneId={placingZoneId}
            selectedZoneId={selectedZoneId}
            orphanPinCount={orphanPins.length}
            onPlace={togglePlacing}
            onLocate={locateZone}
            onRemove={(zoneId) => {
              const pin = pinsByZone.get(zoneId);
              if (pin) removePins([pin.id]);
            }}
            onOpenZone={onOpenZone}
            onRemoveOrphans={() => removePins(orphanPins.map((p) => p.id), false)}
          />
        </aside>
      )}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  combo,
  active,
  danger = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  combo: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={`${label} (${combo})`}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition [&>svg]:h-4 [&>svg]:w-4',
        active
          ? danger
            ? 'bg-blood-600/25 text-blood-200 shadow-[0_0_0_1px_rgba(224,98,90,0.45)]'
            : 'bg-gradient-to-b from-ink-600 to-ink-700 text-gold-200 shadow-[inset_0_1px_0_rgba(243,234,214,0.08),0_0_0_1px_rgba(176,133,43,0.45)]'
          : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
      )}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
      <Kbd className="hidden xl:inline-flex">{combo}</Kbd>
    </button>
  );
}

function ZoomLabel({ store }: { store: ValueStore<number> }) {
  const pct = useValueStore(store);
  return <span className="w-12 text-center text-xs tabular-nums text-parchment-300">{pct}%</span>;
}

/** Decorative sheet shown while the overview has no image. */
function EmptyMapLayer({ width, height }: { width: number; height: number }) {
  const step = Math.max(50, Math.round(Math.min(width, height) / 12));
  const lines: number[][] = [];
  for (let x = step; x < width; x += step) lines.push([x, 0, x, height]);
  for (let y = step; y < height; y += step) lines.push([0, y, width, y]);
  const titleSize = Math.max(18, Math.round(width / 34));
  return (
    <Layer listening={false}>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} stroke="rgba(233,192,99,0.06)" strokeWidth={1.5} listening={false} perfectDrawEnabled={false} />
      ))}
      <Text
        x={0}
        y={height / 2 - titleSize * 1.6}
        width={width}
        align="center"
        text="Mapa general sin imagen"
        fontFamily={FONT_DISPLAY}
        fontStyle="bold"
        fontSize={titleSize}
        fill="rgba(243,213,138,0.45)"
      />
      <Text
        x={width * 0.15}
        y={height / 2 + titleSize * 0.1}
        width={width * 0.7}
        align="center"
        text="Sube una imagen con el botón «Imagen» de la barra o arrástrala aquí. Mientras tanto puedes colocar las zonas sobre este lienzo."
        fontFamily={FONT_SANS}
        fontSize={Math.round(titleSize * 0.5)}
        lineHeight={1.4}
        fill="rgba(205,185,143,0.5)"
      />
    </Layer>
  );
}
