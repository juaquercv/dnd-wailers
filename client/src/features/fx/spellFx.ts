import type { FxEvent, SpellAnimation } from '@wailers/shared';
import { FONT_DISPLAY } from '../../map/mapUtils';

/**
 * Spell animations drawn in WORLD coordinates (level px) on a raw 2D context. Every effect is a pure
 * function of the elapsed time and a per-cast random table, so a single Konva.Shape can redraw all
 * active spells each frame.
 */

export type SpellFxEvent = Extract<FxEvent, { kind: 'spell' }>;

export interface SpellInstance {
  id: number;
  animation: SpellAnimation;
  x: number;
  y: number;
  fromX: number | null;
  fromY: number | null;
  /** World px, already clamped to a visible minimum. */
  radius: number;
  label: string | null;
  /** performance.now() of the cast. */
  start: number;
  /** Projectile flight before the impact (0 = none). */
  travelMs: number;
  /** Impact effect length. */
  durationMs: number;
  seed: number;
  rand: Float32Array;
  reduced: boolean;
}

export interface SpellView {
  /** World units per screen pixel (1 / zoom). */
  u: number;
  /** Top edge of the visible area (world y). */
  top: number;
}

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const RAND_SIZE = 512;
const MIN_RADIUS = 28;
const LABEL_MS = 1700;
/** World px per ms for projectiles. */
const PROJECTILE_SPEED = 1.9;

const DURATION: Record<SpellAnimation, number> = {
  fire: 1700,
  ice: 1800,
  lightning: 1200,
  heal: 2200,
  arcane: 2200,
  poison: 2500,
  holy: 2000,
  shadow: 2200,
};

const HAS_PROJECTILE: Record<SpellAnimation, boolean> = {
  fire: true,
  ice: true,
  lightning: false,
  heal: false,
  arcane: true,
  poison: true,
  holy: false,
  shadow: true,
};

/** core / mid / outer colors per school (projectiles, labels). */
const PALETTE: Record<SpellAnimation, { core: Rgb; mid: Rgb; outer: Rgb; label: string }> = {
  fire: { core: [255, 244, 194], mid: [255, 176, 58], outer: [255, 75, 31], label: '#ffc46b' },
  ice: { core: [242, 253, 255], mid: [155, 231, 255], outer: [58, 168, 255], label: '#bfefff' },
  lightning: { core: [255, 255, 255], mid: [207, 232, 255], outer: [111, 182, 255], label: '#d9ecff' },
  heal: { core: [244, 255, 224], mid: [125, 255, 154], outer: [34, 197, 94], label: '#a7ffbf' },
  arcane: { core: [245, 237, 255], mid: [196, 166, 255], outer: [138, 99, 240], label: '#d4c0ff' },
  poison: { core: [233, 255, 154], mid: [155, 225, 93], outer: [77, 143, 42], label: '#c8f27a' },
  holy: { core: [255, 251, 232], mid: [255, 233, 160], outer: [243, 195, 74], label: '#ffe39a' },
  shadow: { core: [217, 184, 255], mid: [122, 63, 209], outer: [42, 17, 69], label: '#c7a2ff' },
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

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

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** Progress 0..1 of a phase starting at `start` ms lasting `dur` ms. */
function prog(te: number, start: number, dur: number): number {
  return dur <= 0 ? (te >= start ? 1 : 0) : clamp01((te - start) / dur);
}

function easeOut(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeIn(t: number): number {
  const x = clamp01(t);
  return x * x;
}

function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** 0 → 1 over [0, inMs], holds until holdEnd, 1 → 0 until outEnd. */
function envelope(te: number, inMs: number, holdEnd: number, outEnd: number): number {
  if (te <= 0 || te >= outEnd) return 0;
  if (te < inMs) return te / inMs;
  if (te <= holdEnd) return 1;
  return 1 - (te - holdEnd) / Math.max(1, outEnd - holdEnd);
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function rnd(s: SpellInstance, i: number): number {
  return s.rand[((i % RAND_SIZE) + RAND_SIZE) % RAND_SIZE] ?? 0.5;
}

function count(s: SpellInstance, n: number): number {
  return s.reduced ? Math.ceil(n / 2) : n;
}

function flashK(s: SpellInstance): number {
  return s.reduced ? 0.35 : 1;
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][], alpha: number): void {
  if (alpha <= 0.002 || r <= 0.01) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  c.globalAlpha = Math.min(1, alpha);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, color: string, alpha: number): void {
  if (alpha <= 0.002 || r <= 0.01) return;
  c.globalAlpha = Math.min(1, alpha);
  c.lineWidth = width;
  c.strokeStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0.002 || r <= 0.01) return;
  c.globalAlpha = Math.min(1, alpha);
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/** Four-pointed sparkle. */
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, color: string, alpha: number): void {
  if (alpha <= 0.002 || size <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.globalAlpha = Math.min(1, alpha);
  c.fillStyle = color;
  c.beginPath();
  const w = size * 0.22;
  c.moveTo(0, -size);
  c.quadraticCurveTo(w, -w, size, 0);
  c.quadraticCurveTo(w, w, 0, size);
  c.quadraticCurveTo(-w, w, -size, 0);
  c.quadraticCurveTo(-w, -w, 0, -size);
  c.fill();
  c.restore();
}

function starPolygon(c: CanvasRenderingContext2D, points: number, step: number, radius: number): void {
  c.beginPath();
  for (let k = 0; k <= points; k++) {
    const a = ((k * step) / points) * TAU - Math.PI / 2;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (k === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

/** Small runic glyph centered at the origin (stroke only). */
function rune(c: CanvasRenderingContext2D, kind: number, s: number): void {
  c.beginPath();
  switch (kind % 6) {
    case 0:
      c.moveTo(0, -s);
      c.lineTo(0, s);
      c.moveTo(0, -s * 0.5);
      c.lineTo(s * 0.7, -s);
      c.moveTo(0, 0);
      c.lineTo(s * 0.7, -s * 0.4);
      break;
    case 1:
      c.moveTo(0, -s);
      c.lineTo(s * 0.85, s * 0.8);
      c.lineTo(-s * 0.85, s * 0.8);
      c.closePath();
      break;
    case 2:
      c.moveTo(-s * 0.7, -s);
      c.lineTo(s * 0.7, s);
      c.moveTo(s * 0.7, -s);
      c.lineTo(-s * 0.7, s);
      c.moveTo(-s * 0.8, 0);
      c.lineTo(s * 0.8, 0);
      break;
    case 3:
      c.moveTo(0, -s);
      c.lineTo(s * 0.7, 0);
      c.lineTo(0, s);
      c.lineTo(-s * 0.7, 0);
      c.closePath();
      c.moveTo(s * 0.12, 0);
      c.arc(0, 0, s * 0.12, 0, TAU);
      break;
    case 4:
      c.moveTo(0, s);
      c.lineTo(0, -s);
      c.moveTo(-s * 0.7, -s * 0.3);
      c.lineTo(0, -s);
      c.lineTo(s * 0.7, -s * 0.3);
      break;
    default:
      c.moveTo(-s * 0.6, -s);
      c.lineTo(s * 0.6, -s * 0.35);
      c.lineTo(-s * 0.6, s * 0.35);
      c.lineTo(s * 0.6, s);
      break;
  }
  c.stroke();
}

/** Jagged polyline by midpoint displacement. */
function boltPath(x0: number, y0: number, x1: number, y1: number, rng: () => number, displacement: number, depth: number): number[] {
  let pts = [x0, y0, x1, y1];
  let disp = displacement;
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i]!;
      const ay = pts[i + 1]!;
      const bx = pts[i + 2]!;
      const by = pts[i + 3]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rng() - 0.5) * disp;
      next.push(ax, ay, (ax + bx) / 2 + (-dy / len) * off, (ay + by) / 2 + (dx / len) * off);
    }
    next.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
    pts = next;
    disp *= 0.55;
  }
  return pts;
}

function tracePath(c: CanvasRenderingContext2D, pts: number[]): void {
  c.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    if (i === 0) c.moveTo(pts[i]!, pts[i + 1]!);
    else c.lineTo(pts[i]!, pts[i + 1]!);
  }
}

