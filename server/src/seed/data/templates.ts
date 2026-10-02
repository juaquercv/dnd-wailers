import { newId, type ZoneContent, type ZoneLevel, type ZoneVision } from '@wailers/shared';
import type { MapKey } from '../assets/maps';
import { CAVE, CROSSROADS, FOREST, MOUNTAINS, SMALL_CAVE, TAVERN, TOWER, VILLAGE, ellipsePolygon, rectPolygon } from '../assets/layouts';
import { AIRSHIP, WORKSHOP } from '../assets/layoutsSteam';
import { cat } from './categories';
import { entryId } from './ids';
import { seedEntry, type SeedEntry } from './types';
import { fogRegion, lights, makeLevel, mapUrl, markerEl, noteEl, textEl, walls } from './zoneKit';

/** Zone templates for the library (kind 'zone'): reusable maps with walls, lights and markers. */

function content(init: Omit<ZoneContent, 'defaultLevelId'> & { levels: ZoneLevel[] }): ZoneContent {
  return { vision: null, ...init, defaultLevelId: init.levels[0]!.id };
}

/** Default vision of the dark templates (seed v3): players inside only see around their hero. */
export const TEMPLATE_VISIONS: Readonly<Record<string, ZoneVision>> = {
  'cueva-pequena': { mode: 'explored', radius: 4, cone: 360 },
  'guarida-del-dragon': { mode: 'explored', radius: 6, cone: 360 },
};

function clearing(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Claro', elevation: 0, map: 'bosque', color: '#2f4a24' });
  level.lights.push(...lights([FOREST.campLight]));
  level.fogRegions.push(fogRegion('Claro', ellipsePolygon(FOREST.clearing.x, FOREST.clearing.y, FOREST.clearing.rx + 40, FOREST.clearing.ry + 40, 16)));
  level.elements.push(markerEl('🔥', 'Hoguera', FOREST.campfire.x, FOREST.campfire.y - 70, '#ff8a3a'), noteEl('Buen lugar para una emboscada o un descanso con guardias.', FOREST.clearing.x + 260, FOREST.clearing.y - 220));
  return content({ zoneType: 'exterior', biome: 'Bosque', weather: 'none', lighting: 'dusk', levels: [level], notes: 'Claro en el bosque con hoguera, tiendas, arroyo y un puente.' });
}

function tavern(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Planta baja', elevation: 0, map: 'taberna', color: '#3d3a33' });
  level.walls.push(...walls(TAVERN.walls));
  level.lights.push(...lights(TAVERN.lights));
  level.elements.push(markerEl('🍺', 'Barra', TAVERN.bar.x + TAVERN.bar.w / 2, TAVERN.bar.y + 90, '#e9c063'), markerEl('🛏️', 'Habitaciones', 1365, 630, '#cdb98f'));
  return content({ zoneType: 'interior', biome: 'Ciudad', weather: 'none', lighting: 'dusk', levels: [level], notes: 'Taberna con barra, chimenea, cocina y dos habitaciones. Paredes y antorchas listas.' });
}

function smallCave(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Cueva', elevation: -1, map: 'cueva-pequena', color: '#110e0c', darkMap: true });
  level.walls.push(...walls(SMALL_CAVE.walls));
  level.lights.push(...lights(SMALL_CAVE.lights));
  level.elements.push(markerEl('💧', 'Poza', SMALL_CAVE.pool.x, SMALL_CAVE.pool.y - 110, '#6fd0ff'), textEl('Entrada', 30, 380, 24, '#cfd8ff'));
  return content({ zoneType: 'dungeon', biome: 'Cueva', weather: 'none', lighting: 'dark', levels: [level], notes: 'Cueva de una sola cámara con poza, setas luminosas y un pilar de roca.', vision: TEMPLATE_VISIONS['cueva-pequena'] });
}

