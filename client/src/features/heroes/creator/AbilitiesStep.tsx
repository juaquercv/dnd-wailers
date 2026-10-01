import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Dices, Eraser, ListOrdered, RotateCcw } from 'lucide-react';
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  abilityModifier,
  formatModifier,
  pointBuyCost,
  rollFormula,
  secureRandom,
  type AttributeDef,
} from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Select } from '../../../components/ui/Select';
import { Stepper } from '../../../components/ui/Stepper';
import {
  FREE_MAX,
  FREE_MIN,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  arraySlots,
  finalAbilities,
  pointBuySpent,
  type AbilityRoll,
  type CreatorContext,
  type CreatorState,
} from './state';
import { IssueList, Note, StepIntro } from './ui';

export interface AbilitiesStepProps {
  state: CreatorState;
  onChange: (patch: Partial<CreatorState>) => void;
  ctx: CreatorContext;
  issues: string[];
}

const METHOD_TEXT: Record<CreatorContext['method'], { title: string; text: string }> = {
  free: { title: 'Puntuaciones libres', text: `Escribe cada puntuación (de ${FREE_MIN} a ${FREE_MAX}) o tira los dados: 4d6 descartando el menor.` },
  standard_array: {
    title: 'Tabla estándar',
    text: `Reparte los valores ${STANDARD_ARRAY.join(', ')} entre tus atributos. Cada valor se usa una sola vez.`,
  },
  point_buy: {
    title: 'Compra de puntos',
    text: `Todos empiezan en ${POINT_BUY_MIN}. Tienes ${POINT_BUY_BUDGET} puntos para subirlos hasta ${POINT_BUY_MAX}; los valores altos cuestan más.`,
  },
};

const HINTS: Record<string, string> = {
  con: 'Afecta a los PV',
  dex: 'Afecta a la CA y la iniciativa',
};

function rollAbility(): { total: number; roll: AbilityRoll } {
  const outcome = rollFormula('4d6kh3', 'normal', secureRandom);
  const dice = outcome.dice.map((d) => d.value);
  const dropped = Math.max(0, outcome.dice.findIndex((d) => d.dropped));
  return { total: outcome.total, roll: { dice, dropped } };
}

function AttributeCard({ attr, score, children, footer }: { attr: AttributeDef; score: number; children: ReactNode; footer?: ReactNode }) {
  const mod = abilityModifier(score);
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-ink-600/70 bg-gradient-to-b from-ink-800 to-ink-900 px-2 pb-2.5 pt-2 shadow-[inset_0_1px_0_rgba(243,234,214,0.05)]">
      <div className="text-center">
        <div className="text-[11px] font-bold tracking-[0.14em] text-gold-400">{attr.short}</div>
        <div className="truncate text-xs text-parchment-300" title={attr.label}>
          {attr.label}
        </div>
      </div>
      <div
        className={clsx(
          'flex h-12 w-12 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums transition',
          mod > 0 ? 'border-emerald-500/60 text-emerald-200' : mod < 0 ? 'border-blood-500/60 text-blood-200' : 'border-ink-400 text-parchment-100',
        )}
        title="Modificador"
      >
        {formatModifier(mod)}
      </div>
      <div className="w-full">{children}</div>
      {footer}
      {HINTS[attr.key] && <div className="text-center text-[10px] leading-tight text-parchment-500">{HINTS[attr.key]}</div>}
    </div>
  );
}

