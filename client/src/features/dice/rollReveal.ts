import { create } from 'zustand';

/**
 * Rolls whose big animation (DiceOverlay) has not revealed the result yet. Lists such as the roll
 * history use it to keep the suspense: they show "Lanzando…" instead of the result until it lands.
 * Only DiceOverlay writes here; when it is not mounted nothing is ever pending.
 */
interface RollRevealState {
  pending: Record<string, true>;
}

export const useRollReveal = create<RollRevealState>(() => ({ pending: {} }));

export function markRollsPending(ids: string[]): void {
  if (ids.length === 0) return;
  useRollReveal.setState((s) => {
    const pending = { ...s.pending };
    for (const id of ids) pending[id] = true;
    return { pending };
  });
}

export function markRollsRevealed(ids: string[]): void {
  const current = useRollReveal.getState().pending;
  if (!ids.some((id) => current[id])) return;
  useRollReveal.setState((s) => {
    const pending = { ...s.pending };
    for (const id of ids) delete pending[id];
    return { pending };
  });
}

export function clearPendingRolls(): void {
  if (Object.keys(useRollReveal.getState().pending).length === 0) return;
  useRollReveal.setState({ pending: {} });
}

/** True while the result of this roll is still hidden behind its animation. */
export function useRollPending(rollId: string): boolean {
  return useRollReveal((s) => s.pending[rollId] === true);
}
