import { useSettingsStore } from '../../stores/settings';
import { hasUserActivation } from './activation';

/**
 * Synthesized interface sounds (Web Audio, no files). Volume = settings master × ui; silent when muted
 * or before the first user gesture (sounds are never queued to burst out later).
 */
export interface UiSounds {
  diceShake(): void;
  diceLand(): void;
  tick(): void;
  critSuccess(): void;
  critFail(): void;
  ping(): void;
  notify(): void;
  whoosh(): void;
  turnStart(): void;
  reveal(): void;
}

const EPS = 0.0001;
const MIN_TICK_GAP_MS = 28;

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastTickAt = 0;

interface Voice {
  ctx: AudioContext;
  out: GainNode;
  /** Start time (AudioContext clock). */
  t: number;
}

interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  q?: number;
  /** Exponential ramps: [seconds after the note start, frequency]. */
  to?: [number, number][];
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Exponential glide to this frequency over `glide` seconds. */
  freqEnd?: number;
  glide?: number;
  at: number;
  attack?: number;
  hold?: number;
  release: number;
  peak: number;
  filter?: FilterOpts;
  pan?: number;
  vibrato?: { rate: number; depth: number; delay?: number };
}

interface NoiseOpts {
  at: number;
  attack?: number;
  hold?: number;
  release: number;
  peak: number;
  filter: FilterOpts;
  pan?: number;
  panEnd?: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function uiVolume(): number {
  const s = useSettingsStore.getState();
  if (s.muted) return 0;
  return s.volumes.master * s.volumes.ui;
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx && ctx.state === 'closed') {
    ctx = null;
    bus = null;
    noiseBuffer = null;
  }
  if (!ctx) {
    // Creating a context before any gesture only produces a suspended context and a console warning.
    if (!hasUserActivation()) return null;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(compressor);
    compressor.connect(ctx.destination);
  }
  if (ctx.state !== 'running') {
    if (!hasUserActivation()) return null;
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 1.5);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

function envelope(c: AudioContext, t0: number, attack: number, hold: number, release: number, peak: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(EPS, t0);
  g.gain.linearRampToValueAtTime(Math.max(EPS, peak), t0 + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(EPS, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(EPS, t0 + attack + hold + release);
  return g;
}

function makeFilter(c: AudioContext, opts: FilterOpts, t0: number): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = opts.type;
  f.frequency.setValueAtTime(opts.freq, t0);
  for (const [dt, value] of opts.to ?? []) f.frequency.exponentialRampToValueAtTime(Math.max(20, value), t0 + dt);
  f.Q.value = opts.q ?? 0.7;
  return f;
}

function connectOut(c: AudioContext, node: AudioNode, out: AudioNode, t0: number, pan?: number, panEnd?: number, end?: number): void {
  if (pan === undefined || typeof c.createStereoPanner !== 'function') {
    node.connect(out);
    return;
  }
  const p = c.createStereoPanner();
  p.pan.setValueAtTime(pan, t0);
  if (panEnd !== undefined && end !== undefined) p.pan.linearRampToValueAtTime(panEnd, end);
  node.connect(p);
  p.connect(out);
}

function tone(v: Voice, o: ToneOpts): void {
  const c = v.ctx;
  const t0 = v.t + o.at;
  const attack = o.attack ?? 0.005;
  const hold = o.hold ?? 0;
  const end = t0 + attack + hold + o.release;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + (o.glide ?? attack + hold + o.release));
  }
  const env = envelope(c, t0, attack, hold, o.release, o.peak);
  let head: AudioNode = osc;
  if (o.filter) {
    const f = makeFilter(c, o.filter, t0);
    head.connect(f);
    head = f;
  }
  head.connect(env);
  connectOut(c, env, v.out, t0, o.pan);
  if (o.vibrato) {
    const lfo = c.createOscillator();
    lfo.frequency.value = o.vibrato.rate;
    const depth = c.createGain();
    const vibStart = t0 + (o.vibrato.delay ?? 0);
    depth.gain.setValueAtTime(0, t0);
    depth.gain.setValueAtTime(0, vibStart);
    depth.gain.linearRampToValueAtTime(o.vibrato.depth, vibStart + 0.08);
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(t0);
    lfo.stop(end + 0.05);
  }
  osc.start(t0);
  osc.stop(end + 0.05);
}

function noise(v: Voice, o: NoiseOpts): void {
  const c = v.ctx;
  const t0 = v.t + o.at;
  const attack = o.attack ?? 0.002;
  const hold = o.hold ?? 0;
  const length = attack + hold + o.release;
  const end = t0 + length;
  const src = c.createBufferSource();
  const buffer = getNoise(c);
  src.buffer = buffer;
  const f = makeFilter(c, o.filter, t0);
  const env = envelope(c, t0, attack, hold, o.release, o.peak);
  src.connect(f);
  f.connect(env);
  connectOut(c, env, v.out, t0, o.pan, o.panEnd, end);
  const offset = Math.max(0, Math.random() * (buffer.duration - length - 0.1));
  src.start(t0, offset);
  src.stop(end + 0.05);
}

