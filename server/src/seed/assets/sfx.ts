import { createRng, type Prng } from './rng';
import {
  SAMPLE_RATE,
  bell,
  brownNoise,
  buffer,
  choir,
  drumHit,
  expDecay,
  fade,
  filter,
  midiToFreq,
  mixAt,
  mixInto,
  noiseHit,
  normalize,
  osc,
  peak,
  pinkNoise,
  reverb,
  samplesFor,
  scale,
  softClip,
  sweep,
  whiteNoise,
  type Buf,
} from './synth';

/** One-shot sound effects (0.3 – 3 s). */

function metalClang(rng: Prng, base: number, length: number): Buf {
  const out = buffer(length);
  const partials: [number, number, number][] = [
    [1, 1, 0.9],
    [1.47, 0.7, 0.7],
    [2.09, 0.55, 0.5],
    [2.56, 0.4, 0.45],
    [3.37, 0.3, 0.3],
    [4.12, 0.2, 0.2],
  ];
  for (const [ratio, amp, dk] of partials) {
    const f = base * ratio;
    if (f > SAMPLE_RATE * 0.45) continue;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = (out[i] ?? 0) + (Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.003 * t)) * amp * Math.exp(-t / (length * dk * 0.6));
    }
  }
  expDecay(out, length, 0.0004);
  mixInto(out, noiseHit(rng, 0.03, 'highpass', 2500, 0.7, 0.006), 0, 1.6);
  return out;
}

export function choqueDeEspadas(): Buf {
  const rng = createRng('sfx-espadas');
  const out = buffer(1.4);
  mixAt(out, normalize(metalClang(rng, 1250, 1.1), 1), 0.0, 0.85);
  mixAt(out, normalize(metalClang(rng, 1490, 1.0), 1), 0.32, 0.65);
  const scrape = whiteNoise(samplesFor(0.28), rng);
  sweep(scrape, 'bandpass', (t) => 3200 - t * 5000, 3);
  for (let i = 0; i < scrape.length; i++) scrape[i] = (scrape[i] ?? 0) * Math.sin((Math.PI * i) / scrape.length);
  mixAt(out, normalize(scrape, 1), 0.06, 0.3);
  const wet = reverb(out, { room: 0.4, damp: 0.5, wet: 0.16, dry: 1 });
  return normalize(fade(wet, 0, 0.12), 0.92);
}

export function bolaDeFuego(): Buf {
  const rng = createRng('sfx-bola-fuego');
  const out = buffer(2.6);
  const whooshLen = 0.75;
  const whoosh = pinkNoise(samplesFor(whooshLen), rng);
  sweep(whoosh, 'bandpass', (t) => 300 * Math.pow(9, t / whooshLen), 1.2);
  for (let i = 0; i < whoosh.length; i++) {
    const x = i / whoosh.length;
    whoosh[i] = (whoosh[i] ?? 0) * x * x * (x > 0.94 ? (1 - x) / 0.06 : 1);
  }
  mixAt(out, normalize(whoosh, 1), 0, 0.55);
  const boom = drumHit(rng, { f0: 95, f1: 32, sweep: 0.25, decay: 0.8, noise: 0, noiseDecay: 0.01, noiseFreq: 100, length: 1.9 });
  mixAt(out, normalize(boom, 1), 0.7, 0.55);
  const blast = whiteNoise(samplesFor(1.9), rng);
  sweep(blast, 'lowpass', (t) => 150 + 4200 * Math.exp(-t / 0.35), 0.8);
  expDecay(blast, 0.55, 0.003);
  mixAt(out, normalize(blast, 1), 0.7, 0.9);
  for (let k = 0; k < 60; k++) {
    const t = 0.8 + rng.range(0, 1.6);
    mixAt(out, normalize(noiseHit(rng, 0.02, 'highpass', 2500, 0.7, 0.003), 1), t, 0.3 * Math.exp(-(t - 0.8) / 0.7));
  }
  softClip(out, 1.8);
  const wet = reverb(out, { room: 0.6, damp: 0.4, wet: 0.24, dry: 1 });
  return normalize(fade(wet, 0.005, 0.25), 0.92);
}

