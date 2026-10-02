import { useEffect, useState } from 'react';

/**
 * Where the floating roll prompts go so they never cover the player's HUD (bottom-left of the game
 * viewport): beside it when there is room, otherwise above it. Null = default (bottom centre).
 */
export interface PromptPlacement {
  left: number;
  width: number;
  bottom: number;
}

const EDGE = 12;
/** Room kept free for the map toolbar at the bottom-right of the viewport. */
const TOOLBAR_RESERVE = 72;
const PROMPT_MAX_WIDTH = 480;
/** Narrowest region where the cards still read well beside the HUD (they shrink to fit). */
const PROMPT_MIN_WIDTH = 340;
/** Horizontal padding of the prompts column (px-3). */
const COLUMN_PADDING = 24;
const POLL_MS = 400;

function findPlayerHud(): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>('[data-player-hud]');
  if (marked) return marked;
  const section = document.querySelector<HTMLElement>('#game-viewport section[aria-label="Tu héroe"]');
  return section?.parentElement ?? null;
}

function computePlacement(hud: HTMLElement | null): PromptPlacement | null {
  if (!hud) return null;
  const h = hud.getBoundingClientRect();
  if (h.width === 0 || h.height === 0) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const area = document.getElementById('game-viewport')?.getBoundingClientRect();
  const areaLeft = area ? area.left : 0;
  const areaRight = area ? area.right : vw;
  const areaBottom = area ? area.bottom : vh;
  const wanted = Math.min(vw * 0.94, PROMPT_MAX_WIDTH);
  const besideLeft = h.right + EDGE;
  const besideWidth = areaRight - TOOLBAR_RESERVE - besideLeft;
  if (besideWidth >= Math.min(wanted, PROMPT_MIN_WIDTH) + COLUMN_PADDING) {
    return { left: Math.round(besideLeft), width: Math.round(besideWidth), bottom: Math.round(Math.max(EDGE, vh - areaBottom + EDGE)) };
  }
  return { left: Math.round(areaLeft), width: Math.round(areaRight - areaLeft), bottom: Math.round(Math.max(EDGE, vh - h.top + EDGE)) };
}

function samePlacement(a: PromptPlacement | null, b: PromptPlacement | null): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.width === b.width && a.bottom === b.bottom;
}

/** Tracks the HUD (it mounts, collapses and grows while playing) only while prompts are shown. */
export function usePromptPlacement(active: boolean): PromptPlacement | null {
  const [placement, setPlacement] = useState<PromptPlacement | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      setPlacement(null);
      return;
    }
    let observed: HTMLElement | null = null;
    let frame = 0;
    const update = () => {
      frame = 0;
      const hud = findPlayerHud();
      if (hud !== observed) {
        if (observed) resize?.unobserve(observed);
        if (hud) resize?.observe(hud);
        observed = hud;
      }
      const next = computePlacement(hud);
      setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    update();
    const timer = window.setInterval(schedule, POLL_MS);
    window.addEventListener('resize', schedule);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      resize?.disconnect();
    };
  }, [active]);

  return placement;
}
