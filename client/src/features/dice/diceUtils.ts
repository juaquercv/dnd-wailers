import {
  describeRoll,
  parseFormula,
  type DiceRollOutcome,
  type RollMode,
  type RollResult,
  type RollVisibility,
} from '@wailers/shared';

/** Visual helpers shared by the dice feature. Nothing here ever changes game state. */

export const MODE_LABELS: Record<RollMode, string> = {
  normal: 'Normal',
  advantage: 'Ventaja',
  disadvantage: 'Desventaja',
};

export const VISIBILITY_SHORT: Record<RollVisibility, string> = {
  public: 'Pública',
  player: 'Privada',
  secret: 'Secreta',
};

/** Wheel easing (CSS and JS versions must match). */
export const WHEEL_EASING_CSS = 'cubic-bezier(0.12, 0.8, 0.18, 1)';

const ROLL_KINDS = new Set(['dice', 'roulette', 'custom_die']);

/** Narrow log data / event payloads to a RollResult. */
export function isRollResult(data: unknown): data is RollResult {
  if (!data || typeof data !== 'object') return false;
  const r = data as Partial<RollResult>;
  return (
    typeof r.id === 'string' &&
    typeof r.kind === 'string' &&
    ROLL_KINDS.has(r.kind) &&
    Array.isArray(r.dice) &&
    typeof r.visibility === 'string' &&
    typeof r.rollerUserId === 'string'
  );
}

/** FNV-1a 32-bit hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic value in [0, 1) derived from a string (e.g. the roll id). */
export function hashUnit(input: string): number {
  return hashString(input) / 0x100000000;
}

/** Small deterministic PRNG (mulberry32) for repeatable visuals. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Outcome usable by shared describeRoll (null for roulettes / custom dice). */
export function rollOutcome(roll: RollResult): DiceRollOutcome | null {
  if (roll.kind !== 'dice' || roll.formula === null || roll.total === null) return null;
  return { formula: roll.formula, dice: roll.dice, modifier: roll.modifier, total: roll.total, crit: roll.crit };
}

/** "[14, (3)] + 5 = 19" or null. */
export function rollBreakdown(roll: RollResult): string | null {
  const outcome = rollOutcome(roll);
  if (!outcome) return null;
  try {
    return describeRoll(outcome);
  } catch {
    return null;
  }
}

/** Splits a d100 value into the "tens" (00–90) and "units" (0–9) dice faces. */
export function d100Parts(value: number): { tens: string; units: string } {
  const v = ((Math.round(value) % 100) + 100) % 100;
  return { tens: String(Math.floor(v / 10) * 10).padStart(2, '0'), units: String(v % 10) };
}

export function ordinal(n: number): string {
  return `${n}º`;
}

export function errorMessage(err: unknown, fallback = 'Algo salió mal'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

const AUTO_LABEL = /^tirada de\s+(.+)$/i;

/**
 * Label worth showing: the default ones built from the formula ("Tirada de 2d20+1d4+4") only repeat
 * the formula chip, so they count as no label.
 */
export function meaningfulRollLabel(label: string | null | undefined): string {
  const text = (label ?? '').trim();
  const auto = AUTO_LABEL.exec(text);
  if (auto) {
    try {
      if (parseFormula(auto[1]!).terms.length > 0) return '';
    } catch {
      // Not a formula: a real label that happens to start with "Tirada de".
    }
  }
  return text;
}

/** Heading of a roll; a generic one when it has no meaningful label. */
export function rollTitle(roll: RollResult): string {
  const label = meaningfulRollLabel(roll.label);
  if (label) return label;
  if (roll.kind === 'roulette') return 'Ruleta';
  if (roll.kind === 'custom_die') return 'Dado especial';
  return 'Tirada de dados';
}

/** Relative luminance (0..1) of a #rrggbb color; 0.5 for unknown formats. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/**
 * CSS cubic-bezier timing function in JS (same algorithm as browsers: Newton-Raphson with
 * bisection fallback). Returns progress for a time fraction t in [0, 1].
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): (t: number) => number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      if (hi - lo < 1e-7) break;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

export const wheelEase = cubicBezier(0.12, 0.8, 0.18, 1);
