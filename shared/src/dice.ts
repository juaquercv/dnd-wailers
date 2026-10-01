import type { Rng } from './ids';
import type { DieResult, RollMode } from './types/rollers';

/**
 * Dice formulas. Grammar (case-insensitive, spaces ignored):
 *   formula := term (('+'|'-') term)*
 *   term    := [count] 'd' sides ['kh' n | 'kl' n] | integer
 *   sides   := any integer 2..1000; 'd%' = d100
 * Examples: "d20", "1d20+5", "2d6+3", "4d6kh3", "1d8+1d6+2", "d%".
 * Limits: max 100 dice in total, |modifier| <= 10000.
 * Advantage/disadvantage (mode) applies only when the formula has exactly one d20 term with count 1:
 * two d20 are rolled and the lower/higher one is marked dropped.
 */
export interface DiceTerm {
  sign: 1 | -1;
  count: number;
  sides: number;
  keep: { type: 'kh' | 'kl'; n: number } | null;
}

export interface ParsedFormula {
  normalized: string;
  terms: DiceTerm[];
  modifier: number;
}

export interface DiceRollOutcome {
  formula: string;
  dice: DieResult[];
  modifier: number;
  total: number;
  /** Natural 20 / 1 on the single kept d20 (only when the formula has exactly one kept d20). */
  crit: 'success' | 'fail' | null;
}

export const MAX_DICE = 100;
export const MIN_SIDES = 2;
export const MAX_SIDES = 1000;
export const MAX_MODIFIER = 10000;
const MAX_FORMULA_LENGTH = 200;

