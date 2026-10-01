import type { WeatherType } from '@wailers/shared';

/**
 * Screen-space weather particles drawn on a 2D canvas (rain, storm, snow, fog, embers).
 * Particle counts scale with the canvas area; the loop pauses while the tab is hidden and stops
 * entirely when there is no weather. Changing the weather cross-fades the two systems.
 */

export interface WeatherRendererOptions {
  /** Particle count multiplier (default 1). */
  density?: number;
  /** Speed multiplier (default 1). */
  speed?: number;
  /** Disable lightning flashes / flicker. */
  noFlashes?: boolean;
  /** Atmospheric tints (storm darkening, fog haze, warm glow). Default true. */
  tint?: boolean;
}

interface Env {
  w: number;
  h: number;
  density: number;
  speed: number;
  reduced: boolean;
  flashes: boolean;
  tint: boolean;
}

interface WeatherSystem {
  /** (Re)populate for the current size / density. */
  resize(env: Env): void;
  update(dt: number, now: number, env: Env): void;
  draw(c: CanvasRenderingContext2D, alpha: number, now: number, env: Env): void;
}

interface Layer {
  type: WeatherType;
  system: WeatherSystem;
  alpha: number;
  target: number;
}

const REFERENCE_AREA = 1920 * 1080;
const FADE_SECONDS = 0.9;
const TAU = Math.PI * 2;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function countFor(base: number, env: Env): number {
  const area = Math.min(2.6, Math.max(0.12, (env.w * env.h) / REFERENCE_AREA));
  return Math.max(0, Math.round(base * area * env.density * (env.reduced ? 0.4 : 1)));
}

function resizeArray<T>(arr: T[], target: number, make: () => T): void {
  if (arr.length > target) arr.length = target;
  while (arr.length < target) arr.push(make());
}

// ---------------------------------------------------------------------------
// Sprites (soft radial dots rendered once)
// ---------------------------------------------------------------------------

const spriteCache = new Map<string, HTMLCanvasElement>();

function radialSprite(key: string, size: number, stops: [number, string][]): HTMLCanvasElement {
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  spriteCache.set(key, canvas);
  return canvas;
}

function snowSprite(): HTMLCanvasElement {
  return radialSprite('snow', 32, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.85)'],
    [0.7, 'rgba(235,242,255,0.25)'],
    [1, 'rgba(235,242,255,0)'],
  ]);
}

function fogSprite(dark: boolean): HTMLCanvasElement {
  const rgb = dark ? '150,158,170' : '214,219,226';
  return radialSprite(`fog-${dark ? 'd' : 'l'}`, 256, [
    [0, `rgba(${rgb},1)`],
    [0.3, `rgba(${rgb},0.75)`],
    [0.6, `rgba(${rgb},0.3)`],
    [0.82, `rgba(${rgb},0.08)`],
    [1, `rgba(${rgb},0)`],
  ]);
}

const EMBER_COLORS = ['255,179,71', '255,122,42', '255,210,122', '255,92,40'];

function emberSprite(index: number): HTMLCanvasElement {
  const rgb = EMBER_COLORS[index % EMBER_COLORS.length] ?? EMBER_COLORS[0]!;
  return radialSprite(`ember-${index}`, 48, [
    [0, 'rgba(255,250,225,1)'],
    [0.15, `rgba(${rgb},0.95)`],
    [0.45, `rgba(${rgb},0.32)`],
    [1, `rgba(${rgb},0)`],
  ]);
}

// ---------------------------------------------------------------------------
// Rain & storm
// ---------------------------------------------------------------------------

interface Drop {
  x: number;
  y: number;
  z: number;
  len: number;
  speed: number;
  travel: number;
  maxTravel: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

interface Strike {
  start: number;
  /** [ms offset, intensity] keyframes. */
  pulses: [number, number][];
  length: number;
}

const DROP_BUCKETS: { alpha: number; width: number }[] = [
  { alpha: 0.24, width: 0.9 },
  { alpha: 0.36, width: 1.2 },
  { alpha: 0.52, width: 1.7 },
];

/** Peak opacity of a storm lightning flash (it repeats every few seconds, so it stays moderate). */
const LIGHTNING_PEAK = 0.62;

class RainSystem implements WeatherSystem {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private nextStrike = 0;
  private strike: Strike | null = null;
  private nextFlicker = 0;
  private flickerStart = -1;

