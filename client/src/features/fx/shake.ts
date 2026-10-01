import { useSettingsStore } from '../../stores/settings';
import { ensureFxStyles } from './fxStyles';

export const GAME_VIEWPORT_ID = 'game-viewport';
const SHAKE_CLASS = 'wailers-fx-shake';
const MIN_MS = 150;
const MAX_MS = 4000;

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Shake intensity of an FxEvent normalized to 0..1 (values above 1 are read on a 0..10 scale). */
export function normalizeShakeIntensity(intensity: number): number {
  if (!Number.isFinite(intensity) || intensity <= 0) return 0;
  return Math.min(1, intensity > 1 ? intensity / 10 : intensity);
}

/** Restartable CSS shake on any element (decaying translation + slight rotation). */
export function shakeElement(el: HTMLElement, intensity: number, durationMs: number): void {
  const n = normalizeShakeIntensity(intensity);
  if (n <= 0) return;
  ensureFxStyles();
  const duration = Math.min(MAX_MS, Math.max(MIN_MS, Number.isFinite(durationMs) ? durationMs : 500));
  el.style.setProperty('--wfx-amp', `${(2 + 22 * n).toFixed(1)}px`);
  el.style.setProperty('--wfx-rot', `${(0.12 + 0.75 * n).toFixed(2)}deg`);
  el.style.setProperty('--wfx-dur', `${Math.round(duration)}ms`);
  el.classList.remove(SHAKE_CLASS);
  void el.offsetWidth; // reflow so the animation restarts
  el.classList.add(SHAKE_CLASS);
  const prev = timers.get(el);
  if (prev) clearTimeout(prev);
  timers.set(
    el,
    setTimeout(() => {
      el.classList.remove(SHAKE_CLASS);
      timers.delete(el);
    }, duration + 60),
  );
}

/** Shakes the game viewport (#game-viewport). No-op with reduced motion or outside the game screen. */
export function shakeViewport(intensity: number, durationMs: number): void {
  if (typeof document === 'undefined' || useSettingsStore.getState().reducedMotion) return;
  const el = document.getElementById(GAME_VIEWPORT_ID);
  if (el) shakeElement(el, intensity, durationMs);
}
