import { describe, expect, it } from 'vitest';
import {
  actionBudget,
  checkPlayerAction,
  checkPlayerMove,
  economyApplies,
  heroActionsPerTurn,
  heroMoveCells,
  isHeroTurn,
  moveBudget,
  parseSpeedCells,
  sessionOptionsOf,
} from '../turns';
import { effectiveVisibility, zoneVisionFor } from '../view';
import { fixture, grid } from './helpers';

function combatFixture() {
  const f = fixture();
  f.state.turn.order = [
    { id: 'e_juan', type: 'player', userId: 'juan', heroId: 'h_juan', tokenId: 't_juan', name: 'Juan', imageUrl: null, initiative: 15 },
    { id: 'e_pat', type: 'player', userId: 'patrick', heroId: 'h_pat', tokenId: 't_pat', name: 'Patrick', imageUrl: null, initiative: 10 },
  ];
  f.state.turn.currentIndex = 0;
  f.state.turn.combat = true;
  f.state.heroes.h_juan!.data.speed = '9 m';
  return f;
}

describe('parseSpeedCells / hero limits', () => {
  it('reads meters, feet and cells', () => {
    expect(parseSpeedCells('9 m')).toBe(6);
    expect(parseSpeedCells('9 metros')).toBe(6);
    expect(parseSpeedCells('7,5 m')).toBe(5);
    expect(parseSpeedCells('30 ft')).toBe(6);
    expect(parseSpeedCells('25 pies')).toBe(5);
    expect(parseSpeedCells('5 casillas')).toBe(5);
    expect(parseSpeedCells('4 cuadros')).toBe(4);
    expect(parseSpeedCells('12')).toBe(8);
    expect(parseSpeedCells('rápido')).toBeNull();
    expect(parseSpeedCells('')).toBeNull();
  });

  it('prefers moveCells and defaults sensibly', () => {
    expect(heroMoveCells({ speed: '9 m', moveCells: 4 })).toBe(4);
    expect(heroMoveCells({ speed: '9 m', moveCells: null })).toBe(6);
    expect(heroMoveCells({ speed: '???' })).toBe(6);
    expect(heroActionsPerTurn({})).toBe(1);
    expect(heroActionsPerTurn({ actionsPerTurn: 2 })).toBe(2);
  });

  it('fills missing session options with defaults', () => {
    expect(sessionOptionsOf({ options: { tradeNeedsApproval: true } })).toEqual({
      tradeNeedsApproval: true,
      turnEconomy: true,
      playersCanPickUp: true,
      playersCanUseDoors: true,
    });
  });
});

describe('turn economy', () => {
  it('does not apply outside combat', () => {
    const f = combatFixture();
    f.state.turn.combat = false;
    expect(economyApplies(f.state)).toBe(false);
    const res = checkPlayerMove(f.state, 'h_pat', { x: 25, y: 25 }, { x: 975, y: 975 }, grid());
    expect(res.ok).toBe(true);
    expect(checkPlayerAction(f.state, 'h_pat').ok).toBe(true);
  });

  it('only lets the current hero move, within its budget', () => {
    const f = combatFixture();
    const g = grid({ size: 50 });
    expect(isHeroTurn(f.state, 'h_juan')).toBe(true);
    expect(checkPlayerMove(f.state, 'h_pat', { x: 225, y: 225 }, { x: 275, y: 225 }, g)).toEqual({
      ok: false,
      reason: 'Combate en curso: espera a tu turno para moverte',
    });
    expect(checkPlayerMove(f.state, 'h_juan', { x: 525, y: 525 }, { x: 675, y: 525 }, g)).toEqual({ ok: true, cost: 3 });
    f.state.turn.usage = { h_juan: { moved: 5, actions: 0, bonusMove: 0, bonusActions: 0 } };
    expect(moveBudget(f.state, 'h_juan')).toEqual({ max: 6, used: 5, left: 1 });
    const tooFar = checkPlayerMove(f.state, 'h_juan', { x: 525, y: 525 }, { x: 675, y: 525 }, g);
    expect(tooFar).toEqual({ ok: false, reason: 'Solo te queda 1 casilla de movimiento este turno' });
    f.state.turn.usage.h_juan!.bonusMove = 2;
    expect(checkPlayerMove(f.state, 'h_juan', { x: 525, y: 525 }, { x: 675, y: 525 }, g).ok).toBe(true);
  });

  it('counts combat actions and respects turnEconomy off', () => {
    const f = combatFixture();
    expect(checkPlayerAction(f.state, 'h_juan')).toEqual({ ok: true, cost: 1 });
    f.state.turn.usage = { h_juan: { moved: 0, actions: 1, bonusMove: 0, bonusActions: 0 } };
    expect(actionBudget(f.state, 'h_juan').left).toBe(0);
    expect(checkPlayerAction(f.state, 'h_juan')).toEqual({ ok: false, reason: 'Ya no te quedan acciones de combate este turno' });
    expect(checkPlayerAction(f.state, 'h_pat')).toEqual({ ok: false, reason: 'Solo puedes usar acciones de combate en tu turno' });
    f.state.options = { ...f.state.options, turnEconomy: false };
    expect(checkPlayerAction(f.state, 'h_juan').ok).toBe(true);
  });
});

describe('zone vision', () => {
  it('a player gets the vision of the zone their hero is in, personal settings win', () => {
    const f = fixture();
    expect(effectiveVisibility(f.state, 'juan').visionMode).toBe(f.state.visibility.global.visionMode);
    f.state.zoneVision = { A: { mode: 'vision', radius: 3, cone: 360 } };
    expect(zoneVisionFor(f.state, 'A')).toEqual({ mode: 'vision', radius: 3, cone: 360 });
    const juan = effectiveVisibility(f.state, 'juan');
    expect(juan.visionMode).toBe('vision');
    expect(juan.visionRadius).toBe(3);
    // patrick is in zone B (no zone vision) -> starting values.
    expect(effectiveVisibility(f.state, 'patrick').visionMode).toBe(f.state.visibility.global.visionMode);
    // Live override of the zone by the DM.
    f.state.zoneStates.A = { revealedFog: [], doors: {}, weather: null, lighting: null, vision: { mode: 'explored', radius: 5, cone: 360 } };
    expect(effectiveVisibility(f.state, 'juan').visionMode).toBe('explored');
    // Personal vision set by the DM wins over the zone.
    f.state.visibility.perPlayer.juan = { visionMode: 'all' };
    expect(effectiveVisibility(f.state, 'juan').visionMode).toBe('all');
    // Leaving the zone: juan's hero moves to B and gets B's (default) vision when the override is cleared.
    delete f.state.visibility.perPlayer.juan;
    f.state.tokens.t_juan!.zoneId = 'B';
    f.state.tokens.t_juan!.levelId = 'lvl_B';
    expect(effectiveVisibility(f.state, 'juan').visionMode).toBe(f.state.visibility.global.visionMode);
  });
});