function strokeBolt(c: CanvasRenderingContext2D, pts: number[], r: number, u: number, alpha: number): void {
  if (alpha <= 0.01) return;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  tracePath(c, pts);
  c.globalAlpha = 0.35 * alpha;
  c.strokeStyle = 'rgb(120,175,255)';
  c.lineWidth = Math.max(5 * u, r * 0.16);
  c.stroke();
  c.globalAlpha = 0.85 * alpha;
  c.strokeStyle = '#cfe6ff';
  c.lineWidth = Math.max(2.2 * u, r * 0.06);
  c.stroke();
  c.globalAlpha = alpha;
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.max(1 * u, r * 0.022);
  c.stroke();
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

let spellSeq = 0;

export function createSpell(fx: SpellFxEvent, now: number, reduced: boolean): SpellInstance {
  const radius = Math.max(MIN_RADIUS, Number.isFinite(fx.radius) ? fx.radius : 0);
  let travelMs = 0;
  if (HAS_PROJECTILE[fx.animation] && fx.fromX !== null && fx.fromY !== null) {
    const dist = Math.hypot(fx.x - fx.fromX, fx.y - fx.fromY);
    if (dist > radius * 0.6) travelMs = Math.min(720, Math.max(260, dist / PROJECTILE_SPEED));
  }
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const rng = mulberry32(seed);
  const rand = new Float32Array(RAND_SIZE);
  for (let i = 0; i < RAND_SIZE; i++) rand[i] = rng();
  spellSeq += 1;
  return {
    id: spellSeq,
    animation: fx.animation,
    x: fx.x,
    y: fx.y,
    fromX: fx.fromX,
    fromY: fx.fromY,
    radius,
    label: fx.label && fx.label.trim() ? fx.label.trim() : null,
    start: now,
    travelMs,
    durationMs: DURATION[fx.animation] ?? 1800,
    seed,
    rand,
    reduced,
  };
}

export function spellEndsAt(s: SpellInstance): number {
  return s.start + s.travelMs + Math.max(s.durationMs, s.label ? LABEL_MS : 0);
}

/** Draws one spell at time `now` (world coordinates). */
export function drawSpell(c: CanvasRenderingContext2D, s: SpellInstance, now: number, view: SpellView): void {
  const t = now - s.start;
  if (t < 0) return;
  c.save();
  if (s.travelMs > 0 && t < s.travelMs) {
    drawProjectile(c, s, t / s.travelMs, view);
    c.restore();
    return;
  }
  const te = t - s.travelMs;
  switch (s.animation) {
    case 'fire':
      drawFire(c, s, te, view);
      break;
    case 'ice':
      drawIce(c, s, te, view);
      break;
    case 'lightning':
      drawLightning(c, s, te, view);
      break;
    case 'heal':
      drawHeal(c, s, te, view);
      break;
    case 'arcane':
      drawArcane(c, s, te, view);
      break;
    case 'poison':
      drawPoison(c, s, te, view);
      break;
    case 'holy':
      drawHoly(c, s, te, view);
      break;
    case 'shadow':
      drawShadow(c, s, te, view);
      break;
  }
  drawLabel(c, s, te, view);
  c.restore();
}

// ---------------------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------------------

function drawProjectile(c: CanvasRenderingContext2D, s: SpellInstance, p: number, v: SpellView): void {
  const fx = s.fromX ?? s.x;
  const fy = s.fromY ?? s.y;
  const dx = s.x - fx;
  const dy = s.y - fy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const arc = s.animation === 'fire' || s.animation === 'poison' ? 0.1 : s.animation === 'shadow' ? 0.05 : 0;
  const sway = s.animation === 'shadow' ? 1 : 0;
  const at = (q: number): { x: number; y: number } => {
    const off = Math.sin(Math.PI * q) * dist * arc + Math.sin(q * 18) * s.radius * 0.08 * sway;
    return { x: fx + dx * q + nx * off, y: fy + dy * q + ny * off };
  };
  const pal = PALETTE[s.animation];
  const r = s.radius;
  const k = Math.pow(p, 1.3);
  c.globalCompositeOperation = s.animation === 'shadow' ? 'source-over' : 'lighter';

  const trail = count(s, 16);
  for (let i = trail - 1; i >= 1; i--) {
    const q = k - i * 0.026;
    if (q < 0) continue;
    const pt = at(q);
    const f = 1 - i / trail;
    glow(c, pt.x, pt.y, Math.max(3 * v.u, r * 0.2 * f), [
      [0, rgba(pal.mid, 0.85)],
      [1, rgba(pal.outer, 0)],
    ], f * 0.75);
  }
  const head = at(k);
  glow(c, head.x, head.y, Math.max(6 * v.u, r * 0.36), [
    [0, rgba(pal.core, 1)],
    [0.3, rgba(pal.mid, 0.9)],
    [1, rgba(pal.outer, 0)],
  ], 1);
  if (s.animation === 'ice') {
    const ang = Math.atan2(dy, dx);
    const len = r * 0.38;
    c.save();
    c.translate(head.x, head.y);
    c.rotate(ang);
    c.globalAlpha = 1;
    c.fillStyle = '#f2fdff';
    c.beginPath();
    c.moveTo(len * 0.7, 0);
    c.lineTo(0, len * 0.14);
    c.lineTo(-len * 0.5, 0);
    c.lineTo(0, -len * 0.14);
    c.closePath();
    c.fill();
    c.restore();
  } else {
    dot(c, head.x, head.y, Math.max(2 * v.u, r * 0.09), s.animation === 'shadow' ? '#0b0612' : '#ffffff', 1);
  }
}

// ---------------------------------------------------------------------------
// Fire: explosion burst, shockwave ring, smoke and embers
// ---------------------------------------------------------------------------

function drawFire(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;

  c.globalCompositeOperation = 'source-over';
  glow(c, x, y, r * 0.95, [
    [0, 'rgba(25,12,6,0.55)'],
    [0.6, 'rgba(25,12,6,0.25)'],
    [1, 'rgba(25,12,6,0)'],
  ], 1 - prog(te, 200, D - 200));

  c.globalCompositeOperation = 'lighter';
  const pf = prog(te, 0, 240);
  if (pf < 1) {
    glow(c, x, y, r * (0.5 + 0.8 * easeOut(pf)), [
      [0, 'rgba(255,255,235,1)'],
      [0.35, 'rgba(255,214,120,0.9)'],
      [1, 'rgba(255,120,40,0)'],
    ], (1 - pf) * flashK(s));
  }

  const balls = count(s, 22);
  for (let i = 0; i < balls; i++) {
    const p = prog(te, rnd(s, i) * 80, 900 + rnd(s, i + 40) * 500);
    if (p <= 0 || p >= 1) continue;
    const a = (i / balls) * TAU + rnd(s, i + 80) * 0.6;
    const d = r * (0.25 + 0.85 * rnd(s, i + 120)) * easeOut(p);
    const size = r * (0.16 + 0.16 * rnd(s, i + 160)) * (0.7 + 0.9 * p);
    const col: Rgb = p < 0.35 ? [255, 214, 120] : p < 0.65 ? [255, 132, 46] : [205, 52, 26];
    glow(c, x + Math.cos(a) * d, y + Math.sin(a) * d - r * 0.25 * p, size, [
      [0, rgba(col, 0.95)],
      [0.5, rgba(col, 0.45)],
      [1, rgba(col, 0)],
    ], Math.pow(1 - p, 1.2));
  }

  c.globalCompositeOperation = 'source-over';
  const smoke = count(s, 8);
  for (let i = 0; i < smoke; i++) {
    const p = prog(te, 320 + rnd(s, i + 200) * 220, 1100);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 220) * TAU;
    const d = r * (0.3 + 0.6 * rnd(s, i + 240)) * easeOut(p);
    const size = r * (0.3 + 0.2 * rnd(s, i + 260)) * (0.6 + 0.8 * p);
    glow(c, x + Math.cos(a) * d, y + Math.sin(a) * d - r * 0.5 * p, size, [
      [0, 'rgba(45,34,30,0.5)'],
      [1, 'rgba(45,34,30,0)'],
    ], Math.sin(Math.PI * p) * 0.6);
  }

  c.globalCompositeOperation = 'lighter';
  const pw = prog(te, 0, 650);
  if (pw < 1) {
    ring(c, x, y, r * (0.25 + 1.35 * easeOut(pw)), Math.max(1.5 * v.u, r * 0.12 * (1 - pw)), 'rgb(255,190,100)', 0.85 * (1 - pw));
    ring(c, x, y, r * (0.2 + 1.1 * easeOut(pw)), Math.max(v.u, r * 0.04 * (1 - pw)), 'rgb(255,245,210)', 0.6 * (1 - pw));
  }

  const embers = count(s, 36);
  for (let i = 0; i < embers; i++) {
    const p = prog(te, 120 + rnd(s, i + 300) * 250, 900 + rnd(s, i + 340) * 650);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 380) * TAU;
    const d = r * (0.3 + 0.9 * rnd(s, i + 420)) * easeOut(p);
    const px = x + Math.cos(a) * d + Math.sin(te / 180 + i) * r * 0.04;
    const py = y + Math.sin(a) * d * 0.8 - r * 0.7 * p;
    const size = Math.max(1.2 * v.u, r * (0.018 + 0.022 * rnd(s, i + 460)));
    const alpha = (1 - p) * (0.55 + 0.45 * Math.sin(te / 45 + i * 1.7));
    glow(c, px, py, size * 4, [
      [0, 'rgba(255,150,60,0.6)'],
      [1, 'rgba(255,90,20,0)'],
    ], alpha * 0.6);
    dot(c, px, py, size, i % 3 ? '#ffb347' : '#ffe08a', alpha);
  }
}

