import { create } from 'zustand';
import { sessionBus } from '../../../lib/eventBus';
import { useSessionStore } from '../../../stores/session';
import type { OwnTurnMark } from './economyCore';

/**
 * Players who may not see the turn order still receive the 'turnStart' of their own turn. This store
 * remembers it so the HUD knows the turn is theirs until the index or the round changes (markIsCurrent).
 */
export const useOwnTurnMark = create<{ mark: OwnTurnMark | null }>(() => ({ mark: null }));

sessionBus.on('turnStart', (event) => {
  const view = useSessionStore.getState().view;
  if (!view || view.role !== 'player') return;
  const me = view.meUserId;
  const myHeroId = view.state.players[me]?.heroId ?? null;
  const mine = event.entry.userId === me || (myHeroId !== null && event.entry.heroId === myHeroId);
  useOwnTurnMark.setState({ mark: mine ? { round: event.round, index: null, version: view.state.version } : null });
});

useSessionStore.subscribe((s) => {
  const { mark } = useOwnTurnMark.getState();
  const state = s.view?.state;
  if (!state) {
    if (mark) useOwnTurnMark.setState({ mark: null });
    return;
  }
  if (!mark || mark.index !== null || state.version <= mark.version) return;
  useOwnTurnMark.setState({ mark: { ...mark, index: state.turn.currentIndex } });
});
