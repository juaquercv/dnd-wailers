/**
 * Deterministic pseudo-random generator for seed assets (mulberry32 seeded by a string hash).
 * The same seed always produces the same maps, portraits and sounds.
 */

export interface Prng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  /** Approximately normal (mean 0, deviation 1). */
  normal(): number;
  /** Signed float in [-amount, amount). */
  jitter(amount: number): number;
  /** Independent generator derived from this one and a label. */
  fork(label: string): Prng;
}

/** FNV-1a 32-bit hash with a final avalanche step. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string | number): Prng {
  const seedText = String(seed);
  const base = mulberry32(hashString(seedText));
  const rng: Prng = {
    next: base,
    range: (min, max) => min + (max - min) * base(),
    int: (min, max) => Math.floor(min + (max - min + 1) * base()),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() sobre una lista vacía');
      return items[Math.floor(base() * items.length)] as T;
    },
    chance: (probability) => base() < probability,
    normal: () => {
      let sum = 0;
      for (let i = 0; i < 6; i++) sum += base();
      return (sum - 3) / Math.sqrt(0.5);
    },
    jitter: (amount) => (base() * 2 - 1) * amount,
    fork: (label) => createRng(`${seedText}/${label}`),
  };
  return rng;
}
