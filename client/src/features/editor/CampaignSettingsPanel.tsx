import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Copy, Crosshair, Eye, Flag, Info, MapPin, Settings2, Skull, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Campaign, UpdateCampaignRequest, VisibilitySettings, Zone } from '@wailers/shared';
import { api } from '../../api/http';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { TagInput } from '../../components/ui/TagInput';
import { TextArea } from '../../components/ui/TextArea';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { formatDateTime, formatRelative, plural } from '../../lib/format';
import { useAuthStore } from '../../stores/auth';
import { useUsers } from '../../stores/users';
import { MagicModeBadge } from '../campaigns/magicModes';
import { VisibilityForm } from '../visibility/VisibilityForm';
import { useEditorStore } from './editorStore';
import { InfoNote, SettingsSection } from './extras/SettingsSection';
import { useSyncedValue } from './extras/useSyncedValue';

export interface CampaignSettingsPanelProps {
  campaign: Campaign;
  zones: Zone[];
  onChange: (patch: UpdateCampaignRequest) => void;
}

const NAME_MAX = 80;
const DESCRIPTION_MAX = 1000;

/** Complete settings with the defined fields of `patch` applied. */
function mergeVisibility(base: VisibilitySettings, patch: Partial<VisibilitySettings>): VisibilitySettings {
  const next: VisibilitySettings = { ...base };
  for (const key of Object.keys(patch) as (keyof VisibilitySettings)[]) {
    const value = patch[key];
    if (value !== undefined) (next as Record<keyof VisibilitySettings, unknown>)[key] = value;
  }
  return next;
}

