import { useMemo } from 'react';
import { useSessionStore } from '../../../stores/session';
import { usePanelContext } from '../panels/context';
import { heroEconomy, type HeroEconomy } from './economyCore';
import { useOwnTurnMark } from './turnWatch';

export { actionsText, cellsText, heroEconomy, type HeroEconomy } from './economyCore';

/**
 * Economy of a hero from the perspective of this client (player, or the player previewed by the DM).
 * `unlimited` is true when this client manages the game (DM): nothing is blocked for it.
 */
export function useHeroEconomy(heroId: string | null): (HeroEconomy & { unlimited: boolean }) | null {
  const ctx = usePanelContext();
  const fullState = useSessionStore((s) => (s.view?.role === 'dm' ? s.view.state : null));
  const zonesById = useSessionStore((s) => s.zonesById);
  const mark = useOwnTurnMark((s) => s.mark);
  const { state, effective, canManage, isDm, isPreview } = ctx;
  return useMemo(() => {
    if (!state || !heroId || !state.heroes[heroId]) return null;
    const eco = heroEconomy(state, heroId, {
      canMove: canManage ? true : effective?.canMoveOwnToken ?? true,
      fullState,
      mark,
      zonesById,
      playerPerspective: !isDm || isPreview,
    });
    if (!canManage) return { ...eco, unlimited: false };
    return { ...eco, unlimited: true, actionBlock: null, moveBlock: null };
  }, [state, heroId, effective, canManage, isDm, isPreview, fullState, mark, zonesById]);
}
