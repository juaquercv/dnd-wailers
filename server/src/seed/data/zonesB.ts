import { CEMETERY, CHAPEL, CRYPT_UPPER, OSSUARY, cellRectPolygon } from '../assets/layouts';
import { CREATURE_KEYS, creatureEntry } from './creatures';
import { CAMPAIGN_B_ID, levelId, zoneId } from './ids';
import { itemEntry } from './items';
import { soundId } from './sounds';
import { fogRegion, lights, makeLevel, makeZone, markerEl, noteEl, textEl, tokenEl, transitionEl, walls, type SeedZone } from './zoneKit';

/** Campaign B — "Las Criptas de Valdris". */

export const B = {
  cementerio: { zone: zoneId('b', 'cementerio'), level: levelId('b', 'cementerio') },
  cripta: { zone: zoneId('b', 'cripta'), level: levelId('b', 'cripta-superior'), deep: levelId('b', 'osario') },
  capilla: { zone: zoneId('b', 'capilla'), level: levelId('b', 'capilla') },
};

export function buildZonesB(): SeedZone[] {
  // --- Cementerio de Valdris -----------------------------------------------
  const cementerio = makeLevel({ id: B.cementerio.level, name: 'Cementerio', elevation: 0, map: 'cementerio', color: '#2c3a2c', darkMap: true });
  cementerio.lights.push(...lights(CEMETERY.lights));
  cementerio.elements.push(
    transitionEl('stairs_down', CEMETERY.cryptTransition.x, CEMETERY.cryptTransition.y, 140, 70, 'Bajar a la Cripta de Valdris', { zoneId: B.cripta.zone, levelId: B.cripta.level, x: CRYPT_UPPER.arrivalFromCemetery.x, y: CRYPT_UPPER.arrivalFromCemetery.y }),
    transitionEl('door', CEMETERY.chapelTransition.x, CEMETERY.chapelTransition.y, 70, 100, 'Entrar en la capilla', { zoneId: B.capilla.zone, levelId: B.capilla.level, x: CHAPEL.arrival.x, y: CHAPEL.arrival.y }),
    ...CEMETERY.zombies.map((z, i) => tokenEl(creatureEntry(CREATURE_KEYS.zombie), z.x, z.y, { label: `Zombi ${i + 1}`, startHidden: true })),
    ...CEMETERY.skeletons.map((s, i) => tokenEl(creatureEntry(CREATURE_KEYS.skeleton), s.x, s.y, { label: `Esqueleto guardián ${i + 1}` })),
    tokenEl(itemEntry('llave-cripta'), 1655, 1100, { startHidden: true }),
    markerEl('⚰️', 'Cripta de Valdris', CEMETERY.crypt.x + CEMETERY.crypt.w / 2, CEMETERY.crypt.y - 30, '#6fffd2'),
    markerEl('⛪', 'Capilla en ruinas', CEMETERY.chapel.x + CEMETERY.chapel.w / 2, CEMETERY.chapel.y - 40, '#cdb98f'),
    textEl('Puerta del cementerio', CEMETERY.gate.from - 60, CEMETERY.fence.y + CEMETERY.fence.h - 40, 24, '#c8d4e0'),
    noteEl('La Llave de la Cripta está dentro del mausoleo del sureste. Los zombis se levantan cuando alguien pisa una tumba abierta.', 1500, 1180),
  );

  // --- Capilla en ruinas (sub-zona) ------------------------------------------
  const capilla = makeLevel({ id: B.capilla.level, name: 'Nave', elevation: 0, map: 'capilla', color: '#2c3a2c', darkMap: true });
  capilla.walls.push(...walls(CHAPEL.walls));
  capilla.lights.push(...lights(CHAPEL.lights));
  capilla.fogRegions.push(fogRegion('Ábside', [CHAPEL.apse.x - CHAPEL.apse.r, CHAPEL.nave.y + 40, CHAPEL.apse.x - CHAPEL.apse.r, CHAPEL.apse.y - CHAPEL.apse.r - 20, CHAPEL.apse.x + CHAPEL.apse.r, CHAPEL.apse.y - CHAPEL.apse.r - 20, CHAPEL.apse.x + CHAPEL.apse.r, CHAPEL.nave.y + 40]));
  capilla.elements.push(
    transitionEl('door', CHAPEL.exitTransition.x, CHAPEL.exitTransition.y, 120, 60, 'Salir al cementerio', { zoneId: B.cementerio.zone, levelId: B.cementerio.level, x: CEMETERY.chapelArrival.x, y: CEMETERY.chapelArrival.y }),
    tokenEl(creatureEntry(CREATURE_KEYS.spider), CHAPEL.spider.x, CHAPEL.spider.y, { startHidden: true }),
    tokenEl(creatureEntry(CREATURE_KEYS.skeleton), CHAPEL.skeleton.x, CHAPEL.skeleton.y, { label: 'Monje esquelético' }),
    tokenEl(creatureEntry(CREATURE_KEYS.zombie), CHAPEL.zombie.x, CHAPEL.zombie.y, { label: 'Peregrino zombi' }),
    markerEl('✝️', 'Altar profanado', CHAPEL.altar.x + CHAPEL.altar.w / 2, CHAPEL.altar.y + CHAPEL.altar.h + 30, '#ffe680'),
    noteEl('Consagrar el altar (1 minuto de oración) da ventaja contra los no-muertos de Valdris durante 24 horas.', 1000, 360),
  );

  // --- Cripta de Valdris (2 niveles) -----------------------------------------
  const superior = makeLevel({ id: B.cripta.level, name: 'Cripta superior', elevation: -1, map: 'cripta-superior', color: '#0d0b0a', darkMap: true });
  superior.walls.push(...walls(CRYPT_UPPER.walls));
  superior.lights.push(...lights(CRYPT_UPPER.lights));
  superior.fogRegions.push(
    fogRegion('Cámara de los sarcófagos', cellRectPolygon(CRYPT_UPPER.rooms.west!)),
    fogRegion('Biblioteca de los muertos', cellRectPolygon(CRYPT_UPPER.rooms.nw!)),
    fogRegion('Santuario', cellRectPolygon(CRYPT_UPPER.rooms.ne!)),
    fogRegion('Sala de la escalera', cellRectPolygon(CRYPT_UPPER.rooms.east!)),
  );
  superior.elements.push(
    transitionEl('stairs_up', CRYPT_UPPER.stairsUp.x, CRYPT_UPPER.stairsUp.y, 140, 70, 'Subir al cementerio', { zoneId: B.cementerio.zone, levelId: B.cementerio.level, x: CEMETERY.cryptArrival.x, y: CEMETERY.cryptArrival.y }),
    transitionEl('stairs_down', CRYPT_UPPER.stairsDown.x, CRYPT_UPPER.stairsDown.y, 140, 140, 'Bajar al Osario profundo', { zoneId: B.cripta.zone, levelId: B.cripta.deep, x: OSSUARY.arrival.x, y: OSSUARY.arrival.y }),
    ...CRYPT_UPPER.skeletons.map((s, i) => tokenEl(creatureEntry(CREATURE_KEYS.skeleton), s.x, s.y, { label: `Esqueleto ${i + 1}`, startHidden: true })),
    ...CRYPT_UPPER.rats.map((r, i) => tokenEl(creatureEntry(CREATURE_KEYS.rat), r.x, r.y, { label: `Rata Gigante ${i + 1}` })),
    tokenEl(creatureEntry(CREATURE_KEYS.zombie), CRYPT_UPPER.zombie.x, CRYPT_UPPER.zombie.y, { label: 'Bibliotecario zombi' }),
    markerEl('📜', 'Crónica de Valdris', 245, 330, '#cdb98f'),
    markerEl('🕯️', 'Santuario de los antepasados', 1750, 420, '#6fffd2'),
    noteEl('El sarcófago del caballero (sala central) contiene una espada de plata: +1d4 radiante contra muertos vivientes mientras dure la aventura.', 1180, 1060),
  );
  const osario = makeLevel({ id: B.cripta.deep, name: 'Osario profundo', elevation: -2, map: 'osario', color: '#0d0b0a', darkMap: true });
  osario.walls.push(...walls(OSSUARY.walls));
  osario.lights.push(...lights(OSSUARY.lights));
  osario.fogRegions.push(fogRegion('Sala del trono', cellRectPolygon(OSSUARY.rooms.throne!)), fogRegion('Cámara del tesoro', cellRectPolygon(OSSUARY.rooms.vault!)), fogRegion('Galería de huesos', cellRectPolygon(OSSUARY.rooms.gallery!)));
  osario.elements.push(
    transitionEl('stairs_up', OSSUARY.stairsUp.x, OSSUARY.stairsUp.y, 140, 140, 'Subir a la Cripta superior', { zoneId: B.cripta.zone, levelId: B.cripta.level, x: CRYPT_UPPER.arrivalFromOssuary.x, y: CRYPT_UPPER.arrivalFromOssuary.y }),
    tokenEl(creatureEntry(CREATURE_KEYS.lich), OSSUARY.lich.x, OSSUARY.lich.y, { label: 'Valdris, el Rey Liche', startHidden: true }),
    ...OSSUARY.skeletons.map((s, i) => tokenEl(creatureEntry(CREATURE_KEYS.skeleton), s.x, s.y, { label: `Guardia de huesos ${i + 1}`, startHidden: true })),
    ...OSSUARY.zombies.map((z, i) => tokenEl(creatureEntry(CREATURE_KEYS.zombie), z.x, z.y, { label: `Zombi ${i + 1}`, startHidden: true })),
    tokenEl(creatureEntry(CREATURE_KEYS.rat), OSSUARY.rat.x, OSSUARY.rat.y),
    tokenEl(itemEntry('baston-archimago'), 1470, 150, { startHidden: true }),
    markerEl('👑', 'Trono de Valdris', OSSUARY.throneSeat.x, OSSUARY.throneSeat.y - 100, '#7fffd4', true),
    noteEl('Al revelar la sala del trono: efecto de jefe «Valdris, el Rey Liche» y música Cripta silenciosa a todo volumen. El círculo verde potencia a los no-muertos (+2 a la CA).', 1100, 560),
  );

  return [
    makeZone({
      id: B.cementerio.zone,
      campaignId: CAMPAIGN_B_ID,
      name: 'Cementerio de Valdris',
      order: 0,
      gridPos: { x: 0, y: 0 },
      neighbors: { down: B.cripta.zone },
      zoneType: 'exterior',
      biome: 'Pradera',
      weather: 'fog',
      lighting: 'night',
      levels: [cementerio],
      musicSoundId: soundId('cripta-silenciosa'),
      notes: 'Una niebla espesa cubre las tumbas. Algo se mueve entre las lápidas.',
      tags: ['cementerio', 'niebla', 'no-muertos'],
    }),
    makeZone({
      id: B.capilla.zone,
      campaignId: CAMPAIGN_B_ID,
      name: 'Capilla en ruinas',
      order: 1,
      parentZoneId: B.cementerio.zone,
      zoneType: 'subzone',
      biome: 'Pradera',
      weather: 'none',
      lighting: 'night',
      levels: [capilla],
      musicSoundId: soundId('cripta-silenciosa'),
      ambienceSoundId: soundId('lluvia'),
      notes: 'La antigua capilla de los guardianes de Valdris. El techo se derrumbó hace décadas.',
      tags: ['capilla', 'ruinas', 'sagrado'],
    }),
    makeZone({
      id: B.cripta.zone,
      campaignId: CAMPAIGN_B_ID,
      name: 'Cripta de Valdris',
      order: 2,
      gridPos: { x: 0, y: 1 },
      neighbors: { up: B.cementerio.zone },
      zoneType: 'dungeon',
      biome: 'Subterráneo',
      weather: 'none',
      lighting: 'dark',
      levels: [superior, osario],
      musicSoundId: soundId('cripta-silenciosa'),
      ambienceSoundId: soundId('cueva'),
      notes: 'Dos niveles: la Cripta superior y el Osario profundo, donde aguarda Valdris.',
      tags: ['cripta', 'mazmorra', 'jefe-final'],
    }),
  ];
}
