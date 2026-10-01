import { createLiveState, defaultGrid, emptyHeroData } from '../defaults';
import type { GridConfig, SceneElement, Wall, Zone, ZoneLevel } from '../types/campaign';
import type { InventoryItem } from '../types/library';
import type { RouletteSegment } from '../types/rollers';
import type { HeroSheet, LiveState, SessionPlayer, SessionZone, Token } from '../types/session';

/** Deterministic PRNG (mulberry32) returning [0, 1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rng that yields the given values in order (cycling). */
export function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i++;
    return v;
  };
}

/** rng value that makes rollDie(sides) return `face`. */
export function faceValue(face: number, sides: number): number {
  return (face - 1 + 0.5) / sides;
}

export function grid(partial: Partial<GridConfig> = {}): GridConfig {
  return { ...defaultGrid(), ...partial };
}

export function segment(id: string, weight: number): RouletteSegment {
  return { id, label: id.toUpperCase(), color: '#ffffff', weight, icon: null, description: '' };
}

export function level(id: string, partial: Partial<ZoneLevel> = {}): ZoneLevel {
  return {
    id,
    name: `Nivel ${id}`,
    elevation: 0,
    background: { url: null, width: 1000, height: 1000, color: '#000000' },
    grid: grid({ size: 50 }),
    elements: [],
    walls: [],
    lights: [],
    fogRegions: [],
    ...partial,
  };
}

export function zone(id: string, levels: ZoneLevel[] = [level(`lvl_${id}`)]): Zone {
  return {
    id,
    campaignId: 'c1',
    name: `Zona ${id}`,
    order: 0,
    parentZoneId: null,
    gridPos: null,
    neighbors: { up: null, down: null, left: null, right: null },
    musicSoundId: null,
    ambienceSoundId: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    zoneType: 'exterior',
    biome: '',
    weather: 'none',
    lighting: 'day',
    levels,
    defaultLevelId: levels[0]?.id ?? '',
    notes: 'Notas secretas del DM',
  };
}

export function sessionZone(z: Zone): SessionZone {
  return { ...z, musicUrl: null, ambienceUrl: null };
}

export function wall(id: string, points: number[], kind: Wall['kind'] = 'wall', open = false): Wall {
  return { id, points, kind, open };
}

export function item(id: string, name = 'Poción'): InventoryItem {
  return {
    id,
    entryId: null,
    name,
    imageUrl: null,
    quantity: 1,
    weight: 1,
    value: 50,
    slots: 1,
    rarity: 'common',
    description: '',
    equipped: false,
    notes: '',
  };
}

export function token(partial: Partial<Token> & Pick<Token, 'id' | 'kind' | 'zoneId' | 'levelId' | 'x' | 'y'>): Token {
  return {
    entryId: null,
    heroId: null,
    ownerUserId: null,
    name: partial.id,
    imageUrl: null,
    cells: 1,
    facing: 0,
    hp: null,
    maxHp: null,
    tempHp: 0,
    hpRatio: null,
    ac: null,
    statuses: [],
    hidden: false,
    light: null,
    color: '#ff0000',
    loot: [],
    stats: null,
    notes: '',
    sourceElementId: null,
    ...partial,
  };
}

export function hero(id: string, ownerId: string, hp = { current: 20, max: 30, temp: 2 }): HeroSheet {
  const data = emptyHeroData();
  data.hp = { ...hp };
  data.gold = 120;
  data.inventory = [item(`inv_${id}`, `Espada de ${ownerId}`)];
  data.notes = `Notas privadas de ${ownerId}`;
  data.statuses = ['blessed'];
  data.resources.mana = { current: 5, max: 10 };
  return { id, ownerId, name: `Héroe ${ownerId}`, imageUrl: null, level: 3, categoryIds: [], data };
}

export function player(userId: string, heroId: string | null): SessionPlayer {
  return { userId, name: userId, color: '#ffffff', heroId, ready: true, connected: true, joinedAt: '2026-01-01T00:00:00.000Z' };
}