function crossroads(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Cruce', elevation: 0, map: 'cruce', color: '#6a9142' });
  level.elements.push(markerEl('🪧', 'Señal del cruce', CROSSROADS.signpost.x, CROSSROADS.signpost.y - 80, '#cdb98f'), markerEl('🕯️', 'Santuario del camino', CROSSROADS.shrine.x, CROSSROADS.shrine.y - 80, '#ffd28a'));
  return content({ zoneType: 'exterior', biome: 'Pradera', weather: 'none', lighting: 'day', levels: [level], notes: 'Cruce de dos caminos con una señal y un pequeño santuario. Ideal para encuentros aleatorios.' });
}

// --- Added in seed v2 ------------------------------------------------------

function village(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Aldea', elevation: 0, map: 'aldea', color: '#5f8a3c' });
  level.lights.push(...lights([{ x: VILLAGE.forge.x, y: VILLAGE.forge.y, radius: 220, color: '#ff8a3a', intensity: 0.8, flicker: true }]));
  level.elements.push(
    markerEl('🍺', 'Taberna', VILLAGE.tavern.cx, VILLAGE.tavern.cy - 140, '#e9c063'),
    markerEl('⚒️', 'Herrería', VILLAGE.smithy.cx, VILLAGE.smithy.cy - 120, '#b0852b'),
    markerEl('⛲', 'Plaza del pozo', VILLAGE.plaza.x, VILLAGE.plaza.y - 230, '#5fa8c8'),
  );
  return content({ zoneType: 'city', biome: 'Pradera', weather: 'none', lighting: 'day', levels: [level], notes: 'Aldea con plaza y pozo, taberna, herrería, casas, huertos y un estanque. Caminos hacia los cuatro puntos cardinales.' });
}

function volcanicSlope(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Ladera', elevation: 0, map: 'montanas', color: '#4a423c' });
  level.lights.push(...lights(MOUNTAINS.lights));
  level.elements.push(markerEl('🌋', 'Pozo de lava', MOUNTAINS.lavaPool.x, MOUNTAINS.lavaPool.y + 150, '#ff6a2a'), markerEl('🕳️', 'Entrada de la cueva', MOUNTAINS.caveMouth.x, MOUNTAINS.caveMouth.y + 140, '#cdb98f'));
  return content({ zoneType: 'exterior', biome: 'Volcán', weather: 'embers', lighting: 'dusk', levels: [level], notes: 'Ladera de montaña con grietas de lava, un pozo ardiente, rocas y la boca de una cueva.' });
}

function dragonLair(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Guarida', elevation: -1, map: 'cueva-dragon', color: '#110e0c', darkMap: true });
  level.walls.push(...walls(CAVE.walls));
  level.lights.push(...lights(CAVE.lights));
  level.fogRegions.push(fogRegion('Cámara del tesoro', CAVE.innerFog));
  level.elements.push(markerEl('💰', 'Tesoro', CAVE.hoard.x, CAVE.hoard.y - 190, '#e9c063', true), textEl('Entrada', 30, 620, 24, '#cfd8ff'));
  return content({ zoneType: 'dungeon', biome: 'Cueva', weather: 'none', lighting: 'dark', levels: [level], notes: 'Gran caverna con pilares, ríos de lava y una cámara del tesoro oculta tras la niebla de guerra.', vision: TEMPLATE_VISIONS['guarida-del-dragon'] });
}

