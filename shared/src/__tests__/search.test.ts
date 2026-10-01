import { describe, expect, it } from 'vitest';
import { buildSearchText, fuzzyScore, normalizeTag, normalizeTags, normalizeText, trigramSimilarity } from '../search';

describe('normalizeText', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeText('Dragón Rojo')).toBe('dragon rojo');
    expect(normalizeText('ÁÉÍÓÚ áéíóú')).toBe('aeiou aeiou');
    expect(normalizeText('Pingüino')).toBe('pinguino');
    expect(normalizeText('Ça va')).toBe('ca va');
  });

  it('turns ñ into n', () => {
    expect(normalizeText('ÑANDÚ')).toBe('nandu');
    expect(normalizeText('Montaña')).toBe('montana');
    // Precomposed and decomposed forms behave the same.
    expect(normalizeText('Montaña')).toBe('montana');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeText('  múltiples   espacios\t\n aquí ')).toBe('multiples espacios aqui');
  });

  it('handles letters that do not decompose and empty input', () => {
    expect(normalizeText('Straße')).toBe('strasse');
    expect(normalizeText('Ægir Øl')).toBe('aegir ol');
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });

  it('keeps digits and punctuation', () => {
    expect(normalizeText('Espada +1 (Élfica)')).toBe('espada +1 (elfica)');
  });
});

describe('normalizeTag', () => {
  it('strips leading # and accents', () => {
    expect(normalizeTag('#Volcán')).toBe('volcan');
    expect(normalizeTag('##fuego')).toBe('fuego');
  });

  it('turns spaces into dashes and drops other characters', () => {
    expect(normalizeTag('  #No Muerto ')).toBe('no-muerto');
    expect(normalizeTag('¡Fuego!')).toBe('fuego');
    expect(normalizeTag('Élite 2')).toBe('elite-2');
    expect(normalizeTag('jefe_final-1')).toBe('jefe_final-1');
    expect(normalizeTag('a - b')).toBe('a-b');
  });

  it('returns empty when nothing is left', () => {
    expect(normalizeTag('###')).toBe('');
    expect(normalizeTag('   ')).toBe('');
    expect(normalizeTag('¿?')).toBe('');
  });

  it('normalizeTags removes empties and duplicates', () => {
    expect(normalizeTags(['#Volcán', 'volcan', '', 'Cueva', '!!'])).toEqual(['volcan', 'cueva']);
  });
});

describe('buildSearchText', () => {
  it('joins normalized name, description, tags and extras', () => {
    const text = buildSearchText({
      name: 'Dragón Rojo',
      description: 'Escupe  FUEGO',
      tags: ['volcán', 'no-muerto'],
      extra: ['Dragón', 'Montaña'],
    });
    expect(text).toBe('dragon rojo escupe fuego volcan no-muerto no muerto dragon montana');
  });

  it('works with only a name', () => {
    expect(buildSearchText({ name: 'Poción de Curación' })).toBe('pocion de curacion');
  });

  it('skips empty parts', () => {
    expect(buildSearchText({ name: 'Orco', description: '', tags: ['', '  '], extra: [''] })).toBe('orco');
  });
});

describe('trigramSimilarity', () => {
  it('is 1 for equal words and 0 for unrelated ones', () => {
    expect(trigramSimilarity('dragon', 'dragon')).toBe(1);
    expect(trigramSimilarity('xyz', 'dragon')).toBe(0);
    expect(trigramSimilarity('', 'dragon')).toBe(0);
    const s = trigramSimilarity('dargon', 'dragon');
    expect(s).toBeGreaterThan(0.2);
    expect(s).toBeLessThan(1);
  });
});

describe('fuzzyScore', () => {
  const text = 'Dragón rojo anciano';

  it('scores exact matches as 1 and empty queries as a match', () => {
    expect(fuzzyScore('dragón rojo anciano', text)).toBe(1);
    expect(fuzzyScore('DRAGON ROJO ANCIANO', text)).toBe(1);
    expect(fuzzyScore('', text)).toBe(1);
    expect(fuzzyScore('   ', text)).toBe(1);
  });

  it('is accent and case insensitive', () => {
    expect(fuzzyScore('DRAGON', text)).toBe(fuzzyScore('dragón', text));
    expect(fuzzyScore('pocion', 'Poción de curación')).toBeGreaterThan(0.9);
    expect(fuzzyScore('montaña', 'MONTANA nevada')).toBeGreaterThan(0.9);
  });

  it('ranks substring > word prefix > subsequence > trigram', () => {
    const prefix = fuzzyScore('drag', text);
    const wordStart = fuzzyScore('rojo', text);
    const inner = fuzzyScore('oj', text);
    const wordPrefixes = fuzzyScore('anc dra', text);
    const subsequence = fuzzyScore('drjo', text);
    const typo = fuzzyScore('ansiano', text);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThan(wordPrefixes);
    expect(wordPrefixes).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('tolerates simple typos', () => {
    expect(fuzzyScore('dargon', 'Dragón')).toBeGreaterThan(0);
    expect(fuzzyScore('goblim', 'Goblin arquero')).toBeGreaterThan(0);
  });

  it('returns 0 when nothing matches', () => {
    expect(fuzzyScore('xyz', 'Dragón')).toBe(0);
    expect(fuzzyScore('kraken', 'Poción')).toBe(0);
    expect(fuzzyScore('orco', '')).toBe(0);
  });

  it('always stays within 0..1 and prefers shorter texts for the same match', () => {
    const queries = ['a', 'dr', 'rojo', 'zzz', 'dragon rojo', 'anciano dragon', 'xq'];
    const texts = ['Dragón', 'Dragón rojo', 'Dragón rojo anciano del volcán', 'Rojo', ''];
    for (const q of queries) {
      for (const t of texts) {
        const s = fuzzyScore(q, t);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
    expect(fuzzyScore('drag', 'Dragón')).toBeGreaterThan(fuzzyScore('drag', 'Dragón rojo anciano'));
  });
});
