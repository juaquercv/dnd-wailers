import type { LightingPreset, SpellAnimation, WeatherType } from '../constants';
import type { OverviewMap, RuleSystem, SpawnPoint, Zone } from './campaign';
import type { CreatureAttack, HeroData, InventoryItem, NamedText } from './library';
import type { RollRequest, Roller } from './rollers';

export type SessionStatus = 'lobby' | 'playing' | 'paused' | 'ended';

export interface SessionSummary {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  hostUserId: string;
  hostName: string;
  status: SessionStatus;
  hostConnected: boolean;
  players: { userId: string; name: string; connected: boolean; heroName: string | null }[];
  /** True once the campaign has been started at least once (resumed sessions). */
  hasStarted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionPlayer {
  userId: string;
  name: string;
  color: string;
  heroId: string | null;
  ready: boolean;
  connected: boolean;
  joinedAt: string;
}

/** Hero sheet as held live by the session (copy of the library hero, written back on change). */
export interface HeroSheet {
  id: string;
  ownerId: string;
  name: string;
  imageUrl: string | null;
  level: number;
  categoryIds: string[];
  data: HeroData;
}

export interface TurnEntry {
  id: string;
  type: 'player' | 'creature' | 'npc' | 'custom';
  userId: string | null;
  heroId: string | null;
  tokenId: string | null;
  name: string;
  imageUrl: string | null;
  initiative: number | null;
}

export interface TurnState {
  mode: 'manual' | 'random';
  order: TurnEntry[];
  currentIndex: number;
  round: number;
}

/** Creature details snapshot (stripped for players without permission). */
export interface TokenStats {
  speed: string;
  abilities: Record<string, number>;
  attacks: CreatureAttack[];
  traits: NamedText[];
  resistances: string[];
  weaknesses: string[];
  immunities: string[];
  xp: number;
  cr: number | null;
  description: string;
}

export type TokenKind = 'hero' | 'creature' | 'npc' | 'item';

export interface Token {
  id: string;
  kind: TokenKind;
  entryId: string | null;
  heroId: string | null;
  ownerUserId: string | null;
  name: string;
  imageUrl: string | null;
  zoneId: string;
  levelId: string;
  /** Center position in level pixels. */
  x: number;
  y: number;
  /** Diameter in grid cells. */
  cells: number;
  /** Facing in degrees (0 = right/east), used for vision cones. */
  facing: number;
  /**
   * HP for creature/npc tokens. For hero tokens the server mirrors the hero sheet here on every change.
   * Players may receive null (hidden) depending on visibility settings.
   */
  hp: number | null;
  maxHp: number | null;
  tempHp: number;
  /** Players with enemyHp = 'bar' receive an approximate ratio (rounded to 0.1) instead of hp/maxHp. */
  hpRatio: number | null;
  ac: number | null;
  statuses: string[];
  /** Hidden from all players (a hero token stays visible to its own player). */
  hidden: boolean;
  /** Light carried by the token (torch). radius in px. */
  light: { radius: number; color: string } | null;
  /** Ring color. */
  color: string;
  /** Loot registered manually by the DM on this token. */
  loot: InventoryItem[];
  /** Null for players without enemy-details permission. */
  stats: TokenStats | null;
  /** DM-only notes; empty for players. */
  notes: string;
  /** Zone TokenElement this token was instantiated from. */
  sourceElementId: string | null;
}

export type VisionMode = 'all' | 'explored' | 'vision' | 'none';
export const VISION_MODE_LABELS: Record<VisionMode, string> = {
  all: 'Todo el mapa visible',
  explored: 'Solo lo explorado',
  vision: 'Solo lo que tiene delante',
  none: 'Nada (pantalla negra / escena)',
};

export interface VisibilitySettings {
  visionMode: VisionMode;
  /**
   * Vision radius in grid cells. Hero visionCells overrides the global value when set; a radius set
   * explicitly for a player (perPlayer) overrides both for that player's hero, also when teammates look
   * through it with sharedVision.
   */
  visionRadius: number;
  /** Cone aperture in degrees (360 = full circle). Cone points to token.facing; a perPlayer cone applies to that player's hero. */
  visionCone: number;
  /** Players see what any party member sees. */
  sharedVision: boolean;
  /** Image shown for visionMode 'none' (null = black screen). */
  sceneImageUrl: string | null;
  canSeeOverview: boolean;
  canSeeOtherZones: boolean;
  canSeeEnemyDetails: boolean;
  enemyHp: 'exact' | 'bar' | 'hidden';
  canSeeInitiative: boolean;
  canSeeOthersRolls: boolean;
  canSeeOthersInventory: boolean;
  canMoveOwnToken: boolean;
}

export interface SessionOptions {
  tradeNeedsApproval: boolean;
}

export interface ZoneLiveState {
  /** FogRegion ids revealed to players. */
  revealedFog: string[];
  /** Door wall id -> open (overrides Wall.open). */
  doors: Record<string, boolean>;
  /** Overrides of the zone defaults (null = use zone default). */
  weather: WeatherType | null;
  lighting: LightingPreset | null;
}

export interface AudioState {
  /** 'zone': each client plays the music/ambience of the zone it is viewing. 'manual': DM-chosen tracks for everyone. */
  mode: 'zone' | 'manual';
  music: { soundId: string; url: string; name: string } | null;
  ambience: { soundId: string; url: string; name: string } | null;
  /** DM master volume 0..1 applied on top of every user's own volumes. */
  master: number;
}

export type ProjectionKind = 'zone' | 'image' | 'entry' | 'overview';

export interface Projection {
  id: string;
  kind: ProjectionKind;
  title: string;
  zoneId: string | null;
  levelId: string | null;
  imageUrl: string | null;
  /** Snapshot of a library entry (creature/item/spell...) for kind 'entry'. */
  entry: { kind: string; name: string; imageUrl: string | null; description: string; details: { label: string; value: string }[] } | null;
  /** 'all' or specific player ids. */
  targets: 'all' | string[];
}

export interface TradeOffer {
  id: string;
  fromUserId: string;
  fromHeroId: string;
  toUserId: string;
  toHeroId: string;
  /** Inventory item ids of fromHero with quantities. */
  items: { itemId: string; quantity: number }[];
  gold: number;
  status: 'pending_target' | 'pending_dm' | 'accepted' | 'rejected' | 'cancelled';
  note: string;
  createdAt: string;
}

export interface TurnOffer {
  userId: string;
  rollerIds: string[];
}

export interface LiveState {
  version: number;
  sessionId: string;
  campaignId: string;
  name: string;
  hostUserId: string;
  status: SessionStatus;
  startedAt: string | null;
  players: Record<string, SessionPlayer>;
  heroes: Record<string, HeroSheet>;
  tokens: Record<string, Token>;
  /** Zones whose design-time TokenElements were already instantiated. */
  instantiatedZones: string[];
  turn: TurnState;
  zoneStates: Record<string, ZoneLiveState>;
  visibility: { global: VisibilitySettings; perPlayer: Record<string, Partial<VisibilitySettings>> };
  options: SessionOptions;
  /** userId -> levelId -> base64 bitset of explored grid cells (see vision.ts). */
  explored: Record<string, Record<string, string>>;
  /** Where the DM is looking (also the default zone for audio 'zone' mode on the DM client). */
  dmView: { zoneId: string; levelId: string } | null;
  rollRequests: RollRequest[];
  turnOffer: TurnOffer | null;
  audio: AudioState;
  projection: Projection | null;
  trades: TradeOffer[];
  savedAt: string | null;
}

/**
 * What a client receives. For the DM `state` is complete.
 * For players `state` is filtered by buildPlayerView(): hidden/out-of-sight tokens removed,
 * enemy stats/HP stripped by permission, other inventories hidden, only own explored data,
 * only own roll requests and trades, initiative emptied if not allowed (hidden creatures anonymized).
 */
export interface SessionView {
  role: 'dm' | 'player';
  meUserId: string;
  state: LiveState;
  /** Effective visibility for this player (for the DM: the global settings). */
  effective: VisibilitySettings;
}

/** Zone as delivered to session clients (filtered for players: no notes, no hidden elements, no DM notes). */
export interface SessionZone extends Zone {
  musicUrl: string | null;
  ambienceUrl: string | null;
}

export interface SessionZonesPayload {
  campaign: { id: string; name: string; rules: RuleSystem; spawn: SpawnPoint | null };
  zones: SessionZone[];
  /** Null for players without overview permission. */
  overview: OverviewMap | null;
}

export type LogType = 'chat' | 'roll' | 'system' | 'hp' | 'item' | 'turn' | 'move' | 'loot' | 'trade' | 'fx' | 'audio';

export interface LogEntry {
  id: string;
  sessionId: string;
  at: string;
  type: LogType;
  actorUserId: string | null;
  actorName: string | null;
  text: string;
  /** all = everyone; dm = DM only; user = DM + targetUserId (+ actor). */
  visibility: 'all' | 'dm' | 'user';
  targetUserId: string | null;
  data: unknown;
}

export type FxEvent =
  | { kind: 'shake'; intensity: number; durationMs: number }
  | { kind: 'flash'; color: string; durationMs: number }
  | {
      kind: 'spell';
      animation: SpellAnimation;
      zoneId: string;
      levelId: string;
      x: number;
      y: number;
      fromX: number | null;
      fromY: number | null;
      /** px */
      radius: number;
      label: string | null;
    }
  | { kind: 'boss'; name: string; subtitle: string | null; imageUrl: string | null; soundUrl: string | null };

export interface InitiativeDraw {
  entryId: string;
  name: string;
  imageUrl: string | null;
  /** Total = natural d20 + bonus. */
  roll: number;
  /** Natural d20 face (1..20). */
  natural?: number;
  /** Initiative bonus added to the natural roll. */
  bonus?: number;
}

/** Transient events (not part of state). */
export type SessionEvent =
  | { type: 'roll'; roll: import('./rollers').RollResult }
  | { type: 'ping'; userId: string; name: string; color: string; zoneId: string; levelId: string; x: number; y: number }
  | { type: 'fx'; fx: FxEvent }
  | { type: 'sfx'; url: string; name: string; volume: number }
  /** Chat lines arrive through `session:log` (type 'chat'); there is no chat SessionEvent. */
  | { type: 'toast'; level: 'info' | 'success' | 'warning' | 'error'; text: string }
  | { type: 'initiativeDraw'; draws: InitiativeDraw[]; order: string[] }
  | { type: 'rollRequest'; request: RollRequest }
  | { type: 'turnStart'; entry: TurnEntry; round: number; offeredRollers: Roller[] }
  | { type: 'tokenDrag'; tokenId: string; x: number; y: number; userId: string }
  | { type: 'kicked'; reason: string }
  | { type: 'sessionEnded'; reason: string };

export type SessionEventType = SessionEvent['type'];