/** Builds one sound on a private gain node that is released after `maxDuration` seconds. */
function play(maxDuration: number, build: (v: Voice) => void): void {
  const volume = uiVolume();
  if (volume <= 0.001) return;
  const c = getContext();
  if (!c || !bus) return;
  const out = c.createGain();
  out.gain.value = Math.pow(volume, 1.3);
  out.connect(bus);
  try {
    build({ ctx: c, out, t: c.currentTime + 0.01 });
  } catch (err) {
    console.warn('[uiSounds] no se pudo sintetizar el sonido', err);
  }
  window.setTimeout(() => out.disconnect(), (maxDuration + 0.4) * 1000);
}

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

function diceShake(): void {
  play(0.9, (v) => {
    const hits = 12;
    for (let i = 0; i < hits; i++) {
      const at = i * 0.058 + rnd(0, 0.022);
      const swell = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / hits);
      noise(v, {
        at,
        attack: 0.001,
        release: rnd(0.025, 0.05),
        peak: rnd(0.28, 0.45) * swell,
        filter: { type: 'bandpass', freq: rnd(1700, 4200), q: rnd(2.5, 6) },
        pan: rnd(-0.35, 0.35),
      });
      if (Math.random() < 0.45) {
        tone(v, { type: 'triangle', freq: rnd(650, 1150), at: at + 0.002, attack: 0.001, release: rnd(0.03, 0.06), peak: 0.1 * swell });
      }
    }
    // Low rumble of the dice cup.
    noise(v, { at: 0, attack: 0.08, hold: 0.45, release: 0.2, peak: 0.08, filter: { type: 'lowpass', freq: 420, q: 0.8 } });
  });
}

function diceLand(): void {
  play(0.6, (v) => {
    tone(v, { type: 'sine', freq: 150, freqEnd: 48, glide: 0.2, at: 0, attack: 0.003, release: 0.28, peak: 0.7 });
    noise(v, { at: 0, attack: 0.001, release: 0.03, peak: 0.45, filter: { type: 'highpass', freq: 2200 } });
    noise(v, { at: 0, attack: 0.002, release: 0.09, peak: 0.25, filter: { type: 'bandpass', freq: 700, q: 1.2 } });
    const bounces: [number, number][] = [
      [0.11, 0.3],
      [0.19, 0.16],
      [0.245, 0.07],
    ];
    for (const [at, peak] of bounces) {
      noise(v, { at, attack: 0.001, release: 0.025, peak, filter: { type: 'bandpass', freq: rnd(2600, 3600), q: 2 } });
      tone(v, { type: 'triangle', freq: rnd(800, 1000), at, attack: 0.001, release: 0.035, peak: peak * 0.35 });
    }
  });
}

function tick(): void {
  const now = performance.now();
  if (now - lastTickAt < MIN_TICK_GAP_MS) return;
  lastTickAt = now;
  play(0.12, (v) => {
    const k = rnd(0.96, 1.04);
    tone(v, { type: 'sine', freq: 1750 * k, freqEnd: 1500 * k, glide: 0.04, at: 0, attack: 0.001, release: 0.045, peak: 0.32 });
    tone(v, { type: 'sine', freq: 2960 * k, at: 0, attack: 0.001, release: 0.025, peak: 0.1 });
    noise(v, { at: 0, attack: 0.0005, release: 0.012, peak: 0.18, filter: { type: 'bandpass', freq: 4500, q: 1.5 } });
  });
}

function critSuccess(): void {
  play(1.5, (v) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const at = i * 0.075;
      const last = i === notes.length - 1;
      tone(v, {
        type: 'sawtooth',
        freq: f,
        at,
        attack: 0.012,
        hold: last ? 0.25 : 0.04,
        release: last ? 0.75 : 0.28,
        peak: 0.13,
        filter: { type: 'lowpass', freq: 3200, q: 1, to: [[last ? 1.0 : 0.3, 1300]] },
        vibrato: last ? { rate: 5.5, depth: 9, delay: 0.15 } : undefined,
      });
      tone(v, { type: 'triangle', freq: f * 2, at, attack: 0.008, release: last ? 0.6 : 0.2, peak: 0.06 });
    });
    for (const f of [523.25, 659.25, 783.99]) {
      tone(v, { type: 'triangle', freq: f, at: 0.3, attack: 0.04, hold: 0.2, release: 0.85, peak: 0.07 });
    }
    for (let i = 0; i < 12; i++) {
      tone(v, {
        type: 'sine',
        freq: rnd(2200, 5200),
        at: 0.28 + i * 0.065 + rnd(0, 0.03),
        attack: 0.004,
        release: rnd(0.12, 0.25),
        peak: rnd(0.03, 0.06),
        pan: rnd(-0.7, 0.7),
      });
    }
    noise(v, { at: 0.25, attack: 0.25, release: 0.75, peak: 0.045, filter: { type: 'highpass', freq: 6500 } });
  });
}

