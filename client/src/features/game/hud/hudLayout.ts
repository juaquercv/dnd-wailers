import { useEffect } from 'react';
import { create } from 'zustand';

interface PlayerHudLayout {
  /**
   * Pixels the player's action bar takes from the bottom of #game-viewport when it reaches the centre,
   * where the "Viajar a…" arrow sits (0 when it leaves the centre free or is not shown).
   */
  centerInset: number;
}

export const usePlayerHudLayout = create<PlayerHudLayout>(() => ({ centerInset: 0 }));

/** Half the width kept free around the centre of the viewport (the bottom travel arrow is at most 16rem wide). */
const CENTER_HALF_WIDTH = 136;
const GAP = 8;

/** Publishes how much of the bottom centre `el` (the HUD root, a child of #game-viewport) covers while it is mounted. */
export function usePublishHudLayout(el: HTMLElement | null): void {
  useEffect(() => {
    if (!el) return;
    const viewport = el.parentElement;
    const measure = () => {
      const r = el.getBoundingClientRect();
      let centerInset = 0;
      if (viewport && r.height > 0) {
        const v = viewport.getBoundingClientRect();
        if (r.right > v.left + v.width / 2 - CENTER_HALF_WIDTH) centerInset = Math.max(0, Math.round(v.bottom - r.top + GAP));
      }
      if (usePlayerHudLayout.getState().centerInset !== centerInset) usePlayerHudLayout.setState({ centerInset });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (viewport) ro.observe(viewport);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      usePlayerHudLayout.setState({ centerInset: 0 });
    };
  }, [el]);
}
