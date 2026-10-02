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

/*
 * Without the turn order the player only sees currentIndex and round move. The DM's client never sends a
 * position when adding entries (they go to the end), so within the same round:
 *  - a higher index means the turn moved on (next / end of turn): the mark is dropped for good, so a later
 *    shift back to that index cannot revive it;
 *  - a lower index means earlier entries left the order (a defeated creature removed) while the turn stays
 *    with the player: the mark follows the new index. The server still validates every move and action.
 */
useSessionStore.subscribe((s) => {
  const { mark } = useOwnTurnMark.getState();
  const state = s.view?.state;
  if (!state) {
    if (mark) useOwnTurnMark.setState({ mark: null });
    return;
  }
  if (!mark || state.version <= mark.version) return;
  const { round, currentIndex, order } = state.turn;
  if (mark.index === null) {
    useOwnTurnMark.setState({ mark: { ...mark, index: currentIndex } });
    return;
  }
  if (round !== mark.round || currentIndex > mark.index) {
    useOwnTurnMark.setState({ mark: null });
    return;
  }
  if (currentIndex < mark.index && order.length === 0) {
    useOwnTurnMark.setState({ mark: { ...mark, index: currentIndex, version: state.version } });
  }
});