export function puertaQueCruje(): Buf {
  const rng = createRng('sfx-puerta');
  const out = buffer(2.6);
  const creakLen = 1.95;
  const impulses = buffer(creakLen);
  let t = 0.02;
  while (t < creakLen - 0.02) {
    const x = t / creakLen;
    const rate = 38 + 40 * Math.sin(Math.PI * x) + 12 * Math.sin(2 * Math.PI * 3 * x);
    const idx = Math.round(t * SAMPLE_RATE);
    impulses[idx] = (impulses[idx] ?? 0) + rng.range(0.5, 1) * (0.4 + 0.6 * Math.sin(Math.PI * x));
    t += (1 / rate) * rng.range(0.85, 1.15);
  }
  const creak = new Float32Array(impulses.length);
  for (const [f, q, gain] of [
    [520, 8, 1],
    [1100, 10, 0.7],
    [1850, 12, 0.45],
    [2700, 14, 0.25],
  ] as [number, number, number][]) {
    const band = filter(impulses.slice(), 'bandpass', f, q);
    mixInto(creak, band, 0, gain);
  }
  mixAt(out, normalize(creak, 1), 0.05, 0.85);
  mixAt(out, normalize(drumHit(rng, { f0: 115, f1: 58, sweep: 0.03, decay: 0.15, noise: 0.45, noiseDecay: 0.03, noiseFreq: 450, length: 0.45 }), 1), 2.1, 0.7);
  mixAt(out, normalize(noiseHit(rng, 0.03, 'highpass', 3000, 0.7, 0.006), 1), 2.18, 0.25);
  const wet = reverb(out, { room: 0.5, damp: 0.5, wet: 0.2, dry: 1 });
  return normalize(fade(wet, 0.01, 0.15), 0.9);
}

export function rugidoDeDragon(): Buf {
  const rng = createRng('sfx-rugido');
  const len = 3.0;
  const n = samplesFor(len);
  const contour = (t: number): number => {
    if (t < 0.4) return 70 + 45 * (0.5 - 0.5 * Math.cos((Math.PI * t) / 0.4));
    if (t < 1.8) return 115 - 20 * ((t - 0.4) / 1.4);
    return 95 - 40 * Math.min(1, (t - 1.8) / 1.0);
  };
  const voice = osc('saw', contour, len);
  const sub = osc('saw', (t) => contour(t) * 0.5, len);
  const buzz = osc('square', (t) => contour(t) * 1.01, len);
  const growl = whiteNoise(n, rng);
  filter(growl, 'bandpass', 420, 0.8);
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const rough = 1 - 0.45 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 31 * t));
    src[i] = ((voice[i] ?? 0) + 0.5 * (sub[i] ?? 0) + 0.3 * (buzz[i] ?? 0)) * rough + (growl[i] ?? 0) * 1.2 * rough;
  }
  const f1 = sweep(src.slice(), 'bandpass', (t) => 720 - 260 * Math.min(1, t / len), 4);
  const f2 = sweep(src.slice(), 'bandpass', (t) => 1150 - 350 * Math.min(1, t / len), 5);
  const body = filter(src.slice(), 'lowpass', 900, 0.7);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = t < 0.25 ? t / 0.25 : t < 2.3 ? 1 - 0.15 * ((t - 0.25) / 2.05) : 0.85 * Math.max(0, 1 - (t - 2.3) / 0.7);
    out[i] = ((f1[i] ?? 0) * 1.2 + (f2[i] ?? 0) * 0.7 + (body[i] ?? 0) * 0.5) * env;
  }
  softClip(normalize(out, 1), 3);
  const wet = reverb(out, { room: 0.75, damp: 0.4, wet: 0.32, dry: 1 });
  return normalize(fade(wet, 0.01, 0.2), 0.95);
}

export function trueno(): Buf {
  const rng = createRng('sfx-trueno');
  const len = 3.0;
  const out = buffer(len);
  const crack = whiteNoise(samplesFor(0.25), rng);
  filter(crack, 'highpass', 1200, 0.7);
  expDecay(crack, 0.06, 0.0005);
  mixAt(out, normalize(crack, 1), 0, 0.75);
  for (const t of [0.03, 0.07, 0.12]) mixAt(out, normalize(noiseHit(rng, 0.1, 'highpass', 900, 0.7, 0.025), 1), t, 0.35);
  const n = out.length;
  const bumps: [number, number, number][] = [
    [0.15, 0.35, 1],
    [0.6, 0.5, 0.8],
    [1.2, 0.6, 0.65],
    [1.75, 0.7, 0.45],
  ];
  const env = (t: number): number => bumps.reduce((s, [c, w, gn]) => s + gn * Math.exp(-(((t - c) / w) ** 2)), 0);
  const rumble = normalize(filter(filter(brownNoise(n, rng), 'lowpass', 180, 0.7), 'lowpass', 220, 0.7), 1);
  const mid = normalize(filter(pinkNoise(n, rng), 'lowpass', 600, 0.7), 1);
  for (let i = 0; i < n; i++) {
    const e = env(i / SAMPLE_RATE);
    out[i] = (out[i] ?? 0) + (rumble[i] ?? 0) * e * 0.9 + (mid[i] ?? 0) * e * 0.3;
  }
  const wet = reverb(out, { room: 0.8, damp: 0.4, wet: 0.3, dry: 1 });
  return normalize(fade(wet, 0.002, 0.35), 0.95);
}

