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
import { isTurnEntryMasked } from '../map/fog';

export const ACTION_TURN_REASON = 'Solo puedes usar acciones de combate en tu turno';
export const NO_ACTIONS_REASON = 'Ya no te quedan acciones de combate este turno';

/**
 * Own turn remembered from a 'turnStart' event, for players who cannot see the turn order: round and the
 * currentIndex of the first state received after the event.
 */
export interface OwnTurnMark {
  round: number;
  /** currentIndex once the state of that turn arrived (null until then). */
  index: number | null;
  /** State version when the event arrived. */
  version: number;
}

/** True while the remembered turn is still the current one. */
export function markIsCurrent(mark: OwnTurnMark | null, turn: { round: number; currentIndex: number }): boolean {
  if (!mark || mark.round !== turn.round) return false;
  return mark.index === null || mark.index === turn.currentIndex;
}

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

/** "1 casilla" / "3 casillas". */
export function cellsText(n: number): string {
  return `${n} ${n === 1 ? 'casilla' : 'casillas'}`;
}

/** "1 acción" / "2 acciones". */
export function actionsText(n: number): string {
  return `${n} ${n === 1 ? 'acción' : 'acciones'}`;
}