function wizardTower(): ZoneContent {
  const ground = makeLevel({ id: newId('lvl'), name: 'Planta baja', elevation: 0, map: 'torre-baja', color: '#3a5228' });
  ground.walls.push(...walls(TOWER.groundWalls));
  ground.lights.push(...lights(TOWER.groundLights));
  ground.elements.push(markerEl('🪜', 'Escalera a la cima', TOWER.stairs.x, TOWER.stairs.y - 150, '#cdb98f'), markerEl('📚', 'Biblioteca', 260, 700, '#a98bff'), markerEl('⚗️', 'Mesa de alquimia', TOWER.alchemy.x + 90, TOWER.alchemy.y - 40, '#5fd07a'));
  const top = makeLevel({ id: newId('lvl'), name: 'Cima de la torre', elevation: 1, map: 'torre-cima', color: '#1d2b1c' });
  top.walls.push(...walls(TOWER.topWalls));
  top.lights.push(...lights(TOWER.topLights));
  top.elements.push(markerEl('🪜', 'Escalera a la planta baja', TOWER.stairs.x, TOWER.stairs.y - 150, '#cdb98f'), markerEl('🔮', 'Círculo de atadura', TOWER.cx, TOWER.cy - 300, '#a98bff'));
  return content({ zoneType: 'interior', biome: 'Bosque', weather: 'none', lighting: 'night', levels: [ground, top], notes: 'Torre de dos niveles unidos por una escalera de caracol (añade las transiciones al usarla). Paredes y luces listas.' });
}

function inventorWorkshop(): ZoneContent {
  const level = makeLevel({ id: newId('lvl'), name: 'Taller', elevation: 0, map: 'taller-inventor', color: '#2a2622' });
  level.walls.push(...walls(WORKSHOP.walls));
  level.lights.push(...lights(WORKSHOP.lights));
  level.fogRegions.push(fogRegion('Almacén', rectPolygon(WORKSHOP.store)));
  level.elements.push(markerEl('⚡', 'Bobina Tesla', WORKSHOP.tesla.x, WORKSHOP.tesla.y - 90, '#8ad8ff'), markerEl('🔥', 'Forja', WORKSHOP.furnace.x + 160, WORKSHOP.furnace.y - 10, '#ff8a3a'), markerEl('🔐', 'Caja fuerte', WORKSHOP.safe.x - 80, WORKSHOP.safe.y + 20, '#e9c063'));
  return content({ zoneType: 'interior', biome: 'Ciudad', weather: 'none', lighting: 'dusk', levels: [level], notes: 'Taller de inventor con banco de trabajo, torno, bobina Tesla, forja, mesa de planos, almacén y dormitorio. Paredes de ladrillo que bloquean la visión.' });
}

function airship(): ZoneContent {
  const deck = makeLevel({ id: newId('lvl'), name: 'Cubierta superior', elevation: 1, map: 'albatros-cubierta', color: '#9fc2d8' });
  deck.walls.push(...walls(AIRSHIP.deckWalls));
  deck.lights.push(...lights(AIRSHIP.deckLights));
  deck.elements.push(markerEl('🧭', 'Timón', AIRSHIP.helm.x, AIRSHIP.helm.y - 90, '#e9c063'), markerEl('🪜', 'Escotilla a la sala de máquinas', AIRSHIP.hatch.x, AIRSHIP.hatch.y - 110, '#cdb98f'));
  const engine = makeLevel({ id: newId('lvl'), name: 'Sala de máquinas', elevation: 0, map: 'albatros-maquinas', color: '#0b0a08', darkMap: true });
  engine.walls.push(...walls(AIRSHIP.engineWalls));
  engine.lights.push(...lights(AIRSHIP.engineLights));
  engine.fogRegions.push(fogRegion('Bodega de proa', AIRSHIP.bowHoldFog));
  engine.elements.push(markerEl('🪜', 'Escalera a cubierta', AIRSHIP.hatch.x, AIRSHIP.hatch.y - 110, '#cdb98f'));
  return content({ zoneType: 'exterior', biome: 'Cielo', weather: 'none', lighting: 'dusk', levels: [deck, engine], notes: 'Dirigible de dos niveles: cubierta con timón, puente de mando y cañones; sala de máquinas con calderas, pistones y bodega. Añade las transiciones de la escotilla al usarlo.' });
}

interface TemplateDef {
  key: string;
  name: string;
  description: string;
  map: MapKey;
  biome: string;
  type: string;
  tags: string[];
  build: () => ZoneContent;
  origin?: 'A' | 'B';
  since?: number;
}

