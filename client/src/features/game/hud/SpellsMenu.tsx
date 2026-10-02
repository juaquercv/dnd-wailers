import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Flame, Info, WandSparkles } from 'lucide-react';
import { SPELL_ANIMATION_LABELS, type HeroSheet, type HeroSpell, type RuleSystem } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { send } from '../panels/actions';
import { SPELL_ANIMATION_ICONS, spellCostLabel, spellLevelLabel } from '../panels/SpellList';
import { actionsText, type HeroEconomy } from './economy';

export interface SpellsMenuProps {
  hero: HeroSheet;
  rules: RuleSystem;
  eco: HeroEconomy;
  /** May spend mana / slots by hand. */
  canSpend: boolean;
  readOnly: boolean;
  onCast: (spell: HeroSpell) => void;
}

/** Whether the hero has what the spell costs (only a hint: casting never spends by itself). */
function affordable(spell: HeroSpell, hero: HeroSheet, rules: RuleSystem): boolean {
  if (rules.magic.mode === 'mana') return hero.data.resources.mana.current >= spell.manaCost;
  if (rules.magic.mode === 'slots' && spell.slotLevel > 0) {
    const slot = hero.data.resources.slots.find((s) => s.level === spell.slotLevel);
    return !!slot && slot.used < slot.max;
  }
  return true;
}

/** Economy line shown on top of the spell and item lists. */
export function CostNotice({ eco, what }: { eco: HeroEconomy; what: string }) {
  if (eco.actionBlock) {
    return (
      <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {eco.actionBlock}
      </p>
    );
  }
  if (!eco.limited) return null;
  return (
    <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-blood-500/30 bg-blood-600/10 px-2.5 py-1.5 text-[11px] leading-snug text-parchment-200">
      <Info className="mt-px h-3.5 w-3.5 shrink-0 text-blood-300" aria-hidden />
      <span>
        {what} gasta <strong className="text-parchment-50">1 acción de combate</strong> (te {eco.actions.left === 1 ? 'queda' : 'quedan'} {actionsText(eco.actions.left)}).
      </span>
    </p>
  );
}

/** HUD list of the hero's spells: "Lanzar" asks the map for a target. */
export function SpellsMenu({ hero, rules, eco, canSpend, readOnly, onCast }: SpellsMenuProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const spells = useMemo(
    () => [...hero.data.spells].sort((a, b) => Number(b.prepared) - Number(a.prepared) || a.level - b.level || a.name.localeCompare(b.name, 'es')),
    [hero.data.spells],
  );
  const mode = rules.magic.mode;

  if (spells.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <WandSparkles className="mx-auto mb-2 h-6 w-6 text-parchment-400" aria-hidden />
        <p className="text-sm font-semibold text-parchment-200">Sin hechizos</p>
        <p className="mt-1 text-xs text-parchment-400">Tu héroe no conoce hechizos ni poderes. El DM puede añadirlos a tu ficha.</p>
      </div>
    );
  }

  const spend = (spell: HeroSpell) => {
    if (mode === 'mana' && spell.manaCost > 0) void send('hero:mana', { heroId: hero.id, delta: -spell.manaCost }, { success: `−${spell.manaCost} ${rules.magic.manaName}` });
    else if (mode === 'slots' && spell.slotLevel > 0) void send('hero:slot', { heroId: hero.id, level: spell.slotLevel, delta: 1 }, { success: `Espacio de nivel ${spell.slotLevel} gastado` });
  };

  return (
    <div>
      <CostNotice eco={eco} what="Lanzar un hechizo" />
      <ul className="space-y-1">
        {spells.map((spell) => {
          const cost = spellCostLabel(spell, rules);
          const open = expanded === spell.id;
          const enough = affordable(spell, hero, rules);
          const hasCost = (mode === 'mana' && spell.manaCost > 0) || (mode === 'slots' && spell.slotLevel > 0);
          return (
            <li key={spell.id} className={clsx('rounded-xl border transition', open ? 'border-arcane-500/50 bg-ink-800' : 'border-ink-600/60 bg-ink-800/50 hover:border-ink-500')}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-arcane-500/40 bg-arcane-500/10 text-lg"
                  title={SPELL_ANIMATION_LABELS[spell.animation] ?? spell.animation}
                  aria-hidden
                >
                  {SPELL_ANIMATION_ICONS[spell.animation] ?? '✨'}
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(open ? null : spell.id)} aria-expanded={open} title="Ver descripción">
                  <span className={clsx('block truncate text-sm font-semibold', spell.prepared ? 'text-parchment-50' : 'text-parchment-300')}>{spell.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[10px] text-parchment-400">
                    <span>{spellLevelLabel(spell.level)}</span>
                    {cost && <span className={enough ? 'text-arcane-300' : 'text-blood-300'}>{cost}{!enough && ' · no te alcanza'}</span>}
                    {eco.limited && <span className="text-blood-300">1 acción</span>}
                    {!spell.prepared && <span className="italic">no preparado</span>}
                  </span>
                </button>
                {canSpend && hasCost && !readOnly && (
                  <IconButton
                    icon={<Flame />}
                    title={mode === 'mana' ? `Gastar ${spell.manaCost} ${rules.magic.manaName}` : `Gastar un espacio de nivel ${spell.slotLevel}`}
                    size="sm"
                    disabled={!enough}
                    className="text-arcane-300"
                    onClick={() => spend(spell)}
                  />
                )}
                <Button
                  size="sm"
                  variant="primary"
                  icon={<WandSparkles />}
                  disabled={readOnly || !!eco.actionBlock}
                  title={readOnly ? 'Vista previa: solo el jugador puede lanzar' : eco.actionBlock ?? 'Elige el objetivo en el mapa'}
                  onClick={() => onCast(spell)}
                >
                  Lanzar
                </Button>
              </div>
              {open && (
                <div className="animate-fade-in border-t border-ink-600/60 px-3 py-2 text-xs leading-relaxed text-parchment-300">
                  {spell.description ? <p className="whitespace-pre-line">{spell.description}</p> : <p className="italic text-parchment-400">Sin descripción.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(mode === 'mana' || mode === 'slots') && (
        <p className="mt-2 px-1 text-[10px] leading-snug text-parchment-400">
          {canSpend ? (
            <>
              Lanzar no gasta {mode === 'mana' ? rules.magic.manaName : 'espacios'} por sí solo: usa{' '}
              <Flame className="inline h-3 w-3 text-arcane-300" aria-hidden /> para gastarlo.
            </>
          ) : (
            <>El DM descuenta el coste de tu ficha.</>
          )}
        </p>
      )}
    </div>
  );
}
