import { create } from 'zustand';

/**
 * Whether the full-screen initiative draw (InitiativeDrawOverlay) is on screen. Other prompts, such
 * as the "¡Tu turno!" banner, wait for it to close instead of playing hidden underneath it.
 * Only InitiativeDrawOverlay writes here; when it is not mounted the flag stays false.
 */
interface InitiativeDrawState {
  showing: boolean;
}

const useInitiativeDrawState = create<InitiativeDrawState>(() => ({ showing: false }));

export function setInitiativeDrawShowing(showing: boolean): void {
  if (useInitiativeDrawState.getState().showing !== showing) useInitiativeDrawState.setState({ showing });
}

/** Synchronous read, for event handlers that run right after the draw event in the same tick. */
export function isInitiativeDrawShowing(): boolean {
  return useInitiativeDrawState.getState().showing;
}

export function useInitiativeDrawShowing(): boolean {
  return useInitiativeDrawState((s) => s.showing);
}
