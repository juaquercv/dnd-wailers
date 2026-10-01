import { createRng, type Prng } from './rng';
import {
  SAMPLE_RATE,
  brownNoise,
  buffer,
  circular,
  drumHit,
  echo,
  expDecay,
  filter,
  lfo,
  mixAt,
  mixInto,
  noiseHit,
  normalize,
  pinkNoise,
  reverb,
  samplesFor,
  sweep,
  whiteNoise,
  type Buf,
} from './synth';

/** Seamless ambience loops. */

function birdCall(rng: Prng): Buf {
  const species = rng.int(0, 2);
  const parts: { len: number; f: (x: number) => number; gap: number }[] = [];
  if (species === 0) {
    // Long descending whistle, sometimes doubled.
    const base = rng.range(2800, 3600);
    const reps = rng.int(1, 2);
    for (let i = 0; i < reps; i++) parts.push({ len: rng.range(0.22, 0.32), f: (x) => base * (1.35 - 0.35 * x), gap: 0.12 });
  } else if (species === 1) {
    // Fast trill.
    const base = rng.range(3800, 4600);
    const notes = rng.int(5, 9);
    for (let i = 0; i < notes; i++) parts.push({ len: 0.045, f: (x) => base * (i % 2 === 0 ? 1 : 1.12) * (1 + 0.05 * x), gap: 0.02 });
  } else {
    // Rising chirps.
    const base = rng.range(2400, 3000);
    const notes = rng.int(2, 4);
    for (let i = 0; i < notes; i++) parts.push({ len: rng.range(0.07, 0.11), f: (x) => base * (1 + 0.5 * x * x), gap: rng.range(0.05, 0.1) });
  }
  const total = parts.reduce((s, p) => s + p.len + p.gap, 0) + 0.05;
  const out = buffer(total);
  let cursor = 0;
  for (const p of parts) {
    const n = samplesFor(p.len);
    const start = Math.round(cursor * SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      phase += p.f(x) / SAMPLE_RATE;
      const env = Math.pow(Math.sin(Math.PI * x), 2);
      const j = start + i;
      if (j < out.length) out[j] = (out[j] ?? 0) + Math.sin(2 * Math.PI * phase) * env;
    }
    cursor += p.len + p.gap;
  }
  return out;
}

export function bosque(): Buf {
  const rng = createRng('amb-bosque');
  const L = 16;
  const loop = buffer(L);
  const n = loop.length;
  const wind = circular(pinkNoise(n, rng), (x) => sweep(x, 'bandpass', (t) => 520 + 280 * lfo(t, 2 / L), 0.6));
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    wind[i] = (wind[i] ?? 0) * (0.55 + 0.25 * lfo(t, 3 / L) + 0.15 * lfo(t, 5 / L, 0.3));
  }
  mixInto(loop, wind, 0, 0.9);
  const leaves = circular(whiteNoise(n, rng), (x) => filter(x, 'highpass', 3200, 0.7));
  for (let i = 0; i < n; i++) leaves[i] = (leaves[i] ?? 0) * Math.max(0, lfo(i / SAMPLE_RATE, 4 / L, 0.15)) ** 2;
  mixInto(loop, leaves, 0, 0.07);
  const birds = buffer(L);
  for (let k = 0; k < 12; k++) mixAt(birds, birdCall(rng), rng.range(0, L), rng.range(0.08, 0.2), true);
  const birdsWet = circular(birds, (x) => echo(x, 0.23, 0.3, 0.25, 5000));
  mixInto(loop, birdsWet, 0, 1);
  const wet = circular(loop, (x) => reverb(x, { room: 0.5, damp: 0.5, wet: 0.14, dry: 1 }));
  return normalize(wet, 0.7);
}

export function lluvia(): Buf {
  const rng = createRng('amb-lluvia');
  const L = 12;
  const loop = buffer(L);
  const n = loop.length;
  const hiss = circular(whiteNoise(n, rng), (x) => filter(filter(x, 'highpass', 1000, 0.7), 'lowpass', 7000, 0.7));
  mixInto(loop, hiss, 0, 0.32);
  const body = circular(pinkNoise(n, rng), (x) => filter(x, 'lowpass', 900, 0.7));
  for (let i = 0; i < n; i++) body[i] = (body[i] ?? 0) * (0.9 + 0.1 * lfo(i / SAMPLE_RATE, 2 / L));
  mixInto(loop, body, 0, 0.55);
  const rumble = circular(brownNoise(n, rng), (x) => filter(x, 'lowpass', 120, 0.7));
  mixInto(loop, rumble, 0, 0.35);
  for (let k = 0; k < 280; k++) {
    const len = rng.range(0.012, 0.035);
    const f0 = rng.range(1800, 4500);
    const drop = buffer(len);
    let phase = 0;
    for (let i = 0; i < drop.length; i++) {
      const x = i / drop.length;
      phase += (f0 * (1 - 0.4 * x)) / SAMPLE_RATE;
      drop[i] = Math.sin(2 * Math.PI * phase);
    }
    expDecay(drop, len * 0.35, 0.0005);
    mixAt(loop, drop, rng.range(0, L), rng.range(0.03, 0.18) * rng.next(), true);
  }
  for (let k = 0; k < 10; k++) {
    const plop = drumHit(rng, { f0: rng.range(900, 1300), f1: rng.range(500, 700), sweep: 0.01, decay: 0.03, noise: 0.1, noiseDecay: 0.005, noiseFreq: 3000, length: 0.12 });
    mixAt(loop, plop, rng.range(0, L), rng.range(0.1, 0.22), true);
  }
  return normalize(loop, 0.7);
}

