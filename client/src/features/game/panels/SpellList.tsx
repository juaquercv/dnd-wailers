import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { BookPlus, Flame, Ellipsis, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import {
  newId,
  SPELL_ANIMATION_LABELS,
  type HeroSheet,
  type HeroSpell,
  type LibraryEntry,
  type RuleSystem,
  type SpellAnimation,
} from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { useContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu';
import { EmptyState } from '../../../components/ui/EmptyState';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal } from '../../../components/ui/Modal';
import { toast } from '../../../components/ui/toast';
import { emitUiEvent } from '../../../lib/uiEvents';
import { LibraryBrowser } from '../../library/LibraryBrowser';
import { send } from './actions';

export const SPELL_ANIMATION_ICONS: Record<SpellAnimation, string> = {
  fire: '🔥',
  ice: '❄️',
  lightning: '⚡',
  heal: '💚',
  arcane: '✨',
  poison: '🧪',
  holy: '☀️',
  shadow: '🌑',
};

export function spellLevelLabel(level: number): string {
  return level <= 0 ? 'Truco' : `Nv ${level}`;
}

/** Cost of a spell under the campaign rules (display only; never spent automatically). */
export function spellCostLabel(spell: HeroSpell, rules: RuleSystem): string | null {
  if (rules.magic.mode === 'mana') return spell.manaCost > 0 ? `${spell.manaCost} ${rules.magic.manaName}` : 'Sin coste';
  if (rules.magic.mode === 'slots') return spell.slotLevel > 0 ? `Espacio nv ${spell.slotLevel}` : 'Sin espacio';
  return null;
}

/** Hero spell copied from a library spell entry. */
export function heroSpellFromEntry(entry: LibraryEntry<'spell'>): HeroSpell {
  const data = entry.data;
  return {
    id: newId('spell'),
    entryId: entry.id,
    name: entry.name,
    level: entry.level ?? data.slotLevel ?? 0,
    manaCost: data.manaCost ?? 0,
    slotLevel: data.slotLevel ?? 0,
    animation: data.animation ?? 'arcane',
    description: entry.description || data.effect || '',
    prepared: true,
  };
}

export interface SpellListProps {
  hero: HeroSheet;
  rules: RuleSystem;
  /** Owner (player) or DM may cast. */
  canCast: boolean;
  /** May spend resources manually (owner when allowed, DM). */
  canSpend: boolean;
  /** DM: add / remove / prepare. */
  manage: boolean;
  campaignId?: string;
}

/**
 * Spells / powers of a hero. "Lanzar" asks the map for a target point (cast-request); the optional
 * "gastar" button spends the cost by hand — casting itself never touches resources.
 */
export function SpellList({ hero, rules, canCast, canSpend, manage, campaignId }: SpellListProps) {
  const menu = useContextMenu();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const spells = useMemo(
    () => [...hero.data.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'es')),
    [hero.data.spells],
  );
  const mode = rules.magic.mode;
  const mana = hero.data.resources.mana;

  const updateSpells = (next: HeroSpell[]) => send('hero:update', { heroId: hero.id, patch: { spells: next } });

  // The map enters target mode and shows its own hint banner (Esc cancels).
  const cast = (spell: HeroSpell) => emitUiEvent('cast-request', { heroId: hero.id, spellName: spell.name, animation: spell.animation });

  const spend = (spell: HeroSpell) => {
    if (mode === 'mana' && spell.manaCost > 0) void send('hero:mana', { heroId: hero.id, delta: -spell.manaCost });
    else if (mode === 'slots' && spell.slotLevel > 0) void send('hero:slot', { heroId: hero.id, level: spell.slotLevel, delta: 1 });
  };

  const spendInfo = (spell: HeroSpell): { label: string; disabled: boolean } | null => {
    if (!canSpend) return null;
    if (mode === 'mana' && spell.manaCost > 0) {
      return { label: `Gastar ${spell.manaCost} ${rules.magic.manaName}`, disabled: mana.current < spell.manaCost };
    }
    if (mode === 'slots' && spell.slotLevel > 0) {
      const slot = hero.data.resources.slots.find((s) => s.level === spell.slotLevel);
      return { label: `Gastar un espacio de nivel ${spell.slotLevel}`, disabled: !slot || slot.used >= slot.max };
    }
    return null;
  };

  const manageMenu = (spell: HeroSpell): ContextMenuItem[] => [
    { heading: true, label: spell.name },
    {
      label: spell.prepared ? 'Marcar como no preparado' : 'Marcar como preparado',
      icon: <Sparkles />,
      onClick: () => void updateSpells(hero.data.spells.map((s) => (s.id === spell.id ? { ...s, prepared: !s.prepared } : s))),
    },
    { separator: true },
    { label: 'Quitar de la ficha', icon: <Trash2 />, danger: true, onClick: () => void updateSpells(hero.data.spells.filter((s) => s.id !== spell.id)) },
  ];

  const pick = async (entry: LibraryEntry) => {
    if (entry.kind !== 'spell') return;
    const spell = heroSpellFromEntry(entry as LibraryEntry<'spell'>);
    if (hero.data.spells.some((s) => s.entryId === entry.id)) {
      toast.warning(`${hero.name} ya conoce ${entry.name}`);
      return;
    }
    const ok = await updateSpells([...hero.data.spells, spell]);
    if (ok) {
      toast.success(`${entry.name} añadido a ${hero.name}`);
      setAdding(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {manage && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" icon={<BookPlus />} onClick={() => setAdding(true)}>
            Añadir
          </Button>
        </div>
      )}
      {spells.length === 0 ? (
        <EmptyState compact icon={<WandSparkles />} title="Sin poderes" description="Este héroe no tiene hechizos ni habilidades especiales." />
      ) : (
        <ul className="space-y-1">
          {spells.map((spell) => {
            const cost = spellCostLabel(spell, rules);
            const open = expanded === spell.id;
            const spendState = spendInfo(spell);
            return (
              <li
                key={spell.id}
                onContextMenu={manage ? (e) => menu.open(e, manageMenu(spell)) : undefined}
                className={clsx(
                  'group rounded-lg border transition',
                  open ? 'border-arcane-500/50 bg-ink-800' : 'border-ink-600/60 bg-ink-800/60 hover:border-ink-500',
                  !spell.prepared && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-arcane-500/40 bg-arcane-500/10 text-base"
                    title={SPELL_ANIMATION_LABELS[spell.animation] ?? spell.animation}
                    aria-hidden
                  >
                    {SPELL_ANIMATION_ICONS[spell.animation] ?? '✨'}
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(open ? null : spell.id)} title={spell.description || spell.name} aria-expanded={open}>
                    <span className="block truncate text-sm font-medium text-parchment-50">{spell.name}</span>
                    <span className="flex items-center gap-2 text-[10px] text-parchment-400">
                      <span>{spellLevelLabel(spell.level)}</span>
                      {cost && <span className="text-arcane-300">{cost}</span>}
                      {!spell.prepared && <span className="italic">no preparado</span>}
                    </span>
                  </button>
                  {spendState && (
                    <IconButton
                      icon={<Flame />}
                      title={spendState.label}
                      size="xs"
                      variant="ghost"
                      disabled={spendState.disabled}
                      className="text-arcane-300 opacity-60 group-hover:opacity-100"
                      onClick={() => spend(spell)}
                    />
                  )}
                  {canCast && (
                    <Button size="sm" variant="secondary" icon={<WandSparkles />} onClick={() => cast(spell)} title="Elegir objetivo en el mapa (solo animación)">
                      Lanzar
                    </Button>
                  )}
                  {manage && <IconButton icon={<Ellipsis />} title="Opciones" size="xs" onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    menu.openAt(r.right - 192, r.bottom + 4, manageMenu(spell));
                  }} />}
                </div>
                {open && (
                  <div className="animate-fade-in border-t border-ink-600/60 px-3 py-2 text-xs leading-relaxed text-parchment-300">
                    {spell.description ? <p className="whitespace-pre-line">{spell.description}</p> : <p className="italic text-parchment-400">Sin descripción.</p>}
                    <p className="mt-1 text-[10px] text-parchment-400">Animación: {SPELL_ANIMATION_LABELS[spell.animation] ?? spell.animation}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {manage && (
        <Modal open={adding} onClose={() => setAdding(false)} title={`Añadir poder a ${hero.name}`} icon={<BookPlus />} size="lg" bodyClassName="min-h-[24rem]">
          <LibraryBrowser kinds={['spell']} initialKind="spell" compact campaignId={campaignId} onPick={(e) => void pick(e)} pickLabel="Añadir" className="h-full" />
        </Modal>
      )}
    </div>
  );
}