// ---------------------------------------------------------------------------
// Ice: shard burst, crystalline frost ring, mist and glints
// ---------------------------------------------------------------------------

function drawIce(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  c.globalCompositeOperation = 'lighter';

  glow(c, x, y, r * 1.05, [
    [0, 'rgba(200,240,255,0.32)'],
    [0.7, 'rgba(120,200,255,0.18)'],
    [1, 'rgba(80,160,255,0)'],
  ], envelope(te, 200, 1100, D));

  const pf = prog(te, 0, 220);
  if (pf < 1) {
    glow(c, x, y, r * 0.9, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(170,230,255,0.8)'],
      [1, 'rgba(90,170,255,0)'],
    ], (1 - pf) * flashK(s));
  }

  const pr = prog(te, 0, 900);
  if (pr < 1) {
    const rr = r * (0.3 + 0.9 * easeOut(pr));
    const spikes = 28;
    c.beginPath();
    for (let k = 0; k <= spikes; k++) {
      const ang = (k / spikes) * TAU;
      const rad = rr * (k % 2 ? 0.92 - 0.06 * rnd(s, k + 10) : 1 + 0.06 * rnd(s, k + 50));
      const px = x + Math.cos(ang) * rad;
      const py = y + Math.sin(ang) * rad;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.globalAlpha = (1 - pr) * 0.2;
    c.fillStyle = 'rgb(160,225,255)';
    c.fill();
    c.globalAlpha = (1 - pr) * 0.9;
    c.lineWidth = Math.max(1.2 * v.u, r * 0.035);
    c.strokeStyle = '#c8f3ff';
    c.lineJoin = 'miter';
    c.stroke();
  }

  const shards = count(s, 14);
  for (let i = 0; i < shards; i++) {
    const p = prog(te, rnd(s, i) * 60, 700 + rnd(s, i + 20) * 250);
    if (p <= 0 || p >= 1) continue;
    const a = (i / shards) * TAU + rnd(s, i + 40) * 0.4;
    const d = r * (0.15 + 0.95 * easeOut(p)) * (0.7 + 0.3 * rnd(s, i + 60));
    const len = r * (0.2 + 0.2 * rnd(s, i + 80));
    const wid = len * 0.22;
    c.save();
    c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
    c.rotate(a + p * (rnd(s, i + 100) - 0.5) * 2);
    const g = c.createLinearGradient(-len * 0.4, 0, len * 0.6, 0);
    g.addColorStop(0, 'rgba(120,200,255,0.35)');
    g.addColorStop(1, 'rgba(242,253,255,1)');
    c.globalAlpha = 1 - p * p;
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(len * 0.6, 0);
    c.lineTo(0, wid / 2);
    c.lineTo(-len * 0.4, 0);
    c.lineTo(0, -wid / 2);
    c.closePath();
    c.fill();
    c.restore();
  }

  c.globalCompositeOperation = 'source-over';
  const mist = count(s, 10);
  for (let i = 0; i < mist; i++) {
    const p = prog(te, 150 + rnd(s, i + 120) * 250, 1500);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 140) * TAU;
    const d = r * (0.2 + 0.6 * rnd(s, i + 160)) + r * 0.25 * p;
    const size = r * (0.35 + 0.25 * rnd(s, i + 180)) * (0.8 + 0.5 * p);
    glow(c, x + Math.cos(a) * d, y + Math.sin(a) * d, size, [
      [0, 'rgba(225,245,255,0.5)'],
      [1, 'rgba(225,245,255,0)'],
    ], Math.sin(Math.PI * p) * 0.75);
  }

  c.globalCompositeOperation = 'lighter';
  const glints = count(s, 12);
  for (let i = 0; i < glints; i++) {
    const p = prog(te, 200 + rnd(s, i + 200) * 900, 500);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 220) * TAU;
    const d = r * Math.sqrt(rnd(s, i + 240)) * 0.95;
    sparkle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(2 * v.u, r * 0.08) * Math.sin(Math.PI * p), te / 400, '#ffffff', Math.sin(Math.PI * p));
  }
}

