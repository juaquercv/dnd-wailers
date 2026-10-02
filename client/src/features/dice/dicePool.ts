import { MAX_DICE, parseFormula } from '@wailers/shared';

/**
 * Dice pool ("Mesa de dados"): the player picks dice one by one plus a flat bonus, and the pool is
 * turned into the formula string the server already understands ("2d20+1d4+3").
 */

export const POOL_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
export type PoolDie = (typeof POOL_DICE)[number];

export const MAX_POOL_DICE = MAX_DICE;
export const MAX_POOL_BONUS = 999;
export const BONUS_STEPS = [-10, -5, -1, 1, 5, 10] as const;

export interface PoolGroup {
  sides: PoolDie;
  count: number;
}

export interface DicePool {
  /** One entry per die type, in the order the type was first added. */
  groups: PoolGroup[];
  bonus: number;
}

export const EMPTY_POOL: DicePool = { groups: [], bonus: 0 };

export function isPoolDie(sides: number): sides is PoolDie {
  return (POOL_DICE as readonly number[]).includes(sides);
}

export function poolDiceCount(pool: DicePool): number {
  return pool.groups.reduce((sum, g) => sum + g.count, 0);
}

export function poolCountOf(pool: DicePool, sides: PoolDie): number {
  return pool.groups.find((g) => g.sides === sides)?.count ?? 0;
}

export function poolIsEmpty(pool: DicePool): boolean {
  return pool.groups.length === 0 && pool.bonus === 0;
}

/** Sets how many dice of a type the pool has (0 removes the type). Respects the total dice limit. */
export function setDieCount(pool: DicePool, sides: PoolDie, count: number): DicePool {
  const others = poolDiceCount(pool) - poolCountOf(pool, sides);
  const next = Math.max(0, Math.min(Math.round(count), MAX_POOL_DICE - others));
  const exists = pool.groups.some((g) => g.sides === sides);
  let groups: PoolGroup[];
  if (next === 0) groups = pool.groups.filter((g) => g.sides !== sides);
  else if (exists) groups = pool.groups.map((g) => (g.sides === sides ? { sides, count: next } : g));
  else groups = [...pool.groups, { sides, count: next }];
  return { ...pool, groups };
}

export function addDie(pool: DicePool, sides: PoolDie, delta = 1): DicePool {
  return setDieCount(pool, sides, poolCountOf(pool, sides) + delta);
}

export function canAddDie(pool: DicePool): boolean {
  return poolDiceCount(pool) < MAX_POOL_DICE;
}

export function clampBonus(bonus: number): number {
  return Math.max(-MAX_POOL_BONUS, Math.min(MAX_POOL_BONUS, Math.round(bonus)));
}

export function addBonus(pool: DicePool, delta: number): DicePool {
  return { ...pool, bonus: clampBonus(pool.bonus + delta) };
}

export function formatBonus(bonus: number): string {
  if (bonus > 0) return `+${bonus}`;
  if (bonus < 0) return `−${Math.abs(bonus)}`;
  return '0';
}

/** Formula for the server ("2d20+1d4+3"), or null when the pool has no dice. */
export function poolFormula(pool: DicePool): string | null {
  if (pool.groups.length === 0) return null;
  let out = pool.groups.map((g) => `${g.count}d${g.sides}`).join('+');
  if (pool.bonus > 0) out += `+${pool.bonus}`;
  else if (pool.bonus < 0) out += `-${Math.abs(pool.bonus)}`;
  return out;
}

/** Advantage / disadvantage need exactly one d20 on the table (other dice may go with it, e.g. 1d20 + 1d4). */
export function poolAllowsAdvantage(pool: DicePool): boolean {
  return poolCountOf(pool, 20) === 1;
}

/** Minimum and maximum possible total. */
export function poolRange(pool: DicePool): { min: number; max: number } | null {
  if (pool.groups.length === 0) return null;
  let min = pool.bonus;
  let max = pool.bonus;
  for (const g of pool.groups) {
    min += g.count;
    max += g.count * g.sides;
  }
  return { min, max };
}

/** Pool equivalent of a formula, or null when it uses things the pool cannot express (kh/kl, subtracted dice, odd dice). */
export function poolFromFormula(formula: string | null | undefined): DicePool | null {
  if (!formula || !formula.trim()) return null;
  try {
    const parsed = parseFormula(formula);
    if (parsed.terms.length === 0) return null;
    let pool: DicePool = { groups: [], bonus: clampBonus(parsed.modifier) };
    if (pool.bonus !== parsed.modifier) return null;
    for (const t of parsed.terms) {
      if (t.sign < 0 || t.keep || !isPoolDie(t.sides)) return null;
      pool = setDieCount(pool, t.sides, poolCountOf(pool, t.sides) + t.count);
    }
    return pool;
  } catch {
    return null;
  }
}

/** Readable version of a formula: "2d20+1d4-1" → "2d20 + 1d4 − 1". Unparseable text is returned as is. */
export function prettyFormula(formula: string | null | undefined): string {
  if (!formula) return '';
  try {
    const parsed = parseFormula(formula);
    const parts: string[] = [];
    parsed.terms.forEach((t, i) => {
      const keep = t.keep ? ` (${t.keep.n} ${t.keep.type === 'kh' ? 'mayores' : 'menores'})` : '';
      const text = `${t.count}d${t.sides}${keep}`;
      if (i === 0) parts.push(t.sign < 0 ? `−${text}` : text);
      else parts.push(t.sign < 0 ? `− ${text}` : `+ ${text}`);
    });
    if (parsed.modifier !== 0 || parts.length === 0) {
      if (parts.length === 0) parts.push(formatBonus(parsed.modifier).replace(/^\+/, ''));
      else parts.push(parsed.modifier < 0 ? `− ${Math.abs(parsed.modifier)}` : `+ ${parsed.modifier}`);
    }
    return parts.join(' ');
  } catch {
    return formula;
  }
}
