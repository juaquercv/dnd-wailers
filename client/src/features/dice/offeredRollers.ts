import { create } from 'zustand';
import type { Roller } from '@wailers/shared';
import { sessionBus } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';

/**
 * Players do not receive the campaign roller list: the rollers offered at the start of their turn
 * arrive inside the 'turnStart' event. This tiny store keeps the last offer (and every roller snapshot
 * seen) so RollPrompts and DicePanel can render the offer buttons, even if only one of them is mounted.
 */
interface OfferedRollersState {
  sessionId: string | null;
  /** Rollers of the latest offer addressed to me. */
  offered: Roller[];
  /** Every roller snapshot received in this session, by id. */
  known: Record<string, Roller>;
}

export const useOfferedRollers = create<OfferedRollersState>(() => ({ sessionId: null, offered: [], known: {} }));

sessionBus.on('turnStart', (event) => {
  const session = useSessionStore.getState();
  const me = session.view?.meUserId ?? null;
  const sessionId = session.sessionId;
  const prev = useOfferedRollers.getState();
  const known = prev.sessionId === sessionId ? { ...prev.known } : {};
  for (const r of event.offeredRollers) known[r.id] = r;
  const mine = !!me && event.entry.userId === me;
  useOfferedRollers.setState({
    sessionId,
    known,
    offered: mine ? event.offeredRollers : prev.sessionId === sessionId ? prev.offered : [],
  });
});

/** Resolves roller ids of a turn offer to snapshots (unknown ids get a generic placeholder name). */
export function resolveOffered(ids: string[], state: OfferedRollersState, sessionId: string | null): { id: string; name: string; roller: Roller | null }[] {
  const sameSession = state.sessionId === sessionId;
  return ids.map((id, i) => {
    const roller = sameSession ? state.known[id] ?? state.offered.find((r) => r.id === id) ?? null : null;
    return { id, name: roller?.name ?? `Tirada de turno ${ids.length > 1 ? i + 1 : ''}`.trim(), roller };
  });
}
