import type { Prng } from './rng';

/**
 * Tiny offline synthesizer: oscillators, envelopes, noise, biquad filters, Freeverb-style
 * reverb, Karplus-Strong strings, drums, bells, choir pads and brass. Everything works on
 * mono Float32Array buffers at SAMPLE_RATE. Loops are made seamless by mixing events with
 * wrap-around and by running stateful effects "circularly" (see `circular`).
 */

export const SAMPLE_RATE = 22050;
export type Buf = Float32Array;

export function samplesFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * SAMPLE_RATE));
}

export function buffer(seconds: number): Buf {
  return new Float32Array(samplesFor(seconds));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Adds src into dst starting at `offset` samples. With wrap, indices wrap around dst (seamless loops). */
export function mixInto(dst: Buf, src: Buf, offset: number, gain = 1, wrap = false): void {
  const n = dst.length;
  for (let i = 0; i < src.length; i++) {
    let j = offset + i;
    if (wrap) {
      j %= n;
      if (j < 0) j += n;
    } else if (j < 0 || j >= n) {
      continue;
    }
    dst[j] = (dst[j] ?? 0) + (src[i] ?? 0) * gain;
  }
}

export function mixAt(dst: Buf, src: Buf, seconds: number, gain = 1, wrap = false): void {
  mixInto(dst, src, Math.round(seconds * SAMPLE_RATE), gain, wrap);
}

export function scale(buf: Buf, gain: number): Buf {
  for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * gain;
  return buf;
}

export function peak(buf: Buf): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] ?? 0);
    if (v > p) p = v;
  }
  return p;
}

export function normalize(buf: Buf, target = 0.9): Buf {
  const p = peak(buf);
  return p > 0 ? scale(buf, target / p) : buf;
}

export function softClip(buf: Buf, drive = 1.5): Buf {
  const k = Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh((buf[i] ?? 0) * drive) / k;
  return buf;
}

/** Fade in/out (seconds). Never used on loops. */
export function fade(buf: Buf, inSec: number, outSec: number): Buf {
  const a = Math.round(inSec * SAMPLE_RATE);
  const b = Math.round(outSec * SAMPLE_RATE);
  for (let i = 0; i < a && i < buf.length; i++) buf[i] = (buf[i] ?? 0) * (i / a);
  for (let i = 0; i < b && i < buf.length; i++) {
    const j = buf.length - 1 - i;
    buf[j] = (buf[j] ?? 0) * (i / b);
  }
  return buf;
}

/** Runs a stateful process over a loop so that its end flows into its start (processes [x, x], keeps the 2nd half). */
export function circular(loop: Buf, process: (x: Buf) => Buf): Buf {
  const n = loop.length;
  const doubled = new Float32Array(n * 2);
  doubled.set(loop, 0);
  doubled.set(loop, n);
  return process(doubled).slice(n, n * 2);
}

/** Sinusoidal LFO value in [-1, 1]; use whole cycles per loop length to stay seamless. */
export function lfo(t: number, freq: number, phase = 0): number {
  return Math.sin(2 * Math.PI * (freq * t + phase));
}

// ---------------------------------------------------------------------------
// Oscillators and envelopes
// ---------------------------------------------------------------------------

export type Wave = 'sine' | 'saw' | 'square' | 'triangle';

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export function osc(wave: Wave, freq: number | ((t: number) => number), seconds: number, phase0 = 0): Buf {
  const n = samplesFor(seconds);
  const out = new Float32Array(n);
  let phase = phase0 - Math.floor(phase0);
  const fixed = typeof freq === 'number' ? freq : null;
  for (let i = 0; i < n; i++) {
    const f = fixed ?? (freq as (t: number) => number)(i / SAMPLE_RATE);
    const dt = Math.min(0.49, Math.abs(f) / SAMPLE_RATE);
    let v: number;
    switch (wave) {
      case 'sine':
        v = Math.sin(2 * Math.PI * phase);
        break;
      case 'saw':
        v = 2 * phase - 1 - polyBlep(phase, dt);
        break;
      case 'square':
        v = (phase < 0.5 ? 1 : -1) + polyBlep(phase, dt) - polyBlep((phase + 0.5) % 1, dt);
        break;
      default:
        v = 1 - 4 * Math.abs(phase - 0.5);
        break;
    }
    out[i] = v;
    phase += dt;
    if (phase >= 1) phase -= Math.floor(phase);
  }
  return out;
}

