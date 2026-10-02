import { isOwnHeroToken, type Token } from '@wailers/shared';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { useSessionStore } from '../../stores/session';
import { removeTokens, rotateTokens, selectedTokens, toggleHidden } from './map/actions';
import { gameCamera } from './map/camera';
import { useGameUi } from './map/gameUi';
import { cleanupStaleDrags, isKonvaDragging } from './map/konvaGuards';
import { freeMoveBlock, OFF_TURN_TURN_REASON, playerEconomyNow } from './map/ownEconomy';

export interface GameHotkeysOptions {
  /** Opens the DM quick search palette (Ctrl+K). */
  onQuickSearch: () => void;
  /** Default true (disabled e.g. while the scene screen replaces the map). */
  enabled?: boolean;
}

/**
 * Tokens the current user may rotate with R: DM → selection; player → own selected tokens or the own token in
 * view. `block` explains why a player cannot turn the own hero right now (locked by the DM, or not their turn).
 */
function rotatableTokens(): { tokens: Token[]; block: string | null } {
  const s = useSessionStore.getState();
  const view = s.view;
  if (!view) return { tokens: [], block: null };
  if (view.role === 'dm') return { tokens: selectedTokens(), block: null };
  const state = view.state;
  const own = (t: Token) => isOwnHeroToken(state, t, view.meUserId);
  const selected = selectedTokens().filter(own);
  const vz = s.viewZone;
  const inView = Object.values(state.tokens).find((t) => own(t) && (!vz || (t.zoneId === vz.zoneId && t.levelId === vz.levelId)));
  const tokens = selected.length > 0 ? selected : inView ? [inView] : [];
  if (tokens.length === 0) return { tokens, block: null };
  const heroId = tokens[0]!.heroId ?? state.players[view.meUserId]?.heroId ?? null;
  const block = freeMoveBlock(view.effective.canMoveOwnToken, playerEconomyNow(heroId), OFF_TURN_TURN_REASON);
  return block ? { tokens: [], block } : { tokens, block: null };
}

/** True when a dialog or a context menu owns the keyboard. */
function keyboardBusy(): boolean {
  if (isAnyModalOpen()) return true;
  return typeof document !== 'undefined' && document.querySelector('[data-context-menu]') !== null;
}

/**
 * Game screen shortcuts:
 *  Ctrl+K (DM) quick search · Supr (DM) remove selection · H (DM) hide/show selection ·
 *  Esc cancel modes / clear selection · F fit view · P ping mode · R / Mayús+R rotate 45°.
 */
export function useGameHotkeys({ onQuickSearch, enabled = true }: GameHotkeysOptions): void {
  const isDm = useSessionStore((s) => s.view?.role === 'dm');

  // Ctrl+K works even while typing (it is the global "find" gesture of the table).
  useHotkeys(
    {
      'mod+k': () => {
        if (!isDm || isAnyModalOpen()) return;
        // Ctrl+K places things at the view center: a point picked before with "Añadir enemigo aquí…" no longer applies.
        useGameUi.getState().setSpawnAt(null);
        onQuickSearch();
      },
    },
    { enabled: enabled && isDm, allowInInputs: true },
  );

  useHotkeys(
    {
      escape: (e) => {
        // Esc always leaves the map clean: no half-finished drag can keep blocking the tokens.
        cleanupStaleDrags(false);
        if (!isKonvaDragging()) useGameUi.getState().setTokenDragging(false);
        if (e.defaultPrevented || keyboardBusy()) return;
        if (useGameUi.getState().cancelModes()) return;
        const s = useSessionStore.getState();
        if (s.selectedTokenIds.length > 0) s.clearSelection();
      },
      'delete, backspace': () => {
        if (!isDm || keyboardBusy()) return;
        const tokens = selectedTokens();
        if (tokens.length === 0) return;
        // Same confirmation as the context menu: Delete/Backspace are easy to hit and removals cannot be undone.
        void removeTokens(tokens, true);
      },
      h: () => {
        if (!isDm || keyboardBusy()) return;
        const tokens = selectedTokens();
        if (tokens.length === 0) {
          toast.info('Selecciona fichas para ocultarlas o mostrarlas');
          return;
        }
        void toggleHidden(tokens);
      },
      f: () => {
        if (keyboardBusy()) return;
        gameCamera.fit();
      },
      p: () => {
        if (keyboardBusy()) return;
        useGameUi.getState().togglePingMode();
      },
      'r, shift+r': (e) => {
        if (keyboardBusy()) return;
        const { tokens, block } = rotatableTokens();
        if (block) {
          toast.info(block);
          return;
        }
        if (tokens.length === 0) return;
        void rotateTokens(tokens, e.shiftKey ? -45 : 45);
      },
    },
    { enabled, preventDefault: false, ignoreRepeat: false },
  );
}
