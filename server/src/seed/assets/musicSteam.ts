import { createRng, type Prng } from './rng';
import {
  SAMPLE_RATE,
  brass,
  brownNoise,
  buffer,
  circular,
  drumHit,
  expDecay,
  filter,
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
  samplesFor,
  softClip,
  sweep,
  swell,
  whiteNoise,
  type Buf,
} from './synth';

/** Steampunk music and ambience loops for "Los Cielos de Latón" (seamless: wrap-around mixing, circular effects). */

type Note = [pos: number, midi: number, len: number];

/** Frequency adjusted so that a whole number of cycles fits the loop. */
function loopFreq(freq: number, loopSeconds: number): number {
  return Math.max(1, Math.round(freq * loopSeconds)) / loopSeconds;
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** Music-box tine: bright inharmonic partials with fast decay and a tiny pluck click. */
function musicBoxNote(freq: number, seconds: number, rng: Prng): Buf {
  const n = samplesFor(seconds);
  const out = new Float32Array(n);
  const partials: [ratio: number, amp: number, tau: number][] = [
    [1, 1, 0.9],
    [2.0, 0.28, 0.35],
    [3.01, 0.1, 0.2],
    [4.18, 0.16, 0.12],
    [5.43, 0.07, 0.07],
  ];
  for (const [ratio, amp, tau] of partials) {
    const f = freq * ratio;
    if (f > SAMPLE_RATE * 0.45) continue;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * f * t) * amp * Math.exp(-t / tau);
    }
  }
  mixInto(out, noiseHit(rng, 0.01, 'highpass', 5000, 0.7, 0.002), 0, 0.25);
  return expDecay(out, seconds, 0.0015);
}