export function cueva(): Buf {
  const rng = createRng('amb-cueva');
  const L = 16;
  const loop = buffer(L);
  const n = loop.length;
  const rumble = circular(brownNoise(n, rng), (x) => filter(filter(x, 'lowpass', 110, 0.7), 'lowpass', 160, 0.7));
  for (let i = 0; i < n; i++) rumble[i] = (rumble[i] ?? 0) * (0.75 + 0.25 * lfo(i / SAMPLE_RATE, 2 / L));
  mixInto(loop, rumble, 0, 1.4);
  const howl = circular(pinkNoise(n, rng), (x) => sweep(x, 'bandpass', (t) => 250 + 70 * lfo(t, 2 / L, 0.2), 4));
  for (let i = 0; i < n; i++) howl[i] = (howl[i] ?? 0) * (0.4 + 0.6 * Math.max(0, lfo(i / SAMPLE_RATE, 1 / L, 0.6)));
  mixInto(loop, howl, 0, 0.5);
  const drips = buffer(L);
  for (let k = 0; k < 9; k++) {
    const t = rng.range(0, L);
    const len = 0.12;
    const d = buffer(len);
    let phase = 0;
    const f0 = rng.range(800, 1100);
    for (let i = 0; i < d.length; i++) {
      const tt = i / SAMPLE_RATE;
      phase += (f0 * (1 + 0.9 * Math.min(1, tt / 0.025))) / SAMPLE_RATE;
      d[i] = Math.sin(2 * Math.PI * phase) * Math.exp(-tt / 0.03);
    }
    mixAt(drips, d, t, rng.range(0.35, 0.6), true);
    mixAt(drips, noiseHit(rng, 0.04, 'bandpass', 3200, 3, 0.008), t + 0.045, 0.15, true);
  }
  mixInto(loop, drips, 0, 1);
  const wet = circular(loop, (x) => reverb(x, { room: 0.92, damp: 0.3, wet: 0.5, dry: 0.8 }));
  return normalize(wet, 0.7);
}

export function fuegoDeCampamento(): Buf {
  const rng = createRng('amb-fuego');
  const L = 12;
  const loop = buffer(L);
  const n = loop.length;
  const roar = circular(brownNoise(n, rng), (x) => filter(x, 'lowpass', 300, 0.7));
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    roar[i] = (roar[i] ?? 0) * (0.7 + 0.12 * lfo(t, 3 / L) + 0.1 * lfo(t, 7 / L, 0.2) + 0.08 * lfo(t, 11 / L, 0.7));
  }
  mixInto(loop, roar, 0, 1.2);
  const hiss = circular(whiteNoise(n, rng), (x) => filter(x, 'highpass', 4000, 0.7));
  mixInto(loop, hiss, 0, 0.035);
  const clusters = Array.from({ length: 40 }, () => rng.range(0, L));
  for (let k = 0; k < 360; k++) {
    const center = rng.pick(clusters);
    const t = center + rng.jitter(0.18);
    const len = rng.range(0.001, 0.005);
    const c = whiteNoise(samplesFor(len) + 40, rng);
    filter(c, 'highpass', rng.range(1500, 3500), 0.7);
    expDecay(c, len, 0.0002);
    const gain = 0.05 + 0.5 * Math.pow(rng.next(), 3);
    mixAt(loop, c, t, gain, true);
  }
  for (let k = 0; k < 14; k++) {
    const t = rng.range(0, L);
    mixAt(loop, noiseHit(rng, 0.06, 'bandpass', rng.range(800, 1400), 2, 0.012), t, rng.range(0.3, 0.55), true);
    mixAt(loop, drumHit(rng, { f0: 200, f1: 90, sweep: 0.01, decay: 0.03, noise: 0, noiseDecay: 0.01, noiseFreq: 500, length: 0.1 }), t, rng.range(0.25, 0.4), true);
  }
  const wet = circular(loop, (x) => reverb(x, { room: 0.3, damp: 0.6, wet: 0.1, dry: 1 }));
  return normalize(wet, 0.72);
}
