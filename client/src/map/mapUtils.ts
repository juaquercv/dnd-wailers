import { useSyncExternalStore } from 'react';
import type Konva from 'konva';
import { STATUSES, type StatusDef } from '@wailers/shared';

/** Theme colors used on the canvas (mirrors the Tailwind palette). */
export const MAP_COLORS = {
  ink950: '#0b0a08',
  ink900: '#13110e',
  ink800: '#1c1915',
  ink700: '#27231d',
  ink600: '#36302a',
  ink500: '#4a4239',
  parchment50: '#fbf6ea',
  parchment100: '#f3ead6',
  parchment200: '#e6d8b8',
  parchment300: '#cdb98f',
  parchment400: '#a8946b',
  gold300: '#f3d58a',
  gold400: '#e9c063',
  gold500: '#d4a63f',
  gold600: '#b0852b',
  gold700: '#7d5d1d',
  blood400: '#e0625a',
  blood500: '#c43d33',
  blood600: '#9b2c24',
  arcane400: '#a98bff',
  arcane500: '#8a63f0',
  emerald400: '#34d399',
  emerald500: '#10b981',
  sky300: '#7dd3fc',
  sky400: '#38bdf8',
  door: '#b0773a',
  doorDark: '#6b4220',
  window: '#7fd6ff',
  tempHp: '#60a5fa',
} as const;

export const FONT_SANS = 'Inter, "Segoe UI", system-ui, sans-serif';
export const FONT_DISPLAY = 'Cinzel, Georgia, "Times New Roman", serif';
export const FONT_EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

/** Stage attr set by MapStage while a pan gesture/mode owns the cursor. */
export const PAN_CURSOR_ATTR = 'wailersPanCursor';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** FNV-1a 32-bit hash. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const colorCache = new Map<string, Rgba | null>();
let colorCtx: CanvasRenderingContext2D | null | undefined;

function parseHex(hex: string): Rgba | null {
  const h = hex.slice(1);
  if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-f]/i.test(h)) return null;
  const full = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseRgbFunc(value: string): Rgba | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value);
  if (!m) return null;
  const alphaRaw = m[4];
  let a = 1;
  if (alphaRaw !== undefined) a = alphaRaw.endsWith('%') ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: clamp(a, 0, 1) };
}

/** Parses any CSS color (hex, rgb(a), named) into RGBA. Null when unparseable. */
export function parseColor(color: string | null | undefined): Rgba | null {
  if (!color) return null;
  const key = color.trim().toLowerCase();
  const cached = colorCache.get(key);
  if (cached !== undefined) return cached;
  let out: Rgba | null = null;
  if (key === 'transparent') out = { r: 0, g: 0, b: 0, a: 0 };
  else if (key.startsWith('#')) out = parseHex(key);
  else if (key.startsWith('rgb')) out = parseRgbFunc(key);
  if (!out && typeof document !== 'undefined') {
    if (colorCtx === undefined) colorCtx = document.createElement('canvas').getContext('2d');
    if (colorCtx) {
      colorCtx.fillStyle = '#010203';
      colorCtx.fillStyle = key;
      const normalized = String(colorCtx.fillStyle);
      if (normalized !== '#010203' || key === '#010203') {
        out = normalized.startsWith('#') ? parseHex(normalized) : parseRgbFunc(normalized);
      }
    }
  }
  colorCache.set(key, out);
  return out;
}