export function AbilitiesStep({ state, onChange, ctx, issues }: AbilitiesStepProps) {
  const attrs = ctx.attributes;
  const final = finalAbilities(state, ctx);
  const info = METHOD_TEXT[ctx.method];

  if (attrs.length === 0) {
    return (
      <div>
        <StepIntro title="Atributos" />
        <Note>Esta campaña no usa atributos. Puedes pasar al siguiente paso.</Note>
      </div>
    );
  }

  const rollAll = () => {
    const scores = { ...state.scores };
    const rolls: CreatorState['rolls'] = {};
    for (const a of attrs) {
      const { total, roll } = rollAbility();
      scores[a.key] = total;
      rolls[a.key] = roll;
    }
    onChange({ scores, rolls });
  };

  const resetScores = (value: number) => {
    const scores = { ...state.scores };
    for (const a of attrs) scores[a.key] = value;
    onChange({ scores, rolls: {} });
  };

  const assignInOrder = () => {
    const assigned: CreatorState['assigned'] = {};
    attrs.forEach((a, i) => {
      assigned[a.key] = STANDARD_ARRAY[i] ?? null;
    });
    onChange({ assigned });
  };

  const spent = ctx.method === 'point_buy' ? pointBuySpent(state, ctx) : 0;
  const remaining = POINT_BUY_BUDGET - spent;
  const assignedCount = attrs.filter((a) => typeof state.assigned[a.key] === 'number').length;
  const slots = arraySlots(ctx);

  return (
    <div>
      <StepIntro title={info.title}>{info.text}</StepIntro>
      <IssueList messages={issues} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ctx.method === 'free' && (
          <>
            <Button size="sm" variant="primary" icon={<Dices />} onClick={rollAll}>
              Tirar 4d6 para todos
            </Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => resetScores(10)}>
              Todos a 10
            </Button>
          </>
        )}
        {ctx.method === 'standard_array' && (
          <>
            <Button size="sm" variant="secondary" icon={<ListOrdered />} onClick={assignInOrder}>
              Asignar en orden
            </Button>
            <Button size="sm" variant="ghost" icon={<Eraser />} disabled={assignedCount === 0} onClick={() => onChange({ assigned: {} })}>
              Limpiar
            </Button>
            <span className="ml-auto text-xs text-parchment-400">
              {assignedCount} de {slots} asignados
            </span>
          </>
        )}
        {ctx.method === 'point_buy' && (
          <>
            <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-parchment-200">Puntos gastados</span>
                <span className={clsx('tabular-nums font-bold', remaining < 0 ? 'text-blood-300' : remaining === 0 ? 'text-emerald-300' : 'text-gold-200')}>
                  {spent} / {POINT_BUY_BUDGET}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-ink-600 bg-ink-950">
                <div
                  className={clsx('h-full rounded-full transition-all', remaining < 0 ? 'bg-blood-500' : 'bg-gradient-to-r from-gold-600 to-gold-300')}
                  style={{ width: `${Math.min(100, (spent / POINT_BUY_BUDGET) * 100)}%` }}
                />
              </div>
            </div>
            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => resetScores(POINT_BUY_MIN)}>
              Reiniciar
            </Button>
          </>
        )}
      </div>

      <div className={clsx('grid gap-2.5', attrs.length <= 6 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4')}>
        {attrs.map((a) => {
          const score = final[a.key] ?? 10;
          if (ctx.method === 'standard_array') {
            const taken = new Set(
              attrs.filter((o) => o.key !== a.key).map((o) => state.assigned[o.key]).filter((v): v is number => typeof v === 'number'),
            );
            const value = state.assigned[a.key] ?? null;
            return (
              <AttributeCard key={a.key} attr={a} score={value ?? 10}>
                <Select<number | null>
                  size="sm"
                  aria-label={`Valor de ${a.label}`}
                  value={value}
                  className={clsx('text-center font-semibold', value === null && 'border-dashed')}
                  onChange={(v) => onChange({ assigned: { ...state.assigned, [a.key]: v } })}
                  options={[
                    { value: null, label: '—' },
                    ...STANDARD_ARRAY.map((v) => ({ value: v, label: String(v), disabled: taken.has(v) })),
                  ]}
                />
              </AttributeCard>
            );
          }
          if (ctx.method === 'point_buy') {
            const current = state.scores[a.key] ?? POINT_BUY_MIN;
            const nextCost = current < POINT_BUY_MAX ? pointBuyCost(current + 1) - pointBuyCost(current) : Infinity;
            return (
              <AttributeCard
                key={a.key}
                attr={a}
                score={score}
                footer={<div className="text-[10px] text-parchment-400">Coste: {pointBuyCost(current)} pts</div>}
              >
                <div className="flex justify-center">
                  <Stepper
                    size="sm"
                    value={current}
                    min={POINT_BUY_MIN}
                    max={current + (nextCost <= remaining ? 1 : 0)}
                    bigStep={1}
                    editable={false}
                    onChange={(next) => onChange({ scores: { ...state.scores, [a.key]: Math.min(POINT_BUY_MAX, Math.max(POINT_BUY_MIN, next)) } })}
                  />
                </div>
              </AttributeCard>
            );
          }
          const roll = state.rolls[a.key];
          return (
            <AttributeCard
              key={a.key}
              attr={a}
              score={score}
              footer={
                roll ? (
                  <div className="flex items-center gap-0.5" title="Última tirada (el dado tachado se descarta)">
                    {roll.dice.map((d, i) => (
                      <span
                        key={i}
                        className={clsx(
                          'flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold tabular-nums',
                          i === roll.dropped ? 'border-ink-600 text-parchment-500 line-through' : 'border-gold-700/60 bg-gold-500/10 text-gold-200',
                        )}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : null
              }
            >
              <NumberInput
                size="sm"
                integer
                min={FREE_MIN}
                max={FREE_MAX}
                value={state.scores[a.key] ?? 10}
                aria-label={a.label}
                className="text-center font-display text-base font-bold"
                onChange={(v) => {
                  const rolls = { ...state.rolls };
                  delete rolls[a.key];
                  onChange({ scores: { ...state.scores, [a.key]: v }, rolls });
                }}
              />
            </AttributeCard>
          );
        })}
      </div>

      {ctx.method === 'standard_array' && attrs.length > STANDARD_ARRAY.length && (
        <div className="mt-4">
          <Note>La tabla estándar tiene {STANDARD_ARRAY.length} valores; los atributos sin valor quedan en 10.</Note>
        </div>
      )}
    </div>
  );
}
