import { createRng } from './rng';
import {
  SAMPLE_RATE,
  bell,
  brass,
  brownNoise,
  buffer,
  choir,
  circular,
  cymbal,
  drumHit,
  filter,
  flute,
  lfo,
  midiToFreq,
  mixAt,
  mixInto,
  noiseHit,
  normalize,
  osc,
  pinkNoise,
  pluck,
  reverb,
  scale,
  softClip,
  sweep,
  swell,
  timpani,
  whiteNoise,
  type Buf,
} from './synth';

/** Seamless music loops (events are mixed with wrap-around; effects run circularly). */

type Note = [pos: number, midi: number, len: number];

/** Frequency adjusted so that a whole number of cycles fits the loop (no click at the loop point). */
function loopFreq(freq: number, loopSeconds: number): number {
  return Math.max(1, Math.round(freq * loopSeconds)) / loopSeconds;
}

// ---------------------------------------------------------------------------
// Taberna alegre — D major jig, plucked lute arpeggios, light percussion (20 s)
// ---------------------------------------------------------------------------

const TAVERN_MELODY: Note[][] = [
  [[0, 69, 2], [2, 66, 1], [3, 69, 1], [4, 74, 2]],
  [[0, 71, 2], [2, 74, 1], [3, 71, 1], [4, 67, 2]],
  [[0, 66, 1], [1, 69, 1], [2, 74, 2], [4, 78, 2]],
  [[0, 76, 3], [3, 73, 1], [4, 69, 2]],
  [[0, 74, 2], [2, 78, 1], [3, 76, 1], [4, 74, 2]],
  [[0, 71, 2], [2, 79, 1], [3, 78, 1], [4, 74, 2]],
  [[0, 69, 1], [1, 73, 1], [2, 76, 2], [4, 73, 2]],
  [[0, 74, 4]],
  [[0, 78, 2], [2, 74, 1], [3, 71, 1], [4, 66, 2]],
  [[0, 67, 1], [1, 71, 1], [2, 74, 2], [4, 79, 2]],
  [[0, 78, 2], [2, 76, 1], [3, 74, 1], [4, 69, 2]],
  [[0, 73, 2], [2, 76, 2], [4, 81, 2]],
  [[0, 78, 1], [1, 79, 1], [2, 78, 1], [3, 76, 1], [4, 74, 2]],
  [[0, 71, 2], [2, 74, 1], [3, 79, 1], [4, 71, 2]],
  [[0, 69, 1], [1, 71, 1], [2, 73, 1], [3, 76, 1], [4, 81, 2]],
  [[0, 74, 3], [3, 69, 1], [4, 74, 2]],
];

export function tabernaAlegre(): Buf {
  const rng = createRng('music-taberna');
  const eighth = 60 / 144 / 2;
  const bar = eighth * 6;
  const bars = 16;
  const loop = buffer(bar * bars);
  const chords: [root: number, minor: boolean][] = [
    [50, false], [55, false], [50, false], [57, false], [50, false], [55, false], [57, false], [50, false],
    [47, true], [55, false], [50, false], [57, false], [47, true], [55, false], [57, false], [50, false],
  ];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const [root, minor] = chords[b]!;
    const third = minor ? 3 : 4;
    const arp = [root, root + 7, root + 12, root + 12 + third, root + 12, root + 7];
    arp.forEach((m, i) => mixAt(loop, pluck(midiToFreq(m), 1.1, rng, { decay: 0.995, brightness: 0.42 }), t0 + i * eighth, i === 0 ? 0.3 : 0.22, true));
    mixAt(loop, pluck(midiToFreq(root - 12), 1.6, rng, { decay: 0.997, brightness: 0.3 }), t0, 0.42, true);
    mixAt(loop, pluck(midiToFreq(root - 5), 1.0, rng, { decay: 0.996, brightness: 0.3 }), t0 + 4 * eighth, 0.26, true);
    for (const [pos, m, len] of TAVERN_MELODY[b]!) {
      mixAt(loop, pluck(midiToFreq(m), Math.max(0.7, len * eighth + 0.5), rng, { decay: 0.997, brightness: 0.78 }), t0 + pos * eighth, 0.34, true);
      if (b >= 8) mixAt(loop, flute(midiToFreq(m), len * eighth * 0.92, rng), t0 + pos * eighth, 0.12, true);
    }
    mixAt(loop, drumHit(rng, { f0: 135, f1: 72, sweep: 0.03, decay: 0.16, noise: 0.25, noiseDecay: 0.03, noiseFreq: 900, length: 0.4 }), t0, 0.3, true);
    mixAt(loop, drumHit(rng, { f0: 170, f1: 95, sweep: 0.02, decay: 0.1, noise: 0.3, noiseDecay: 0.02, noiseFreq: 1200, length: 0.3 }), t0 + 3 * eighth, 0.14, true);
    for (let e = 0; e < 6; e++) mixAt(loop, noiseHit(rng, 0.09, 'highpass', 6500, 0.7, 0.025), t0 + e * eighth, e % 2 === 0 ? 0.05 : 0.09, true);
    for (const e of [2, 4]) {
      const jingle = noiseHit(rng, 0.25, 'bandpass', 7200, 2, 0.07);
      mixAt(loop, jingle, t0 + e * eighth, 0.12, true);
    }
  }
  softClip(normalize(loop, 1), 1.4);
  const wet = circular(loop, (x) => reverb(x, { room: 0.55, damp: 0.5, wet: 0.22, dry: 0.9 }));
  return normalize(wet, 0.85);
}

