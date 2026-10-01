import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LimitedUse, SpellSlotState } from '@wailers/shared';
import { Stepper } from '../../../components/ui/Stepper';

// ---------------------------------------------------------------------------
// Mana-like resource (renamed per campaign: rules.magic.manaName)
// ---------------------------------------------------------------------------

export interface ManaBarProps {
  name: string;
  current: number;
  max: number;
  /** Delta-based change of the current value (spend −, restore +). */
  onDelta?: (delta: number) => void;
  /** Delta-based change of the maximum (DM). */
  onMaxDelta?: (delta: number) => void;
  compact?: boolean;
  className?: string;
}

/** Resource bar + optional steppers. */
export function ManaBar({ name, current, max, onDelta, onMaxDelta, compact = false, className }: ManaBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-arcane-300" title={name}>
          {name}
        </span>
        <div
          className={clsx('relative min-w-0 flex-1 overflow-hidden rounded-full border border-black/40 bg-ink-950/80', compact ? 'h-1.5' : 'h-2.5')}
          role="meter"
          aria-label={name}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={current}
          title={`${name}: ${current} / ${max}`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-arcane-600 via-arcane-500 to-arcane-300 shadow-[0_0_10px_rgba(169,139,255,0.55)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        {onDelta ? (
          <Stepper
            size="sm"
            tone="mana"
            value={current}
            min={0}
            max={Math.max(max, current)}
            onChange={(_next, delta) => onDelta(delta)}
            suffix={`/ ${max}`}
            title={`${name} actual`}
          />
        ) : (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-arcane-300">
            {current} <span className="font-normal text-parchment-400">/ {max}</span>
          </span>
        )}
      </div>
      {onMaxDelta && !compact && (
        <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-parchment-400">
          Máximo
          <Stepper size="sm" tone="mana" value={max} min={0} onChange={(_n, d) => onMaxDelta(d)} title={`${name} máximo`} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pips
// ---------------------------------------------------------------------------

interface PipRowProps {
  total: number;
  /** Pips still available (filled). */
  available: number;
  color: 'arcane' | 'gold';
  editable: boolean;
  /** delta used: +1 = spend one, −1 = recover one. */
  onUse: (delta: number) => void;
  label: string;
}

function PipRow({ total, available, color, editable, onUse, label }: PipRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < available;
        const cls = clsx(
          'h-3.5 w-3.5 rotate-45 rounded-[3px] border transition duration-150',
          filled
            ? color === 'arcane'
              ? 'border-arcane-300/80 bg-gradient-to-br from-arcane-300 to-arcane-600 shadow-[0_0_6px_rgba(169,139,255,0.7)]'
              : 'border-gold-300/80 bg-gradient-to-br from-gold-300 to-gold-600 shadow-[0_0_6px_rgba(233,192,99,0.6)]'
            : 'border-ink-400 bg-ink-950/70',
          editable && 'cursor-pointer hover:scale-125',
        );
        return editable ? (
          <button
            key={i}
            type="button"
            className={cls}
            title={filled ? `${label}: gastar uno` : `${label}: recuperar uno`}
            aria-label={filled ? `Gastar (${label})` : `Recuperar (${label})`}
            onClick={() => onUse(filled ? 1 : -1)}
          />
        ) : (
          <span key={i} className={cls} aria-hidden />
        );
      })}
    </div>
  );
}

export interface SlotPipsProps {
  slots: SpellSlotState[];
  /** delta used for that spell level. */
  onUse?: (level: number, delta: number) => void;
  className?: string;
  compact?: boolean;
}

/** Spell slots per level: filled diamonds = available. */
export function SlotPips({ slots, onUse, className, compact = false }: SlotPipsProps) {
  const list = slots.filter((s) => s.max > 0).sort((a, b) => a.level - b.level);
  if (list.length === 0) return <p className="text-[11px] italic text-parchment-400">Sin espacios de conjuro</p>;
  return (
    <div className={clsx(compact ? 'flex flex-wrap gap-x-3 gap-y-1' : 'space-y-1.5', className)}>
      {list.map((s) => (
        <div key={s.level} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-arcane-300">Nv {s.level}</span>
          <PipRow
            total={s.max}
            available={Math.max(0, s.max - s.used)}
            color="arcane"
            editable={!!onUse}
            onUse={(d) => onUse?.(s.level, d)}
            label={`Espacios de nivel ${s.level}`}
          />
          {!compact && (
            <span className="ml-auto text-[10px] tabular-nums text-parchment-400">
              {Math.max(0, s.max - s.used)}/{s.max}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export interface UsePipsProps {
  uses: LimitedUse[];
  onUse?: (useId: string, delta: number) => void;
  /** DM: remove a use definition. */
  renderActions?: (use: LimitedUse) => ReactNode;
  className?: string;
  compact?: boolean;
}

/** Limited uses (per short / long rest). */
export function UsePips({ uses, onUse, renderActions, className, compact = false }: UsePipsProps) {
  if (uses.length === 0) return <p className="text-[11px] italic text-parchment-400">Sin usos limitados</p>;
  return (
    <div className={clsx('space-y-1.5', className)}>
      {uses.map((u) => (
        <div key={u.id} className="flex items-center gap-2">
          <span className={clsx('min-w-0 shrink truncate text-xs text-parchment-100', compact ? 'max-w-[6rem]' : 'w-28')} title={u.name}>
            {u.name}
          </span>
          <PipRow
            total={u.max}
            available={Math.max(0, u.max - u.used)}
            color="gold"
            editable={!!onUse}
            onUse={(d) => onUse?.(u.id, d)}
            label={u.name}
          />
          {!compact && (
            <span className="ml-auto shrink-0 text-[10px] text-parchment-400" title={u.resetOn === 'short' ? 'Se recupera con un descanso corto' : 'Se recupera con un descanso largo'}>
              {u.resetOn === 'short' ? 'D. corto' : 'D. largo'}
            </span>
          )}
          {renderActions?.(u)}
        </div>
      ))}
    </div>
  );
}