export function curacion(): Buf {
  const rng = createRng('sfx-curacion');
  const out = buffer(2.2);
  [84, 88, 91, 96].forEach((m, i) => mixAt(out, bell(midiToFreq(m), 1.6, 0.6), i * 0.12, 0.3));
  mixAt(out, choir([72, 76, 79].map(midiToFreq), 2.0, rng, { attack: 0.35, release: 1.0, vowel: 'a' }), 0.05, 0.6);
  for (const m of [100, 103]) {
    const shimmer = osc('sine', midiToFreq(m), 1.6);
    for (let i = 0; i < shimmer.length; i++) {
      const t = i / SAMPLE_RATE;
      shimmer[i] = (shimmer[i] ?? 0) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 9 * t)) * Math.sin((Math.PI * i) / shimmer.length);
    }
    mixAt(out, shimmer, 0.3, 0.06);
  }
  for (let k = 0; k < 30; k++) {
    const blip = osc('sine', rng.range(3000, 7000), 0.06);
    expDecay(blip, 0.02, 0.002);
    mixAt(out, blip, rng.range(0.2, 1.8), 0.08);
  }
  const wet = reverb(out, { room: 0.8, damp: 0.35, wet: 0.4, dry: 0.9 });
  return normalize(fade(wet, 0.005, 0.2), 0.85);
}

export function monedas(): Buf {
  const rng = createRng('sfx-monedas');
  const out = buffer(1.2);
  mixAt(out, drumHit(rng, { f0: 130, f1: 80, sweep: 0.02, decay: 0.07, noise: 0.3, noiseDecay: 0.02, noiseFreq: 600, length: 0.25 }), 0, 0.35);
  const times = Array.from({ length: 13 }, () => rng.range(0, 0.7)).sort((a, b) => a - b);
  for (const t of times) {
    const base = rng.range(2200, 4100);
    const len = rng.range(0.12, 0.3);
    const clink = buffer(len);
    for (const [ratio, amp, dk] of [
      [1, 1, 1],
      [1.58, 0.6, 0.7],
      [2.31, 0.35, 0.5],
    ] as [number, number, number][]) {
      const f = base * ratio;
      if (f > SAMPLE_RATE * 0.45) continue;
      for (let i = 0; i < clink.length; i++) {
        const tt = i / SAMPLE_RATE;
        clink[i] = (clink[i] ?? 0) + Math.sin(2 * Math.PI * f * tt) * amp * Math.exp(-tt / (len * 0.3 * dk));
      }
    }
    mixInto(clink, noiseHit(rng, 0.01, 'highpass', 4000, 0.7, 0.002), 0, 0.6);
    mixAt(out, clink, t, rng.range(0.25, 0.5));
  }
  const wet = reverb(out, { room: 0.3, damp: 0.5, wet: 0.12, dry: 1 });
  return normalize(fade(wet, 0.002, 0.1), 0.9);
}

export function golpe(): Buf {
  const rng = createRng('sfx-golpe');
  const out = buffer(0.5);
  mixAt(out, drumHit(rng, { f0: 165, f1: 45, sweep: 0.03, decay: 0.12, noise: 0.5, noiseDecay: 0.015, noiseFreq: 700, length: 0.45 }), 0, 1);
  mixAt(out, normalize(noiseHit(rng, 0.05, 'bandpass', 1500, 1, 0.012), 1), 0, 0.6);
  softClip(normalize(out, 1), 2.5);
  return normalize(fade(out, 0, 0.05), 0.95);
}

export function pasoDePagina(): Buf {
  const rng = createRng('sfx-pagina');
  const out = buffer(0.7);
  const len = 0.55;
  const rustle = whiteNoise(samplesFor(len), rng);
  filter(rustle, 'bandpass', 4200, 0.8);
  const flutter = filter(whiteNoise(rustle.length, rng), 'lowpass', 40, 0.7);
  const fPeak = Math.max(1e-6, peak(flutter));
  for (let i = 0; i < rustle.length; i++) {
    const x = i / rustle.length;
    const shape = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.5;
    rustle[i] = (rustle[i] ?? 0) * shape * (0.35 + 0.65 * Math.abs(flutter[i] ?? 0) / fPeak);
  }
  mixAt(out, rustle, 0.01, 0.8);
  const flap = pinkNoise(samplesFor(0.12), rng);
  filter(flap, 'lowpass', 1200, 0.7);
  expDecay(flap, 0.03, 0.002);
  mixAt(out, flap, 0.5, 0.6);
  return normalize(fade(scale(out, 1), 0.01, 0.05), 0.8);
}
