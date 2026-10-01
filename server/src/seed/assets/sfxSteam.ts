import { createRng, type Prng } from './rng';
import {
  SAMPLE_RATE,
  buffer,
  drumHit,
  echo,
  expDecay,
  fade,
  filter,
  mixAt,
  mixInto,
  noiseHit,
  normalize,
  pinkNoise,
  reverb,
  samplesFor,
  softClip,
  sweep,
  whiteNoise,
  type Buf,
} from './synth';

/** Steampunk one-shot effects: steam whistle, gears, steam pistol shot and propellers. */

function clang(rng: Prng, base: number, length: number): Buf {
  const out = buffer(length);
  for (const [ratio, amp, dk] of [
    [1, 1, 0.9],
    [1.47, 0.7, 0.7],
    [2.09, 0.5, 0.5],
    [2.76, 0.3, 0.35],
  ] as [number, number, number][]) {
    const f = base * ratio;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * f * t) * amp * Math.exp(-t / (length * dk * 0.5));
    }
  }
  mixInto(out, noiseHit(rng, 0.03, 'highpass', 2500, 0.7, 0.005), 0, 1.2);
  return expDecay(out, length, 0.0005);
}

/** Three-chime steam whistle: resonant turbulent noise with a slight pitch rise, plus hiss. */
export function silbatoDeVapor(): Buf {
  const rng = createRng('sfx-silbato');
  const length = 2.6;
  const out = buffer(length);
  const gate = 1.75;
  const release = 0.45;
  const env = (t: number): number => (t < 0.09 ? t / 0.09 : t < gate ? 1 : Math.max(0, 1 - (t - gate) / release));
  for (const [f, gain] of [
    [523.25, 1],
    [659.25, 0.85],
    [783.99, 0.7],
  ] as [number, number][]) {
    const nz = whiteNoise(samplesFor(gate + release), rng);
    sweep(nz, 'bandpass', (t) => f * (0.965 + 0.035 * Math.min(1, t / 0.18)), 38, 16);
    const tone = new Float32Array(nz.length);
    let phase = 0;
    for (let i = 0; i < tone.length; i++) {
      const t = i / SAMPLE_RATE;
      phase += (f * (0.965 + 0.035 * Math.min(1, t / 0.18))) / SAMPLE_RATE;
      tone[i] = (Math.sin(2 * Math.PI * phase) * 0.25 + (nz[i] ?? 0) * 6) * env(t) * (1 + 0.04 * Math.sin(2 * Math.PI * 6.3 * t));
    }
    mixAt(out, tone, 0.02, gain);
  }
  const hiss = whiteNoise(samplesFor(length), rng);
  filter(hiss, 'highpass', 3000, 0.7);
  for (let i = 0; i < hiss.length; i++) {
    const t = i / SAMPLE_RATE;
    hiss[i] = (hiss[i] ?? 0) * (0.25 * Math.exp(-t / 0.15) + 0.08 * env(t) + (t > gate ? 0.2 * Math.exp(-(t - gate) / 0.25) : 0));
  }
  mixInto(out, hiss, 0, 1);
  const wet = reverb(echo(normalize(out, 1), 0.33, 0.25, 0.3, 2500), { room: 0.7, damp: 0.4, wet: 0.22, dry: 1 });
  return normalize(fade(wet, 0.005, 0.2), 0.9);
}

