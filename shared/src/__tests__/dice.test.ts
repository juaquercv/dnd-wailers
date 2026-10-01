import { describe, expect, it } from 'vitest';
import {
  advantageTermIndex,
  describeRoll,
  isValidFormula,
  parseFormula,
  rollDie,
  rollFormula,
  supportsAdvantage,
  type DiceRollOutcome,
} from '../dice';
import { faceValue, seededRng, sequenceRng } from './helpers';

describe('parseFormula', () => {
  it('parses a bare die with implicit count', () => {
    const p = parseFormula('d20');
    expect(p.terms).toEqual([{ sign: 1, count: 1, sides: 20, keep: null }]);
    expect(p.modifier).toBe(0);
    expect(p.normalized).toBe('1d20');
  });

  it('parses modifiers, spaces and upper case', () => {
    expect(parseFormula('1d20+5').normalized).toBe('1d20+5');
    const p = parseFormula('  2D6 +  3 ');
    expect(p.terms).toEqual([{ sign: 1, count: 2, sides: 6, keep: null }]);
    expect(p.modifier).toBe(3);
    expect(p.normalized).toBe('2d6+3');
  });

  it('parses keep highest / keep lowest', () => {
    expect(parseFormula('4d6kh3').terms[0]).toEqual({ sign: 1, count: 4, sides: 6, keep: { type: 'kh', n: 3 } });
    expect(parseFormula('2d20KL1').terms[0]!.keep).toEqual({ type: 'kl', n: 1 });
    expect(parseFormula('4d6k3').terms[0]!.keep).toEqual({ type: 'kh', n: 3 });
    expect(parseFormula('4d6kh3').normalized).toBe('4d6kh3');
  });

  it('parses multiple dice terms and combines integer modifiers', () => {
    const p = parseFormula('1d8 + 1d6 + 2');
    expect(p.terms).toHaveLength(2);
    expect(p.terms[1]).toEqual({ sign: 1, count: 1, sides: 6, keep: null });
    expect(p.modifier).toBe(2);
    expect(p.normalized).toBe('1d8+1d6+2');

    const q = parseFormula('3 + 1d6 - 5 + 1');
    expect(q.modifier).toBe(-1);
    expect(q.normalized).toBe('1d6-1');
  });

  it('parses negative dice terms and a leading sign', () => {
    const p = parseFormula('-1d4+3');
    expect(p.terms[0]!.sign).toBe(-1);
    expect(p.normalized).toBe('-1d4+3');
    expect(parseFormula('1d20-1d4').terms[1]!.sign).toBe(-1);
    expect(parseFormula('+1d6').normalized).toBe('1d6');
  });

  it('accepts d% as d100', () => {
    const p = parseFormula('d%');
    expect(p.terms[0]!.sides).toBe(100);
    expect(p.normalized).toBe('1d100');
    expect(parseFormula('2d%+1').normalized).toBe('2d100+1');
  });

  it('accepts typographic minus signs', () => {
    expect(parseFormula('1d6 − 1').modifier).toBe(-1);
  });

  it('accepts a plain integer (grammar allows a modifier-only formula)', () => {
    const p = parseFormula('5');
    expect(p.terms).toEqual([]);
    expect(p.modifier).toBe(5);
    expect(p.normalized).toBe('5');
  });

  it('accepts the limits exactly', () => {
    expect(() => parseFormula('100d6')).not.toThrow();
    expect(() => parseFormula('50d6+50d4')).not.toThrow();
    expect(() => parseFormula('1d1000')).not.toThrow();
    expect(() => parseFormula('1d2')).not.toThrow();
    expect(() => parseFormula('1d20+10000')).not.toThrow();
    expect(() => parseFormula('1d20-10000')).not.toThrow();
  });

  const invalid: [string, RegExp][] = [
    ['', /vacía/],
    ['    ', /vacía/],
    ['abc', /carácter inesperado/],
    ['1d', /caras/],
    ['d', /caras/],
    ['1d1', /entre 2 y 1000/],
    ['1d1001', /entre 2 y 1000/],
    ['0d6', /al menos 1/],
    ['101d6', /demasiados dados/],
    ['60d6+50d6', /demasiados dados/],
    ['1d6+', /falta un término/],
    ['1d6-', /falta un término/],
    ['1d6++2', /carácter inesperado/],
    ['4d6kh5', /conservar/],
    ['4d6kh0', /al menos 1/],
    ['4d6kh', /conservar/],
    ['1d20+10001', /modificador/],
    ['1d20+6000+6000', /modificador/],
    ['2x3', /se esperaba/],
    ['1d6)', /se esperaba/],
    ['1.5d6', /se esperaba/],
    ['d20 adv', /se esperaba/],
  ];
  it.each(invalid)('rejects %j with a Spanish message', (input, re) => {
    let message = '';
    try {
      parseFormula(input);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.startsWith('Fórmula inválida: ')).toBe(true);
    expect(message).toMatch(re);
  });

  it('rejects absurdly long input', () => {
    expect(() => parseFormula('1+'.repeat(500) + '1')).toThrow(/Fórmula inválida/);
  });
});

