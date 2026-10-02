import { useMemo } from 'react';
import {
  actionBudget,
  currentTurnEntry,
  economyApplies,
  heroIdOfEntry,
  isCombatActive,
  isHeroTurn,
  moveBudget,
  type Budget,
  type LiveState,
  type SessionZone,
} from '@wailers/shared';
import { useSessionStore } from '../../../stores/session';
import { isTurnEntryMasked } from '../map/fog';
import { usePanelContext } from '../panels/context';
import { markIsCurrent, useOwnTurnMark, type OwnTurnMark } from './turnWatch';

export const ACTION_TURN_REASON = 'Solo puedes usar acciones de combate en tu turno';
export const NO_ACTIONS_REASON = 'Ya no te quedan acciones de combate este turno';

/** Turn economy of one hero as its player sees it. */
export interface HeroEconomy {
  /** Combat mode is on. */
  combat: boolean;
  /** Movement and combat actions are limited right now (combat + turn economy option). */
  limited: boolean;
  /** The player can see the turn order. */
  orderKnown: boolean;
  /** It is this hero's turn. */
  myTurn: boolean;
  /** Name of whoever has the turn (null when unknown). */
  currentName: string | null;
  move: Budget;
  actions: Budget;
  /** Why a combat action is not possible now (null = possible). */
  actionBlock: string | null;
  /** Why the hero cannot move now (null = it can). */
  moveBlock: string | null;
}

export interface EconomyInputs {
  /** Player's effective canMoveOwnToken. */
  canMove: boolean;
  /** Complete state when this client is the DM (decides the turn even if the previewed player cannot see it). */
  fullState: LiveState | null;
  mark: OwnTurnMark | null;
  zonesById: Record<string, SessionZone>;
  /** Mask names of creatures the player cannot see. */
  playerPerspective: boolean;
}

export function heroEconomy(state: LiveState, heroId: string, input: EconomyInputs): HeroEconomy {
  const combat = isCombatActive(state);
  const limited = economyApplies(state);
  const orderKnown = state.turn.order.length > 0;
  const entry = currentTurnEntry(state);
  let myTurn: boolean;
  if (input.fullState) myTurn = isHeroTurn(input.fullState, heroId);
  else if (orderKnown) myTurn = heroIdOfEntry(state, entry) === heroId;
  else myTurn = combat && markIsCurrent(input.mark, state.turn);

  let currentName: string | null = null;
  if (entry) {
    const masked = input.playerPerspective && isTurnEntryMasked(state, entry, input.zonesById);
    currentName = masked ? 'Criatura desconocida' : entry.name;
  }

  const move = moveBudget(state, heroId);
  const actions = actionBudget(state, heroId);
  let actionBlock: string | null = null;
  if (limited) {
    if (!myTurn) actionBlock = ACTION_TURN_REASON;
    else if (actions.left <= 0) actionBlock = NO_ACTIONS_REASON;
  }
  let moveBlock: string | null = null;
  if (!input.canMove) moveBlock = 'El DM ha bloqueado el movimiento de tu ficha';
  else if (limited && !myTurn) moveBlock = 'Combate en curso: espera a tu turno para moverte';
  else if (limited && move.left <= 0) moveBlock = 'Ya no te queda movimiento este turno';

  return { combat, limited, orderKnown, myTurn, currentName, move, actions, actionBlock, moveBlock };
}

/**
 * Economy of a hero from the perspective of this client (player, or the player previewed by the DM).
 * `unlimited` is true when this client manages the game (DM): nothing is blocked for it.
 */
export function useHeroEconomy(heroId: string | null): (HeroEconomy & { unlimited: boolean }) | null {
  const ctx = usePanelContext();
  const fullState = useSessionStore((s) => (s.view?.role === 'dm' ? s.view.state : null));
  const zonesById = useSessionStore((s) => s.zonesById);
  const mark = useOwnTurnMark((s) => s.mark);
  const { state, effective, canManage, isDm, isPreview } = ctx;
  return useMemo(() => {
    if (!state || !heroId || !state.heroes[heroId]) return null;
    const eco = heroEconomy(state, heroId, {
      canMove: canManage ? true : effective?.canMoveOwnToken ?? true,
      fullState,
      mark,
      zonesById,
      playerPerspective: !isDm || isPreview,
    });
    if (!canManage) return { ...eco, unlimited: false };
    return { ...eco, unlimited: true, actionBlock: null, moveBlock: null };
  }, [state, heroId, effective, canManage, isDm, isPreview, fullState, mark, zonesById]);
}

/** "1 casilla" / "3 casillas". */
export function cellsText(n: number): string {
  return `${n} ${n === 1 ? 'casilla' : 'casillas'}`;
}

/** "1 acción" / "2 acciones". */
export function actionsText(n: number): string {
  return `${n} ${n === 1 ? 'acción' : 'acciones'}`;
}