/** Ratcheting gears that spin up, grind and lock with a clunk. */
export function engranajes(): Buf {
  const rng = createRng('sfx-engranajes');
  const out = buffer(2.0);
  let t = 0.03;
  const clicks: number[] = [];
  while (t < 1.45) {
    clicks.push(t);
    const x = t / 1.45;
    t += 0.11 - 0.075 * Math.sin(Math.PI * x);
  }
  for (const [i, at] of clicks.entries()) {
    mixAt(out, normalize(noiseHit(rng, 0.03, 'bandpass', rng.range(3000, 4400), 4, 0.006), 1), at, 0.55);
    mixAt(out, normalize(clang(rng, rng.range(2100, 2600), 0.05), 1), at, 0.18);
    if (i % 3 === 0) mixAt(out, normalize(clang(rng, rng.range(700, 900), 0.12), 1), at + 0.01, 0.15);
  }
  const grind = pinkNoise(samplesFor(1.5), rng);
  filter(grind, 'bandpass', 620, 1.6);
  for (let i = 0; i < grind.length; i++) {
    const tt = i / SAMPLE_RATE;
    grind[i] = (grind[i] ?? 0) * Math.sin((Math.PI * i) / grind.length) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 14 * tt));
  }
  mixAt(out, normalize(grind, 1), 0.02, 0.22);
  mixAt(out, normalize(drumHit(rng, { f0: 140, f1: 60, sweep: 0.02, decay: 0.12, noise: 0.4, noiseDecay: 0.03, noiseFreq: 900, length: 0.4 }), 1), 1.5, 0.75);
  mixAt(out, normalize(clang(rng, 420, 0.5), 1), 1.5, 0.4);
  const wet = reverb(out, { room: 0.45, damp: 0.5, wet: 0.16, dry: 1 });
  return normalize(fade(wet, 0.002, 0.1), 0.9);
}

/** Pneumatic steam pistol: hammer click, sharp crack, low thump and a steam hiss tail. */
export function disparoDePistola(): Buf {
  const rng = createRng('sfx-pistola-vapor');
  const out = buffer(1.4);
  mixAt(out, normalize(noiseHit(rng, 0.02, 'bandpass', 3800, 3, 0.004), 1), 0, 0.25);
  const crack = whiteNoise(samplesFor(0.12), rng);
  filter(crack, 'highpass', 900, 0.7);
  expDecay(crack, 0.014, 0.0002);
  mixAt(out, normalize(crack, 1), 0.05, 1);
  mixAt(out, normalize(drumHit(rng, { f0: 170, f1: 48, sweep: 0.025, decay: 0.09, noise: 0.3, noiseDecay: 0.02, noiseFreq: 1200, length: 0.4 }), 1), 0.05, 0.85);
  const hiss = whiteNoise(samplesFor(1.1), rng);
  filter(filter(hiss, 'highpass', 3200, 0.7), 'lowpass', 9500, 0.7);
  for (let i = 0; i < hiss.length; i++) {
    const t = i / SAMPLE_RATE;
    hiss[i] = (hiss[i] ?? 0) * Math.min(1, t / 0.06) * Math.exp(-t / 0.3);
  }
  mixAt(out, normalize(hiss, 1), 0.09, 0.35);
  mixAt(out, normalize(clang(rng, 1850, 0.25), 1), 0.55, 0.08);
  softClip(out, 1.6);
  const wet = reverb(echo(out, 0.19, 0.3, 0.35, 2200), { room: 0.5, damp: 0.5, wet: 0.14, dry: 1 });
  return normalize(fade(wet, 0.001, 0.15), 0.94);
}

/** Propellers spinning up: blade-pass "whup" accelerating over a rising motor hum. */
export function helices(): Buf {
  const rng = createRng('sfx-helices');
  const length = 3.2;
  const n = samplesFor(length);
  const out = new Float32Array(n);
  const air = pinkNoise(n, rng);
  filter(air, 'lowpass', 1100, 0.7);
  const rateAt = (t: number): number => 3 + 19 * Math.min(1, Math.pow(t / 2.2, 1.6));
  let bladePhase = 0;
  let motorPhase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const rate = rateAt(t);
    bladePhase += rate / SAMPLE_RATE;
    motorPhase += (rate * 4) / SAMPLE_RATE;
    const pulse = Math.pow(Math.abs(Math.sin(Math.PI * bladePhase)), 4);
    const motor = 2 * (motorPhase - Math.floor(motorPhase)) - 1;
    out[i] = (air[i] ?? 0) * (0.25 + 0.75 * pulse) * 1.6 + motor * 0.12 * Math.min(1, t / 0.6);
  }
  filter(out, 'lowpass', 2400, 0.7);
  const wet = reverb(out, { room: 0.35, damp: 0.5, wet: 0.1, dry: 1 });
  return normalize(fade(wet, 0.15, 0.45), 0.88);
}