export interface Adsr {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** Applies an ADSR envelope; `gate` = seconds the note is held before the release starts. */
export function adsr(buf: Buf, env: Adsr, gate: number): Buf {
  const a = Math.max(1, env.attack * SAMPLE_RATE);
  const d = Math.max(1, env.decay * SAMPLE_RATE);
  const r = Math.max(1, env.release * SAMPLE_RATE);
  const g = gate * SAMPLE_RATE;
  const level = (t: number): number => {
    if (t < a) return t / a;
    if (t < a + d) return 1 - (1 - env.sustain) * ((t - a) / d);
    return env.sustain;
  };
  const atGate = level(g);
  for (let i = 0; i < buf.length; i++) {
    let e: number;
    if (i < g) e = level(i);
    else {
      const x = Math.min(1, (i - g) / r);
      e = atGate * (1 - x) * (1 - x);
    }
    buf[i] = (buf[i] ?? 0) * e;
  }
  return buf;
}

export function expDecay(buf: Buf, tau: number, attack = 0.002): Buf {
  const a = Math.max(1, attack * SAMPLE_RATE);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    buf[i] = (buf[i] ?? 0) * Math.exp(-t / tau) * Math.min(1, i / a);
  }
  return buf;
}

/** Smooth swell envelope (raised cosine attack and release). */
export function swell(buf: Buf, attack: number, release: number): Buf {
  const a = Math.max(1, attack * SAMPLE_RATE);
  const r = Math.max(1, release * SAMPLE_RATE);
  const n = buf.length;
  for (let i = 0; i < n; i++) {
    let e = 1;
    if (i < a) e = 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
    const fromEnd = n - 1 - i;
    if (fromEnd < r) e *= 0.5 - 0.5 * Math.cos((Math.PI * fromEnd) / r);
    buf[i] = (buf[i] ?? 0) * e;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

export function whiteNoise(n: number, rng: Prng): Buf {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

export function brownNoise(n: number, rng: Prng): Buf {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

export function pinkNoise(n: number, rng: Prng): Buf {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking';

export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: FilterType, freq: number, q = 0.707, gainDb = 0) {
    this.set(type, freq, q, gainDb);
  }

  set(type: FilterType, freq: number, q = 0.707, gainDb = 0): void {
    const f = Math.max(10, Math.min(SAMPLE_RATE * 0.45, freq));
    const w0 = (2 * Math.PI * f) / SAMPLE_RATE;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
    let b0: number;
    let b1: number;
    let b2: number;
    let a0: number;
    let a1: number;
    let a2: number;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = (1 - cos) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = (1 + cos) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      default: {
        const A = Math.pow(10, gainDb / 40);
        b0 = 1 + alpha * A;
        b1 = -2 * cos;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cos;
        a2 = 1 - alpha / A;
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Static filter (in place). */
export function filter(buf: Buf, type: FilterType, freq: number, q = 0.707, gainDb = 0): Buf {
  const f = new Biquad(type, freq, q, gainDb);
  for (let i = 0; i < buf.length; i++) buf[i] = f.process(buf[i] ?? 0);
  return buf;
}

/** Time-varying filter: cutoff recomputed every `block` samples (in place). */
export function sweep(buf: Buf, type: FilterType, freqAt: (t: number) => number, q = 0.707, block = 32): Buf {
  const f = new Biquad(type, freqAt(0), q);
  for (let i = 0; i < buf.length; i++) {
    if (i % block === 0) f.set(type, freqAt(i / SAMPLE_RATE), q);
    buf[i] = f.process(buf[i] ?? 0);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface ReverbOptions {
  /** 0..1 room size (decay). */
  room: number;
  /** 0..1 high-frequency damping. */
  damp: number;
  wet: number;
  dry: number;
}

/** Freeverb-style reverb (8 parallel combs + 4 series allpasses), mono. */
export function reverb(input: Buf, o: ReverbOptions): Buf {
  const k = SAMPLE_RATE / 44100;
  const combLengths = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((v) => Math.round(v * k));
  const apLengths = [556, 441, 341, 225].map((v) => Math.round(v * k));
  const feedback = 0.7 + 0.28 * o.room;
  const damp1 = o.damp * 0.4;
  const damp2 = 1 - damp1;
  const combs = combLengths.map((len) => ({ buf: new Float32Array(len), idx: 0, store: 0 }));
  const aps = apLengths.map((len) => ({ buf: new Float32Array(len), idx: 0 }));
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i] ?? 0;
    const inp = x * 0.015;
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.idx] ?? 0;
      c.store = y * damp2 + c.store * damp1;
      c.buf[c.idx] = inp + c.store * feedback;
      c.idx = c.idx + 1 === c.buf.length ? 0 : c.idx + 1;
      acc += y;
    }
    for (const a of aps) {
      const bo = a.buf[a.idx] ?? 0;
      a.buf[a.idx] = acc + bo * 0.5;
      acc = bo - acc;
      a.idx = a.idx + 1 === a.buf.length ? 0 : a.idx + 1;
    }
    out[i] = x * o.dry + acc * o.wet * 3;
  }
  return out;
}

/** Feedback echo with a darkening lowpass in the loop. */
export function echo(input: Buf, seconds: number, feedback: number, wet: number, lowpassHz = 3000): Buf {
  const d = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const line = new Float32Array(d);
  const lp = new Biquad('lowpass', lowpassHz);
  const out = new Float32Array(input.length);
  let idx = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i] ?? 0;
    const delayed = line[idx] ?? 0;
    line[idx] = x + lp.process(delayed) * feedback;
    idx = idx + 1 === d ? 0 : idx + 1;
    out[i] = x + delayed * wet;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** Karplus-Strong plucked string with fractional delay (lute / harp). */
export function pluck(freq: number, seconds: number, rng: Prng, o: { decay?: number; brightness?: number } = {}): Buf {
  const decay = o.decay ?? 0.996;
  const brightness = o.brightness ?? 0.6;
  const n = samplesFor(seconds);
  const out = new Float32Array(n);
  const D = SAMPLE_RATE / freq - 0.5;
  const init = Math.min(n, Math.ceil(D) + 2);
  let lp = 0;
  for (let i = 0; i < init; i++) {
    lp += brightness * (rng.next() * 2 - 1 - lp);
    out[i] = lp;
  }
  for (let i = init; i < n; i++) {
    const t = i - D;
    const i0 = Math.floor(t);
    const fr = t - i0;
    const a = (out[i0] ?? 0) * (1 - fr) + (out[i0 + 1] ?? 0) * fr;
    const b = (out[i0 - 1] ?? 0) * (1 - fr) + (out[i0] ?? 0) * fr;
    out[i] = decay * 0.5 * (a + b);
  }
  filter(out, 'highpass', 40);
  return expDecay(out, seconds * 0.6, 0.001);
}

export interface DrumOptions {
  /** Start and end pitch of the body (Hz) and glide time constant (s). */
  f0: number;
  f1: number;
  sweep: number;
  decay: number;
  /** Noise (skin slap) amount, decay and center frequency. */
  noise: number;
  noiseDecay: number;
  noiseFreq: number;
  length: number;
}

export function drumHit(rng: Prng, o: DrumOptions): Buf {
  const n = samplesFor(o.length);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = o.f1 + (o.f0 - o.f1) * Math.exp(-t / o.sweep);
    phase += f / SAMPLE_RATE;
    out[i] = Math.sin(2 * Math.PI * phase) * Math.exp(-t / o.decay);
  }
  if (o.noise > 0) {
    const nz = whiteNoise(n, rng);
    filter(nz, 'bandpass', o.noiseFreq, 0.9);
    expDecay(nz, o.noiseDecay, 0.0005);
    for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (nz[i] ?? 0) * o.noise * 2.5;
  }
  return expDecay(out, o.length, 0.0008);
}

/** Timpani: tuned membrane with inharmonic modes and a soft mallet. */
export function timpani(freq: number, rng: Prng, length = 2.2, gain = 1): Buf {
  const n = samplesFor(length);
  const out = new Float32Array(n);
  const modes: [number, number, number][] = [
    [1, 1, 1],
    [1.504, 0.5, 0.7],
    [1.742, 0.25, 0.5],
    [2.0, 0.3, 0.45],
    [2.245, 0.12, 0.35],
  ];
  for (const [ratio, amp, dk] of modes) {
    const f = freq * ratio;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const bend = 1 + 0.03 * Math.exp(-t / 0.05);
      out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * f * bend * t) * amp * Math.exp(-t / (0.9 * dk));
    }
  }
  const nz = whiteNoise(samplesFor(0.06), rng);
  filter(nz, 'lowpass', 900);
  expDecay(nz, 0.015, 0.0005);
  mixInto(out, nz, 0, 0.8);
  return scale(expDecay(out, length, 0.002), gain);
}

/** Church bell / glass bell with inharmonic partials. */
export function bell(freq: number, seconds: number, decay = 2.5): Buf {
  const n = samplesFor(seconds);
  const out = new Float32Array(n);
  const partials: [number, number, number][] = [
    [0.5, 0.35, 1.3],
    [1, 1, 1],
    [1.19, 0.45, 0.8],
    [1.5, 0.35, 0.7],
    [2, 0.4, 0.6],
    [2.52, 0.25, 0.45],
    [3.01, 0.18, 0.35],
    [4.07, 0.1, 0.25],
  ];
  for (const [ratio, amp, dk] of partials) {
    const f = freq * ratio;
    if (f > SAMPLE_RATE * 0.45) continue;
    const beat = 0.7 + ratio * 0.3;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * f * t) * (1 + 0.15 * Math.sin(2 * Math.PI * beat * t)) * amp * Math.exp(-t / (decay * dk));
    }
  }
  return expDecay(out, seconds * 4, 0.002);
}

