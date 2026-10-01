import { newId, type CreatureAttack, type CreatureData, type CreatureSize, type NamedText, type SuggestedLoot } from '@wailers/shared';
import type { PortraitKey } from '../assets/portraits';
import { cat } from './categories';
import { itemEntry } from './items';

/** Helpers shared by the seeded bestiaries (fantasy and steampunk). */

export interface CreatureDef {
  key: string;
  name: string;
  description: string;
  portrait: PortraitKey;
  cr: number;
  hp: number;
  size: CreatureSize;
  categories: string[];
  tags: string[];
  data: Partial<CreatureData>;
  origin?: 'A' | 'B';
  /** Seed version that introduced the creature (default 1). */
  since?: number;
}

export const atk = (name: string, bonus: string, damage: string, damageType: string, range: string, notes = ''): CreatureAttack => ({ id: newId('atk'), name, bonus, damage, damageType, range, notes });

export const trait = (name: string, description: string): NamedText => ({ id: newId('trt'), name, description });

export const loot = (itemKey: string, quantity: number, notes = ''): SuggestedLoot => {
  const item = itemEntry(itemKey);
  return { id: newId('loot'), entryId: item.id, name: item.name, quantity, notes };
};

/** Coins without a library entry (fantasy campaigns). */
export const gold = (quantity: number, notes = ''): SuggestedLoot => ({ id: newId('loot'), entryId: null, name: 'Monedas de oro', quantity, notes });

export const abilities = (str: number, dex: number, con: number, int: number, wis: number, cha: number): Record<string, number> => ({ str, dex, con, int, wis, cha });

export const TYPE = (v: string): string => cat('creature', 'Tipo de criatura', v);
export const ROLE = (v: string): string => cat('creature', 'Rol', v);
export const HAB = (v: string): string => cat('creature', 'Hábitat', v);
export const AFF = (v: string): string => cat('creature', 'Afinidad elemental', v);
export const RES = (v: string): string => cat('creature', 'Resistencias', v);
export const WEAK = (v: string): string => cat('creature', 'Debilidades', v);
