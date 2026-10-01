import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { BookOpen, Check, Image as ImageIcon, Map as MapIcon, MapPinned, Presentation, Users } from 'lucide-react';
import type { EntryKind, LibraryEntry, Projection, ProjectionKind } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { EmptyState } from '../../components/ui/EmptyState';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { Modal } from '../../components/ui/Modal';
import { Select, type SelectOption } from '../../components/ui/Select';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { LibraryBrowser } from '../library/LibraryBrowser';
import { send } from './map/actions';
import { OverviewView } from './map/OverviewView';
import { usePartyMarkers } from './map/ProjectionCard';
import { entryDetails, entryKindLabel, entrySnapshot } from './map/projection';
import { findLevel, levelLabel, sortedLevels, zoneTree } from './map/zoneTree';

export interface ShowToPlayersDialogProps {
  open: boolean;
  onClose: () => void;
}

const LIBRARY_KINDS: EntryKind[] = ['creature', 'item', 'spell', 'hero'];

const TABS: TabItem<ProjectionKind>[] = [
  { id: 'zone', label: 'Zona', icon: <MapIcon /> },
  { id: 'image', label: 'Imagen', icon: <ImageIcon /> },
  { id: 'entry', label: 'Biblioteca', icon: <BookOpen /> },
  { id: 'overview', label: 'Mapa general', icon: <MapPinned /> },
];

/** DM: show a zone, an image, a library entry or the overview map to every player or to some of them. */
export function ShowToPlayersDialog({ open, onClose }: ShowToPlayersDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<Presentation />}
      title="Mostrar a jugadores"
      subtitle="Lo verán en una tarjeta grande que pueden minimizar. Nada cambia en la partida."
      bodyClassName="p-0"
    >
      {open && <ShowForm onClose={onClose} />}
    </Modal>
  );
}