describe('isValidFormula', () => {
  it('returns booleans instead of throwing', () => {
    expect(isValidFormula('2d6+3')).toBe(true);
    expect(isValidFormula('d%')).toBe(true);
    expect(isValidFormula('2d6+')).toBe(false);
    expect(isValidFormula('hola')).toBe(false);
    expect(isValidFormula('')).toBe(false);
  });
});

describe('advantage support', () => {
  it('only applies to formulas with exactly one d20 term of count 1', () => {
    expect(supportsAdvantage('1d20+5')).toBe(true);
    expect(supportsAdvantage('d20+1d6+2')).toBe(true);
    expect(supportsAdvantage('2d20')).toBe(false);
    expect(supportsAdvantage('1d20+1d20')).toBe(false);
    expect(supportsAdvantage('1d6+3')).toBe(false);
    expect(supportsAdvantage('invalid')).toBe(false);
    expect(advantageTermIndex(parseFormula('1d6+1d20'))).toBe(1);
  });
});

describe('rollDie', () => {
  it('maps the rng range onto 1..sides, clamping rng = 1', () => {
    expect(rollDie(6, () => 0)).toBe(1);
    expect(rollDie(6, () => 0.99999)).toBe(6);
    expect(rollDie(6, () => 1)).toBe(6);
    expect(rollDie(20, () => faceValue(17, 20))).toBe(17);
  });
});

