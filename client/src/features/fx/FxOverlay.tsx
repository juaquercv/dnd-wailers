import { useCallback, useEffect, useRef, useState } from 'react';
import type { FxEvent, WeatherType } from '@wailers/shared';
import { useSessionEvent } from '../../lib/eventBus';
import { withAlpha } from '../../map/mapUtils';
import { useSessionStore } from '../../stores/session';
import { useSettingsStore } from '../../stores/settings';
import { BossIntro, type BossFx } from './BossIntro';
import { shakeViewport } from './shake';
import { WeatherRenderer } from './weather';

type FlashFx = Extract<FxEvent, { kind: 'flash' }>;

const FLASH_MIN_MS = 120;
const FLASH_MAX_MS = 6000;

/**
 * Visual effects over the game viewport (`#game-viewport`, position: relative):
 *  - weather particles of the zone this client is viewing (DM override or zone default);
 *  - `fx` session events: screen shake (CSS on #game-viewport), color flash and the boss intro
 *    (fixed fullscreen). Spell animations are drawn on the map by MapFxLayer.
 */
export function FxOverlay() {
  const flashRef = useRef<HTMLDivElement>(null);
  const bossSeq = useRef(0);
  const [boss, setBoss] = useState<{ id: number; fx: BossFx } | null>(null);

  useSessionEvent('fx', ({ fx }) => {
    switch (fx.kind) {
      case 'shake':
        shakeViewport(fx.intensity, fx.durationMs);
        break;
      case 'flash':
        if (flashRef.current) playFlash(flashRef.current, fx);
        break;
      case 'boss':
        bossSeq.current += 1;
        setBoss({ id: bossSeq.current, fx });
        break;
      case 'spell':
        break;
    }
  });

  const closeBoss = useCallback((id: number) => {
    setBoss((current) => (current && current.id === id ? null : current));
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <WeatherCanvas />
      <div ref={flashRef} className="absolute inset-0 opacity-0" />
      {boss && <BossIntro key={boss.id} fx={boss.fx} onDone={() => closeBoss(boss.id)} />}
    </div>
  );
}

/** Weather shown on this client: DM override of the viewed zone, else the zone default. */
function useViewedWeather(): WeatherType {
  return useSessionStore((s) => {
    const viewZone = s.viewZone;
    const state = s.view?.state;
    if (!viewZone || !state || state.status === 'lobby') return 'none';
    const zone = s.zonesById[viewZone.zoneId];
    if (!zone) return 'none';
    return state.zoneStates[viewZone.zoneId]?.weather ?? zone.weather ?? 'none';
  });
}

function WeatherCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WeatherRenderer | null>(null);
  const weather = useViewedWeather();
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new WeatherRenderer(canvas);
    rendererRef.current = renderer;
    renderer.setReducedMotion(useSettingsStore.getState().reducedMotion);
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(canvas);
    // Device pixel ratio changes (moving the window to another screen, browser zoom).
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    rendererRef.current?.setWeather(weather);
  }, [weather]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/** Full-viewport color flash (Web Animations, so it still plays softly with reduced motion). */
function playFlash(el: HTMLDivElement, fx: FlashFx): void {
  const reduced = useSettingsStore.getState().reducedMotion;
  const color = fx.color || '#ffffff';
  const duration = Math.min(FLASH_MAX_MS, Math.max(FLASH_MIN_MS, Number.isFinite(fx.durationMs) ? fx.durationMs : 400));
  el.style.background = `radial-gradient(ellipse at 50% 45%, ${withAlpha(color, 1)} 0%, ${withAlpha(color, 0.9)} 45%, ${withAlpha(color, 0.75)} 100%)`;
  if (typeof el.animate !== 'function') return;
  for (const running of el.getAnimations()) running.cancel();
  const peak = reduced ? 0.3 : 0.92;
  const rise = Math.min(0.3, 90 / duration);
  el.animate(
    [
      { opacity: 0, easing: 'ease-out' },
      { opacity: peak, offset: rise, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
      { opacity: 0 },
    ],
    { duration: reduced ? duration * 1.4 : duration, fill: 'none' },
  );
}
