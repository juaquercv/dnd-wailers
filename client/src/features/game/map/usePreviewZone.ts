import { useEffect, useRef } from 'react';
import { isOwnHeroToken, type Token } from '@wailers/shared';
import { useSessionStore, type ViewZone } from '../../../stores/session';

function sameZone(a: ViewZone | null, b: ViewZone | null): boolean {
  return !!a && !!b && a.zoneId === b.zoneId && a.levelId === b.levelId;
}

/**
 * DM "Ver como jugador X": the map follows the zone and level of that player's hero token (when the
 * preview starts and whenever the token changes zone or level), like the player's own screen does.
 * Leaving the preview brings the DM back to the zone they were viewing, unless they moved meanwhile.
 */
export function usePreviewZone(): void {
  const viewAs = useSessionStore((s) => (s.view?.role === 'dm' ? s.viewAsUserId : null));
  const tokenZoneId = useSessionStore((s) => previewToken(s)?.zoneId ?? null);
  const tokenLevelId = useSessionStore((s) => previewToken(s)?.levelId ?? null);
  /** Zone the DM was viewing before the preview started. */
  const savedRef = useRef<ViewZone | null>(null);
  /** Last zone the preview switched to. */
  const autoRef = useRef<ViewZone | null>(null);
  const prevViewAsRef = useRef<string | null>(null);

  useEffect(() => {
    const store = useSessionStore.getState();
    const prevViewAs = prevViewAsRef.current;
    prevViewAsRef.current = viewAs;

    if (!viewAs) {
      const saved = savedRef.current;
      const untouched = sameZone(store.viewZone, autoRef.current) && !sameZone(store.viewZone, saved);
      if (prevViewAs && saved && untouched && store.zonesById[saved.zoneId]) {
        store.setViewZone(saved.zoneId, saved.levelId);
      }
      savedRef.current = null;
      autoRef.current = null;
      return;
    }

    if (!prevViewAs) savedRef.current = store.viewZone;
    if (!tokenZoneId || !tokenLevelId || !store.zonesById[tokenZoneId]) return;
    const target: ViewZone = { zoneId: tokenZoneId, levelId: tokenLevelId };
    autoRef.current = target;
    if (!sameZone(store.viewZone, target)) store.setViewZone(target.zoneId, target.levelId);
  }, [viewAs, tokenZoneId, tokenLevelId]);
}

/** Hero token of the player being previewed (from the DM's full state). */
function previewToken(s: ReturnType<typeof useSessionStore.getState>): Token | null {
  const view = s.view;
  const userId = s.viewAsUserId;
  if (!view || view.role !== 'dm' || !userId) return null;
  const state = view.state;
  return Object.values(state.tokens).find((t) => isOwnHeroToken(state, t, userId)) ?? null;
}