function invalid(reason: string): Error {
  return new Error(`Fórmula inválida: ${reason}`);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/** Canonical text of a single dice term without its sign, e.g. "4d6kh3". */
function termText(term: DiceTerm): string {
  const keep = term.keep ? `${term.keep.type}${term.keep.n}` : '';
  return `${term.count}d${term.sides}${keep}`;
}

function buildNormalized(terms: DiceTerm[], modifier: number): string {
  let out = '';
  terms.forEach((term, i) => {
    if (i === 0) out += term.sign < 0 ? '-' : '';
    else out += term.sign < 0 ? '-' : '+';
    out += termText(term);
  });
  if (modifier !== 0 || terms.length === 0) {
    if (out === '') out = String(modifier);
    else out += modifier < 0 ? `-${Math.abs(modifier)}` : `+${modifier}`;
  }
  return out;
}

/** Throws Error with a Spanish message on invalid input. */
export function parseFormula(input: string): ParsedFormula {
  if (typeof input !== 'string') throw invalid('debe ser un texto');
  if (input.length > MAX_FORMULA_LENGTH) throw invalid(`es demasiado larga (máximo ${MAX_FORMULA_LENGTH} caracteres)`);
  const src = input
    .replace(/[−‒–—]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (src === '') throw invalid('está vacía');

  const terms: DiceTerm[] = [];
  let modifier = 0;
  let totalDice = 0;
  let pos = 0;

  const readInt = (): string => {
    const start = pos;
    while (isDigit(src[pos])) pos++;
    return src.slice(start, pos);
  };
  const charAt = (i: number): string => (i < src.length ? `«${src[i]}»` : 'el final');

  let first = true;
  while (pos < src.length || first) {
    let sign: 1 | -1 = 1;
    const opChar = src[pos];
    if (opChar === '+' || opChar === '-') {
      sign = opChar === '-' ? -1 : 1;
      pos++;
    } else if (!first) {
      throw invalid(`se esperaba «+» o «-» y se encontró ${charAt(pos)}`);
    }
    first = false;
    if (pos >= src.length) throw invalid(opChar === '+' || opChar === '-' ? `falta un término después de «${opChar}»` : 'está vacía');

    const countText = readInt();
    if (src[pos] === 'd') {
      pos++;
      let sides: number;
      if (src[pos] === '%') {
        pos++;
        sides = 100;
      } else {
        const sidesText = readInt();
        if (sidesText === '') throw invalid(`falta el número de caras del dado (se encontró ${charAt(pos)})`);
        sides = Number(sidesText);
      }
      const count = countText === '' ? 1 : Number(countText);
      if (!Number.isFinite(count) || count < 1) throw invalid('la cantidad de dados debe ser al menos 1');
      if (count > MAX_DICE) throw invalid(`demasiados dados (máximo ${MAX_DICE})`);
      if (!Number.isFinite(sides) || sides < MIN_SIDES || sides > MAX_SIDES) {
        throw invalid(`el dado debe tener entre ${MIN_SIDES} y ${MAX_SIDES} caras`);
      }

      let keep: DiceTerm['keep'] = null;
      if (src[pos] === 'k') {
        pos++;
        let type: 'kh' | 'kl' = 'kh';
        if (src[pos] === 'h' || src[pos] === 'l') {
          type = src[pos] === 'h' ? 'kh' : 'kl';
          pos++;
        }
        const nText = readInt();
        if (nText === '') throw invalid(`falta cuántos dados conservar después de «${type}»`);
        const n = Number(nText);
        if (n < 1) throw invalid('hay que conservar al menos 1 dado');
        if (n > count) throw invalid(`no se pueden conservar ${n} dados de ${count}`);
        keep = { type, n };
      }

      totalDice += count;
      if (totalDice > MAX_DICE) throw invalid(`demasiados dados (máximo ${MAX_DICE})`);
      terms.push({ sign, count, sides, keep });
    } else {
      if (countText === '') throw invalid(`carácter inesperado ${charAt(pos)}`);
      const value = Number(countText);
      if (!Number.isFinite(value) || value > MAX_MODIFIER) throw invalid(`el modificador es demasiado grande (máximo ±${MAX_MODIFIER})`);
      modifier += sign * value;
      if (Math.abs(modifier) > MAX_MODIFIER) throw invalid(`el modificador es demasiado grande (máximo ±${MAX_MODIFIER})`);
    }
  }

  return { normalized: buildNormalized(terms, modifier), terms, modifier };
}

export function isValidFormula(input: string): boolean {
  try {
    parseFormula(input);
    return true;
  } catch {
    return false;
  }
}

/** Index of the term that advantage/disadvantage applies to (exactly one d20 term, count 1), or -1. */
export function advantageTermIndex(parsed: ParsedFormula): number {
  let index = -1;
  let d20Terms = 0;
  parsed.terms.forEach((term, i) => {
    if (term.sides === 20) {
      d20Terms++;
      if (term.count === 1) index = i;
    }
  });
  return d20Terms === 1 ? index : -1;
}

/** True when advantage/disadvantage would change how the formula is rolled. */
export function supportsAdvantage(input: string): boolean {
  try {
    return advantageTermIndex(parseFormula(input)) >= 0;
  } catch {
    return false;
  }
}

/** Uniform integer in 1..sides from an rng returning [0,1). */
export function rollDie(sides: number, rng: Rng): number {
  const r = rng();
  const v = Math.floor((Number.isFinite(r) ? r : 0) * sides) + 1;
  return Math.min(Math.max(v, 1), sides);
}

/** Marks dropped dice in place for keep-highest/lowest. Ties drop the later die. */
function applyKeep(dice: DieResult[], keep: NonNullable<DiceTerm['keep']>): void {
  const order = dice.map((d, i) => ({ v: d.value, i }));
  order.sort((a, b) => (keep.type === 'kh' ? b.v - a.v : a.v - b.v) || a.i - b.i);
  for (let k = keep.n; k < order.length; k++) dice[order[k]!.i]!.dropped = true;
}

function computeCrit(dice: DieResult[]): DiceRollOutcome['crit'] {
  const kept = dice.filter((d) => d.sides === 20 && !d.dropped);
  if (kept.length !== 1) return null;
  const value = kept[0]!.value;
  if (value === 20) return 'success';
  if (value === 1) return 'fail';
  return null;
}

/** rng returns [0,1). Server passes secureRandom. */
export function rollFormula(input: string, mode: RollMode, rng: Rng): DiceRollOutcome {
  const parsed = parseFormula(input);
  const advIndex = mode === 'normal' ? -1 : advantageTermIndex(parsed);
  const dice: DieResult[] = [];
  let total = parsed.modifier;

  parsed.terms.forEach((term, i) => {
    const termDice: DieResult[] = [];
    if (i === advIndex) {
      const a: DieResult = { sides: 20, value: rollDie(20, rng), dropped: false };
      const b: DieResult = { sides: 20, value: rollDie(20, rng), dropped: false };
      const keepFirst = mode === 'advantage' ? a.value >= b.value : a.value <= b.value;
      if (keepFirst) b.dropped = true;
      else a.dropped = true;
      termDice.push(a, b);
    } else {
      for (let k = 0; k < term.count; k++) termDice.push({ sides: term.sides, value: rollDie(term.sides, rng), dropped: false });
      if (term.keep) applyKeep(termDice, term.keep);
    }
    for (const d of termDice) if (!d.dropped) total += term.sign * d.value;
    dice.push(...termDice);
  });

  return { formula: parsed.normalized, dice, modifier: parsed.modifier, total, crit: computeCrit(dice) };
}

function formatDice(dice: DieResult[]): string {
  return `[${dice.map((d) => (d.dropped ? `(${d.value})` : String(d.value))).join(', ')}]`;
}

/** Splits outcome.dice into per-term groups using the formula; null when they do not match. */
function groupDice(outcome: DiceRollOutcome): { sign: 1 | -1; dice: DieResult[] }[] | null {
  let parsed: ParsedFormula;
  try {
    parsed = parseFormula(outcome.formula);
  } catch {
    return null;
  }
  const expected = parsed.terms.reduce((sum, t) => sum + t.count, 0);
  const advIndex = outcome.dice.length === expected + 1 ? advantageTermIndex(parsed) : -1;
  if (outcome.dice.length !== expected && advIndex < 0) return null;
  const groups: { sign: 1 | -1; dice: DieResult[] }[] = [];
  let cursor = 0;
  for (let i = 0; i < parsed.terms.length; i++) {
    const term = parsed.terms[i]!;
    const n = i === advIndex ? 2 : term.count;
    const slice = outcome.dice.slice(cursor, cursor + n);
    if (slice.length !== n || slice.some((d) => d.sides !== term.sides)) return null;
    groups.push({ sign: term.sign, dice: slice });
    cursor += n;
  }
  return groups;
}

/** Human readable breakdown, e.g. "[14, (3)] + 5 = 19" (dropped dice in parentheses). */
export function describeRoll(outcome: DiceRollOutcome): string {
  const groups = groupDice(outcome) ?? (outcome.dice.length > 0 ? [{ sign: 1 as const, dice: outcome.dice }] : []);
  let text = '';
  groups.forEach((g, i) => {
    if (i === 0) text += g.sign < 0 ? '-' : '';
    else text += g.sign < 0 ? ' - ' : ' + ';
    text += formatDice(g.dice);
  });
  if (outcome.modifier !== 0 || text === '') {
    if (text === '') text = String(outcome.modifier);
    else text += outcome.modifier < 0 ? ` - ${Math.abs(outcome.modifier)}` : ` + ${outcome.modifier}`;
  }
  return `${text} = ${outcome.total}`;
}
