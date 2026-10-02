import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Coins, Crown, Heart, Library, Lock, RotateCcw, Shield, Sparkles, Trash2, Zap } from 'lucide-react';
import { ENTRY_KIND_LABELS, SPELL_ANIMATION_LABELS, formatModifier, type HeroSpell } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Tabs } from '../../../components/ui/Tabs';
import { TextInput } from '../../../components/ui/TextInput';
import { formatGold } from '../../../lib/format';
import { SectionTitle } from '../../library/common';
import { EntryPickerModal } from '../../library/editor/fields';
import { TurnEconomyFields } from '../../library/editor/HeroFields';
import { SPELL_ANIMATION_COLORS, spellLevelLabel } from '../../library/meta';
import { HIT_DICE, heroSpellFromEntry, type HitDie } from '../heroUtils';
import type { CreatorContext, CreatorState, DerivedSheet } from './state';
import { IssueList, Note, StepIntro } from './ui';

export interface ResourcesStepProps {
  state: CreatorState;
  onChange: (patch: Partial<CreatorState>) => void;
  ctx: CreatorContext;
  sheet: DerivedSheet;
  campaignId?: string;
  issues: string[];
}

function Suggestion({ value, suggested, onReset, children }: { value: number | null; suggested: number; onReset: () => void; children: ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-parchment-400">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {value !== null && value !== suggested && (
        <button type="button" onClick={onReset} className="inline-flex shrink-0 items-center gap-1 text-gold-300 transition hover:text-gold-200">
          <RotateCcw className="h-3 w-3" /> Usar {suggested}
        </button>
      )}
    </div>
  );
}

function Locked({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-950/50 px-3 text-sm text-parchment-100" title="Fijado por las reglas de la campaña">
        <span className="text-gold-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{value}</span>
        <Lock className="h-3.5 w-3.5 shrink-0 text-parchment-500" />
      </div>
    </div>
  );
}