// ---------------------------------------------------------------------------
// Lightning: branching bolt from the caster (or from above), flash ring, sparks
// ---------------------------------------------------------------------------

const BOLT_FLICKER = [1, 0.35, 1, 0.6, 0.95, 0.3, 0.85, 0.5, 1];

function drawLightning(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  const fromCaster = s.fromX !== null && s.fromY !== null && Math.hypot(x - s.fromX, y - s.fromY) > r * 0.5;
  const ox = fromCaster ? s.fromX ?? x : x + (rnd(s, 1) - 0.5) * r * 1.2;
  const oy = fromCaster ? s.fromY ?? y : Math.min(v.top, y - r * 4) - r * 0.5;

  c.globalCompositeOperation = 'source-over';
  glow(c, x, y, r * 0.55, [
    [0, 'rgba(20,20,30,0.5)'],
    [1, 'rgba(20,20,30,0)'],
  ], 1 - prog(te, 300, D - 300));

  c.globalCompositeOperation = 'lighter';
  const BOLT_MS = 480;
  const FADE_MS = 260;
  if (te < BOLT_MS + FADE_MS) {
    const bucket = Math.floor(te / 55);
    const rng = mulberry32(s.seed + bucket * 7919);
    const flick = te < BOLT_MS ? (BOLT_FLICKER[bucket % BOLT_FLICKER.length] ?? 1) * (s.reduced ? 0.7 : 1) : 1 - (te - BOLT_MS) / FADE_MS;
    const dist = Math.hypot(x - ox, y - oy);
    const main = boltPath(ox, oy, x, y, rng, dist * 0.18, 6);
    strokeBolt(c, main, r, v.u, flick);
    const branches = count(s, 3);
    const segs = main.length / 2;
    for (let b = 0; b < branches; b++) {
      const idx = Math.floor(segs * (0.3 + 0.5 * rng()));
      const px = main[idx * 2] ?? x;
      const py = main[idx * 2 + 1] ?? y;
      const dirA = Math.atan2(y - oy, x - ox) + (rng() < 0.5 ? -1 : 1) * (0.4 + 0.5 * rng());
      const len = dist * (0.15 + 0.15 * rng());
      const path = boltPath(px, py, px + Math.cos(dirA) * len, py + Math.sin(dirA) * len, rng, len * 0.25, 4);
      strokeBolt(c, path, r * 0.5, v.u, flick * 0.7);
    }
  }

  const pf = prog(te, 0, 280);
  if (pf < 1) {
    glow(c, x, y, r * 1.4, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(200,225,255,0.8)'],
      [1, 'rgba(110,170,255,0)'],
    ], Math.pow(1 - pf, 2) * 0.9 * flashK(s));
  }
  const pr = prog(te, 30, 600);
  if (pr > 0 && pr < 1) ring(c, x, y, r * (0.2 + 1.15 * easeOut(pr)), Math.max(1.5 * v.u, r * 0.07 * (1 - pr)), '#dff1ff', (1 - pr) * 0.9);

  const sparks = count(s, 22);
  c.lineCap = 'round';
  for (let i = 0; i < sparks; i++) {
    const p = prog(te, rnd(s, i + 300) * 80, 450 + rnd(s, i + 330) * 400);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 360) * TAU;
    const d0 = r * (0.1 + 1.2 * rnd(s, i + 390)) * easeOut(p);
    const d1 = Math.max(0, d0 - r * 0.14 * (1 - p));
    c.globalAlpha = 1 - p;
    c.strokeStyle = '#e6f4ff';
    c.lineWidth = Math.max(v.u, r * 0.02);
    c.beginPath();
    c.moveTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
    c.lineTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
    c.stroke();
  }
}