// ---------------------------------------------------------------------------
// Tambores de guerra — D minor, taiko drums, low brass ostinato and horns (19.2 s)
// ---------------------------------------------------------------------------

const WAR_HORNS: Record<number, Note[]> = {
  4: [[0, 62, 2], [2, 65, 1], [3, 64, 1]],
  5: [[0, 62, 2], [2, 57, 2]],
  6: [[0, 58, 2], [2, 60, 1], [3, 62, 1]],
  7: [[0, 60, 2], [2, 55, 2]],
  8: [[0, 62, 1], [1, 65, 1], [2, 69, 2]],
  9: [[0, 67, 2], [2, 65, 1], [3, 62, 1]],
  10: [[0, 65, 2], [2, 62, 1], [3, 65, 1]],
  11: [[0, 64, 2], [2, 61, 2]],
};

export function tamboresDeGuerra(): Buf {
  const rng = createRng('music-guerra');
  const s16 = 60 / 150 / 4;
  const beat = s16 * 4;
  const bar = s16 * 16;
  const bars = 12;
  const loop = buffer(bar * bars);
  const prog: [root: number, minor: boolean][] = [
    [38, true], [38, true], [34, false], [36, false],
    [38, true], [38, true], [34, false], [36, false],
    [38, true], [43, true], [34, false], [33, false],
  ];
  const taiko = (): Buf => drumHit(rng, { f0: 150, f1: 56, sweep: 0.05, decay: 0.42, noise: 0.35, noiseDecay: 0.025, noiseFreq: 1200, length: 1.0 });
  const tom = (f: number): Buf => drumHit(rng, { f0: f * 1.6, f1: f, sweep: 0.04, decay: 0.22, noise: 0.25, noiseDecay: 0.02, noiseFreq: 1500, length: 0.6 });
  const clack = (): Buf => {
    const a = noiseHit(rng, 0.15, 'bandpass', 2600, 1.2, 0.035);
    mixInto(a, drumHit(rng, { f0: 430, f1: 330, sweep: 0.01, decay: 0.05, noise: 0, noiseDecay: 0.01, noiseFreq: 1000, length: 0.15 }), 0, 0.5);
    return a;
  };
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const fill = b % 4 === 3;
    const hits: [number, number][] = fill
      ? [[0, 1], [6, 0.6], [8, 0.9], [10, 0.6], [12, 0.7], [13, 0.75], [14, 0.85], [15, 0.95]]
      : [[0, 1], [6, 0.6], [8, 0.9], [11, 0.6], [14, 0.7]];
    for (const [pos, gain] of hits) {
      if (fill && pos >= 10) mixAt(loop, tom(105 + (pos - 10) * 14), t0 + pos * s16, gain * 0.5, true);
      else mixAt(loop, taiko(), t0 + pos * s16, gain * 0.62, true);
    }
    mixAt(loop, clack(), t0 + 4 * s16, 0.2, true);
    mixAt(loop, clack(), t0 + 12 * s16, 0.2, true);
    const [root, minor] = prog[b]!;
    const third = minor ? 3 : 4;
    [0, 0, 7, 0, 12, 0, 7, 12 + third].forEach((off, i) =>
      mixAt(loop, brass(midiToFreq(root + off), s16 * 1.5, { attack: 0.008, release: 0.07, cutoff: 260, bright: 900, vibrato: 0 }), t0 + i * 2 * s16, 0.3, true),
    );
    if (b % 2 === 0) {
      for (const off of [12, 12 + third, 19]) mixAt(loop, brass(midiToFreq(root + off), 0.42, { attack: 0.015, release: 0.25, cutoff: 600, bright: 2200 }), t0, 0.15, true);
    }
    for (const [pos, m, len] of WAR_HORNS[b] ?? []) {
      mixAt(loop, brass(midiToFreq(m), len * beat * 0.95, { attack: 0.06, release: 0.2, cutoff: 480, bright: 1500, vibrato: 0.005 }), t0 + pos * beat, 0.3, true);
    }
  }
  mixAt(loop, cymbal(rng, 2.6), 0, 0.28, true);
  mixAt(loop, cymbal(rng, 2.2), 8 * bar, 0.2, true);
  const wet = circular(loop, (x) => reverb(x, { room: 0.68, damp: 0.5, wet: 0.2, dry: 0.95 }));
  return normalize(wet, 0.86);
}

