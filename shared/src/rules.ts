import { DEFAULT_ABILITIES } from './constants';
import type { MagicMode, RuleSystem } from './types/campaign';
import type { HeroData, HeroResources, SpellSlotState } from './types/library';

const FULL_CASTER_SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** 20 rows (character level) x 9 columns (spell level). */
export function defaultSlotsTable(): number[][] {
  return FULL_CASTER_SLOTS.map((row) => Array.from({ length: 9 }, (_, i) => row[i] ?? 0));
}

export function createRuleSystem(mode: MagicMode = 'mana'): RuleSystem {
  return {
    magic: {
      mode,
      manaName: 'Maná',
      manaRegenPerTurn: 2,
      manaAutoRegen: false,
      manaPerLevel: 10,
      slotsTable: defaultSlotsTable(),
    },
    attributes: DEFAULT_ABILITIES.map((a) => ({ key: a.key, label: a.label, short: a.short, enabled: true })),
    showAc: true,
    showSpeed: true,
    showInitiative: true,
    xpEnabled: true,
    inventory: { mode: 'weight', maxWeight: 60, maxSlots: 20 },
    currency: { enabled: true, name: 'Oro', short: 'po' },
    rest: {
      short: { enabled: true, label: 'Descanso corto', restoreHpPct: 25, restoreMana: 'half', restoreSlots: false, resetUses: true },
      long: { enabled: true, label: 'Descanso largo', restoreHpPct: 100, restoreMana: 'full', restoreSlots: true, resetUses: true },
    },
    heroCreation: {
      allowNew: true,
      startingLevel: 1,
      maxLevel: 20,
      startingGold: 50,
      abilityMethod: 'free',
      allowedRaceIds: [],
      allowedClassIds: [],
    },
    playersCanRollFreely: true,
    playersCanEditOwnResources: true,
  };
}

/** Max slots for a character level according to the campaign table. */
export function slotsForLevel(rules: RuleSystem, level: number): SpellSlotState[] {
  const row = rules.magic.slotsTable[Math.min(Math.max(level, 1), 20) - 1] ?? [];
  const out: SpellSlotState[] = [];
  for (let i = 0; i < 9; i++) {
    const max = row[i] ?? 0;
    if (max > 0) out.push({ level: i + 1, max, used: 0 });
  }
  return out;
}

/** Suggested resources for a hero of `level` under `rules` (used when creating heroes). */
export function suggestedResources(rules: RuleSystem, level: number): HeroResources {
  const manaMax = rules.magic.mode === 'mana' ? rules.magic.manaPerLevel * Math.max(level, 1) : 0;
  return {
    mana: { current: manaMax, max: manaMax },
    slots: rules.magic.mode === 'slots' ? slotsForLevel(rules, level) : [],
    uses: [],
  };
}

/**
 * Make sure a hero has the resource structures the campaign needs without destroying existing values.
 * Called by the server when a hero joins a session.
 */
export function adaptHeroToRules(data: HeroData, rules: RuleSystem, level: number): HeroData {
  const next: HeroData = structuredClone(data);
  for (const attr of rules.attributes) {
    if (attr.enabled && typeof next.abilities[attr.key] !== 'number') next.abilities[attr.key] = 10;
  }
  if (rules.magic.mode === 'mana' && next.resources.mana.max <= 0) {
    const max = rules.magic.manaPerLevel * Math.max(level, 1);
    next.resources.mana = { current: max, max };
  }
  if (rules.magic.mode === 'slots' && next.resources.slots.length === 0) {
    next.resources.slots = slotsForLevel(rules, level);
  }
  return next;
}

/** Ability modifier, for display only. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** 5e point-buy cost (8..15). */
export function pointBuyCost(score: number): number {
  const table: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  return table[score] ?? Infinity;
}
export const POINT_BUY_BUDGET = 27;

/** Total carried weight / slots, for display and over-limit warnings (never enforced automatically). */
export function inventoryLoad(data: HeroData): { weight: number; slots: number; value: number } {
  let weight = 0;
  let slots = 0;
  let value = 0;
  for (const it of data.inventory) {
    weight += (it.weight || 0) * it.quantity;
    slots += (it.slots || 0) * it.quantity;
    value += (it.value || 0) * it.quantity;
  }
  return { weight: Math.round(weight * 100) / 100, slots, value };
}
