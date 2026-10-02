import { create } from 'zustand';
import type { SpellAnimation } from '@wailers/shared';

export type GameSidebarTab = 'character' | 'party' | 'dice' | 'chat' | 'log' | 'audio' | 'effects' | 'visibility' | 'library';

export interface CastRequest {
  heroId: string;
  spellName: string;
  animation: SpellAnimation;
}

/** Map point chosen with the right-click menu where the next quick-search spawn lands. */
export interface SpawnTarget {
  zoneId: string;
  levelId: string;
  x: number;
  y: number;
  at: number;
}

/** Camera focus to apply once the map shows the given zone/level. */
export interface PendingFocus {
  zoneId: string;
  levelId: string;
  x: number;
  y: number;
  scale?: number;
}

interface GameUiState {
  /** Every click/tap on the map sends a ping (touch-friendly alternative to Alt+click). */
  pingMode: boolean;
  /** Spell waiting for a target point. */
  cast: CastRequest | null;
  /** DM only: show the players' real lighting instead of the attenuated DM lighting. */
  realLighting: boolean;
  /** Ask the game screen to open a sidebar tab (nonce changes on every request). */
  sidebarRequest: { tab: GameSidebarTab; nonce: number } | null;
  pendingFocus: PendingFocus | null;
  /** Token briefly highlighted after "center on token". */
  flashTokenId: string | null;
  /** "Añadir enemigo aquí…": the quick search spawns at this point instead of the view center. */
  spawnAt: SpawnTarget | null;
  /** A token of the map is being dragged right now (overlays step aside). */
  tokenDragging: boolean;

  setPingMode: (on: boolean) => void;
  togglePingMode: () => void;
  setCast: (cast: CastRequest | null) => void;
  setRealLighting: (on: boolean) => void;
  openSidebarTab: (tab: GameSidebarTab) => void;
  requestFocus: (focus: PendingFocus) => void;
  /** Returns (and clears) the pending focus if it targets this zone/level. */
  consumeFocus: (zoneId: string, levelId: string) => PendingFocus | null;
  flashToken: (tokenId: string) => void;
  setSpawnAt: (target: Omit<SpawnTarget, 'at'> | null) => void;
  /** The pending spawn point when it is recent and on the given zone/level (it is kept until used or replaced). */
  peekSpawnAt: (zoneId: string, levelId: string) => SpawnTarget | null;
  setTokenDragging: (on: boolean) => void;
  /** Leaves every transient mode (Esc). Returns true if something was cancelled. */
  cancelModes: () => boolean;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;
const SPAWN_AT_TTL_MS = 2 * 60 * 1000;
let sidebarNonce = 0;

export const useGameUi = create<GameUiState>((set, get) => ({
  pingMode: false,
  cast: null,
  realLighting: false,
  sidebarRequest: null,
  pendingFocus: null,
  flashTokenId: null,
  spawnAt: null,
  tokenDragging: false,

  setPingMode: (on) => set({ pingMode: on, cast: on ? null : get().cast }),
  togglePingMode: () => set((s) => ({ pingMode: !s.pingMode, cast: s.pingMode ? s.cast : null })),
  setCast: (cast) => set({ cast, pingMode: cast ? false : get().pingMode }),
  setRealLighting: (on) => set({ realLighting: on }),
  openSidebarTab: (tab) => {
    sidebarNonce += 1;
    set({ sidebarRequest: { tab, nonce: sidebarNonce } });
  },
  requestFocus: (focus) => set({ pendingFocus: focus }),
  consumeFocus: (zoneId, levelId) => {
    const f = get().pendingFocus;
    if (!f || f.zoneId !== zoneId || f.levelId !== levelId) return null;
    set({ pendingFocus: null });
    return f;
  },
  flashToken: (tokenId) => {
    if (flashTimer) clearTimeout(flashTimer);
    set({ flashTokenId: tokenId });
    flashTimer = setTimeout(() => {
      flashTimer = null;
      set({ flashTokenId: null });
    }, 1800);
  },
  setSpawnAt: (target) => set({ spawnAt: target ? { ...target, at: Date.now() } : null }),
  peekSpawnAt: (zoneId, levelId) => {
    const t = get().spawnAt;
    if (!t || t.zoneId !== zoneId || t.levelId !== levelId || Date.now() - t.at > SPAWN_AT_TTL_MS) return null;
    return t;
  },
  setTokenDragging: (on) => {
    if (get().tokenDragging !== on) set({ tokenDragging: on });
  },
  cancelModes: () => {
    const s = get();
    if (!s.cast && !s.pingMode) return false;
    set({ cast: null, pingMode: false });
    return true;
  },
}));

/** Reset every transient mode (used when leaving the game screen). */
export function resetGameUi(): void {
  useGameUi.setState({
    pingMode: false,
    cast: null,
    pendingFocus: null,
    flashTokenId: null,
    sidebarRequest: null,
    spawnAt: null,
    tokenDragging: false,
  });
}
