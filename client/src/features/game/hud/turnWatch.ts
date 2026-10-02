import { create } from 'zustand';
import { sessionBus } from '../../../lib/eventBus';
import { useSessionStore } from '../../../stores/session';

/**
 * Players who may not see the turn order still receive the 'turnStart' of their own turn. This store
 * remembers it (round + the currentIndex of the first state after the event) so the HUD knows the turn is
 * theirs until the index or the round changes.
 */
export interface OwnTurnMark {
  round: number;
  /** currentIndex once the state of that turn arrived (null until then). */
  index: number | null;
  /** State version when the event arrived. */
  version: number;
}

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

/** True while the remembered turn is still the current one. */
export function markIsCurrent(mark: OwnTurnMark | null, turn: { round: number; currentIndex: number }): boolean {
  if (!mark || mark.round !== turn.round) return false;
  return mark.index === null || mark.index === turn.currentIndex;
}
