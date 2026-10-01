const DIACRITICS = /\p{Diacritic}/gu;
const COMBINING_MARKS = /\p{M}/gu;
/** Letters that do not decompose with NFD. */
const SPECIAL_LETTERS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
};
const SPECIAL_RE = new RegExp(`[${Object.keys(SPECIAL_LETTERS).join('')}]`, 'g');

/** Lowercase, strip diacritics (á->a, ñ->n), collapse whitespace, trim. Used for search columns and queries. */
export function normalizeText(input: string): string {
  if (typeof input !== 'string' || input === '') return '';
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(COMBINING_MARKS, '')
    .replace(SPECIAL_RE, (ch) => SPECIAL_LETTERS[ch] ?? ch)
    .replace(/ñ/g, 'n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a tag: strip leading '#', normalizeText, spaces -> '-', keep only [a-z0-9-_]. '' if nothing left. */
export function normalizeTag(input: string): string {
  if (typeof input !== 'string') return '';
  return normalizeText(input.trim().replace(/^#+/, ''))
    .replace(/ /g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalizes, drops empty tags and duplicates (order kept). */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const n = normalizeTag(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Build the searchText column: normalized name + description + tags + extra strings (e.g. category names). */
export function buildSearchText(parts: { name: string; description?: string; tags?: string[]; extra?: string[] }): string {
  const pieces: string[] = [normalizeText(parts.name ?? '')];
  if (parts.description) pieces.push(normalizeText(parts.description));
  for (const tag of parts.tags ?? []) {
    const t = normalizeText(tag.replace(/^#+/, ''));
    if (!t) continue;
    pieces.push(t);
    const spaced = t.replace(/[-_]+/g, ' ').trim();
    if (spaced && spaced !== t) pieces.push(spaced);
  }
  for (const extra of parts.extra ?? []) pieces.push(normalizeText(extra));
  return pieces.filter((p) => p.length > 0).join(' ');
}

function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** pg_trgm-like similarity (0..1) between two single words. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const union = ta.size + tb.size - common;
  return union === 0 ? 0 : common / union;
}

function splitWords(text: string): string[] {
  return text.split(/[\s\-_.,;:/()[\]{}'"!?¡¿]+/).filter((w) => w.length > 0);
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  return /[\s\-_.,;:/()[\]{}'"!?¡¿]/.test(text[index - 1]!);
}

/** Subsequence match; returns compactness (0..1] or 0 if q is not a subsequence of t. */
function subsequenceScore(q: string, t: string): number {
  let ti = 0;
  let first = -1;
  let last = -1;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    if (first < 0) first = found;
    last = found;
    ti = found + 1;
  }
  if (first < 0) return 0;
  const qLen = q.replace(/ /g, '').length;
  const span = last - first + 1;
  return qLen / span;
}

/**
 * Client-side fuzzy score (0..1) for filtering small cached lists (accent/case-insensitive,
 * substring > word prefix > subsequence > trigram similarity). 0 = no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = normalizeText(query);
  if (q === '') return 1;
  const t = normalizeText(text);
  if (t === '') return 0;
  if (q === t) return 1;

  const lengthRatio = Math.min(1, q.length / t.length);

  // 1) Substring (best when at the very start, then at a word start, then anywhere).
  const idx = t.indexOf(q);
  if (idx === 0) return 0.9 + 0.09 * lengthRatio;
  if (idx > 0) {
    let wordStartIdx = -1;
    for (let i = idx; i >= 0 && i < t.length; i = t.indexOf(q, i + 1)) {
      if (isWordStart(t, i)) {
        wordStartIdx = i;
        break;
      }
    }
    if (wordStartIdx >= 0) return 0.8 + 0.09 * lengthRatio;
    return 0.7 + 0.09 * lengthRatio;
  }

  const qWords = splitWords(q);
  const tWords = splitWords(t);

  // 2) Every query word is a prefix of some text word (any order).
  if (qWords.length > 0 && qWords.every((qw) => tWords.some((tw) => tw.startsWith(qw)))) {
    const covered = qWords.reduce((sum, qw) => sum + qw.length, 0);
    return 0.55 + 0.1 * Math.min(1, covered / t.replace(/ /g, '').length);
  }

  // 3) Characters in order (abbreviations like "drj" -> "dragon rojo").
  const sub = subsequenceScore(q, t);
  if (sub > 0 && q.replace(/ /g, '').length >= 2) return 0.32 + 0.2 * sub;

  // 4) Trigram similarity per query word against the best text word (typo tolerance).
  if (qWords.length === 0 || tWords.length === 0) return 0;
  let sum = 0;
  for (const qw of qWords) {
    let best = 0;
    for (const tw of tWords) best = Math.max(best, trigramSimilarity(qw, tw));
    sum += best;
  }
  const sim = sum / qWords.length;
  if (sim < 0.2) return 0;
  return Math.min(0.3, 0.05 + 0.25 * sim);
}