const FORMANTS: Record<'a' | 'o' | 'u' | 'e', [number, number][]> = {
  a: [
    [800, 1],
    [1150, 0.5],
    [2900, 0.22],
  ],
  o: [
    [450, 1],
    [800, 0.6],
    [2830, 0.15],
  ],
  u: [
    [325, 1],
    [700, 0.4],
    [2530, 0.1],
  ],
  e: [
    [400, 1],
    [1600, 0.5],
    [2700, 0.25],
  ],
};

/** Choir-like pad: detuned saws with vibrato through vowel formant filters. */
export function choir(freqs: number[], seconds: number, rng: Prng, o: { attack: number; release: number; vowel?: 'a' | 'o' | 'u' | 'e'; detuneCents?: number }): Buf {
  const n = samplesFor(seconds);
  const src = new Float32Array(n);
  const detune = o.detuneCents ?? 9;
  for (const f of freqs) {
    for (let v = -1; v <= 1; v++) {
      const ratio = Math.pow(2, (v * detune) / 1200);
      const vibRate = rng.range(4.6, 5.6);
      const vibPhase = rng.next();
      let phase = rng.next();
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const fv = f * ratio * (1 + 0.004 * Math.sin(2 * Math.PI * (vibRate * t + vibPhase)));
        const dt = fv / SAMPLE_RATE;
        src[i] = (src[i] ?? 0) + (2 * phase - 1 - polyBlep(phase, dt));
        phase += dt;
        if (phase >= 1) phase -= 1;
      }
    }
  }
  const out = new Float32Array(n);
  const body = new Biquad('lowpass', 1400, 0.6);
  const bands = FORMANTS[o.vowel ?? 'a'].map(([f, gain]) => ({ f: new Biquad('bandpass', f, f / 110), gain }));
  for (let i = 0; i < n; i++) {
    const x = (src[i] ?? 0) / (freqs.length * 3);
    let y = body.process(x) * 0.25;
    for (const b of bands) y += b.f.process(x) * b.gain * 1.6;
    out[i] = y;
  }
  return swell(out, o.attack, o.release);
}