/** Accordion-like reed voice: two detuned saws per note ("musette"), lowpassed, with a bellows swell. */
function reed(freqs: number[], gate: number, rng: Prng, cutoff = 1900): Buf {
  const release = 0.07;
  const seconds = gate + release;
  const n = samplesFor(seconds);
  const out = new Float32Array(n);
  for (const f of freqs) {
    for (const detune of [-0.0028, 0.0031]) {
      const v = osc('saw', f * (1 + detune), seconds, rng.next());
      for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (v[i] ?? 0) * 0.5;
    }
  }
  filter(out, 'lowpass', cutoff, 0.8);
  filter(out, 'peaking', 1200, 1.2, 4);
  const attack = 0.035;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = t < attack ? t / attack : t < gate ? 1 - 0.18 * Math.min(1, (t - attack) / gate) : 0.82 * Math.max(0, 1 - (t - gate) / release);
    out[i] = (out[i] ?? 0) * env * (1 + 0.06 * Math.sin(2 * Math.PI * 5.8 * t)) / freqs.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vals de vapor — C major waltz: music box melody, accordion oom-pah-pah, clockwork ticks (24 s)
// ---------------------------------------------------------------------------

const WALTZ_MELODY: Note[][] = [
  [[0, 76, 2], [2, 79, 1]],
  [[0, 84, 2], [2, 83, 1]],
  [[0, 81, 1], [1, 79, 1], [2, 77, 1]],
  [[0, 74, 3]],
  [[0, 74, 2], [2, 77, 1]],
  [[0, 83, 2], [2, 81, 1]],
  [[0, 79, 1], [1, 76, 1], [2, 72, 1]],
  [[0, 79, 3]],
  [[0, 77, 2], [2, 81, 1]],
  [[0, 84, 2], [2, 81, 1]],
  [[0, 79, 1], [1, 76, 1], [2, 79, 1]],
  [[0, 81, 2], [2, 79, 1]],
  [[0, 77, 2], [2, 81, 1]],
  [[0, 79, 1], [1, 77, 1], [2, 74, 1]],
  [[0, 72, 2], [2, 76, 1]],
  [[0, 72, 3]],
];

type WaltzChord = { bass: number; alt: number; tones: number[] };
const C_MAJ: WaltzChord = { bass: 48, alt: 43, tones: [60, 64, 67] };
const G7: WaltzChord = { bass: 43, alt: 50, tones: [59, 62, 65] };
const F_MAJ: WaltzChord = { bass: 41, alt: 48, tones: [60, 65, 69] };
const A_MIN: WaltzChord = { bass: 45, alt: 52, tones: [60, 64, 69] };
const D_MIN: WaltzChord = { bass: 50, alt: 45, tones: [62, 65, 69] };
const WALTZ_CHORDS: WaltzChord[] = [C_MAJ, C_MAJ, G7, G7, G7, G7, C_MAJ, C_MAJ, F_MAJ, F_MAJ, C_MAJ, A_MIN, D_MIN, G7, C_MAJ, C_MAJ];

export function valsDeVapor(): Buf {
  const rng = createRng('music-vals-vapor');
  const beat = 0.5;
  const bar = beat * 3;
  const bars = 16;
  const loop = buffer(bar * bars);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = WALTZ_CHORDS[b]!;
    const sameAsPrevious = b > 0 && WALTZ_CHORDS[b - 1] === chord;
    const bassNote = sameAsPrevious ? chord.alt : chord.bass;
    // Oom: bass reed + soft plucked bass.
    mixAt(loop, reed([midiToFreq(bassNote)], beat * 0.8, rng, 900), t0, 0.5, true);
    mixAt(loop, pluck(midiToFreq(bassNote - 12), 1.2, rng, { decay: 0.996, brightness: 0.25 }), t0, 0.35, true);
    // Pah-pah: short accordion chords.
    for (const k of [1, 2]) mixAt(loop, reed(chord.tones.map(midiToFreq), beat * 0.42, rng), t0 + k * beat, 0.32, true);
    // Melody on the music box (one octave up) with a quiet lower doubling.
    for (const [pos, m, len] of WALTZ_MELODY[b]!) {
      mixAt(loop, musicBoxNote(midiToFreq(m + 12), Math.max(1.2, len * beat + 0.9), rng), t0 + pos * beat, 0.42, true);
      mixAt(loop, musicBoxNote(midiToFreq(m), Math.max(1.0, len * beat + 0.6), rng), t0 + pos * beat + 0.012, 0.14, true);
    }
    // Sparkling arpeggio on the last beat of every other bar.
    if (b % 2 === 1) chord.tones.forEach((m, i) => mixAt(loop, musicBoxNote(midiToFreq(m + 24), 0.8, rng), t0 + 2 * beat + i * (beat / 3), 0.1, true));
    // Clockwork: tock on beat 1, ticks on 2 and 3.
    mixAt(loop, noiseHit(rng, 0.05, 'bandpass', 1300, 5, 0.012), t0, 0.22, true);
    for (const k of [1, 2]) mixAt(loop, noiseHit(rng, 0.04, 'bandpass', 2800, 6, 0.008), t0 + k * beat, 0.16, true);
  }
  // A gentle steam sigh every 8 bars.
  for (const at of [7.5 * bar, 15.5 * bar]) {
    const sigh = whiteNoise(samplesFor(1.6), rng);
    filter(filter(sigh, 'highpass', 2500, 0.7), 'lowpass', 7000, 0.7);
    mixAt(loop, swell(sigh, 0.5, 0.9), at, 0.05, true);
  }
  softClip(normalize(loop, 1), 1.2);
  const wet = circular(loop, (x) => reverb(x, { room: 0.62, damp: 0.45, wet: 0.26, dry: 0.9 }));
  return normalize(wet, 0.85);
}

// ---------------------------------------------------------------------------
// Persecución en las nubes — D minor chase: drums, engine chug, bass ostinato, brass (19.2 s)
// ---------------------------------------------------------------------------

