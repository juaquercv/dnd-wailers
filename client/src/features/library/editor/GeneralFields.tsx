import { Info, Layers } from 'lucide-react';
import {
  CREATURE_SIZES,
  RARITIES,
  RARITY_INFO,
  SIZE_INFO,
  type CampaignSummary,
  type CreatureSize,
  type Rarity,
  type UserStatusDTO,
} from '@wailers/shared';
import { ImageUpload } from '../../../components/ui/ImageUpload';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Select } from '../../../components/ui/Select';
import { TagInput } from '../../../components/ui/TagInput';
import { TextArea } from '../../../components/ui/TextArea';
import { TextInput } from '../../../components/ui/TextInput';
import { formatCr } from '../../../lib/format';
import { CategoryTree } from '../CategoryTree';
import { CategoryChip } from '../common';
import type { AnyDraft } from './draft';
import { FormGrid } from './fields';

export interface GeneralFieldsProps {
  draft: AnyDraft;
  onChange: (next: AnyDraft) => void;
  errors: Record<string, string>;
  campaigns: CampaignSummary[];
  users: UserStatusDTO[];
}

const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export function GeneralFields({ draft, onChange, errors, campaigns, users }: GeneralFieldsProps) {
  const aspect = draft.kind === 'zone' || draft.kind === 'sound' ? 'video' : 'square';
  const imageLabel =
    draft.kind === 'hero' ? 'Retrato' : draft.kind === 'zone' ? 'Imagen de vista previa' : draft.kind === 'sound' ? 'Portada (opcional)' : 'Imagen';
  return (
    <div className="grid gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <ImageUpload
          label={imageLabel}
          value={draft.imageUrl ?? null}
          onChange={(url) => onChange({ ...draft, imageUrl: url })}
          aspect={aspect}
          fit={draft.kind === 'zone' ? 'contain' : 'cover'}
          hint={draft.kind === 'zone' ? 'Si no hay imagen se usa el fondo del nivel inicial.' : undefined}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <TextInput
          label="Nombre"
          required
          data-autofocus
          value={draft.name}
          maxLength={120}
          error={errors.name}
          placeholder="Un nombre memorable…"
          onValueChange={(name) => onChange({ ...draft, name })}
        />
        <TextArea
          label="Descripción"
          autoResize
          rows={3}
          maxRows={10}
          value={draft.description ?? ''}
          error={errors.description}
          placeholder={draft.kind === 'hero' ? 'Aspecto, personalidad, trasfondo…' : 'Descripción visible al consultar la ficha…'}
          onValueChange={(description) => onChange({ ...draft, description })}
        />

        {draft.kind === 'creature' && (
          <FormGrid cols={3}>
            <Select<number | null>
              label="Desafío (CR)"
              value={draft.cr ?? null}
              error={errors.cr}
              onChange={(cr) => onChange({ ...draft, cr })}
              options={[{ value: null, label: 'Sin CR' }, ...CR_VALUES.map((v) => ({ value: v, label: formatCr(v) }))]}
            />
            <NumberInput
              label="Puntos de vida"
              integer
              min={1}
              value={draft.hp ?? 1}
              error={errors.hp}
              onChange={(hp) => onChange({ ...draft, hp })}
            />
            <Select<CreatureSize | null>
              label="Tamaño"
              value={draft.size ?? null}
              onChange={(size) => onChange({ ...draft, size })}
              options={[{ value: null, label: 'Sin tamaño' }, ...CREATURE_SIZES.map((s) => ({ value: s, label: SIZE_INFO[s].label }))]}
            />
          </FormGrid>
        )}

        {draft.kind === 'item' && (
          <FormGrid cols={3}>
            <Select<Rarity | null>
              label="Rareza"
              value={draft.rarity ?? null}
              onChange={(rarity) => onChange({ ...draft, rarity })}
              options={[{ value: null, label: 'Sin rareza' }, ...RARITIES.map((r) => ({ value: r, label: RARITY_INFO[r].label }))]}
            />
            <NumberInput
              label="Valor"
              nullable
              min={0}
              suffix="po"
              value={draft.value ?? null}
              error={errors.value}
              onChange={(value) => onChange({ ...draft, value })}
            />
            <NumberInput
              label="Peso"
              nullable
              min={0}
              suffix="kg"
              value={draft.weight ?? null}
              error={errors.weight}
              onChange={(weight) => onChange({ ...draft, weight })}
            />
          </FormGrid>
        )}

        {draft.kind === 'spell' && (
          <FormGrid cols={3}>
            <Select<number>
              label="Nivel del hechizo"
              value={draft.level ?? 0}
              error={errors.level}
              onChange={(level) => onChange({ ...draft, level })}
              options={Array.from({ length: 10 }, (_, i) => ({ value: i, label: i === 0 ? 'Truco (nivel 0)' : `Nivel ${i}` }))}
            />
          </FormGrid>
        )}

        {draft.kind === 'hero' && (
          <FormGrid cols={3}>
            <NumberInput
              label="Nivel"
              integer
              min={1}
              max={20}
              value={draft.level ?? 1}
              error={errors.level}
              onChange={(level) => onChange({ ...draft, level })}
            />
            <Select<string | null>
              label="Jugador"
              containerClassName="sm:col-span-2"
              value={draft.ownerId ?? null}
              onChange={(ownerId) => onChange({ ...draft, ownerId })}
              options={[{ value: null, label: 'Sin jugador asignado' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            />
          </FormGrid>
        )}

        {draft.kind === 'zone' && (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-xs text-parchment-200">
            <Layers className="h-4 w-4 shrink-0 text-emerald-300" />
            {draft.data.content?.levels?.length ?? 0} niveles · el número se calcula a partir del contenido de la plantilla.
          </p>
        )}

        <Select<string | null>
          label="Campaña de origen"
          hint="Opcional: indica en qué campaña se creó. El elemento sigue disponible para todas."
          value={draft.originCampaignId ?? null}
          onChange={(originCampaignId) => onChange({ ...draft, originCampaignId })}
          options={[{ value: null, label: 'Ninguna (biblioteca general)' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
        />

        <TagInput
          label="Etiquetas"
          kind={draft.kind}
          value={draft.tags ?? []}
          onChange={(tags) => onChange({ ...draft, tags })}
          hint="Palabras clave libres para buscar y filtrar (#volcán, #jefe…)."
        />
      </div>
    </div>
  );
}

export function CategoryFields({ draft, onChange }: { draft: AnyDraft; onChange: (next: AnyDraft) => void }) {
  const selected = draft.categoryIds ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-xs leading-relaxed text-parchment-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <span>
          Las categorías raíz son <strong>facetas</strong> (por ejemplo «Hábitat»); marca los valores que describen este elemento. Puedes elegir
          varios por faceta. Un valor incluye a sus padres al filtrar.
        </span>
      </div>
      <div>
        <div className="label">Seleccionadas ({selected.length})</div>
        {selected.length === 0 ? (
          <p className="text-xs italic text-parchment-500">Ninguna categoría todavía.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((id) => (
              <CategoryChip key={id} id={id} onRemove={() => onChange({ ...draft, categoryIds: selected.filter((c) => c !== id) })} />
            ))}
          </div>
        )}
      </div>
      <CategoryTree
        kind={draft.kind}
        mode="pick"
        searchable
        defaultExpanded="all"
        value={selected}
        onChange={(categoryIds) => onChange({ ...draft, categoryIds })}
        emptyText="Este tipo no tiene categorías. Créalas con «Gestionar categorías»."
      />
    </div>
  );
}