/** General campaign settings: identity, cover, tags, spawn summary, default visibility and the danger zone. */
export function CampaignSettingsPanel({ campaign, zones, onChange }: CampaignSettingsPanelProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const { users } = useUsers();
  const owner = users.find((u) => u.id === campaign.ownerId) ?? null;
  const isOwner = me?.id === campaign.ownerId;
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Local mirrors: late autosave responses never overwrite newer edits.
  const nameSync = useSyncedValue(campaign.name, (v) => onChange({ name: v }));
  const description = useSyncedValue(campaign.description, (v) => onChange({ description: v }));
  const tags = useSyncedValue(campaign.tags, (v) => onChange({ tags: v }));
  const cover = useSyncedValue(campaign.coverUrl, (v) => onChange({ coverUrl: v }));
  const visibility = useSyncedValue(campaign.defaultVisibility, (v) => onChange({ defaultVisibility: v }));

  // The text being typed stays local while focused: the server trims names and an empty name is never sent.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? nameSync.value;
  const nameError = !name.trim() ? 'La campaña necesita un nombre' : undefined;

  const subZones = zones.filter((z) => z.parentZoneId !== null).length;

  const remove = async () => {
    const ok = await confirm({
      title: 'Eliminar campaña',
      message: (
        <>
          Se eliminará <strong className="text-parchment-100">«{campaign.name}»</strong> con sus {plural(zones.length, 'zona', 'zonas')},
          ruletas y partidas guardadas. Los elementos de la biblioteca compartida se conservan.
          <span className="mt-2 block font-medium text-blood-300">Esta acción no se puede deshacer.</span>
        </>
      ),
      confirmLabel: 'Eliminar para siempre',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.campaigns.remove(campaign.id);
      // Nothing left to autosave for a deleted campaign.
      useEditorStore.setState({ dirtyZoneIds: [], saveState: 'saved', saveError: null });
      toast.success(`«${campaign.name}» eliminada`);
      navigate('/campanas', { replace: true });
    } catch (err) {
      toast.fromError(err, 'No se pudo eliminar la campaña');
      setDeleting(false);
    }
  };

  const duplicate = async () => {
    setDuplicating(true);
    try {
      const copy = await api.campaigns.duplicate(campaign.id);
      toast.success('Campaña duplicada', {
        description: copy.name,
        action: { label: 'Abrir', onClick: () => navigate(`/campanas/${copy.id}/editor`) },
      });
    } catch (err) {
      toast.fromError(err, 'No se pudo duplicar la campaña');
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-16 pt-6 sm:px-6">
        <header>
          <h2 className="title-epic text-2xl">Ajustes de la campaña</h2>
          <p className="mt-1 text-sm text-parchment-300">Nombre, portada, punto de aparición y lo que verán los jugadores al empezar.</p>
        </header>

        <SettingsSection icon={<Settings2 />} title="General" description="Así aparece la campaña en la lista y al hostear una partida.">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-4">
              <TextInput
                label="Nombre"
                required
                value={name}
                maxLength={NAME_MAX}
                error={nameError}
                onFocus={() => setNameDraft(nameSync.latest())}
                onBlur={() => setNameDraft(null)}
                onValueChange={(v) => {
                  setNameDraft(v);
                  const trimmed = v.trim();
                  if (trimmed && trimmed !== nameSync.latest()) nameSync.commit(trimmed);
                }}
              />
              <TextArea
                label="Descripción"
                value={description.value}
                maxLength={DESCRIPTION_MAX}
                rows={4}
                autoResize
                maxRows={12}
                placeholder="El tono, el conflicto y dónde empieza la aventura…"
                onValueChange={description.commit}
                hint={`${description.value.length}/${DESCRIPTION_MAX}`}
              />
              <TagInput
                label="Etiquetas"
                value={tags.value}
                onChange={tags.commit}
                placeholder="terror, mazmorra, nivel 3-5…"
                hint="Ayudan a encontrar la campaña y a describir su estilo."
                maxTags={12}
              />
            </div>
            <div>
              <ImageUpload
                label="Portada"
                value={cover.value}
                onChange={(url) => cover.commit(url)}
                aspect="video"
                hint="Se muestra en la lista de campañas"
              />
              {!cover.value && campaign.overview.imageUrl && (
                <button
                  type="button"
                  className="mt-1 text-xs text-parchment-400 transition hover:text-gold-300"
                  onClick={() => cover.commit(campaign.overview.imageUrl)}
                >
                  Usar la imagen del mapa general
                </button>
              )}
            </div>
          </div>
        </SettingsSection>

        <SpawnSection campaign={campaign} zones={zones} onClear={() => onChange({ spawn: null })} />

        <SettingsSection
          icon={<Eye />}
          title="Visibilidad por defecto"
          description="Lo que podrán ver los jugadores al crear una partida nueva de esta campaña. Durante la partida el DM puede cambiarla en cualquier momento, también por jugador."
        >
          <VisibilityForm
            value={visibility.value}
            onChange={(patch: Partial<VisibilitySettings>) => visibility.commit(mergeVisibility(visibility.latest(), patch))}
          />
        </SettingsSection>

        <SettingsSection icon={<Info />} title="Información">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2.5">
              <dt className="sr-only">Creador</dt>
              <Avatar name={campaign.ownerName} color={owner?.color ?? null} size="sm" />
              <dd>
                <span className="block text-parchment-100">{campaign.ownerName}</span>
                <span className="block text-[11px] text-parchment-400">{isOwner ? 'Eres el creador' : 'Creador de la campaña'}</span>
              </dd>
            </div>
            <div className="flex items-center gap-2.5">
              <dt className="sr-only">Sistema de magia</dt>
              <dd>
                <MagicModeBadge mode={campaign.rules.magic.mode} manaName={campaign.rules.magic.manaName} size="md" />
              </dd>
            </div>
            <div className="flex items-center gap-2.5 text-parchment-300">
              <MapPin className="h-4 w-4 text-gold-400" />
              <dt className="sr-only">Zonas</dt>
              <dd>
                {plural(zones.length - subZones, 'zona', 'zonas')}
                {subZones > 0 && <span className="text-parchment-400"> · {plural(subZones, 'sub-zona', 'sub-zonas')}</span>}
              </dd>
            </div>
            <div className="flex items-center gap-2.5 text-parchment-300">
              <CalendarClock className="h-4 w-4 text-gold-400" />
              <dt className="sr-only">Fechas</dt>
              <dd>
                <span title={formatDateTime(campaign.updatedAt)}>Actualizada {formatRelative(campaign.updatedAt)}</span>
                <span className="block text-[11px] text-parchment-400">Creada el {formatDateTime(campaign.createdAt)}</span>
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Copy />} loading={duplicating} onClick={() => void duplicate()}>
              Duplicar campaña
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          tone="danger"
          icon={<Skull />}
          title="Zona de peligro"
          description="Acciones irreversibles. Piénsalo dos veces."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-parchment-100">Eliminar esta campaña</div>
              <div className="text-xs text-parchment-400">
                {isOwner
                  ? 'Borra sus zonas, ruletas y partidas guardadas. Los elementos de la biblioteca se conservan.'
                  : 'Solo el creador de la campaña puede eliminarla.'}
              </div>
            </div>
            <Button variant="danger" icon={<Trash2 />} disabled={!isOwner} loading={deleting} onClick={() => void remove()}>
              Eliminar campaña
            </Button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SpawnSection({ campaign, zones, onClear }: { campaign: Campaign; zones: Zone[]; onClear: () => void }) {
  const selectZone = useEditorStore((s) => s.selectZone);
  const setTool = useEditorStore((s) => s.setTool);
  const currentZoneId = useEditorStore((s) => s.currentZoneId);
  const spawn = campaign.spawn;
  const zone = spawn ? zones.find((z) => z.id === spawn.zoneId) : undefined;
  const level = zone && spawn ? zone.levels.find((l) => l.id === spawn.levelId) : undefined;

  /** Opens a zone in the canvas with the «Punto de aparición» tool ready. */
  const placeSpawn = () => {
    const target = zone ?? zones.find((z) => z.id === currentZoneId) ?? zones[0];
    if (!target) return;
    selectZone(target.id, level?.id);
    setTool('spawn');
  };

  const placeButton = zones.length > 0 && (
    <Button size="sm" icon={<Flag />} onClick={placeSpawn} title="Herramienta «Punto de aparición» (S)">
      Colocar en el mapa
    </Button>
  );

  let body: ReactNode;
  if (!spawn) {
    body = (
      <div className="space-y-3">
        <InfoNote icon={<TriangleAlert />} tone="warning">
          La campaña todavía no tiene punto de aparición. Colócalo en una zona con la herramienta «Punto de aparición» (S).
        </InfoNote>
        {placeButton}
      </div>
    );
  } else if (!zone || !level) {
    body = (
      <div className="space-y-3">
        <InfoNote icon={<TriangleAlert />} tone="warning">
          El punto de aparición está en {zone ? 'un piso' : 'una zona'} que ya no existe. Colócalo de nuevo con la herramienta «Punto de
          aparición» (S).
        </InfoNote>
        <div className="flex flex-wrap gap-2">
          {placeButton}
          <Button size="sm" variant="ghost" icon={<X />} onClick={onClear}>
            Quitar punto de aparición
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10 text-emerald-300">
            <Flag className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-parchment-50">{zone.name}</div>
            <div className="truncate text-xs text-parchment-400">
              {level.name} · x {Math.round(spawn.x)}, y {Math.round(spawn.y)} px
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Crosshair />} onClick={() => selectZone(spawn.zoneId, spawn.levelId)}>
            Ir a la zona
          </Button>
          <Button size="sm" variant="ghost" icon={<X />} onClick={onClear}>
            Quitar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SettingsSection
      icon={<Flag />}
      title="Punto de aparición"
      description="Donde aparecen las fichas de los héroes al empezar una partida nueva."
    >
      {body}
    </SettingsSection>
  );
}
