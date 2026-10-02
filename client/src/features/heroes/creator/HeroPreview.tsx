import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Coins, Crown, Footprints, Heart, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import { ENTRY_KIND_LABELS, formatModifier, heroMoveCells } from '@wailers/shared';
import { Avatar } from '../../../components/ui/Avatar';
import { formatGold, formatNumber } from '../../../lib/format';
import { CategoryChip } from '../../library/common';
import { AbilityGrid } from '../../library/EntryDetails';
import { SPELL_ANIMATION_COLORS, spellLevelLabel } from '../../library/meta';
import { selectedCategoryIds, type CreatorContext, type CreatorState, type DerivedSheet } from './state';

export interface HeroPreviewProps {
  state: CreatorState;
  sheet: DerivedSheet;
  ctx: CreatorContext;
  ownerName: string | null;
  ownerColor: string | null;
  /** Full summary (last step) instead of the compact side card. */
  full?: boolean;
}

function Stat({ icon, label, value, color }: { icon: ReactNode; label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-lg border border-ink-600/60 bg-ink-950/40 px-1.5 py-1.5 text-center">
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-parchment-400 [&>svg]:h-3 [&>svg]:w-3">
        {icon}
        {label}
      </span>
      <span className="mt-0.5 truncate font-display text-base font-bold leading-tight text-parchment-50" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** Hero sheet preview that updates as the wizard is filled in. */
export function HeroPreview({ state, sheet, ctx, ownerName, ownerColor, full = false }: HeroPreviewProps) {
  const rules = ctx.rules;
  const name = state.name.trim() || 'Héroe sin nombre';
  const categories = selectedCategoryIds(state);
  const mode = rules.magic.mode;
  const resourceName = rules.magic.manaName.trim() || 'Recurso';
  const currency = rules.currency.enabled ? rules.currency.short.trim() || rules.currency.name.trim() : '';

  return (
    <div className={clsx('flex flex-col gap-3', full && 'gap-5')}>
      <div className={clsx('flex items-center gap-3', full ? 'flex-row' : 'flex-col text-center')}>
        <div className="relative">
          <span aria-hidden className="absolute inset-[-6px] rounded-full bg-gold-500/20 blur-md" />
          <Avatar
            name={name}
            imageUrl={state.imageUrl}
            color={ownerColor ?? '#d4a63f'}
            size={full ? 104 : 84}
            ring
            className="relative"
          />
        </div>
        <div className="min-w-0">
          <h4 className={clsx('title-epic leading-tight', full ? 'text-3xl' : 'text-xl', !state.name.trim() && 'opacity-60')}>{name}</h4>
          <p className="mt-0.5 text-xs text-parchment-300">
            Nivel {state.level}
            {ownerName && <> · de {ownerName}</>}
          </p>
        </div>
      </div>

      {categories.length > 0 ? (
        <div className={clsx('flex flex-wrap gap-1', !full && 'justify-center')}>
          {categories.map((id) => (
            <CategoryChip key={id} id={id} size={full ? 'sm' : 'xs'} />
          ))}
        </div>
      ) : (
        !full && <p className="text-center text-[11px] italic text-parchment-500">Sin raza ni clase todavía</p>
      )}

      <div className={clsx('grid gap-1.5', full ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-3')}>
        <Stat icon={<Heart />} label="PV" value={formatNumber(sheet.hpMax, 0)} color="#ef8f88" />
        {rules.showAc && <Stat icon={<Shield />} label="CA" value={sheet.ac} />}
        {rules.showInitiative && <Stat icon={<Swords />} label="Inic." value={formatModifier(sheet.initiativeBonus)} />}
        {full && rules.showSpeed && <Stat icon={<Footprints />} label="Vel." value={state.speed || '—'} />}
        {full && (
          <Stat icon={<Footprints />} label="Mov./turno" value={`${heroMoveCells({ speed: state.speed, moveCells: state.moveCells })} cas.`} />
        )}
        {full && <Stat icon={<Zap />} label="Acciones" value={state.actionsPerTurn} color="#c9b6ff" />}
        {full && <Stat icon={<Crown />} label="Nivel" value={state.level} color="#f3d58a" />}
        {full && rules.currency.enabled && <Stat icon={<Coins />} label={currency || 'Oro'} value={formatGold(state.gold, true, null)} color="#f3d58a" />}
      </div>

      {ctx.attributes.length > 0 && <AbilityGrid abilities={sheet.abilities} rules={rules} compact={!full} />}

      {mode === 'mana' && sheet.resources.mana.max > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-arcane-600/40 bg-arcane-500/[0.08] px-2.5 py-1.5 text-xs text-arcane-200">
          <Sparkles className="h-3.5 w-3.5 text-arcane-300" />
          {resourceName}: <span className="font-bold tabular-nums">{sheet.resources.mana.max}</span>
        </div>
      )}
      {mode === 'slots' && sheet.resources.slots.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sheet.resources.slots.map((s) => (
            <span key={s.level} className="rounded-md border border-arcane-600/40 bg-arcane-500/[0.08] px-1.5 py-0.5 text-[10px] text-arcane-200">
              Nv {s.level}: <span className="font-bold">{s.max}</span>
            </span>
          ))}
        </div>
      )}

      {sheet.showSpells && state.spells.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-parchment-400">
            <Zap className="h-3 w-3" /> {ENTRY_KIND_LABELS.spell.plural}
          </div>
          <ul className={clsx('flex flex-col gap-1', full && 'sm:grid sm:grid-cols-2')}>
            {state.spells.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs text-parchment-200">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: SPELL_ANIMATION_COLORS[s.animation] }} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {full && <span className="text-[10px] text-parchment-500">{spellLevelLabel(s.level)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {full && state.description.trim() && (
        <p className="whitespace-pre-line rounded-lg border border-ink-600/60 bg-ink-950/40 px-3 py-2 text-sm leading-relaxed text-parchment-200">
          {state.description.trim()}
        </p>
      )}
    </div>
  );
}