// ---------------------------------------------------------------------------
// Heal: soft glow ring + rising green sparkles
// ---------------------------------------------------------------------------

function drawHeal(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  const e = envelope(te, 300, 1500, D);
  c.globalCompositeOperation = 'lighter';

  glow(c, x, y, r * 1.1, [
    [0, 'rgba(140,255,170,0.35)'],
    [0.6, 'rgba(60,200,110,0.18)'],
    [1, 'rgba(30,160,80,0)'],
  ], e);
  const pulse = 0.5 + 0.5 * Math.sin(te / 160);
  ring(c, x, y, r * (0.9 + 0.05 * pulse), Math.max(1.5 * v.u, r * 0.04), 'rgb(140,255,170)', e * (0.5 + 0.4 * pulse));

  c.save();
  c.setLineDash([r * 0.12, r * 0.08]);
  c.lineDashOffset = -(te / 1000) * r * 0.6;
  ring(c, x, y, r * 0.72, Math.max(v.u, r * 0.02), 'rgb(255,229,138)', e * 0.7);
  c.restore();

  const pr = prog(te, 0, 600);
  if (pr < 1) ring(c, x, y, r * (0.2 + 0.9 * easeOut(pr)), Math.max(1.5 * v.u, r * 0.06 * (1 - pr)), '#eaffd8', (1 - pr) * 0.9);

  const n = count(s, 40);
  for (let i = 0; i < n; i++) {
    const st = rnd(s, i) * (D - 900);
    const p = prog(te, st, 700 + rnd(s, i + 40) * 500);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 80) * TAU;
    const d = r * 0.9 * Math.sqrt(rnd(s, i + 120));
    const px = x + Math.cos(a) * d + Math.sin(te / 300 + i) * r * 0.03;
    const py = y + Math.sin(a) * d * 0.85 - r * (0.2 + 0.9 * rnd(s, i + 160)) * p;
    const size = Math.max(1.5 * v.u, r * (0.035 + 0.04 * rnd(s, i + 200))) * Math.sin(Math.PI * p);
    sparkle(c, px, py, size, te / 500 + i, i % 4 === 0 ? '#ffe58a' : '#9dffb5', Math.sin(Math.PI * p));
  }

  const crosses = count(s, 5);
  for (let i = 0; i < crosses; i++) {
    const p = prog(te, 150 + i * 260, 1100);
    if (p <= 0 || p >= 1) continue;
    const px = x + (rnd(s, i + 240) - 0.5) * r * 1.2;
    const py = y + (rnd(s, i + 260) - 0.3) * r * 0.6 - r * 0.7 * p;
    const size = r * 0.11;
    const w = size * 0.32;
    c.globalAlpha = Math.sin(Math.PI * p) * 0.85;
    c.fillStyle = 'rgb(160,255,185)';
    c.fillRect(px - w / 2, py - size, w, size * 2);
    c.fillRect(px - size, py - w / 2, size * 2, w);
  }
}

