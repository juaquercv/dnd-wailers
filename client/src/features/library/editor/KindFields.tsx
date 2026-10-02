import { useId, useMemo } from 'react';
import clsx from 'clsx';
import { Info, Layers, Wand } from 'lucide-react';
import {
  LIGHTING_INFO,
  SOUND_TYPES,
  SOUND_TYPE_LABELS,
  SPELL_ANIMATIONS,
  SPELL_ANIMATION_LABELS,
  WEATHER_LABELS,
  ZONE_TYPE_LABELS,
  normalizeText,
  type ItemData,
  type LibraryEntryInput,
  type SoundData,
  type SoundType,
  type SpellData,
} from '@wailers/shared';
import { withAlpha } from '../../../components/ui/Badge';
import { FileUpload } from '../../../components/ui/FileUpload';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Select } from '../../../components/ui/Select';
import { Slider } from '../../../components/ui/Slider';
import { Tabs } from '../../../components/ui/Tabs';
import { TextArea } from '../../../components/ui/TextArea';
import { TextInput } from '../../../components/ui/TextInput';
import { Toggle } from '../../../components/ui/Toggle';
import { formatDuration, formatNumber } from '../../../lib/format';
import { useCategoriesStore } from '../../../stores/categories';
import { AUDIO_ACCEPT, AUDIO_FORMATS_LABEL, AUDIO_UPLOAD_MIME_TYPES } from '../../audio/audioFiles';
import { SectionTitle } from '../common';
import { DAMAGE_TYPE_SUGGESTIONS, SOUND_TYPE_ICONS, SPELL_ANIMATION_COLORS } from '../meta';
import { SoundPlayer } from '../SoundPlayer';
import { FormGrid, StringListInput } from './fields';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type ItemDraft = LibraryEntryInput<'item'>;