const CHASE_BRASS: Record<number, Note[]> = {
  4: [[0, 74, 6], [6, 77, 2], [8, 81, 8]],
  5: [[0, 79, 4], [4, 77, 4], [8, 76, 4], [12, 74, 4]],
  6: [[0, 70, 6], [6, 74, 2], [8, 79, 8]],
  7: [[0, 76, 8], [8, 73, 8]],
  8: [[0, 74, 4], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  9: [[0, 77, 8], [8, 74, 8]],
  10: [[0, 79, 4], [4, 77, 4], [8, 74, 4], [12, 70, 4]],
  11: [[0, 73, 12], [12, 76, 4]],
};

export function persecucionEnLasNubes(): Buf {
  const rng = createRng('music-persecucion');
  const s16 = 60 / 150 / 4;
  const bar = s16 * 16;
  const bars = 12;
  const loop = buffer(bar * bars);
  // [root midi (bass octave), minor]
  const prog: [number, boolean][] = [
    [38, true], [38, true], [34, false], [36, false],
    [38, true], [38, true], [43, true], [45, false],
    [38, true], [34, false], [43, true], [45, false],
  ];
  const kick = (): Buf => drumHit(rng, { f0: 140, f1: 48, sweep: 0.04, decay: 0.28, noise: 0.2, noiseDecay: 0.015, noiseFreq: 1500, length: 0.6 });
  const snare = (): Buf => drumHit(rng, { f0: 260, f1: 180, sweep: 0.02, decay: 0.08, noise: 0.85, noiseDecay: 0.09, noiseFreq: 2600, length: 0.35 });
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const [root, minor] = prog[b]!;
    const third = minor ? 3 : 4;
    // Drums.
    for (const [pos, gain] of [[0, 1], [6, 0.75], [8, 0.95], [14, 0.6]] as [number, number][]) mixAt(loop, kick(), t0 + pos * s16, 0.55 * gain, true);
    for (const pos of [4, 12]) mixAt(loop, snare(), t0 + pos * s16, 0.32, true);
    if (b % 4 === 3) for (const pos of [13, 14, 15]) mixAt(loop, snare(), t0 + pos * s16, 0.18 + (pos - 13) * 0.05, true);
    for (let k = 0; k < 16; k++) mixAt(loop, noiseHit(rng, 0.06, 'highpass', 7000, 0.7, k % 4 === 2 ? 0.03 : 0.012), t0 + k * s16, k % 2 === 0 ? 0.07 : 0.045, true);
    // Engine chug (steam locomotive feel) on every 8th.
    for (let k = 0; k < 8; k++) {
      const chug = noiseHit(rng, 0.14, 'bandpass', k % 2 === 0 ? 900 : 1300, 1.4, 0.05);
      mixAt(loop, chug, t0 + k * 2 * s16, k % 4 === 0 ? 0.2 : 0.12, true);
    }
    // Bass ostinato.
    const pattern = [0, 0, 12, 0, third, 0, 10, 0];
    pattern.forEach((iv, k) => {
      const f = midiToFreq(root + iv);
      const v = osc('saw', f, s16 * 1.8);
      filter(v, 'lowpass', 520, 1.1);
      expDecay(v, 0.16, 0.003);
      mixAt(loop, v, t0 + k * 2 * s16, 0.28, true);
      mixAt(loop, osc('sine', f / 2, s16 * 1.8).map((x, i) => x * Math.exp(-i / SAMPLE_RATE / 0.12)), t0 + k * 2 * s16, 0.22, true);
    });
    // Quick plucked ostinato on top (bars 1-4 and 9-12).
    if (b < 4 || b >= 8) {
      const arp = [root + 24, root + 24 + third, root + 31, root + 36];
      for (let k = 0; k < 16; k++) mixAt(loop, pluck(midiToFreq(arp[k % 4]!), 0.5, rng, { decay: 0.993, brightness: 0.6 }), t0 + k * s16, 0.09, true);
    }
    // Brass: stabs in the intro, melody afterwards.
    const melody = CHASE_BRASS[b];
    if (melody) {
      for (const [pos, m, len] of melody) {
        mixAt(loop, brass(midiToFreq(m), len * s16 * 0.95, { attack: 0.03, release: 0.12, cutoff: 700, bright: 2400 }), t0 + pos * s16, 0.22, true);
        mixAt(loop, brass(midiToFreq(m - 12), len * s16 * 0.95, { attack: 0.04, release: 0.12, cutoff: 500, bright: 1400 }), t0 + pos * s16, 0.12, true);
      }
    } else {
      for (const pos of [0, 6, 10]) {
        for (const iv of [0, 7, 12]) mixAt(loop, brass(midiToFreq(root + 24 + iv), s16 * 1.4, { attack: 0.015, release: 0.08, cutoff: 800, bright: 2600 }), t0 + pos * s16, 0.1, true);
      }
    }
  }
  softClip(normalize(loop, 1), 1.6);
  const wet = circular(loop, (x) => reverb(x, { room: 0.5, damp: 0.5, wet: 0.16, dry: 0.95 }));
  return normalize(wet, 0.86);
}

