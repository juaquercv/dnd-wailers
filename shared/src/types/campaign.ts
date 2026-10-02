import type { LayerId, LightingPreset, WeatherType, ZoneType } from '../constants';
import type { VisibilitySettings } from './session';

// ---------------------------------------------------------------------------
// Rule system (per campaign)
// ---------------------------------------------------------------------------

export type MagicMode = 'mana' | 'slots' | 'uses' | 'none';

export interface MagicRules {
  mode: MagicMode;
  /** Display name of the mana resource, e.g. "Maná". */
  manaName: string;
  /** Points restored when the DM presses "Regenerar maná" (or at turn start if autoRegen). */
  manaRegenPerTurn: number;
  /** Regenerate automatically at the start of each hero's turn. Default false. */
  manaAutoRegen: boolean;
  /** Suggested max mana per character level for new heroes. */
  manaPerLevel: number;
  /** slotsTable[characterLevel - 1][spellLevel - 1] = max slots. 20 rows x 9 columns. */
  slotsTable: number[][];
}

export interface AttributeDef {
  key: string;
  label: string;
  short: string;
  enabled: boolean;
}

export interface RestRule {
  enabled: boolean;
  label: string;
  /** 0..100 percentage of max HP restored. */
  restoreHpPct: number;
  restoreMana: 'none' | 'half' | 'full';
  restoreSlots: boolean;
  /** Reset LimitedUse entries whose resetOn matches this rest (long also resets short). */
  resetUses: boolean;
}

