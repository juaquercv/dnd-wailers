import { rectPolygon } from '../assets/layouts';
import { AIRSHIP, FACTORY, GEAR_CITY, SKY_PORT, WORKSHOP } from '../assets/layoutsSteam';
import { STEAM_CREATURE_KEYS as K, creatureEntry } from './creatures';
import { CAMPAIGN_A_ID, levelId, zoneId } from './ids';
import { itemEntry } from './items';
import { soundId } from './sounds';
import { fogRegion, lights, makeLevel, makeZone, markerEl, noteEl, textEl, tokenEl, transitionEl, walls, type SeedZone } from './zoneKit';

/** Campaign A — "Los Cielos de Latón" (steampunk, airships, no magic): zones, levels and pre-placed tokens. */

export const A = {
  ciudad: { zone: zoneId('a', 'ciudad'), level: levelId('a', 'ciudad') },
  taller: { zone: zoneId('a', 'taller'), level: levelId('a', 'taller') },
  puerto: { zone: zoneId('a', 'puerto'), level: levelId('a', 'puerto') },
  albatros: { zone: zoneId('a', 'albatros'), level: levelId('a', 'albatros-cubierta'), engine: levelId('a', 'albatros-maquinas') },
  fabrica: { zone: zoneId('a', 'fabrica'), level: levelId('a', 'fabrica') },
};

const WHITE = '#fbf6ea';
const BRASS = '#e9c063';