// ---------------------------------------------------------------------------
// Ambience: Sala de máquinas — engine hum, pistons, steam hiss, gear ticks (16 s)
// ---------------------------------------------------------------------------

function metalTick(rng: Prng, base: number, length: number): Buf {
  const out = buffer(length);
  for (const [ratio, amp] of [
    [1, 1],
    [1.53, 0.6],
    [2.31, 0.4],
    [3.17, 0.25],
  ] as [number, number][]) {
    const f = base * ratio;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * f * t) * amp * Math.exp(-t / (length * 0.25));
    }
  }
  mixInto(out, noiseHit(rng, 0.02, 'highpass', 3000, 0.7, 0.004), 0, 0.8);
  return out;
}

export function salaDeMaquinas(): Buf {
  const rng = createRng('amb-sala-maquinas');
  const L = 16;
  const loop = buffer(L);
  const n = loop.length;
  // Deep engine hum (whole cycles per loop).
  const hum = osc('saw', loopFreq(55, L), L);
  filter(hum, 'lowpass', 260, 0.9);
  const hum2 = osc('sine', loopFreq(110, L), L);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    loop[i] = ((hum[i] ?? 0) * 0.5 + (hum2[i] ?? 0) * 0.25) * (0.85 + 0.15 * lfo(t, 24 / L));
  }
  const rumble = circular(brownNoise(n, rng), (x) => filter(x, 'lowpass', 140, 0.7));
  mixInto(loop, rumble, 0, 0.6);
  // Pistons: 24 cycles per loop, two strokes each.
  const cycle = L / 24;
  for (let k = 0; k < 24; k++) {
    const t = k * cycle;
    mixAt(loop, drumHit(rng, { f0: 90, f1: 46, sweep: 0.03, decay: 0.1, noise: 0.2, noiseDecay: 0.02, noiseFreq: 600, length: 0.3 }), t, 0.42, true);
    mixAt(loop, noiseHit(rng, 0.16, 'bandpass', 850, 1.6, 0.06), t + cycle * 0.5, 0.3, true);
    if (k % 2 === 0) mixAt(loop, metalTick(rng, rng.range(620, 760), 0.25), t + cycle * 0.25, 0.08, true);
  }
  // Steam releases.
  for (const at of [1.2, 6.6, 11.8]) {
    const hiss = whiteNoise(samplesFor(1.5), rng);
    filter(filter(hiss, 'highpass', 2800, 0.7), 'lowpass', 9000, 0.7);
    mixAt(loop, swell(hiss, 0.12, 1.1), at, 0.22, true);
  }
  // Gear train ticking.
  for (let k = 0; k < 64; k++) mixAt(loop, noiseHit(rng, 0.03, 'bandpass', 3400, 5, 0.005), k * (L / 64), k % 4 === 0 ? 0.08 : 0.04, true);
  // Pressure gauge ping.
  mixAt(loop, metalTick(rng, 1480, 0.9), 9.3, 0.07, true);
  const wet = circular(loop, (x) => reverb(x, { room: 0.72, damp: 0.4, wet: 0.3, dry: 0.9 }));
  return normalize(wet, 0.72);
}

