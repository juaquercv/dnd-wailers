/**
 * Rollers = campaign-owned custom dice and roulettes.
 * Results are purely visual: nothing is ever applied automatically.
 */

export type RollerKind = 'roulette' | 'dice';

export interface RouletteSegment {
  id: string;
  label: string;
  color: string;
  /** Relative probability weight (> 0). */
  weight: number;
  /** Optional emoji. */
  icon: string | null;
  description: string;
}

export interface Roller {
  id: string;
  campaignId: string;
  campaignName: string;
  name: string;
  kind: RollerKind;
  description: string;
  tags: string[];
  /** Inactive rollers are hidden from quick menus and never offered. */
  active: boolean;
  /** Offered to each player at the start of their turn. */
  isTurnRoll: boolean;
  /** kind = 'roulette' */
  segments: RouletteSegment[];
  /** kind = 'dice': standard formula, e.g. "1d20", "2d6+3". Used when faces is null/empty. */
  formula: string | null;
  /** kind = 'dice': custom die with labelled faces (uniform probability). */
  faces: string[] | null;
  copiedFromId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type RollerInput = Partial<
  Pick<Roller, 'name' | 'kind' | 'description' | 'tags' | 'active' | 'isTurnRoll' | 'segments' | 'formula' | 'faces' | 'sortOrder'>
>;

export type RollVisibility = 'public' | 'player' | 'secret';
export const ROLL_VISIBILITY_LABELS: Record<RollVisibility, string> = {
  public: 'Pública (todos)',
  player: 'Solo para un jugador',
  secret: 'Secreta (solo DM)',
};

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface DieResult {
  sides: number;
  value: number;
  /** Dropped by advantage/disadvantage or keep-highest/lowest. */
  dropped: boolean;
}

export interface RollResult {
  id: string;
  sessionId: string;
  at: string;
  rollerUserId: string;
  rollerName: string;
  byDm: boolean;
  kind: 'dice' | 'roulette' | 'custom_die';
  label: string;
  /** dice */
  formula: string | null;
  mode: RollMode;
  dice: DieResult[];
  modifier: number;
  total: number | null;
  /** roulette / custom die */
  rollerId: string | null;
  segments: RouletteSegment[] | null;
  segment: RouletteSegment | null;
  faces: string[] | null;
  face: string | null;
  visibility: RollVisibility;
  /** For visibility 'player': the single player allowed to see it (plus the DM). */
  targetUserId: string | null;
  requestId: string | null;
  /** Natural 20 / natural 1 on a single kept d20. */
  crit: 'success' | 'fail' | null;
}

export interface RollRequest {
  id: string;
  sessionId: string;
  targetUserId: string;
  requestedBy: string;
  label: string;
  formula: string | null;
  rollerId: string | null;
  mode: RollMode;
  visibility: RollVisibility;
  source: 'dm' | 'turn';
  createdAt: string;
}
