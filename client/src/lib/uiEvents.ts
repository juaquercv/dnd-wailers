import { useEffect, useRef } from 'react';
import type { SpellAnimation } from '@wailers/shared';

/**
 * Local (in-page) UI events between features that do not import each other.
 *  - 'cast-request': HeroSheet asks the map to pick a target point for a spell (Esc cancels).
 *  - 'center-on-token': center the game camera on a token.
 *  - 'open-token': open the token details panel.
 *  - 'open-quicksearch': open the Ctrl+K palette.
 *  - 'editor-fit': fit the editor canvas to the level.
 *  - 'game-fit': fit the game map to the level.
 */
export interface UiEventMap {
  'cast-request': { heroId: string; spellName: string; animation: SpellAnimation };
  'center-on-token': { tokenId: string };
  'open-token': { tokenId: string };
  'open-quicksearch': Record<string, never>;
  'editor-fit': Record<string, never>;
  'game-fit': Record<string, never>;
}

export type UiEventName = keyof UiEventMap;

const PREFIX = 'wailers:';

export function emitUiEvent<K extends UiEventName>(name: K, detail: UiEventMap[K]): void {
  window.dispatchEvent(new CustomEvent(PREFIX + name, { detail }));
}

export function onUiEvent<K extends UiEventName>(name: K, handler: (detail: UiEventMap[K]) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<UiEventMap[K]>).detail);
  window.addEventListener(PREFIX + name, listener);
  return () => window.removeEventListener(PREFIX + name, listener);
}

export function useUiEvent<K extends UiEventName>(name: K, handler: (detail: UiEventMap[K]) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onUiEvent(name, (d) => ref.current(d)), [name]);
}