const DEFS: TemplateDef[] = [
  { key: 'claro-del-bosque', name: 'Claro del bosque', description: 'Claro rodeado de árboles con hoguera, tiendas, un arroyo y un puente de madera.', map: 'bosque', biome: 'Bosque', type: 'Exterior', tags: ['bosque', 'campamento', 'exterior'], build: clearing },
  { key: 'taberna', name: 'Taberna', description: 'Taberna completa con barra, chimenea, cocina y habitaciones. Incluye paredes, puertas, ventanas y antorchas.', map: 'taberna', biome: 'Ciudad', type: 'Interior', tags: ['taberna', 'interior', 'ciudad'], build: tavern },
  { key: 'cueva-pequena', name: 'Cueva pequeña', description: 'Cueva de una cámara con paredes que bloquean la visión, una poza y setas luminosas.', map: 'cueva-pequena', biome: 'Cueva', type: 'Mazmorra', tags: ['cueva', 'mazmorra', 'oscuridad'], build: smallCave },
  { key: 'cruce-de-caminos', name: 'Cruce de caminos', description: 'Dos caminos que se cruzan entre praderas y árboles, con una señal y un santuario.', map: 'cruce', biome: 'Pradera', type: 'Exterior', tags: ['camino', 'viaje', 'encuentro'], build: crossroads },
  { key: 'aldea', name: 'Aldea', description: 'Aldea con plaza y pozo, taberna, herrería, casas con huertos y un estanque.', map: 'aldea', biome: 'Pradera', type: 'Ciudad', tags: ['aldea', 'pueblo', 'exterior'], build: village, since: 2 },
  { key: 'ladera-volcanica', name: 'Ladera volcánica', description: 'Ladera de montaña con grietas de lava, un pozo ardiente y la entrada de una cueva.', map: 'montanas', biome: 'Volcán', type: 'Exterior', tags: ['montaña', 'volcán', 'lava'], build: volcanicSlope, since: 2 },
  { key: 'guarida-del-dragon', name: 'Guarida del dragón', description: 'Caverna enorme con pilares, ríos de lava y una cámara del tesoro tras la niebla de guerra.', map: 'cueva-dragon', biome: 'Cueva', type: 'Mazmorra', tags: ['cueva', 'dragón', 'jefe-final', 'tesoro'], build: dragonLair, since: 2 },
  { key: 'torre-del-hechicero', name: 'Torre del hechicero', description: 'Torre circular de dos niveles con biblioteca, laboratorio de alquimia y un círculo de atadura en la cima.', map: 'torre-baja', biome: 'Bosque', type: 'Interior', tags: ['torre', 'niveles', 'magia'], build: wizardTower, since: 2 },
  { key: 'taller-de-inventor', name: 'Taller de inventor', description: 'Taller steampunk con bobina Tesla, forja, torno, mesa de planos, almacén y dormitorio.', map: 'taller-inventor', biome: 'Ciudad', type: 'Interior', tags: ['#steampunk', 'taller', 'interior'], build: inventorWorkshop, origin: 'A', since: 2 },
  { key: 'dirigible-de-vapor', name: 'Dirigible de vapor', description: 'Dirigible de dos niveles: cubierta con timón y cañones, y sala de máquinas con calderas y bodega.', map: 'albatros-cubierta', biome: 'Cielo', type: 'Exterior', tags: ['#steampunk', '#dirigibles', 'niveles', 'barco'], build: airship, origin: 'A', since: 2 },
];

export const TEMPLATE_ENTRIES: SeedEntry<'zone'>[] = DEFS.map((d) => {
  const zoneContent = d.build();
  return seedEntry<'zone'>({
    id: entryId('zone', d.key),
    kind: 'zone',
    name: d.name,
    description: d.description,
    imageUrl: mapUrl(d.map),
    tags: d.tags,
    categoryIds: [cat('zone', 'Bioma', d.biome), cat('zone', 'Tipo', d.type)],
    origin: d.origin ?? null,
    since: d.since ?? 1,
    level: zoneContent.levels.length,
    data: { content: zoneContent },
  });
});
