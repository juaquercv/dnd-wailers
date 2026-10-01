import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Skull } from 'lucide-react';
import type { FxEvent } from '@wailers/shared';
import { useSettingsStore } from '../../stores/settings';
import { audioEngine } from '../audio/audioEngine';
import { uiSounds } from '../audio/uiSounds';
import { ensureFxStyles } from './fxStyles';
import { shakeElement, shakeViewport } from './shake';
import { WeatherRenderer } from './weather';

export type BossFx = Extract<FxEvent, { kind: 'boss' }>;

export interface BossIntroProps {
  fx: BossFx;
  /** Called once the exit fade finished (the host unmounts the intro). */
  onDone: () => void;
}

/** Total on-screen time (exit fade included). */
const SHOW_MS = 5200;
const EXIT_MS = 700;
const SKIP_EXIT_MS = 380;
/** Moment the portrait slams in (flash + shake). */
const IMPACT_MS = 700;
const REVEAL_SOUND_MS = 780;

const VIGNETTE: CSSProperties = {
  background:
    'radial-gradient(ellipse at 50% 46%, rgba(80, 14, 8, 0.32) 0%, rgba(14, 5, 3, 0.62) 42%, rgba(0, 0, 0, 0.97) 100%)',
};

const HEAT: CSSProperties = {
  background: 'linear-gradient(to top, rgba(196, 61, 51, 0.3) 0%, rgba(196, 61, 51, 0.08) 45%, rgba(196, 61, 51, 0) 100%)',
  animation: 'wfx-pulse-soft 2.8s ease-in-out infinite',
};

const AURA: CSSProperties = {
  background:
    'radial-gradient(circle at 50% 50%, rgba(255, 196, 92, 0.32) 0%, rgba(224, 98, 90, 0.22) 30%, rgba(155, 44, 36, 0.1) 55%, rgba(0, 0, 0, 0) 72%)',
  animation: 'wfx-fade-in 900ms ease-out 450ms both, wfx-pulse-soft 2.4s ease-in-out 1.4s infinite',
};

const FLASH: CSSProperties = {
  background:
    'radial-gradient(circle at 50% 45%, rgba(255, 246, 214, 0.97) 0%, rgba(243, 213, 138, 0.82) 26%, rgba(224, 98, 90, 0.62) 58%, rgba(110, 31, 25, 0.35) 100%)',
  animation: `wfx-flash 950ms ease-out ${IMPACT_MS - 120}ms both`,
};

const NAME_GRADIENT: CSSProperties = {
  backgroundImage:
    'linear-gradient(180deg, #fffbe9 0%, #fbe7b0 18%, #f3c14f 40%, #ea8f2e 64%, #c0391f 86%, #7a1810 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
};

const NAME_SHADOW: CSSProperties = {
  filter:
    'drop-shadow(0 3px 0 rgba(0, 0, 0, 0.8)) drop-shadow(0 0 20px rgba(224, 98, 90, 0.55)) drop-shadow(0 0 56px rgba(233, 140, 40, 0.35))',
};

/** Font size that keeps long names inside the screen. */
function nameFontSize(name: string): string {
  const vw = Math.min(7.5, 128 / Math.max(10, name.length));
  return `clamp(2.1rem, ${vw.toFixed(2)}vw, 6.5rem)`;
}

/**
 * Cinematic boss entrance (fixed fullscreen, ~5 s): dark vignette, letterbox bars, red/gold flash,
 * portrait slamming in with a pulsing glow, the name in huge fiery Cinzel, embers and a strong shake.
 * Clicking anywhere (or Esc) skips it.
 */