/** Brass-like voice: saws through a lowpass whose cutoff follows the envelope. */
export function brass(freq: number, gate: number, o: { attack?: number; release?: number; cutoff?: number; bright?: number; vibrato?: number } = {}): Buf {
  const attack = o.attack ?? 0.05;
  const release = o.release ?? 0.15;
  const cutoff = o.cutoff ?? 500;
  const bright = o.bright ?? 1600;
  const vib = o.vibrato ?? 0.004;
  const seconds = gate + release;
  const n = samplesFor(seconds);
  const out = new Float32Array(n);
  let p1 = 0;
  let p2 = 0.37;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = freq * (1 + vib * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.3));
    const d1 = f / SAMPLE_RATE;
    const d2 = (f * 1.006) / SAMPLE_RATE;
    out[i] = (2 * p1 - 1 - polyBlep(p1, d1)) + (2 * p2 - 1 - polyBlep(p2, d2));
    p1 += d1;
    p2 += d2;
    if (p1 >= 1) p1 -= 1;
    if (p2 >= 1) p2 -= 1;
  }
  const envAt = (t: number): number => {
    if (t < attack) return t / attack;
    if (t < gate) return 1 - 0.25 * Math.min(1, (t - attack) / 0.3);
    return 0.75 * Math.max(0, 1 - (t - gate) / release);
  };
  sweep(out, 'lowpass', (t) => cutoff + bright * envAt(t), 1.1);
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * envAt(i / SAMPLE_RATE) * 0.5;
  return out;
}