// ---------------------------------------------------------------------------
// Ambience: Viento en cubierta — wind gusts, creaking ropes, flapping canvas, distant propellers (16 s)
// ---------------------------------------------------------------------------

function creak(rng: Prng, seconds: number, rate: [number, number], formants: [number, number, number][]): Buf {
  const impulses = buffer(seconds);
  let t = 0.01;
  while (t < seconds - 0.01) {
    const x = t / seconds;
    const r = rate[0] + (rate[1] - rate[0]) * Math.sin(Math.PI * x);
    const idx = Math.round(t * SAMPLE_RATE);
    impulses[idx] = (impulses[idx] ?? 0) + rng.range(0.5, 1) * Math.sin(Math.PI * x);
    t += (1 / r) * rng.range(0.85, 1.15);
  }
  const out = new Float32Array(impulses.length);
  for (const [f, q, gain] of formants) mixInto(out, filter(impulses.slice(), 'bandpass', f, q), 0, gain);
  return normalize(out, 1);
}

export function vientoEnCubierta(): Buf {
  const rng = createRng('amb-viento-cubierta');
  const L = 16;
  const loop = buffer(L);
  const n = loop.length;
  const wind = circular(pinkNoise(n, rng), (x) => sweep(x, 'bandpass', (t) => 560 + 320 * lfo(t, 2 / L) + 120 * lfo(t, 5 / L, 0.4), 0.7));
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    wind[i] = (wind[i] ?? 0) * (0.55 + 0.3 * Math.max(0, lfo(t, 3 / L)) + 0.15 * lfo(t, 7 / L, 0.3));
  }
  mixInto(loop, wind, 0, 1);
  const howl = circular(whiteNoise(n, rng), (x) => sweep(x, 'bandpass', (t) => 1150 + 260 * lfo(t, 1 / L, 0.2), 9));
  for (let i = 0; i < n; i++) howl[i] = (howl[i] ?? 0) * Math.max(0, lfo(i / SAMPLE_RATE, 2 / L, 0.6)) ** 2;
  mixInto(loop, howl, 0, 0.5);
  // Distant propellers: low hum pulsing at the blade rate.
  const prop = osc('sine', loopFreq(48, L), L);
  for (let i = 0; i < n; i++) prop[i] = (prop[i] ?? 0) * (0.6 + 0.4 * lfo(i / SAMPLE_RATE, loopFreq(5, L)));
  mixInto(loop, prop, 0, 0.18);
  // Rope creaks and hull groans.
  for (let k = 0; k < 6; k++) {
    const c = creak(rng, rng.range(0.35, 0.8), [60, 120], [[rng.range(650, 800), 9, 1], [rng.range(1300, 1500), 11, 0.6], [2300, 13, 0.3]]);
    mixAt(loop, c, rng.range(0, L), rng.range(0.1, 0.18), true);
  }
  for (const at of [3.4, 11.1]) mixAt(loop, creak(rng, 1.3, [18, 34], [[260, 6, 1], [540, 8, 0.6]]), at, 0.22, true);
  // Flapping canvas.
  for (const at of [5.2, 9.7, 14.1]) {
    const len = rng.range(0.6, 1.0);
    const flap = whiteNoise(samplesFor(len), rng);
    filter(flap, 'lowpass', 1600, 0.7);
    const rate = rng.range(9, 12);
    for (let i = 0; i < flap.length; i++) {
      const t = i / SAMPLE_RATE;
      flap[i] = (flap[i] ?? 0) * Math.max(0, Math.sin(2 * Math.PI * rate * t)) ** 3 * Math.sin((Math.PI * i) / flap.length);
    }
    mixAt(loop, flap, at, 0.2, true);
  }
  const wet = circular(loop, (x) => reverb(x, { room: 0.4, damp: 0.5, wet: 0.12, dry: 1 }));
  return normalize(wet, 0.7);
}