export function BossIntro({ fx, onDone }: BossIntroProps) {
  ensureFxStyles();
  const [exitMs, setExitMs] = useState<number | null>(null);
  const [image, setImage] = useState<'loading' | 'ready' | 'error'>(fx.imageUrl ? 'loading' : 'error');
  const stageRef = useRef<HTMLDivElement>(null);
  const embersRef = useRef<HTMLCanvasElement>(null);
  const leavingRef = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const leave = useCallback((ms: number) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setExitMs(ms);
  }, []);

  // Auto exit, then unmount after the fade.
  useEffect(() => {
    const timer = setTimeout(() => leave(EXIT_MS), SHOW_MS - EXIT_MS);
    return () => clearTimeout(timer);
  }, [leave]);

  useEffect(() => {
    if (exitMs === null) return;
    const timer = setTimeout(() => doneRef.current(), exitMs);
    return () => clearTimeout(timer);
  }, [exitMs]);

  // Sounds and shakes.
  useEffect(() => {
    const reduced = useSettingsStore.getState().reducedMotion;
    uiSounds.whoosh();
    if (fx.soundUrl) audioEngine.playSfx(fx.soundUrl, 1, fx.name);
    const impact = setTimeout(() => {
      if (leavingRef.current || reduced) return;
      shakeViewport(0.85, 1250);
      if (stageRef.current) shakeElement(stageRef.current, 0.55, 1000);
    }, IMPACT_MS);
    const reveal = setTimeout(() => {
      if (!leavingRef.current) uiSounds.reveal();
    }, REVEAL_SOUND_MS);
    return () => {
      clearTimeout(impact);
      clearTimeout(reveal);
    };
  }, [fx]);

  // Rising embers over the whole screen (reuses the weather particle system).
  useEffect(() => {
    const canvas = embersRef.current;
    if (!canvas) return;
    const renderer = new WeatherRenderer(canvas, { density: 1.7, speed: 1.5, tint: false });
    renderer.setReducedMotion(useSettingsStore.getState().reducedMotion);
    renderer.resize(window.innerWidth, window.innerHeight);
    renderer.setWeather('embers');
    const onResize = () => renderer.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      renderer.destroy();
    };
  }, []);

  // Esc skips (captured so it does not also close a dialog underneath).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      leave(SKIP_EXIT_MS);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [leave]);

  if (typeof document === 'undefined') return null;

  const portraitSize = 'min(34vh, 58vw)';

  return createPortal(
    <div
      role="dialog"
      aria-label={`Aparece ${fx.name}`}
      onClick={() => leave(SKIP_EXIT_MS)}
      className="fixed inset-0 z-[95] cursor-pointer select-none overflow-hidden"
      style={{
        animation: exitMs !== null ? `wfx-fade-out ${exitMs}ms ease-in forwards` : 'wfx-fade-in 420ms ease-out both',
      }}
    >
      {/* Darkness, vignette and heat */}
      <div aria-hidden className="absolute inset-0 bg-[#050302]/85" />
      <div aria-hidden className="absolute inset-0" style={VIGNETTE} />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2" style={HEAT} />
      <canvas ref={embersRef} aria-hidden className="absolute inset-0 h-full w-full" />
      <div aria-hidden className="absolute inset-0" style={FLASH} />

      {/* Letterbox */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[10vh] bg-black"
        style={{ animation: 'wfx-bar-top 650ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-600/70 to-transparent" />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex h-[10vh] items-center justify-end bg-black px-6"
        style={{ animation: 'wfx-bar-bottom 650ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-600/70 to-transparent" />
        <span
          className="font-display text-[11px] uppercase tracking-[0.3em] text-parchment-400"
          style={{ animation: 'wfx-fade-in 600ms ease-out 1900ms both' }}
        >
          Pulsa para continuar
        </span>
      </div>

      {/* Stage */}
      <div className="absolute inset-x-0 bottom-[10vh] top-[10vh] flex items-center justify-center px-6">
        <div ref={stageRef} className="flex max-w-[94vw] flex-col items-center gap-3 sm:gap-5">
          <div className="relative" style={{ width: portraitSize, height: portraitSize }}>
            <div aria-hidden className="absolute -inset-[45%] rounded-full" style={AURA} />
            <RuneRing />
            <div
              className="relative h-full w-full overflow-hidden rounded-full bg-ink-950"
              style={{
                animation: `wfx-portrait-in 1000ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both, wfx-glow 2.4s ease-in-out 1.3s infinite`,
              }}
            >
              {fx.imageUrl && image !== 'error' && (
                <img
                  src={fx.imageUrl}
                  alt=""
                  draggable={false}
                  onLoad={() => setImage('ready')}
                  onError={() => setImage('error')}
                  className="h-full w-full object-cover transition-opacity duration-300"
                  style={{ opacity: image === 'ready' ? 1 : 0, animation: 'wfx-push 5.5s ease-out 900ms both' }}
                />
              )}
              {image === 'error' && (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#3a1410_0%,#13110e_70%)]">
                  <Skull className="h-1/2 w-1/2 text-gold-400/90 drop-shadow-[0_0_18px_rgba(224,98,90,0.7)]" aria-hidden />
                </div>
              )}
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_40px_14px_rgba(0,0,0,0.75)]" />
            </div>
          </div>

          <p
            className="font-display text-[11px] font-semibold uppercase tracking-[0.55em] text-gold-300/90 sm:text-sm"
            style={{ animation: 'wfx-rise-in 600ms ease-out 620ms both' }}
          >
            Se alza ante vosotros
          </p>

          <div style={NAME_SHADOW}>
            <h1
              className="text-balance text-center font-display font-black uppercase"
              style={{
                ...NAME_GRADIENT,
                fontSize: nameFontSize(fx.name),
                lineHeight: 1.04,
                animation: 'wfx-name-in 1100ms cubic-bezier(0.16, 1, 0.3, 1) 780ms both',
              }}
            >
              {fx.name}
            </h1>
          </div>

          <div
            aria-hidden
            className="flex w-[min(34rem,72vw)] items-center gap-3"
            style={{ animation: 'wfx-line-in 700ms cubic-bezier(0.16, 1, 0.3, 1) 1250ms both' }}
          >
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-500" />
            <span className="h-2 w-2 rotate-45 border border-gold-400 bg-blood-500 shadow-[0_0_10px_rgba(224,98,90,0.8)]" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-500" />
          </div>

          {fx.subtitle && (
            <p
              className="text-center font-display text-sm uppercase tracking-[0.32em] text-parchment-100 sm:text-xl"
              style={{ animation: 'wfx-rise-in 700ms ease-out 1450ms both', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}
            >
              {fx.subtitle}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Slowly spinning gold runic circle around the portrait. */
function RuneRing() {
  const ticks = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-[12%]"
      style={{ animation: 'wfx-fade-in 800ms ease-out 900ms both' }}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" style={{ animation: 'wfx-spin 26s linear infinite' }}>
        <circle cx="100" cy="100" r="97" fill="none" stroke="rgba(233,192,99,0.55)" strokeWidth="0.8" />
        <circle cx="100" cy="100" r="91" fill="none" stroke="rgba(233,192,99,0.35)" strokeWidth="0.6" strokeDasharray="2 4" />
        {ticks.map((i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const long = i % 3 === 0;
          const r0 = long ? 91 : 93.5;
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * r0}
              y1={100 + Math.sin(a) * r0}
              x2={100 + Math.cos(a) * 97}
              y2={100 + Math.sin(a) * 97}
              stroke={long ? 'rgba(243,213,138,0.85)' : 'rgba(233,192,99,0.45)'}
              strokeWidth={long ? 1.1 : 0.6}
            />
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const x = 100 + Math.cos(a) * 97;
          const y = 100 + Math.sin(a) * 97;
          return (
            <rect
              key={i}
              x={x - 3}
              y={y - 3}
              width={6}
              height={6}
              transform={`rotate(45 ${x} ${y})`}
              fill="#c43d33"
              stroke="#f3d58a"
              strokeWidth={0.8}
            />
          );
        })}
      </svg>
    </div>
  );
}