/** Soft flute / recorder: sine + 2nd harmonic + breath noise with vibrato. */
export function flute(freq: number, gate: number, rng: Prng): Buf {
  const release = 0.12;
  const n = samplesFor(gate + release);
  const out = new Float32Array(n);
  let phase = 0;
  const breath = whiteNoise(n, rng);
  filter(breath, 'bandpass', freq * 2, 2);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = freq * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.25));
    phase += f / SAMPLE_RATE;
    const env = t < 0.06 ? t / 0.06 : t < gate ? 1 : Math.max(0, 1 - (t - gate) / release);
    out[i] = (Math.sin(2 * Math.PI * phase) + 0.18 * Math.sin(4 * Math.PI * phase) + (breath[i] ?? 0) * 0.25) * env;
  }
  return out;
}

/** Crash cymbal: bright filtered noise with a metallic shimmer. */
export function cymbal(rng: Prng, length = 2.5): Buf {
  const n = samplesFor(length);
  const nz = whiteNoise(n, rng);
  filter(nz, 'highpass', 3500, 0.7);
  const shimmer = new Float32Array(n);
  for (const f of [3120, 4370, 5230, 6810, 7940]) {
    for (let i = 0; i < n; i++) shimmer[i] = (shimmer[i] ?? 0) + Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE) * 0.08;
  }
  for (let i = 0; i < n; i++) nz[i] = (nz[i] ?? 0) + (shimmer[i] ?? 0) * (nz[i] ?? 0) * 2;
  return expDecay(nz, length * 0.35, 0.001);
}

/** Short noise burst (shaker, hi-hat, crackle). */
export function noiseHit(rng: Prng, length: number, type: FilterType, freq: number, q: number, decay: number): Buf {
  const nz = whiteNoise(samplesFor(length), rng);
  filter(nz, type, freq, q);
  return expDecay(nz, decay, 0.0005);
}
