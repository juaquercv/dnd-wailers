import type { MouseEvent, ReactNode } from 'react';
import clsx from 'clsx';
import { Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { RollMode } from '@wailers/shared';
import { toast } from '../../components/ui/toast';
import { DieGlyph } from './DieShapes';
import {
  addBonus,
  addDie,
  BONUS_STEPS,
  canAddDie,
  EMPTY_POOL,
  formatBonus,
  MAX_POOL_DICE,
  POOL_DICE,
  poolAllowsAdvantage,
  poolCountOf,
  poolDiceCount,
  poolFormula,
  poolIsEmpty,
  poolRange,
  prettyFormula,
  setDieCount,
  type DicePool,
  type PoolDie,
} from './dicePool';
import { MODE_LABELS } from './diceUtils';
import { Segmented, type SegmentedOption } from './Segmented';

export interface DicePoolBuilderProps {
  pool: DicePool;
  onChange: (pool: DicePool) => void;
  /** Advantage / disadvantage selector (hidden when onModeChange is not given). */
  mode?: RollMode;
  onModeChange?: (mode: RollMode) => void;
  disabled?: boolean;
  /** Smaller buttons (forms inside other sections). */
  compact?: boolean;
  /** Text shown while the table is empty. */
  emptyHint?: ReactNode;
}

const MODE_OPTIONS: SegmentedOption<RollMode>[] = [
  { value: 'normal', label: MODE_LABELS.normal },
  { value: 'advantage', label: MODE_LABELS.advantage, title: 'Ventaja: se tiran dos d20 y se queda el mayor' },
  { value: 'disadvantage', label: MODE_LABELS.disadvantage, title: 'Desventaja: se tiran dos d20 y se queda el menor' },
];

/** Mode actually sent: advantage only applies with exactly one d20 on the table. */
export function effectivePoolMode(pool: DicePool, mode: RollMode): RollMode {
  return poolAllowsAdvantage(pool) ? mode : 'normal';
}

/**
 * "Mesa de dados": big buttons add dice (right click removes one), the table groups them by type and a
 * flat bonus is adjusted only with ±1/±5/±10 buttons. No formula typing.
 */
export function DicePoolBuilder({ pool, onChange, mode = 'normal', onModeChange, disabled = false, compact = false, emptyHint }: DicePoolBuilderProps) {
  const total = poolDiceCount(pool);
  const formula = poolFormula(pool);
  const range = poolRange(pool);
  const advantageOk = poolAllowsAdvantage(pool);

  const add = (sides: PoolDie, delta: number) => {
    if (delta > 0 && !canAddDie(pool)) {
      toast.warning(`Como mucho ${MAX_POOL_DICE} dados por tirada`);
      return;
    }
    onChange(addDie(pool, sides, delta));
  };

  const onDieContextMenu = (e: MouseEvent, sides: PoolDie) => {
    e.preventDefault();
    if (poolCountOf(pool, sides) > 0) onChange(addDie(pool, sides, -1));
  };

  return (
    <div className={clsx('space-y-2.5', disabled && 'pointer-events-none opacity-60')} aria-disabled={disabled || undefined}>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-parchment-300">Elige los dados</span>
          <span className="text-[10px] text-parchment-400">Clic: añadir · Clic derecho: quitar</span>
        </div>
        <div className={clsx('grid gap-1.5', compact ? 'grid-cols-7' : 'grid-cols-4 gap-2')}>
          {POOL_DICE.map((sides) => (
            <DieButton
              key={sides}
              sides={sides}
              count={poolCountOf(pool, sides)}
              compact={compact}
              featured={!compact && sides === 20}
              onAdd={() => add(sides, 1)}
              onContextMenu={(e) => onDieContextMenu(e, sides)}
            />
          ))}
        </div>
      </div>

      <div
        className={clsx(
          'relative overflow-hidden rounded-xl border border-gold-700/35 bg-ink-950/80 shadow-[inset_0_2px_14px_rgba(0,0,0,0.65)]',
          compact ? 'p-2' : 'p-2.5',
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(233,192,99,0.09),transparent_70%)]" />
        <div className="relative">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">
              En la mesa{total > 0 && <span className="ml-1 text-parchment-400">({total} {total === 1 ? 'dado' : 'dados'})</span>}
            </span>
            <button
              type="button"
              disabled={poolIsEmpty(pool)}
              onClick={() => onChange(EMPTY_POOL)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-parchment-300 transition hover:bg-blood-500/15 hover:text-blood-300 disabled:pointer-events-none disabled:opacity-35"
              title="Quitar todos los dados y el bono"
            >
              <Trash2 className="h-3 w-3" />
              Vaciar
            </button>
          </div>

          {pool.groups.length === 0 ? (
            <div className="flex min-h-[3.25rem] items-center justify-center rounded-lg border border-dashed border-ink-500/80 px-3 py-2 text-center text-xs text-parchment-400">
              {emptyHint ?? 'Toca un dado de arriba para ponerlo en la mesa.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {pool.groups.map((g) => (
                <GroupRow
                  key={g.sides}
                  sides={g.sides}
                  count={g.count}
                  compact={compact}
                  onMinus={() => add(g.sides, -1)}
                  onPlus={() => add(g.sides, 1)}
                  onRemove={() => onChange(setDieCount(pool, g.sides, 0))}
                />
              ))}
            </ul>
          )}

          <BonusRow bonus={pool.bonus} onStep={(d) => onChange(addBonus(pool, d))} onReset={() => onChange({ ...pool, bonus: 0 })} />

          <div className="mt-2 flex min-h-[1.25rem] flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 border-t border-ink-600/60 pt-1.5 text-center">
            {formula ? (
              <>
                <span className="font-mono text-[13px] font-semibold text-gold-200">{prettyFormula(formula)}</span>
                {range && (
                  <span className="text-[11px] text-parchment-400">
                    {range.min === range.max ? `siempre ${range.min}` : `entre ${range.min} y ${range.max}`}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-parchment-400">{pool.bonus !== 0 ? 'Añade al menos un dado' : 'Sin dados todavía'}</span>
            )}
          </div>
        </div>
      </div>

      {onModeChange && advantageOk && (
        <div className="animate-fade-in">
          <span className="label">Modo</span>
          <Segmented value={mode} onChange={onModeChange} ariaLabel="Modo de tirada" options={MODE_OPTIONS} />
        </div>
      )}
    </div>
  );
}

function DieButton({
  sides,
  count,
  compact,
  featured,
  onAdd,
  onContextMenu,
}: {
  sides: PoolDie;
  count: number;
  compact: boolean;
  featured: boolean;
  onAdd: () => void;
  onContextMenu: (e: MouseEvent) => void;
}) {
  const name = `d${sides}`;
  return (
    <button
      type="button"
      onClick={onAdd}
      onContextMenu={onContextMenu}
      aria-label={count > 0 ? `Añadir un ${name} (hay ${count} en la mesa)` : `Añadir un ${name}`}
      title={`Añadir un ${name} · Clic derecho: quitar uno`}
      className={clsx(
        'group relative flex select-none items-center justify-center rounded-xl border bg-gradient-to-b from-ink-700/90 to-ink-800 shadow-[inset_0_1px_0_rgba(243,234,214,0.07),0_6px_12px_-8px_rgba(0,0,0,0.95)] transition duration-150',
        'hover:-translate-y-0.5 hover:border-gold-600/80 hover:from-ink-600/90 hover:shadow-glow-gold active:translate-y-0 active:scale-95',
        count > 0 ? 'border-gold-600/60' : 'border-ink-600',
        featured ? 'col-span-2 gap-2.5 px-2 py-2' : compact ? 'flex-col gap-0 px-0.5 pb-1 pt-1' : 'flex-col gap-0.5 px-1 pb-1.5 pt-2',
      )}
    >
      <DieGlyph
        sides={sides}
        size={featured ? 48 : compact ? 28 : 40}
        className="drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)] transition duration-300 group-hover:rotate-12 group-hover:scale-110 group-active:rotate-45"
      />
      <span className={clsx('font-bold leading-none tracking-wide text-parchment-100', featured ? 'text-lg' : compact ? 'text-[10px]' : 'text-[13px]')}>{name}</span>
      {count > 0 && (
        <span
          key={count}
          className={clsx(
            'absolute flex animate-pop items-center justify-center rounded-full bg-gold-sheen font-bold leading-none text-ink-950 ring-2 ring-ink-900',
            compact ? '-right-1 -top-1 h-4 min-w-[1rem] px-0.5 text-[9px]' : '-right-1.5 -top-1.5 h-5 min-w-[1.25rem] px-1 text-[11px]',
          )}
          aria-hidden
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SmallStep({ icon, title, onClick, danger = false }: { icon: ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={clsx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition active:scale-90 [&>svg]:h-3.5 [&>svg]:w-3.5',
        danger
          ? 'border-transparent text-parchment-400 hover:border-blood-500/50 hover:bg-blood-500/15 hover:text-blood-300'
          : 'border-ink-500 bg-ink-700/80 text-parchment-200 hover:border-gold-600/70 hover:text-gold-200',
      )}
    >
      {icon}
    </button>
  );
}

function GroupRow({
  sides,
  count,
  compact,
  onMinus,
  onPlus,
  onRemove,
}: {
  sides: PoolDie;
  count: number;
  compact: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onRemove: () => void;
}) {
  const stack = Math.min(count, compact ? 3 : 5);
  const glyph = compact ? 22 : 26;
  return (
    <li className="flex animate-scale-in items-center gap-2 rounded-lg border border-ink-600/80 bg-ink-800/80 py-1 pl-1.5 pr-1">
      <span className="flex shrink-0 items-center" style={{ width: glyph + (stack - 1) * (glyph * 0.42) }} aria-hidden>
        {Array.from({ length: stack }, (_, i) => (
          <span key={i} className="shrink-0" style={{ marginLeft: i === 0 ? 0 : -glyph * 0.58, zIndex: stack - i }}>
            <DieGlyph sides={sides} size={glyph} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-parchment-50">
        <span key={count} className="inline-block animate-pop text-base tabular-nums text-gold-200">
          {count}
        </span>{' '}
        <span className="text-parchment-300">×</span> d{sides}
      </span>
      <SmallStep icon={<Minus />} title={`Quitar un d${sides}`} onClick={onMinus} />
      <SmallStep icon={<Plus />} title={`Añadir un d${sides}`} onClick={onPlus} />
      <SmallStep icon={<X />} title={`Quitar todos los d${sides}`} onClick={onRemove} danger />
    </li>
  );
}

function BonusRow({ bonus, onStep, onReset }: { bonus: number; onStep: (delta: number) => void; onReset: () => void }) {
  const negative = BONUS_STEPS.filter((s) => s < 0);
  const positive = BONUS_STEPS.filter((s) => s > 0);
  const stepButton = (step: number) => (
    <button
      key={step}
      type="button"
      onClick={() => onStep(step)}
      title={`${step > 0 ? 'Sumar' : 'Restar'} ${Math.abs(step)} al bono`}
      className={clsx(
        'h-8 rounded-md border text-xs font-bold tabular-nums transition active:scale-90',
        step > 0
          ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-200 hover:border-emerald-500/70 hover:bg-emerald-800/30'
          : 'border-blood-700/60 bg-blood-800/20 text-blood-300 hover:border-blood-500/70 hover:bg-blood-700/30',
      )}
    >
      {step > 0 ? `+${step}` : `−${Math.abs(step)}`}
    </button>
  );
  return (
    <div className="mt-2">
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] items-center gap-1">
        {negative.map(stepButton)}
        <button
          type="button"
          onClick={onReset}
          disabled={bonus === 0}
          title={bonus === 0 ? 'Bono' : 'Poner el bono a 0'}
          className="group relative flex h-10 flex-col items-center justify-center rounded-md border border-ink-500 bg-ink-900 leading-none transition enabled:hover:border-gold-600/70 disabled:cursor-default"
        >
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-parchment-400">Bono</span>
          <span
            key={bonus}
            className={clsx(
              'mt-0.5 animate-pop text-base font-bold tabular-nums',
              bonus > 0 ? 'text-emerald-300' : bonus < 0 ? 'text-blood-300' : 'text-parchment-400',
            )}
          >
            {formatBonus(bonus)}
          </span>
          {bonus !== 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink-600 text-parchment-200 ring-2 ring-ink-950 transition group-hover:bg-gold-500 group-hover:text-ink-950" aria-hidden>
              <RotateCcw className="h-2.5 w-2.5" />
            </span>
          )}
        </button>
        {positive.map(stepButton)}
      </div>
    </div>
  );
}
