import {
  cellsForSize,
  createZoneLevel,
  defaultGrid,
  emptyNeighbors,
  newId,
  type FogRegion,
  type LightSource,
  type LightingPreset,
  type MarkerElement,
  type NoteElement,
  type SpawnPoint,
  type TextElement,
  type TokenElement,
  type TransitionElement,
  type TransitionType,
  type Wall,
  type WeatherType,
  type Zone,
  type ZoneLevel,
  type ZoneNeighbors,
  type ZoneType,
} from '@wailers/shared';
import type { LightSpec, WallSpec } from '../assets/layouts';
import { MAP_SPECS, type MapKey } from '../assets/maps';
import { seedUrl } from '../assets/paths';
import type { SeedEntry } from './types';

/** Small builders for zone documents (levels, walls, lights, fog, scene elements). */

export function mapUrl(key: MapKey): string {
  return seedUrl(MAP_SPECS[key].file);
}

export function makeLevel(opts: { id: string; name: string; elevation: number; map: MapKey; color: string; darkMap?: boolean }): ZoneLevel {
  const level = createZoneLevel(opts.name, opts.elevation);
  const spec = MAP_SPECS[opts.map];
  level.id = opts.id;
  level.background = { url: mapUrl(opts.map), width: spec.width, height: spec.height, color: opts.color };
  level.grid = { ...defaultGrid(), color: opts.darkMap ? '#ffffff' : '#000000', opacity: opts.darkMap ? 0.1 : 0.18 };
  return level;
}

export function walls(specs: WallSpec[]): Wall[] {
  return specs.map((w) => ({ id: newId('wall'), points: [...w.points], kind: w.kind, open: w.open }));
}

export function lights(specs: LightSpec[]): LightSource[] {
  return specs.map((l) => ({ id: newId('light'), ...l }));
}

export function fogRegion(name: string, points: number[]): FogRegion {
  return { id: newId('fog'), name, points: [...points] };
}

export function tokenEl(entry: SeedEntry<'creature'> | SeedEntry<'item'>, x: number, y: number, opts: { label?: string; startHidden?: boolean } = {}): TokenElement {
  const cells = entry.kind === 'creature' ? ((entry as SeedEntry<'creature'>).data.tokenCells ?? cellsForSize(entry.size)) : 1;
  return {
    id: newId('el'),
    type: 'token',
    layer: 'tokens',
    x,
    y,
    rotation: 0,
    hidden: false,
    locked: false,
    name: opts.label ?? entry.name,
    entryId: entry.id,
    entryKind: entry.kind,
    label: opts.label ?? entry.name,
    cells,
    imageUrl: entry.imageUrl,
    startHidden: opts.startHidden ?? false,
  };
}

export function transitionEl(transitionType: TransitionType, x: number, y: number, w: number, h: number, label: string, target: SpawnPoint): TransitionElement {
  return { id: newId('el'), type: 'transition', layer: 'objects', x, y, rotation: 0, hidden: false, locked: true, name: label, transitionType, width: w, height: h, label, target };
}

export function markerEl(icon: string, label: string, x: number, y: number, color: string, hidden = false): MarkerElement {
  return { id: newId('el'), type: 'marker', layer: hidden ? 'notes' : 'objects', x, y, rotation: 0, hidden, locked: false, name: label, icon, label, color };
}

export function textEl(content: string, x: number, y: number, fontSize: number, color: string, rotation = 0): TextElement {
  return { id: newId('el'), type: 'text', layer: 'objects', x, y, rotation, hidden: false, locked: false, name: content, text: content, fontSize, color };
}

export function noteEl(content: string, x: number, y: number, color = '#e9c063'): NoteElement {
  return { id: newId('el'), type: 'note', layer: 'notes', x, y, rotation: 0, hidden: true, locked: false, name: 'Nota del DM', text: content, color };
}

/** Seeded zone row (campaign zone). */
export type SeedZone = Omit<Zone, 'createdAt' | 'updatedAt'>;

export function makeZone(init: {
  id: string;
  campaignId: string;
  name: string;
  order: number;
  parentZoneId?: string | null;
  gridPos?: { x: number; y: number } | null;
  neighbors?: Partial<ZoneNeighbors>;
  zoneType: ZoneType;
  biome: string;
  weather: WeatherType;
  lighting: LightingPreset;
  levels: ZoneLevel[];
  defaultLevelId?: string;
  musicSoundId?: string | null;
  ambienceSoundId?: string | null;
  notes: string;
  tags: string[];
}): SeedZone {
  return {
    id: init.id,
    campaignId: init.campaignId,
    name: init.name,
    order: init.order,
    parentZoneId: init.parentZoneId ?? null,
    gridPos: init.gridPos ?? null,
    neighbors: { ...emptyNeighbors(), ...init.neighbors },
    zoneType: init.zoneType,
    biome: init.biome,
    weather: init.weather,
    lighting: init.lighting,
    levels: init.levels,
    defaultLevelId: init.defaultLevelId ?? init.levels[0]!.id,
    musicSoundId: init.musicSoundId ?? null,
    ambienceSoundId: init.ambienceSoundId ?? null,
    notes: init.notes,
    tags: init.tags,
  };
}