export interface Fixture {
  state: LiveState;
  zones: Zone[];
}

/**
 * Zones A, B, C (1000x1000, grid 50). juan's hero in A at (500,500); patrick's hero in B.
 * Creatures in A: goblin (600,500) visible, far (950,950) out of vision range, hidden one; item token (550,520).
 * Creature in C. Vision radius 6 cells = 300 px.
 */
export function fixture(): Fixture {
  const zones = [zone('A'), zone('B'), zone('C')];
  const state = createLiveState({ sessionId: 's1', campaignId: 'c1', name: 'Partida', hostUserId: 'dm' });
  state.status = 'playing';
  state.players = { juan: player('juan', 'h_juan'), patrick: player('patrick', 'h_pat') };
  state.heroes = { h_juan: hero('h_juan', 'juan'), h_pat: hero('h_pat', 'patrick') };
  state.tokens = {
    t_juan: token({ id: 't_juan', kind: 'hero', heroId: 'h_juan', ownerUserId: 'juan', zoneId: 'A', levelId: 'lvl_A', x: 500, y: 500, hp: 20, maxHp: 30, tempHp: 2 }),
    t_pat: token({ id: 't_pat', kind: 'hero', heroId: 'h_pat', ownerUserId: 'patrick', zoneId: 'B', levelId: 'lvl_B', x: 200, y: 200, hp: 20, maxHp: 30 }),
    t_gob: token({
      id: 't_gob',
      kind: 'creature',
      entryId: 'e_gob',
      zoneId: 'A',
      levelId: 'lvl_A',
      x: 600,
      y: 500,
      hp: 7,
      maxHp: 10,
      tempHp: 3,
      ac: 13,
      notes: 'Lleva la llave',
      loot: [item('loot1', 'Llave')],
      stats: {
        speed: '9 m',
        abilities: { str: 8 },
        attacks: [],
        traits: [],
        resistances: [],
        weaknesses: [],
        immunities: [],
        xp: 50,
        cr: 0.25,
        description: 'Goblin',
      },
    }),
    t_npc: token({ id: 't_npc', kind: 'npc', zoneId: 'A', levelId: 'lvl_A', x: 450, y: 450, hp: 37, maxHp: 100 }),
    t_far: token({ id: 't_far', kind: 'creature', zoneId: 'A', levelId: 'lvl_A', x: 950, y: 950, hp: 5, maxHp: 5 }),
    t_hidden: token({ id: 't_hidden', kind: 'creature', zoneId: 'A', levelId: 'lvl_A', x: 520, y: 500, hidden: true, hp: 5, maxHp: 5 }),
    t_item: token({ id: 't_item', kind: 'item', zoneId: 'A', levelId: 'lvl_A', x: 550, y: 520, notes: 'Trampa', loot: [item('loot2', 'Oro')] }),
    t_other: token({ id: 't_other', kind: 'creature', zoneId: 'C', levelId: 'lvl_C', x: 100, y: 100, hp: 3, maxHp: 3 }),
  };
  return { state, zones };
}

export function element(partial: Partial<SceneElement> & Pick<SceneElement, 'id' | 'type'>): SceneElement {
  const base = { layer: 'objects' as const, x: 0, y: 0, rotation: 0, hidden: false, locked: false, name: partial.id };
  switch (partial.type) {
    case 'note':
      return { ...base, layer: 'notes', text: 'Nota', color: '#ff0', ...partial } as SceneElement;
    case 'token':
      return { ...base, layer: 'tokens', entryId: 'e1', entryKind: 'creature', label: 'Orco', cells: 1, imageUrl: null, startHidden: false, ...partial } as SceneElement;
    case 'text':
      return { ...base, text: 'Hola', fontSize: 20, color: '#fff', ...partial } as SceneElement;
    default:
      return { ...base, icon: 'flag', label: 'Marca', color: '#fff', ...partial, type: 'marker' } as SceneElement;
  }
}