// ---------------------------------------------------------------------------
// Cripta silenciosa — drones, wind, dissonant bells, heartbeat, whispers (24 s)
// ---------------------------------------------------------------------------

export function criptaSilenciosa(): Buf {
  const rng = createRng('music-cripta');
  const L = 24;
  const loop = buffer(L);
  const n = loop.length;
  const fA1 = loopFreq(55, L);
  const fA1b = loopFreq(55.4, L);
  const fEb = loopFreq(155.56, L);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const amp = 0.6 + 0.25 * lfo(t, 2 / L);
    const tri = 0.5 + 0.5 * lfo(t, 1 / L, -0.25);
    loop[i] = (Math.sin(2 * Math.PI * fA1 * t) + 0.6 * Math.sin(2 * Math.PI * fA1b * t)) * 0.2 * amp + (Math.sin(2 * Math.PI * fEb * t) + 0.3 * Math.sin(4 * Math.PI * fEb * t)) * 0.05 * tri;
  }
  const saw = osc('saw', loopFreq(110, L), L);
  const sawLoop = new Float32Array(n);
  sawLoop.set(saw.subarray(0, n));
  const dark = circular(sawLoop, (x) => sweep(x, 'lowpass', (t) => 260 + 180 * (0.5 + 0.5 * lfo(t, 3 / L)), 2.5));
  mixInto(loop, dark, 0, 0.12);
  const wind = circular(brownNoise(n, rng), (x) => sweep(x, 'bandpass', (t) => 520 + 300 * lfo(t, 4 / L), 1.6));
  for (let i = 0; i < n; i++) wind[i] = (wind[i] ?? 0) * (0.6 + 0.4 * lfo(i / SAMPLE_RATE, 3 / L, 0.1));
  mixInto(loop, wind, 0, 0.5);
  const bells: [number, number[], number][] = [
    [0.5, [69], 0.3],
    [4.5, [75], 0.22],
    [9.0, [69, 70], 0.2],
    [13.5, [65], 0.26],
    [17.0, [70], 0.22],
    [21.0, [76, 70], 0.16],
  ];
  for (const [t, notes, gain] of bells) for (const m of notes) mixAt(loop, bell(midiToFreq(m), 5.5, 1.8), t, gain, true);
  for (const t of [6, 18]) {
    const beatA = drumHit(rng, { f0: 75, f1: 46, sweep: 0.03, decay: 0.18, noise: 0.1, noiseDecay: 0.02, noiseFreq: 300, length: 0.5 });
    mixAt(loop, beatA, t, 0.55, true);
    mixAt(loop, beatA, t + 0.34, 0.4, true);
  }
  for (const t of [11, 20.2]) {
    const len = 2.2;
    const w = whiteNoise(Math.round(len * SAMPLE_RATE), rng);
    filter(w, 'bandpass', 2400, 3);
    for (let i = 0; i < w.length; i++) {
      const tt = i / SAMPLE_RATE;
      w[i] = (w[i] ?? 0) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 7.5 * tt)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 1.3 * tt));
    }
    mixAt(loop, swell(w, 0.8, 1.2), t, 0.35, true);
  }
  const wet = circular(loop, (x) => reverb(x, { room: 0.9, damp: 0.4, wet: 0.42, dry: 0.8 }));
  return normalize(wet, 0.8);
}