// ---------------------------------------------------------------------------
// Arcane: expanding runic circle + orbiting sparks
// ---------------------------------------------------------------------------

function drawArcane(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  const grow = easeOutBack(prog(te, 0, 520));
  const fade = 1 - prog(te, D - 600, 600);
  const alpha = prog(te, 0, 200) * fade;
  const rot = (te / 1000) * 0.9;
  c.globalCompositeOperation = 'lighter';

  glow(c, x, y, r * 1.15 * Math.max(0.01, grow), [
    [0, 'rgba(170,130,255,0.32)'],
    [0.7, 'rgba(120,80,240,0.14)'],
    [1, 'rgba(90,50,220,0)'],
  ], alpha);

  if (grow > 0.01 && alpha > 0.01) {
    const R = r * grow;
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.globalAlpha = alpha;
    c.strokeStyle = '#c9b0ff';
    c.lineWidth = Math.max(1.5 * v.u, r * 0.03);
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.stroke();
    c.lineWidth = Math.max(v.u, r * 0.014);
    c.beginPath();
    c.arc(0, 0, R * 0.86, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, R * 0.36, 0, TAU);
    c.stroke();
    c.beginPath();
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU;
      const inner = R * (k % 4 === 0 ? 0.88 : 0.93);
      c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      c.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
    }
    c.lineWidth = Math.max(v.u, r * 0.01);
    c.stroke();
    c.lineWidth = Math.max(v.u, r * 0.016);
    c.strokeStyle = '#e2d4ff';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      c.save();
      c.translate(Math.cos(a) * R * 0.73, Math.sin(a) * R * 0.73);
      c.rotate(a + Math.PI / 2);
      rune(c, k + Math.floor(rnd(s, 7) * 6), R * 0.07);
      c.restore();
    }
    c.rotate(-rot * 2.4);
    c.strokeStyle = '#b593ff';
    starPolygon(c, 7, 3, R * 0.62);
    c.stroke();
    c.restore();
  }

  const n = count(s, 14);
  const spiral = prog(te, D - 900, 500);
  const sparkAlpha = alpha * (1 - prog(te, D - 400, 300));
  for (let i = 0; i < n; i++) {
    const base = (i / n) * TAU;
    const ang = base + (te / 1000) * (2.4 + rnd(s, i) * 1.2);
    const rad = r * (0.98 - 0.85 * easeIn(spiral)) * Math.max(0, grow);
    for (let k = 0; k < 5; k++) {
      const a = ang - k * 0.09;
      const f = 1 - k / 5;
      dot(c, x + Math.cos(a) * rad, y + Math.sin(a) * rad, Math.max(1.2 * v.u, r * 0.035 * f), k === 0 ? '#ffffff' : '#c4a6ff', sparkAlpha * f);
    }
  }

  const pp = prog(te, D - 420, 380);
  if (pp > 0 && pp < 1) {
    glow(c, x, y, r * (0.3 + 0.9 * easeOut(pp)), [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(200,170,255,0.9)'],
      [1, 'rgba(130,90,255,0)'],
    ], (1 - pp) * flashK(s));
    ring(c, x, y, r * (0.3 + 1.1 * easeOut(pp)), Math.max(1.5 * v.u, r * 0.05 * (1 - pp)), '#d9c7ff', 1 - pp);
  }
}

// ---------------------------------------------------------------------------
// Poison: lingering green cloud puffs + bubbles
// ---------------------------------------------------------------------------

const POISON_TONES: Rgb[] = [
  [190, 235, 90],
  [120, 200, 70],
  [80, 150, 50],
];

