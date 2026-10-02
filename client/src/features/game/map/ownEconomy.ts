import { useSessionStore } from '../../../stores/session';
import { heroEconomy, type HeroEconomy } from '../hud/economyCore';
import { useOwnTurnMark } from '../hud/turnWatch';

export const MOVE_LOCKED_REASON = 'El DM ha bloqueado el movimiento de tu ficha';
export const OFF_TURN_MOVE_REASON = 'Combate en curso: espera a tu turno para moverte';
export const OFF_TURN_TURN_REASON = 'Combate en curso: solo puedes girar tu ficha en tu turno';

/** Turn economy of a hero as the player of this client sees it right now (outside React). Null for the DM. */
export function playerEconomyNow(heroId: string | null | undefined): HeroEconomy | null {
  const s = useSessionStore.getState();
  const view = s.view;
  if (!view || view.role === 'dm' || !heroId || !view.state.heroes[heroId]) return null;
  return heroEconomy(view.state, heroId, {
    canMove: view.effective.canMoveOwnToken,
    fullState: null,
    mark: useOwnTurnMark.getState().mark,
    zonesById: s.zonesById,
    playerPerspective: true,
  });
}

/**
 * Why the player cannot do a movement-free thing with the own hero now (turning, doors/stairs, zone edges):
 * it needs the DM's permission to move and, in combat, the hero's own turn. Null = allowed.
 */
export function freeMoveBlock(
  canMove: boolean,
  eco: Pick<HeroEconomy, 'limited' | 'myTurn'> | null,
  offTurnReason: string = OFF_TURN_MOVE_REASON,
): string | null {
  if (!canMove) return MOVE_LOCKED_REASON;
  if (eco && eco.limited && !eco.myTurn) return offTurnReason;
  return null;
}