// ---------------------------------------------------------------------------
// Himno del dragón — choir, low strings, timpani and heroic horns (24 s)
// ---------------------------------------------------------------------------

const HYMN_HORNS: Note[][] = [
  [[0, 62, 2], [2, 57, 1], [3, 62, 1]],
  [[0, 65, 2], [2, 64, 1], [3, 62, 1]],
  [[0, 60, 2], [2, 65, 2]],
  [[0, 64, 3], [3, 60, 1]],
  [[0, 62, 2], [2, 65, 1], [3, 69, 1]],
  [[0, 67, 2], [2, 70, 1], [3, 69, 1]],
  [[0, 65, 2], [2, 62, 1], [3, 65, 1]],
  [[0, 64, 2], [2, 61, 2]],
];

export function himnoDelDragon(): Buf {
  const rng = createRng('music-himno');
  const beat = 60 / 80;
  const bar = beat * 4;
  const bars = 8;
  const loop = buffer(bar * bars);
  const chords: { root: number; voicing: number[] }[] = [
    { root: 38, voicing: [50, 57, 62, 65] },
    { root: 34, voicing: [46, 53, 58, 62] },
    { root: 41, voicing: [53, 57, 60, 65] },
    { root: 36, voicing: [48, 55, 60, 64] },
    { root: 38, voicing: [50, 57, 62, 65] },
    { root: 43, voicing: [55, 58, 62, 67] },
    { root: 34, voicing: [46, 53, 58, 62] },
    { root: 33, voicing: [45, 52, 57, 61] },
  ];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const { root, voicing } = chords[b]!;
    mixAt(loop, choir(voicing.map(midiToFreq), bar + 0.9, rng, { attack: 0.45, release: 0.9, vowel: b % 2 === 0 ? 'a' : 'o' }), t0, 0.55, true);
    [0, 0, 12, 0, 0, 12, 0, 7].forEach((off, i) =>
      mixAt(loop, brass(midiToFreq(root + off), beat * 0.42, { attack: 0.01, release: 0.08, cutoff: 240, bright: 700, vibrato: 0 }), t0 + (i * beat) / 2, 0.22, true),
    );
    const tRoot = root < 38 ? root + 12 : root;
    mixAt(loop, timpani(midiToFreq(tRoot), rng), t0, 0.55, true);
    mixAt(loop, timpani(midiToFreq(tRoot), rng), t0 + 2 * beat, 0.35, true);
    if (b === 3 || b === 7) {
      for (let k = 0; k < 8; k++) mixAt(loop, timpani(midiToFreq(tRoot), rng, 0.8), t0 + 3 * beat + (k * beat) / 8, 0.1 + k * 0.045, true);
    }
    for (const [pos, m, len] of HYMN_HORNS[b]!) {
      mixAt(loop, brass(midiToFreq(m), len * beat * 0.95, { attack: 0.08, release: 0.3, cutoff: 450, bright: 1500, vibrato: 0.006 }), t0 + pos * beat, 0.3, true);
    }
  }
  mixAt(loop, cymbal(rng, 3), 0, 0.26, true);
  mixAt(loop, cymbal(rng, 3), 4 * bar, 0.22, true);
  const air = circular(pinkNoise(loop.length, rng), (x) => sweep(x, 'bandpass', () => 900, 0.7));
  mixInto(loop, scale(air, 0.02), 0);
  const wet = circular(loop, (x) => reverb(x, { room: 0.85, damp: 0.45, wet: 0.3, dry: 0.9 }));
  return normalize(wet, 0.86);
}