function drawPoison(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  c.globalCompositeOperation = 'source-over';

  glow(c, x, y, r * 0.85, [
    [0, 'rgba(40,70,20,0.35)'],
    [1, 'rgba(40,70,20,0)'],
  ], envelope(te, 300, 1600, D));

  const puffs = count(s, 16);
  for (let i = 0; i < puffs; i++) {
    const st = rnd(s, i) * 450;
    const p = prog(te, st, D - st);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 30) * TAU;
    const d = r * 0.65 * Math.sqrt(rnd(s, i + 60)) + r * 0.18 * p;
    const drift = Math.sin(te / 700 + i) * r * 0.05;
    const size = r * (0.3 + 0.25 * rnd(s, i + 90)) * (0.55 + 0.55 * easeOut(Math.min(1, p * 2.5)));
    const life = Math.min(1, p * 5) * (p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1);
    const tone = POISON_TONES[i % POISON_TONES.length]!;
    glow(c, x + Math.cos(a) * d + drift, y + Math.sin(a) * d, size, [
      [0, rgba(tone, 0.55)],
      [0.55, rgba(tone, 0.3)],
      [1, rgba(tone, 0)],
    ], life * 0.8);
  }

  c.globalCompositeOperation = 'lighter';
  const bubbles = count(s, 18);
  for (let i = 0; i < bubbles; i++) {
    const st = 100 + rnd(s, i + 120) * (D - 900);
    const p = prog(te, st, 600 + rnd(s, i + 150) * 350);
    if (p <= 0 || p >= 1) continue;
    const bx = x + (rnd(s, i + 180) - 0.5) * r * 1.4;
    const by = y + (rnd(s, i + 210) - 0.5) * r * 1.1 - r * 0.3 * p;
    const br = Math.max(1.2 * v.u, r * (0.03 + 0.04 * rnd(s, i + 240))) * (0.6 + 0.6 * p);
    const lw = Math.max(0.8 * v.u, r * 0.008);
    if (p < 0.88) {
      ring(c, bx, by, br, lw, '#d8ff8a', 0.75);
      dot(c, bx - br * 0.35, by - br * 0.35, br * 0.22, '#f4ffd0', 0.7);
    } else {
      const q = (p - 0.88) / 0.12;
      ring(c, bx, by, br * (1 + 1.5 * q), lw, '#eaffb0', 1 - q);
    }
  }

  const motes = count(s, 14);
  for (let i = 0; i < motes; i++) {
    const p = prog(te, 200 + rnd(s, i + 270) * 1200, 900);
    if (p <= 0 || p >= 1) continue;
    const px = x + (rnd(s, i + 300) - 0.5) * r * 1.5 + Math.sin(te / 260 + i) * r * 0.05;
    const py = y + (rnd(s, i + 330) - 0.5) * r * 1.2 - r * 0.4 * p;
    dot(c, px, py, Math.max(1.2 * v.u, r * 0.02), '#e9ff9a', Math.sin(Math.PI * p) * (0.5 + 0.5 * Math.sin(te / 60 + i)));
  }
}

// ---------------------------------------------------------------------------
// Holy: golden beam from above + radiant rays
// ---------------------------------------------------------------------------

function drawHoly(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  const top = Math.min(v.top, y - r * 5) - r;
  c.globalCompositeOperation = 'lighter';

  const be = envelope(te, 180, 900, 1500);
  if (be > 0) {
    const bw = r * (0.62 - 0.22 * prog(te, 0, 1500));
    const layers: [number, number, string][] = [
      [bw * 2.2, 0.22, 'rgba(255,225,140,1)'],
      [bw, 0.55, 'rgba(255,225,140,1)'],
      [bw * 0.35, 0.9, 'rgba(255,255,240,1)'],
    ];
    for (const [w, a, center] of layers) {
      const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, 'rgba(255,220,120,0)');
      g.addColorStop(0.5, center);
      g.addColorStop(1, 'rgba(255,220,120,0)');
      c.globalAlpha = be * a;
      c.fillStyle = g;
      c.fillRect(x - w / 2, top, w, y - top);
    }
  }

  glow(c, x, y, r * 1.25, [
    [0, 'rgba(255,245,200,0.6)'],
    [0.4, 'rgba(255,215,110,0.3)'],
    [1, 'rgba(240,180,60,0)'],
  ], envelope(te, 200, 1200, D));

  const re = envelope(te, 250, 1300, D);
  const rays = count(s, 12);
  if (re > 0) {
    c.save();
    c.translate(x, y);
    c.rotate((te / 1000) * 0.35);
    const reach = easeOut(prog(te, 100, 500));
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      const len = r * (1 + 0.6 * rnd(s, i + 20)) * reach;
      if (len <= 0.01) continue;
      const half = 0.05 + 0.03 * rnd(s, i + 40);
      const g = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,240,190,0.85)');
      g.addColorStop(1, 'rgba(255,200,90,0)');
      c.globalAlpha = re * (0.6 + 0.4 * Math.sin(te / 200 + i));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - half) * len, Math.sin(a - half) * len);
      c.lineTo(Math.cos(a + half) * len, Math.sin(a + half) * len);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  const pf = prog(te, 100, 300);
  if (pf > 0 && pf < 1) {
    glow(c, x, y, r * 0.9, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,230,150,0.8)'],
      [1, 'rgba(255,200,90,0)'],
    ], (1 - pf) * 0.9 * flashK(s));
  }
  const pr = prog(te, 120, 520);
  if (pr > 0 && pr < 1) ring(c, x, y, r * (0.3 + 1.1 * easeOut(pr)), Math.max(1.5 * v.u, r * 0.06 * (1 - pr)), '#fff1c4', 1 - pr);

  const motes = count(s, 26);
  for (let i = 0; i < motes; i++) {
    const st = rnd(s, i + 60) * (D - 800);
    const p = prog(te, st, 800);
    if (p <= 0 || p >= 1) continue;
    const px = x + (rnd(s, i + 90) - 0.5) * r * 1.6;
    const py = y + (rnd(s, i + 120) - 0.2) * r * 0.8 - r * 0.8 * p;
    sparkle(c, px, py, Math.max(1.5 * v.u, r * 0.045) * Math.sin(Math.PI * p), i, '#ffe9a0', Math.sin(Math.PI * p));
  }
}