function critFail(): void {
  play(1.45, (v) => {
    const steps: [number, number][] = [
      [233.08, 246.94],
      [196.0, 207.65],
      [146.83, 155.56],
    ];
    steps.forEach(([a, b], i) => {
      const at = i * 0.2;
      const last = i === steps.length - 1;
      for (const f of [a, b]) {
        tone(v, {
          type: 'sawtooth',
          freq: f,
          freqEnd: last ? f * 0.86 : undefined,
          glide: 0.6,
          at,
          attack: 0.025,
          hold: last ? 0.2 : 0.06,
          release: last ? 0.55 : 0.18,
          peak: 0.1,
          filter: { type: 'lowpass', freq: 1500, q: 1.4, to: [[last ? 0.75 : 0.25, 600]] },
          vibrato: last ? { rate: 6.5, depth: 14, delay: 0.1 } : undefined,
        });
      }
      tone(v, { type: 'square', freq: a / 2, at, attack: 0.02, release: last ? 0.5 : 0.16, peak: 0.04, filter: { type: 'lowpass', freq: 700 } });
    });
    tone(v, { type: 'sine', freq: 95, freqEnd: 38, glide: 0.35, at: 0.82, attack: 0.004, release: 0.45, peak: 0.75 });
    noise(v, { at: 0.82, attack: 0.002, release: 0.16, peak: 0.3, filter: { type: 'lowpass', freq: 420, q: 0.9 } });
  });
}

function ping(): void {
  play(1.0, (v) => {
    const echoes: [number, number][] = [
      [0, 0.32],
      [0.21, 0.12],
      [0.42, 0.05],
    ];
    for (const [at, peak] of echoes) {
      tone(v, { type: 'sine', freq: 1320, freqEnd: 1180, glide: 0.3, at, attack: 0.004, release: 0.42, peak });
      tone(v, { type: 'sine', freq: 2640, at, attack: 0.003, release: 0.15, peak: peak * 0.18 });
    }
  });
}

function notify(): void {
  play(1.0, (v) => {
    const notes: [number, number][] = [
      [783.99, 0],
      [1046.5, 0.13],
    ];
    for (const [f, at] of notes) {
      tone(v, { type: 'sine', freq: f, at, attack: 0.006, release: 0.7, peak: 0.2 });
      tone(v, { type: 'sine', freq: f * 2.76, at, attack: 0.004, release: 0.25, peak: 0.035 });
      tone(v, { type: 'triangle', freq: f / 2, at, attack: 0.01, release: 0.4, peak: 0.04 });
    }
  });
}

function whoosh(): void {
  play(0.9, (v) => {
    noise(v, {
      at: 0,
      attack: 0.26,
      release: 0.42,
      peak: 0.42,
      filter: { type: 'bandpass', freq: 260, q: 1.4, to: [[0.32, 2600], [0.68, 500]] },
      pan: -0.6,
      panEnd: 0.6,
    });
    noise(v, {
      at: 0.04,
      attack: 0.22,
      release: 0.35,
      peak: 0.07,
      filter: { type: 'highpass', freq: 3000, q: 0.6 },
      pan: -0.4,
      panEnd: 0.5,
    });
  });
}

function turnStart(): void {
  play(1.2, (v) => {
    const notes: [number, number, number][] = [
      [293.66, 0, 0.14],
      [440, 0.16, 0.14],
      [587.33, 0.32, 0.5],
    ];
    const layers: [OscillatorType, number, number][] = [
      ['sawtooth', 1, 0.12],
      ['square', 1, 0.035],
      ['sine', 0.5, 0.06],
    ];
    for (const [f, at, len] of notes) {
      const last = len > 0.3;
      for (const [type, mul, peak] of layers) {
        tone(v, {
          type,
          freq: f * mul,
          at,
          attack: 0.035,
          hold: last ? 0.22 : 0.07,
          release: last ? 0.45 : 0.1,
          peak,
          filter: { type: 'lowpass', freq: 700, q: 0.9, to: [[0.06, 1900], [len, 1200]] },
          vibrato: last ? { rate: 5.2, depth: 7, delay: 0.12 } : undefined,
        });
      }
    }
  });
}

function reveal(): void {
  play(1.45, (v) => {
    tone(v, { type: 'sine', freq: 330, freqEnd: 1320, glide: 0.95, at: 0, attack: 0.45, hold: 0.25, release: 0.5, peak: 0.12 });
    tone(v, { type: 'sine', freq: 495, freqEnd: 1980, glide: 0.95, at: 0.03, attack: 0.45, hold: 0.2, release: 0.45, peak: 0.05 });
    for (let i = 0; i < 14; i++) {
      tone(v, {
        type: 'sine',
        freq: 1400 + i * 220 + rnd(-80, 80),
        at: 0.12 + i * 0.065,
        attack: 0.004,
        release: rnd(0.14, 0.26),
        peak: 0.03 + 0.02 * (i / 14),
        pan: rnd(-0.6, 0.6),
      });
    }
    noise(v, { at: 0, attack: 0.8, release: 0.45, peak: 0.05, filter: { type: 'highpass', freq: 3500 } });
  });
}

export const uiSounds: UiSounds = {
  diceShake,
  diceLand,
  tick,
  critSuccess,
  critFail,
  ping,
  notify,
  whoosh,
  turnStart,
  reveal,
};
