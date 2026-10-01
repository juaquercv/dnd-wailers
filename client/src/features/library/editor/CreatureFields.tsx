import { useId, useState } from 'react';
import { Info, Library, Link2 } from 'lucide-react';
import { SIZE_INFO, newId, type CreatureAttack, type CreatureData, type LibraryEntryInput, type NamedText, type SuggestedLoot } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { NumberInput } from '../../../components/ui/NumberInput';
import { TextArea } from '../../../components/ui/TextArea';
import { TextInput } from '../../../components/ui/TextInput';
import { Toggle } from '../../../components/ui/Toggle';
import { formatNumber } from '../../../lib/format';
import { SectionTitle } from '../common';
import { DAMAGE_TYPE_SUGGESTIONS } from '../meta';
import { AbilityEditor, EntryPickerModal, FormGrid, ListEditor, StringListInput } from './fields';

type CreatureDraft = LibraryEntryInput<'creature'>;

export interface CreatureTabProps {
  draft: CreatureDraft;
  onChange: (next: CreatureDraft) => void;
  errors: Record<string, string>;
}

function useData(draft: CreatureDraft, onChange: (next: CreatureDraft) => void) {
  return (patch: Partial<CreatureData>) => onChange({ ...draft, data: { ...draft.data, ...patch } });
}

export function CreatureStatsTab({ draft, onChange, errors }: CreatureTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  const sizeCells = SIZE_INFO[draft.size ?? 'medium']?.cells ?? 1;
  return (
    <div className="flex flex-col gap-5">
      <Toggle
        label="Es un NPC"
        description="Personaje no jugador (aliado, comerciante, neutral…). Se puede filtrar con «Solo NPCs»."
        checked={d.isNpc}
        onChange={(isNpc) => set({ isNpc })}
      />
      <FormGrid cols={4}>
        <NumberInput label="Clase de armadura" integer min={0} max={40} value={d.ac} error={errors['data.ac']} onChange={(ac) => set({ ac })} />
        <TextInput label="Velocidad" value={d.speed} placeholder="9 m, volar 18 m" onValueChange={(speed) => set({ speed })} />
        <NumberInput label="Experiencia (PX)" integer min={0} value={d.xp} error={errors['data.xp']} onChange={(xp) => set({ xp })} />
        <NumberInput
          label="Tamaño de ficha"
          nullable
          min={0.5}
          max={12}
          step={0.5}
          suffix="cas."
          value={d.tokenCells}
          error={errors['data.tokenCells']}
          placeholder={formatNumber(sizeCells, 1)}
          hint="Vacío = según el tamaño."
          onChange={(tokenCells) => set({ tokenCells })}
        />
      </FormGrid>
      <div>
        <SectionTitle>Características</SectionTitle>
        <div className="mt-3">
          <AbilityEditor value={d.abilities} onChange={(abilities) => set({ abilities })} errors={errors} />
        </div>
      </div>
    </div>
  );
}

function DamageTypeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listId = useId();
  return (
    <>
      <TextInput size="sm" label="Tipo de daño" value={value} list={listId} placeholder="Cortante" onValueChange={onChange} />
      <datalist id={listId}>
        {DAMAGE_TYPE_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

export function CreatureCombatTab({ draft, onChange, errors }: CreatureTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionTitle>Ataques</SectionTitle>
        <p className="mt-1 text-xs text-parchment-400">Texto libre como referencia para el DM: nada se calcula ni se aplica automáticamente.</p>
        <div className="mt-3">
          <ListEditor<CreatureAttack>
            items={d.attacks}
            onChange={(attacks) => set({ attacks })}
            emptyText="Sin ataques. Añade mordiscos, garras, armas…"
            addLabel="Añadir ataque"
            itemName={(a) => a.name}
            errorFor={(a) => errors[`attack.${a.id}`]}
            create={() => ({ id: newId('atk'), name: '', bonus: '', damage: '', damageType: '', range: '', notes: '' })}
            renderItem={(a, update) => (
              <div className="flex flex-col gap-2">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)]">
                  <TextInput size="sm" label="Nombre" value={a.name} placeholder="Mordisco" onValueChange={(name) => update({ name })} />
                  <TextInput size="sm" label="Bonif." value={a.bonus} placeholder="+7" onValueChange={(bonus) => update({ bonus })} />
                  <TextInput size="sm" label="Daño" value={a.damage} placeholder="2d6+4" onValueChange={(damage) => update({ damage })} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <DamageTypeInput value={a.damageType} onChange={(damageType) => update({ damageType })} />
                  <TextInput size="sm" label="Alcance" value={a.range} placeholder="Cuerpo a cuerpo, 1,5 m" onValueChange={(range) => update({ range })} />
                </div>
                <TextInput size="sm" label="Notas" value={a.notes} placeholder="Efectos adicionales, salvaciones…" onValueChange={(notes) => update({ notes })} />
              </div>
            )}
          />
        </div>
      </div>
      <div>
        <SectionTitle>Rasgos y habilidades</SectionTitle>
        <div className="mt-3">
          <ListEditor<NamedText>
            items={d.traits}
            onChange={(traits) => set({ traits })}
            emptyText="Sin rasgos especiales."
            addLabel="Añadir rasgo"
            itemName={(t) => t.name}
            errorFor={(t) => errors[`trait.${t.id}`]}
            create={() => ({ id: newId('trait'), name: '', description: '' })}
            renderItem={(t, update) => (
              <div className="flex flex-col gap-2">
                <TextInput size="sm" label="Nombre" value={t.name} placeholder="Aliento de fuego (recarga 5–6)" onValueChange={(name) => update({ name })} />
                <TextArea rows={2} autoResize label="Descripción" value={t.description} onValueChange={(description) => update({ description })} />
              </div>
            )}
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <StringListInput label="Resistencias" value={d.resistances} onChange={(resistances) => set({ resistances })} suggestions={DAMAGE_TYPE_SUGGESTIONS} />
        <StringListInput label="Debilidades" value={d.weaknesses} onChange={(weaknesses) => set({ weaknesses })} suggestions={DAMAGE_TYPE_SUGGESTIONS} />
        <StringListInput label="Inmunidades" value={d.immunities} onChange={(immunities) => set({ immunities })} suggestions={DAMAGE_TYPE_SUGGESTIONS} />
      </div>
    </div>
  );
}

export function CreatureLootTab({ draft, onChange, errors }: CreatureTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionTitle>Botín sugerido</SectionTitle>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-parchment-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          Solo de referencia: el botín nunca se reparte automáticamente. En partida el DM lo entrega a mano.
        </p>
        <div className="mt-3">
          <ListEditor<SuggestedLoot>
            items={d.suggestedLoot}
            onChange={(suggestedLoot) => set({ suggestedLoot })}
            emptyText="Sin botín sugerido."
            addLabel="Añadir a mano"
            itemName={(l) => l.name}
            errorFor={(l) => errors[`loot.${l.id}`]}
            create={() => ({ id: newId('loot'), entryId: null, name: '', quantity: 1, notes: '' })}
            extraActions={
              <Button size="sm" variant="ghost" icon={<Library />} onClick={() => setPicking(true)}>
                Añadir desde la biblioteca
              </Button>
            }
            renderItem={(l, update) => (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_5.5rem_minmax(0,2fr)]">
                <TextInput
                  size="sm"
                  label={
                    <span className="inline-flex items-center gap-1">
                      Objeto {l.entryId && <Link2 className="h-3 w-3 text-gold-400" aria-label="Vinculado a la biblioteca" />}
                    </span>
                  }
                  value={l.name}
                  onValueChange={(name) => update({ name })}
                />
                <NumberInput size="sm" label="Cant." integer min={1} value={l.quantity} onChange={(quantity) => update({ quantity })} />
                <TextInput size="sm" label="Notas" value={l.notes} placeholder="Probabilidad, condición…" onValueChange={(notes) => update({ notes })} />
              </div>
            )}
          />
        </div>
      </div>
      <TextArea
        label="Notas del DM"
        autoResize
        rows={4}
        maxRows={14}
        value={d.notes}
        placeholder="Tácticas, motivaciones, secretos…"
        onValueChange={(notes) => set({ notes })}
      />
      <EntryPickerModal
        open={picking}
        kind="item"
        multi
        onClose={() => setPicking(false)}
        onPick={(entry) =>
          onChange({
            ...draft,
            data: {
              ...draft.data,
              suggestedLoot: [...draft.data.suggestedLoot, { id: newId('loot'), entryId: entry.id, name: entry.name, quantity: 1, notes: '' }],
            },
          })
        }
      />
    </div>
  );
}
