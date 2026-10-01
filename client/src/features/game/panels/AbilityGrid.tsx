import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import { abilityModifier, formatModifier, type AbilityScores, type AttributeDef } from '@wailers/shared';
import { useDraft } from './actions';

export interface AbilityGridProps {
  attributes: AttributeDef[];
  abilities: AbilityScores;
  /** DM: receives the whole abilities object (debounced). */
  onChange?: (next: AbilityScores) => void;
  className?: string;
}

function sameScores(a: AbilityScores, b: AbilityScores): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/** Ability scores (only the attributes enabled by the campaign) with display-only modifiers. */
export function AbilityGrid({ attributes, abilities, onChange, className }: AbilityGridProps) {
  const enabled = attributes.filter((a) => a.enabled);
  const [draft, setDraft] = useDraft<AbilityScores>(abilities, (v) => onChange?.(v), 500, sameScores);

  if (enabled.length === 0) return <p className="text-xs italic text-parchment-400">Esta campaña no usa atributos.</p>;

  const bump = (key: string, delta: number) => {
    const cur = draft[key] ?? 10;
    const next = Math.min(30, Math.max(1, cur + delta));
    if (next !== cur) setDraft({ ...draft, [key]: next });
  };

  return (
    <div className={clsx('grid grid-cols-3 gap-1.5', className)}>
      {enabled.map((attr) => {
        const score = draft[attr.key] ?? 10;
        const mod = abilityModifier(score);
        return (
          <div
            key={attr.key}
            className="group relative flex flex-col items-center rounded-lg border border-ink-600/80 bg-gradient-to-b from-ink-800 to-ink-900 px-1 pb-1 pt-1.5 shadow-[inset_0_1px_0_rgba(243,234,214,0.05)]"
            title={`${attr.label}: ${score} (${formatModifier(mod)})`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400">{attr.short}</span>
            <span className={clsx('font-display text-xl font-bold leading-6', mod > 0 ? 'text-parchment-50' : mod < 0 ? 'text-blood-300' : 'text-parchment-200')}>
              {formatModifier(mod)}
            </span>
            <div className="mt-0.5 flex items-center gap-0.5">
              {onChange && (
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded text-parchment-400 opacity-0 transition hover:bg-ink-600 hover:text-parchment-50 focus:opacity-100 group-hover:opacity-100"
                  onClick={(e) => bump(attr.key, e.shiftKey ? -5 : -1)}
                  aria-label={`Restar 1 a ${attr.label}`}
                  title="−1 (Mayús: −5)"
                >
                  <Minus className="h-2.5 w-2.5" />
                </button>
              )}
              <span className="min-w-[1.5rem] rounded-full border border-ink-500 bg-ink-950/70 px-1.5 text-center text-[11px] font-semibold tabular-nums text-parchment-200">
                {score}
              </span>
              {onChange && (
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded text-parchment-400 opacity-0 transition hover:bg-ink-600 hover:text-parchment-50 focus:opacity-100 group-hover:opacity-100"
                  onClick={(e) => bump(attr.key, e.shiftKey ? 5 : 1)}
                  aria-label={`Sumar 1 a ${attr.label}`}
                  title="+1 (Mayús: +5)"
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
