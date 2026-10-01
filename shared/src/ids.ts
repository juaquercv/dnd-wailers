const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random id usable in browser and Node (uses globalThis.crypto). */
export function newId(prefix = ''): string {
  const bytes = new Uint8Array(14);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

/** Cryptographically secure integer in [0, maxExclusive). */
export function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % maxExclusive;
  }
}

/** Secure float in [0, 1). */
export function secureRandom(): number {
  return secureRandomInt(0x40000000) / 0x40000000;
}

export type Rng = () => number;
