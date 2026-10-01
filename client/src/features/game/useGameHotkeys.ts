import { isOwnHeroToken, type Token } from '@wailers/shared';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { useSessionStore } from '../../stores/session';
import { removeTokens, rotateTokens, selectedTokens, toggleHidden } from './map/actions';
import { gameCamera } from './map/camera';
import { useGameUi } from './map/gameUi';

export interface GameHotkeysOptions {
  /** Opens the DM quick search palette (Ctrl+K). */
  onQuickSearch: () => void;
  /** Default true (disabled e.g. while the scene screen replaces the map). */
  enabled?: boolean;
}

/** Tokens the current user may rotate with R: DM → selection; player → own selected tokens or the own token in view. */
function rotatableTokens(): Token[] {
  const s = useSessionStore.getState();
  const view = s.view;
  if (!view) return [];
  if (view.role === 'dm') return selectedTokens();
  if (!view.effective.canMoveOwnToken) return [];
  const state = view.state;
  const own = (t: Token) => isOwnHeroToken(state, t, view.meUserId);
  const selected = selectedTokens().filter(own);
  if (selected.length > 0) return selected;
  const vz = s.viewZone;
  const inView = Object.values(state.tokens).find((t) => own(t) && (!vz || (t.zoneId === vz.zoneId && t.levelId === vz.levelId)));
  return inView ? [inView] : [];
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
        onQuickSearch();
      },
    },
    { enabled: enabled && isDm, allowInInputs: true },
  );

  useHotkeys(
    {
      escape: (e) => {
        if (e.defaultPrevented || keyboardBusy()) return;
        if (useGameUi.getState().cancelModes()) return;
        const s = useSessionStore.getState();
        if (s.selectedTokenIds.length > 0) s.clearSelection();
      },
      'delete, backspace': () => {
        if (!isDm || keyboardBusy()) return;
        const tokens = selectedTokens();
        if (tokens.length === 0) return;
        void removeTokens(tokens, tokens.length > 1);
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
        const ui = useGameUi.getState();
        ui.togglePingMode();
        if (useGameUi.getState().pingMode) toast.info('Modo ping: haz clic en el mapa para señalar (P o Esc para salir)');
      },
      'r, shift+r': (e) => {
        if (keyboardBusy()) return;
        const tokens = rotatableTokens();
        if (tokens.length === 0) return;
        void rotateTokens(tokens, e.shiftKey ? -45 : 45);
      },
    },
    { enabled, preventDefault: false, ignoreRepeat: false },
  );
}
