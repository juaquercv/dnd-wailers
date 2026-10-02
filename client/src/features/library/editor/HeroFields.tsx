import { useState } from 'react';
import clsx from 'clsx';
import { Footprints, Info, Library, Link2, Plus, Swords, Trash2, Wand, Zap } from 'lucide-react';
import {
  CELL_METERS,
  DEFAULT_ACTIONS_PER_TURN,
  RARITIES,
  RARITY_INFO,
  SPELL_ANIMATIONS,
  SPELL_ANIMATION_LABELS,
  STATUSES,
  createRuleSystem,
  customInventoryItem,
  heroMoveCells,
  inventoryItemFromEntry,
  inventoryLoad,
  newId,
  parseSpeedCells,
  slotsForLevel,
  type HeroData,
  type HeroSpell,
  type InventoryItem,
  type ItemEntry,
  type LibraryEntryInput,
  type LimitedUse,
  type Rarity,
  type SpellAnimation,
  type SpellSlotState,
} from '@wailers/shared';
import { withAlpha } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Select } from '../../../components/ui/Select';
import { TextArea } from '../../../components/ui/TextArea';
import { TextInput } from '../../../components/ui/TextInput';
import { Toggle } from '../../../components/ui/Toggle';
import { formatGold, formatWeight } from '../../../lib/format';
import { heroSpellFromEntry } from '../../heroes/heroUtils';
import { SectionTitle } from '../common';
import { AbilityEditor, EntryPickerModal, FormGrid, ListEditor } from './fields';

type HeroDraft = LibraryEntryInput<'hero'>;

export const MAX_MOVE_CELLS = 100;
export const MAX_ACTIONS_PER_TURN = 10;

export interface HeroTabProps {
  draft: HeroDraft;
  onChange: (next: HeroDraft) => void;
  errors: Record<string, string>;
}

function useData(draft: HeroDraft, onChange: (next: HeroDraft) => void) {
  return (patch: Partial<HeroData>) => onChange({ ...draft, data: { ...draft.data, ...patch } });
}

