import {
  newId,
  normalizeTag,
  normalizeText,
  parseFormula,
  ROULETTE_PALETTE,
  type Roller,
  type RollerInput,
  type RollerKind,
  type RouletteSegment,
} from '@wailers/shared';

/** Editor helpers for campaign dice and roulettes (validation messages in Spanish). */

export const KIND_LABELS: Record<RollerKind, string> = { roulette: 'Ruleta', dice: 'Dado' };

export const MAX_SEGMENTS = 100;
export const MAX_FACES = 100;
export const MAX_NAME = 80;

export type DiceMode = 'formula' | 'faces';

export interface RollerDraft {
  name: string;
  description: string;
  tags: string[];
  kind: RollerKind;
  active: boolean;
  isTurnRoll: boolean;
  segments: RouletteSegment[];
  diceMode: DiceMode;
  formula: string;
  faces: string[];
}

export interface DraftErrors {
  name?: string;
  segments?: string;
  segmentRows?: Record<string, string>;
  formula?: string;
  faces?: string;
  faceRows?: Record<number, string>;
}

export function paletteColor(index: number, count: number): string {
  const n = ROULETTE_PALETTE.length;
  const half = n / 2;
  if (count <= half) {
    const hue = Math.floor((index * half) / Math.max(1, count));
    return ROULETTE_PALETTE[(hue + (index % 2 === 1 ? half : 0)) % n]!;
  }
  const hue = index % half;
  const bright = Math.floor(index / half) % 2 === 1;
  return ROULETTE_PALETTE[(hue + (bright ? half : 0)) % n]!;
}

/** New roulette segment with a palette color. */
export function newSegment(index: number, count = index + 1): RouletteSegment {
  return {
    id: newId('seg'),
    label: `Opción ${index + 1}`,
    color: paletteColor(index, Math.max(count, index + 1)),
    weight: 1,
    icon: null,
    description: '',
  };
}

export function defaultSegments(): RouletteSegment[] {
  return Array.from({ length: 4 }, (_, i) => newSegment(i, 4));
}

/** Re-distributes palette colors so neighbors contrast (also the first and the last). */
export function spreadColors(segments: RouletteSegment[]): RouletteSegment[] {
  const colors = segments.map((_, i) => paletteColor(i, segments.length));
  const last = colors.length - 1;
  if (last > 0 && colors[last] === colors[0]) {
    colors[last] = ROULETTE_PALETTE[(ROULETTE_PALETTE.indexOf(colors[last]!) + 3) % ROULETTE_PALETTE.length]!;
  }
  return segments.map((s, i) => ({ ...s, color: colors[i]! }));
}

export function equalizeWeights(segments: RouletteSegment[]): RouletteSegment[] {
  return segments.map((s) => ({ ...s, weight: 1 }));
}