function ShowForm({ onClose }: { onClose: () => void }) {
  const zones = useSessionStore((s) => s.zones);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const overview = useSessionStore((s) => s.overview);
  const campaign = useSessionStore((s) => s.campaign);
  const state = useSessionStore((s) => s.view?.state ?? null);
  const party = usePartyMarkers();

  const [tab, setTab] = useState<ProjectionKind>('zone');
  const [zoneId, setZoneId] = useState<string>(() => viewZone?.zoneId ?? zones[0]?.id ?? '');
  const [levelId, setLevelId] = useState<string>(() => viewZone?.levelId ?? zones[0]?.defaultLevelId ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [withDescription, setWithDescription] = useState(true);
  const [withDetails, setWithDetails] = useState(true);
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const players = useMemo(
    () =>
      state
        ? Object.values(state.players)
            .filter((p) => p.userId !== state.hostUserId)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        : [],
    [state],
  );

  const zone = zonesById[zoneId] ?? null;
  const level = findLevel(zone, levelId);
  const overviewUsable = !!overview && (!!overview.imageUrl || overview.pins.length > 0);

  const zoneOptions = useMemo<SelectOption<string>[]>(
    () => zoneTree(zones).map(({ zone: z, depth }) => ({ value: z.id, label: `${'   '.repeat(depth)}${depth > 0 ? '↳ ' : ''}${z.name}` })),
    [zones],
  );

  const defaultTitle = (() => {
    switch (tab) {
      case 'zone':
        return zone ? zone.name : '';
      case 'entry':
        return entry?.name ?? '';
      case 'overview':
        return 'Mapa general';
      default:
        return '';
    }
  })();
  const effectiveTitle = titleTouched ? title : defaultTitle;

  const targets: Projection['targets'] = everyone ? 'all' : picked.filter((id) => players.some((p) => p.userId === id));

  const problem = (() => {
    if (players.length === 0) return 'No hay jugadores en la partida';
    if (targets !== 'all' && targets.length === 0) return 'Elige al menos un jugador';
    switch (tab) {
      case 'zone':
        return zone && level ? null : 'Elige una zona';
      case 'image':
        return imageUrl ? null : 'Sube o pega una imagen';
      case 'entry':
        return entry ? null : 'Elige un elemento de la biblioteca';
      case 'overview':
        return overviewUsable ? null : 'La campaña no tiene mapa general';
    }
  })();

  const submit = async () => {
    if (problem) return;
    let projection: Omit<Projection, 'id'>;
    const base = { title: effectiveTitle.trim(), targets };
    if (tab === 'zone' && zone && level) {
      projection = { ...base, kind: 'zone', zoneId: zone.id, levelId: level.id, imageUrl: level.background.url, entry: null };
    } else if (tab === 'image') {
      projection = { ...base, kind: 'image', zoneId: null, levelId: null, imageUrl, entry: null };
    } else if (tab === 'entry' && entry) {
      const snapshot = entrySnapshot(entry, campaign?.rules ?? null, { description: withDescription, details: withDetails });
      projection = { ...base, kind: 'entry', zoneId: null, levelId: null, imageUrl: entry.imageUrl, entry: snapshot };
    } else {
      projection = { ...base, kind: 'overview', zoneId: null, levelId: null, imageUrl: overview?.imageUrl ?? null, entry: null };
    }
    setBusy(true);
    const ok = await send('show:open', { projection }, 'No se pudo mostrar a los jugadores');
    setBusy(false);
    if (!ok) return;
    const who = targets === 'all' ? 'todos los jugadores' : targets.map((id) => state?.players[id]?.name ?? id).join(', ');
    toast.success(`Mostrando «${projection.title || 'imagen'}» a ${who}`);
    onClose();
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-ink-600/70 bg-ink-900/95 px-5 pt-2 backdrop-blur">
        <Tabs items={TABS.map((t) => (t.id === 'overview' ? { ...t, disabled: !overviewUsable, title: overviewUsable ? undefined : 'La campaña no tiene mapa general' } : t))} value={tab} onChange={setTab} className="border-b-0" />
      </div>

      <div className="space-y-4 px-5 py-4">
        {tab === 'zone' && (
          <div className="space-y-3">
            {zones.length === 0 ? (
              <EmptyState compact icon={<MapIcon />} title="La campaña no tiene zonas" />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Zona"
                    value={zone ? zone.id : ''}
                    options={zone ? zoneOptions : [{ value: '', label: 'Elige una zona', disabled: true }, ...zoneOptions]}
                    onChange={(id) => {
                      const z = zonesById[id];
                      setZoneId(id);
                      setLevelId(z?.defaultLevelId ?? '');
                    }}
                  />
                  {zone && zone.levels.length > 1 && (
                    <Select
                      label="Nivel"
                      value={level?.id ?? ''}
                      options={sortedLevels(zone.levels).map((l) => ({ value: l.id, label: levelLabel(l) }))}
                      onChange={setLevelId}
                    />
                  )}
                </div>
                <Preview>
                  {level?.background.url ? (
                    <img src={level.background.url} alt="" className="h-full w-full object-contain" draggable={false} />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-parchment-300" style={{ background: level?.background.color ?? '#1c1915' }}>
                      <MapIcon className="h-8 w-8 text-gold-400/80" aria-hidden />
                      <span className="text-xs">Este nivel no tiene imagen de fondo: verán su color y el título.</span>
                    </div>
                  )}
                </Preview>
                <p className="text-xs text-parchment-400">Se muestra la imagen del mapa, sin fichas, notas ni elementos ocultos.</p>
              </>
            )}
          </div>
        )}

        {tab === 'image' && (
          <ImageUpload label="Imagen" hint="Arrastra una imagen, haz clic para elegirla o pega una URL." value={imageUrl} onChange={(url) => setImageUrl(url)} aspect="video" fit="contain" />
        )}

        {tab === 'entry' && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="h-[22rem] overflow-hidden rounded-xl border border-ink-600/80 bg-ink-950/40">
              <LibraryBrowser
                kinds={LIBRARY_KINDS}
                compact
                campaignId={campaign?.id}
                onPick={(e) => {
                  setEntry(e);
                  setWithDetails(e.kind !== 'creature');
                }}
                pickLabel="Elegir"
              />
            </div>
            <div className="space-y-3">
              {entry ? (
                <div className="space-y-3 rounded-xl border border-gold-700/50 bg-ink-800/50 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={entry.name} imageUrl={entry.imageUrl} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-gold-100">{entry.name}</p>
                      <Badge size="xs" tone="gold">
                        {entryKindLabel(entry.kind)}
                      </Badge>
                    </div>
                  </div>
                  <Checkbox size="sm" checked={withDescription} onChange={setWithDescription} label="Incluir la descripción" />
                  <Checkbox
                    size="sm"
                    checked={withDetails}
                    onChange={setWithDetails}
                    label="Incluir los datos clave"
                    description={
                      entryDetails(entry, campaign?.rules ?? null)
                        .slice(0, 4)
                        .map((d) => d.label)
                        .join(', ') || 'Sin datos destacados'
                    }
                  />
                  {entry.kind === 'creature' && withDetails && (
                    <p className="text-[11px] leading-snug text-gold-300/90">Ojo: los jugadores verán sus PV, CA y resistencias.</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ink-500 p-4 text-center text-xs text-parchment-400">
                  Elige un enemigo, objeto, hechizo o héroe con «Elegir» o doble clic.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'overview' &&
          (overview && overviewUsable ? (
            <Preview tall>
              <OverviewView overview={overview} zonesById={zonesById} party={party} />
            </Preview>
          ) : (
            <EmptyState compact icon={<MapPinned />} title="Sin mapa general" description="Créalo en el editor de la campaña." />
          ))}

        <div className="divider" />

        <TextInput
          label="Título"
          value={effectiveTitle}
          onValueChange={(v) => {
            setTitle(v);
            setTitleTouched(true);
          }}
          placeholder={tab === 'image' ? 'Ej.: Un mensaje en la pared' : 'Título de la proyección'}
          maxLength={160}
        />

        <div>
          <span className="label">Destinatarios</span>
          {players.length === 0 ? (
            <p className="text-xs text-parchment-400">Todavía no hay jugadores en la partida.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <TargetChip active={everyone} onClick={() => setEveryone(true)} icon={<Users className="h-3.5 w-3.5" aria-hidden />}>
                Todos
              </TargetChip>
              {players.map((p) => {
                const active = !everyone && picked.includes(p.userId);
                return (
                  <TargetChip
                    key={p.userId}
                    active={active}
                    onClick={() => {
                      if (everyone) {
                        setEveryone(false);
                        setPicked([p.userId]);
                        return;
                      }
                      setPicked((list) => (list.includes(p.userId) ? list.filter((id) => id !== p.userId) : [...list, p.userId]));
                    }}
                    icon={<span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />}
                  >
                    {p.name}
                    {!p.connected && <span className="text-parchment-400"> (desconectado)</span>}
                  </TargetChip>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-ink-600/70 bg-ink-950/90 px-5 py-3 backdrop-blur">
        {problem && <span className="mr-auto text-xs text-parchment-400">{problem}</span>}
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="primary" icon={<Presentation />} loading={busy} disabled={!!problem} onClick={() => void submit()}>
          Mostrar
        </Button>
      </div>
    </div>
  );
}

function Preview({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return (
    <div className={clsx('overflow-hidden rounded-xl border border-ink-600/80 bg-ink-950', tall ? 'h-[22rem]' : 'aspect-video max-h-[18rem] w-full')}>{children}</div>
  );
}

function TargetChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
        active ? 'border-gold-500/80 bg-gold-500/15 text-gold-100 shadow-glow-gold' : 'border-ink-500 bg-ink-800/70 text-parchment-200 hover:border-gold-700 hover:text-parchment-50',
      )}
    >
      {active ? <Check className="h-3.5 w-3.5 text-gold-300" aria-hidden /> : icon}
      {children}
    </button>
  );
}