export function HeroStatsTab({ draft, onChange, errors }: HeroTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-blood-700/40 bg-blood-500/[0.05] p-3">
        <SectionTitle>Puntos de vida</SectionTitle>
        <FormGrid cols={3} className="mt-3">
          <NumberInput
            label="Máximos"
            integer
            min={1}
            value={d.hp.max}
            error={errors['data.hp.max']}
            onChange={(max) => set({ hp: { ...d.hp, max, current: Math.min(d.hp.current, max) } })}
          />
          <NumberInput
            label="Actuales"
            integer
            min={0}
            value={d.hp.current}
            error={errors['data.hp.current']}
            onChange={(current) => set({ hp: { ...d.hp, current } })}
          />
          <NumberInput label="Temporales" integer min={0} value={d.hp.temp} error={errors['data.hp.temp']} onChange={(temp) => set({ hp: { ...d.hp, temp } })} />
        </FormGrid>
      </div>
      <FormGrid cols={4}>
        <NumberInput label="Clase de armadura" integer min={0} max={40} value={d.ac} error={errors['data.ac']} onChange={(ac) => set({ ac })} />
        <TextInput label="Velocidad" value={d.speed} placeholder="9 m" onValueChange={(speed) => set({ speed })} />
        <NumberInput label="Bonif. iniciativa" integer min={-10} max={20} value={d.initiativeBonus} onChange={(initiativeBonus) => set({ initiativeBonus })} />
        <NumberInput
          label="Visión"
          nullable
          min={0}
          max={60}
          suffix="cas."
          value={d.visionCells}
          hint="Vacío = la de la sesión."
          onChange={(visionCells) => set({ visionCells })}
        />
        <NumberInput label="Experiencia (PX)" integer min={0} value={d.xp} error={errors['data.xp']} onChange={(xp) => set({ xp })} />
        <NumberInput label="Oro" min={0} suffix="po" value={d.gold} error={errors['data.gold']} onChange={(gold) => set({ gold })} />
      </FormGrid>
      <TurnEconomyFields
        speed={d.speed}
        moveCells={d.moveCells ?? null}
        actionsPerTurn={d.actionsPerTurn ?? DEFAULT_ACTIONS_PER_TURN}
        errors={errors}
        onChange={(patch) => set(patch)}
      />
      <div>
        <SectionTitle>Características</SectionTitle>
        <div className="mt-3">
          <AbilityEditor value={d.abilities} onChange={(abilities) => set({ abilities })} errors={errors} />
        </div>
      </div>
      <div>
        <SectionTitle>Estados</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const active = d.statuses.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                onClick={() => set({ statuses: active ? d.statuses.filter((k) => k !== s.key) : [...d.statuses, s.key] })}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-95',
                  !active && 'border-ink-500 bg-ink-800/70 text-parchment-300 hover:border-ink-400',
                )}
                style={active ? { color: s.color, borderColor: withAlpha(s.color, 0.6), backgroundColor: withAlpha(s.color, 0.15) } : undefined}
              >
                <span>{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface TurnEconomyFieldsProps {
  speed: string;
  moveCells: number | null;
  actionsPerTurn: number;
  errors?: Record<string, string>;
  onChange: (patch: { moveCells?: number | null; actionsPerTurn?: number }) => void;
  className?: string;
}

/** "Movimiento por turno" (empty = from the speed) and "Acciones de combate por turno". */
export function TurnEconomyFields({ speed, moveCells, actionsPerTurn, errors = {}, onChange, className }: TurnEconomyFieldsProps) {
  const derived = heroMoveCells({ speed, moveCells: null });
  const fromSpeed = parseSpeedCells(speed) !== null;
  const effective = heroMoveCells({ speed, moveCells });
  return (
    <div className={clsx('rounded-xl border border-gold-700/40 bg-gold-500/[0.04] p-3', className)}>
      <SectionTitle icon={<Swords />}>Turno de combate</SectionTitle>
      <FormGrid cols={2} className="mt-3">
        <NumberInput
          label={
            <span className="inline-flex items-center gap-1.5">
              <Footprints className="h-3.5 w-3.5 text-gold-400" aria-hidden /> Movimiento por turno (casillas)
            </span>
          }
          nullable
          integer
          min={0}
          max={MAX_MOVE_CELLS}
          suffix="cas."
          value={moveCells}
          placeholder={String(derived)}
          error={errors['data.moveCells']}
          hint={
            moveCells === null
              ? fromSpeed
                ? `Vacío = según la velocidad («${speed.trim()}» → ${derived} casillas).`
                : `Vacío = ${derived} casillas (escribe la velocidad para calcularlo).`
              : `Cada casilla son ${CELL_METERS.toString().replace('.', ',')} m. Vacía el campo para usar la velocidad.`
          }
          onChange={(value) => onChange({ moveCells: value })}
        />
        <NumberInput
          label={
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-arcane-300" aria-hidden /> Acciones de combate por turno
            </span>
          }
          integer
          min={0}
          max={MAX_ACTIONS_PER_TURN}
          value={actionsPerTurn}
          error={errors['data.actionsPerTurn']}
          hint="Atacar, lanzar un hechizo o usar un objeto. Normalmente 1."
          onChange={(value) => onChange({ actionsPerTurn: value })}
        />
      </FormGrid>
      <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-parchment-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
        <span>
          En combate, en su turno puede moverse hasta <span className="font-semibold text-parchment-200">{effective} casillas</span> y gastar{' '}
          <span className="font-semibold text-parchment-200">
            {actionsPerTurn === 1 ? '1 acción de combate' : `${actionsPerTurn} acciones de combate`}
          </span>
          . Recoger objetos, abrir puertas o intercambiar no gastan nada.
        </span>
      </p>
    </div>
  );
}

export function HeroResourcesTab({ draft, onChange, errors }: HeroTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  const res = d.resources;
  const setRes = (patch: Partial<HeroData['resources']>) => set({ resources: { ...res, ...patch } });
  const slots = [...res.slots].sort((a, b) => a.level - b.level);
  const nextLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((l) => !slots.some((s) => s.level === l));

  const updateSlot = (level: number, patch: Partial<SpellSlotState>) =>
    setRes({ slots: res.slots.map((s) => (s.level === level ? { ...s, ...patch } : s)) });

  const suggestSlots = () => {
    const suggested = slotsForLevel(createRuleSystem('slots'), draft.level ?? 1);
    setRes({
      slots: suggested.map((s) => {
        const prev = res.slots.find((p) => p.level === s.level);
        return { ...s, used: Math.min(prev?.used ?? 0, s.max) };
      }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-parchment-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
        Un héroe guarda todos los tipos de recurso; cada campaña muestra solo los que usan sus reglas (y con el nombre que elijan). Los
        recursos que falten se completan al entrar en una partida sin borrar nada.
      </p>

      <div className="rounded-xl border border-arcane-600/30 bg-arcane-500/[0.05] p-3">
        <SectionTitle>Recurso mágico por puntos</SectionTitle>
        <FormGrid cols={2} className="mt-3">
          <NumberInput
            label="Máximo"
            integer
            min={0}
            value={res.mana.max}
            error={errors.mana}
            onChange={(max) => setRes({ mana: { max, current: Math.min(res.mana.current, max) } })}
          />
          <NumberInput label="Actual" integer min={0} value={res.mana.current} onChange={(current) => setRes({ mana: { ...res.mana, current } })} />
        </FormGrid>
      </div>

      <div>
        <SectionTitle
          aside={
            <Button size="sm" variant="ghost" icon={<Wand />} onClick={suggestSlots} title="Tabla de lanzador completo según el nivel del héroe">
              Sugerir según nivel
            </Button>
          }
        >
          Espacios de conjuro
        </SectionTitle>
        <div className="mt-3 flex flex-col gap-1.5">
          {slots.length === 0 && <p className="text-xs italic text-parchment-500">Sin espacios de conjuro.</p>}
          {slots.map((s) => (
            <div
              key={s.level}
              className={clsx(
                'grid grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2 rounded-lg border bg-ink-950/40 px-2.5 py-1.5',
                errors[`slot.${s.level}`] ? 'border-blood-500/70' : 'border-ink-600/60',
              )}
            >
              <span className="pb-2 font-display text-sm font-semibold text-arcane-300">Nivel {s.level}</span>
              <NumberInput size="sm" label="Máximo" integer min={0} max={9} value={s.max} onChange={(max) => updateSlot(s.level, { max, used: Math.min(s.used, max) })} />
              <NumberInput size="sm" label="Gastados" integer min={0} max={s.max} value={s.used} onChange={(used) => updateSlot(s.level, { used })} />
              <button
                type="button"
                onClick={() => setRes({ slots: res.slots.filter((x) => x.level !== s.level) })}
                aria-label={`Quitar espacios de nivel ${s.level}`}
                className="mb-1 h-7 w-7 rounded-md text-parchment-400 transition hover:bg-blood-600/20 hover:text-blood-300"
              >
                <Trash2 className="mx-auto h-4 w-4" />
              </button>
            </div>
          ))}
          {nextLevel !== undefined && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus />}
              className="self-start"
              onClick={() => setRes({ slots: [...res.slots, { level: nextLevel, max: 1, used: 0 }] })}
            >
              Añadir nivel {nextLevel}
            </Button>
          )}
        </div>
      </div>

      <div>
        <SectionTitle>Usos limitados</SectionTitle>
        <p className="mt-1 text-xs text-parchment-400">Habilidades con usos por descanso (furia, canalizar divinidad…).</p>
        <div className="mt-3">
          <ListEditor<LimitedUse>
            items={res.uses}
            onChange={(uses) => setRes({ uses })}
            emptyText="Sin usos limitados."
            addLabel="Añadir uso"
            itemName={(u) => u.name}
            errorFor={(u) => errors[`use.${u.id}`]}
            create={() => ({ id: newId('use'), name: '', max: 1, used: 0, resetOn: 'long' })}
            renderItem={(u, update) => (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_5rem_5rem_minmax(0,1.3fr)]">
                <TextInput size="sm" label="Nombre" value={u.name} placeholder="Furia" onValueChange={(name) => update({ name })} />
                <NumberInput size="sm" label="Máx." integer min={1} value={u.max} onChange={(max) => update({ max, used: Math.min(u.used, max) })} />
                <NumberInput size="sm" label="Gastados" integer min={0} max={u.max} value={u.used} onChange={(used) => update({ used })} />
                <Select<'short' | 'long'>
                  size="sm"
                  label="Se recupera"
                  value={u.resetOn}
                  onChange={(resetOn) => update({ resetOn })}
                  options={[
                    { value: 'short', label: 'Descanso corto' },
                    { value: 'long', label: 'Descanso largo' },
                  ]}
                />
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function HeroInventoryTab({ draft, onChange, errors }: HeroTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  const [picking, setPicking] = useState(false);
  const load = inventoryLoad(d);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-parchment-300">
        <span className="chip">{d.inventory.length} objetos</span>
        <span className="chip">{formatWeight(load.weight)}</span>
        <span className="chip">{load.slots} espacios</span>
        <span className="chip text-gold-200">{formatGold(load.value)}</span>
      </div>
      <ListEditor<InventoryItem>
        items={d.inventory}
        onChange={(inventory) => set({ inventory })}
        emptyText="El inventario está vacío."
        addLabel="Objeto personalizado"
        itemName={(it) => it.name}
        errorFor={(it) => errors[`inv.${it.id}`]}
        create={() => customInventoryItem({ name: '' })}
        extraActions={
          <Button size="sm" variant="ghost" icon={<Library />} onClick={() => setPicking(true)}>
            Añadir desde la biblioteca
          </Button>
        }
        renderItem={(it, update) => (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_5rem_auto] sm:items-end">
              <TextInput
                size="sm"
                label={
                  <span className="inline-flex items-center gap-1">
                    Nombre {it.entryId && <Link2 className="h-3 w-3 text-gold-400" aria-label="Copia de un objeto de la biblioteca" />}
                  </span>
                }
                value={it.name}
                onValueChange={(name) => update({ name })}
                style={it.rarity ? { color: RARITY_INFO[it.rarity]?.color } : undefined}
              />
              <NumberInput size="sm" label="Cant." integer min={1} value={it.quantity} onChange={(quantity) => update({ quantity })} />
              <div className="pb-1.5">
                <Toggle size="sm" label="Equipado" checked={it.equipped} onChange={(equipped) => update({ equipped })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberInput size="sm" label="Peso (ud.)" min={0} suffix="kg" value={it.weight} onChange={(weight) => update({ weight })} />
              <NumberInput size="sm" label="Valor (ud.)" min={0} suffix="po" value={it.value} onChange={(value) => update({ value })} />
              <NumberInput size="sm" label="Espacios" integer min={0} value={it.slots} onChange={(slots) => update({ slots })} />
              <Select<Rarity | null>
                size="sm"
                label="Rareza"
                value={it.rarity}
                onChange={(rarity) => update({ rarity })}
                options={[{ value: null, label: 'Sin rareza' }, ...RARITIES.map((r) => ({ value: r, label: RARITY_INFO[r].label }))]}
              />
            </div>
            <TextInput size="sm" label="Notas" value={it.notes} placeholder="Grabados, procedencia…" onValueChange={(notes) => update({ notes })} />
          </div>
        )}
      />
      <EntryPickerModal
        open={picking}
        kind="item"
        multi
        onClose={() => setPicking(false)}
        onPick={(entry) => onChange({ ...draft, data: { ...draft.data, inventory: [...draft.data.inventory, inventoryItemFromEntry(entry as ItemEntry)] } })}
      />
    </div>
  );
}

export function HeroSpellsTab({ draft, onChange, errors }: HeroTabProps) {
  const set = useData(draft, onChange);
  const d = draft.data;
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <ListEditor<HeroSpell>
        items={d.spells}
        onChange={(spells) => set({ spells })}
        emptyText="Sin hechizos. Añádelos desde la biblioteca o créalos a mano."
        addLabel="Hechizo personalizado"
        itemName={(s) => s.name}
        errorFor={(s) => errors[`spell.${s.id}`]}
        create={() => ({ id: newId('hsp'), entryId: null, name: '', level: 1, manaCost: 0, slotLevel: 1, animation: 'arcane', description: '', prepared: true })}
        extraActions={
          <Button size="sm" variant="ghost" icon={<Library />} onClick={() => setPicking(true)}>
            Añadir desde la biblioteca
          </Button>
        }
        renderItem={(s, update) => (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_7rem_auto] sm:items-end">
              <TextInput
                size="sm"
                label={
                  <span className="inline-flex items-center gap-1">
                    Nombre {s.entryId && <Link2 className="h-3 w-3 text-gold-400" aria-label="Copia de un hechizo de la biblioteca" />}
                  </span>
                }
                value={s.name}
                onValueChange={(name) => update({ name })}
              />
              <Select<number>
                size="sm"
                label="Nivel"
                value={s.level}
                onChange={(level) => update({ level })}
                options={Array.from({ length: 10 }, (_, i) => ({ value: i, label: i === 0 ? 'Truco' : `Nivel ${i}` }))}
              />
              <div className="pb-1.5">
                <Toggle size="sm" label="Preparado" checked={s.prepared} onChange={(prepared) => update({ prepared })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumberInput size="sm" label="Coste recurso" integer min={0} value={s.manaCost} onChange={(manaCost) => update({ manaCost })} />
              <Select<number>
                size="sm"
                label="Espacio"
                value={s.slotLevel}
                onChange={(slotLevel) => update({ slotLevel })}
                options={Array.from({ length: 10 }, (_, i) => ({ value: i, label: i === 0 ? 'Ninguno' : `Nivel ${i}` }))}
              />
              <Select<SpellAnimation>
                size="sm"
                label="Animación"
                value={s.animation}
                onChange={(animation) => update({ animation })}
                options={SPELL_ANIMATIONS.map((a) => ({ value: a, label: SPELL_ANIMATION_LABELS[a] }))}
              />
            </div>
            <TextArea rows={2} autoResize label="Descripción" value={s.description} onValueChange={(description) => update({ description })} />
          </div>
        )}
      />
      <EntryPickerModal
        open={picking}
        kind="spell"
        multi
        onClose={() => setPicking(false)}
        onPick={(entry) => onChange({ ...draft, data: { ...draft.data, spells: [...draft.data.spells, heroSpellFromEntry(entry)] } })}
      />
    </div>
  );
}

export function HeroNotesTab({ draft, onChange }: HeroTabProps) {
  const set = useData(draft, onChange);
  return (
    <TextArea
      label="Notas del héroe"
      autoResize
      rows={8}
      maxRows={24}
      value={draft.data.notes}
      placeholder="Trasfondo, objetivos, contactos, deudas pendientes…"
      onValueChange={(notes) => set({ notes })}
    />
  );
}