  constructor(private readonly storm: boolean) {}

  private get angle(): number {
    return this.storm ? 0.34 : 0.18;
  }

  resize(env: Env): void {
    resizeArray(this.drops, countFor(this.storm ? 950 : 480, env), () => this.spawn(env, true));
    for (const d of this.drops) if (d.x > env.w + 50) this.respawn(d, env, true);
  }

  private spawn(env: Env, initial: boolean): Drop {
    const d: Drop = { x: 0, y: 0, z: 0, len: 0, speed: 0, travel: 0, maxTravel: 0 };
    this.respawn(d, env, initial);
    return d;
  }

  private respawn(d: Drop, env: Env, initial: boolean): void {
    const tan = Math.tan(this.angle);
    d.z = Math.random();
    d.speed = (this.storm ? 1150 : 820) * (0.6 + 0.6 * d.z);
    d.len = (this.storm ? 22 : 15) * (0.55 + 0.9 * d.z);
    d.maxTravel = env.h * rand(0.25, 1.25);
    d.x = rand(-env.h * tan * 0.8, env.w + 20);
    if (initial) {
      d.y = rand(-d.len, env.h);
      d.travel = rand(0, d.maxTravel);
    } else {
      d.y = -d.len - rand(0, 60);
      d.travel = 0;
    }
  }

  update(dt: number, now: number, env: Env): void {
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);
    const speedK = env.speed * (env.reduced ? 0.7 : 1);
    for (const d of this.drops) {
      const step = d.speed * speedK * dt;
      d.x += sin * step;
      d.y += cos * step;
      d.travel += step;
      if (d.travel >= d.maxTravel || d.y > env.h + d.len) {
        if (d.y < env.h && d.x > 0 && d.x < env.w && d.z > 0.35 && this.splashes.length < 220 && Math.random() < 0.75) {
          this.splashes.push({ x: d.x, y: d.y, age: 0, life: rand(0.22, 0.34), size: 2 + d.z * (this.storm ? 5 : 4) });
        }
        this.respawn(d, env, false);
      }
    }
    for (const s of this.splashes) s.age += dt;
    this.splashes = this.splashes.filter((s) => s.age < s.life);

    if (!this.storm) return;
    if (this.nextStrike === 0) this.nextStrike = now + rand(1500, 5000);
    if (!this.strike && now >= this.nextStrike) {
      const double = Math.random() < 0.55;
      this.strike = {
        start: now,
        length: double ? 950 : 700,
        pulses: double
          ? [
              [0, 0],
              [40, 0.78],
              [110, 0.12],
              [170, 0.6],
              [260, 0.18],
              [330, 0.4],
              [950, 0],
            ]
          : [
              [0, 0],
              [45, 0.7],
              [140, 0.2],
              [210, 0.45],
              [700, 0],
            ],
      };
      this.nextStrike = now + rand(4200, 10500);
    }
    if (this.strike && now - this.strike.start > this.strike.length) this.strike = null;
    if (this.nextFlicker === 0) this.nextFlicker = now + rand(2500, 7000);
    if (now >= this.nextFlicker) {
      this.flickerStart = now;
      this.nextFlicker = now + rand(3000, 9000);
    }
  }

  private strikeIntensity(now: number): number {
    const s = this.strike;
    if (!s) return 0;
    const t = now - s.start;
    const p = s.pulses;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      if (t >= a[0] && t <= b[0]) {
        const k = (t - a[0]) / Math.max(1, b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * (i === p.length - 2 ? 1 - Math.pow(1 - k, 3) : k);
      }
    }
    return 0;
  }

