import { create } from 'zustand';

/**
 * Full-screen dice layers currently on screen: the initiative draw (InitiativeDrawOverlay) and the
 * roll presentation (DiceOverlay). Prompts that would play unseen underneath them, such as the
 * "¡Tu turno!" banner, wait until every one of them is gone.
 * Each overlay writes only its own flag; an overlay that is not mounted leaves it false.
 */
export type CoveringOverlay = 'initiativeDraw' | 'dice';

type OverlayFlags = Record<CoveringOverlay, boolean>;

const useCoveringOverlayState = create<OverlayFlags>(() => ({ initiativeDraw: false, dice: false }));

const anyShowing = (s: OverlayFlags): boolean => s.initiativeDraw || s.dice;

export function setOverlayShowing(overlay: CoveringOverlay, showing: boolean): void {
  if (useCoveringOverlayState.getState()[overlay] !== showing) {
    useCoveringOverlayState.setState((s) => ({ ...s, [overlay]: showing }));
  }
}

/** Synchronous read, for event handlers that run right after an overlay's event in the same tick. */
export function isCoveringOverlayShowing(): boolean {
  return anyShowing(useCoveringOverlayState.getState());
}

export function useCoveringOverlayShowing(): boolean {
  return useCoveringOverlayState(anyShowing);
}
