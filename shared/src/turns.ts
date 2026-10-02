import { gridDistance, type Point } from './grid';
import type { GridConfig } from './types/campaign';
import type { HeroData } from './types/library';
import type { LiveState, SessionOptions, TurnEntry, TurnUsage } from './types/session';

/*
 * Turn economy: while combat is active (turn.combat) and the session option turnEconomy is on,
 * a player's hero moves only on its own turn, up to its movement per turn, and spends combat actions
 * (spells, using items, attacks). Free actions (pick up items, doors, trades, chat, pings) cost nothing.
 * The DM is never limited.
 */

/** 5e convention: one grid cell = 1.5 m = 5 ft. */
export const CELL_METERS = 1.5;
export const CELL_FEET = 5;
export const DEFAULT_MOVE_CELLS = 6;
export const DEFAULT_ACTIONS_PER_TURN = 1;

/**
 * Cells from a free-text speed: "9 m", "9 metros", "30 ft", "30 pies", "6 casillas", "6 cuadros".
 * A bare number is read as meters (Spanish D&D convention). null when no number is found.
 */
export function parseSpeedCells(speed: string | null | undefined): number | null {
  if (!speed) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ.]*)/i.exec(speed.trim());
  if (!m) return null;
  const value = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = m[2]!.toLowerCase().replace(/\./g, '');
  if (unit.startsWith('ft') || unit.startsWith('pie') || unit === 'p' || unit.startsWith('feet') || unit.startsWith('foot')) {
    return Math.floor(value / CELL_FEET);
  }
  if (unit.startsWith('cas') || unit.startsWith('cua') || unit.startsWith('cel') || unit === 'c' || unit.startsWith('sq')) {
    return Math.floor(value);
  }
  return Math.floor(value / CELL_METERS);
}

/** Movement per turn in cells: data.moveCells when set, else derived from data.speed, else 6. */
export function heroMoveCells(data: Pick<HeroData, 'speed' | 'moveCells'>): number {
  const explicit = data.moveCells;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  return parseSpeedCells(data.speed) ?? DEFAULT_MOVE_CELLS;
}

/** Combat actions per turn: data.actionsPerTurn when set, else 1. */
export function heroActionsPerTurn(data: Pick<HeroData, 'actionsPerTurn'>): number {
  const n = data.actionsPerTurn;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_ACTIONS_PER_TURN;
}

/** Session options with defaults for fields missing in older saved states. */
export function sessionOptionsOf(state: Pick<LiveState, 'options'>): Required<SessionOptions> {
  const o = state.options ?? ({} as SessionOptions);
  return {
    tradeNeedsApproval: o.tradeNeedsApproval ?? false,
    turnEconomy: o.turnEconomy ?? true,
    playersCanPickUp: o.playersCanPickUp ?? true,
    playersCanUseDoors: o.playersCanUseDoors ?? true,
  };
}

export function isCombatActive(state: Pick<LiveState, 'turn' | 'status'>): boolean {
  return state.status === 'playing' && state.turn.combat === true;
}

/** True when the movement/action limits apply right now (combat active + turnEconomy option). */
export function economyApplies(state: Pick<LiveState, 'turn' | 'status' | 'options'>): boolean {
  return isCombatActive(state) && sessionOptionsOf(state).turnEconomy;
}

export function currentTurnEntry(state: Pick<LiveState, 'turn'>): TurnEntry | null {
  const { order, currentIndex } = state.turn;
  return order[currentIndex] ?? null;
}

/** Hero id behind a turn entry (its heroId, or the hero selected by its player). */
export function heroIdOfEntry(state: Pick<LiveState, 'players'>, entry: TurnEntry | null): string | null {
  if (!entry) return null;
  if (entry.heroId) return entry.heroId;
  if (entry.userId) return state.players[entry.userId]?.heroId ?? null;
  return null;
}

/** True when it is currently this hero's turn. */
export function isHeroTurn(state: Pick<LiveState, 'turn' | 'players'>, heroId: string): boolean {
  return heroIdOfEntry(state, currentTurnEntry(state)) === heroId;
}

export function emptyUsage(): TurnUsage {
  return { moved: 0, actions: 0, bonusMove: 0, bonusActions: 0 };
}

export function usageOf(state: Pick<LiveState, 'turn'>, heroId: string): TurnUsage {
  return { ...emptyUsage(), ...(state.turn.usage?.[heroId] ?? {}) };
}

export interface Budget {
  max: number;
  used: number;
  left: number;
}

/** Movement budget of a hero this turn (cells). */
export function moveBudget(state: Pick<LiveState, 'turn' | 'heroes'>, heroId: string): Budget {
  const hero = state.heroes[heroId];
  const usage = usageOf(state, heroId);
  const max = (hero ? heroMoveCells(hero.data) : DEFAULT_MOVE_CELLS) + Math.max(0, usage.bonusMove);
  return { max, used: usage.moved, left: Math.max(0, max - usage.moved) };
}

/** Combat action budget of a hero this turn. */
export function actionBudget(state: Pick<LiveState, 'turn' | 'heroes'>, heroId: string): Budget {
  const hero = state.heroes[heroId];
  const usage = usageOf(state, heroId);
  const max = (hero ? heroActionsPerTurn(hero.data) : DEFAULT_ACTIONS_PER_TURN) + Math.max(0, usage.bonusActions);
  return { max, used: usage.actions, left: Math.max(0, max - usage.actions) };
}

/** Movement cost in cells between two points (square: Chebyshev, hex: hex distance). */
export function moveCost(from: Point, to: Point, grid: GridConfig): number {
  return gridDistance(from, to, grid);
}

export type EconomyCheck = { ok: true; cost: number } | { ok: false; reason: string };

/**
 * Can a player move their hero from `from` to `to` now? Outside combat (or with turnEconomy off)
 * always ok. In combat: only on the hero's own turn and within the movement left.
 */
export function checkPlayerMove(state: LiveState, heroId: string, from: Point, to: Point, grid: GridConfig): EconomyCheck {
  const cost = moveCost(from, to, grid);
  if (!economyApplies(state)) return { ok: true, cost };
  if (!isHeroTurn(state, heroId)) return { ok: false, reason: 'Combate en curso: espera a tu turno para moverte' };
  const { left } = moveBudget(state, heroId);
  if (cost > left) {
    return {
      ok: false,
      reason: left === 0 ? 'Ya no te queda movimiento este turno' : `Solo te ${left === 1 ? 'queda 1 casilla' : `quedan ${left} casillas`} de movimiento este turno`,
    };
  }
  return { ok: true, cost };
}

/** Can a player spend a combat action now? Outside combat (or with turnEconomy off) always ok (cost 0). */
export function checkPlayerAction(state: LiveState, heroId: string): EconomyCheck {
  if (!economyApplies(state)) return { ok: true, cost: 0 };
  if (!isHeroTurn(state, heroId)) return { ok: false, reason: 'Solo puedes usar acciones de combate en tu turno' };
  if (actionBudget(state, heroId).left <= 0) return { ok: false, reason: 'Ya no te quedan acciones de combate este turno' };
  return { ok: true, cost: 1 };
}