describe('rollFormula', () => {
  it('keeps every die within range and totals correctly', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 500; i++) {
      const out = rollFormula('3d6+1d8-2', 'normal', rng);
      expect(out.dice).toHaveLength(4);
      for (const d of out.dice) {
        expect(d.value).toBeGreaterThanOrEqual(1);
        expect(d.value).toBeLessThanOrEqual(d.sides);
        expect(d.dropped).toBe(false);
      }
      const sum = out.dice.reduce((s, d) => s + d.value, 0);
      expect(out.total).toBe(sum - 2);
      expect(out.modifier).toBe(-2);
      expect(out.formula).toBe('3d6+1d8-2');
    }
  });

  it('subtracts negative dice terms', () => {
    const out = rollFormula('1d20-1d4', 'normal', sequenceRng([faceValue(15, 20), faceValue(3, 4)]));
    expect(out.total).toBe(12);
  });

  it('has the expected mean for 1d20 and 2d6 (statistical sanity)', () => {
    const rng = seededRng(7);
    const n = 20000;
    let sum20 = 0;
    const counts20 = new Array<number>(21).fill(0);
    const counts2d6 = new Array<number>(13).fill(0);
    for (let i = 0; i < n; i++) {
      const r = rollFormula('1d20', 'normal', rng).total;
      sum20 += r;
      counts20[r]!++;
      counts2d6[rollFormula('2d6', 'normal', rng).total]!++;
    }
    expect(sum20 / n).toBeGreaterThan(10.3);
    expect(sum20 / n).toBeLessThan(10.7);
    for (let face = 1; face <= 20; face++) {
      expect(counts20[face]! / n).toBeGreaterThan(0.04);
      expect(counts20[face]! / n).toBeLessThan(0.06);
    }
    const mode = counts2d6.indexOf(Math.max(...counts2d6));
    expect(mode).toBe(7);
    expect(counts2d6[2]! / n).toBeLessThan(counts2d6[7]! / n / 4);
  });

  it('covers both ends of d%', () => {
    const rng = seededRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(rollFormula('d%', 'normal', rng).total);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(100)).toBe(true);
    expect(Math.max(...seen)).toBe(100);
    expect(Math.min(...seen)).toBe(1);
  });

  it('keep highest drops the lowest dice', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 300; i++) {
      const out = rollFormula('4d6kh3', 'normal', rng);
      expect(out.dice).toHaveLength(4);
      const dropped = out.dice.filter((d) => d.dropped);
      const kept = out.dice.filter((d) => !d.dropped);
      expect(dropped).toHaveLength(1);
      expect(Math.min(...kept.map((d) => d.value))).toBeGreaterThanOrEqual(dropped[0]!.value);
      expect(out.total).toBe(kept.reduce((s, d) => s + d.value, 0));
    }
  });

  it('keep lowest drops the highest dice and breaks ties deterministically', () => {
    const out = rollFormula('3d6kl1', 'normal', sequenceRng([faceValue(4, 6), faceValue(2, 6), faceValue(2, 6)]));
    expect(out.dice.map((d) => d.dropped)).toEqual([true, false, true]);
    expect(out.total).toBe(2);
  });

  it('advantage rolls two d20 and keeps the higher one', () => {
    const out = rollFormula('1d20+5', 'advantage', sequenceRng([faceValue(3, 20), faceValue(14, 20)]));
    expect(out.dice).toEqual([
      { sides: 20, value: 3, dropped: true },
      { sides: 20, value: 14, dropped: false },
    ]);
    expect(out.total).toBe(19);
  });

  it('disadvantage keeps the lower one', () => {
    const out = rollFormula('d20+2', 'disadvantage', sequenceRng([faceValue(3, 20), faceValue(14, 20)]));
    expect(out.dice.map((d) => d.dropped)).toEqual([false, true]);
    expect(out.total).toBe(5);
  });

  it('equal advantage dice drop the second one', () => {
    const out = rollFormula('1d20', 'advantage', sequenceRng([faceValue(9, 20)]));
    expect(out.dice.map((d) => d.dropped)).toEqual([false, true]);
    expect(out.total).toBe(9);
  });

  it('advantage also works with other dice terms present', () => {
    const out = rollFormula('1d20+1d6+1', 'advantage', sequenceRng([faceValue(5, 20), faceValue(18, 20), faceValue(4, 6)]));
    expect(out.dice).toHaveLength(3);
    expect(out.total).toBe(18 + 4 + 1);
  });

  it('ignores advantage when the formula is not a single 1d20 term', () => {
    const rng = seededRng(11);
    const a = rollFormula('2d20', 'advantage', rng);
    expect(a.dice).toHaveLength(2);
    expect(a.dice.some((d) => d.dropped)).toBe(false);
    const b = rollFormula('1d20+1d20', 'disadvantage', rng);
    expect(b.dice).toHaveLength(2);
    expect(b.dice.some((d) => d.dropped)).toBe(false);
    const c = rollFormula('2d6', 'advantage', rng);
    expect(c.dice).toHaveLength(2);
  });

  it('advantage raises the average, disadvantage lowers it', () => {
    const rng = seededRng(2024);
    const n = 20000;
    let adv = 0;
    let dis = 0;
    for (let i = 0; i < n; i++) {
      adv += rollFormula('1d20', 'advantage', rng).total;
      dis += rollFormula('1d20', 'disadvantage', rng).total;
    }
    // Theoretical means: 13.825 and 7.175.
    expect(adv / n).toBeGreaterThan(13.5);
    expect(adv / n).toBeLessThan(14.15);
    expect(dis / n).toBeGreaterThan(6.85);
    expect(dis / n).toBeLessThan(7.5);
  });

  it('flags natural 20 and natural 1 on a single kept d20', () => {
    expect(rollFormula('1d20+3', 'normal', () => faceValue(20, 20)).crit).toBe('success');
    expect(rollFormula('1d20+3', 'normal', () => faceValue(1, 20)).crit).toBe('fail');
    expect(rollFormula('1d20+3', 'normal', () => faceValue(12, 20)).crit).toBeNull();
    expect(rollFormula('1d20+1d6', 'normal', () => faceValue(20, 20)).crit).toBe('success');
  });

  it('crits honour the kept die under advantage/disadvantage', () => {
    expect(rollFormula('1d20', 'advantage', sequenceRng([faceValue(20, 20), faceValue(5, 20)])).crit).toBe('success');
    expect(rollFormula('1d20', 'disadvantage', sequenceRng([faceValue(20, 20), faceValue(5, 20)])).crit).toBeNull();
    expect(rollFormula('1d20', 'disadvantage', sequenceRng([faceValue(1, 20), faceValue(20, 20)])).crit).toBe('fail');
    expect(rollFormula('2d20kh1', 'normal', sequenceRng([faceValue(20, 20), faceValue(2, 20)])).crit).toBe('success');
  });

  it('never flags crits without exactly one kept d20', () => {
    expect(rollFormula('2d20', 'normal', () => faceValue(20, 20)).crit).toBeNull();
    expect(rollFormula('1d6', 'normal', () => faceValue(1, 6)).crit).toBeNull();
    expect(rollFormula('1d100', 'normal', () => faceValue(20, 100)).crit).toBeNull();
  });

  it('throws on invalid formulas', () => {
    expect(() => rollFormula('2d', 'normal', Math.random)).toThrow(/Fórmula inválida/);
  });
});