export function buildZonesA(): SeedZone[] {
  // --- Ciudad de Engranajes -------------------------------------------------
  const C = GEAR_CITY;
  const ciudad = makeLevel({ id: A.ciudad.level, name: 'Ciudad', elevation: 0, map: 'ciudad-engranajes', color: '#3a3631', darkMap: true });
  ciudad.lights.push(...lights(C.lights));
  ciudad.elements.push(
    transitionEl('door', C.workshopTransition.x, C.workshopTransition.y, 80, 60, 'Entrar en el Taller de Ada Volta', { zoneId: A.taller.zone, levelId: A.taller.level, x: WORKSHOP.arrival.x, y: WORKSHOP.arrival.y }),
    markerEl('🕰️', 'Torre del Reloj', C.clockTower.x, C.clockTower.y - C.clockTower.size / 2 - 40, BRASS),
    markerEl('⚙️', 'Plaza de los Engranajes', C.plaza.x, C.plaza.y - 140, BRASS),
    markerEl('🔧', 'Taller de Ada Volta', C.workshop.cx, C.workshop.cy - C.workshop.h / 2 - 26, '#e8742a'),
    markerEl('🚋', 'Parada del tranvía', C.tram.x, C.tram.y - 80, '#9fd8c4'),
    markerEl('🛒', 'Puesto de Bartolomé Cobre', C.bartolome.x + 50, C.bartolome.y - 120, BRASS),
    markerEl('🕳️', 'Alcantarilla hacia la fábrica', C.southStreet.x, 1180, '#7dff6a', true),
    textEl('Ciudad de Engranajes', 40, 440, 40, WHITE),
    textEl('Puerto de Dirigibles →', 1790, 905, 26, WHITE),
    textEl('↓ Fábrica Abandonada', C.southStreet.x + 80, 1350, 26, WHITE),
    noteEl('Bartolomé vende material de aventurero (precios en su ficha). Los autómatas de la Torre del Reloj no dejan pasar a nadie sin salvoconducto. La alcantarilla del sur esconde un pasadizo hasta la Fábrica Abandonada.', 1480, 800),
    tokenEl(creatureEntry(K.bartolome), C.bartolome.x, C.bartolome.y),
    ...C.guards.map((p, i) => tokenEl(creatureEntry(K.automaton), p.x, p.y, { label: `Autómata guardián ${i + 1}` })),
    ...C.rats.map((p, i) => tokenEl(creatureEntry(K.clockRat), p.x, p.y, { label: `Rata mecánica ${i + 1}` })),
    tokenEl(creatureEntry(K.drone), C.drone.x, C.drone.y, { startHidden: true }),
  );

  // --- Taller del Inventor (sub-zona) ----------------------------------------
  const W = WORKSHOP;
  const taller = makeLevel({ id: A.taller.level, name: 'Taller', elevation: 0, map: 'taller-inventor', color: '#2a2622', darkMap: true });
  taller.walls.push(...walls(W.walls));
  taller.lights.push(...lights(W.lights));
  taller.fogRegions.push(fogRegion('Almacén', rectPolygon(W.store)));
  taller.elements.push(
    transitionEl('door', W.exitTransition.x, W.exitTransition.y, 100, 60, 'Salir a la Ciudad de Engranajes', { zoneId: A.ciudad.zone, levelId: A.ciudad.level, x: C.workshopArrival.x, y: C.workshopArrival.y }),
    markerEl('⚡', 'Bobina Tesla', W.tesla.x, W.tesla.y - 90, '#8ad8ff'),
    markerEl('🔥', 'Forja', W.furnace.x + 160, W.furnace.y - 10, '#ff8a3a'),
    markerEl('📐', 'Mesa de planos', W.blueprintTable.x + W.blueprintTable.w / 2, W.blueprintTable.y - 30, '#8ab4ff'),
    markerEl('🔐', 'Caja fuerte de Ada', W.safe.x - 80, W.safe.y + 20, BRASS, true),
    noteEl('Ada Volta necesita los planos de su mentor para hallar el punto débil del Dragón de Latón: la válvula de presión bajo el ala izquierda. La combinación de la caja fuerte es 7-3-1, el año de la Gran Caldera.', 300, 960),
    tokenEl(creatureEntry(K.ada), W.ada.x, W.ada.y),
    tokenEl(creatureEntry(K.clockRat), W.rat.x, W.rat.y, { label: 'Rata mecánica escondida', startHidden: true }),
    tokenEl(itemEntry('planos-del-albatros'), W.plans.x, W.plans.y, { startHidden: true }),
    tokenEl(itemEntry('brazo-mecanico'), W.arm.x, W.arm.y, { startHidden: true }),
  );

  // --- Puerto de Dirigibles --------------------------------------------------
  const P = SKY_PORT;
  const puerto = makeLevel({ id: A.puerto.level, name: 'Muelles', elevation: 0, map: 'puerto-dirigibles', color: '#9fc2d8' });
  puerto.lights.push(...lights(P.lights));
  puerto.fogRegions.push(fogRegion('Muelle sur', P.fog));
  puerto.elements.push(
    transitionEl('entrance', P.gangwayTransition.x, P.gangwayTransition.y, 80, 140, 'Subir a bordo del «Albatros»', { zoneId: A.albatros.zone, levelId: A.albatros.level, x: AIRSHIP.arrivalFromPort.x, y: AIRSHIP.arrivalFromPort.y }),
    markerEl('🎈', '«Gaviota de Hierro» (mercante)', P.ships.gaviota.cx, P.ships.gaviota.cy - 40, '#9fd8c4'),
    markerEl('🎈', '«Albatros» (capitán Niebla)', P.ships.albatros.cx + 260, P.ships.albatros.cy - 60, '#e8742a'),
    markerEl('🏴‍☠️', '«La Urraca» (piratas)', P.ships.urraca.cx, P.ships.urraca.cy - 40, '#e0625a', true),
    markerEl('🎫', 'Taquilla de pasajes', 480, 735, BRASS),
    markerEl('📦', 'Almacenes de Cobre y Cía.', 250, 680, BRASS),
    textEl('← Ciudad de Engranajes', 20, 600, 26, WHITE),
    noteEl('Los piratas de «La Urraca» esperan escondidos en el muelle sur para asaltar el «Albatros» en cuanto zarpe. El autómata del muelle cobra 5 coronas de latón por cabeza para dejar pasar a los muelles.', 470, 1000),
    tokenEl(creatureEntry(K.automaton), P.guard.x, P.guard.y, { label: 'Autómata del muelle' }),
    ...P.pirates.map((p, i) => tokenEl(creatureEntry(K.pirate), p.x, p.y, { label: `Pirata del cielo ${i + 1}`, startHidden: true })),
    tokenEl(creatureEntry(K.drone), P.drone.x, P.drone.y, { startHidden: true }),
  );

  // --- El Dirigible «Albatros» (2 niveles) -----------------------------------
  const S = AIRSHIP;
  const cubierta = makeLevel({ id: A.albatros.level, name: 'Cubierta superior', elevation: 1, map: 'albatros-cubierta', color: '#9fc2d8' });
  cubierta.walls.push(...walls(S.deckWalls));
  cubierta.lights.push(...lights(S.deckLights));
  cubierta.elements.push(
    transitionEl('entrance', S.gateTransition.x, S.gateTransition.y, 80, 60, 'Desembarcar en el Puerto de Dirigibles', { zoneId: A.puerto.zone, levelId: A.puerto.level, x: P.arrivalFromShip.x, y: P.arrivalFromShip.y }),
    transitionEl('stairs_down', S.hatch.x, S.hatch.y, S.hatch.size, S.hatch.size, 'Bajar a la sala de máquinas', { zoneId: A.albatros.zone, levelId: A.albatros.engine, x: S.stairsArrivalEngine.x, y: S.stairsArrivalEngine.y }),
    markerEl('🧭', 'Timón', S.helm.x, S.helm.y - 110, BRASS),
    markerEl('🗺️', 'Puente de mando', S.bridge.x + S.bridge.w / 2, S.bridge.y - 30, BRASS),
    markerEl('🦅', 'Mascarón de proa', 1900, 590, BRASS),
    noteEl('En cuanto el «Albatros» zarpa, la capitana «Cuervo Rojo» y dos piratas saltan a la proa desde «La Urraca» (pon la música Persecución en las nubes). Horacio Niebla no lucha: debe dinero a los piratas e intentará negociar.', 820, 1060),
    tokenEl(creatureEntry(K.horacio), S.captain.x, S.captain.y),
    tokenEl(creatureEntry(K.crow), S.boarders.captain.x, S.boarders.captain.y, { startHidden: true }),
    ...S.boarders.pirates.map((p, i) => tokenEl(creatureEntry(K.pirate), p.x, p.y, { label: `Pirata abordador ${i + 1}`, startHidden: true })),
  );
  const maquinas = makeLevel({ id: A.albatros.engine, name: 'Sala de máquinas', elevation: 0, map: 'albatros-maquinas', color: '#0b0a08', darkMap: true });
  maquinas.walls.push(...walls(S.engineWalls));
  maquinas.lights.push(...lights(S.engineLights));
  maquinas.fogRegions.push(fogRegion('Bodega de proa', S.bowHoldFog));
  maquinas.elements.push(
    transitionEl('stairs_up', S.hatch.x, S.hatch.y, S.hatch.size, S.hatch.size, 'Subir a la cubierta', { zoneId: A.albatros.zone, levelId: A.albatros.level, x: S.stairsArrivalDeck.x, y: S.stairsArrivalDeck.y }),
    markerEl('🔥', 'Calderas', 725, 460, '#ff8a3a'),
    markerEl('⚙️', 'Pistones', 1032, 465, BRASS),
    markerEl('📦', 'Bodega de proa', 1700, 700, '#cdb98f', true),
    noteEl('Un saboteador pirata se esconde en la bodega de proa. Si nadie lo detiene en 3 asaltos, tira el Dado de la caldera. Ambiente recomendado aquí: Sala de máquinas.', 760, 1060),
    ...S.rats.map((p, i) => tokenEl(creatureEntry(K.clockRat), p.x, p.y, { label: `Rata mecánica ${i + 1}` })),
    tokenEl(creatureEntry(K.pirate), S.saboteur.x, S.saboteur.y, { label: 'Saboteador', startHidden: true }),
    tokenEl(itemEntry('carbon-de-calidad'), S.coal.x, S.coal.y),
  );

  // --- Fábrica Abandonada ------------------------------------------------------
  const F = FACTORY;
  const fabrica = makeLevel({ id: A.fabrica.level, name: 'Nave principal', elevation: 0, map: 'fabrica-abandonada', color: '#3a3631', darkMap: true });
  fabrica.walls.push(...walls(F.walls));
  fabrica.lights.push(...lights(F.lights));
  fabrica.fogRegions.push(fogRegion('Sala del horno', F.fog));
  fabrica.elements.push(
    markerEl('☣️', 'Charcos tóxicos', F.puddles[0]!.x, F.puddles[0]!.y - 80, '#7dff6a'),
    markerEl('⚠️', 'Foso de escoria', F.pit.x + F.pit.w / 2, F.pit.y + F.pit.h + 40, '#ff8a3a'),
    markerEl('🔥', 'Horno principal', F.furnace.x, F.furnace.y - F.furnace.r - 30, '#ff6a1a', true),
    textEl('↑ Ciudad de Engranajes', 1090, 20, 26, WHITE),
    noteEl('Al revelar la sala del horno: lanza el efecto de jefe «Dragón de Latón» y pon a mano la música Himno del dragón. Las gárgolas parecen montones de chatarra hasta que alguien se acerca. Cada golpe al horno: Dado de la caldera.', 260, 1290),
    tokenEl(creatureEntry(K.brassDragon), F.dragon.x, F.dragon.y, { startHidden: true }),
    tokenEl(creatureEntry(K.golem), F.golem.x, F.golem.y),
    ...F.gargoyles.map((p, i) => tokenEl(creatureEntry(K.gargoyle), p.x, p.y, { label: `Gárgola de chatarra ${i + 1}`, startHidden: true })),
    ...F.rats.map((p, i) => tokenEl(creatureEntry(K.clockRat), p.x, p.y, { label: `Rata mecánica ${i + 1}` })),
    tokenEl(creatureEntry(K.drone), F.drone.x, F.drone.y),
    tokenEl(itemEntry('corazon-de-engranajes'), F.heart.x, F.heart.y, { startHidden: true }),
    tokenEl(itemEntry('carbon-de-calidad'), F.coal.x, F.coal.y),
  );

  return [
    makeZone({
      id: A.ciudad.zone,
      campaignId: CAMPAIGN_A_ID,
      name: 'Ciudad de Engranajes',
      order: 0,
      gridPos: { x: 0, y: 0 },
      neighbors: { right: A.puerto.zone, down: A.fabrica.zone },
      zoneType: 'city',
      biome: 'Ciudad',
      weather: 'none',
      lighting: 'dusk',
      levels: [ciudad],
      musicSoundId: soundId('vals-de-vapor'),
      notes: 'Punto de partida. La capital de la Isla de Latón: tranvías, torres de reloj y chimeneas que nunca se apagan. Desde hace una semana, la tierra tiembla bajo la vieja fábrica del sur.',
      tags: ['#steampunk', 'ciudad', 'inicio', 'npc'],
    }),
    makeZone({
      id: A.taller.zone,
      campaignId: CAMPAIGN_A_ID,
      name: 'Taller del Inventor',
      order: 1,
      parentZoneId: A.ciudad.zone,
      zoneType: 'interior',
      biome: 'Ciudad',
      weather: 'none',
      lighting: 'dusk',
      levels: [taller],
      musicSoundId: soundId('vals-de-vapor'),
      ambienceSoundId: soundId('fuego-de-campamento'),
      notes: 'El taller que Ada Volta heredó del profesor Volta. Entre planos, bobinas y un autómata a medio montar se esconde la clave para detener al Dragón de Latón.',
      tags: ['#steampunk', 'taller', 'interior', 'aliada'],
    }),
    makeZone({
      id: A.puerto.zone,
      campaignId: CAMPAIGN_A_ID,
      name: 'Puerto de Dirigibles',
      order: 2,
      gridPos: { x: 1, y: 0 },
      neighbors: { left: A.ciudad.zone, right: A.albatros.zone },
      zoneType: 'exterior',
      biome: 'Cielo',
      weather: 'fog',
      lighting: 'day',
      levels: [puerto],
      musicSoundId: soundId('vals-de-vapor'),
      ambienceSoundId: soundId('viento-en-cubierta'),
      notes: 'Muelles de madera sobre el mar de nubes, en el borde oriental de la isla. Aquí atracan el «Albatros», un mercante y, disimulada entre la niebla, «La Urraca».',
      tags: ['#steampunk', '#dirigibles', 'puerto', 'piratas'],
    }),
    makeZone({
      id: A.albatros.zone,
      campaignId: CAMPAIGN_A_ID,
      name: 'El Dirigible «Albatros»',
      order: 3,
      gridPos: { x: 2, y: 0 },
      neighbors: { left: A.puerto.zone },
      zoneType: 'exterior',
      biome: 'Cielo',
      weather: 'none',
      lighting: 'dusk',
      levels: [cubierta, maquinas],
      defaultLevelId: A.albatros.level,
      musicSoundId: soundId('persecucion-en-las-nubes'),
      ambienceSoundId: soundId('viento-en-cubierta'),
      notes: 'Dos niveles unidos por la escotilla central: la Cubierta superior, bajo la sombra de la envoltura, y la Sala de máquinas, con calderas, pistones y la bodega de proa.',
      tags: ['#steampunk', '#dirigibles', 'niveles', 'abordaje'],
    }),
    makeZone({
      id: A.fabrica.zone,
      campaignId: CAMPAIGN_A_ID,
      name: 'Fábrica Abandonada',
      order: 4,
      gridPos: { x: 0, y: 1 },
      neighbors: { up: A.ciudad.zone },
      zoneType: 'dungeon',
      biome: 'Industrial',
      weather: 'fog',
      lighting: 'dark',
      levels: [fabrica],
      // Smoke and darkness: each hero sees a few cells around them and remembers what was explored.
      vision: { mode: 'explored', radius: 4, cone: 360 },
      // Sin música de zona: el Himno del dragón delataría al jefe oculto; el DM lo pone a mano al revelarlo.
      musicSoundId: null,
      ambienceSoundId: soundId('sala-de-maquinas'),
      notes: 'Las ruinas de la fábrica de guerra de la Guerra de las Calderas. Cintas transportadoras rotas, charcos tóxicos y, tras la niebla de la sala del horno, el Dragón de Latón.',
      tags: ['#steampunk', 'fábrica', 'jefe-final', 'mazmorra'],
    }),
  ];
}