export function rgbaString(c: Rgba): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(c.a.toFixed(3))})`;
}

/** Same color with a new alpha (multiplied with the original alpha). */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return rgbaString({ ...c, a: clamp(c.a * alpha, 0, 1) });
}

/** amount > 0 lightens towards white, < 0 darkens towards black. */
export function shadeColor(color: string, amount: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const t = clamp(Math.abs(amount), 0, 1);
  const target = amount >= 0 ? 255 : 0;
  return rgbaString({ r: lerp(c.r, target, t), g: lerp(c.g, target, t), b: lerp(c.b, target, t), a: c.a });
}

export function isOpaqueColor(color: string | null | undefined): boolean {
  const c = parseColor(color);
  return !!c && c.a >= 0.999;
}

/** Perceived luminance 0..1. */
export function luminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0.5;
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/** HP color: green (full) -> yellow (half) -> red (empty). */
export function hpColor(ratio: number): string {
  const r = clamp(ratio, 0, 1);
  const hue = Math.round(r * 120);
  const light = 44 + Math.round((1 - Math.abs(r - 0.5) * 2) * 6);
  return `hsl(${hue}, 78%, ${light}%)`;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] ?? '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();

/** Width in px of a single text line rendered with the given font. */
export function measureTextWidth(text: string, fontSize: number, fontFamily: string, fontStyle = 'normal'): number {
  const key = `${fontStyle}|${fontSize}|${fontFamily}|${text}`;
  const cached = measureCache.get(key);
  if (cached !== undefined) return cached;
  if (measureCtx === undefined && typeof document !== 'undefined') {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  let width = text.length * fontSize * 0.58;
  if (measureCtx) {
    measureCtx.font = `${fontStyle} ${fontSize}px ${fontFamily}`;
    width = measureCtx.measureText(text).width;
  }
  if (measureCache.size > 4000) measureCache.clear();
  measureCache.set(key, width);
  return width;
}

/** Bounding size of a (possibly multi-line) text block. */
export function measureTextBlock(
  text: string,
  fontSize: number,
  fontFamily: string,
  lineHeight = 1.15,
  fontStyle = 'normal',
): { width: number; height: number } {
  const lines = text.split('\n');
  let width = 0;
  for (const line of lines) width = Math.max(width, measureTextWidth(line, fontSize, fontFamily, fontStyle));
  return { width, height: lines.length * fontSize * lineHeight };
}

let fontsVersion = 0;
const fontListeners = new Set<() => void>();
let fontsBound = false;

function bindFontEvents(): void {
  if (fontsBound || typeof document === 'undefined' || !('fonts' in document)) return;
  fontsBound = true;
  const bump = () => {
    fontsVersion += 1;
    measureCache.clear();
    for (const l of [...fontListeners]) l();
  };
  document.fonts.addEventListener('loadingdone', bump);
  void document.fonts.ready.then(bump);
}

function subscribeFonts(listener: () => void): () => void {
  bindFontEvents();
  fontListeners.add(listener);
  return () => {
    fontListeners.delete(listener);
  };
}

/** Increments whenever web fonts finish loading; use it as a key for Konva Text nodes so they re-measure. */
export function useFontsVersion(): number {
  return useSyncExternalStore(
    subscribeFonts,
    () => fontsVersion,
    () => fontsVersion,
  );
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointsBounds(points: number[]): Bounds {
  if (points.length < 2) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Area centroid of a flat polygon (falls back to the vertex average for degenerate polygons). */
export function polygonCentroid(points: number[]): { x: number; y: number } {
  const n = Math.floor(points.length / 2);
  if (n === 0) return { x: 0, y: 0 };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const x0 = points[i * 2] ?? 0;
    const y0 = points[i * 2 + 1] ?? 0;
    const j = (i + 1) % n;
    const x1 = points[j * 2] ?? 0;
    const y1 = points[j * 2 + 1] ?? 0;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += points[i * 2] ?? 0;
      sy += points[i * 2 + 1] ?? 0;
    }
    return { x: sx / n, y: sy / n };
  }
  area *= 0.5;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Point halfway along a polyline, with the direction (degrees) of the segment it lies on. */
export function polylineMidpoint(points: number[]): { x: number; y: number; angle: number } {
  const n = Math.floor(points.length / 2);
  if (n === 0) return { x: 0, y: 0, angle: 0 };
  if (n === 1) return { x: points[0] ?? 0, y: points[1] ?? 0, angle: 0 };
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    total += Math.hypot((points[i * 2 + 2] ?? 0) - (points[i * 2] ?? 0), (points[i * 2 + 3] ?? 0) - (points[i * 2 + 1] ?? 0));
  }
  let remaining = total / 2;
  for (let i = 0; i < n - 1; i++) {
    const ax = points[i * 2] ?? 0;
    const ay = points[i * 2 + 1] ?? 0;
    const bx = points[i * 2 + 2] ?? 0;
    const by = points[i * 2 + 3] ?? 0;
    const len = Math.hypot(bx - ax, by - ay);
    if (remaining <= len || i === n - 2) {
      const t = len > 0 ? clamp(remaining / len, 0, 1) : 0;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI };
    }
    remaining -= len;
  }
  return { x: points[0] ?? 0, y: points[1] ?? 0, angle: 0 };
}

/** Crop rectangle so an image fills (cover) a w x h box without distortion. */
export function coverCrop(
  image: HTMLImageElement,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih || width <= 0 || height <= 0) return undefined;
  const target = width / height;
  const source = iw / ih;
  if (Math.abs(target - source) < 0.001) return { x: 0, y: 0, width: iw, height: ih };
  if (source > target) {
    const cw = ih * target;
    return { x: (iw - cw) / 2, y: 0, width: cw, height: ih };
  }
  const ch = iw / target;
  return { x: 0, y: (ih - ch) / 2, width: iw, height: ch };
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const ICON_EMOJI: Record<string, string> = {
  'map-pin': '📍',
  pin: '📍',
  skull: '💀',
  castle: '🏰',
  tent: '⛺',
  swords: '⚔️',
  sword: '🗡️',
  shield: '🛡️',
  star: '⭐',
  flag: '🚩',
  home: '🏠',
  house: '🏠',
  trees: '🌲',
  tree: '🌳',
  'tree-pine': '🌲',
  mountain: '⛰️',
  'mountain-snow': '🏔️',
  gem: '💎',
  key: '🔑',
  scroll: '📜',
  'scroll-text': '📜',
  crown: '👑',
  anchor: '⚓',
  flame: '🔥',
  fire: '🔥',
  droplet: '💧',
  droplets: '💧',
  waves: '🌊',
  eye: '👁️',
  'door-open': '🚪',
  'door-closed': '🚪',
  door: '🚪',
  'help-circle': '❓',
  'circle-help': '❓',
  'alert-triangle': '⚠️',
  'triangle-alert': '⚠️',
  info: 'ℹ️',
  coins: '🪙',
  beer: '🍺',
  church: '⛪',
  ship: '⛵',
  sailboat: '⛵',
  sparkles: '✨',
  wand: '🪄',
  'wand-sparkles': '🪄',
  book: '📖',
  'book-open': '📖',
  heart: '❤️',
  moon: '🌙',
  sun: '☀️',
  ghost: '👻',
  bone: '🦴',
  'chest': '🧰',
  'package': '📦',
  'shopping-bag': '👜',
  store: '🏪',
  landmark: '🏛️',
  'tower-control': '🗼',
  bed: '🛏️',
  utensils: '🍴',
  hammer: '🔨',
  pickaxe: '⛏️',
  'footprints': '👣',
  compass: '🧭',
  map: '🗺️',
  lock: '🔒',
  unlock: '🔓',
  bell: '🔔',
  music: '🎵',
  user: '🧑',
  users: '👥',
  dragon: '🐉',
  bug: '🐛',
  'paw-print': '🐾',
  cross: '✝️',
  zap: '⚡',
  snowflake: '❄️',
  cloud: '☁️',
  tornado: '🌪️',
};

/** Marker icons are emojis or lucide icon names; lucide names are mapped to an emoji for canvas rendering. */
export function iconToEmoji(icon: string | null | undefined, fallback = '📍'): string {
  const value = (icon ?? '').trim();
  if (!value) return fallback;
  if (/^[a-z0-9-]+$/i.test(value)) return ICON_EMOJI[value.toLowerCase()] ?? fallback;
  return value;
}

const STATUS_BY_KEY = new Map<string, StatusDef>(STATUSES.map((s) => [s.key, s]));

export function statusInfo(key: string): StatusDef {
  return STATUS_BY_KEY.get(key) ?? { key, label: key, icon: key.charAt(0).toUpperCase() || '•', color: MAP_COLORS.parchment300 };
}

// ---------------------------------------------------------------------------
// Konva helpers
// ---------------------------------------------------------------------------

/** Sets the stage cursor unless a pan mode currently owns it. */
export function setStageCursor(node: Konva.Node | null | undefined, cursor: string): void {
  const stage = node?.getStage();
  if (!stage) return;
  const panCursor: unknown = stage.getAttr(PAN_CURSOR_ATTR);
  const container = stage.container();
  container.style.cursor = typeof panCursor === 'string' && panCursor ? panCursor : cursor || 'default';
}

/** Visible world rectangle (in the local coordinates of `node`) for the node's stage viewport. */
export function visibleLocalRect(node: Konva.Node): Bounds | null {
  const stage = node.getStage();
  if (!stage) return null;
  const inv = node.getAbsoluteTransform().copy().invert();
  const corners = [
    inv.point({ x: 0, y: 0 }),
    inv.point({ x: stage.width(), y: 0 }),
    inv.point({ x: 0, y: stage.height() }),
    inv.point({ x: stage.width(), y: stage.height() }),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Absolute (screen) scale of a node, ignoring sign. */
export function absoluteScale(node: Konva.Node): number {
  const s = node.getAbsoluteScale();
  return Math.max(1e-6, Math.abs(s.x));
}