describe('describeRoll', () => {
  it('shows dropped dice in parentheses with the modifier', () => {
    const out = rollFormula('1d20+5', 'advantage', sequenceRng([faceValue(14, 20), faceValue(3, 20)]));
    expect(describeRoll(out)).toBe('[14, (3)] + 5 = 19');
  });

  it('groups dice per term with signs', () => {
    const out = rollFormula('1d8-1d6+2', 'normal', sequenceRng([faceValue(5, 8), faceValue(3, 6)]));
    expect(describeRoll(out)).toBe('[5] - [3] + 2 = 4');
  });

  it('handles keep, negative and missing modifiers', () => {
    const kh = rollFormula('4d6kh3', 'normal', sequenceRng([faceValue(6, 6), faceValue(1, 6), faceValue(4, 6), faceValue(4, 6)]));
    expect(describeRoll(kh)).toBe('[6, (1), 4, 4] = 14');
    const neg = rollFormula('1d20-2', 'normal', () => faceValue(10, 20));
    expect(describeRoll(neg)).toBe('[10] - 2 = 8');
    const leadNeg = rollFormula('-1d4+3', 'normal', () => faceValue(2, 4));
    expect(describeRoll(leadNeg)).toBe('-[2] + 3 = 1');
  });

  it('describes modifier-only formulas', () => {
    expect(describeRoll(rollFormula('5', 'normal', Math.random))).toBe('5 = 5');
  });

  it('falls back to a single group when the formula does not match the dice', () => {
    const outcome: DiceRollOutcome = {
      formula: 'tirada libre',
      dice: [
        { sides: 6, value: 2, dropped: false },
        { sides: 6, value: 5, dropped: true },
      ],
      modifier: 1,
      total: 3,
      crit: null,
    };
    expect(describeRoll(outcome)).toBe('[2, (5)] + 1 = 3');
  });
});