/** Copies segments with fresh ids (duplicates must not share ids). */
export function cloneSegments(segments: RouletteSegment[]): RouletteSegment[] {
  return segments.map((s) => ({ ...s, id: newId('seg') }));
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function draftFromRoller(roller: Roller | null, kind: RollerKind): RollerDraft {
  if (!roller) {
    return {
      name: kind === 'roulette' ? 'Nueva ruleta' : 'Nuevo dado',
      description: '',
      tags: [],
      kind,
      active: true,
      isTurnRoll: false,
      segments: kind === 'roulette' ? defaultSegments() : [],
      diceMode: 'formula',
      formula: '1d20',
      faces: [],
    };
  }
  const hasFaces = !!roller.faces && roller.faces.length > 0;
  return {
    name: roller.name,
    description: roller.description,
    tags: [...roller.tags],
    kind: roller.kind,
    active: roller.active,
    isTurnRoll: roller.isTurnRoll,
    segments: roller.segments.map((s) => ({ ...s })),
    diceMode: hasFaces ? 'faces' : 'formula',
    formula: roller.formula ?? '1d20',
    faces: hasFaces ? [...roller.faces!] : [],
  };
}

/** Stable JSON used to detect unsaved changes. */
export function draftSignature(d: RollerDraft): string {
  return JSON.stringify(d);
}

export function validateDraft(d: RollerDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.name.trim()) errors.name = 'El nombre es obligatorio';
  else if (d.name.trim().length > MAX_NAME) errors.name = `El nombre es demasiado largo (máximo ${MAX_NAME} caracteres)`;

  if (d.kind === 'roulette') {
    const rows: Record<string, string> = {};
    if (d.segments.length < 2) errors.segments = 'La ruleta necesita al menos 2 segmentos';
    else if (d.segments.length > MAX_SEGMENTS) errors.segments = `Máximo ${MAX_SEGMENTS} segmentos`;
    for (const s of d.segments) {
      if (!s.label.trim()) rows[s.id] = 'Escribe el texto del segmento';
      else if (!(typeof s.weight === 'number' && Number.isFinite(s.weight) && s.weight > 0)) rows[s.id] = 'El peso debe ser mayor que 0';
    }
    if (Object.keys(rows).length > 0) {
      errors.segmentRows = rows;
      if (!errors.segments) errors.segments = 'Revisa los segmentos marcados en rojo';
    }
  } else if (d.diceMode === 'formula') {
    if (!d.formula.trim()) errors.formula = 'Escribe una fórmula, por ejemplo 2d6+3';
    else {
      try {
        const parsed = parseFormula(d.formula);
        if (parsed.terms.length === 0) errors.formula = 'La fórmula debe incluir al menos un dado';
      } catch (err) {
        errors.formula = err instanceof Error ? err.message : 'Fórmula inválida';
      }
    }
  } else {
    const rows: Record<number, string> = {};
    if (d.faces.length < 2) errors.faces = 'El dado necesita al menos 2 caras';
    else if (d.faces.length > MAX_FACES) errors.faces = `Máximo ${MAX_FACES} caras`;
    d.faces.forEach((f, i) => {
      if (!f.trim()) rows[i] = 'Escribe el texto de la cara';
    });
    if (Object.keys(rows).length > 0) {
      errors.faceRows = rows;
      if (!errors.faces) errors.faces = 'Todas las caras necesitan un texto';
    }
  }
  return errors;
}

export function hasErrors(e: DraftErrors): boolean {
  return !!(e.name || e.segments || e.formula || e.faces);
}

export function draftToInput(d: RollerDraft): RollerInput {
  const base: RollerInput = {
    name: d.name.trim(),
    description: d.description.trim(),
    tags: d.tags,
    kind: d.kind,
    active: d.active,
    isTurnRoll: d.isTurnRoll,
  };
  if (d.kind === 'roulette') {
    return {
      ...base,
      segments: d.segments.map((s) => ({
        ...s,
        label: s.label.trim(),
        description: s.description.trim(),
        icon: s.icon && s.icon.trim() ? s.icon.trim() : null,
      })),
      formula: null,
      faces: null,
    };
  }
  if (d.diceMode === 'faces') {
    return { ...base, segments: [], formula: null, faces: d.faces.map((f) => f.trim()) };
  }
  return { ...base, segments: [], formula: d.formula.trim(), faces: null };
}

/** Input for an independent copy inside the same campaign. */
export function duplicateInput(r: Roller, existingNames: string[]): RollerInput {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  let name = `${r.name} (copia)`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${r.name} (copia ${i})`;
  return {
    name,
    description: r.description,
    tags: [...r.tags],
    kind: r.kind,
    active: r.active,
    isTurnRoll: false,
    segments: cloneSegments(r.segments),
    formula: r.formula,
    faces: r.faces ? [...r.faces] : null,
  };
}

export function sortRollers(list: Roller[]): Roller[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

/** Accent/case-insensitive match on name, description, tags and segment labels. */
export function matchesQuery(r: Roller, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = normalizeText(
    [r.name, r.description, r.tags.join(' '), r.segments.map((s) => s.label).join(' '), (r.faces ?? []).join(' '), r.formula ?? ''].join(' '),
  );
  return q.split(/\s+/).every((word) => haystack.includes(word) || haystack.includes(normalizeTag(word)));
}

/** Short description of what a roller rolls. */
export function rollerSummary(r: Roller): string {
  if (r.kind === 'roulette') return `${r.segments.length} ${r.segments.length === 1 ? 'segmento' : 'segmentos'}`;
  if (r.faces && r.faces.length > 0) return `${r.faces.length} caras personalizadas`;
  return r.formula ?? '—';
}

/** All tags used by a set of rollers, most frequent first. */
export function tagCounts(list: Roller[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of list) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es'));
}
