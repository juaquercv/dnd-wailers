import { SIZE_INFO, type CreatureSize, type EntryKind } from './constants';
import { newId } from './ids';
import type {
  GridConfig,
  OverviewMap,
  SceneElement,
  ZoneContent,
  ZoneLevel,
  ZoneNeighbors,
} from './types/campaign';
import type {
  CreatureData,
  EntryDataMap,
  HeroData,
  InventoryItem,
  ItemData,
  LibraryEntry,
  SoundData,
  SpellData,
  ZoneTemplateData,
} from './types/library';
import type { AudioState, LiveState, SessionOptions, TurnState, VisibilitySettings, ZoneLiveState } from './types/session';

export function defaultGrid(): GridConfig {
  return { type: 'square', size: 70, show: true, color: '#000000', opacity: 0.25, offsetX: 0, offsetY: 0, snap: true };
}

export function createZoneLevel(name = 'Planta baja', elevation = 0): ZoneLevel {
  return {
    id: newId('lvl'),
    name,
    elevation,
    background: { url: null, width: 2100, height: 1400, color: '#2b2a24' },
    grid: defaultGrid(),
    elements: [],
    walls: [],
    lights: [],
    fogRegions: [],
  };
}

export function emptyNeighbors(): ZoneNeighbors {
  return { up: null, down: null, left: null, right: null };
}

export function createZoneContent(): ZoneContent {
  const level = createZoneLevel();
  return {
    zoneType: 'exterior',
    biome: '',
    weather: 'none',
    lighting: 'day',
    levels: [level],
    defaultLevelId: level.id,
    notes: '',
  };
}

/** Deep copy of zone content with fresh ids for levels, elements, walls, lights and fog (template instantiation / duplicate). */
export function cloneZoneContent(content: ZoneContent): ZoneContent {
  const copy = structuredClone(content);
  const levelIdMap = new Map<string, string>();
  for (const level of copy.levels) {
    const newLevelId = newId('lvl');
    levelIdMap.set(level.id, newLevelId);
    level.id = newLevelId;
    level.elements = level.elements.map((el) => ({ ...el, id: newId('el') }) as SceneElement);
    level.walls = level.walls.map((w) => ({ ...w, id: newId('wall') }));
    level.lights = level.lights.map((l) => ({ ...l, id: newId('light') }));
    level.fogRegions = level.fogRegions.map((f) => ({ ...f, id: newId('fog') }));
  }
  copy.defaultLevelId = levelIdMap.get(copy.defaultLevelId) ?? copy.levels[0]?.id ?? '';
  return copy;
}

export function emptyOverview(): OverviewMap {
  return { imageUrl: null, width: 2000, height: 1300, pins: [], links: [] };
}

export function defaultVisibility(): VisibilitySettings {
  return {
    visionMode: 'all',
    visionRadius: 6,
    visionCone: 360,
    sharedVision: true,
    sceneImageUrl: null,
    canSeeOverview: true,
    canSeeOtherZones: false,
    canSeeEnemyDetails: false,
    enemyHp: 'bar',
    canSeeInitiative: true,
    canSeeOthersRolls: true,
    canSeeOthersInventory: false,
    canMoveOwnToken: true,
  };
}

export function defaultSessionOptions(): SessionOptions {
  return { tradeNeedsApproval: false };
}

export function defaultTurnState(): TurnState {
  return { mode: 'manual', order: [], currentIndex: 0, round: 1 };
}

export function defaultAudioState(): AudioState {
  return { mode: 'zone', music: null, ambience: null, master: 1 };
}

export function emptyZoneLiveState(): ZoneLiveState {
  return { revealedFog: [], doors: {}, weather: null, lighting: null };
}

export function createLiveState(init: {
  sessionId: string;
  campaignId: string;
  name: string;
  hostUserId: string;
  visibility?: VisibilitySettings;
}): LiveState {
  return {
    version: 0,
    sessionId: init.sessionId,
    campaignId: init.campaignId,
    name: init.name,
    hostUserId: init.hostUserId,
    status: 'lobby',
    startedAt: null,
    players: {},
    heroes: {},
    tokens: {},
    instantiatedZones: [],
    turn: defaultTurnState(),
    zoneStates: {},
    visibility: { global: init.visibility ?? defaultVisibility(), perPlayer: {} },
    options: defaultSessionOptions(),
    explored: {},
    dmView: null,
    rollRequests: [],
    turnOffer: null,
    audio: defaultAudioState(),
    projection: null,
    trades: [],
    savedAt: null,
  };
}

export function emptyCreatureData(): CreatureData {
  return {
    isNpc: false,
    ac: 12,
    speed: '9 m',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    attacks: [],
    traits: [],
    resistances: [],
    weaknesses: [],
    immunities: [],
    suggestedLoot: [],
    xp: 0,
    tokenCells: null,
    notes: '',
  };
}

export function emptyItemData(): ItemData {
  return { magic: false, attunement: false, stackable: false, effects: '', damage: '', armorClass: null, charges: null, slots: 1 };
}

export function emptySpellData(): SpellData {
  return {
    school: '',
    castingTime: '1 acción',
    range: '18 m',
    duration: 'Instantáneo',
    components: 'V, S',
    concentration: false,
    manaCost: 5,
    slotLevel: 1,
    effect: '',
    damage: '',
    damageType: '',
    animation: 'arcane',
    classes: [],
  };
}

export function emptySoundData(): SoundData {
  return { url: '', soundType: 'effect', loop: false, volume: 0.8, durationSec: null };
}

export function emptyZoneTemplateData(): ZoneTemplateData {
  return { content: createZoneContent() };
}

export function emptyHeroData(): HeroData {
  return {
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    ac: 10,
    speed: '9 m',
    initiativeBonus: 0,
    xp: 0,
    gold: 0,
    inventory: [],
    spells: [],
    resources: { mana: { current: 0, max: 0 }, slots: [], uses: [] },
    statuses: [],
    visionCells: null,
    notes: '',
  };
}

export function emptyEntryData<K extends EntryKind>(kind: K): EntryDataMap[K] {
  const map: { [P in EntryKind]: () => EntryDataMap[P] } = {
    creature: emptyCreatureData,
    item: emptyItemData,
    spell: emptySpellData,
    zone: emptyZoneTemplateData,
    sound: emptySoundData,
    hero: emptyHeroData,
  };
  return map[kind]() as EntryDataMap[K];
}

/** Inventory item instance copied from a library item entry (independent from later library edits). */
export function inventoryItemFromEntry(entry: LibraryEntry<'item'>, quantity = 1): InventoryItem {
  return {
    id: newId('inv'),
    entryId: entry.id,
    name: entry.name,
    imageUrl: entry.imageUrl,
    quantity,
    weight: entry.weight ?? 0,
    value: entry.value ?? 0,
    slots: entry.data.slots ?? 1,
    rarity: entry.rarity,
    description: entry.description,
    equipped: false,
    notes: '',
  };
}

export function customInventoryItem(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: newId('inv'),
    entryId: null,
    name: 'Objeto',
    imageUrl: null,
    quantity: 1,
    weight: 0,
    value: 0,
    slots: 1,
    rarity: null,
    description: '',
    equipped: false,
    notes: '',
    ...partial,
  };
}

export function cellsForSize(size: CreatureSize | null | undefined): number {
  return size ? SIZE_INFO[size].cells : 1;
}
