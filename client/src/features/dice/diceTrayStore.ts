import { useEffect } from 'react';
import { create } from 'zustand';
import type { RollMode, RollVisibility } from '@wailers/shared';
import { useSessionStore } from '../../stores/session';
import { EMPTY_POOL, type DicePool } from './dicePool';

/** What "Repetir última tirada" sends again. */
export interface LastTrayRoll {
  formula: string;
  mode: RollMode;
  label: string;
  visibility: RollVisibility;
  targetUserId: string | null;
}

/**
 * State of the dice tray kept outside the panel, so switching sidebar tabs does not wipe the dice
 * already placed on the table. Reset when the session changes.
 */
interface DiceTrayState {
  sessionId: string | null;
  pool: DicePool;
  mode: RollMode;
  label: string;
  visibility: RollVisibility;
  targetUserId: string | null;
  last: LastTrayRoll | null;
  requestPool: DicePool;
  requestMode: RollMode;
}

const DEFAULT_REQUEST_POOL: DicePool = { groups: [{ sides: 20, count: 1 }], bonus: 0 };

function initial(sessionId: string | null): DiceTrayState {
  return {
    sessionId,
    pool: EMPTY_POOL,
    mode: 'normal',
    label: '',
    visibility: 'public',
    targetUserId: null,
    last: null,
    requestPool: DEFAULT_REQUEST_POOL,
    requestMode: 'normal',
  };
}

export const useDiceTray = create<DiceTrayState>(() => initial(null));

export function patchDiceTray(patch: Partial<Omit<DiceTrayState, 'sessionId'>>): void {
  useDiceTray.setState(patch);
}

/** Clears the tray when the user moves to another session. */
export function useDiceTraySession(): void {
  const sessionId = useSessionStore((s) => s.sessionId);
  useEffect(() => {
    if (useDiceTray.getState().sessionId !== sessionId) useDiceTray.setState(initial(sessionId));
  }, [sessionId]);
}