export function ItemPropertiesTab({ draft, onChange, errors }: { draft: ItemDraft; onChange: (d: ItemDraft) => void; errors: Record<string, string> }) {
  const d = draft.data;
  const set = (patch: Partial<ItemData>) => onChange({ ...draft, data: { ...d, ...patch } });
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Toggle label="Mágico" description="Brilla con poder arcano." checked={d.magic} onChange={(magic) => set({ magic })} />
        <Toggle label="Requiere sintonización" checked={d.attunement} onChange={(attunement) => set({ attunement })} />
        <Toggle label="Apilable" description="Varias unidades ocupan una línea del inventario." checked={d.stackable} onChange={(stackable) => set({ stackable })} />
      </div>
      <FormGrid cols={4}>
        <NumberInput
          label="Espacios"
          integer
          min={0}
          value={d.slots}
          error={errors['data.slots']}
          hint="Campañas con inventario por espacios."
          onChange={(slots) => set({ slots })}
        />
        <TextInput label="Daño" value={d.damage} placeholder="1d8 cortante" onValueChange={(damage) => set({ damage })} />
        <NumberInput label="Clase de armadura" nullable integer min={0} value={d.armorClass} error={errors['data.armorClass']} onChange={(armorClass) => set({ armorClass })} />
        <NumberInput label="Cargas" nullable integer min={0} value={d.charges} error={errors['data.charges']} onChange={(charges) => set({ charges })} />
      </FormGrid>
      <TextArea
        label="Efectos"
        autoResize
        rows={4}
        maxRows={14}
        value={d.effects}
        placeholder="Qué hace el objeto al usarlo, equiparlo o activarlo…"
        onValueChange={(effects) => set({ effects })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spell
// ---------------------------------------------------------------------------

type SpellDraft = LibraryEntryInput<'spell'>;

const SCHOOLS = ['Abjuración', 'Adivinación', 'Conjuración', 'Encantamiento', 'Evocación', 'Ilusión', 'Nigromancia', 'Transmutación'];

/** Class names from the hero "Clase" facet (live categories), used as suggestions. */
function useClassSuggestions(): string[] {
  const categories = useCategoriesStore((s) => s.categories);
  return useMemo(() => {
    const facet = categories.find((c) => c.kind === 'hero' && c.parentId === null && normalizeText(c.name).startsWith('clase'));
    if (!facet) return [];
    return categories
      .filter((c) => c.parentId === facet.id)
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [categories]);
}

export function SpellCastingTab({ draft, onChange, errors }: { draft: SpellDraft; onChange: (d: SpellDraft) => void; errors: Record<string, string> }) {
  const d = draft.data;
  const set = (patch: Partial<SpellData>) => onChange({ ...draft, data: { ...d, ...patch } });
  const schoolList = useId();
  const typeList = useId();
  const classSuggestions = useClassSuggestions();
  return (
    <div className="flex flex-col gap-5">
      <FormGrid cols={3}>
        <TextInput label="Escuela" value={d.school} list={schoolList} placeholder="Evocación" onValueChange={(school) => set({ school })} />
        <TextInput label="Tiempo de lanzamiento" value={d.castingTime} placeholder="1 acción" onValueChange={(castingTime) => set({ castingTime })} />
        <TextInput label="Alcance" value={d.range} placeholder="18 m" onValueChange={(range) => set({ range })} />
        <TextInput label="Duración" value={d.duration} placeholder="Instantáneo" onValueChange={(duration) => set({ duration })} />
        <TextInput label="Componentes" value={d.components} placeholder="V, S, M" onValueChange={(components) => set({ components })} />
        <div className="flex items-end pb-2">
          <Toggle label="Concentración" checked={d.concentration} onChange={(concentration) => set({ concentration })} />
        </div>
      </FormGrid>
      <datalist id={schoolList}>
        {SCHOOLS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="rounded-xl border border-arcane-600/30 bg-arcane-500/[0.05] p-3">
        <SectionTitle>Coste según la campaña</SectionTitle>
        <p className="mt-1 text-xs text-parchment-400">
          Cada campaña usa su propio sistema: se mostrará el coste de recurso (puntos) o el espacio de conjuro según sus reglas.
        </p>
        <FormGrid cols={2} className="mt-3">
          <NumberInput
            label="Coste de recurso"
            integer
            min={0}
            value={d.manaCost}
            error={errors['data.manaCost']}
            hint="Campañas con reserva de puntos mágicos."
            onChange={(manaCost) => set({ manaCost })}
          />
          <Select<number>
            label="Espacio de conjuro"
            value={d.slotLevel}
            error={errors['data.slotLevel']}
            hint="Campañas con espacios de conjuro."
            onChange={(slotLevel) => set({ slotLevel })}
            options={Array.from({ length: 10 }, (_, i) => ({ value: i, label: i === 0 ? 'No gasta espacio' : `Nivel ${i}` }))}
          />
        </FormGrid>
      </div>

      <FormGrid cols={2}>
        <TextInput label="Daño o curación" value={d.damage} placeholder="8d6" onValueChange={(damage) => set({ damage })} />
        <TextInput label="Tipo de daño" value={d.damageType} list={typeList} placeholder="Fuego" onValueChange={(damageType) => set({ damageType })} />
      </FormGrid>
      <datalist id={typeList}>
        {DAMAGE_TYPE_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div>
        <div className="label">Animación en el mapa</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SPELL_ANIMATIONS.map((a) => {
            const color = SPELL_ANIMATION_COLORS[a];
            const active = d.animation === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => set({ animation: a })}
                aria-pressed={active}
                className={clsx(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition active:scale-[0.98]',
                  !active && 'border-ink-600 bg-ink-950/40 text-parchment-200 hover:border-ink-400',
                )}
                style={active ? { borderColor: withAlpha(color, 0.75), backgroundColor: withAlpha(color, 0.14), color, boxShadow: `0 0 16px -6px ${color}` } : undefined}
              >
                <span
                  className={clsx('h-4 w-4 shrink-0 rounded-full', active && 'animate-glow-pulse')}
                  style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${color} 45%, ${withAlpha(color, 0.3)})` }}
                />
                {SPELL_ANIMATION_LABELS[a]}
              </button>
            );
          })}
        </div>
      </div>

      <StringListInput
        label="Clases que pueden aprenderlo"
        value={d.classes}
        onChange={(classes) => set({ classes })}
        suggestions={classSuggestions}
        hint="Texto libre; también puedes clasificarlo en la pestaña Categorías."
      />
      <TextArea
        label="Efecto"
        autoResize
        rows={4}
        maxRows={16}
        value={d.effect}
        placeholder="Descripción completa del efecto del hechizo…"
        onValueChange={(effect) => set({ effect })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

type SoundDraft = LibraryEntryInput<'sound'>;

function stripExtension(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

export function SoundAudioTab({ draft, onChange, errors }: { draft: SoundDraft; onChange: (d: SoundDraft) => void; errors: Record<string, string> }) {
  const d = draft.data;
  const set = (patch: Partial<SoundData>) => onChange({ ...draft, data: { ...d, ...patch } });
  return (
    <div className="flex flex-col gap-5">
      <FileUpload
        label="Archivo de audio"
        accept={AUDIO_ACCEPT}
        mimeTypes={AUDIO_UPLOAD_MIME_TYPES}
        value={d.url || null}
        hint={AUDIO_FORMATS_LABEL}
        onChange={(url, info) => {
          const next: SoundDraft = { ...draft, data: { ...d, url: url ?? '', durationSec: null } };
          if (url && info && !draft.name.trim()) next.name = stripExtension(info.originalName);
          onChange(next);
        }}
        renderPreview={(url) => (
          <SoundPlayer
            key={url}
            url={url}
            soundType={d.soundType}
            loop={d.loop}
            volume={d.volume}
            onDuration={(seconds) => {
              const rounded = Math.round(seconds * 10) / 10;
              if (d.durationSec === null || Math.abs((d.durationSec ?? 0) - rounded) > 0.5) set({ durationSec: rounded });
            }}
          />
        )}
      />
      {errors['data.url'] && <p className="-mt-3 text-xs text-blood-400">{errors['data.url']}</p>}

      <div>
        <div className="label">Tipo de sonido</div>
        <Tabs<SoundType>
          variant="pills"
          fill
          value={d.soundType}
          onChange={(soundType) => set({ soundType, loop: soundType !== 'effect' })}
          items={SOUND_TYPES.map((t) => {
            const Icon = SOUND_TYPE_ICONS[t];
            return { id: t, label: SOUND_TYPE_LABELS[t], icon: <Icon /> };
          })}
        />
        <p className="mt-1.5 text-xs text-parchment-400">
          {d.soundType === 'music'
            ? 'Música de fondo: se reproduce con fundido cruzado al cambiar de zona.'
            : d.soundType === 'ambience'
              ? 'Ambiente: capa continua (lluvia, taberna, viento…).'
              : 'Efecto puntual: el DM lo lanza cuando quiere.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_10rem] sm:items-end">
        <Toggle label="Reproducir en bucle" checked={d.loop} onChange={(loop) => set({ loop })} />
        <Slider
          label="Volumen predeterminado"
          value={d.volume}
          min={0}
          max={1}
          onChange={(volume) => set({ volume })}
        />
        <div className="flex items-end gap-1.5">
          <NumberInput
            label="Duración (s)"
            nullable
            min={0}
            value={d.durationSec}
            containerClassName="flex-1"
            hint={d.durationSec ? formatDuration(d.durationSec) : 'Se detecta al cargar el audio.'}
            onChange={(durationSec) => set({ durationSec })}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone template (metadata only)
// ---------------------------------------------------------------------------

type ZoneDraft = LibraryEntryInput<'zone'>;

export function ZoneContentTab({ draft, errors }: { draft: ZoneDraft; errors: Record<string, string> }) {
  const content = draft.data.content;
  const levels = content?.levels ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-3 text-sm leading-relaxed text-parchment-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <div>
          Aquí solo se editan los datos de la plantilla (nombre, imagen, etiquetas y categorías). El mapa —niveles, elementos, paredes, luces y
          niebla— se diseña en el <strong>editor de campañas</strong>: crea o abre una zona, edítala y usa «Guardar como plantilla».
        </div>
      </div>
      {errors.content && <p className="text-xs text-blood-400">{errors.content}</p>}
      {content && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Tipo', ZONE_TYPE_LABELS[content.zoneType] ?? content.zoneType],
            ['Bioma', content.biome || '—'],
            ['Clima', WEATHER_LABELS[content.weather] ?? content.weather],
            ['Iluminación', LIGHTING_INFO[content.lighting]?.label ?? content.lighting],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-ink-600/60 bg-ink-950/40 px-2.5 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-parchment-400">{label}</div>
              <div className="truncate text-sm text-parchment-50">{value}</div>
            </div>
          ))}
        </div>
      )}
      <div>
        <SectionTitle icon={<Layers />}>{levels.length === 1 ? '1 nivel' : `${levels.length} niveles`}</SectionTitle>
        <ul className="mt-2 flex flex-col gap-1.5">
          {levels.map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-lg border border-ink-600/60 bg-ink-950/40 px-2.5 py-1.5 text-sm">
              <span className="h-8 w-12 shrink-0 overflow-hidden rounded border border-ink-600" style={{ backgroundColor: l.background?.color ?? '#2b2a24' }}>
                {l.background?.url && <img src={l.background.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-parchment-50">{l.name}</span>
              <span className="text-xs text-parchment-400">
                {formatNumber(l.background?.width ?? 0, 0)}×{formatNumber(l.background?.height ?? 0, 0)} px · {l.elements?.length ?? 0} elementos
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-parchment-500">
        <Wand className="h-3.5 w-3.5" /> Al crear una zona desde esta plantilla se copia todo con identificadores nuevos.
      </p>
    </div>
  );
}