  draw(c: CanvasRenderingContext2D, alpha: number, now: number, env: Env): void {
    if (this.storm && env.tint) {
      c.globalAlpha = alpha;
      c.fillStyle = 'rgba(8, 12, 26, 0.24)';
      c.fillRect(0, 0, env.w, env.h);
    }

    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);
    c.lineCap = 'round';
    for (let b = 0; b < DROP_BUCKETS.length; b++) {
      const bucket = DROP_BUCKETS[b]!;
      c.beginPath();
      for (const d of this.drops) {
        if (Math.min(2, Math.floor(d.z * 3)) !== b) continue;
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - sin * d.len, d.y - cos * d.len);
      }
      c.globalAlpha = alpha * bucket.alpha * (this.storm ? 1.1 : 1);
      c.strokeStyle = 'rgb(178, 200, 232)';
      c.lineWidth = bucket.width;
      c.stroke();
    }

    c.lineWidth = 1;
    c.strokeStyle = 'rgb(196, 214, 240)';
    c.fillStyle = 'rgb(206, 222, 245)';
    for (const s of this.splashes) {
      const p = s.age / s.life;
      const r = s.size * (0.4 + 1.1 * p);
      c.globalAlpha = alpha * 0.42 * (1 - p);
      c.beginPath();
      c.ellipse(s.x, s.y, r, r * 0.42, 0, 0, TAU);
      c.stroke();
      const lift = Math.sin(Math.PI * p) * s.size * 1.2;
      c.fillRect(s.x - r * 0.9, s.y - lift, 1.2, 1.2);
      c.fillRect(s.x + r * 0.8, s.y - lift * 0.8, 1.2, 1.2);
    }

    if (!this.storm) return;
    const strike = this.strikeIntensity(now);
    if (strike > 0.001) {
      const k = env.flashes && !env.reduced ? LIGHTNING_PEAK : 0.12;
      c.globalAlpha = alpha * strike * k;
      const g = c.createRadialGradient(env.w * 0.5, env.h * 0.35, 0, env.w * 0.5, env.h * 0.35, Math.max(env.w, env.h) * 0.9);
      g.addColorStop(0, 'rgba(232, 240, 255, 0.95)');
      g.addColorStop(1, 'rgba(170, 195, 255, 0.55)');
      c.fillStyle = g;
      c.fillRect(0, 0, env.w, env.h);
    }
    if (this.flickerStart > 0 && env.flashes && !env.reduced) {
      const t = now - this.flickerStart;
      if (t < 260) {
        const pulse = t < 60 || (t > 120 && t < 170) ? 1 : 0;
        if (pulse) {
          c.globalAlpha = alpha * 0.16;
          c.fillStyle = '#000000';
          c.fillRect(0, 0, env.w, env.h);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Snow
// ---------------------------------------------------------------------------

interface Flake {
  x: number;
  y: number;
  r: number;
  vy: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
}

class SnowSystem implements WeatherSystem {
  private flakes: Flake[] = [];
  private wind = rand(6, 18);

  resize(env: Env): void {
    resizeArray(this.flakes, countFor(320, env), () => this.spawn(env, true));
    for (const f of this.flakes) if (f.x > env.w + 40) f.x = rand(0, env.w);
  }

  private spawn(env: Env, initial: boolean): Flake {
    const z = Math.random();
    return {
      x: rand(-20, env.w + 20),
      y: initial ? rand(-10, env.h) : rand(-40, -8),
      r: 1 + z * 2.8,
      vy: 22 + z * 52,
      swayAmp: rand(8, 34),
      swayFreq: rand(0.25, 0.9),
      phase: rand(0, TAU),
      alpha: 0.45 + z * 0.5,
    };
  }

  update(dt: number, _now: number, env: Env): void {
    const k = env.speed * (env.reduced ? 0.6 : 1);
    for (const f of this.flakes) {
      f.y += f.vy * k * dt;
      f.x += this.wind * k * dt;
      if (f.y > env.h + f.r * 4) {
        Object.assign(f, this.spawn(env, false));
      }
      if (f.x > env.w + 40) f.x -= env.w + 80;
    }
  }

  draw(c: CanvasRenderingContext2D, alpha: number, now: number, env: Env): void {
    const sprite = snowSprite();
    const t = now / 1000;
    for (const f of this.flakes) {
      const sway = env.reduced ? 0 : Math.sin(t * f.swayFreq * TAU + f.phase) * f.swayAmp;
      const size = f.r * 4;
      c.globalAlpha = alpha * f.alpha;
      c.drawImage(sprite, f.x + sway - size / 2, f.y - size / 2, size, size);
    }
  }
}

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

interface FogBlob {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  phase: number;
  dark: boolean;
}

class FogSystem implements WeatherSystem {
  private blobs: FogBlob[] = [];
  private dir = Math.random() < 0.5 ? -1 : 1;

  resize(env: Env): void {
    const target = Math.max(6, Math.round(countFor(16, { ...env, reduced: false }) * (env.reduced ? 0.7 : 1)));
    resizeArray(this.blobs, target, () => this.spawn(env));
    for (const b of this.blobs) {
      const size = Math.max(env.w, env.h);
      b.r = Math.max(b.r, size * 0.16);
    }
  }

  private spawn(env: Env): FogBlob {
    const size = Math.max(env.w, env.h, 1);
    const dark = Math.random() < 0.35;
    return {
      x: rand(-size * 0.2, env.w + size * 0.2),
      y: rand(-size * 0.1, env.h + size * 0.1),
      r: size * rand(0.18, 0.42),
      vx: this.dir * rand(6, 20) * (dark ? 1 : 1.5),
      vy: rand(-3, 3),
      alpha: dark ? rand(0.07, 0.14) : rand(0.1, 0.2),
      phase: rand(0, TAU),
      dark,
    };
  }

  update(dt: number, _now: number, env: Env): void {
    const k = env.speed * (env.reduced ? 0.6 : 1);
    for (const b of this.blobs) {
      b.x += b.vx * k * dt;
      b.y += b.vy * k * dt;
      if (b.x - b.r > env.w) b.x = -b.r;
      else if (b.x + b.r < 0) b.x = env.w + b.r;
      if (b.y - b.r > env.h) b.y = -b.r;
      else if (b.y + b.r < 0) b.y = env.h + b.r;
    }
  }

  draw(c: CanvasRenderingContext2D, alpha: number, now: number, env: Env): void {
    if (env.tint) {
      c.globalAlpha = alpha;
      c.fillStyle = 'rgba(176, 184, 196, 0.1)';
      c.fillRect(0, 0, env.w, env.h);
    }
    const t = now / 1000;
    const light = fogSprite(false);
    const dark = fogSprite(true);
    for (const b of this.blobs) {
      c.globalAlpha = alpha * b.alpha * (0.72 + 0.28 * Math.sin(t * 0.18 + b.phase));
      c.drawImage(b.dark ? dark : light, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Embers & ash
// ---------------------------------------------------------------------------

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  freq: number;
  phase: number;
  sprite: number;
}

interface Ash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  spin: number;
  alpha: number;
}

class EmberSystem implements WeatherSystem {
  private embers: Ember[] = [];
  private ash: Ash[] = [];

  resize(env: Env): void {
    resizeArray(this.embers, countFor(130, env), () => this.spawnEmber(env, true));
    resizeArray(this.ash, countFor(55, env), () => this.spawnAsh(env, true));
  }

  private spawnEmber(env: Env, initial: boolean): Ember {
    return {
      x: rand(0, env.w),
      y: initial ? rand(0, env.h) : env.h + rand(5, 40),
      vx: rand(-12, 12),
      vy: -rand(28, 85),
      size: rand(0.8, 2.6),
      life: initial ? rand(0, 3) : 0,
      maxLife: rand(3.5, 8),
      freq: rand(5, 13),
      phase: rand(0, TAU),
      sprite: Math.floor(rand(0, EMBER_COLORS.length)),
    };
  }

  private spawnAsh(env: Env, initial: boolean): Ash {
    return {
      x: rand(0, env.w),
      y: initial ? rand(0, env.h) : rand(-30, -5),
      vx: rand(-10, 14),
      vy: rand(10, 30),
      size: rand(1, 2.6),
      rot: rand(0, TAU),
      spin: rand(-2, 2),
      alpha: rand(0.2, 0.45),
    };
  }

  update(dt: number, now: number, env: Env): void {
    const k = env.speed * (env.reduced ? 0.6 : 1);
    const t = now / 1000;
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i]!;
      e.vx += Math.sin(t * 1.1 + e.phase) * 16 * dt;
      e.vx *= 1 - 0.4 * dt;
      e.x += e.vx * k * dt;
      e.y += e.vy * k * dt;
      e.life += dt * k;
      if (e.life > e.maxLife || e.y < -20 || e.x < -30 || e.x > env.w + 30) this.embers[i] = this.spawnEmber(env, false);
    }
    for (let i = 0; i < this.ash.length; i++) {
      const a = this.ash[i]!;
      a.x += (a.vx + Math.sin(t * 0.7 + a.rot) * 8) * k * dt;
      a.y += a.vy * k * dt;
      a.rot += a.spin * dt;
      if (a.y > env.h + 10 || a.x < -20 || a.x > env.w + 20) this.ash[i] = this.spawnAsh(env, false);
    }
  }

  draw(c: CanvasRenderingContext2D, alpha: number, now: number, env: Env): void {
    if (env.tint) {
      const g = c.createLinearGradient(0, env.h, 0, env.h * 0.45);
      g.addColorStop(0, 'rgba(255, 90, 20, 0.09)');
      g.addColorStop(1, 'rgba(255, 90, 20, 0)');
      c.globalAlpha = alpha;
      c.fillStyle = g;
      c.fillRect(0, env.h * 0.45, env.w, env.h * 0.55);
    }

    c.fillStyle = 'rgb(150, 140, 132)';
    for (const a of this.ash) {
      c.globalAlpha = alpha * a.alpha;
      const s = a.size;
      c.save();
      c.translate(a.x, a.y);
      c.rotate(a.rot);
      c.fillRect(-s, -s * 0.5, s * 2, s);
      c.restore();
    }

    const t = now / 1000;
    c.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      const lifeP = e.life / e.maxLife;
      const fade = Math.min(1, lifeP / 0.12) * (lifeP > 0.65 ? Math.max(0, 1 - (lifeP - 0.65) / 0.35) : 1);
      if (fade <= 0.01) continue;
      const flicker = env.reduced ? 0.85 : 0.6 + 0.4 * Math.sin(t * e.freq * TAU + e.phase);
      const size = e.size * 7;
      c.globalAlpha = alpha * fade * flicker;
      c.drawImage(emberSprite(e.sprite), e.x - size / 2, e.y - size / 2, size, size);
    }
    c.globalCompositeOperation = 'source-over';
  }
}

function createSystem(type: WeatherType): WeatherSystem | null {
  switch (type) {
    case 'rain':
      return new RainSystem(false);
    case 'storm':
      return new RainSystem(true);
    case 'snow':
      return new SnowSystem();
    case 'fog':
      return new FogSystem();
    case 'embers':
      return new EmberSystem();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class WeatherRenderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly env: Env;
  private layers: Layer[] = [];
  private current: WeatherType = 'none';
  private dpr = 1;
  private raf: number | null = null;
  private last = 0;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: WeatherRendererOptions = {},
  ) {
    this.ctx = canvas.getContext('2d');
    this.env = {
      w: 0,
      h: 0,
      density: opts.density ?? 1,
      speed: opts.speed ?? 1,
      reduced: false,
      flashes: !opts.noFlashes,
      tint: opts.tint ?? true,
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get weather(): WeatherType {
    return this.current;
  }

  setWeather(type: WeatherType): void {
    if (this.destroyed || type === this.current) return;
    this.current = type;
    for (const layer of this.layers) layer.target = 0;
    const system = createSystem(type);
    if (system) {
      system.resize(this.env);
      this.layers.push({ type, system, alpha: 0, target: 1 });
    }
    this.kick();
  }

  setReducedMotion(reduced: boolean): void {
    if (this.env.reduced === reduced) return;
    this.env.reduced = reduced;
    for (const layer of this.layers) layer.system.resize(this.env);
  }

  /** CSS pixel size of the canvas. */
  resize(width: number, height: number): void {
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const w = Math.max(0, Math.round(width));
    const h = Math.max(0, Math.round(height));
    if (w === this.env.w && h === this.env.h && dpr === this.dpr) return;
    this.dpr = dpr;
    this.env.w = w;
    this.env.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    for (const layer of this.layers) layer.system.resize(this.env);
    this.kick();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.layers = [];
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private kick(): void {
    if (this.destroyed || this.raf !== null || this.layers.length === 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = null;
    if (this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    for (const layer of this.layers) {
      const step = dt / FADE_SECONDS;
      layer.alpha = layer.target > layer.alpha ? Math.min(layer.target, layer.alpha + step) : Math.max(layer.target, layer.alpha - step);
    }
    this.layers = this.layers.filter((l) => l.target > 0 || l.alpha > 0);

    const c = this.ctx;
    if (!c) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.env.w, this.env.h);
    if (this.env.w > 0 && this.env.h > 0) {
      for (const layer of this.layers) {
        layer.system.update(dt, now, this.env);
        c.save();
        layer.system.draw(c, layer.alpha, now, this.env);
        c.restore();
      }
    }
    if (this.layers.length > 0) this.raf = requestAnimationFrame(this.frame);
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      if (this.raf !== null) cancelAnimationFrame(this.raf);
      this.raf = null;
    } else {
      this.kick();
    }
  };
}
