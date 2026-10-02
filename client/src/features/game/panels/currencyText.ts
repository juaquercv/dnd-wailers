import { normalizeText, type RuleSystem } from '@wailers/shared';

/**
 * Campaign currency as it reads mid-sentence ("coronas de latón", "oro"), or null when the campaign
 * has no currency. Acronyms ("PO") keep their case; an empty name falls back to "monedas".
 */
export function currencyNoun(rules: RuleSystem | null | undefined): string | null {
  if (!rules?.currency.enabled) return null;
  const name = rules.currency.name.trim();
  if (!name) return 'monedas';
  const first = name.split(/\s+/)[0] ?? '';
  if (first.length > 1 && first === first.toLocaleUpperCase('es')) return name;
  return name.charAt(0).toLocaleLowerCase('es') + name.slice(1);
}

/** "y" becomes "e" before an /i/ sound ("e iridio", but "y hierro"). */
export function andWord(next: string): 'y' | 'e' {
  const w = normalizeText(next);
  return /^h?i/.test(w) && !/^h?i[aeiou]/.test(w) ? 'e' : 'y';
}

/** "o" becomes "u" before an /o/ sound ("u oro"). */
export function orWord(next: string): 'o' | 'u' {
  return /^h?o/.test(normalizeText(next)) ? 'u' : 'o';
}

/** Spanish list: "a", "a y b", "a, b y c". */
export function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  const last = words[words.length - 1]!;
  return `${words.slice(0, -1).join(', ')} ${andWord(last)} ${last}`;
}