export function ResourcesStep({ state, onChange, ctx, sheet, campaignId, issues }: ResourcesStepProps) {
  const [picking, setPicking] = useState(false);
  const rules = ctx.rules;
  const mode = rules.magic.mode;
  const resourceName = rules.magic.manaName.trim() || 'Recurso';
  const currency = rules.currency.enabled ? rules.currency.short.trim() || rules.currency.name.trim() : '';
  const dexKnown = ctx.attributes.some((a) => a.key === 'dex');
  const conKnown = ctx.attributes.some((a) => a.key === 'con');
  const spellsLabel = ENTRY_KIND_LABELS.spell.plural;
  const maxLevel = Math.max(1, Math.min(20, rules.heroCreation.maxLevel || 20));

  const addSpell = (spell: HeroSpell) => {
    if (spell.entryId && state.spells.some((s) => s.entryId === spell.entryId)) return;
    onChange({ spells: [...state.spells, spell] });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <StepIntro title="Recursos iniciales">
          Los valores sugeridos se calculan con la clase, los atributos y las reglas{ctx.fromCampaign ? ' de la campaña' : ''}. Puedes ajustarlos; el DM
          podrá cambiarlos durante la partida.
        </StepIntro>
        <IssueList messages={issues} />
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {ctx.fromCampaign ? (
          <Locked label="Nivel inicial" value={`Nivel ${state.level}`} icon={<Crown />} />
        ) : (
          <NumberInput label="Nivel inicial" integer min={1} max={maxLevel} value={state.level} onChange={(level) => onChange({ level, hpMax: null, manaMax: null })} />
        )}
        {rules.currency.enabled &&
          (ctx.fromCampaign ? (
            <Locked label={`${rules.currency.name || 'Oro'} inicial`} value={formatGold(state.gold, false, currency || null)} icon={<Coins />} />
          ) : (
            <NumberInput label={`${rules.currency.name || 'Oro'} inicial`} min={0} suffix={currency || undefined} value={state.gold} onChange={(gold) => onChange({ gold })} />
          ))}
        <TextInput label="Velocidad" value={state.speed} placeholder="9 m" onValueChange={(speed) => onChange({ speed })} />
      </section>

      <TurnEconomyFields
        speed={state.speed}
        moveCells={state.moveCells}
        actionsPerTurn={state.actionsPerTurn}
        onChange={(patch) => onChange(patch)}
      />

      <section className="rounded-xl border border-blood-700/40 bg-blood-500/[0.05] p-4">
        <SectionTitle icon={<Heart />}>Puntos de vida</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div>
            <div className="label">Dado de golpe</div>
            <Tabs<`d${HitDie}`>
              variant="pills"
              size="sm"
              aria-label="Dado de golpe"
              value={`d${sheet.hitDie}`}
              onChange={(v) => onChange({ hitDie: Number(v.slice(1)) as HitDie, hpMax: null })}
              items={HIT_DICE.map((d) => ({ id: `d${d}` as const, label: `d${d}`, title: d === sheet.suggestedHitDie ? 'Sugerido para la clase' : undefined }))}
            />
            <p className="mt-1 text-[11px] text-parchment-400">
              {sheet.className ? `Sugerido para ${sheet.className}: d${sheet.suggestedHitDie}` : 'Elige una clase para recibir una sugerencia.'}
            </p>
          </div>
          <div>
            <NumberInput
              label="PV máximos"
              integer
              min={1}
              max={9999}
              value={sheet.hpMax}
              onChange={(hpMax) => onChange({ hpMax })}
            />
            <Suggestion value={state.hpMax} suggested={sheet.suggestedHpMax} onReset={() => onChange({ hpMax: null })}>
              Sugerido: {sheet.suggestedHpMax} (d{sheet.hitDie} completo al nivel 1{state.level > 1 ? ', media por nivel' : ''}
              {conKnown ? ' + modificador de CON' : ''})
            </Suggestion>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {rules.showAc && (
          <div>
            <NumberInput label="Clase de armadura" integer min={0} max={40} value={sheet.ac} onChange={(ac) => onChange({ ac })} />
            <Suggestion value={state.ac} suggested={sheet.suggestedAc} onReset={() => onChange({ ac: null })}>
              <Shield className="mr-1 inline h-3 w-3" />
              Sin armadura: 10{dexKnown ? ' + DES' : ''} = {sheet.suggestedAc}
            </Suggestion>
          </div>
        )}
        {rules.showInitiative && (
          <div>
            <NumberInput
              label="Bonificador de iniciativa"
              integer
              min={-10}
              max={20}
              value={sheet.initiativeBonus}
              onChange={(initiativeBonus) => onChange({ initiativeBonus })}
            />
            <Suggestion value={state.initiativeBonus} suggested={sheet.suggestedInitiative} onReset={() => onChange({ initiativeBonus: null })}>
              {dexKnown ? `Modificador de DES: ${formatModifier(sheet.suggestedInitiative)}` : 'Sin atributo de destreza: 0'}
            </Suggestion>
          </div>
        )}
      </section>

      {mode !== 'none' && (
        <section className="rounded-xl border border-arcane-600/30 bg-arcane-500/[0.05] p-4">
          <SectionTitle icon={<Sparkles />}>{mode === 'mana' ? resourceName : mode === 'slots' ? 'Espacios de conjuro' : 'Usos limitados'}</SectionTitle>
          <div className="mt-3 flex flex-col gap-3">
            {mode === 'uses' ? (
              <Note>Esta campaña usa habilidades con usos limitados por descanso; el DM las añade en la ficha del héroe.</Note>
            ) : (
              <Note>
                {ctx.fromCampaign
                  ? `Las reglas de la campaña dan ${mode === 'mana' ? resourceName.toLowerCase() : 'espacios de conjuro'} a todos los héroes al entrar en la partida, también a los que no tienen poderes.`
                  : `Con las reglas genéricas se usa ${resourceName.toLowerCase()}. Al entrar en la partida, cada campaña da a todos sus héroes su propio recurso mágico (${resourceName.toLowerCase()}, espacios de conjuro…), también a los que no tienen poderes.`}{' '}
                Si el tuyo no tiene poderes, no le añadas {spellsLabel.toLowerCase()}; el DM puede ajustar o vaciar su recurso a mano durante la partida.
              </Note>
            )}
            {mode === 'mana' && (
              <div className="max-w-xs">
                <NumberInput
                  label={`${resourceName} máximo`}
                  integer
                  min={0}
                  max={9999}
                  value={sheet.resources.mana.max}
                  onChange={(manaMax) => onChange({ manaMax })}
                />
                <Suggestion value={state.manaMax} suggested={sheet.suggestedMana} onReset={() => onChange({ manaMax: null })}>
                  {sheet.resources.mana.max === 0 && sheet.suggestedMana > 0
                    ? ctx.fromCampaign
                      ? `Con 0, la campaña le dará ${sheet.suggestedMana} al entrar en la partida`
                      : 'Con 0, cada campaña le dará el que marquen sus reglas'
                    : `Sugerido: ${rules.magic.manaPerLevel} por nivel = ${sheet.suggestedMana}`}
                </Suggestion>
              </div>
            )}
            {mode === 'slots' && (
              <div className="flex flex-wrap gap-2">
                {sheet.resources.slots.length === 0 ? (
                  <p className="text-xs italic text-parchment-400">Sin espacios a este nivel según la tabla de la campaña.</p>
                ) : (
                  sheet.resources.slots.map((s) => (
                    <div key={s.level} className="rounded-lg border border-arcane-600/40 bg-arcane-500/[0.08] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-arcane-300">Nivel {s.level}</div>
                      <div className="mt-1 flex gap-1">
                        {Array.from({ length: s.max }, (_, i) => (
                          <span key={i} className="h-2.5 w-2.5 rotate-45 border border-arcane-300 bg-arcane-400" />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {sheet.showSpells && (
        <section>
          <SectionTitle
            icon={<Zap />}
            aside={
              <Button size="sm" variant="secondary" icon={<Library />} onClick={() => setPicking(true)}>
                Añadir desde la biblioteca
              </Button>
            }
          >
            {spellsLabel} iniciales
          </SectionTitle>
          <div className="mt-3">
            {state.spells.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink-500 bg-ink-950/30 px-3 py-5 text-center text-xs text-parchment-400">
                Ninguno todavía. Pide consejo al DM sobre cuáles puede conocer tu héroe, o déjalo vacío si no tiene poderes.
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {state.spells.map((s) => (
                  <li key={s.id} className="flex animate-fade-in items-center gap-2.5 rounded-lg border border-ink-600/60 bg-ink-950/40 px-3 py-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SPELL_ANIMATION_COLORS[s.animation], boxShadow: `0 0 8px ${SPELL_ANIMATION_COLORS[s.animation]}` }}
                      title={SPELL_ANIMATION_LABELS[s.animation]}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-parchment-50">{s.name}</span>
                    <span className="text-[11px] text-parchment-400">{spellLevelLabel(s.level)}</span>
                    {mode === 'mana' && s.manaCost > 0 && (
                      <span className="text-[11px] tabular-nums text-arcane-300" title={`Coste de ${resourceName.toLowerCase()}`}>
                        {s.manaCost} {resourceName.toLowerCase()}
                      </span>
                    )}
                    {mode === 'slots' && s.slotLevel > 0 && <span className="text-[11px] text-arcane-300">Espacio {s.slotLevel}</span>}
                    <button
                      type="button"
                      onClick={() => onChange({ spells: state.spells.filter((x) => x.id !== s.id) })}
                      aria-label={`Quitar ${s.name}`}
                      title="Quitar"
                      className={clsx('rounded-md p-1 text-parchment-400 transition hover:bg-blood-600/20 hover:text-blood-300')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <EntryPickerModal
            open={picking}
            kind="spell"
            multi
            campaignId={campaignId}
            title={`Añadir ${spellsLabel.toLowerCase()} a ${state.name.trim() || 'tu héroe'}`}
            onClose={() => setPicking(false)}
            onPick={(entry) => addSpell(heroSpellFromEntry(entry))}
          />
        </section>
      )}
    </div>
  );
}