// ---------------------------------------------------------------------------
// Shadow: dark swirling tendrils + purple sparks
// ---------------------------------------------------------------------------

function drawShadow(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  const { x, y, radius: r } = s;
  const D = s.durationMs;
  const e = envelope(te, 350, 1500, D);
  c.globalCompositeOperation = 'source-over';

  const coreR = r * (0.45 + 0.55 * easeOut(prog(te, 0, 600))) * (1 - 0.35 * prog(te, D - 700, 700));
  glow(c, x, y, coreR * 1.3, [
    [0, 'rgba(8,2,16,0.85)'],
    [0.5, 'rgba(40,12,70,0.55)'],
    [1, 'rgba(60,20,110,0)'],
  ], e);

  const pr = prog(te, 0, 700);
  if (pr < 1) ring(c, x, y, r * (0.2 + 1.2 * easeOut(pr)), Math.max(2 * v.u, r * 0.1 * (1 - pr)), 'rgb(30,10,60)', (1 - pr) * 0.7);

  const tendrils = count(s, 8);
  const grow = easeOut(prog(te, 0, 600));
  const retract = prog(te, D - 700, 600);
  const reach = grow * (1 - retract);
  if (reach > 0.02) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.shadowColor = 'rgba(140,80,230,0.9)';
    c.shadowBlur = s.reduced ? 0 : 10;
    const steps = 16;
    const chunks = 4;
    for (let i = 0; i < tendrils; i++) {
      const base = (i / tendrils) * TAU + rnd(s, i) * 0.5;
      const swirl = 1.6 + rnd(s, i + 20) * 1.2;
      const pts: number[] = [];
      for (let k = 0; k <= steps; k++) {
        const sk = (k / steps) * reach;
        const rho = r * (1.15 - sk * 0.95);
        const phi = base + swirl * sk + (te / 1000) * 1.3 + Math.sin(te / 250 + i + k * 0.5) * 0.12;
        pts.push(x + Math.cos(phi) * rho, y + Math.sin(phi) * rho * 0.92);
      }
      for (let ch = 0; ch < chunks; ch++) {
        const from = Math.floor((ch * steps) / chunks);
        const to = Math.floor(((ch + 1) * steps) / chunks);
        c.beginPath();
        for (let k = from; k <= to; k++) {
          const px = pts[k * 2]!;
          const py = pts[k * 2 + 1]!;
          if (k === from) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.globalAlpha = e;
        c.strokeStyle = ch < 2 ? 'rgba(30,8,55,0.92)' : 'rgba(78,30,130,0.88)';
        c.lineWidth = Math.max(v.u, r * (0.075 * (1 - ch / chunks) + 0.012));
        c.stroke();
      }
    }
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
  }

  c.globalCompositeOperation = 'lighter';
  const sparks = count(s, 24);
  for (let i = 0; i < sparks; i++) {
    const st = 80 + rnd(s, i + 40) * (D - 900);
    const p = prog(te, st, 700 + rnd(s, i + 70) * 400);
    if (p <= 0 || p >= 1) continue;
    const a = rnd(s, i + 100) * TAU + te / 900;
    const d = r * (0.2 + 0.9 * rnd(s, i + 130)) * (0.4 + 0.6 * p);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    const size = Math.max(1.2 * v.u, r * 0.03);
    const alpha = Math.sin(Math.PI * p) * (0.5 + 0.5 * Math.sin(te / 40 + i * 2.1));
    glow(c, px, py, size * 3.5, [
      [0, 'rgba(176,124,255,0.7)'],
      [1, 'rgba(122,63,209,0)'],
    ], alpha * 0.7);
    dot(c, px, py, size, '#d9b8ff', alpha);
  }
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

function drawLabel(c: CanvasRenderingContext2D, s: SpellInstance, te: number, v: SpellView): void {
  if (!s.label) return;
  const p = prog(te, 0, LABEL_MS);
  if (p >= 1) return;
  const alpha = Math.min(1, p * 6) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
  const size = 15 * v.u;
  const ty = s.y - s.radius - 10 * v.u - 12 * v.u * easeOut(p);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = alpha;
  c.font = `700 ${size}px ${FONT_DISPLAY}`;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.lineJoin = 'round';
  c.lineWidth = 4 * v.u;
  c.strokeStyle = 'rgba(11,10,8,0.92)';
  c.strokeText(s.label, s.x, ty);
  c.fillStyle = PALETTE[s.animation].label;
  c.fillText(s.label, s.x, ty);
}