export interface RuleSystem {
  magic: MagicRules;
  attributes: AttributeDef[];
  showAc: boolean;
  showSpeed: boolean;
  showInitiative: boolean;
  xpEnabled: boolean;
  inventory: { mode: 'none' | 'weight' | 'slots'; maxWeight: number; maxSlots: number };
  currency: { enabled: boolean; name: string; short: string };
  rest: { short: RestRule; long: RestRule };
  heroCreation: {
    allowNew: boolean;
    startingLevel: number;
    maxLevel: number;
    startingGold: number;
    abilityMethod: 'free' | 'standard_array' | 'point_buy';
    /** Category ids (hero kind) allowed; empty = all. */
    allowedRaceIds: string[];
    allowedClassIds: string[];
  };
  /** Players may roll free dice (public) from their own tray. */
  playersCanRollFreely: boolean;
  /** Players may adjust their own mana/slots/limited uses (never HP, gold, XP or inventory). */
  playersCanEditOwnResources: boolean;
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export interface SpawnPoint {
  zoneId: string;
  levelId: string;
  x: number;
  y: number;
}

export interface OverviewPin {
  id: string;
  zoneId: string;
  x: number;
  y: number;
  label: string | null;
  icon: string | null;
}

export interface OverviewLink {
  id: string;
  fromPinId: string;
  toPinId: string;
  style: 'road' | 'path' | 'sea' | 'secret';
}

export interface OverviewMap {
  imageUrl: string | null;
  width: number;
  height: number;
  pins: OverviewPin[];
  links: OverviewLink[];
}

export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  ownerId: string;
  ownerName: string;
  zoneCount: number;
  magicMode: MagicMode;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Campaign extends CampaignSummary {
  rules: RuleSystem;
  overview: OverviewMap;
  spawn: SpawnPoint | null;
  defaultVisibility: VisibilitySettings;
}

// ---------------------------------------------------------------------------
// Zones (= "slides")
// ---------------------------------------------------------------------------

export interface GridConfig {
  type: 'square' | 'hex';
  /** Square: cell side in px. Hex (pointy-top): distance between adjacent hex centers in a row, in px. */
  size: number;
  show: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  snap: boolean;
}

export interface LevelBackground {
  url: string | null;
  width: number;
  height: number;
  color: string;
}

interface ElementBase {
  id: string;
  layer: LayerId;
  x: number;
  y: number;
  rotation: number;
  /** Hidden elements are only visible to the DM. */
  hidden: boolean;
  locked: boolean;
  name: string;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  url: string;
  width: number;
  height: number;
  opacity: number;
  /** Library entry the image came from, if any. */
  entryId: string | null;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/** Freehand strokes, lines and polygons. Points are relative to (x, y). */
export interface PathElement extends ElementBase {
  type: 'path';
  points: number[];
  stroke: string;
  strokeWidth: number;
  closed: boolean;
  fill: string | null;
  opacity: number;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
}

/** Labels / map markers. icon is an emoji or a lucide icon name. */
export interface MarkerElement extends ElementBase {
  type: 'marker';
  icon: string;
  label: string;
  color: string;
}

/** A library creature/item placed at design time; instantiated as a live Token when the session first loads the zone. */
export interface TokenElement extends ElementBase {
  type: 'token';
  entryId: string;
  entryKind: 'creature' | 'item';
  label: string;
  /** Diameter in grid cells. */
  cells: number;
  imageUrl: string | null;
  /** Live token starts hidden from players. */
  startHidden: boolean;
}

export type TransitionType = 'door' | 'entrance' | 'stairs_up' | 'stairs_down' | 'portal';

/** Doors, entrances, stairs: link to another zone / sub-zone / level. Rect centered at (x, y). */
export interface TransitionElement extends ElementBase {
  type: 'transition';
  transitionType: TransitionType;
  width: number;
  height: number;
  label: string;
  target: SpawnPoint | null;
}

/** Private DM note pinned to the map (layer 'notes'). Never sent to players. */
export interface NoteElement extends ElementBase {
  type: 'note';
  text: string;
  color: string;
}

export type SceneElement =
  | ImageElement
  | ShapeElement
  | PathElement
  | TextElement
  | MarkerElement
  | TokenElement
  | TransitionElement
  | NoteElement;

export type SceneElementType = SceneElement['type'];

/** Polyline wall. Absolute coordinates [x1, y1, x2, y2, ...]. */
export interface Wall {
  id: string;
  points: number[];
  /** wall + closed door block vision; window and open door do not. */
  kind: 'wall' | 'door' | 'window';
  /** Default state for doors. */
  open: boolean;
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  /** px */
  radius: number;
  color: string;
  /** 0..1 */
  intensity: number;
  flicker: boolean;
}

/** Polygon (absolute points) hidden from players until the DM reveals it in a session. */
export interface FogRegion {
  id: string;
  name: string;
  points: number[];
}

export interface ZoneLevel {
  id: string;
  name: string;
  /** Floor index: 0 = ground, negative = basement, positive = upper floors. Used for parallax stacking. */
  elevation: number;
  background: LevelBackground;
  grid: GridConfig;
  elements: SceneElement[];
  walls: Wall[];
  lights: LightSource[];
  fogRegions: FogRegion[];
}

export interface ZoneNeighbors {
  up: string | null;
  down: string | null;
  left: string | null;
  right: string | null;
}

/** The editable content of a zone (shared by campaign zones and zone templates). */
/**
 * Default vision inside a zone (e.g. a dark cave). Players whose hero is in the zone get this vision
 * unless the DM set a personal vision for them. null/undefined = campaign default (everything visible).
 */
export interface ZoneVision {
  mode: 'all' | 'explored' | 'vision';
  /** Grid cells, for 'explored' and 'vision'. */
  radius: number;
  /** Degrees (360 = full circle). */
  cone: number;
}

export interface ZoneContent {
  zoneType: ZoneType;
  biome: string;
  weather: WeatherType;
  lighting: LightingPreset;
  levels: ZoneLevel[];
  defaultLevelId: string;
  notes: string;
  /** Default vision in this zone; null/undefined = campaign default. */
  vision?: ZoneVision | null;
}

export interface Zone extends ZoneContent {
  id: string;
  campaignId: string;
  name: string;
  /** Slide order (0-based) inside the campaign. */
  order: number;
  /** Sub-zones (house, cave...) point to their parent zone. */
  parentZoneId: string | null;
  /** Position in the zone grid; neighbors are derived from adjacency in the grid editor. */
  gridPos: { x: number; y: number } | null;
  neighbors: ZoneNeighbors;
  musicSoundId: string | null;
  ambienceSoundId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ZoneInput = Partial<Omit<Zone, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'>>;
