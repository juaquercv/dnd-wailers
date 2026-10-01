import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import type { Roller } from '@wailers/shared';
import { api } from '../../api/http';
import { sessionBus } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';

/**
 * Players do not receive the campaign roller list: the rollers offered at the start of their turn
 * arrive inside the 'turnStart' event. This tiny store keeps the last offer (and every roller snapshot
 * seen) so RollPrompts and DicePanel can render the offer buttons, even if only one of them is mounted.
 * After a reload (offer or request pending but no 'turnStart' seen yet) the names are fetched once over REST.
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

/** Merge roller snapshots into the store (keeps the current session's data). */
function remember(sessionId: string | null, rollers: Roller[]): void {
  const prev = useOfferedRollers.getState();
  const same = prev.sessionId === sessionId;
  const known = same ? { ...prev.known } : {};
  for (const r of rollers) known[r.id] = r;
  useOfferedRollers.setState({ sessionId, known, offered: same ? prev.offered : [] });
}

/** Missing-id sets already fetched (or being fetched) per session, so an unknown id never loops requests. */
const fetched = new Set<string>();

/**
 * Resolve roller ids that this client has not seen yet (e.g. after a page reload) by loading the
 * campaign roller list once per session. Only names/visuals are used: nothing is rolled here.
 */
export function useEnsureRollers(ids: string[]): void {
  const sessionId = useSessionStore((s) => s.sessionId);
  const campaignId = useSessionStore((s) => s.view?.state.campaignId ?? null);
  const dmRollers = useSessionStore((s) => s.rollers);
  const known = useOfferedRollers((s) => (s.sessionId === sessionId ? s.known : null));
  const key = ids.filter(Boolean).join('|');

  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    if (!sessionId || !campaignId || wanted.length === 0) return;
    const missing = wanted.filter((id) => !known?.[id] && !dmRollers.some((r) => r.id === id));
    if (missing.length === 0) return;
    const fetchKey = `${sessionId}:${campaignId}:${[...missing].sort().join(',')}`;
    if (fetched.has(fetchKey)) return;
    fetched.add(fetchKey);
    api.campaigns
      .rollers(campaignId)
      .then((list) => {
        if (useSessionStore.getState().sessionId === sessionId) remember(sessionId, list);
      })
      .catch(() => {
        // Names fall back to a generic label; allow another attempt later.
        fetched.delete(fetchKey);
      });
  }, [key, sessionId, campaignId, known, dmRollers]);
}

export type RollerLookup = (id: string) => Roller | null;

/** Roller snapshot by id from anything this client knows (DM list first, then offers / REST cache). */
export function useRollerLookup(): RollerLookup {
  const sessionId = useSessionStore((s) => s.sessionId);
  const dmRollers = useSessionStore((s) => s.rollers);
  const state = useOfferedRollers();
  return useCallback(
    (id: string) =>
      dmRollers.find((r) => r.id === id) ??
      (state.sessionId === sessionId ? state.known[id] ?? state.offered.find((r) => r.id === id) ?? null : null),
    [dmRollers, state, sessionId],
  );
}

/** Resolves roller ids of a turn offer to snapshots (unknown ids get a generic placeholder name). */
export function resolveOffered(ids: string[], lookup: RollerLookup): { id: string; name: string; roller: Roller | null }[] {
  return ids.map((id, i) => {
    const roller = lookup(id);
    return { id, name: roller?.name ?? `Tirada de turno ${ids.length > 1 ? i + 1 : ''}`.trim(), roller };
  });
}
